import {cleanProject} from '../model.js';
export const SAVED_KEY='certpipe.online.saved.v1',DRAFT_KEY='certpipe.local.drafts.v1';
export const copy=value=>JSON.parse(JSON.stringify(value));
export function readSaved(storage,templates){
  const raw=JSON.parse(storage.getItem(SAVED_KEY)||'[]');
  if(!Array.isArray(raw))throw Error('方案列表无法读取，请导入备份文件');
  return raw.map(v=>({...cleanProject(v,templates),updated_at:v.updated_at||''}));
}
export function saveScheme(storage,project,templates,newId=()=>crypto.randomUUID().replaceAll('-','')){
  const p=cleanProject(project,templates);p.id ||=newId();p.updated_at=new Date().toISOString();
  const items=readSaved(storage,templates),at=items.findIndex(x=>x.id===p.id);
  if(at<0)items.unshift(p);else items[at]=p;
  try{storage.setItem(SAVED_KEY,JSON.stringify(items))}catch{throw Error('浏览器保存空间不足，请导出填写方案保存到文件')}
  return {project:p,items};
}
export function readDrafts(storage,templates){
  const data=JSON.parse(storage.getItem(DRAFT_KEY)||'{}'),drafts={};
  for(const t of templates)if(data.drafts?.[t.id]){try{drafts[t.id]=cleanProject(data.drafts[t.id],templates)}catch{/* Ignore one incompatible draft without blocking other templates. */}}
  return {active:data.active,drafts};
}
export function writeDrafts(storage,project,drafts){
  storage.setItem(DRAFT_KEY,JSON.stringify({active:project.template_id,drafts:{...drafts,[project.template_id]:project}}));
}
