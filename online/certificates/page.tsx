import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Download,Upload,Save,Copy,FileText,Image as ImageIcon,Package,ArrowLeft,Maximize2} from 'lucide-react';
import {NativeSelect,NativeSelectOption} from '../modules/rights/components/ui/native-select';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../modules/rights/components/ui/dialog';
import {templates,metrics,backgroundFor,type Project} from './lib/templates';
import {cleanProject} from './model.js';
import {matchTemplate} from './template-match.js';
import {renderCertificate} from './lib/documents.js';
import {readSaved,readDrafts,writeDrafts,saveScheme,copy} from './lib/storage.js';
import {saveProject,exportCertificate,download,safeName} from './lib/export.js';
const fresh=(id:string)=>copy(templates.find(t=>t.id===id)!.example) as Project;
const parse=(p:unknown)=>cleanProject(p,templates) as Project;
const errorText=(e:unknown)=>e instanceof Error?e.message:'操作未完成，请重试';
const scopes:Record<string,string>={'CN-SH':'上海','CN-JS':'江苏','CN-GS':'甘肃','CN-MOHURD':'住房和城乡建设部'};
const families=templates.filter((t,i,a)=>a.findIndex(x=>x.kind===t.kind)===i);
function initial(){
  let drafts:Record<string,Project>={},saved:Project[]=[],note='',active='';
  try{const r=readDrafts(localStorage,templates);drafts=r.drafts as Record<string,Project>;active=r.active;}catch{note='草稿暂时无法读取；可以导入已导出的填写方案。'}
  try{saved=readSaved(localStorage,templates) as Project[];}catch{note='已保存方案暂时无法读取；编辑与文件导出仍可使用。'}
  return {drafts,saved,note,project:drafts[active]||fresh(templates[0].id)};
}
export default function Page(){
  const [start]=useState(initial),[project,setProject]=useState<Project>(start.project),[saved,setSaved]=useState<Project[]>(start.saved);
  const drafts=useRef<Record<string,Project>>(start.drafts),file=useRef<HTMLInputElement>(null),busyRef=useRef(false),projectRef=useRef(project);
  projectRef.current=project;
  const [notice,setNotice]=useState(start.note),[storageNote,setStorageNote]=useState('草稿保存在此浏览器'),[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState(''),[exportOpen,setExportOpen]=useState(false),[full,setFull]=useState(false);
  const current=templates.find(t=>t.id===project.template_id)!,match=matchTemplate(templates,project);
  const rendered=useMemo(()=>{try{const found=matchTemplate(templates,project);if(found.status!=='matched')throw Error(found.message);return {page:renderCertificate(project,templates,metrics,backgroundFor(found.template.id)),error:''};}catch(e){return {page:null,error:errorText(e)}}},[project]);
  useEffect(()=>{
    const found=matchTemplate(templates,project);
    if(found.status==='matched'&&found.template.id!==project.template_id){setProject(p=>({...p,template_id:found.template.id}));return;}
    drafts.current[project.template_id]=copy(project);
    const timer=setTimeout(()=>{try{writeDrafts(localStorage,project,drafts.current);setStorageNote('草稿已暂存此浏览器')}catch{setStorageNote('草稿未能暂存，请导出填写方案')}},250);
    return()=>clearTimeout(timer);
  },[project]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6500);return()=>clearTimeout(timer)},[notice]);
  function edit(patch:Partial<Project>){setProject(p=>({...p,...patch}));setError('')}
  function field(key:string,value:string){setProject(p=>({...p,values:{...p.values,[key]:value}}));setError('')}
  function switchTo(id:string){drafts.current[project.template_id]=copy(project);setProject(copy(drafts.current[id]||fresh(id)));setError('')}
  function save(asCopy=false){try{const next=copy(project) as Project;if(asCopy){delete next.id;next.name=next.name.slice(0,94)+' · 副本'}const r=saveScheme(localStorage,next,templates);setProject(r.project as Project);setSaved(r.items as Project[]);setNotice(asCopy?'已另存为新方案':'填写方案已保存');setError('')}catch(e){setError(errorText(e))}}
  async function output(format:string){
    if(busyRef.current||!rendered.page)return;
    busyRef.current=true;setBusy(true);setError('');setProgress('正在准备素材');
    try{const page=rendered.page,blob=await exportCertificate(page,format,{onProgress:setProgress});download(blob,safeName(page.project.name)+'.'+format);setNotice('文件已生成，已交给浏览器下载');setExportOpen(false)}catch(e){setError(errorText(e))}finally{busyRef.current=false;setBusy(false);setProgress('')}
  }
  async function importFile(event:React.ChangeEvent<HTMLInputElement>){
    const input=event.target.files?.[0];event.target.value='';if(!input)return;
    try{if(input.size>131072)throw Error('填写方案应小于128 KB');let value;try{value=JSON.parse(await input.text())}catch{throw Error('请选择工作台导出的 JSON 填写方案')};const next=parse(value);delete next.id;setProject(next);setError('');setNotice('方案已导入，可以继续编辑')}catch(e){setError(errorText(e))}
  }
  useEffect(()=>{
    const context=(document as any).modelContext;if(!context?.registerTool)return;
    const abort=new AbortController(),empty={type:'object',properties:{},additionalProperties:false};
    const guard=()=>{if(busyRef.current)throw Error('正在导出，请稍后再编辑')};
    const actions=[
      {name:'read_certificate_editor',title:'查看证照填写信息',description:'Read the current browser editor and available certificate fields.',inputSchema:empty,annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({project:copy(projectRef.current),templates:templates.map(({id,title,fields})=>({id,title,fields}))})},
      {name:'stage_certificate_fields',title:'调整证照填写信息',description:'Stage fields in the browser editor without exporting files.',inputSchema:{type:'object',properties:{template_id:{type:'string',enum:templates.map(t=>t.id)},values:{type:'object',additionalProperties:{type:'string'}},name:{type:'string',maxLength:100}},required:['template_id','values'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:(input:any)=>{guard();const previous=projectRef.current;const candidate=copy(input.template_id===previous.template_id?previous:fresh(input.template_id));candidate.values={...candidate.values,...input.values};if(input.name!==undefined)candidate.name=input.name;const next=parse(candidate);projectRef.current=next;setProject(next);return {status:'staged',project:next}}},
      {name:'save_certificate_scheme',title:'保存当前填写方案',description:'Save the current scheme in this browser.',inputSchema:empty,annotations:{readOnlyHint:false,untrustedContentHint:true},execute:()=>{guard();const r=saveScheme(localStorage,projectRef.current,templates);setProject(r.project as Project);setSaved(r.items as Project[]);return {status:'saved',id:r.project.id}}},
      {name:'generate_and_save_certificate',title:'下载证照素材包',description:'Generate and download the current certificate bundle in the browser.',inputSchema:empty,annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async()=>{guard();const p=projectRef.current,m=matchTemplate(templates,p);if(m.status!=='matched')throw Error(m.message);busyRef.current=true;setBusy(true);try{const page=renderCertificate(p,templates,metrics,backgroundFor(m.template.id));const blob=await exportCertificate(page,'zip',{onProgress:setProgress});download(blob,safeName(p.name)+'.zip');return {status:'downloaded',warnings:page.warnings}}finally{busyRef.current=false;setBusy(false);setProgress('')}}}
    ];
    try{for(const tool of actions)Promise.resolve(context.registerTool(tool,{signal:abort.signal})).catch(()=>abort.abort())}catch{abort.abort()}
    return()=>abort.abort();
  },[]);
  const groups=Array.from(new Set(current.fields.filter(f=>f.key!=='certificate.issued_on').map(f=>f.group)));
  return <div className="cert-studio">
    <header className="cert-header"><div className="cert-brand"><a href={import.meta.env.BASE_URL} aria-label="返回素材中心"><ArrowLeft size={18}/><span>素材中心</span></a><span className="cert-divider"/><div><h1>企业证照工作台</h1><p>填写信息 · 实时预览 · 下载素材</p></div></div><div className="cert-actions"><span className="cert-storage">{storageNote}</span><button onClick={()=>file.current?.click()} disabled={busy}><Upload size={16}/>导入方案</button><button onClick={()=>saveProject(project)} disabled={busy}><Download size={16}/>导出方案</button><button className="cert-primary" onClick={()=>setExportOpen(true)} disabled={!rendered.page||busy}><Download size={16}/>导出素材</button><input ref={file} type="file" accept=".json,application/json" onChange={importFile} hidden/></div></header>
    {notice&&<div className="cert-toast" role="status">{notice}</div>}
    <div className="cert-layout"><aside className="cert-sidebar"><h2>证照类型</h2><nav aria-label="证照类型">{families.map(t=><button key={t.kind} className={current.kind===t.kind?'cert-active':''} disabled={busy} onClick={()=>switchTo(templates.find(x=>x.kind===t.kind&&drafts.current[x.id])?.id||t.id)}><FileText size={18}/><span>{t.title}<small>{t.kind==='business_license'?'2019 / 2022 公司法人副本':t.kind==='construction_qualification'?'电子证书与地区参考版':templates.filter(x=>x.kind===t.kind).length+' 种版式'}</small></span></button>)}</nav><div className="cert-saved-heading"><h2>已保存方案</h2><button disabled={busy} onClick={()=>{try{setSaved(readSaved(localStorage,templates) as Project[]);setNotice('已刷新方案')}catch(e){setError(errorText(e))}}}>刷新</button></div><div className="cert-saved">{saved.length?saved.map(s=><button key={s.id} disabled={busy} onClick={()=>{try{setProject(parse(s));setError('')}catch(e){setError(errorText(e))}}}><b>{s.name}</b><small>{templates.find(t=>t.id===s.template_id)?.title}{s.updated_at?' · '+new Date(s.updated_at).toLocaleDateString('zh-CN'):''}</small></button>):<p>保存后的填写方案会出现在这里。</p>}</div><p className="cert-sidebar-note">方案保存在当前浏览器。重要内容请导出备份。</p></aside>
    <section className="cert-editor" aria-label="证照填写信息"><div className="cert-section-heading"><div><h2>{current.title}</h2><p>{current.subtitle}</p></div><button disabled={busy} onClick={()=>{setProject(fresh(current.id));setError('')}}>填入示例</button></div><fieldset disabled={busy}><label>方案名称<input value={project.name} maxLength={100} onChange={e=>edit({name:e.target.value})}/></label>
    {current.kind!=='business_license'&&<label>证书样式<NativeSelect value={current.id} onChange={e=>switchTo(e.target.value)}>{templates.filter(t=>t.kind===current.kind).map(t=><NativeSelectOption key={t.id} value={t.id}>{t.subtitle}</NativeSelectOption>)}</NativeSelect></label>}
    <div className="cert-edition"><label>票面发证日期<input type="date" value={project.values['certificate.issued_on']||''} onChange={e=>field('certificate.issued_on',e.target.value)}/></label><p className={match.status==='matched'?'':'cert-warning'}>{match.status==='matched'?'当前版式：'+match.template.subtitle:match.message}</p><small>按票面签发或换发日期选版，不按企业成立日期选版。</small></div>
    {groups.map(group=><div className="cert-field-group" key={group}><h3>{group}</h3>{current.fields.filter(f=>f.group===group&&f.key!=='certificate.issued_on').map(f=><label key={f.key}>{f.label}{f.type==='textarea'?<textarea rows={f.key.includes('scope')?4:2} maxLength={5000} value={project.values[f.key]||''} onChange={e=>field(f.key,e.target.value)}/>:<input type={f.type} maxLength={5000} value={project.values[f.key]||''} onChange={e=>field(f.key,e.target.value)}/>}</label>)}</div>)}
    <details className="cert-options" open><summary>来源与输出设置</summary><label className="cert-check"><input type="checkbox" checked={!!project.preserveMissing} onChange={e=>edit({preserveMissing:e.target.checked})}/>原资料未载明的字段留空</label>{project.preserveMissing&&<label>版式参考日期<input type="date" value={project.templateDate||''} onChange={e=>edit({templateDate:e.target.value})}/><small>发证日期缺失时用于选版，不打印成发证日期。</small></label>}<label>发证范围<NativeSelect value={project.issuer_scope} onChange={e=>edit({issuer_scope:e.target.value})}>{current.issuer_scopes.map(s=><NativeSelectOption key={s} value={s}>{scopes[s]||s}</NativeSelectOption>)}</NativeSelect></label><label>事实基准日期<input type="date" value={project.as_of} onChange={e=>edit({as_of:e.target.value})}/><small>用于提示是否过期，不改变票面日期。</small></label><label>PDF 类型<NativeSelect value={project.capture} onChange={e=>edit({capture:e.target.value as Project['capture']})}><NativeSelectOption value="raster_200dpi">图像 PDF（与预览一致）</NativeSelectOption><NativeSelectOption value="native">可检索字段 PDF</NativeSelectOption></NativeSelect></label><small>可检索 PDF 的填写内容为文本，固定底纹和标题为图片。</small></details></fieldset>
    <div className="cert-editor-footer"><button onClick={()=>save()} disabled={busy}><Save size={16}/>保存方案</button><button onClick={()=>save(true)} disabled={busy}><Copy size={16}/>另存副本</button></div></section>
    <section className="cert-preview" aria-label="证照预览"><div className="cert-preview-heading"><div><h2>文书预览</h2><p>{current.paper} · 合成测试素材</p></div><button aria-label="放大预览" onClick={()=>setFull(true)} disabled={!rendered.page}><Maximize2 size={17}/></button></div><div className="cert-preview-status" role="status">{rendered.page?'已按当前填写内容更新':'请完成以下信息'}</div><div className={'cert-paper-stage '+(current.page_mm[0]>current.page_mm[1]?'cert-landscape':'')}>{rendered.page?<div className="cert-paper" dangerouslySetInnerHTML={{__html:rendered.page.svg}}/>:<div className="cert-empty"><FileText size={36}/><h3>填写后显示预览</h3><p>{rendered.error}</p></div>}</div>
    {error&&<div className="cert-error" role="alert">{error}<button onClick={()=>setError('')}>关闭提示</button></div>}
    {!!rendered.page?.warnings.length&&<div className="cert-warnings">{rendered.page.warnings.map((w:string)=><p key={w}>{w}</p>)}</div>}
    <div className="cert-download-bar"><span>{busy?progress:'PDF、图片和 SVG 均可直接下载'}</span><button className="cert-primary" disabled={!rendered.page||busy} onClick={()=>output('pdf')}><Download size={16}/>{busy?'正在导出':'下载 PDF'}</button></div><details className="cert-template-note"><summary>模板说明</summary><p>{current.scope_note}</p><p>所有材料保留合成样本标识。</p></details></section></div>
    <Dialog open={exportOpen} onOpenChange={v=>{if(!busy)setExportOpen(v)}}><DialogContent className="cert-dialog"><DialogTitle>导出证照素材</DialogTitle><DialogDescription>导出当前填写内容；完整包同时包含填写方案。</DialogDescription><div className="cert-export-grid">{([['pdf','PDF',project.capture==='native'?'可检索填写字段':'200 DPI 图像版',FileText],['png','PNG 图片','200 DPI · 当前证照',ImageIcon],['svg','SVG 文书','保留可缩放文字',FileText],['zip','完整素材包','PDF / PNG / SVG / 填写方案',Package]] as const).map(([format,name,hint,Icon])=><button key={format} disabled={busy||!rendered.page} onClick={()=>output(format)}><Icon size={24}/><b>{name}</b><small>{hint}</small></button>)}</div>{busy&&<p role="status">{progress}</p>}{error&&<p className="cert-error" role="alert">{error}</p>}</DialogContent></Dialog>
    <Dialog open={full} onOpenChange={setFull}><DialogContent className="cert-dialog cert-full"><DialogTitle>{current.title}</DialogTitle><DialogDescription>当前字段生成的文书预览</DialogDescription>{rendered.page&&<div dangerouslySetInnerHTML={{__html:rendered.page.svg}}/>}</DialogContent></Dialog>
  </div>;
}
