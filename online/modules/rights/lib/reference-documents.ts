import {trademarkIvoryBackground,renewalBarcodePath,renewalBarcodeWidth} from './trademark-variants-art';
import type {RecordItem} from './registry';
import {trademarkBackground, patentRegisterBackground, trademarkBarcodePath, trademarkBarcodeWidth} from './reference-art';

const esc=(value:string)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,value:string,size=17,anchor='start',fill='#27271f')=>`<text x="${x}" y="${y}" font-family="Songti SC,SimSun,serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${esc(value)}</text>`;
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(0,4)}年${value.slice(5,7)}月${value.slice(8,10)}日`:value||'—';
function wrap(value:string,width:number,size:number){const rows:string[]=[];for(const paragraph of String(value??'').split('\n')){let row='',used=0;for(const ch of paragraph){const w=/[\u0020-\u007e]/.test(ch)?size*.56:size;if(row&&used+w>width){rows.push(row);row='';used=0;}row+=ch;used+=w;}rows.push(row);}return rows;}
const background=(uri:string)=>`<image width="794" height="1123" preserveAspectRatio="none" href="${uri}"/>`;
// Original sample seal, deliberately named as a sample rather than an issuing agency.
function seal(x:number,y:number,r=70){return `<g transform="translate(${x} ${y}) rotate(-9)" fill="#c3403b" stroke="#c3403b" opacity=".82"><circle r="${r}" fill="none" stroke-width="2.4"/><circle r="${r-5}" fill="none" stroke-width=".7"/>${text(0,-31,'合成测试样本',15,'middle','#c3403b')}${text(0,7,'★',34,'middle','#c3403b')}${text(0,36,'登记材料样本章',13,'middle','#c3403b')}</g>`;}
function finish(bodies:string[],pageNumberY=1073){return bodies.map((body,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">${body}${text(397,1080,'合成测试样本 · 不用于真实登记',11,'middle','#8c8275')}${text(725,pageNumberY,`${i+1} / ${bodies.length}`,11,'end','#8c8275')}</svg>`);}

export function trademarkCertificate(record:RecordItem):string[]{
 const f=record.fields, extra:[string,string][]=[];
 const value=(x:number,y:number,content:string,width:number,label:string,maxLines=2,size=17)=>{
  const rows=wrap(content,width,size);
  if(rows.length>maxLines){extra.push([label,content]);return text(x,y,`详见附页第${extra.length}项`,size);}
  return rows.map((row,i)=>text(x,y+i*23,row,size)).join('');
 };
 const ivory=f.certificatePaper==='米白色';
 let front=background(ivory?trademarkIvoryBackground:trademarkBackground);
 front+=`<g transform="translate(59 99) scale(${207/trademarkBarcodeWidth} 1)"><path d="${trademarkBarcodePath}" fill="#414436"/></g>`+text(163,136,'SYN-TRADEMARK',9,'middle');
 front+=value(545,113,`第 ${f.number} 号`,190,'商标注册号',2,15);
 front+=`<text x="402" y="306" font-family="Songti SC,SimSun,serif" font-size="34" text-anchor="middle" letter-spacing="9" fill="#202218">商标注册证</text>`;
 if(record.logo)front+=`<image x="227" y="345" width="340" height="192" preserveAspectRatio="xMidYMid meet" href="${esc(record.logo)}"/>`;
 else {let size=45;while(size>20&&wrap(f.title,425,size).length*size*1.35>170)size--;const rows=wrap(f.title,425,size);rows.forEach((row,i)=>front+=text(397,446-(rows.length-1)*size*.675+i*size*1.35,row,size,'middle','#1f241a'));}
 // Keep goods on the certificate face. A lengthy schedule continues on an appendix.
 front+=text(59,588,'核定使用商品／服务项目',20);
 front+=value(63,625,f.goods,666,'核定使用商品／服务项目',6,16);
 front+=text(59,806,'注 册 人',21)+value(175,806,f.owner,543,'注册人',2,17);
 front+=text(59,882,'注册地址',21)+value(175,882,f.address,543,'注册地址',2,17);
 front+=text(59,958,'注册有效期限',20)+text(204,958,`自 ${date(f.registerDate)} 起至 ${date(f.validTo)} 止`,14);
 front+=text(59,1014,'局长签章',20)+text(190,1014,'（样本署名）',26);
 front+=seal(646,1000,71)+text(62,1060,`发证日期：${date(f.issueDate)}`,12,'start','#747766');
 const bodies=[front];
 if(extra.length){let body='',y=0,part=0;const start=()=>{body=`<rect width="794" height="1123" fill="${ivory?'#f7f4eb':'#ffffe4'}"/><rect x="30" y="28" width="734" height="1070" fill="none" stroke="#6e7062" stroke-width="3"/>${text(397,117,'商标注册证附页',30,'middle')}${text(397,158,`第 ${++part} 张附页`,14,'middle')}`;y=221;};const next=()=>{bodies.push(body);start();};const write=(s:string,size=18)=>{for(const row of wrap(s,650,size)){if(y>1018)next();body+=text(72,y,row,size);y+=28;}};start();write(`商标注册号：${f.number}`,15);y+=20;extra.forEach(([label,content],i)=>{if(y>950)next();write(`${i+1}. ${label}`,20);y+=8;write(content);y+=28;});bodies.push(body);}
 return finish(bodies);
}

export function trademarkRenewal(record:RecordItem):string[]{
 const f=record.fields, extra:[string,string][]=[];
 const paper=()=>`<rect width="794" height="1123" fill="#f7f4ec"/><rect x="41" y="50" width="712" height="1021" fill="none" stroke="#2b6682" stroke-width="2.6"/><rect x="45" y="54" width="704" height="1013" fill="none" stroke="#59849a" stroke-width=".6"/>`;
 const block=(content:string,x:number,y:number,width:number,size:number,maxLines:number,label:string)=>{
  const rows=wrap(content,width,size);
  if(rows.length>maxLines){extra.push([label,content]);return text(x,y,`${label}：详见附页第${extra.length}项`,size);}
  return rows.map((row,i)=>text(x,y+i*size*1.55,row,size)).join('');
 };
 let front=paper();
 front+=`<g transform="translate(87 91) scale(${192/renewalBarcodeWidth} 1)"><path d="${renewalBarcodePath}" fill="#353832"/></g>`;
 front+=text(183,123,'SYN-RENEWAL · 样本码',9,'middle');
 front+=block(f.renewalNo,87,141,610,10,2,'证明编号');
 front+=text(397,183,'商标续展注册证明',30,'middle');
 front+=block(`兹核准第 ${f.number} 号商标${f.renewalClasses?.trim()||'（续展类别待填写）'}续展注册。`,97,263,594,20,3,'核准续展事项');
 front+=text(97,365,`续展注册有效期至　${date(f.renewalTo)}`,21);
 // Keep the reference's spacious middle. Optional notes continue on an appendix if needed.
 if(f.notes?.trim())front+=block(f.notes,97,430,594,16,6,'续展附注');
 front+=text(397,842,'发证机关',18)+seal(585,842,82);
 front+=block(`续展时注册人：${f.renewalOwner}`,97,954,594,13,2,'续展时注册人');
 front+=text(97,990,`续展有效期自：${date(f.renewalFrom)}　　核准日期：${date(f.renewalDate)}`,12);
 front+=text(97,1030,'注：本证明与《商标注册证》一并使用。',12,'start','#746f64');
 const bodies=[front];
 if(extra.length){
  let body='',y=0,part=0;
  const start=()=>{body=paper()+text(397,151,'商标续展注册证明附页',28,'middle')+text(397,188,`第 ${++part} 张附页`,13,'middle');y=244;};
  const next=()=>{bodies.push(body);start();};
  const write=(content:string,size=18)=>{for(const row of wrap(content,590,size)){if(y>1004)next();body+=text(97,y,row,size);y+=28;}};
  start();extra.forEach(([label,content],i)=>{if(y>940)next();write(`${i+1}. ${label}`,20);y+=8;write(content);y+=28;});bodies.push(body);
 }
 return finish(bodies,1053);
}

export function patentRegister(record:RecordItem):string[]{
 const f=record.fields, bodies:string[]=[];let body='',y=0,part=0;
 const start=()=>{part++;body=background(patentRegisterBackground);
  body+=`<text x="96" y="132" font-family="Songti SC,SimSun,serif" font-size="25" letter-spacing="7" fill="#24251e">国家知识产权局</text>`;
  body+=text(97,172,'NATIONAL INTELLECTUAL PROPERTY ADMINISTRATION, PRC',12.5)+`<line x1="96" y1="184" x2="552" y2="184" stroke="#676272" stroke-width="1.8"/>`;
  body+=text(397,275,'专利登记簿副本',37,'middle');y=322;
  if(part>1)body+=text(683,299,`续页 ${part-1}`,12,'end','#7e7b71');
 };
 const next=()=>{bodies.push(body);start();};
 const write=(s:string,size=16,x=116,width=568)=>{for(const row of wrap(s,width,size)){if(y>945)next();body+=text(x,y,row,size);y+=20;}};
 const pair=(label:string,content:string)=>{const rows=wrap(content||'—',420,16);if(y+Math.min(rows.length,3)*19>945)next();body+=text(116,y,`${label}：`,16);for(const row of rows){if(y>945){next();body+=text(116,y,`${label}（续）：`,14);}body+=text(270,y,row,16);y+=19;}};
 const section=(title:string)=>{if(y+70>945)next();write(title,18);y+=3;};
 start();
 const numRows=wrap(`专利号：${f.number}`,305,15), certRows=wrap(`证书号：${f.certificateNo||'—'}`,248,15);
 const rowCount=Math.max(numRows.length,certRows.length);
 if(rowCount<=3){numRows.forEach((row,i)=>body+=text(116,y+i*22,row,15));certRows.forEach((row,i)=>body+=text(447,y+i*22,row,15));y+=rowCount*22+15;}
 else{write(`专利号：${f.number}`,15);write(`证书号：${f.certificateNo||'—'}`,15);y+=21;}
 section('Ⅰ　著录项目');
 pair('发 明 名 称',f.title);pair('申　请　日',date(f.applicationDate));pair('公　开　日',date(f.publicationDate));pair('授　权　日',date(f.grantDate));pair('主 分 类 号',f.mainClassification);pair(f.patentType==='外观设计'?'设　计　人':'发　明　人',f.inventors);y+=10;
 pair('专利权人',f.currentOwner);pair('专利权人地址',f.currentAddress);pair('专利权人邮政编码',f.currentPostcode);write(`国籍或注册的国家或地区：${f.ownerCountry||'—'}`,15);y+=25;
 section('Ⅱ　法律状态');write(f.status||'未填写');y+=26;
 section('Ⅲ　其他登记事项');
 if(!record.events.length)write('其他登记事项未填写。');
 for(const event of [...record.events].sort((a,b)=>a.date.localeCompare(b.date))){
  if(y+75>945)next();write(`${event.action}　　${date(event.date)}`,17);if(event.number)write(`关联编号：${event.number}`,15);write(event.detail,15);y+=8;
 }
 if(f.notes){if(y+65>945)next();write('其他记载',17);write(f.notes,15);}
 const metadata=[...wrap(`副本编号：${f.queryNo}`,355,12),`出具日期：${date(f.queryDate)}`];
 if(metadata.length>6){y+=22;for(const row of metadata)write(row,12,116,355);}
 if(y>900)next();
 body+=seal(579,990,68);
 if(metadata.length<=6)metadata.forEach((row,i)=>body+=text(116,955+i*18,row,12));
 bodies.push(body);
 return finish(bodies);
}
