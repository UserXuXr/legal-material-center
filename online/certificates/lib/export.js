const FONT_URL=new URL('../../public/fonts/NotoSansSC-Regular.ttf',import.meta.url).href;
const bytes64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s)};
export const safeName=s=>s.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,85)||'证照样本';
export function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);}
export function saveProject(project){download(new Blob([JSON.stringify(project,null,2)],{type:'application/json;charset=utf-8'}),safeName(project.name)+'_填写方案.json');}
export async function pngData(page){
  const url=URL.createObjectURL(new Blob([page.svg],{type:'image/svg+xml;charset=utf-8'}));
  try{
    const img=new Image();await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{img.onload=null;img.onerror=null;reject(Error('图片生成超时，请重试或下载 SVG'))},15000);
      img.onload=()=>{clearTimeout(timer);resolve()};img.onerror=()=>{clearTimeout(timer);reject(Error('图片生成失败，请重试或下载 SVG'))};img.src=url;
    });
    const canvas=document.createElement('canvas');canvas.width=Math.round(page.width*200/72);canvas.height=Math.round(page.height*200/72);
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前浏览器无法生成图片，请下载 SVG');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');
  }finally{URL.revokeObjectURL(url);}
}
let fontPromise;
export async function loadFont(fetcher=fetch){
  if(!fontPromise)fontPromise=(async()=>{
    const r=await fetcher(FONT_URL,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('字体文件暂时无法读取');
    const bytes=new Uint8Array(await r.arrayBuffer());if(bytes.length<1000||bytes[0]!==0||bytes[1]!==1)throw Error('字体文件格式不正确');return bytes64(bytes);
  })().catch(()=>{fontPromise=null;throw Error('可检索 PDF 字体未能加载，请重试；也可选择图像 PDF、PNG 或 SVG。')});
  return fontPromise;
}
export async function pdfFile(page,png,searchable=false,fontLoader=loadFont){
  const {createPDF}=await import('../pdf.js');
  return new Blob([createPDF(page.template,page.layout,searchable?page.background:png,searchable?await fontLoader():'',searchable)],{type:'application/pdf'});
}
export async function exportCertificate(page,format,{rasterize=pngData,fontLoader=loadFont,onProgress=(_label)=>{}}={}){
  if(format==='svg')return new Blob([page.svg],{type:'image/svg+xml;charset=utf-8'});
  if(!['png','pdf','zip'].includes(format))throw Error('不支持的导出格式');
  onProgress('正在生成图片');const png=await rasterize(page);
  const bytes=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));
  if(format==='png')return new Blob([bytes],{type:'image/png'});
  onProgress('正在生成 PDF');const pdf=await pdfFile(page,png,page.project.capture==='native',fontLoader);
  if(format==='pdf')return pdf;
  onProgress('正在打包素材');const {default:JSZip}=await import('jszip'),zip=new JSZip();
  zip.file('证照样本.pdf',await pdf.arrayBuffer());zip.file('证照样本.png',bytes);zip.file('证照样本.svg',page.svg);
  zip.file('填写方案.json',JSON.stringify(page.project,null,2));
  zip.file('素材索引.json',JSON.stringify({synthetic:true,template:page.template.id,revision:page.template.revision,template_hash:page.template.template_hash,created_at:new Date().toISOString(),warnings:page.warnings},null,2));
  zip.file('说明.txt','合成测试样本，非真实证照。\n填写方案可导入本工作台或旧版证照工作台。\nSVG 保留文字，PNG 与图像 PDF 使用同一版面；可检索 PDF 的固定底图为图片、填写字段为文本。\n');
  return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}});
}
