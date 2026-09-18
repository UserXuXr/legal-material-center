// Explicitly refresh the sibling React modules; the certificate editor is maintained in this site.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),sourceRoot=path.dirname(root);
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]);
const snapshot={};
for(const [id,folder]of [['finance','财务素材工作台'],['rights','权属登记素材工作台']]){
 const src=path.join(sourceRoot,folder),dst=path.join(root,'online/modules',id);
 for(const relative of ['app/page.tsx','app/globals.css','lib','components',...(id==='finance'?['app/background-panel.tsx']:[])])fs.cpSync(path.join(src,relative),path.join(dst,relative),{recursive:true});
 for(const f of walk(dst).filter(x=>/\.tsx?$/.test(x))){const text=fs.readFileSync(f,'utf8').replace(/(['"])@\/([^'"]+)\1/g,(_,q,p)=>{let r=path.relative(path.dirname(f),path.join(dst,p));if(!r.startsWith('.'))r='./'+r;return q+r+q});fs.writeFileSync(f,text)}
 fs.writeFileSync(path.join(dst,'components/material-center-link.tsx'),'export function MaterialCenterLink(){return <a className="material-center-link" href="/" target="_blank" rel="noopener noreferrer">← 素材中心</a>}\n');
 snapshot[id]=Object.fromEntries(walk(dst).map(f=>[path.relative(dst,f),createHash('sha256').update(fs.readFileSync(f)).digest('hex')]));
}
fs.writeFileSync(path.join(root,'snapshot.json'),JSON.stringify(snapshot,null,2));
console.log('Refreshed finance and rights snapshots; review changes before publishing.');
