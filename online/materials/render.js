import {documentPages} from './pages.js';
import {documentWord,cleanDocument} from './documents.js';
import {imagePages,imageWord,cleanImage} from './images.js';
import {prepareOriginal} from './originals.js';
import {rasterWithFont} from '../shared/raster.js';
import {imageAndTextPDF} from '../shared/pdf.js';
import {activePairing,officeFonts} from '../shared/font-policy.js';
export async function prepareMaterial(doc){
  const key={documents:'document',images:'image',original:'original'}[doc.engine];
  if(!doc.payload||Object.keys(doc.payload).length!==1||!Object.hasOwn(doc.payload,key))throw Error('材料payload需仅包含对应的document、image或original');
  if(doc.engine==='documents')return {model:cleanDocument(doc.payload.document)};
  if(doc.engine==='images')return {model:cleanImage(doc.payload.image)};
  if(doc.engine==='original'){
    const prepared=await prepareOriginal(doc.payload.original);
    if(doc.formats.length!==1||doc.formats[0]!==prepared.input.file.format)throw Error('原件仅能按原格式交付，不进行格式转换');
    return prepared;
  }
  throw Error('材料类型无效');
}
export async function renderNewMaterial(doc,dependencies={}){
  const prepared=await prepareMaterial(doc),safe=doc.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,85)||'材料',base=`Reference/${doc.document_id}/r${doc.revision}/${safe}`;
  if(doc.engine==='original')return [{format:doc.formats[0],path:base+'.'+doc.formats[0],blob:prepared.blob,page_count:null,text_layer:'original-unverified',template_id:'original-identity-v1',template_version:'1.0.0',source_record:prepared.source,transformation:'identity',original_inspection:{...prepared.inspection,text:undefined}}];
  const files=[],isDoc=doc.engine==='documents',model=prepared.model,templateId=isDoc?model.template_id:model.kind,pairing=dependencies.pairing??activePairing(),fonts=officeFonts(pairing);
  if(doc.formats.includes('docx'))files.push({format:'docx',path:base+'.docx',blob:await (isDoc?documentWord(model,fonts,pairing):imageWord(model,fonts,pairing)),page_count:null,text_layer:'editable-document',template_id:templateId,template_version:'1.0.0'});
  if(doc.formats.some(f=>f!=='docx')){
    const pages=isDoc?documentPages(model):imagePages(model),pngs=[];
    const raster=dependencies.rasterize||(page=>rasterWithFont(page,{pairing}));
    if(doc.formats.some(f=>f==='png'||f==='pdf'))for(const page of pages)pngs.push(await raster(page));
    if(doc.formats.includes('pdf'))files.push({format:'pdf',path:base+'.pdf',blob:await imageAndTextPDF(pages,pngs,{searchable:doc.pdf_mode!=='image',pairing,...(isDoc?{dimensions:()=>[595.28,841.89]}:{}),...(dependencies.fontLoader?{fontLoader:dependencies.fontLoader}:{}),...(dependencies.Parser?{Parser:dependencies.Parser}:{})}),page_count:pages.length,text_layer:doc.pdf_mode==='image'?'none':'svg-text',template_id:templateId,template_version:'1.0.0'});
    for(const [i,p] of pages.entries())for(const format of doc.formats.filter(f=>f==='png'||f==='svg'))files.push({format,path:`${base}_p${i+1}.${format}`,blob:format==='svg'?new Blob([p.svg],{type:'image/svg+xml;charset=utf-8'}):new Blob([Uint8Array.from(atob(pngs[i].split(',')[1]),c=>c.charCodeAt(0))],{type:'image/png'}),page_count:1,text_layer:format==='svg'?'svg-text':'none',template_id:templateId,template_version:'1.0.0'});
  }
  return files;
}
export async function materialsRequest(engine,model){
  const {BATCH_SCHEMA,digest}=await import('../shared/batch.js');
  const id=engine+'-'+(await digest(model.id)).slice(0,20),key={documents:'document',images:'image',original:'original'}[engine];
  if(!key)throw Error('新材料引擎无效');
  return {schema_version:BATCH_SCHEMA,batch_id:id,name:model.title,documents:[{document_id:id,revision:1,title:model.title,engine,formats:engine==='original'?[model.file.format]:engine==='images'?['pdf','png','docx']:['docx','pdf'],pdf_mode:'searchable',payload:{[key]:structuredClone(model)}}]};
}
