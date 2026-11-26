import {cleanSettings,processPixels,random} from './model.js';
import {applyPageScan,sealPlacement} from '../shared/seal.js';
import {renderTexturedSeal} from '../shared/contract-perforation.js';
const make=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const sealLayer=spec=>renderTexturedSeal(spec);
export function simulateScan(source,raw,index=0,marks=[],seal=null,signature=null){
  const s=cleanSettings(raw),seed=(s.seed+Math.imul(index+1,2654435761))>>>0,rand=random(seed),w=source.width,h=source.height;
  if(w*h>16000000||w<1||h<1)throw Error('页面过大，请降低分辨率');
  const result=make(w,h),ctx=result.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  const angle=(rand()*2-1)*s.tilt*Math.PI/180;
  // Fit the transformed sheet inside the original page. No text is trimmed.
  let sheet=source;
  if(marks.some(m=>m.page===index)){
    sheet=make(w,h);const ink=sheet.getContext('2d');ink.drawImage(source,0,0);
    for(const mark of marks.filter(m=>m.page===index)){
      ink.fillStyle=ink.strokeStyle=mark.color;
      if(mark.kind==='text'){
        ink.save();ink.translate(mark.x*w,mark.y*h);ink.rotate(-.055);ink.font=`${mark.size*w}px "Kaiti SC",STKaiti,KaiTi,serif`;ink.textBaseline='top';
        const lines=mark.text.split('\n');lines.forEach((line,j)=>ink.fillText(line,0,j*mark.size*w*1.3));ink.restore();
      }else{ink.lineWidth=mark.width*w;ink.lineCap=ink.lineJoin='round';ink.beginPath();mark.points.forEach(([x,y],i)=>i?ink.lineTo(x*w,y*h):ink.moveTo(x*w,y*h));ink.stroke();}
    }
  }
  if(s.curve){
    const bent=make(w,h),bend=bent.getContext('2d'),depth=s.curve/100*h*.045;
    bend.fillStyle='#fff';bend.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=3){const width=Math.min(3,w-x),shift=Math.sin((x+width/2)/w*Math.PI)*depth;bend.drawImage(sheet,x,0,width,h,x,shift,width,h-depth);}
    sheet=bent;
  }
  if(s.perspective){
    const warped=make(w,h),warp=warped.getContext('2d'),reverse=rand()>.5;warp.fillStyle='#fff';warp.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=3){const sh=Math.min(3,h-y),ratio=1-s.perspective/100*(reverse?1-y/h:y/h);warp.drawImage(sheet,0,y,w,sh,w*(1-ratio)/2,y,w*ratio,sh);}
    sheet=warped;
  }
  const cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
  const fit=Math.min(w/(w*cos+h*sin),h/(h*cos+w*sin))*.998;
  ctx.save();ctx.translate(w/2,h/2);ctx.rotate(angle);ctx.scale(fit,fit);
  ctx.filter=`blur(${s.blur*s.dpi/150}px)`;ctx.drawImage(sheet,-w/2,-h/2);ctx.restore();ctx.filter='none';
  const pixels=ctx.getImageData(0,0,w,h);processPixels(pixels.data,s,seed);ctx.putImageData(pixels,0,0);
  if(s.shadow){
    const color=s.mode==='color'?'45,38,26':'38,38,38',side=rand()>.5,gradient=ctx.createLinearGradient(side?0:w,0,side?w:0,h*.25);
    gradient.addColorStop(0,`rgba(${color},${s.shadow/190})`);gradient.addColorStop(.14,`rgba(${color},${s.shadow/900})`);gradient.addColorStop(.65,`rgba(${color},0)`);
    ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
    const edge=ctx.createLinearGradient(0,h,0,h*.92);edge.addColorStop(0,`rgba(${color},${s.shadow/550})`);edge.addColorStop(1,`rgba(${color},0)`);ctx.fillStyle=edge;ctx.fillRect(0,0,w,h);
  }
  if(s.fold){
    const x=w*(.40+rand()*.20),g=ctx.createLinearGradient(x-w*.012,0,x+w*.012,0);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.43,`rgba(${s.mode==='color'?'80,65,40':'65,65,65'},${s.fold/450})`);g.addColorStop(.52,`rgba(255,255,255,${s.fold/180})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    const y=h*.51,cross=ctx.createLinearGradient(0,y-h*.008,0,y+h*.008);cross.addColorStop(0,'transparent');cross.addColorStop(.45,`rgba(65,65,65,${s.fold/700})`);cross.addColorStop(.55,`rgba(255,255,255,${s.fold/250})`);cross.addColorStop(1,'transparent');ctx.fillStyle=cross;ctx.fillRect(0,0,w,h);
  }
  if(s.watermark){ctx.fillStyle=s.mode==='color'?'rgba(60,55,45,.40)':'rgba(55,55,55,.40)';ctx.font=`${Math.max(9,w*.008)}px sans-serif`;ctx.textAlign='right';ctx.fillText('合成扫描',w-w*.02,h-h*.012);}
  if(seal?.enabled&&typeof document!=='undefined'){
    const stamp=sealLayer(seal);
    const box=sealPlacement(w,h,stamp.width,stamp.height,seal,index);
    ctx.save();ctx.globalAlpha=box.opacity;
    ctx.drawImage(stamp,box.sx,0,box.sw,stamp.height,box.x,box.y,box.dw,box.dh);
    ctx.restore();
  }
  if(signature?.enabled&&typeof document!=='undefined'){
    ctx.save();ctx.fillStyle='#202226';ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.font=`${Math.max(28,w*.045)}px "${signature.font}",sans-serif`;
    ctx.fillText(signature.name,(signature.x??.68)*w,(signature.y??.84)*h);ctx.restore();
  }
  if(seal?.enabled&&seal.texture==='scan'){
    const image=ctx.getImageData(0,0,w,h);
    ctx.putImageData(new ImageData(applyPageScan(image.data,w,h),w,h),0,0);
  }
  return result;
}
export const canvasBlob=(canvas,type='image/png',quality=.88)=>new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('扫描图像导出失败')),type,quality));
