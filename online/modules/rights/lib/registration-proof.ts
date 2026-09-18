import type {RecordItem} from './registry';
import {registrationProofBackground,proofBarcodePath,proofBarcodeWidth,proofQRPath,proofQRSize} from './registration-proof-art';
const esc=(value:string)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,value:string,size=18,anchor='start',fill='#403a35')=>`<text x="${x}" y="${y}" font-family="Songti SC,SimSun,serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${esc(value)}</text>`;
const date=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?`${value.slice(0,4)}年${value.slice(5,7)}月${value.slice(8,10)}日`:value||'—';
function wrap(value:string,width:number,size:number){const rows:string[]=[];for(const paragraph of String(value??'').split('\n')){let row='',used=0;for(const ch of paragraph){const w=/[\u0020-\u007e]/.test(ch)?size*.56:size;if(row&&used+w>width&&!/[，。；：、）》]/.test(ch)){rows.push(row);row='';used=0;}row+=ch;used+=w;}rows.push(row);}return rows;}
const paper=()=>`<image width="1123" height="794" preserveAspectRatio="none" href="${registrationProofBackground}"/>`;

export function registrationProof(record:RecordItem,variant:'general'|'mortgage'|'electronic'='general'):string[]{
 const source=record.fields,electronic=variant==='electronic';
 const f:Record<string,string>=variant==='mortgage'?{...source,regProofNo:source.proofNo,regProofMatter:'抵押权',regProofOwner:source.creditor,regProofObligor:source.debtor,regProofLocation:source.location,regProofUnit:source.unitNo,regProofIssuer:source.issuer,regProofDate:source.proofDate,regProofOther:[`抵押方式：${source.mortgageType}`,`${source.mortgageType==='最高额抵押权'?'最高债权额':'被担保主债权数额'}：${source.amount}元`,source.mortgageFrom&&source.mortgageTo?`债务履行期限：${date(source.mortgageFrom)}至${date(source.mortgageTo)}`:'',`关联产权证号：${source.number}`].filter(Boolean).join('\n'),regProofNotes:[source.mortgageBusinessNo?`业务号：${source.mortgageBusinessNo}`:'',source.mortgageNotes||'',`担保范围：${source.mortgageScope}`].filter(Boolean).join('\n')}:electronic?{...source,regProofNo:source.eProofNo,regProofMatter:source.eProofMatter,regProofOwner:source.eProofOwner,regProofObligor:source.eProofObligor,regProofLocation:source.eProofLocation,regProofUnit:source.eProofUnit,regProofIssuer:source.eProofIssuer,regProofDate:source.eProofDate,regProofOther:source.eProofOther,regProofNotes:source.eProofNotes}:source;
 const extra:[string,string][]=[];
 const sheet=()=>{if(!electronic)return paper();let bg='<rect width="1123" height="794" fill="#fff"/>';for(const y of [142,390,650])for(const x of [210,770])bg+=`<g opacity=".07" transform="rotate(-18 ${x} ${y})">${text(x,y,f.regProofIssuer||'登记机构（样本）',29,'middle','#849199')}</g>`;return bg;};
 const field=(x:number,y:number,value:string,width:number,label:string,maxLines=2,size=18,anchor='start')=>{
  const rows=wrap(value||'—',width,size);
  if(rows.length>maxLines){extra.push([label,value]);return text(x,y,`详见附页第${extra.length}项`,size,anchor);}
  return rows.map((row,i)=>text(x,y+i*(size+6),row,size,anchor)).join('');
 };
 let body=sheet();
 if(variant==='general')body+=`<g transform="translate(61 59) scale(${191/proofBarcodeWidth} 1)"><path d="${proofBarcodePath}" fill="#3d3933"/></g>`+text(157,110,'SYN-REGISTRATION · 样本条码',9,'middle','#958478');
 body+=text(305,electronic?100:160,electronic?'不动产电子登记证明':'不动产登记证明',29,'middle');
 const statement='　　根据《中华人民共和国民法典》等法律法规，为保护不动产权利人合法权益，对申请人申请登记的本证明所列不动产权利或登记事项，经审查核实，准予登记，颁发此证明。';
 wrap(statement,435,20).forEach((row,i)=>body+=text(86,218+i*39,row,20));
 if(!electronic)body+=`<g transform="translate(94 ${variant==='mortgage'?498:426}) scale(${118/proofQRSize})"><rect width="${proofQRSize}" height="${proofQRSize}" fill="#fff"/><path d="${proofQRPath}" fill="#262724"/></g>`+text(153,variant==='mortgage'?638:566,'合成样本码',11,'middle','#958478');
 body+=`<g transform="translate(427 550) rotate(-10)" opacity=".8"><circle r="77" stroke="#bb4a50" stroke-width="2.3" fill="none"/><circle r="72" stroke="#bb4a50" stroke-width=".7" fill="none"/>${text(0,-31,'合成测试样本',17,'middle','#bb4a50')}${text(0,12,'★',42,'middle','#bb4a50')}${text(0,39,'不动产登记样本章',13,'middle','#bb4a50')}</g>`;
 body+=text(427,477,'登记机构（章）',18,'middle');
 body+=field(407,659,f.regProofIssuer,262,'登记机构',2,13,'middle')+text(407,706,date(f.regProofDate),15,'middle');
 if(!electronic)body+=text(286,740,'中华人民共和国自然资源部监制',16,'middle');
 body+=field(828,97,f.regProofNo,440,'不动产登记证明号',1,21,'middle');
 const rows:[string,string,number][]=[['证明权利或事项',f.regProofMatter,51],['权利人（申请人）',f.regProofOwner,51],['义 务 人',f.regProofObligor,51],['坐　落',f.regProofLocation,51],['不动产单元号',f.regProofUnit,51],['其　他',f.regProofOther,176],['附　记',f.regProofNotes,155]];
 let y=134;const x=606,width=449,labelWidth=149;
 for(const [label,value,h]of rows){body+=`<rect x="${x}" y="${y}" width="${width}" height="${h}" fill="none" stroke="#8b7770" stroke-width="1"/><line x1="${x+labelWidth}" y1="${y}" x2="${x+labelWidth}" y2="${y+h}" stroke="#8b7770"/>`;
  body+=text(x+labelWidth/2,y+h/2+6,label,17,'middle');const contentRows=wrap(value||'—',272,17);body+=field(x+labelWidth+13,y+(h>100?28:contentRows.length>1?20:32),value,272,label,h<=60?2:Math.floor((h-10)/23),17);y+=h;
 }
 const pages=[body];
 if(extra.length){let page='',cursor=0,part=0;const start=()=>{page=sheet()+text(561,100,electronic?'不动产电子登记证明附页':'不动产登记证明附页',29,'middle')+text(561,135,`第 ${++part} 张附页`,14,'middle');cursor=193;};const next=()=>{pages.push(page);start();};const write=(s:string,size=18)=>{for(const row of wrap(s,948,size)){if(cursor>696)next();page+=text(87,cursor,row,size);cursor+=28;}};start();write(`证明编号：${f.regProofNo}`,16);cursor+=24;extra.forEach(([label,value],i)=>{if(cursor>625)next();write(`${i+1}. ${label}`,21);cursor+=6;write(value);cursor+=24;});pages.push(page);}
 return pages.map((content,i)=>`<svg xmlns="http://www.w3.org/2000/svg" width="1123" height="794" viewBox="0 0 1123 794">${content}${text(739,742,'合成测试样本 · 不用于真实登记',11,'middle','#9a8076')}${text(1045,742,`${i+1} / ${pages.length}`,11,'end','#9a8076')}</svg>`);
}
