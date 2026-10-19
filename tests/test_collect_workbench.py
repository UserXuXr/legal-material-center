import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('collector', Path(__file__).parents[1]/'tools/collect_workbench.py')
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class CollectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.business = self.root/'business.zip'
        self.authoring = self.root/'authoring.zip'
        self.output = self.root/'output'
        self.data = '日期,金额\n2026-09-01,100.00\n'.encode()
        self.item = {'artifact_id':'A001','document_id':'D001','business_document':True,'producer':'finance',
                     'format':'csv','sha256':collector.sha(self.data),'bytes':len(self.data),'path':'Reference/银行流水.csv',
                     'origin':'http://127.0.0.1:3016'}
        self.write_packages()

    def tearDown(self):
        self.temp.cleanup()

    def write_packages(self, extra=None):
        with zipfile.ZipFile(self.business,'w') as z:
            z.writestr(self.item['path'],self.data)
            if extra: z.writestr(extra,b'private')
        report = {'batch_id':'test','status':'succeeded','documents':[{'document_id':'D001','status':'succeeded','engine':'finance',
                  'input_digest':'real-input-digest','artifacts':[self.item]}]}
        mapping = {'schema_version':'material-batch/1','batch_id':'test','artifacts':[self.item]}
        with zipfile.ZipFile(self.authoring,'w') as z:
            z.writestr('制作记录.json',json.dumps(report))
            z.writestr('文件映射.json',json.dumps(mapping))

    def test_actual_hash_origin_and_idempotent_recovery(self):
        result = collector.collect(self.business,self.authoring,self.output,'http://127.0.0.1:3016')
        self.assertEqual(result['status'],'RECOVERED')
        self.assertEqual(result['business_documents'],1)
        self.assertEqual((self.output/'candidate/银行流水.csv').read_bytes(),self.data)
        self.assertEqual((self.output/'raw/银行流水.csv').read_bytes(),self.data)
        collector.collect(self.business,self.authoring,self.output,'http://127.0.0.1:3016')
        self.assertEqual(result['inspection'],'NOT_PERFORMED')

    def test_wrong_hash_and_origin_do_not_write_candidate(self):
        self.item['sha256']='0'*64
        self.write_packages()
        with self.assertRaisesRegex(ValueError,'SHA256'):
            collector.collect(self.business,self.authoring,self.output)
        self.assertFalse((self.output/'candidate').exists())
        self.item['sha256']=collector.sha(self.data)
        self.write_packages()
        with self.assertRaisesRegex(ValueError,'origin'):
            collector.collect(self.business,self.authoring,self.output,'https://www.defiuris.com')

    def test_zip_path_and_whitelist_rejected(self):
        self.write_packages('../outside.txt')
        with self.assertRaisesRegex(ValueError,'不安全'):
            collector.collect(self.business,self.authoring,self.output)
        self.write_packages('Reference/未声明.csv')
        with self.assertRaisesRegex(ValueError,'未声明'):
            collector.collect(self.business,self.authoring,self.output)

    def test_preserve_existing_version(self):
        (self.output/'candidate').mkdir(parents=True)
        (self.output/'candidate/银行流水.csv').write_bytes(b'old-version')
        with self.assertRaisesRegex(ValueError,'不覆盖'):
            collector.collect(self.business,self.authoring,self.output)
        self.assertEqual((self.output/'candidate/银行流水.csv').read_bytes(),b'old-version')

    def test_manifest_conflict_is_checked_before_writing(self):
        self.output.mkdir()
        (self.output/'workbench_delivery_manifest.json').write_text('{"batch_id":"other"}')
        with self.assertRaisesRegex(ValueError,'不同回收清单'):
            collector.collect(self.business,self.authoring,self.output)
        self.assertFalse((self.output/'candidate').exists())

    def test_symlink_output_is_rejected(self):
        actual = self.root/'actual'
        actual.mkdir()
        self.output.symlink_to(actual, target_is_directory=True)
        with self.assertRaisesRegex(ValueError,'符号链接'):
            collector.collect(self.business,self.authoring,self.output)
        self.assertFalse((actual/'candidate').exists())


if __name__ == '__main__':
    unittest.main()
