// Local shortcut for the same React editor served by the online material center.
import {spawn} from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),origin='http://127.0.0.1:3016',url=origin+'/certificates/';
async function healthy(){try{const r=await fetch(origin+'/material-center.json',{signal:AbortSignal.timeout(1000)});return r.ok&&(await r.json()).workbench==='certificates-browser'}catch{return false}}
if(await healthy()){spawn('open',[url],{stdio:'ignore',detached:true}).unref();process.exit(0)}
const child=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','3016','--strictPort'],{cwd:root,stdio:'inherit'});
let exited=false;child.on('exit',code=>{exited=true;process.exitCode=code??1});
for(let i=0;i<40&&!exited;i++){await new Promise(r=>setTimeout(r,250));if(await healthy()){spawn('open',[url],{stdio:'ignore',detached:true}).unref();break}}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
