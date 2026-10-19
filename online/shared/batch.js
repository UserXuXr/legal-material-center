export const BATCH_SCHEMA = 'material-batch/1';
export const RENDER_VERSION = 'material-render/1.2.4';
export const ENGINES = ['finance','rights','contracts','certificates','business'];
export const ENGINE_FORMATS={finance:['pdf','png','svg','xlsx','csv'],rights:['pdf','png','svg'],contracts:['docx'],certificates:['pdf','png','svg'],business:['docx','xlsx','csv']};
const copy = value => structuredClone(value);
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
export async function digest(value) {
  const bytes = value instanceof Blob ? await value.arrayBuffer() : new TextEncoder().encode(canonical(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
}
const validId = id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(id);
export function validateBatch(request) {
  const errors = [];
  if (!request || request.schema_version !== BATCH_SCHEMA) return [{message:`schema_version必须为${BATCH_SCHEMA}`}];
  try { if(new TextEncoder().encode(JSON.stringify(request)).length>20*1024*1024)return [{message:'批次输入超过20MB，请分批提交'}]; }
  catch { return [{message:'批次必须是可序列化的JSON对象'}]; }
  if(Object.keys(request).some(k=>!['schema_version','batch_id','name','documents'].includes(k)))errors.push({message:'批次含当前协议不支持的字段'});
  if (!validId(request.batch_id)) errors.push({message:'batch_id需为1至100位字母、数字、点、横线或下划线'});
  if (typeof request.name !== 'string' || !request.name.trim() || request.name.length > 150) errors.push({message:'请填写1至150字的批次名称'});
  if (!Array.isArray(request.documents) || request.documents.length < 1 || request.documents.length > 500) return [...errors,{message:'documents需包含1至500份独立业务文档'}];
  const ids = new Set();
  for (const doc of request.documents) {
    const issue = message => errors.push({document_id:doc?.document_id, message});
    if (!doc || !validId(doc.document_id) || ids.has(doc.document_id)) { issue('文档编号无效或重复'); continue; }
    ids.add(doc.document_id);
    if(Object.keys(doc).some(k=>!['document_id','revision','title','engine','formats','payload','pdf_mode','appearance'].includes(k)))issue('文档含当前协议不支持的字段');
    if (!ENGINES.includes(doc.engine)) issue('材料引擎无效');
    if (!Number.isSafeInteger(doc.revision) || doc.revision < 1) issue('revision需为正整数');
    if (typeof doc.title !== 'string' || !doc.title.trim() || doc.title.length > 150) issue('文档标题需为1至150字');
    if (!Array.isArray(doc.formats) || !doc.formats.length || new Set(doc.formats).size !== doc.formats.length || doc.formats.some(x => !['pdf','docx','png','svg','xlsx','csv'].includes(x))) issue('输出格式无效或重复');
    else if (doc.formats.some(x=>!ENGINE_FORMATS[doc.engine]?.includes(x))) issue('输出格式与材料引擎不匹配');
    if (!doc.payload || typeof doc.payload !== 'object' || Array.isArray(doc.payload)) issue('缺少结构化payload');
    if (doc.pdf_mode !== undefined && !['searchable','image'].includes(doc.pdf_mode)) issue('pdf_mode需为searchable或image');
    if (doc.appearance !== undefined && !['digital','scan'].includes(doc.appearance)) issue('appearance需为digital或scan');
  }
  return errors;
}
export async function inspectArtifact(file,doc) {
  if(!doc.formats.includes(file.format) || !file.path?.startsWith(`Reference/${doc.document_id}/r${doc.revision}/`) || file.path.split('/').some(part=>['..','.',''].includes(part)))throw Error('输出格式或文件路径不符合当前文档约定');
  if(!(file.blob instanceof Blob) || !file.blob.size)throw Error('制作返回了空文件');
  const prefix=new Uint8Array(await file.blob.slice(0,16).arrayBuffer());
  if(file.format==='pdf') {
    const text=new TextDecoder().decode(prefix),tail=await file.blob.slice(-2048).text();
    if(!text.startsWith('%PDF-') || !tail.includes('%%EOF'))throw Error('生成的PDF缺少有效文件头或结束标记');
    if(!Number.isInteger(file.page_count) || file.page_count<1)throw Error('PDF缺少有效页数');
  } else if(file.format==='png') {
    if(![137,80,78,71,13,10,26,10].every((b,i)=>prefix[i]===b))throw Error('生成的PNG格式不正确');
  } else if(file.format==='svg') {
    if(!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(await file.blob.text()))throw Error('生成的SVG格式不正确');
  } else if(['docx','xlsx'].includes(file.format)) {
    const {default:JSZip}=await import('jszip'),zip=await JSZip.loadAsync(await file.blob.arrayBuffer());
    if(!zip.file(file.format==='docx'?'word/document.xml':'xl/workbook.xml') || !zip.file('[Content_Types].xml'))throw Error('生成的Office文件缺少必要内容');
  } else if(file.format==='csv') {
    new TextDecoder('utf-8',{fatal:true}).decode(await file.blob.arrayBuffer());
  }
}
export function summarize(batch) {
  const docs = batch.documents, succeeded = docs.filter(d => d.status === 'succeeded').length;
  const failed = docs.filter(d => d.status === 'failed').length, running = docs.some(d => d.status === 'running');
  const status = running ? 'running' : succeeded === docs.length ? 'succeeded' : succeeded ? 'partial' : failed ? 'failed' : 'queued';
  return {batch_id:batch.batch_id,name:batch.name,status,documents:docs.length,succeeded,failed,pending:docs.length-succeeded-failed,
    files:docs.reduce((n,d)=>n+(d.artifacts?.length || 0),0)};
}
export function publicBatch(batch,include_input=false) {
  return {...summarize(batch),updated_at:batch.updated_at,documents:batch.documents.map(({payload,artifacts,...doc})=>({...doc,...(include_input?{payload}:{}),artifacts:(artifacts || []).map(({blob,...file})=>file)}))};
}
export function deliveryMap(batch) {
  const used=new Set();
  return batch.documents.flatMap(doc=>(doc.artifacts || []).map(file=>{
    let stem=doc.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,85) || '业务材料';
    if(['png','svg'].includes(file.format))stem+='_第'+(Number(file.path.match(/_p(\d+)\./)?.[1]) || 1)+'页';
    let path=`Reference/${stem}.${file.format}`,n=1;while(used.has(path))path=`Reference/${stem}（${++n}）.${file.format}`;used.add(path);
    return {artifact_id:file.artifact_id,document_id:doc.document_id,business_document:true,producer:doc.engine,format:file.format,sha256:file.sha256,bytes:file.bytes,page_count:file.page_count,path,source_path:file.path,origin:file.origin ?? null,transformation:'identity'};
  }));
}
export class MemoryStore {
  batches = new Map();
  async get(id) { return this.batches.has(id) ? copy(this.batches.get(id)) : null; }
  async put(batch) { this.batches.set(batch.batch_id, copy(batch)); }
  async list() { return [...this.batches.values()].map(b=>({...summarize(b),updated_at:b.updated_at})); }
}
export class BatchRunner {
  constructor({store, render, validate = async () => [], onChange = () => {}}) {
    this.store=store;this.render=render;this.validate=validate;this.onChange=onChange;this.busy=false;this.stopRequested=false;
  }
  async exclusive(id, operation) {
    if (this.busy) throw Error('当前正在制作或保存，请完成后重试');
    this.busy=true;
    try {
      if (globalThis.navigator?.locks) return await navigator.locks.request('material-batch:'+id,{ifAvailable:true}, lock=>{
        if (!lock) throw Error('另一个页面正在处理此批次，请稍后重试');
        return operation();
      });
      return await operation();
    } finally { this.busy=false; }
  }
  async save(batch) {
    batch.updated_at=new Date().toISOString();
    // Persistence errors propagate: never announce success when the files could not be saved.
    await this.store.put(batch);this.onChange(publicBatch(batch));
  }
  async stage(request) {
    const errors=validateBatch(request);
    if (errors.length) throw Error(errors.map(e=>(e.document_id ? e.document_id+'：' : '')+e.message).join('\n'));
    return this.exclusive(request.batch_id, async()=>{
      const old=await this.store.get(request.batch_id), documents=[];
      for (const incoming of request.documents) {
        const hash=await digest({renderer:RENDER_VERSION,document:incoming});
        const previous=old?.documents.find(d=>d.document_id===incoming.document_id);
        if (previous && previous.input_digest !== hash && incoming.revision <= previous.revision) throw Error(`${incoming.document_id}内容已修改，请增加revision后重新提交`);
        documents.push(previous?.input_digest===hash ? {...previous,status:previous.status==='running'?'queued':previous.status} : {...copy(incoming),renderer_version:RENDER_VERSION,input_digest:hash,status:'queued',attempts:0,artifacts:[],error:null});
      }
      const batch={schema_version:BATCH_SCHEMA,batch_id:request.batch_id,name:request.name,documents,created_at:old?.created_at || new Date().toISOString()};
      await this.save(batch);return publicBatch(batch);
    });
  }
  async run(id, {document_ids, retry_only=false}={}) {
    return this.exclusive(id, async()=>{
      const batch=await this.store.get(id);
      if (!batch) throw Error('找不到批次，请先导入');
      if (document_ids && (!Array.isArray(document_ids) || !document_ids.length || document_ids.some(x=>!batch.documents.some(d=>d.document_id===x)))) throw Error('待重试文档编号无效');
      this.stopRequested=false;
      for (const doc of batch.documents) {
        if (this.stopRequested) break;
        if (doc.status==='succeeded' || document_ids && !document_ids.includes(doc.document_id) || retry_only && !['failed','running'].includes(doc.status)) continue;
        doc.status='running';doc.attempts++;doc.error=null;await this.save(batch);
        try {
          if(doc.renderer_version!==RENDER_VERSION)throw Error('制件引擎已更新，请重新保存批次输入后制作，避免复用旧版本摘要');
          const issues=await this.validate(doc);
          if (issues.length) throw Error(issues.map(x=>typeof x==='string'?x:x.message).join('；'));
          const files=await this.render(copy(doc));
          if (!files.length || doc.formats.some(format=>!files.some(f=>f.format===format))) throw Error('缺少约定的输出文件');
          const artifacts=[];
          const paths=new Set();
          for (const [index, file] of files.entries()) {
            await inspectArtifact(file,doc);
            if(paths.has(file.path))throw Error('输出文件路径重复，不能覆盖已制作文件');paths.add(file.path);
            const hash=await digest(file.blob);
            artifacts.push({...file,artifact_id:`${doc.document_id}-r${doc.revision}-${index+1}`,document_id:doc.document_id,business_document:true,producer:doc.engine,revision:doc.revision,origin:globalThis.location?.origin || null,sha256:hash,bytes:file.blob.size});
          }
          doc.artifacts=artifacts;doc.status='succeeded';
        } catch (error) {
          doc.status='failed';doc.artifacts=[];doc.error={message:error instanceof Error?error.message:String(error),retryable:true,at:new Date().toISOString()};
        }
        await this.save(batch);
      }
      return publicBatch(batch);
    });
  }
  stop() { this.stopRequested=true; }
  async status(id,{include_input=false}={}) { const batch=await this.store.get(id);if(!batch)throw Error('找不到批次');return publicBatch(batch,include_input); }
  async package(id, profile='candidate', {allow_partial=false}={}) {
    if (!['candidate','authoring'].includes(profile)) throw Error('导出范围无效');
    const batch=await this.store.get(id);if(!batch)throw Error('找不到批次');
    const summary=summarize(batch);
    if (summary.status==='running') throw Error('请等待当前制作完成');
    if (summary.status!=='succeeded' && !allow_partial) throw Error('材料尚未全部完成；请修复失败项，或明确选择导出已完成材料');
    if (profile==='candidate' && !summary.files) throw Error('没有可导出的完成文件');
    const {default:JSZip}=await import('jszip'),zip=new JSZip();
    const mapping=deliveryMap(batch);
    if(profile==='candidate') {
      for(const doc of batch.documents) for(const file of doc.artifacts || []) {
        if(await digest(file.blob)!==file.sha256) throw Error(`${doc.document_id}已保存文件哈希不一致，请重新制作`);
        zip.file(mapping.find(m=>m.artifact_id===file.artifact_id).path, await file.blob.arrayBuffer());
      }
    } else {
      zip.file('制作记录.json',JSON.stringify(publicBatch(batch),null,2));
      zip.file('文件映射.json',JSON.stringify({schema_version:BATCH_SCHEMA,batch_id:batch.batch_id,status:summary.status,artifacts:mapping},null,2));
      zip.file('冻结输入.json',JSON.stringify({schema_version:BATCH_SCHEMA,batch_id:batch.batch_id,name:batch.name,documents:batch.documents.map(({input_digest,status,attempts,artifacts,error,...doc})=>doc)},null,2));
      const {observedFinancialLedgers}=await import('./finance-data.js');
      zip.file('observed_financial_ledgers.json',JSON.stringify(await observedFinancialLedgers(batch),null,2));
    }
    return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE'}),summary,profile,artifacts:mapping,partial:summary.status!=='succeeded'};
  }
}
