import type {RecordItem} from './registry';
import {softwareBackground,softwareBarcodePath,softwareBarcodeWidth} from './software-art';

const esc=(value:string)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,value:string,size=18,anchor='start',fill='#414941')=>`<text x="${x}" y="${y}" font-family="Songti SC,SimSun,serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${esc(value)}</text>`;
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(0,4)}年${value.slice(5,7)}月${value.slice(8,10)}日`:value||'—';
function wrap(value:string,width:number,size:number){const rows:string[]=[];for(const paragraph of String(value??'').split('\n')){let row='',used=0;for(const ch of paragraph){const w=/[\u0020-\u007e]/.test(ch)?size*.56:size;if(row&&used+w>width){rows.push(row);row='';used=0;}row+=ch;used+=w;}rows.push(row);}return rows;}
const paper=()=>`<image width="794" height="1123" preserveAspectRatio="none" href="${softwareBackground}"/>`;

export function softwareCertificate(record:RecordItem):string[]{
 const f=record.fields,extra:[string,string][]=[];
 const field=(x:number,y:number,content:string,width:number,label:string,maxLines=2,size=18)=>{
  const rows=wrap(content,width,size);
  if(rows.length>maxLines){extra.push([label,content]);return text(x,y,`详见附页第${extra.length}项`,size);}
  return rows.map((row,i)=>text(x,y+i*24,row,size)).join('');
 };
 let body=paper();
 body+=text(397,155,'中华人民共和国国家版权局',29,'middle','#242e29');
 body+=`<text x="397" y="211" font-family="Songti SC,SimSun,serif" font-size="34" font-weight="600" text-anchor="middle" letter-spacing="1.8" fill="#24322f">计算机软件著作权登记证书</text>`;
 body+=field(436,249,`证书号：${f.certificateNo}`,250,'证书号',2,12);
 body+=text(97,293,'软 件 名 称：',19)+field(239,293,`${f.title}\n${f.version}${f.shortName?`\n[简称：${f.shortName}]`:''}`,447,'软件名称／版本／简称',3);
 body+=text(97,381,'著 作 权 人：',19)+field(239,381,f.owner,447,'著作权人',2);
 const rows:[string,string][]=[['开发完成日期',date(f.completedDate)],['首次发表日期',f.publication==='未发表'?'未发表':date(f.publishedDate)],['开发方式',f.development],['权利取得方式',f.acquisition],['权 利 范 围',f.scope],['登　记　号',f.number]];
 rows.forEach(([label,value],i)=>{body+=text(97,447+i*43,`${label}：`,18)+field(239,447+i*43,value,447,label,1);});
 const statement='　　根据《计算机软件保护条例》和《计算机软件著作权登记办法》的规定，经中国版权保护中心审核，对以上事项予以登记。';
 wrap(statement,587,17).forEach((row,i)=>body+=text(97,720+i*29,row,17));
 body+=`<g transform="translate(147 795) scale(${146/softwareBarcodeWidth} 1)"><path d="${softwareBarcodePath}" fill="#535b56"/></g>`+text(147,840,'SYN-SOFTWARE · 样本条码',10,'start','#778b82');
 body+=`<g transform="translate(551 892) rotate(-8)" opacity=".83"><circle r="80" stroke="#be4870" stroke-width="2.2" fill="none"/><circle r="75" stroke="#be4870" stroke-width=".7" fill="none"/>${text(0,-37,'合成测试样本',17,'middle','#be4870')}${text(0,6,'★',40,'middle','#be4870')}${text(0,33,'软件著作权登记',14,'middle','#be4870')}${text(0,53,'样 本 章',14,'middle','#be4870')}</g>`;
 body+=field(134,959,`No. ${f.serialNo||'—'}`,295,'证书流水号',2,16);
 body+=text(551,989,date(f.issueDate),17,'middle');
 const pages=[body];
 if(extra.length){let page='',y=0,part=0;
  const start=()=>{page=paper()+text(397,166,'软件著作权登记证书附页',29,'middle')+text(397,209,`第 ${++part} 张附页`,14,'middle');y=282;};
  const next=()=>{pages.push(page);start();};
  const write=(value:string,size=18)=>{for(const row of wrap(value,587,size)){if(y>1000)next();page+=text(98,y,row,size);y+=27;}};
  start();write(`登记号：${f.number}`,15);y+=24;
  extra.forEach(([label,value],i)=>{if(y>925)next();write(`${i+1}. ${label}`,20);y+=8;write(value);y+=27;});pages.push(page);
 }
 return pages.map((content,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">${content}${text(365,1028,'合成测试样本 · 不用于真实登记',11,'middle','#78928b')}${text(547,1028,`${i+1} / ${pages.length}`,11,'end','#78928b')}</svg>`);
}
