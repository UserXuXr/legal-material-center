// @refresh reset
import React,{useEffect,useRef,useState} from 'react';
import {BatchRunner,publicBatch} from '../shared/batch.js';
import {IndexedDBStore} from '../shared/batch-store.js';
import {assignRevisions,demoRequest,editorRequest,renderMaterial,requestFromBatch,validateDocument,validateRequest} from '../shared/adapters.js';
import {registerAgentTools} from '../shared/agent-tools.js';
const labels={queued:'待制作',running:'制作中',succeeded:'已完成',failed:'失败',partial:'部分完成'};
const engines={business:'业务文书',finance:'财务',rights:'权属',contracts:'合同',certificates:'证照'};
const json=value=>JSON.stringify(value,null,2);
function download(blob,name) {
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export default function App(){
  const [store]=useState(()=>new IndexedDBStore()),[current,setCurrent]=useState(null),[saved,setSaved]=useState([]),[source,setSource]=useState(''),[notice,setNotice]=useState(''),[issues,setIssues]=useState([]),[busy,setBusy]=useState(false),[agent,setAgent]=useState(false),[selected,setSelected]=useState(''),[editText,setEditText]=useState('');
  const [runner]=useState(()=>new BatchRunner({store,render:renderMaterial,validate:validateDocument,onChange:setCurrent}));
  const guard=useRef(false),file=useRef(null),currentRef=useRef(current);currentRef.current=current;
  async function refresh(){setSaved(await store.list());}
  async function perform(action){
    if(guard.current)throw Error('当前正在处理，请稍后重试');
    guard.current=true;setBusy(true);setNotice('');
    try{return await action();}catch(error){setNotice(error.message);throw error;}finally{guard.current=false;setBusy(false);refresh().catch(error=>setNotice(error.message));}
  }
  const click=action=>()=>{perform(action).catch(()=>{});};
  async function open(id){const batch=await store.get(id);if(!batch)throw Error('找不到保存的批次');setCurrent(publicBatch(batch));setSource(json(requestFromBatch(batch)));setIssues([]);setSelected('');}
  async function stage(request,autoRevision=false){
    if(autoRevision)await assignRevisions(request,await store.get(request.batch_id));
    const result=await runner.stage(request);setCurrent(result);setSource(json(request));setSelected('');
    const found=await validateRequest(request);setIssues(found);setNotice(found.length?`已保存批次，${found.length}项输入问题将逐份列出；其他文档仍可制作。`:'批次已保存，可以开始制作。');
    history.replaceState(null,'','?batch='+encodeURIComponent(request.batch_id));return {...result,issues:found};
  }
  async function run(id,options){const result=await runner.run(id,options);setCurrent(result);setNotice(result.status==='succeeded'?'本批文件已全部制作并保存，可以导出。':`本批${labels[result.status]}，${result.failed}份失败。已完成文件已保存。`);return result;}
  async function exportPackage(id,profile,allow_partial=false){
    const result=await runner.package(id,profile,{allow_partial});
    const name=`${id}_${profile==='candidate'?'业务材料':'制作记录'}${result.partial?'_部分完成':''}.zip`;
    download(result.blob,name);setNotice(`已发起下载：${name}。请在下载目录核对实际文件。`);
    return {batch_id:id,status:'download_requested',profile,partial:result.partial,filename:name,bytes:result.blob.size,summary:result.summary,artifacts:result.artifacts,forge_received:false};
  }
  useEffect(()=>{
    let disposed=false;store.list().then(async list=>{if(disposed)return;setSaved(list);const id=new URLSearchParams(location.search).get('batch') || list[0]?.batch_id;if(id)await open(id);}).catch(error=>!disposed&&setNotice(error.message));
    const binding=registerAgentTools(document.modelContext,{
      stage:request=>perform(()=>stage(request)),run:id=>perform(()=>run(id)),status:(id,include_input)=>runner.status(id,{include_input}),
      retry:(id,ids)=>perform(()=>run(id,{document_ids:ids,retry_only:true})),export:(id,profile,partial)=>perform(()=>exportPackage(id,profile,partial)),
    },error=>{setAgent(false);setNotice('Agent工具注册失败；仍可导入批次：'+error.message);});setAgent(binding.available);
    return()=>{disposed=true;binding.dispose();};
  },[]);
  async function importFile(event){
    const input=event.target.files?.[0];event.target.value='';if(!input)return;
    await perform(async()=>{
      if(input.size>20*1024*1024)throw Error('批次或方案文件请控制在20MB以内');
      const data=JSON.parse(await input.text());let request;
      if(data.schema_version==='business-document/1')request=await editorRequest('business',data);
      else if(data.schema_version)request=data;
      else if(data.kind==='contract-draft')request=await editorRequest('contracts',data.draft);
      else if(data.kind==='contract-backup'){const state=data.state;request=await editorRequest('contracts',state.drafts.find(d=>d.id===state.active)||state.drafts[0]);}
      else if(data.version===1&&data.template_id)request=await editorRequest('certificates',data);
      else if(data.version===1&&data.transactions)request=await editorRequest('finance',data);
      else if(data.schema===1&&data.records)request=await editorRequest('rights',data);
      else throw Error('请选择批次协议、财务／权属／证照方案或合同案件JSON');
      await stage(request,true);
    });
  }
  async function selectDoc(id){
    const batch=await store.get(current.batch_id),doc=batch.documents.find(d=>d.document_id===id);setSelected(id);setEditText(json(doc.payload));
  }
  async function saveDoc(){
    const batch=await store.get(current.batch_id),request=requestFromBatch(batch),doc=request.documents.find(d=>d.document_id===selected);
    doc.payload=JSON.parse(editText);doc.revision++;await stage(request);setNotice('已保存新版本；其他已完成文档继续保留。');
  }
  async function downloadFile(docId,artifactId){
    const batch=await store.get(current.batch_id),artifact=batch.documents.find(d=>d.document_id===docId)?.artifacts.find(a=>a.artifact_id===artifactId);if(!artifact)throw Error('未找到保存的文件');
    download(artifact.blob,artifact.path.split('/').at(-1));setNotice('已发起单份文件下载。');
  }
  const done=current?.documents.filter(d=>d.status==='succeeded').length || 0,failed=current?.documents.filter(d=>d.status==='failed').length || 0;
  return <><header><a href={import.meta.env.BASE_URL}>← 素材中心</a><div><h1>批量制作</h1><p>逐份生成 · 保留完成文件 · 按需重试</p></div><span className="agent-state">{agent?'Agent 工具已就绪':'可导入方案或批次'}</span></header>
  <div className="batch-layout"><aside><div className="aside-title">已保存批次</div>{saved.map(item=><button className={item.batch_id===current?.batch_id?'batch-card active':'batch-card'} disabled={busy} key={item.batch_id} onClick={click(()=>open(item.batch_id))}><strong>{item.name}</strong><span>{labels[item.status]} · {item.succeeded}/{item.documents}份</span></button>)}{!saved.length&&<p className="muted">还没有批次。导入已有方案，或先载入一个示例。</p>}<p className="aside-note">作业和文件保存在当前浏览器。刷新后可继续；清理浏览器数据前请导出制作记录和业务材料。</p></aside>
  <main><section className="intro"><h2>开始一个制作批次</h2><p>导入原工作台的 JSON 方案，或使用批次 JSON。多页流水会合并为一份 PDF，失败文档可以单独重试。</p><div className="actions"><button className="primary" disabled={busy} onClick={()=>file.current.click()}>导入方案或批次</button><input ref={file} type="file" hidden accept=".json,application/json" onChange={event=>importFile(event).catch(()=>{})}/><button disabled={busy} onClick={click(async()=>{const {dueDiligenceDemo}=await import('../shared/due-diligence.js');return stage(await dueDiligenceDemo(),true);})}>载入尽调材料示例</button><button disabled={busy} onClick={click(async()=>stage(await demoRequest('all'),true))}>载入四模块示例</button><button disabled={busy} onClick={click(async()=>stage(await demoRequest('finance'),true))}>载入多页流水示例</button><a href={import.meta.env.BASE_URL+'BATCH_API.md'} target="_blank" rel="noreferrer">Agent 调用说明 ↗</a></div></section>
  {notice&&<div className="notice" role="status">{notice}</div>}
  {current&&<><section className="batch-heading"><div><span className="eyebrow">当前批次</span><h2>{current.name}</h2><span className={'status '+current.status}>{labels[current.status]}</span></div><div className="metrics"><div><b>{current.documents.length}</b><span>独立文档</span></div><div><b>{done}</b><span>已完成</span></div><div><b>{failed}</b><span>失败</span></div><div><b>{current.files}</b><span>已保存文件</span></div></div></section>
  <section className="toolbar"><div className="actions"><button className="primary" disabled={busy||done===current.documents.length} onClick={click(()=>run(current.batch_id))}>{busy?'正在处理…':'制作 / 继续剩余文档'}</button><button disabled={busy||!failed} onClick={click(()=>run(current.batch_id,{retry_only:true}))}>仅重试失败项</button>{busy&&<button onClick={()=>{runner.stop();setNotice('已请求停止后续文档，当前文档会完成后保存。');}}>停止后续</button>}</div><div className="actions"><button disabled={busy||!current.files} onClick={click(()=>exportPackage(current.batch_id,'candidate',done!==current.documents.length))}>{done===current.documents.length?'导出业务材料':'导出已完成材料（部分）'}</button><button disabled={busy} onClick={click(()=>exportPackage(current.batch_id,'authoring',true))}>导出制作记录</button></div></section>
  {issues.length>0&&<details className="checks"><summary>{issues.length}项输入问题</summary><ul>{issues.map((issue,i)=><li key={i}>{issue.document_id}：{issue.message}</li>)}</ul></details>}
  <div className="document-list">{current.documents.map(doc=><article className={'document '+doc.status} key={doc.document_id}><div className="doc-heading"><div><span className="kind">{engines[doc.engine]} · v{doc.revision}</span><h3>{doc.title}</h3><code>{doc.document_id}</code></div><span className={'status '+doc.status}>{labels[doc.status]}</span></div><div className="doc-bottom"><span className="muted">{doc.formats.join(' / ').toUpperCase()} · {doc.pdf_mode==='image'?'图像版':'保留文字'} · 已尝试{doc.attempts}次</span><div className="actions"><button disabled={busy} onClick={()=>selectDoc(doc.document_id).catch(e=>setNotice(e.message))}>查看 / 修改输入</button>{doc.status==='failed'&&<button disabled={busy} onClick={click(()=>run(current.batch_id,{document_ids:[doc.document_id],retry_only:true}))}>重试本份</button>}</div></div>{doc.error&&<p className="error">{doc.error.message}</p>}{doc.artifacts.length>0&&<div className="artifacts">{doc.artifacts.map(a=><div key={a.artifact_id}><button disabled={busy} onClick={click(()=>downloadFile(doc.document_id,a.artifact_id))}>下载 {a.format.toUpperCase()}{a.page_count?' · '+a.page_count+'页':''}</button><span>{(a.bytes/1024).toFixed(1)} KB</span><code title={a.sha256}>SHA256 {a.sha256.slice(0,16)}…</code></div>)}</div>}</article>)}</div>
  {selected&&<section className="input-editor"><h3>修改本份输入</h3><p>保存后创建新版本，仅重新制作本份；其他完成文件保留。</p><label>文档输入 JSON<textarea aria-label="文档输入 JSON" spellCheck={false} value={editText} onChange={e=>setEditText(e.target.value)} disabled={busy}/></label><div className="actions"><button disabled={busy} onClick={click(saveDoc)}>保存本份新版本</button><button onClick={()=>setSelected('')}>关闭</button></div></section>}
  </>}
  <details className="advanced"><summary>查看或编辑批次 JSON</summary><p>页面保存时自动增加改动文档的修订号。Agent 调用 stage_batch 时需自行传入正确修订号。</p><textarea aria-label="批次 JSON" spellCheck={false} value={source} onChange={e=>setSource(e.target.value)} disabled={busy}/><div className="actions"><button disabled={busy||!source.trim()} onClick={click(()=>stage(JSON.parse(source),true))}>保存输入并检查</button><button disabled={busy||!source.trim()} onClick={()=>download(new Blob([source],{type:'application/json;charset=utf-8'}),'material-batch.json')}>下载批次 JSON</button></div></details>
  <p className="footnote">PDF 保留原版面，并加入 SVG 中的文字；底图图片内的文字不包含在文字层中。业务材料与制作记录分别下载。工作台发起下载后，Forge 仍须回收并核对实际文件。</p></main></div></>;
}
