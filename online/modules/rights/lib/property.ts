import type {RecordItem} from './registry';
import {propertyIssueBackground,propertyInfoBackground,propertyBarcodePath,propertyBarcodeWidth} from './property-art';

const esc=(value:string)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,value:string,size=20,anchor='start',fill='#36362c')=>`<text x="${x}" y="${y}" font-family="Songti SC,SimSun,serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${esc(value)}</text>`;
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(0,4)}年${value.slice(5,7)}月${value.slice(8,10)}日`:value||'—';
function wrap(value:string,width:number,size:number){const rows:string[]=[];for(const paragraph of String(value??'').split('\n')){let row='',used=0;for(const ch of paragraph){const w=/[\u0020-\u007e]/.test(ch)?size*.56:size;if(row&&used+w>width){rows.push(row);row='';used=0;}row+=ch;used+=w;}rows.push(row);}return rows;}
const paper=(uri:string)=>`<image width="794" height="1123" preserveAspectRatio="none" href="${uri}"/>`;
const rect=(x:number,y:number,w:number,h:number)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#716b5b" stroke-width="1"/>`;

export function propertyCertificate(record:RecordItem):string[]{
 const f=record.fields,extra:[string,string][]=[];
 const field=(x:number,y:number,value:string,width:number,label:string,maxLines=2,size=20,anchor='start')=>{
  const rows=wrap(value||'—',width,size);
  if(rows.length>maxLines){extra.push([label,value]);return text(x,y,`详见附页第${extra.length}项`,size,anchor);}
  return rows.map((row,i)=>text(x,y+i*(size+8),row,size,anchor)).join('');
 };
 let issue=paper(propertyIssueBackground);
 issue+=`<g transform="translate(382 155) scale(${219/propertyBarcodeWidth} 1)"><path d="${propertyBarcodePath}" fill="#514b42"/></g>`+text(491,212,'SYN-PROPERTY · 样本条码',11,'middle','#8b8171');
 const statement=[
  '根据《中华人民共和国民法典》等法律',
  '法规，为保护不动产权利人合法权益，对',
  '不动产权利人申请登记的本证所列不动产',
  '权利，经审查核实，准予登记，颁发此证。',
 ];
 statement.forEach((row,i)=>issue+=text(i===0?177:125,294+i*60,row,25));
 issue+=`<g transform="translate(445 785) rotate(-10)" opacity=".82"><circle r="98" fill="none" stroke="#ad3934" stroke-width="3"/><circle r="92" fill="none" stroke="#ad3934" stroke-width=".8"/>${text(0,-45,'合成测试样本',22,'middle','#ad3934')}${text(0,9,'★',52,'middle','#ad3934')}${text(0,47,'不动产登记样本章',17,'middle','#ad3934')}${text(0,71,'（样本）',16,'middle','#ad3934')}</g>`;
 issue+=text(579,758,'登记机构（章）',25,'middle');
 issue+=text(579,811,date(f.issueDate),21,'middle');
 issue+=field(568,913,f.issuer,275,'登记机构',2,16,'middle');
 issue+=text(397,991,'中华人民共和国自然资源部监制',24,'middle');
 issue+=field(397,1042,`编号 No. ${f.serialNo||'—'}`,545,'证书印制编号',1,21,'middle');

 let info=paper(propertyInfoBackground);
 info+=field(397,53,f.number,660,'不动产权证号',1,24,'middle');
 const entries:[string,string][]=[['权 利 人',f.owner],['共有情况',f.coownership],['坐　落',f.location],['不动产单元号',f.unitNo],['权利类型',f.rightType],['权利性质',f.nature],['用　途',f.use],['面　积',`宗地面积：${f.landArea}平方米\n建筑面积：${f.buildingArea}平方米`],['使用期限',`${date(f.validFrom)}起 ${date(f.validTo)}止`]];
 const top=87,rowHeight=65,x=56,labelWidth=125,right=726;
 entries.forEach(([label,value],i)=>{const y=top+i*rowHeight;info+=rect(x,y,right-x,rowHeight)+`<line x1="${x+labelWidth}" y1="${y}" x2="${x+labelWidth}" y2="${y+rowHeight}" stroke="#716b5b"/>`;info+=text(x+labelWidth/2,y+39,label,label==='不动产单元号'?18:22,'middle');const size=i===7||i===8?18:20;const rows=wrap(value,466,size);info+=field(236,y+(rows.length>1?25:39),value,466,label,2,size);});
 const otherY=top+entries.length*rowHeight,otherH=398;
 info+=rect(x,otherY,right-x,otherH)+`<line x1="${x+labelWidth}" y1="${otherY}" x2="${x+labelWidth}" y2="${otherY+otherH}" stroke="#716b5b"/>`;
 [...'权利其他状况'].forEach((ch,i)=>info+=text(x+labelWidth/2,otherY+139+i*27,ch,23,'middle'));
 info+=`<g transform="translate(406 823) rotate(-8)" opacity=".12"><circle r="83" stroke="#ad3934" stroke-width="2.5" fill="none"/>${text(0,-30,'合成测试样本',18,'middle','#ad3934')}${text(0,9,'★',43,'middle','#ad3934')}${text(0,43,'不动产登记样本章',15,'middle','#ad3934')}</g>`;
 const other=[f.other||'—',f.notes?`\n附记：${f.notes}`:''].filter(Boolean).join('\n');
 info+=field(236,otherY+36,other,466,'权利其他状况及附记',12,19);
 const pages=[issue,info];
 // The two main pages always stay in order. Overflow is retained on named appendices.
 if(extra.length){let body='',y=0,part=0;const start=()=>{body=paper(propertyInfoBackground)+text(397,101,'不动产权证书附页',30,'middle')+text(397,144,`第 ${++part} 张附页`,15,'middle');y=210;};const next=()=>{pages.push(body);start();};const write=(s:string,size=19)=>{for(const row of wrap(s,624,size)){if(y>1030)next();body+=text(85,y,row,size);y+=29;}};start();write(`不动产权证号：${f.number}`,16);y+=25;extra.forEach(([label,value],i)=>{if(y>955)next();write(`${i+1}. ${label}`,21);y+=8;write(value);y+=25;});pages.push(body);}
 return pages.map((body,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">${body}${text(397,1110,'合成测试样本 · 不用于真实登记',11,'middle','#8b7967')}${text(710,1110,`${i+1} / ${pages.length}`,11,'end','#8b7967')}</svg>`);
}
