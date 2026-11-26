import { documentTemplates } from './catalog.js';
import {wordBytes} from '../shared/word.js';
export const DOCUMENT_SCHEMA='legal-document/1';
export function text(value,label,max=30000){
  if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error(`${label}需为不超过${max}字的文本`);
  return value;
}
export function cleanDocument(input){
  const t=documentTemplates.find(t=>t.id===input?.template_id);
  if(input?.schema_version!==DOCUMENT_SCHEMA||!t)throw Error('文书类型或版本无效');
  if(Object.keys(input).some(k=>!['schema_version','id','template_id','title','fields','sections'].includes(k)))throw Error('文书含不支持字段');
  const d={schema_version:DOCUMENT_SCHEMA,id:text(input.id,'文档编号',100),template_id:t.id,title:text(input.title,'标题',150),fields:{},sections:[]};
  if(!d.id||!d.title.trim())throw Error('请填写文档编号和标题');
  if(!input.fields||typeof input.fields!=='object'||Array.isArray(input.fields)||Object.keys(input.fields).some(k=>!t.fields.some(f=>f.key===k)))throw Error('文书字段不属于当前模板');
  for(const f of t.fields)d.fields[f.key]=text(input.fields[f.key]??'',f.label,5000);
  if(!Array.isArray(input.sections)||!input.sections.length||input.sections.length>150)throw Error('文书需包含1至150节正文');
  d.sections=input.sections.map(s=>{
    if(!s||Object.keys(s).some(k=>!['heading','body'].includes(k)))throw Error('正文章节结构无效');
    return {heading:text(s.heading,'章节标题',200),body:text(s.body,'章节正文')};
  });
  if(!d.sections.some(s=>s.body.trim()))throw Error('请填写文书正文');
  if(JSON.stringify(d).length>1000000)throw Error('文书超过1MB，请拆分');
  return d;
}
export function exampleDocument(template_id=documentTemplates[0].id){
  const t=documentTemplates.find(t=>t.id===template_id);if(!t)throw Error('未找到文书模板');
  return {schema_version:DOCUMENT_SCHEMA,id:'example-'+t.id,template_id:t.id,title:t.title,fields:Object.fromEntries(t.fields.map(f=>[f.key,f.example])),sections:structuredClone(t.sections)};
}
export function documentBlocks(input){
  const d=cleanDocument(input),t=documentTemplates.find(t=>t.id===d.template_id);
  const memoFields=t.id==='legal-research-memo'?Object.fromEntries(t.fields.flatMap(f=>[[f.key,d.fields[f.key]],[f.label,d.fields[f.key]]])):null;
  const resolve=value=>memoFields?value.replace(/\{\{\s*([^{}\n]+?)\s*\}\}/gu,(token,key)=>memoFields[key.trim()]?.trim()||token):value;
  return [...t.fields.map(f=>({type:'paragraph',text:f.label+'：'+(d.fields[f.key]||'未载明')})),...d.sections.flatMap(s=>[...(s.heading?[{type:'heading',text:resolve(s.heading)}]:[]),{type:'paragraph',text:resolve(s.body)}])];
}
export async function documentWord(input,fonts=null,pairing=null){const d=cleanDocument(input);const blocks=documentBlocks(d);const {assertCovered}=await import('../shared/font-policy.js');await assertCovered([d.title,...blocks.map(block=>block.text||'')].join('\n'),pairing);return new Blob([await wordBytes({title:d.title,blocks,fonts})],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});}
