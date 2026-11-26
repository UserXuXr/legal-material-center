import React,{useEffect,useRef,useState} from 'react';
import {defaults,presets,scanFromFile,scanRequest,prepareScan} from './model.js';
import {openSource} from './source.js';
import {simulateScan} from './effects.js';
import {ScanStore} from './store.js';
import {BatchRunner,digest} from '../shared/batch.js';
import {IndexedDBStore} from '../shared/batch-store.js';
import {assignRevisions,renderMaterial,validateDocument} from '../shared/adapters.js';
import {SEAL_KINDS,SEAL_TEXTURES,SCAN_SCOPE,arcReadsLeftToRight} from '../shared/seal.js';
import {HAND_FONTS} from '../shared/font-policy.js';
import {prepareSealAsset} from './seal-asset.js';
import {paintContractSlice,stampContractPerforation} from '../shared/contract-perforation.js';
import {decodePng} from '../reference-edit/png.js';

const base=import.meta.env.BASE_URL;
const initial=()=>({id:crypto.randomUUID(),schema_version:'scan-workspace/1',items:[],active:null});
const save=(blob,name)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);};
const sliders=[['tilt','倾斜角度',0,3,.1,'°'],['curve','纸张弯曲',0,60,1,''],['perspective','透视收缩',0,6,.2,'%'],['fold','折痕强度',0,60,1,''],['paper','纸张泛黄',0,70,1,''],['shadow','边缘与环境阴影',0,60,1,''],['noise','纸纹与噪点',0,40,1,''],['blur','扫描模糊',0,1.5,.05,''],['inkWear','字迹褪色',0,40,1,''],['contrast','印刷对比度',-15,35,1,'']];

export default function App(){
  useEffect(()=>{
    const faces=[new FontFace('SealUI',`url(${base}fonts/NotoSansSC-Bold.ttf)`),...HAND_FONTS.map(font=>new FontFace(font.id,`url(${base}fonts/handwriting/${font.file})`))];
    for(const face of faces)face.load().then(loaded=>document.fonts.add(loaded)).catch(()=>{});
  },[]);
  const [store]=useState(()=>new ScanStore()),[workspace,setWorkspace]=useState(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[session,setSession]=useState(null),[page,setPage]=useState(0),[images,setImages]=useState(null),[previewBusy,setPreviewBusy]=useState(false),[view,setView]=useState('after'),[tool,setTool]=useState('none'),[ink,setInk]=useState('#23477b'),[text,setText]=useState('已核对'),[stroke,setStroke]=useState([]),[restoreError,setRestoreError]=useState(false),[sealPast,setSealPast]=useState([]),[grant,setGrant]=useState(false);
  const upload=useRef(),plan=useRef(),sealPng=useRef(),guard=useRef(false),latest=useRef(),previewRef=useRef();latest.current=workspace;
  const item=workspace?.items.find(i=>i.model.id===workspace.active)||workspace?.items[0],model=item?.model;
  const previewKey=JSON.stringify([model?.id,page,model?.settings,model?.marks]);
  useEffect(()=>{let live=true;store.get().then(async value=>{
    if(value&&(value.schema_version!=='scan-workspace/1'||!Array.isArray(value.items)||value.items.length>10))throw Error('扫描草稿结构异常，请保留数据并导出检查');
    if(value)for(const item of value.items)await prepareScan({payload:{scan:item.model},formats:item.formats});
    if(live)setWorkspace(value||initial());
  }).catch(e=>{if(live){setNotice(e.message);setRestoreError(true);}});return()=>{live=false;};},[]);
  useEffect(()=>{if(!workspace)return;const t=setTimeout(()=>store.put(workspace).catch(e=>setNotice(e.message)),250);return()=>clearTimeout(t);},[workspace]);
  useEffect(()=>{
    let live=true,opened;setSession(null);setImages(null);setPage(0);
    if(model)prepareScan({payload:{scan:model},formats:['pdf']}).then(async prepared=>{
      opened=await openSource(prepared.model,prepared.blob);opened.sourceId=prepared.model.id;if(live)setSession(opened);else await opened.close();
    }).catch(e=>live&&setNotice(e.message));
    return()=>{live=false;if(opened)opened.close();};
  },[model?.id,model?.source.file.sha256]);
  useEffect(()=>{
    if(!session||!model||session.sourceId!==model.id)return;let live=true;setPreviewBusy(true);setImages(null);
    const timer=setTimeout(async()=>{
      let original,after,source;
      try{const p=await session.page(page,model.settings.dpi);source=p.canvas;if(model.seal?.source==='png')await prepareSealAsset(model.seal);const sealNow=model.seal?.enabled?{...model.seal,pageIndex:page,pageCount:session.count}:null;if(sealNow?.mode==='perforation'&&session.count>1){original=document.createElement('canvas');original.width=source.width;original.height=source.height;original.getContext('2d').drawImage(source,0,0);paintContractSlice(original,sealNow);}else original=source;after=simulateScan(source,model.settings,page,model.marks||[],sealNow,model.signature);
        if(live)setImages({key:previewKey,before:original.toDataURL('image/png'),after:after.toDataURL('image/png'),width:after.width,height:after.height});
      }catch(e){if(live)setNotice(e.message);}finally{if(source)source.width=source.height=1;if(original&&original!==source)original.width=original.height=1;if(after)after.width=after.height=1;if(live)setPreviewBusy(false);}
    },180);
    return()=>{live=false;clearTimeout(timer);};
  },[session,page,model?.settings,model?.marks,model?.seal,model?.signature]);
  function update(changes){setWorkspace(s=>({...s,items:s.items.map(i=>i.model.id===model.id?{...i,model:{...i.model,...changes}}:i)}));}
  const settings=changes=>update({settings:{...model.settings,...changes}});
  function setSeal(next,remember=true){if(remember)setSealPast(past=>[...past.slice(-12),model.seal||{enabled:false}]);update({seal:next});}
  function undoSeal(){const prev=sealPast.at(-1);if(!prev){setNotice('没有可撤销的章设置。');return;}setSealPast(past=>past.slice(0,-1));update({seal:prev});}
  const blankSeal=()=>({enabled:true,kind:'circle_emblem',texture:'normal',mode:'stamp',source:'generated',company:'苍澜示意科技有限公司',person:'沈予安',edge:'right',xRatio:.72,yRatio:.55,scale:.2,opacity:.92,topStart:-200,topEnd:20,bottomStart:130,bottomEnd:50,topTracking:1.06,bottomTracking:1.08,topInset:28,bottomInset:34});
  function arcOf(seal){return {topStart:seal.topStart??-200,topEnd:seal.topEnd??20,bottomStart:seal.bottomStart??130,bottomEnd:seal.bottomEnd??50,topTracking:seal.topTracking??1.06,bottomTracking:seal.bottomTracking??1.08,topInset:seal.topInset??28,bottomInset:seal.bottomInset??(seal.kind==='oval_contract'?48:34)};}
  function pointArc(which,direction){const arc=arcOf(model.seal);const start=arc[which+'Start'],end=arc[which+'End'];const ltr=arcReadsLeftToRight(start,end,which==='top'?150:130,model.seal.kind==='oval_contract'?90:130);if((direction==='ltr')===ltr)return;setSeal({...model.seal,[which+'Start']:end,[which+'End']:start});}
  async function loadSealPng(file){
    if(!file)return;
    if(!grant)throw Error('上传章图前需确认已获授权。未授权的图片不会盖上。');
    if(file.size>700*1024)throw Error('授权章图请小于700KB。');
    const bytes=new Uint8Array(await file.arrayBuffer());
    try{await decodePng(bytes);}catch(error){throw Error(error?.message||'这个文件不是可读取的 PNG。请另存为 8 位 RGB 或 RGBA。');}
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    const png=btoa(binary);
    const next={...(model.seal?.enabled?model.seal:blankSeal()),enabled:true,source:'png',authorized:true,png};
    await prepareSealAsset(next);
    setSeal(next);
    setNotice('已读入授权章图。近白底已变为透明，并保留合成样本标记。');
  }
  async function exportPerforation(){
    if(!model.seal?.enabled||model.seal.mode!=='perforation')throw Error('未选择骑缝。未签署的草稿不会自动加骑缝章。');
    if(model.source.file.format!=='pdf')throw Error('请先导入多页合同 PDF。Word 请先导出 PDF，再加骑缝。');
    if(!session||session.count<2)throw Error('骑缝章至少需要连续两页。单页不要把整章重复盖上。');
    const {cleanSeal}=await import('./model.js');
    const seal=cleanSeal({...model.seal,mode:'perforation'});
    if(seal.source==='png')await prepareSealAsset(seal);
    const original=Uint8Array.from(atob(model.source.file.data_base64),c=>c.charCodeAt(0));
    const snapshot=original.slice();
    const next=await stampContractPerforation(original,{...seal,filename:model.source.file.name,pageCount:session.count});
    for(let i=0;i<snapshot.length;i++)if(snapshot[i]!==original[i])throw Error('原文件被改动，已停止。');
    save(new Blob([next],{type:'application/pdf'}),`${model.title.replace(/\.pdf$/i,'')}_骑缝.pdf`);
    setNotice('已下载带骑缝的新PDF。原文件仍留在浏览器里，没有被覆盖。');
  }
  async function perform(fn){if(guard.current)return;guard.current=true;setBusy(true);setNotice('');try{await fn();}catch(e){setNotice(e.message);}finally{guard.current=false;setBusy(false);}}
  async function importFiles(files){
    if(files.length+workspace.items.length>10)throw Error('工作区最多10份来源，请移除已完成材料后再导入');
    const items=[];for(const file of files)items.push({model:await scanFromFile(file),formats:['pdf']});
    if(!items.length)return;setWorkspace(s=>({...s,items:[...s.items,...items],active:items[0].model.id}));setTool('none');setView('after');setNotice(`已导入${items.length}份来源，原文件保留在当前浏览器。`);
  }
  async function example(){
    const {exampleDocument}=await import('../materials/documents.js'),{renderNewMaterial}=await import('../materials/render.js');
    const document=exampleDocument('letter-of-credit'),files=await renderNewMaterial({document_id:'scan-example',revision:1,title:'合成业务材料',engine:'documents',formats:['pdf'],pdf_mode:'searchable',payload:{document}});
    await importFiles([new File([files[0].blob],'合成业务材料.pdf',{type:'application/pdf'})]);
  }
  async function makeRequest(all=false){
    const items=all?workspace.items:[item],requests=await Promise.all(items.map(i=>scanRequest(i.model,{formats:i.formats})));
    return all?{schema_version:'material-batch/1',batch_id:'scans-'+(await digest(workspace.id)).slice(0,20),name:'扫描件模拟批次',documents:requests.flatMap(r=>r.documents)}:requests[0];
  }
  async function stage(request){const batchStore=new IndexedDBStore(),runner=new BatchRunner({store:batchStore,render:renderMaterial,validate:validateDocument});await assignRevisions(request,await batchStore.get(request.batch_id));await runner.stage(request);return {batchStore,runner};}
  async function queue(all){const request=await makeRequest(all);await store.put(workspace);await stage(request);location.assign(base+'batch/?batch='+encodeURIComponent(request.batch_id));}
  async function produce(){
    const request=await makeRequest(),{batchStore,runner}=await stage(request),result=await runner.run(request.batch_id);
    if(result.status!=='succeeded')throw Error(result.documents.find(d=>d.error)?.error.message||'扫描制作未完成');
    const batch=await batchStore.get(request.batch_id),files=batch.documents[0].artifacts;
    if(files.length===1)save(files[0].blob,files[0].path.split('/').at(-1));else save((await runner.package(request.batch_id,'candidate')).blob,model.title+'.zip');
    setNotice('扫描件已保存并发起下载；可在批量制作中另行导出制作记录。');
  }
  async function importPlan(file){
    if(!file)return;if(file.size>20*1024*1024)throw Error('扫描方案最多20MB');
    const value=JSON.parse(await file.text()),items=value.schema_version==='scan-document/1'?[{model:value,formats:['pdf']}]:value.schema_version==='scan-workspace/1'?value.items:null;
    if(!Array.isArray(items)||!items.length||items.length>10)throw Error('请选择包含1至10份材料的扫描方案');
    const ids=new Set();for(const i of items){await prepareScan({payload:{scan:i.model},formats:i.formats});if(ids.has(i.model.id))throw Error('方案编号重复');ids.add(i.model.id);}
    setWorkspace({schema_version:'scan-workspace/1',id:value.id||crypto.randomUUID(),items,active:items[0].model.id});setNotice('扫描方案已载入。');
  }
  const chooseTool=next=>{setTool(next);setStroke([]);if(next!=='none')setView('before');};
  function point(event){const r=previewRef.current.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))];}
  function down(e){
    if(tool==='none'||!images||busy)return;
    if((model.marks?.length||0)>=80){setNotice('每份文档最多80条批注，请先撤销部分笔迹。');return;}
    const [x,y]=point(e);
    if(tool==='text'){if(!text.trim())return;update({marks:[...(model.marks||[]),{kind:'text',page,color:ink,text:text.trim(),x:Math.min(x,.90),y:Math.min(y,.92),size:.027}]});setTool('none');setView('after');return;}
    e.currentTarget.setPointerCapture(e.pointerId);setStroke([[x,y]]);
  }
  function finish(){
    if(stroke.length>1){update({marks:[...(model.marks||[]),{kind:'stroke',page,color:ink,width:.0018,points:stroke}]});setTool('none');setView('after');}
    setStroke([]);
  }
  return <><header className="scan-header"><a className="back" href={base}>← 素材中心</a><div className="heading"><h1>扫描件模拟</h1><p>让电子文档，带一点纸张的质感。</p></div><div className="header-actions"><button disabled={!workspace||busy} onClick={()=>plan.current.click()}>导入方案</button><button disabled={!workspace?.items.length||busy} onClick={()=>save(new Blob([JSON.stringify(workspace,null,2)],{type:'application/json'}),'扫描件_方案.json')}>保存方案</button><button disabled={!workspace?.items.length||busy} onClick={()=>perform(()=>queue(true))}>全部送入批量制作</button></div></header>
    <input ref={upload} hidden type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg" onChange={e=>{const files=[...e.target.files];e.target.value='';perform(()=>importFiles(files));}}/><input ref={plan} hidden type="file" accept=".json" onChange={e=>{const f=e.target.files[0];e.target.value='';perform(()=>importPlan(f));}}/>
    {notice&&<div className="scan-notice" role="status">{notice}</div>}
    {!workspace?<p className="loading">{restoreError?'草稿未能载入，请保留浏览器数据后重试。':'正在读取扫描工作区…'}</p>:<div className="scan-layout"><aside className="source-panel"><span className="eyebrow">01 / 来源文档</span><button className="upload-zone" disabled={busy} onClick={()=>upload.current.click()}><b>＋ 导入合成材料</b><span>PDF · Word · PNG · JPG</span><small>每份12MB以内，最多30页</small></button><button className="sample-button" disabled={busy} onClick={()=>perform(example)}>载入合成示例</button>
      <nav className="source-list" aria-label="来源文档">{workspace.items.map(i=><button disabled={busy} className={i.model.id===model?.id?'selected':''} key={i.model.id} onClick={()=>{setWorkspace(s=>({...s,active:i.model.id}));setTool('none');}}><small>{i.model.source.file.format.toUpperCase()}</small><strong>{i.model.source.file.name}</strong></button>)}</nav>
      <p className="source-note">PDF按原页面转图。Word按浏览器排版；需要保留Word原版分页时，请先导出PDF。</p><p className="source-note">文件与方案保存在当前浏览器。处理不上传文档。导出的是图像，不含可检索文字层。</p>
    </aside>{!model?<main className="empty"><span className="empty-sheet">▤</span><h2>先放入一份电子文档</h2><p>选择纸张、复印或手机拍摄的效果，<br/>再微调倾斜、弯曲、折痕和字迹。</p><button className="primary" disabled={busy} onClick={()=>upload.current.click()}>选择Word或PDF</button></main>:<><section className="scan-preview" data-preview-key={previewKey}><div className="preview-top"><div><span className="eyebrow">02 / 逐页检查</span><h2>{model.title}</h2></div><div className="segmented"><button aria-pressed={view==='before'} onClick={()=>{setView('before');setTool('none');}}>原稿</button><button aria-pressed={view==='after'} onClick={()=>{setView('after');setTool('none');}}>扫描效果</button></div></div>
      <div className="page-toolbar"><button disabled={!session||page===0||busy} onClick={()=>{setPage(v=>v-1);setTool('none');}}>上一页</button><span>{session?`${page+1} / ${session.count} 页`:'正在排版…'}</span><button disabled={!session||page>=session.count-1||busy} onClick={()=>{setPage(v=>v+1);setTool('none');}}>下一页</button></div>
      <div className="paper-stage">{previewBusy&&<p className="preview-loading">正在生成页面…</p>}{images?.key===previewKey?<div data-preview-key={images.key} className={'paper tool-'+tool} ref={previewRef} onPointerDown={down} onPointerMove={e=>{if(stroke.length&&tool==='pen'&&stroke.length<2000)setStroke(points=>[...points,point(e)]);}} onPointerUp={finish} onPointerCancel={()=>setStroke([])}><img draggable="false" alt={view==='before'?'原始文档页面':'模拟扫描结果'} src={images[view]}/>{stroke.length>0&&<svg viewBox="0 0 1 1" preserveAspectRatio="none"><polyline points={stroke.map(p=>p.join(',')).join(' ')} fill="none" stroke={ink} strokeWidth=".002"/></svg>}</div>:!previewBusy&&<p className="preview-loading">{session?'页面暂不可预览，请检查上方提示。':'正在读取文档…'}</p>}</div>
      <div className="preview-caption"><span>{images?`${images.width} × ${images.height} px · ${model.settings.dpi} DPI`:''}</span><span>{model.seal?.enabled&&model.seal.mode==='perforation'?'原稿预览叠有本页骑缝切片，位置与新PDF一致。扫描效果仍会把整页栅格化。':tool==='pen'?'在原稿上画线，松开后应用扫描效果':tool==='text'?'点击原稿，放置文字批注':session?.note}</span></div>
    </section><aside className="controls"><span className="eyebrow">03 / 纸张与字迹</span><label>输出标题<input maxLength={150} value={model.title} disabled={busy} onChange={e=>update({title:e.target.value})}/></label>
      <div className="presets">{presets.map(p=><button disabled={busy} key={p.id} title={p.description} onClick={()=>settings({...defaults,...p.settings,curve:p.id==='phone'?25:0,inkWear:p.id==='archive'?12:0,seed:model.settings.seed})}>{p.name}</button>)}</div>
      <fieldset disabled={busy}><label>色彩模式<select value={model.settings.mode} onChange={e=>settings({mode:e.target.value})}><option value="color">彩色纸张</option><option value="gray">灰度复印</option><option value="bw">黑白阈值</option></select></label>
      {sliders.map(([key,label,min,max,step,unit])=><label className="slider" key={key}><span>{label}<output>{model.settings[key]}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={model.settings[key]} onChange={e=>settings({[key]:Number(e.target.value)})}/></label>)}
      <section className="ink-panel"><h3>手写批注与画线</h3><label>批注文字<input maxLength={80} value={text} onChange={e=>setText(e.target.value)}/></label><div className="ink-colors" aria-label="笔迹颜色">{[['#23477b','蓝笔'],['#202020','黑笔'],['#9f3535','红笔']].map(([color,title])=><button key={color} title={title} aria-pressed={ink===color} style={{color}} onClick={()=>setInk(color)}>{title}</button>)}</div><div className="ink-actions"><button aria-pressed={tool==='text'} onClick={()=>chooseTool(tool==='text'?'none':'text')}>放置文字</button><button aria-pressed={tool==='pen'} onClick={()=>chooseTool(tool==='pen'?'none':'pen')}>自由画线</button><button disabled={!model.marks?.some(m=>m.page===page)} onClick={()=>{const marks=[...(model.marks||[])],i=marks.findLastIndex(m=>m.page===page);marks.splice(i,1);update({marks});}}>撤销本页一笔</button></div><small>{model.marks?.filter(m=>m.page===page).length||0}条本页批注。批注随纸张一起弯曲和扫描。</small></section>
      <div className="two"><label>分辨率<select value={model.settings.dpi} onChange={e=>settings({dpi:Number(e.target.value)})}><option value={100}>100 DPI</option><option value={150}>150 DPI</option><option value={200}>200 DPI</option></select></label><label>随机种子<input type="number" min={0} max={4294967295} step={1} value={model.settings.seed} onChange={e=>{const seed=Number(e.target.value);if(Number.isInteger(seed)&&seed>=0&&seed<=4294967295)settings({seed});}}/></label></div>
      <label className="slider"><span>PDF／JPG画质<output>{model.settings.quality}%</output></span><input aria-label="PDF／JPG画质" type="range" min={50} max={100} value={model.settings.quality} onChange={e=>settings({quality:Number(e.target.value)})}/></label>
      <label className="check"><input type="checkbox" checked={model.settings.watermark} onChange={e=>settings({watermark:e.target.checked})}/>显示小型“合成扫描”标记</label>
      <section className="ink-panel"><h3>可选签章</h3><p className="source-note">默认不盖章、不签名。章型与质感可独立组合。字体排出的姓名不是连续真实签名，也不临摹笔迹。合成样本标记不能去掉。</p>
        <label className="check"><input type="checkbox" checked={!!model.seal?.enabled} onChange={e=>e.target.checked?setSeal(blankSeal()):setSeal({enabled:false})}/>在纸张效果之后加盖</label>
        {model.seal?.enabled&&<>
          <label>章型<select aria-label="章型" value={model.seal.kind} onChange={e=>{const kind=e.target.value;const oval=kind==='oval_contract';setSeal({...model.seal,kind,bottomInset:oval&& (model.seal.bottomInset??34)===34?48:model.seal.bottomInset??34});}}>{SEAL_KINDS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          <label>质感<select aria-label="质感" value={model.seal.texture} onChange={e=>setSeal({...model.seal,texture:e.target.value})}>{SEAL_TEXTURES.map(item=><option key={item.id} value={item.id}>{item.label} · {item.scope}</option>)}</select></label>
          <label>盖印<select aria-label="盖印方式" value={model.seal.mode||'stamp'} onChange={e=>setSeal({...model.seal,mode:e.target.value})}><option value="stamp">单页指定位置</option><option value="perforation">骑缝：先质感再纵切到页边</option></select></label>
          {model.seal.source!=='png'&&<label>虚构主体<input aria-label="虚构主体" value={model.seal.company||''} maxLength={40} onChange={e=>setSeal({...model.seal,company:e.target.value},false)}/></label>}
          <label className="check"><input type="checkbox" checked={grant} onChange={e=>setGrant(e.target.checked)}/>我确认此章图已获授权，只用于合成材料</label>
          <div className="ink-actions"><button type="button" disabled={!grant} onClick={()=>sealPng.current.click()}>上传授权章 PNG</button><button type="button" disabled={model.seal.source!=='png'} onClick={()=>setSeal({...model.seal,source:'generated',authorized:false,png:undefined})}>删除章图</button><button type="button" disabled={!sealPast.length} onClick={undoSeal}>撤销章设置</button></div>
          <input ref={sealPng} hidden type="file" accept="image/png,.png" onChange={e=>{const file=e.target.files?.[0];e.target.value='';perform(()=>loadSealPng(file));}}/>
          <p className="source-note">{model.seal.source==='png'?'当前使用授权章图。近白底会变成透明，避免盖住正文。章图下方仍印“合成样本”，不能去掉。':'当前使用合成样本章，不是上传的图片。'} {model.seal.texture==='scan'?SCAN_SCOPE:'少墨、缺印、稠墨只改章面，不把整页当成已扫描。扫描质感才会连同页面文字一起退化。'} 骑缝会先做质感，再按页纵切贴到页边，不会每页重复整章。</p>
          {model.seal.kind==='name_chop'?<p className="source-note">个人方章没有上下弧。圆章和椭圆章才使用下面的弧线。</p>:<>
            <p className="source-note">上下弧各自调整方向、起止、字距和半径。默认下弧正视正立，从左到右。圆章和椭圆章用同一组控制。</p>
            {[['top','上弧'],['bottom','下弧']].map(([which,label])=>{const arc=arcOf(model.seal);const ltr=arcReadsLeftToRight(arc[which+'Start'],arc[which+'End'],which==='top'?150:130,model.seal.kind==='oval_contract'?90:130);return <div key={which}>
              <label>{label}方向<select aria-label={label+'方向'} value={ltr?'ltr':'rtl'} onChange={e=>pointArc(which,e.target.value)}><option value="ltr">左到右</option><option value="rtl">右到左</option></select></label>
              <label className="slider"><span>{label}起点<output>{arc[which+'Start']}°</output></span><input aria-label={label+'起点'} type="range" min={-320} max={320} step={1} value={arc[which+'Start']} onChange={e=>setSeal({...model.seal,[which+'Start']:Number(e.target.value)})}/></label>
              <label className="slider"><span>{label}终点<output>{arc[which+'End']}°</output></span><input aria-label={label+'终点'} type="range" min={-320} max={320} step={1} value={arc[which+'End']} onChange={e=>setSeal({...model.seal,[which+'End']:Number(e.target.value)})}/></label>
              <label className="slider"><span>{label}字距<output>{arc[which+'Tracking']}</output></span><input aria-label={label+'字距'} type="range" min={.6} max={2.2} step={.02} value={arc[which+'Tracking']} onChange={e=>setSeal({...model.seal,[which+'Tracking']:Number(e.target.value)})}/></label>
              <label className="slider"><span>{label}半径内缩<output>{arc[which+'Inset']}</output></span><input aria-label={label+'半径'} type="range" min={6} max={110} step={1} value={arc[which+'Inset']} onChange={e=>setSeal({...model.seal,[which+'Inset']:Number(e.target.value)})}/></label>
            </div>;})}
          </>}
          <label className="slider"><span>横向位置<output>{Math.round((model.seal.xRatio??.72)*100)}%</output></span><input aria-label="横向位置" type="range" min={0} max={1} step={.01} value={model.seal.xRatio??.72} disabled={model.seal.mode==='perforation'} onChange={e=>setSeal({...model.seal,xRatio:Number(e.target.value)})}/></label>
          <label className="slider"><span>纵向位置<output>{Math.round((model.seal.yRatio??.55)*100)}%</output></span><input aria-label="纵向位置" type="range" min={0} max={1} step={.01} value={model.seal.yRatio??.55} onChange={e=>setSeal({...model.seal,yRatio:Number(e.target.value)})}/></label>
          <label className="slider"><span>大小<output>{Math.round((model.seal.scale??.2)*100)}%</output></span><input aria-label="章的大小" type="range" min={.08} max={.46} step={.01} value={model.seal.scale??.2} onChange={e=>setSeal({...model.seal,scale:Number(e.target.value)})}/></label>
          <label className="slider"><span>透明度<output>{Math.round((model.seal.opacity??.92)*100)}%</output></span><input aria-label="章的透明度" type="range" min={.15} max={1} step={.01} value={model.seal.opacity??.92} onChange={e=>setSeal({...model.seal,opacity:Number(e.target.value)})}/></label>
          {model.seal.mode==='perforation'&&<><label>骑缝页边<select aria-label="骑缝页边" value={model.seal.edge||'right'} onChange={e=>setSeal({...model.seal,edge:e.target.value})}><option value="right">右页边</option><option value="left">左页边</option></select></label>
          <p className="source-note">同一枚章按这份 PDF 的页数均分，从第 1 页连续切到最后一页。除不尽的余量留在对应页，按顺序拼回仍是原来的一枚章。页数越多每页越窄；导入上限 30 页内仍只用这一枚，不另起第二枚，也不在每页重复整章。章图比页数还窄时会停止。导出的是新 PDF，不改原文件。未勾选盖章时不会自动加。判决书和裁定书不能加模拟骑缝。</p>
          <button type="button" disabled={!session||session.count<2||model.source.file.format!=='pdf'} onClick={()=>perform(exportPerforation)}>导出带骑缝的新PDF</button></>}
        </>}
        <label className="check"><input type="checkbox" checked={!!model.signature?.enabled} onChange={e=>update({signature:e.target.checked?{enabled:true,font:'xiaolai',name:'沈予安',x:.68,y:.84}:{enabled:false}})}/>加一枚字体模拟签名</label>
        {model.signature?.enabled&&<><label>硬笔字体<select aria-label="硬笔字体" value={model.signature.font} onChange={e=>update({signature:{...model.signature,font:e.target.value}})}>{HAND_FONTS.map(font=><option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
          <label>姓名<input value={model.signature.name} maxLength={12} onChange={e=>update({signature:{...model.signature,name:e.target.value}})}/></label>
          <p className="source-note">{HAND_FONTS.find(font=>font.id===model.signature.font)?.note} 缺字会停止导出。</p></>}
      </section>
      <section className="output-panel"><h3>导出扫描件</h3><p className="source-note">这里导出的 PDF、PNG 和 JPG 都是图像。扫描流程本来就会栅格化，不能把它说成仍可检索。中西文配对不作用在这份图像上。</p><div className="formats">{['pdf','png','jpg'].map(f=><label key={f}><input type="checkbox" checked={item.formats.includes(f)} onChange={e=>setWorkspace(s=>({...s,items:s.items.map(i=>i.model.id===model.id?{...i,formats:e.target.checked?[...i.formats,f]:i.formats.filter(x=>x!==f)}:i)}))}/>{f.toUpperCase()}</label>)}</div><button className="primary" disabled={!session||!item.formats.length} onClick={()=>perform(produce)}>{busy?'正在制作，请稍候…':'制作并下载'}</button><button disabled={!item.formats.length} onClick={()=>perform(()=>queue(false))}>这份送入批量制作</button><small>PDF合并全部页面，图片逐页输出。多文件自动打包。</small></section></fieldset>
      <button className="remove" disabled={busy} onClick={()=>{setWorkspace(s=>{const items=s.items.filter(i=>i.model.id!==model.id);return {...s,items,active:items[0]?.model.id||null};});}}>移除这份来源</button>
    </aside></>}</div>}
  </>;
}
