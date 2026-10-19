import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {DOMParser} from '@xmldom/xmldom';
import {indexedDB} from 'fake-indexeddb';
import sharp from 'sharp';
import JSZip from 'jszip';
import {BATCH_SCHEMA,BatchRunner,MemoryStore,digest,validateBatch} from '../online/shared/batch.js';
import {IndexedDBStore} from '../online/shared/batch-store.js';
import {imageAndTextPDF,svgTextRuns} from '../online/shared/pdf.js';
import {editorRequest,renderMaterial,validateDocument,requestFromBatch} from '../online/shared/adapters.js';
import {registerAgentTools} from '../online/shared/agent-tools.js';
import {demo} from '../online/modules/finance/lib/finance.ts';
import {backgroundDefaults,generateBackground} from '../online/modules/finance/lib/background.ts';
import {financialGroups} from '../online/modules/finance/lib/export.ts';
import {newRecord} from '../online/modules/rights/lib/registry.ts';
import {templates,examples} from '../online/contracts/templates.js';
import {newDraft} from '../online/contracts/model.js';

const out=new URL('../work/phase1-qa/',import.meta.url);await fs.mkdir(out,{recursive:true});
const font=await fs.readFile(new URL('../online/public/fonts/NotoSansSC-Regular.ttf',import.meta.url));
const fontLoader=async()=>font.toString('base64');
const rasterize=async page=>'data:image/png;base64,'+(await sharp(Buffer.from(page.svg)).png().toBuffer()).toString('base64');
const dependencies={rasterize,fontLoader,Parser:DOMParser};
const checks=[];
function passed(label){checks.push(label);console.log('PASS:',label);}
const makeDoc=(id)=>({document_id:id,revision:1,title:'文档 '+id,engine:'finance',formats:['svg'],payload:{private_note:'仅作者可见'}});
const request={schema_version:BATCH_SCHEMA,batch_id:'test-retry',name:'逐份重试',documents:[makeDoc('doc-a'),makeDoc('doc-b')]};
const artifact=doc=>[{format:'svg',path:`Reference/${doc.document_id}/r${doc.revision}/sample.svg`,blob:new Blob([`<svg xmlns="http://www.w3.org/2000/svg"><text>${doc.title}</text></svg>`])}];
assert.equal(validateBatch(request).length,0);
assert(validateBatch({...request,documents:[makeDoc('same'),makeDoc('same')]}).length);
assert(validateBatch({...request,documents:[{...makeDoc('x'),formats:['docx']}]}).length);
assert(validateBatch({...request,unknown:true}).length);
const smoke=JSON.parse(await fs.readFile(new URL('../online/public/examples/reference-smoke.batch.json',import.meta.url),'utf8'));
assert.equal(validateBatch(smoke).length,0);
assert.deepEqual([...new Set(smoke.documents.map(d=>d.engine))].sort(),['certificates','contracts','finance','rights']);
passed('批次协议拒绝重复ID、错误格式及未知字段');

const store=new IndexedDBStore(indexedDB),calls={},failOnce=new Set(['doc-b']);
const render=async doc=>{calls[doc.document_id]=(calls[doc.document_id]||0)+1;if(failOnce.delete(doc.document_id))throw Error('模拟一次文件制作失败');return artifact(doc);};
let runner=new BatchRunner({store,render});
await runner.stage(request);const partial=await runner.run(request.batch_id);
assert.equal(partial.status,'partial');assert.equal(partial.succeeded,1);assert.equal(partial.failed,1);
await assert.rejects(runner.package(request.batch_id),/尚未全部完成/);
let pack=await runner.package(request.batch_id,'candidate',{allow_partial:true});
let zip=await JSZip.loadAsync(await pack.blob.arrayBuffer());assert.equal(Object.values(zip.files).filter(f=>!f.dir).length,1);
assert(!Object.keys(zip.files).some(name=>/authoring|输入|记录/.test(name)));
const before=await store.get(request.batch_id),hash=before.documents[0].artifacts[0].sha256;
runner=new BatchRunner({store:new IndexedDBStore(indexedDB),render});
const finished=await runner.run(request.batch_id,{retry_only:true,document_ids:['doc-b']});assert.equal(finished.status,'succeeded');
assert.equal((await store.get(request.batch_id)).documents[0].artifacts[0].sha256,hash);assert.deepEqual(calls,{'doc-a':1,'doc-b':2});
assert.equal((await store.get(request.batch_id)).documents[0].artifacts[0].blob instanceof Blob,true);
passed('IndexedDB跨实例恢复Blob；部分成功、按ID重试且保留完成文件哈希');

const replay=await runner.stage(request);assert.equal(replay.status,'succeeded');assert.deepEqual((await runner.status(request.batch_id,{include_input:true})).documents[0].payload,request.documents[0].payload);await runner.run(request.batch_id);assert.deepEqual(calls,{'doc-a':1,'doc-b':2});
const modified=structuredClone(request);modified.documents[1].title='修改后的文档B';await assert.rejects(runner.stage(modified),/增加revision/);
modified.documents[1].revision=2;await runner.stage(modified);await runner.run(request.batch_id);
assert.deepEqual(calls,{'doc-a':1,'doc-b':3});assert.equal((await store.get(request.batch_id)).documents[0].artifacts[0].sha256,hash);
assert.deepEqual(requestFromBatch(await store.get(request.batch_id)),modified);
passed('重复提交幂等；修改须增加版本且仅重做变更文档');

const damaged=await store.get(request.batch_id);damaged.documents[0].artifacts[0].blob=new Blob(['tampered']);await store.put(damaged);
await assert.rejects(runner.package(request.batch_id),/哈希不一致/);
const invalid=new BatchRunner({store:new MemoryStore(),render:async doc=>[{...artifact(doc)[0],path:'../escape.svg'}]});await invalid.stage(request);assert.equal((await invalid.run(request.batch_id)).failed,2);
const empty=new BatchRunner({store:new MemoryStore(),render:async()=>[]});await empty.stage(request);assert.equal((await empty.run(request.batch_id)).failed,2);
const missingStore=new BatchRunner({store:{get:async()=>null,put:async()=>{throw Error('存储失败');}},render});await assert.rejects(missingStore.stage(request),/存储失败/);
passed('校验实际文件、拒绝路径越界、篡改、缺产物和保存失败');

const interrupted=await store.get(request.batch_id);interrupted.documents[0].status='running';interrupted.documents[0].artifacts=[];await store.put(interrupted);
await runner.run(request.batch_id);assert.equal((await runner.status(request.batch_id)).status,'succeeded');
let release;const slow=new BatchRunner({store:new MemoryStore(),render:async doc=>{await new Promise(resolve=>{release=resolve;});return artifact(doc);}});
await slow.stage({...request,batch_id:'slow',documents:[makeDoc('slow-a')]});const pending=slow.run('slow');
while(!release)await new Promise(resolve=>setTimeout(resolve,1));await assert.rejects(slow.run('slow'),/正在制作/);release();await pending;
passed('中断作业可继续；同一实例并发调用被拒绝');

const registered=[];let registrationError;
const binding=registerAgentTools({registerTool:tool=>{registered.push(tool);}}, {stage:async r=>({batch_id:r.batch_id}),run:async()=>({status:'succeeded'}),status:async()=>({status:'partial'}),retry:async()=>({status:'succeeded'}),export:async()=>({status:'download_requested',forge_received:false})}, e=>registrationError=e);
await new Promise(resolve=>setTimeout(resolve,0));assert.equal(registered.length,8);assert.equal(new Set(registered.map(t=>t.name)).size,8);
assert(registered.every(tool=>typeof tool.description==='string'&&tool.description.length>0));
assert.equal((await registered.find(t=>t.name==='get_job_status').execute({batch_id:'x'})).status,'partial');
assert.equal((await registered.find(t=>t.name==='export_package').execute({batch_id:'x',profile:'candidate'})).forge_received,false);
binding.dispose();assert.equal(registrationError,undefined);
registerAgentTools({registerTool:()=>{throw Error('拒绝注册');}},{},e=>registrationError=e);await new Promise(resolve=>setTimeout(resolve,0));assert.match(registrationError.message,/拒绝注册/);
passed('四模块共用8个Agent工具；同步注册失败可报告，下载不冒充回收');

const runs=svgTextRuns('<svg xmlns="http://www.w3.org/2000/svg"><defs><text>隐藏</text></defs><g transform="translate(10,20) scale(2)"><text x="3" y="4" font-size="10">中文&amp;金额</text></g></svg>',DOMParser);
assert.equal(runs.length,1);assert.equal(runs[0].x,16);assert.equal(runs[0].y,28);assert.equal(runs[0].size,20);assert.equal(runs[0].text,'中文&金额');
await assert.rejects(imageAndTextPDF([{svg:'<svg xmlns="http://www.w3.org/2000/svg"/>',width:10,height:10}],['unused'],{Parser:DOMParser,fontLoader}),/没有可提取文字/);
passed('文字层保留中文、XML转义和坐标变换；无文字不能伪称可检索');

const p=demo(),config={...backgroundDefaults(p),count:70},project=generateBackground(p,config);
const groups=financialGroups(project),statement=groups.filter(g=>g.kind==='statement');assert.equal(statement.length,1);assert(statement[0].pages.length>1);
const finance=await editorRequest('finance',project),receipt=finance.documents.find(d=>d.payload.kind==='receipt'),statementDoc=finance.documents.find(d=>d.payload.kind==='statement');
const rights=newRecord('patent');rights.id='qa-patent';
const rightsRequest=await editorRequest('rights',{schema:1,name:'专利核查',records:[rights]});
const draft=newDraft(templates[2]);draft.id='qa-nda';draft.values=structuredClone(examples[templates[2].id]);
const contract=await editorRequest('contracts',draft);
const realRequest={schema_version:BATCH_SCHEMA,batch_id:'real-pdf',name:'真实制件与故障恢复',documents:[receipt,statementDoc,rightsRequest.documents[0],contract.documents[0]]};
let fault=true;const realStore=new MemoryStore(),realRunner=new BatchRunner({store:realStore,validate:validateDocument,render:async doc=>{if(doc.document_id===receipt.document_id&&fault){fault=false;throw Error('模拟首轮渲染失败');}return renderMaterial(doc,dependencies);}});
await realRunner.stage(realRequest);const initial=await realRunner.run(realRequest.batch_id);assert.equal(initial.failed,1,JSON.stringify(initial.documents.filter(d=>d.error).map(d=>({id:d.document_id,error:d.error.message}))));assert.equal(initial.succeeded,3);
const realBefore=await realStore.get(realRequest.batch_id),oldHashes=realBefore.documents.filter(d=>d.status==='succeeded').flatMap(d=>d.artifacts.map(a=>a.sha256));
const retried=await realRunner.run(realRequest.batch_id,{retry_only:true});assert.equal(retried.status,'succeeded');
const batch=await realStore.get(realRequest.batch_id);assert.deepEqual(batch.documents.filter(d=>d.document_id!==receipt.document_id).flatMap(d=>d.artifacts.map(a=>a.sha256)),oldHashes);
for(const [doc,name]of [[statementDoc,'financial-statement'],[receipt,'bank-receipt'],[rightsRequest.documents[0],'patent-certificate']]){
 const file=batch.documents.find(d=>d.document_id===doc.document_id).artifacts[0],path=new URL(name+'.pdf',out);
 await fs.writeFile(path,Buffer.from(await file.blob.arrayBuffer()));
 const info=execFileSync('pdfinfo',[fileURLToPath(path)],{encoding:'utf8'});assert.equal(Number(info.match(/Pages:\s+(\d+)/)[1]),file.page_count);
 const extracted=execFileSync('pdftotext',['-layout',fileURLToPath(path),'-'],{encoding:'utf8'});await fs.writeFile(new URL(name+'.txt',out),extracted);
 assert.match(extracted.replace(/\s+/g,''),/辰澜/);assert.match(extracted,/SYN/);
 if(doc===statementDoc){assert(file.page_count>1);assert.match(extracted,/1,250,000\.00/);for(const movement of [...project.transactions,...project.background])assert(extracted.replace(/\s+/g,'').includes(movement.paymentRef),movement.paymentRef+'缺失');}
}
const candidates=await realRunner.package(realRequest.batch_id),candidateZip=await JSZip.loadAsync(await candidates.blob.arrayBuffer());
assert.equal(Object.values(candidateZip.files).filter(f=>!f.dir&&f.name.endsWith('.pdf')).length,3);
assert.equal(Object.values(candidateZip.files).filter(f=>!f.dir&&f.name.endsWith('.docx')).length,1);
assert(Object.keys(candidateZip.files).every(path=>path.startsWith('Reference/')));
await fs.writeFile(new URL('candidate-package.zip',out),Buffer.from(await candidates.blob.arrayBuffer()));
passed('真实财务与权属PDF可提取中文、编号和金额；多页流水单文件；合同DOCX；混合批次注入失败后单份恢复');
const authoring=await realRunner.package(realRequest.batch_id,'authoring');
await fs.writeFile(new URL('authoring-package.zip',out),Buffer.from(await authoring.blob.arrayBuffer()));
const recovery=await fs.mkdtemp(os.tmpdir()+'/material-recovery-');
try{
 const result=JSON.parse(execFileSync('python3',['tools/collect_workbench.py','--business-package',fileURLToPath(new URL('candidate-package.zip',out)),'--authoring-package',fileURLToPath(new URL('authoring-package.zip',out)),'--output',recovery],{encoding:'utf8'}));
 assert.equal(result.status,'RECOVERED');assert.equal(result.files,4);assert.equal(result.business_documents,4);
 const recovered=JSON.parse(await fs.readFile(recovery+'/workbench_delivery_manifest.json','utf8'));assert.equal(recovered.inspection,'NOT_PERFORMED');
 const observed=JSON.parse(await fs.readFile(recovery+'/workbench_observed_financial_ledgers.json','utf8'));assert.equal(observed.ledgers[0].rows.length,73);
}finally{await fs.rm(recovery,{recursive:true,force:true});}
passed('真实下载双包安全回收、原字节哈希校验、整数分辅助台账及Reference映射');
const dataDoc={...statementDoc,formats:['xlsx','csv']},dataFiles=await renderMaterial(dataDoc,dependencies);
const csv=await dataFiles.find(f=>f.format==='csv').blob.text();assert(!/记录来源|日常补全|案件交易|模板版本/.test(csv));
const workbook=dataFiles.find(f=>f.format==='xlsx');await fs.writeFile(new URL('financial-statement.xlsx',out),Buffer.from(await workbook.blob.arrayBuffer()));
const {default:ExcelJS}=await import('exceljs'),loaded=new ExcelJS.Workbook();await loaded.xlsx.load(await workbook.blob.arrayBuffer());
assert.equal(loaded.worksheets.length,2);assert.equal(loaded.getWorksheet('银行流水').getCell('K2').value.formula,"'账户信息'!B4+I2-J2");
assert.equal(loaded.getWorksheet('银行流水').getCell('K74').value.result,observedClosing());
function observedClosing(){const rows=financialGroups(project).find(g=>g.kind==='statement').pages;return rows.at(-1).statementSummary.closing;}
assert(!JSON.stringify(loaded.model).includes('记录来源'));
passed('财务XLSX/CSV与同件PDF共用身份，清除制作标签，保留公式及预计算值（未冒充表格引擎复算）');


const pages=statement[0].pages,images=await Promise.all(pages.map(rasterize));
const imagePDF=await imageAndTextPDF(pages,images,{searchable:false});await fs.writeFile(new URL('financial-statement-image.pdf',out),Buffer.from(await imagePDF.arrayBuffer()));
execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1100','-png',fileURLToPath(new URL('financial-statement.pdf',out)),fileURLToPath(new URL('searchable-page',out))]);
execFileSync('pdftoppm',['-f','1','-singlefile','-scale-to','1100','-png',fileURLToPath(new URL('financial-statement-image.pdf',out)),fileURLToPath(new URL('image-page',out))]);
const a=await sharp(await fs.readFile(new URL('searchable-page.png',out))).raw().toBuffer(),b=await sharp(await fs.readFile(new URL('image-page.png',out))).raw().toBuffer();assert(a.equals(b));
passed('同一版面的图像PDF与可检索PDF渲染逐像素一致');
await fs.writeFile(new URL('report.json',out),jsonReport());
function jsonReport(){return JSON.stringify({passed:true,checks,statement_pages:statement[0].pages.length,real_batch_status:retried.status,real_batch_files:retried.files,source:'automated local execution'},null,2)+'\n';}
console.log(`完成 ${checks.length} 组第一批回归检查。`);
