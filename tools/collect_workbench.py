#!/usr/bin/env python3
"""Recover real workbench downloads; never manufacture Reference QC or approval."""
import argparse
import hashlib
import json
import re
import stat
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from xml.etree import ElementTree as ET


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_archive(archive):
    infos = archive.infolist()
    if len(infos) > 10000 or sum(i.file_size for i in infos) > 500 * 1024 * 1024:
        raise ValueError('下载包超过安全解包上限')
    names = set()
    for info in infos:
        p = PurePosixPath(info.filename)
        if (p.is_absolute() or '..' in p.parts or '\\' in info.filename
                or re.match(r'^[A-Za-z]:', info.filename)
                or stat.S_ISLNK(info.external_attr >> 16)
                or info.filename in names or info.flag_bits & 1):
            raise ValueError('ZIP含不安全路径、重复文件、符号链接或加密条目')
        if info.file_size > 100 * 1024 * 1024:
            raise ValueError('单文件超过100MB')
        names.add(info.filename)


def inspect_office(data):
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as office:
        safe_archive(office)
        for name in office.namelist():
            if 'vbaproject' in name.lower() or name.lower().endswith('.bin'):
                raise ValueError('Office文件含宏或嵌入二进制对象')
            if name.endswith('.rels'):
                root = ET.fromstring(office.read(name))
                if any(item.attrib.get('TargetMode') == 'External' for item in root):
                    raise ValueError('Office文件含外部链接，请先按Reference政策处理')


def write_preserving(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.is_symlink() or path.read_bytes() != data:
            raise ValueError(f'目标已存在且内容不同，不覆盖：{path}')
        return
    # Exclusive creation protects existing files and previous Reference versions.
    with path.open('xb') as f:
        f.write(data)


def collect(business_package, authoring_package, output, expected_origin=None):
    requested_output = Path(output).absolute()
    if requested_output.is_symlink():
        raise ValueError('输出目录不可为符号链接')
    # Canonicalize parent aliases such as macOS /var -> /private/var. All
    # subsequent writes are confined to this resolved root, with links rejected.
    output = requested_output.resolve()
    with zipfile.ZipFile(business_package) as business, zipfile.ZipFile(authoring_package) as authoring:
        safe_archive(business)
        safe_archive(authoring)
        mapping = json.loads(authoring.read('文件映射.json'))
        report = json.loads(authoring.read('制作记录.json'))
        if mapping.get('schema_version') != 'material-batch/1' or mapping.get('batch_id') != report.get('batch_id'):
            raise ValueError('业务映射与制作记录不匹配')
        files = mapping.get('artifacts', [])
        if not files:
            raise ValueError('没有实际完成文件')
        document_report = {d['document_id']: d for d in report['documents']}
        expected_paths, artifact_ids = set(), set()
        artifacts = []
        # Complete every check before writing any candidate files.
        for item in files:
            relative = PurePosixPath(item['path'])
            if (len(relative.parts) != 2 or relative.parts[0] != 'Reference'
                    or item['path'] in expected_paths or item['artifact_id'] in artifact_ids
                    or relative.suffix.lower() != '.' + item['format']
                    or item['format'] not in ('pdf','docx','xlsx','csv','png','svg')):
                raise ValueError('文件映射路径、格式或编号无效')
            doc = document_report.get(item['document_id'])
            if not doc or doc.get('status') != 'succeeded':
                raise ValueError('映射引用未完成文档')
            recorded = next((a for a in doc['artifacts'] if a['artifact_id'] == item['artifact_id']), None)
            if (not recorded or recorded['sha256'] != item['sha256'] or recorded['bytes'] != item['bytes']
                    or item.get('producer') != doc['engine'] or item.get('business_document') is not True
                    or item.get('origin') != recorded.get('origin')):
                raise ValueError('制作记录与文件映射冲突')
            if expected_origin and item.get('origin') != expected_origin:
                raise ValueError('实际制件origin与任务允许的工作台不符')
            data = business.read(item['path'])
            if len(data) != item['bytes'] or sha(data) != item['sha256']:
                raise ValueError('实际下载文件大小或SHA256不匹配')
            if item['format'] in ('docx','xlsx'):
                inspect_office(data)
            raw_path = output / 'raw' / relative.name
            candidate_path = output / 'candidate' / relative.name
            for target in (raw_path, candidate_path):
                if any(p.is_symlink() for p in (target, *target.parents)):
                    raise ValueError('输出路径包含符号链接')
                if target.exists() and target.read_bytes() != data:
                    raise ValueError(f'保留原文件，不覆盖不同内容：{target}')
            artifacts.append({**item, 'raw_path': str(raw_path), 'path': str(candidate_path),
                              'download_recovered': True, 'download_sha256': sha(data),
                              'input_digest': doc['input_digest'],
                              'template_id': recorded.get('template_id'),
                              'template_version': recorded.get('template_version'),
                              'text_layer': recorded.get('text_layer'),
                              'text_scope': recorded.get('text_scope'),
                              'transformation': 'identity'})
            expected_paths.add(item['path'])
            artifact_ids.add(item['artifact_id'])
        actual_paths = {i.filename for i in business.infolist() if not i.is_dir()}
        if actual_paths != expected_paths:
            raise ValueError('业务包有未声明文件或缺文件；只接受白名单业务文件')
        packages = []
        for kind, path in [('business',business_package),('authoring',authoring_package)]:
            path = Path(path)
            packages.append({'kind':kind,'path':str(path.resolve()),'sha256':sha(path.read_bytes()),'bytes':path.stat().st_size})
        manifest = {'schema_version':'reference-workbench-import/1',
                    'status':'RECOVERED' if report['status']=='succeeded' else 'PARTIAL_RECOVERED',
                    'batch_id':mapping['batch_id'],'download_recovered':True,
                    'collected_at':datetime.now(timezone.utc).isoformat(),
                    'packages':packages,'artifacts':artifacts,
                    'business_documents':len({a['document_id'] for a in artifacts}),
                    'inspection':'NOT_PERFORMED',
                    'note':'实际下载回收记录，不是Reference QC、完整bundle或专家批准。'}
        target = output / 'workbench_delivery_manifest.json'
        if target.exists():
            old = json.loads(target.read_text())
            old.pop('collected_at', None)
            comparable = {k:v for k,v in manifest.items() if k!='collected_at'}
            if old != comparable:
                raise ValueError('已有不同回收清单，请使用新的输出目录')
        writes = []
        for item in artifacts:
            data = business.read(next(m['path'] for m in files if m['artifact_id']==item['artifact_id']))
            writes.extend([(Path(item['raw_path']), data), (Path(item['path']), data)])
        observed = 'observed_financial_ledgers.json'
        if observed in authoring.namelist():
            writes.append((output / 'workbench_observed_financial_ledgers.json', authoring.read(observed)))
        if not target.exists():
            writes.append((target, (json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()))
        for path, data in writes:
            if any(p.is_symlink() for p in (path, *path.parents)):
                raise ValueError('输出路径包含符号链接')
            if path.exists() and path.read_bytes() != data:
                raise ValueError(f'目标已存在且内容不同，不覆盖：{path}')
        for path, data in writes:
            write_preserving(path, data)
        return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--business-package', required=True, type=Path)
    parser.add_argument('--authoring-package', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--expected-origin', help='生产时传入任务政策允许的工作台origin；本地验收可传本机origin')
    args = parser.parse_args()
    try:
        result = collect(args.business_package,args.authoring_package,args.output,args.expected_origin)
    except Exception as error:
        parser.exit(1, f'回收失败：{error}\n')
    print(json.dumps({'status':result['status'],'download_recovered':True,'files':len(result['artifacts']),
                      'business_documents':result['business_documents'],
                      'manifest':str(args.output/'workbench_delivery_manifest.json')},ensure_ascii=False))


if __name__ == '__main__':
    main()
