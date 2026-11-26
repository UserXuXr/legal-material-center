import {digest,BATCH_SCHEMA} from '../shared/batch.js';
import {SEAL_KINDS,SEAL_TEXTURES,cleanSealText} from '../shared/seal.js';
import {prepareSealAsset} from './seal-asset.js';
import {HAND_FONTS,loadHandFont,missingGlyphs} from '../shared/font-policy.js';
import {originalFromFile,prepareOriginal} from '../materials/originals.js';

export const SCAN_SCHEMA='scan-document/1';
export const presets=[
  {id:'flatbed',name:'平整扫描',description:'浅纸色、轻微颗粒与边缘阴影',settings:{mode:'color',paper:8,noise:6,shadow:12,tilt:.35,blur:.25,contrast:6,fold:0,perspective:0}},
  {id:'copier',name:'黑白复印',description:'灰度、较深文字与复印机颗粒',settings:{mode:'gray',paper:2,noise:15,shadow:7,tilt:.6,blur:.45,contrast:20,fold:0,perspective:0}},
  {id:'phone',name:'手机拍纸',description:'轻微透视、环境阴影与纸张折痕',settings:{mode:'color',paper:14,noise:7,shadow:35,tilt:1,blur:.3,contrast:4,fold:18,perspective:3}},
  {id:'archive',name:'存档旧纸',description:'暖纸色、淡折痕与边缘暗化',settings:{mode:'color',paper:40,noise:12,shadow:23,tilt:.7,blur:.4,contrast:10,fold:30,perspective:0}},
];
export const defaults={...presets[0].settings,curve:0,inkWear:0,dpi:150,quality:88,seed:42,watermark:true};
export function cleanSettings(raw={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!Object.hasOwn(defaults,k)))throw Error('扫描参数含不支持字段');
  const s={...defaults,...raw};
  const ranges={paper:[0,70],noise:[0,40],shadow:[0,60],tilt:[0,3],blur:[0,1.5],contrast:[-15,35],fold:[0,60],perspective:[0,6],curve:[0,60],inkWear:[0,40],quality:[50,100],seed:[0,4294967295]};
  for(const [key,[lo,hi]] of Object.entries(ranges))if(typeof s[key]!=='number'||!Number.isFinite(s[key])||s[key]<lo||s[key]>hi)throw Error(`${key}超出允许范围`);
  if(!Number.isInteger(s.seed)||![100,150,200].includes(s.dpi)||!['color','gray','bw'].includes(s.mode)||typeof s.watermark!=='boolean')throw Error('扫描分辨率、色彩、种子或标记设置无效');
  return s;
}
export async function scanFromFile(file){
  if(!/\.(pdf|docx|png|jpe?g)$/i.test(file.name))throw Error('请导入PDF、DOCX、PNG或JPG；旧版DOC请先另存为DOCX或PDF');
  const source=await originalFromFile(file);
  return {schema_version:SCAN_SCHEMA,id:crypto.randomUUID(),title:source.title.slice(0,145)+'_扫描件',source,settings:{...defaults},marks:[]};
}
export async function prepareScan(doc){
  const model=doc.payload?.scan;
  if(!model||model.schema_version!==SCAN_SCHEMA||Object.keys(model).some(k=>!['schema_version','id','title','source','settings','marks','seal','signature'].includes(k)))throw Error('扫描方案版本或结构无效');
  if(typeof model.id!=='string'||!model.id||model.id.length>100||typeof model.title!=='string'||!model.title.trim()||model.title.length>150)throw Error('请填写扫描件编号与标题');
  if(!Array.isArray(doc.formats)||!doc.formats.length||new Set(doc.formats).size!==doc.formats.length||doc.formats.some(f=>!['pdf','png','jpg'].includes(f)))throw Error('扫描件支持PDF、PNG和JPG');
  if(doc.pdf_mode==='searchable')throw Error('扫描PDF为图像版，不保留隐藏文字层');
  const settings=cleanSettings(model.settings),marks=cleanMarks(model.marks||[]),seal=cleanSeal(model.seal),signature=cleanSignature(model.signature),prepared=await prepareOriginal(model.source);
  if(seal?.source==='png')await prepareSealAsset(seal);
  if(signature.enabled){const missing=missingGlyphs(await loadHandFont(signature.font),signature.name);if(missing.length)throw Error(`这款手写字体没有这些字，已停止，不会把缺字当成已签名：${missing.join('')}`);}
  if(!['pdf','docx','png','jpg','jpeg'].includes(model.source.file.format))throw Error('扫描来源格式不支持');
  if(prepared.inspection.tracked_insertions||prepared.inspection.tracked_deletions)throw Error('Word含未处理修订，请先在Word确认修订显示并导出PDF');
  return {model:{...structuredClone(model),settings,marks,seal,signature},blob:prepared.blob};
}
export function cleanMarks(marks){
  if(!Array.isArray(marks)||marks.length>80)throw Error('每份文档最多80条批注');
  const unit=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1;
  for(const mark of marks){
    if(!mark||!['stroke','text'].includes(mark.kind)||!Number.isInteger(mark.page)||mark.page<0||mark.page>=30||!['#23477b','#202020','#9f3535'].includes(mark.color))throw Error('批注类型、页码或颜色无效');
    if(mark.kind==='stroke'&&(!Array.isArray(mark.points)||mark.points.length<2||mark.points.length>2000||mark.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!unit(n)))||!Number.isFinite(mark.width)||mark.width<.0005||mark.width>.01))throw Error('画线坐标或宽度无效');
    if(mark.kind==='text'&&(!unit(mark.x)||!unit(mark.y)||typeof mark.text!=='string'||!mark.text.trim()||mark.text.length>80||!Number.isFinite(mark.size)||mark.size<.01||mark.size>.08))throw Error('文字批注位置、字号或内容无效');
  }
  return structuredClone(marks);
}
export async function scanRequest(model,{formats=['pdf'],batch_id}={}){
  const id='scan-'+(await digest(model.id)).slice(0,20);
  const doc={document_id:id,revision:1,title:model.title,engine:'scans',formats,pdf_mode:'image',payload:{scan:structuredClone(model)}};
  await prepareScan(doc);
  return {schema_version:BATCH_SCHEMA,batch_id:batch_id||id,name:model.title,documents:[doc]};
}
function ranged(value,fallback,lo,hi,label){
  const n=value==null||value===''?fallback:Number(value);
  if(!Number.isFinite(n)||n<lo||n>hi)throw Error(`${label}超出允许范围`);
  return n;
}
export function cleanSeal(seal){
  if(seal==null)return null;
  if(!seal||typeof seal!=='object'||seal.enabled!==true)return {enabled:false};
  if(!SEAL_KINDS.some(item=>item.id===seal.kind)||!SEAL_TEXTURES.some(item=>item.id===seal.texture))throw Error('章型或质感无效');
  if(seal.mode&&!['stamp','perforation'].includes(seal.mode))throw Error('盖印方式无效');
  const source=seal.source==='png'?'png':'generated';
  const oval=seal.kind==='oval_contract';
  const arc={
    topStart:ranged(seal.topStart??seal.topSpan?.[0],-200,-360,360,'上弧起点'),
    topEnd:ranged(seal.topEnd??seal.topSpan?.[1],20,-360,360,'上弧终点'),
    bottomStart:ranged(seal.bottomStart??seal.bottomSpan?.[0],130,-360,360,'下弧起点'),
    bottomEnd:ranged(seal.bottomEnd??seal.bottomSpan?.[1],50,-360,360,'下弧终点'),
    topTracking:ranged(seal.topTracking,1.06,.6,2.2,'上弧字距'),
    bottomTracking:ranged(seal.bottomTracking,1.08,.6,2.2,'下弧字距'),
    topInset:ranged(seal.topInset,28,6,110,'上弧半径'),
    bottomInset:ranged(seal.bottomInset,oval?48:34,6,130,'下弧半径'),
  };
  const company=String(seal.company||'苍澜示意科技有限公司');
  const next={enabled:true,kind:seal.kind,texture:seal.texture,mode:seal.mode||'stamp',source,company:cleanSealText(company,'章面主体'),person:seal.person?cleanSealText(seal.person,'姓名'):'沈予安',edge:seal.edge==='left'?'left':'right',xRatio:ranged(seal.xRatio,.72,0,1,'横向位置'),yRatio:ranged(seal.yRatio,.55,0,1,'纵向位置'),scale:ranged(seal.scale,.2,.08,.46,'章的大小'),opacity:ranged(seal.opacity,.92,.15,1,'透明度'),...arc,topSpan:[arc.topStart,arc.topEnd],bottomSpan:[arc.bottomStart,arc.bottomEnd]};
  if(source==='png'){
    if(seal.authorized!==true)throw Error('上传章图前需确认已获授权。未授权的图片不会盖上。');
    const png=String(seal.png||'').replace(/\s/g,'');
    if(png.length<32||png.length>900000||!/^[A-Za-z0-9+/=]+$/.test(png))throw Error('授权章图无效、损坏或过大。请上传不超过约600KB的8位PNG。');
    next.authorized=true;next.png=png;
  }
  return next;
}
export function cleanSignature(signature){
  if(signature==null||signature.enabled!==true)return {enabled:false};
  if(!HAND_FONTS.some(font=>font.id===signature.font))throw Error('手写字体无效');
  const name=String(signature.name||'').trim();
  if(!name||[...name].length>12)throw Error('模拟签名姓名需为1至12字。字体排出的姓名不是连续的真实签名。');
  return {enabled:true,font:signature.font,name,x:signature.x??.7,y:signature.y??.82};
}
export function random(seed){let state=seed>>>0;return ()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);}

// Pure pixel stage: fixed seed, grain, paper tint and color mode.
export function processPixels(rgba,settings,seed){
  const s=cleanSettings(settings),rand=random(seed),factor=(259*(s.contrast+255))/(255*(259-s.contrast));
  for(let i=0;i<rgba.length;i+=4){
    const grain=(rand()+rand()+rand()-1.5)*s.noise*.85;
    let r=factor*(rgba[i]-128)+128,g=factor*(rgba[i+1]-128)+128,b=factor*(rgba[i+2]-128)+128;
    if(s.mode!=='color')r=g=b=.2126*r+.7152*g+.0722*b;
    if(s.mode==='bw')r=g=b=r>162?255:20;
    const light=Math.max(0,Math.min(1,(r+g+b)/765));
    if(s.inkWear){const wear=(1-light)*(s.inkWear*.8+rand()*s.inkWear*.5);r+=wear;g+=wear;b+=wear;}
    rgba[i]=Math.max(0,Math.min(255,r+grain-s.paper*.10*light));
    rgba[i+1]=Math.max(0,Math.min(255,g+grain-s.paper*.20*light));
    rgba[i+2]=Math.max(0,Math.min(255,b+grain-s.paper*.46*light));
    if(s.mode!=='color'){const y=Math.round(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2]);rgba[i]=rgba[i+1]=rgba[i+2]=y;}
    rgba[i+3]=255;
  }
  return rgba;
}
