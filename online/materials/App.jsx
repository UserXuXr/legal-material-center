import React,{useEffect,useMemo,useRef,useState} from 'react';
import {domains,documentTemplates,imageTemplates} from './catalog.js';
import {exampleDocument,cleanDocument} from './documents.js';
import {exampleImage,cleanImage} from './images.js';
import {documentPages} from './pages.js';
import {imagePages} from './images.js';
import {originalFromFile,prepareOriginal,originalMimes} from './originals.js';
import {materialsRequest} from './render.js';
import {MaterialsStore} from './store.js';
import {IndexedDBStore} from '../shared/batch-store.js';
import {BatchRunner,digest,validateBatch} from '../shared/batch.js';
import {assignRevisions,renderMaterial,validateDocument} from '../shared/adapters.js';
import {PAIRINGS,setExportPairing} from '../shared/font-policy.js';
const label={documents:'文书',images:'图片',original:'原件'};
const defaultFormats={documents:['docx','pdf'],images:['png','pdf','docx']};
function fresh(engine,id){const model=engine==='documents'?exampleDocument(id):exampleImage(id);model.id=crypto.randomUUID();return {engine,model,formats:[...defaultFormats[engine]]};}
const initial=()=>{const item=fresh('documents','employment-contract');return {schema_version:'materials-workspace/1',id:crypto.randomUUID(),items:[item],active:item.model.id};};
function save(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function Preview({item}){
  const [original,setOriginal]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    let live=true,url;setOriginal(null);setError('');
    if(item.engine==='original')prepareOriginal(item.model).then(r=>{if(!live)return;url=URL.createObjectURL(r.blob);setOriginal({...r,url});}).catch(e=>live&&setError(e.message));
    return()=>{live=false;if(url)URL.revokeObjectURL(url);};
  },[item]);
  const rendered=useMemo(()=>{
    if(item.engine==='original')return {pages:[]};
    try{return {pages:item.engine==='documents'?documentPages(item.model):imagePages(item.model)};}catch(e){return {error:e.message,pages:[]};}
  },[item]);
  if(item.engine==='original')return <div className="original-preview">{error&&<p className="error">{error}</p>}{!original&&!error&&<p>正在核对原件…</p>}{original&&<>
    <div className="original-facts"><strong>{item.model.file.name}</strong><span>{(item.model.file.bytes/1024).toFixed(1)} KB · 原格式保留</span><code>SHA256 {item.model.file.sha256}</code><span>原件接收不修改内容。来源、脱敏状态按填写记录。</span></div>
    {['png','jpg','jpeg'].includes(item.model.file.format)?<img alt="导入原图预览" src={original.url}/>:item.model.file.format==='pdf'?<iframe title="原件 PDF 预览" src={original.url}/>:<>
      {item.model.file.format==='docx'&&<p className="muted">插入修订 {original.inspection.tracked_insertions} · 删除修订 {original.inspection.tracked_deletions} · {original.inspection.has_comments?'有批注':'无批注'} · 图片 {original.inspection.images}。以下仅为文字摘取预览；导出保留原文件和全部修订。</p>}
      <pre>{original.inspection.text||'没有可显示的文字，原文件仍被保留。'}</pre>
    </>}
  </>}</div>;
  return <>{rendered.error?<p className="error">{rendered.error}</p>:rendered.pages.map((p,i)=><figure className="page" key={i}><div dangerouslySetInnerHTML={{__html:p.svg}}/><figcaption>第 {i+1} / {rendered.pages.length} 页</figcaption></figure>)}</>;
}
function DiagramFields({model,onChange}){
  const [nodes,setNodes]=useState(''),[edges,setEdges]=useState('');
  useEffect(()=>{setNodes(model.data.nodes.map(n=>n.id+' | '+n.label).join('\n'));setEdges(model.data.edges.map(n=>n.from+' | '+n.to+' | '+n.label).join('\n'));},[model.id]);
  return <><p className="muted">节点按顺序排布。每行填写“编号 | 名称”；连线填写“起点 | 终点 | 说明”。</p><label>图示节点<textarea rows={8} value={nodes} onChange={e=>{setNodes(e.target.value);onChange({...model,data:{...model.data,nodes:e.target.value.split('\n').map(l=>{const [id,...rest]=l.split('|');return {id:id.trim(),label:rest.join('|').trim()};})}});}}/></label><label>图示连线<textarea rows={7} value={edges} onChange={e=>{setEdges(e.target.value);onChange({...model,data:{...model.data,edges:e.target.value?e.target.value.split('\n').map(l=>{const [from='',to='',...rest]=l.split('|');return {from:from.trim(),to:to.trim(),label:rest.join('|').trim()};}):[]}});}}/></label><label>图示说明<textarea value={model.data.note} onChange={e=>onChange({...model,data:{...model.data,note:e.target.value}})}/></label></>;
}
function ImageEditor({model,onChange}){
  const v=model.data,update=data=>onChange({...model,data:{...v,...data}}),field=(key,title,multiline=false)=><label key={key}>{title}{multiline?<textarea value={v[key]} onChange={e=>update({[key]:e.target.value})}/>:<input value={v[key]} onChange={e=>update({[key]:e.target.value})}/>}</label>;
  const listEdit=(key,fields,empty)=> <><div className="entry-list">{v[key].map((entry,i)=><section className="entry" key={i}><div className="entry-heading"><strong>{i+1}</strong><button disabled={v[key].length===1} onClick={()=>update({[key]:v[key].filter((_,j)=>j!==i)})}>移除</button></div>{fields.map(([name,title,type])=><label key={name}>{title}{type==='side'?<select value={entry[name]} onChange={e=>update({[key]:v[key].map((r,j)=>j===i?{...r,[name]:e.target.value}:r)})}><option value="left">左侧参与人</option><option value="right">右侧参与人</option></select>:type==='long'?<textarea value={entry[name]} onChange={e=>update({[key]:v[key].map((r,j)=>j===i?{...r,[name]:e.target.value}:r)})}/>:<input value={entry[name]} onChange={e=>update({[key]:v[key].map((r,j)=>j===i?{...r,[name]:e.target.value}:r)})}/>}</label>)}</section>)}</div><button onClick={()=>update({[key]:[...v[key],{...empty}]})}>新增{key==='messages'?'消息':key==='products'?'页面条目':'打卡记录'}</button></>;
  if(model.kind==='chat')return <>{field('left','左侧参与人')}{field('right','右侧参与人')}{listEdit('messages',[['side','方向','side'],['time','时间'],['body','消息正文','long']],{side:'left',time:'',body:''})}</>;
  if(model.kind==='webpage')return <>{field('url','页面地址')}{field('capturedAt','记载时间')}{field('seller','页面主体')}{listEdit('products',[['name','条目名称'],['price','价格原文'],['description','页面文字','long']],{name:'',price:'',description:''})}{field('disclosure','公示与其他信息',true)}</>;
  if(model.kind==='attendance')return <>{field('system','系统名称')}{field('person','人员名称')}{listEdit('events',[['date','日期'],['time','时间'],['action','打卡事项'],['place','地点'],['status','状态']],{date:'',time:'',action:'',place:'',status:''})}</>;
  return <DiagramFields model={model} onChange={onChange}/>;
}
export default function App(){
  const [draftStore]=useState(()=>new MaterialsStore()),[batchStore]=useState(()=>new IndexedDBStore()),[state,setState]=useState(null),[domain,setDomain]=useState('labor'),[mode,setMode]=useState('documents'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[query,setQuery]=useState(''),[libraryOpen,setLibraryOpen]=useState(false),[view,setView]=useState('edit'),[pairing,setPairing]=useState('song-times');
  useEffect(()=>{setExportPairing(pairing);try{localStorage.setItem('reference-export-pairing',pairing);}catch{}},[pairing]);
  const guard=useRef(false),inputFile=useRef(null),planFile=useRef(null);
  useEffect(()=>{let live=true;draftStore.get().then(saved=>{
    if(!live)return;
    if(saved&&(saved.schema_version!=='materials-workspace/1'||!Array.isArray(saved.items)||!saved.items.length))throw Error('已存草稿结构异常，未覆盖旧数据');
    setState(saved||initial());
  }).catch(e=>live&&setNotice(e.message));return()=>{live=false;};},[]);
  useEffect(()=>{if(!state)return;const timer=setTimeout(()=>draftStore.put(state).catch(e=>setNotice(e.message)),150);return()=>clearTimeout(timer);},[state]);
  const item=state?.items.find(x=>x.model.id===state.active)||state?.items[0],model=item?.model;
  const update=value=>setState(s=>({...s,items:s.items.map(x=>x.model.id===model.id?{...x,model:value}:x)}));
  async function perform(action){if(guard.current)return;guard.current=true;setBusy(true);setNotice('');try{await action();}catch(e){setNotice(e.message);}finally{guard.current=false;setBusy(false);}}
  function add(engine,id){setView('edit');setLibraryOpen(false);const next=fresh(engine,id);setState(s=>({...s,active:next.model.id,items:[next,...s.items]}));setNotice('已添加独立合成示例，请按本案材料修改。');}
  async function requestFor(i){const request=await materialsRequest(i.engine,i.model);request.documents[0].formats=i.formats;return request;}
  async function stage(request){await assignRevisions(request,await batchStore.get(request.batch_id));const runner=new BatchRunner({store:batchStore,render:renderMaterial,validate:validateDocument});await runner.stage(request);return runner;}
  async function produce(){
    const request=await requestFor(item),runner=await stage(request),result=await runner.run(request.batch_id);
    if(result.status!=='succeeded')throw Error(result.documents.find(d=>d.error)?.error.message||'制作未完成，请查看批次');
    const saved=await batchStore.get(request.batch_id),files=saved.documents.flatMap(d=>d.artifacts);
    if(files.length===1)save(files[0].blob,files[0].path.split('/').at(-1));else save((await runner.package(request.batch_id,'candidate')).blob,model.title+'_业务材料.zip');
    setNotice(`已保存${files.length}个文件并发起下载，可在批量制作中继续导出制作记录。`);
  }
  async function sendAll(){
    const requests=await Promise.all(state.items.map(requestFor));const request={schema_version:'material-batch/1',batch_id:'materials-'+(await digest(state.id)).slice(0,20),name:'文档与图片材料',documents:requests.flatMap(r=>r.documents)};
    await draftStore.put(state);await stage(request);location.assign(import.meta.env.BASE_URL+'batch/?batch='+encodeURIComponent(request.batch_id));
  }
  async function importOriginal(e){const files=[...e.target.files||[]];e.target.value='';if(!files.length)return;
    const items=[];for(const f of files){const m=await originalFromFile(f);items.push({engine:'original',model:m,formats:[m.file.format]});}
    setState(s=>({...s,active:items[0].model.id,items:[...items,...s.items]}));setView('edit');setLibraryOpen(false);setNotice(`已接收${items.length}份原件，保留原格式和字节，请填写来源及脱敏核对情况。`);
  }
  async function importPlan(e){const f=e.target.files?.[0];e.target.value='';if(!f)return;if(f.size>20*1024*1024)throw Error('方案最多20MB');const value=JSON.parse(await f.text());let items;
    if(value.schema_version==='materials-workspace/1'&&Array.isArray(value.items))items=value.items;
    else {const engine=value.schema_version==='legal-document/1'?'documents':value.schema_version==='legal-image/1'?'images':value.schema_version==='original-document/1'?'original':null;if(!engine)throw Error('请选择本模块导出的方案');items=[{engine,model:value,formats:engine==='original'?[value.file.format]:defaultFormats[engine]}];}
    if(!items.length||items.length>500)throw Error('方案需含1至500份材料');
    const ids=new Set();for(const i of items){if(i.engine==='documents')cleanDocument(i.model);else if(i.engine==='images')cleanImage(i.model);else if(i.engine==='original')await prepareOriginal(i.model);else throw Error('方案材料类型无效');if(ids.has(i.model.id))throw Error('方案含重复的文档编号');ids.add(i.model.id);const issues=validateBatch(await requestFor(i));if(issues.length)throw Error(issues.map(i=>i.message).join('；'));}
    setState(s=>({...s,active:items[0].model.id,items:[...items,...s.items.filter(x=>!items.some(i=>i.model.id===x.model.id))]}));setNotice('方案已导入。');
  }
  const template=item?.engine==='documents'?documentTemplates.find(t=>t.id===model.template_id):null;
  return <><header><a href={import.meta.env.BASE_URL}>← 素材中心</a><div><h1>文档与图片</h1><p>按业务门类选文书，制作图片材料，接收已有原件</p></div><div className="actions"><a href={import.meta.env.BASE_URL+'screenshots/'}>微信截图 ↗</a><a href={import.meta.env.BASE_URL+'scans/'}>扫描件模拟 ↗</a><a href={import.meta.env.BASE_URL+'reference-edit/'}>修订PDF ↗</a><button disabled={!state||busy} onClick={()=>planFile.current.click()}>导入方案</button><button disabled={!state||busy} onClick={()=>save(new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'}),'文档图片_方案.json')}>导出全部方案</button><button className="primary" disabled={!state||busy} onClick={()=>perform(sendAll)}>全部送入批量制作</button></div></header>
    <input ref={planFile} hidden type="file" accept=".json" onChange={e=>perform(()=>importPlan(e))}/><input ref={inputFile} hidden type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.txt,.md" onChange={e=>perform(()=>importOriginal(e))}/>
    {notice&&<div className="notice" role="status">{notice}</div>}
    {!state?<main className="loading"><p>{notice?'草稿未加载，请保留现有浏览器数据后重试。':'正在读取草稿…'}</p></main>:<div className={'studio mobile-'+view}><aside><button className="mobile-library-toggle" aria-expanded={libraryOpen} onClick={()=>setLibraryOpen(v=>!v)}>{libraryOpen?'收起模板选择':'选择文书、图片或导入原件'}</button><div className={libraryOpen?'library open':'library'}>
      <div className="tabs" role="group" aria-label="材料模式">{[['documents','文书'],['images','图片'],['original','原件']].map(([id,name])=><button disabled={busy} aria-pressed={mode===id} className={mode===id?'active':''} key={id} onClick={()=>setMode(id)}>{name}</button>)}</div>
      {mode==='documents'?<><label>法律业务门类<select value={domain} onChange={e=>setDomain(e.target.value)}>{domains.map(d=><option value={d.id} key={d.id}>{d.title}</option>)}</select></label><label>搜索模板<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="合同、备忘录、提单…"/></label><div className="template-list">{documentTemplates.filter(t=>(query?t.title.toLowerCase().includes(query.toLowerCase()):t.common||t.domain===domain)).map(t=><button disabled={busy} key={t.id} onClick={()=>add('documents',t.id)}>{t.title}<small>{t.common?'通用法律研究文书':query?domains.find(d=>d.id===t.domain)?.title:'添加文书示例'}</small></button>)}</div></>:mode==='images'?<><p className="aside-note">选择一种合成图片。实际截图与扫描件请在原件中接收。</p><a href={import.meta.env.BASE_URL+'screenshots/'}>微信截图：群聊、转账与消息标注 ↗</a><div className="template-list">{imageTemplates.map(t=><button disabled={busy} key={t.id} onClick={()=>add('images',t.id)}>{t.title}<small>添加图片示例</small></button>)}</div></>:<><p className="aside-note">接收PDF、DOCX、PNG、JPEG、TXT、MD。每份最多12MB，按原格式交付；带修订的Word保留全部修订。</p><button className="primary" disabled={busy} onClick={()=>inputFile.current.click()}>选择原件文件</button></>}
      </div><h2 className="aside-title">本次材料 <span>{state.items.length}</span></h2><div className="draft-list">{state.items.map(i=><button disabled={busy} className={i.model.id===model.id?'active':''} key={i.model.id} onClick={()=>setState(s=>({...s,active:i.model.id}))}><small>{label[i.engine]}</small>{i.model.title}</button>)}</div><p className="aside-note">草稿保存在当前浏览器，可导出方案备份。</p>
    </aside><nav className="mobile-view" aria-label="编辑与预览"><button className={view==='edit'?'active':''} onClick={()=>setView('edit')}>编辑材料</button><button className={view==='preview'?'active':''} onClick={()=>setView('preview')}>查看预览</button></nav><main className="editor"><div className="editor-top"><span className="eyebrow">{label[item.engine]} · {template?.common?'通用法律研究':template?domains.find(d=>d.id===template.domain)?.title:'独立材料'}</span><button className="quiet" disabled={busy||state.items.length===1} onClick={()=>setState(s=>{const items=s.items.filter(i=>i.model.id!==model.id);return {...s,items,active:items[0].model.id};})}>移除本份</button></div>
      <fieldset disabled={busy}><label>文件标题<input value={model.title} onChange={e=>update({...model,title:e.target.value})}/></label>
      {item.engine==='documents'?<><p className="muted">按原材料填写字段与正文；未载信息可留空。证件、许可及鉴定类为资料记载模板，结果由输入原文确定。</p><div className="field-grid">{template.fields.map(f=><label key={f.key}>{f.label}<input value={model.fields[f.key]} onChange={e=>update({...model,fields:{...model.fields,[f.key]:e.target.value}})}/></label>)}</div><h2>正文</h2>{model.sections.map((s,i)=><section className="section-editor" key={i}><div className="section-heading"><label>章节标题<input value={s.heading} onChange={e=>update({...model,sections:model.sections.map((v,j)=>i===j?{...v,heading:e.target.value}:v)})}/></label><button disabled={model.sections.length===1} onClick={()=>update({...model,sections:model.sections.filter((_,j)=>i!==j)})}>移除</button></div><label>正文<textarea value={s.body} onChange={e=>update({...model,sections:model.sections.map((v,j)=>i===j?{...v,body:e.target.value}:v)})}/></label></section>)}<button onClick={()=>update({...model,sections:[...model.sections,{heading:'新增章节',body:''}]})}>新增章节</button></>:item.engine==='images'?<ImageEditor model={model} onChange={update}/>:<>
        <p className="muted">原文件内容不会被改写。此处填写接收记录；脱敏核对状态由你声明，工作台不自动核实。</p>
        <label>来源类型<select value={model.source.kind} onChange={e=>update({...model,source:{...model.source,kind:e.target.value}})}><option value="unknown">来源尚未确认</option><option value="expert">专家提供</option><option value="client">业务方提供</option><option value="public">公开材料</option></select></label>
        <label>来源记载<input value={model.source.label} onChange={e=>update({...model,source:{...model.source,label:e.target.value}})} placeholder="提供者、来源地址或档案编号"/></label>
        <label>脱敏核对状态<select value={model.source.redaction} onChange={e=>update({...model,source:{...model.source,redaction:e.target.value}})}><option value="not_checked">尚未核对</option><option value="user_declared">提供者声明已脱敏</option><option value="reviewed">我已另行核对</option></select></label>
        <label>接收与核对备注<textarea value={model.source.notes} onChange={e=>update({...model,source:{...model.source,notes:e.target.value}})}/></label>
      </>}
      <section className="export-panel"><h2>本份输出</h2><label>导出前的中西文配对<select aria-label="中西文配对" value={pairing} onChange={e=>setPairing(e.target.value)}>{PAIRINGS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><p className="muted">同一份里的中文用同一款，西文用同一款。缺字会停止，不会生成缺字文件。扫描件不能靠这里改字体。</p><div className="format-options">{(item.engine==='original'?[model.file.format]:item.engine==='documents'?['docx','pdf','png','svg']:['png','pdf','svg','docx']).map(f=><label key={f}><input type="checkbox" checked={item.formats.includes(f)} disabled={item.engine==='original'} onChange={e=>setState(s=>({...s,items:s.items.map(i=>i.model.id===model.id?{...i,formats:e.target.checked?[...i.formats,f]:i.formats.filter(v=>v!==f)}:i)}))}/>{f.toUpperCase()}{item.engine==='images'&&f==='docx'?' 转录':''}</label>)}</div><button className="primary" disabled={!item.formats.length} onClick={()=>perform(produce)}>{busy?'正在保存与制作…':item.engine==='original'?'保存并下载原件':'制作并下载本份'}</button><p className="muted">多个文件打包下载，制作记录可从批量制作入口导出。</p></section></fieldset>
    </main><section className="preview-panel" aria-label="文件预览"><div className="preview-heading"><h2>{item.engine==='original'?'原件预览':'排版预览'}</h2><span>{item.engine==='original'?'原字节保留':'合成案例材料'}</span></div><Preview item={item}/></section></div>}
  </>;
}
