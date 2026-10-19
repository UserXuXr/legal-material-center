import {BATCH_SCHEMA, RENDER_VERSION, digest, validateBatch} from './batch.js';
import {withTimeout} from './pdf.js';
const safeName = name => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,85) || '材料';
export async function prepareDocument(doc) {
  const payload=doc.payload;
  if(doc.engine==='business'){
    const model=await import('../business/model.js');const document=model.cleanBusiness(payload.document);
    if(doc.formats.some(f=>!model.formatsFor(document).includes(f)))throw Error('本类业务文书不支持所选格式');
    return {document,model};
  }
  if (doc.engine==='finance') {
    const model=await import('../modules/finance/lib/finance.ts');
    let project=model.parseProject(payload.project,false);
    if (!['invoice','receipt','statement','voucher'].includes(payload.kind)) throw Error('财务kind需为invoice、receipt、statement或voucher');
    let transaction=project.transactions[0];
    if(payload.kind!=='statement') {
      transaction=project.transactions.find(t=>t.id===payload.transaction_id);
      if(!transaction) throw Error('transaction_id未匹配到交易');
      project={...project,transactions:[transaction],background:undefined,backgroundConfig:undefined};
      if(transaction.recordType==='bank' && ['invoice','voucher'].includes(payload.kind)) throw Error('仅银行收付记录不生成发票或会计凭证');
      if(payload.kind==='receipt' && transaction.paid<=0) throw Error('尚未发生收付款，不能生成银行回单');
      if(payload.stage!==undefined && !['invoice','payment'].includes(payload.stage)) throw Error('凭证stage需为invoice或payment');
      if(payload.voucher_variant!==undefined && !['ledger','business'].includes(payload.voucher_variant)) throw Error('voucher_variant需为ledger或business');
      if(payload.kind==='voucher' && payload.stage==='payment' && transaction.paid<=0) throw Error('尚未发生收付款，不能生成付款凭证');
    }
    const errors=model.validate(project);if(errors.length)throw Error(errors.join('；'));
    return {project,transaction,model};
  }
  if(doc.engine==='rights') {
    const model=await import('../modules/rights/lib/registry.ts');
    if(!payload.record || !model.getKind(payload.record.kind)?.views.some(v=>v.id===payload.view)) throw Error('权属record或view无效');
    const project=model.parseProject(JSON.stringify({schema:1,name:doc.title,records:[{...payload.record,views:[payload.view]}]}));
    const record=project.records[0],errors=model.validateRecord(record,[payload.view]);
    if(errors.length)throw Error(errors.join('；'));
    return {record,model};
  }
  if(doc.engine==='contracts') {
    const model=await import('../contracts/model.js');
    const draft=model.cleanDraft(payload.draft),missing=model.missingFields(draft);
    model.cleanTemplate({...draft.template,title:draft.title,clauses:draft.clauses});
    if(missing.length)throw Error('请补全合同字段：'+missing.join('、'));
    return {draft,model};
  }
  if(doc.engine==='certificates') {
    const {templates}=await import('../certificates/lib/templates.ts');
    const model=await import('../certificates/model.js');
    const result=model.validateProject(payload.project,templates);
    return {...result,templates};
  }
  throw Error('不支持的材料引擎');
}
export async function validateDocument(doc) {
  try { await prepareDocument(doc);return []; }
  catch(error) { return [{rule_id:'material.input',severity:'blocker',document_id:doc.document_id,message:error.message}]; }
}
export async function validateRequest(request) {
  const errors=validateBatch(request);if(errors.length)return errors.map(e=>({...e,severity:'blocker',rule_id:'batch.schema'}));
  return (await Promise.all(request.documents.map(validateDocument))).flat();
}
export async function renderMaterial(doc, dependencies={}) {
  const prepared=await prepareDocument(doc),appearance=doc.appearance || 'digital';
  const base=`Reference/${doc.document_id}/r${doc.revision}/${safeName(doc.title)}`;
  if(doc.engine==='business'){
    const files=[];
    for(const format of doc.formats)files.push({format,path:base+'.'+format,blob:await prepared.model.businessFile(prepared.document,format),page_count:null,text_layer:format==='docx'?'editable-document':'structured-data',template_id:'business-'+prepared.document.kind+'-v1',template_version:'1.0.0'});
    return files;
  }
  if(doc.engine==='contracts') {
    const {docxBytes}=await import('../contracts/files.js');
    return [{format:'docx',path:base+'.docx',blob:new Blob([await docxBytes(prepared.draft)],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),
      page_count:null,text_layer:'editable-document',template_id:prepared.draft.template.id,template_version:String(prepared.draft.template.version)}];
  }
  let pages, exporter, templateId, templateVersion, certificatePage;
  if(doc.engine==='finance') {
    const documents=await import('../modules/finance/lib/documents.ts');exporter=await import('../modules/finance/lib/export.ts');
    pages=doc.payload.kind==='voucher' && doc.payload.voucher_variant==='ledger'
      ? [documents.ledgerVoucher(prepared.project,prepared.transaction,doc.payload.stage || 'invoice')]
      : documents.documentPages(prepared.project,prepared.transaction,doc.payload.kind,doc.payload.stage || 'invoice');
    templateId=pages[0]?.templateId || doc.payload.kind+'-structure-v1';templateVersion=pages[0]?.templateVersion || '1';
  } else if(doc.engine==='rights') {
    const documents=await import('../modules/rights/lib/documents.ts');exporter=await import('../modules/rights/lib/export.ts');
    pages=documents.renderDocument(prepared.record,doc.payload.view);templateId=pages[0]?.template;templateVersion=templateId;
  } else {
    const {metrics,backgroundFor}=await import('../certificates/lib/templates.ts');
    const {renderCertificate}=await import('../certificates/lib/documents.js');
    exporter=await import('../certificates/lib/export.js');
    const project={...prepared.project,capture:doc.pdf_mode==='image'?'raster_200dpi':'native'};
    certificatePage=renderCertificate(project,prepared.templates,metrics,backgroundFor(prepared.template.id));
    pages=[certificatePage];templateId=certificatePage.template.id;templateVersion=certificatePage.template.revision;
  }
  if(!pages.length) throw Error('本份文档没有可导出的页面');
  const rasterize=dependencies.rasterize || exporter.pngData,images=[];
  if(doc.formats.some(f=>['pdf','png'].includes(f))) for(const page of pages) images.push(await withTimeout(rasterize(page,appearance)));
  const files=[];
  for(const format of doc.formats) {
    if(['xlsx','csv'].includes(format)){
      const {businessDataFile}=await import('./finance-data.js');
      files.push({format,path:base+'.'+format,blob:await businessDataFile(prepared.project,doc.payload.kind,format,{stage:doc.payload.stage,variant:doc.payload.voucher_variant}),page_count:null,text_layer:'structured-data',template_id:templateId,template_version:templateVersion});
    } else if(format==='pdf') {
      const options={searchable:doc.pdf_mode!=='image',...(dependencies.fontLoader?{fontLoader:dependencies.fontLoader}:{}),...(dependencies.Parser?{Parser:dependencies.Parser}:{})};
      const blob=certificatePage ? await exporter.pdfFile(certificatePage,images[0],options.searchable,dependencies.fontLoader || exporter.loadFont,{...(dependencies.Parser?{Parser:dependencies.Parser}:{})})
        : await exporter.pdfFromImages(pages,images,options);
      files.push({format,path:base+'.pdf',blob,page_count:pages.length,text_layer:options.searchable?'svg-text':'none',text_scope:certificatePage&&!certificatePage.template.vector_style?'filled-fields':'svg-text-excluding-raster-background',template_id:templateId,template_version:templateVersion});
    } else for(const [index,page] of pages.entries()) {
      const svg=exporter.appearanceSVG?exporter.appearanceSVG(page.svg,appearance):page.svg;
      const blob=format==='svg' ? new Blob([svg],{type:'image/svg+xml;charset=utf-8'}) : new Blob([Uint8Array.from(atob(images[index].split(',')[1]),c=>c.charCodeAt(0))],{type:'image/png'});
      files.push({format,path:`${base}_p${index+1}.${format}`,blob,page_count:1,text_layer:format==='svg'?'svg-text':'none',template_id:templateId,template_version:templateVersion});
    }
  }
  return files;
}
export async function editorRequest(engine,project,{appearance='digital',batch_id}={}) {
  if(engine==='business'){
    const {cleanBusiness}=await import('../business/model.js');const document=cleanBusiness(project);
    return {schema_version:BATCH_SCHEMA,batch_id:batch_id||'business-'+(await digest(document.id)).slice(0,20),name:document.title,documents:[{document_id:'business-'+(await digest(document.id)).slice(0,20),revision:1,title:document.title,engine:'business',formats:document.kind==='ledger'?['xlsx','csv']:['docx'],payload:{document}}]};
  }
  const identity=engine==='contracts'?project.id:engine==='certificates'?project.id || project.name:project.name;
  const request={schema_version:BATCH_SCHEMA,batch_id:batch_id || engine+'-'+(await digest(identity)).slice(0,20),name:project.name || project.title || '材料批次',documents:[]};
  const add=(id,title,payload,formats=['pdf'])=>request.documents.push({document_id:id,revision:1,title:title.slice(0,150),engine,formats,pdf_mode:'searchable',appearance,payload});
  if(engine==='finance') {
    const model=await import('../modules/finance/lib/finance.ts');model.parseProject(project,false);
    for(const t of project.transactions) {
      const id=(await digest(t.id)).slice(0,16),scope={...project,transactions:[t]};delete scope.background;delete scope.backgroundConfig;
      const leaf=(kind,stage,variant)=>add(`fin-${id}-${kind}${stage?'-'+stage:''}${variant?'-'+variant:''}`,t.title+'_'+({invoice:'发票',receipt:'银行回单',voucher:'会计凭证'}[kind])+(stage?'_'+stage:''),{project:scope,kind,transaction_id:t.id,...(stage?{stage}:{}),...(variant?{voucher_variant:variant}:{})});
      if(t.recordType!=='bank'){leaf('invoice');leaf('voucher','invoice','ledger');}
      if(t.paid>0){leaf('receipt');if(t.recordType!=='bank')leaf('voucher','payment','ledger');}
      if(t.recordType!=='bank' && !model.isLedgerVoucher(t) && !model.voucherUnavailable(t,'payment'))leaf('voucher','payment','business');
    }
    add('fin-statement',project.name+'_银行流水',{project,kind:'statement'});
  } else if(engine==='rights') {
    const model=await import('../modules/rights/lib/registry.ts');model.parseProject(JSON.stringify(project));
    for(const record of project.records) for(const view of record.views) {
      const id=(await digest(record.id)).slice(0,16);
      add(`rights-${id}-${view}`,record.fields.title+'_'+model.getKind(record.kind).views.find(v=>v.id===view).name,{record,view});
    }
  } else if(engine==='contracts') add('contract-'+(await digest(project.id)).slice(0,16),project.name,{draft:project},['docx']);
  else if(engine==='certificates')add('certificate-'+(await digest(project.template_id)).slice(0,16),project.name,{project});
  else throw Error('不能识别方案所属工作台');
  return request;
}
export function requestFromBatch(batch) {
  return {schema_version:BATCH_SCHEMA,batch_id:batch.batch_id,name:batch.name,documents:batch.documents.map(({document_id,revision,title,engine,formats,pdf_mode,appearance,payload})=>Object.fromEntries(Object.entries({document_id,revision,title,engine,formats,pdf_mode,appearance,payload}).filter(([,value])=>value!==undefined)))};
}
export async function assignRevisions(request,old) {
  if(!old)return request;
  for(const doc of request.documents){
    const previous=old.documents.find(d=>d.document_id===doc.document_id);if(!previous)continue;
    const candidate={...doc,revision:previous.revision};
    doc.revision=await digest({renderer:RENDER_VERSION,document:candidate})===previous.input_digest?previous.revision:previous.revision+1;
  }
  return request;
}
export async function queueEditorBatch(engine,project,appearance='digital') {
  const {IndexedDBStore}=await import('./batch-store.js');const {BatchRunner}=await import('./batch.js');
  const store=new IndexedDBStore(),runner=new BatchRunner({store,render:renderMaterial,validate:validateDocument});
  const request=await editorRequest(engine,structuredClone(project),{appearance});
  await assignRevisions(request,await store.get(request.batch_id));await runner.stage(request);
  window.location.assign(import.meta.env.BASE_URL+'batch/?batch='+encodeURIComponent(request.batch_id));
}
export async function demoRequest(engine='all') {
  const requests=[];
  if(['all','finance'].includes(engine)) {
    const {demo}=await import('../modules/finance/lib/finance.ts');
    const {generateBackground,backgroundDefaults}=await import('../modules/finance/lib/background.ts');
    const p=demo(),config={...backgroundDefaults(p),count:65};
    requests.push(await editorRequest('finance',generateBackground(p,config)));
  }
  if(['all','rights'].includes(engine)){
    const {initialProject}=await import('../modules/rights/lib/registry.ts'),p=initialProject();
    // Fixed sample IDs make reloading the example idempotent.
    p.records.forEach(r=>{r.id='demo-'+r.kind;});requests.push(await editorRequest('rights',p));
  }
  if(['all','contracts'].includes(engine)){
    const {templates,examples}=await import('../contracts/templates.js');const {newDraft}=await import('../contracts/model.js');
    for(const template of engine==='all'?templates.slice(0,3):[templates[2]]){const draft=newDraft(template);draft.id='demo-'+template.id;draft.updatedAt='2026-10-19T00:00:00.000Z';draft.values=structuredClone(examples[template.id]);requests.push(await editorRequest('contracts',draft));}
  }
  if(['all','certificates'].includes(engine)) {
    const {templates}=await import('../certificates/lib/templates.ts');requests.push(await editorRequest('certificates',structuredClone(templates[0].example)));
  }
  if(!requests.length)throw Error('示例类型无效');
  return {schema_version:BATCH_SCHEMA,batch_id:'demo-'+engine,name:engine==='all'?'四模块综合制件示例':requests[0].name,documents:requests.flatMap(r=>r.documents)};
}
export async function capabilities() {
  const {templates}=await import('../contracts/templates.js');
  const {fields}=await import('../contracts/model.js');
  const {kinds,schema}=await import('../modules/rights/lib/registry.ts');
  const {templates:certificates}=await import('../certificates/lib/templates.ts');
  const {definitions:business}=await import('../business/model.js');
  return {schema_version:BATCH_SCHEMA,renderer_version:RENDER_VERSION,entry:'batch/',limits:{documents:500},
    pdf_modes:['searchable','image'],pdf_note:'保留原版面并叠加实际SVG文字；底图图片内文字不包括在文字层。合同仅支持DOCX。',
    engines:{business:{formats:['docx','xlsx','csv'],templates:business,payload:{document:'business-document/1完整文书；台账金额使用整数分'},pipeline_route:{producer:'native',tool:'node tools/render-native-business.mjs',note:'当前Reference管线普通文书和台账使用本地native生成。浏览器业务模块导出的真实producer为business；启用该路线需后端扩展producer契约，不伪装为其他模块。'}},finance:{formats:['pdf','png','svg','xlsx','csv'],kinds:['invoice','receipt','statement','voucher'],payload:{project:'财务工作台完整version 1方案',kind:'材料种类',transaction_id:'非流水必填，匹配project.transactions[].id',stage:'invoice或payment；凭证使用',voucher_variant:'ledger或business；凭证使用'}},
      rights:{formats:['pdf','png','svg'],templates:kinds.map(k=>({id:k.id,name:k.name,views:k.views,fields:schema[k.id]})),payload:{record:'权属工作台RecordItem',view:'对应类型支持的文书视图'}},
      contracts:{formats:['docx'],templates:templates.map(t=>({id:t.id,title:t.title,version:t.version,fields:fields(t)})),payload:{draft:'合同工作台完整schema 1案件快照；可通过get_template获取完整示例'}},
      certificates:{formats:['pdf','png','svg'],templates:certificates.map(t=>({id:t.id,title:t.title,revision:t.revision,fields:t.fields,medium:t.medium,scope_note:t.scope_note})),pending_templates:['CMMI专用参考版式'],payload:{project:'企业证照完整version 1填写方案'}}},
    pipeline_alignment:{producers:['finance','contracts','certificates','rights'],business_document:true,document_identity:'多个格式共用document_id；一份多页流水为一个文档',routes:{native:{documents:business.map(d=>d.id),formats:['docx','xlsx','csv'],tool:'node tools/render-native-business.mjs',origin:null},finance:{documents:['invoice','bank_receipt','bank_statement','accounting_voucher'],formats:['pdf','png','svg','xlsx','csv']},contracts:{documents:['asset_business_acquisition','tripartite_assignment','nda','uploaded_docx','software-development','software-license','saas-service','implementation-maintenance','channel-distribution','joint-research','oem','procurement','office-lease'],formats:['docx']},certificates:{documents:['business_license','construction_qualification','safety_permit','high_tech_enterprise','itss','spca','ip_management','mlps_filing'],formats:['pdf','png','svg']},rights:{documents:['patent','trademark','software_copyright','real_estate','security_registration','vehicle_mortgage','patent_change','trademark_change','software_change','patent_pledge'],formats:['pdf','png','svg']}},candidate_package:'自然业务文件名；制作记录和ID映射另包保存',inspection:'工作台检查不替代Reference独立inspection/QC或专家批准',ledger:'制作记录内observed_financial_ledgers.json为整数分辅助记录；须独立对照plan冻结台账'},
    delivery:'生成成功表示文件已在工作台保存；下载工具仅报告download_requested，Forge须自行回收并核对实际哈希。',
    schema:batchInputSchema};
}
export async function templateExample(engine,id) {
  if(engine==='business'){const {exampleBusiness,exampleLedger}=await import('../business/examples.js');return {document:id?.startsWith('ledger:')?exampleLedger(id.split(':')[1]):exampleBusiness(id||'interview')};}
  if(engine==='contracts') {
    const {templates,examples}=await import('../contracts/templates.js'),{newDraft}=await import('../contracts/model.js');
    const template=templates.find(t=>t.id===id);if(!template)throw Error('未找到合同模板');
    const draft=newDraft(template);draft.values=structuredClone(examples[id]);return {template,draft};
  }
  if(engine==='certificates') {const {templates}=await import('../certificates/lib/templates.ts');const template=templates.find(t=>t.id===id);if(!template)throw Error('未找到证照模板');return {template,project:template.example};}
  if(engine==='finance'){const {demo}=await import('../modules/finance/lib/finance.ts');return {project:demo()};}
  if(engine==='rights'){const {kinds,schema,newRecord}=await import('../modules/rights/lib/registry.ts');const [kind,view]=String(id).split(':');if(!kinds.some(k=>k.id===kind))throw Error('未找到权属类型');const record=newRecord(kind);if(view){if(!kinds.find(k=>k.id===kind).views.some(v=>v.id===view))throw Error('该权属类型不支持本视图');const {extensionExample}=await import('../modules/rights/lib/extensions.ts');record.fields={...record.fields,...extensionExample(kind,view)};record.views=[view];}return {record,fields:schema[kind]};}
  throw Error('材料引擎无效');
}
export const batchInputSchema={type:'object',properties:{schema_version:{type:'string',const:BATCH_SCHEMA},batch_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$'},name:{type:'string',minLength:1,maxLength:150},documents:{type:'array',minItems:1,maxItems:500,items:{type:'object',properties:{document_id:{type:'string'},revision:{type:'integer',minimum:1},title:{type:'string'},engine:{type:'string',enum:['finance','rights','contracts','certificates','business']},formats:{type:'array',items:{type:'string',enum:['pdf','docx','png','svg','xlsx','csv']},minItems:1,uniqueItems:true},pdf_mode:{type:'string',enum:['searchable','image']},appearance:{type:'string',enum:['digital','scan']},payload:{type:'object',description:'对应工作台完整方案及选中的材料范围；结构见get_capabilities和get_template'}},required:['document_id','revision','title','engine','formats','payload'],additionalProperties:false}}},required:['schema_version','batch_id','name','documents'],additionalProperties:false};
