import type {RecordItem} from './registry';
import {vehicleBackground} from './vehicle-art';
const esc=(value:string)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,value:string,size=20,anchor='start',bold=false)=>`<text x="${x}" y="${y}" font-family="Songti SC,SimSun,serif" font-size="${size}" text-anchor="${anchor}" font-weight="${bold?600:400}" fill="#353735">${esc(value)}</text>`;
function wrap(value:string,width:number,size=20){const rows:string[]=[];for(const paragraph of String(value??'').split('\n')){let row='',used=0;for(const ch of paragraph){const w=/[\u0020-\u007e]/.test(ch)?size*.56:size;if(row&&used+w>width){rows.push(row);row='';used=0;}row+=ch;used+=w;}rows.push(row);}return rows;}

export function vehicleRegister(record:RecordItem):string[]{
 const pages:string[]=[];let body='',y=0,lineNumber=Number(record.fields.startLine||1),part=0;
 const start=()=>{part++;body=`<image width="1123" height="794" href="${vehicleBackground}" preserveAspectRatio="none"/>`+text(1084,37,`机动车登记证书编号：${record.fields.number}`,16,'end')+text(561,79,'登　记　栏',29,'middle');body+=`<rect x="31" y="99" width="1061" height="611" stroke="#686c69" stroke-width="1.7" fill="none"/>`;y=100;if(part>1)body+=text(51,82,`续页 ${part-1}`,13);};
 const rule=(at:number)=>`<line x1="32" y1="${at}" x2="1091" y2="${at}" stroke="#747874" stroke-width=".9" stroke-dasharray="3 3"/>`;
 const next=()=>{while(y<707){body+=rule(Math.min(y+47,710));y+=47;}pages.push(body);start();};
 const row=(value:string,heading=false)=>{const rows=wrap(value,950,heading?22:20);for(const line of rows){if(y+47>711)next();body+=text(46,y+31,`${lineNumber++}.`,16);body+=text(heading?562:104,y+31,line,heading?22:20,heading?'middle':'start',true);body+=rule(y+47);y+=47;}};
 start();
 for(const event of [...record.events].sort((a,b)=>a.date.localeCompare(b.date))){
  const expected=(event.action==='解除抵押'?2:4)*47;if(y+expected>711&&y>100)next();
  row(event.action,true);
  if(event.action==='抵押登记'){
   row(`抵押权人姓名／名称：${event.detail}`);
   row(`身份证明名称／号码：${event.number}`);
   row(`抵押登记日期：${event.date}`);
  }else{
   row(`解除抵押日期：${event.date}`);
   if(event.detail)row(`登记记载：${event.detail}`);
  }
 }
 if(record.fields.notes){row('其他记载',true);row(record.fields.notes);}
 while(y+47<=711)row('');pages.push(body);
 return pages.map((content,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794">${content}${text(562,754,'合成测试样本 · 不用于真实登记',12,'middle')}${text(1080,754,`${i+1} / ${pages.length}`,12,'end')}</svg>`);
}
