import {vehicleRegister} from './vehicle';
import {registrationProof} from './registration-proof';
import {propertyCertificate} from './property';
import {softwareCertificate} from './software';
import {trademarkCertificate,trademarkRenewal,patentRegister} from './reference-documents';
import {patentCertificate} from './patent';
import {type RecordItem,type View,getKind,validateRecord} from './registry';
export type DocumentPage={svg:string;width:number;height:number;recordId:string;kind:RecordItem['kind'];view:View;page:number;name:string;template:string};
export const esc=(s:unknown)=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function wrap(s:string,width:number,size:number):string[]{const lines:string[]=[];for(const para of String(s??'').split('\n')){let line='',used=0;for(const ch of para){const w=/[\u0020-\u007e]/.test(ch)?size*.56:size;if(used+w>width&&line){lines.push(line);line='';used=0;}line+=ch;used+=w;}lines.push(line);}return lines;}
const text=(x:number,y:number,s:unknown,size=19,fill='#24272b',anchor='start',family='Songti SC,SimSun,serif')=>`<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;
const line=(x1:number,y1:number,x2:number,y2:number,c='#bcc4cc',w=1)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${w}"/>`;
const rect=(x:number,y:number,w:number,h:number,stroke:string,fill='none',sw=1)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;
export const zhDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)?`${s.slice(0,4)}年${s.slice(5,7)}月${s.slice(8,10)}日`:s||'—';
const val=(r:RecordItem,key:string)=>r.fields[key]||'—';
function sampleSeal(x:number,y:number){return `<g opacity=".76">${rect(x-53,y-31,106,62,'#b34e4e','none',1.5)}${text(x,y-6,'合成素材',17,'#b34e4e','middle')}${text(x,y+18,'样 本 章',16,'#b34e4e','middle')}</g>`;}
type Style='patent'|'trademark'|'software'|'property'|'proof'|'registry';
const accent:Record<Style,string>={patent:'#a8843e',trademark:'#6684a8',software:'#8c6941',property:'#977648',proof:'#57746e',registry:'#344656'};
class Composer{
 pages:string[]=[];body='';y=0;part=0;bottom=976;
 constructor(public title:string,public number:string,public style:Style,public subtitle=''){this.start();}
 start(){this.part++;const c=accent[this.style];this.body=rect(0,0,794,1123,'none',this.style==='registry'?'#fff':'#fffefa');
  if(this.style==='registry'){this.body+=text(58,54,this.title.includes('专利')?'专利登记事项':'动产和权利担保登记',14,'#687b8b')+line(58,69,736,69,'#52677a',1.5)+text(397,123,this.title,28,'#202b34','middle','SimHei,PingFang SC,sans-serif');this.y=173;}
  else{this.body+=rect(32,30,730,1063,c,'none',2.5)+rect(39,37,716,1049,c,'none',.7);if(this.style==='property'){this.body+=text(397,94,'中华人民共和国',24,c,'middle')+text(397,145,this.title,34,c,'middle');this.y=186;}
   else if(this.style==='proof'){this.body+=text(397,102,'不动产登记',21,c,'middle')+text(397,165,this.title,33,'#273637','middle');this.y=214;}
   else if(this.style==='software'){this.body+=text(397,106,'计算机软件著作权',35,c,'middle')+text(397,164,'登记证书',38,c,'middle');this.y=235;}
   else {this.body+=text(397,100,this.style==='patent'?'知识产权':'商标注册',20,c,'middle')+text(397,176,this.title,39,this.style==='trademark'?'#202b37':c,'middle');this.y=232;}}
  for(const n of wrap(this.number,640,15)){this.body+=text(64,this.y,n,15,'#596875');this.y+=22;}this.y+=6;if(this.part>1){this.body+=text(728,this.y-28,`续页 ${this.part-1}`,14,'#71808c','end');}if(this.subtitle)this.paragraph(this.subtitle,16,'#6f7d88');
 }
 next(){this.pages.push(this.body);this.start();}
 ensure(h:number){if(this.y+h>this.bottom)this.next();}
 paragraph(s:string,size=19,color='#24272b',inset=64,width=666){for(const l of wrap(s,width,size)){this.ensure(size*1.7);this.body+=text(inset,this.y+size,l,size,color);this.y+=size*1.65;}this.y+=10;}
 heading(s:string){this.ensure(115);this.y+=15;this.body+=text(64,this.y+21,s,20,accent[this.style]);this.y+=43;}
 pair(label:string,value:string){const ls=wrap(value,477,20);this.ensure(Math.min(ls.length*32+16,760));this.body+=text(70,this.y+22,label,19,'#414951');for(let i=0;i<ls.length;i++){if(this.y+34>this.bottom){this.next();this.body+=text(70,this.y+22,`${label}（续）`,17,'#647280');}this.body+=text(246,this.y+22,ls[i],20);this.y+=32;}this.y+=14;}
 row(label:string,value:string){const ls=wrap(value,480,18);let off=0;while(off<ls.length){this.ensure(58);const n=Math.max(1,Math.min(ls.length-off,Math.floor((this.bottom-this.y-20)/28)));const h=n*28+20;this.body+=rect(64,this.y,666,h,accent[this.style])+rect(64,this.y,170,h,accent[this.style],this.style==='property'?'#f5f0e5':'#f4f6f7')+text(79,this.y+32,label+(off?'（续）':''),17,'#46535d');ls.slice(off,off+n).forEach((l,i)=>this.body+=text(250,this.y+31+i*28,l,18));this.y+=h;off+=n;if(off<ls.length)this.next();}}
 table(headers:string[],rows:string[][],widths:number[]){const h=38;const head=()=>{this.ensure(85);let x=64;headers.forEach((t,i)=>{this.body+=rect(x,this.y,widths[i],h,'#b8c4ce','#edf1f4')+text(x+9,this.y+25,t,16,'#465765');x+=widths[i]});this.y+=h};head();for(const row of rows){const ls=row.map((s,i)=>wrap(s,widths[i]-18,16));const max=Math.max(...ls.map(a=>a.length));let offset=0;while(offset<max){if(this.y+55>this.bottom){this.next();head();}const n=Math.max(1,Math.min(max-offset,Math.floor((this.bottom-this.y-16)/25)));const rh=n*25+16;let x=64;row.forEach((_,i)=>{this.body+=rect(x,this.y,widths[i],rh,'#b8c4ce');ls[i].slice(offset,offset+n).forEach((s,j)=>this.body+=text(x+9,this.y+25+j*25,s,16));x+=widths[i]});this.y+=rh;offset+=n;}}this.y+=12;}
 sign(date:string,issuer='登记机构（样本）'){this.ensure(130);this.y=Math.max(this.y+36,882);this.body+=sampleSeal(641,this.y+28);for(const [i,l]of wrap(issuer,390,17).entries())this.body+=text(720,this.y+18+i*25,l,17,'#46505a','end');this.body+=text(720,this.y+89,zhDate(date),18,'#46505a','end');this.y+=116;}
 finish(){this.pages.push(this.body);return this.pages.map((body,i)=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="794" height="1123" viewBox="0 0 794 1123">${body}${text(397,1046,'合成测试样本 · 不用于真实登记',13,'#8d8171','middle','PingFang SC,sans-serif')}${text(725,1073,`${i+1} / ${this.pages.length}`,12,'#8e9396','end','Arial,sans-serif')}</svg>`);}
}
function certificate(r:RecordItem):string[]{const f=r.fields;
 if(r.kind==='patent')return patentCertificate(r);
 if(r.kind==='trademark')return trademarkCertificate(r);
 if(r.kind==='software')return softwareCertificate(r);
 if(r.kind==='vehicle')return vehicleRegister(r);
 if(r.kind==='property')return propertyCertificate(r);
 const c=new Composer(`${f.registrationType}证明`,f.number,'registry');for(const [l,v]of [['登记证明编号',f.number],['登记类型',f.registrationType],['交易类型',f.businessType],['初始登记编号',f.originalNo||f.number],['初始登记日期',zhDate(f.originalDate)],['本次登记日期',zhDate(f.issueDate)],['登记期限届满日',zhDate(f.validTo)]])c.row(l,v);c.heading('担保人及担保权人信息');for(const [l,v]of [['担保人／承租人',f.owner],['担保人标识',f.debtorId],['住所',f.address],['担保权人／出租人',f.creditor],['权利人标识',f.creditorId],['登记申请人',f.registrant]])c.row(l,v);c.heading('主合同与担保财产');c.row('主合同编号',f.contractNo);if(f.amount)c.row('登记载明金额',`${f.amount} 元`);c.row('担保财产描述',f.assetDescription);if(f.changeDetail)c.row('本次登记记载',f.changeDetail);if(f.assets?.trim()){c.heading('财产要素明细');const rows=f.assets.split('\n').filter(l=>l.trim()).map(l=>{const a=l.split('|').map(x=>x.trim());return [a[0]||'—',a[1]||'—',a[2]||'—',a.slice(3).join(' | ')||'—']});c.table(['财产名称','型号','永久序列号','所在地'],rows,[168,142,190,166]);}return c.finish();
}
export function renderDocument(r:RecordItem,view:View):DocumentPage[]{
 const errors=validateRecord(r,[view]);if(errors.length)throw Error(errors.join('；'));let svgs:string[]=[];let title=getKind(r.kind).views.find(x=>x.id===view)?.name;if(!title)throw Error('该材料类型不支持此文书');const f=r.fields;
 if(view==='certificate')svgs=certificate(r);
 if(view==='register')svgs=patentRegister(r);
 if(view==='renewal')svgs=trademarkRenewal(r);
 if(view==='registrationProof')svgs=registrationProof(r);
 if(view==='proof')svgs=registrationProof(r,'mortgage');
 if(view==='electronicProof')svgs=registrationProof(r,'electronic');
 if(view==='query'){const c=new Composer(r.kind==='property'?'不动产登记信息查询记录':'动产和权利担保查询记录',f.queryNo,r.kind==='property'?'proof':'registry');c.row('查询编号',f.queryNo);c.row('查询日期',zhDate(f.queryDate));c.row(r.kind==='property'?'权利人':'担保人',f.owner);c.row('关联登记编号',f.number);c.heading('查询条件与范围');c.paragraph(f.queryScope,19);c.heading('查询结果');c.paragraph(f.queryResult,20);svgs=c.finish();}
 const template=((r.kind==='trademark'&&view==='renewal')||(r.kind==='patent'&&['certificate','register'].includes(view))||(r.kind==='property'&&['registrationProof','proof','electronicProof'].includes(view))||(['trademark','software','property','vehicle'].includes(r.kind)&&view==='certificate'))?`${r.kind}-${view}-reference-v2`:`${r.kind}-${view}-structure-v1`;return svgs.map((svg,i)=>({svg:svg.replace(/(<text x="725" y="1073"[^>]*>)[^<]*(<\/text>)/,`$1${i+1} / ${svgs.length}$2`),width:(['registrationProof','proof','electronicProof'].includes(view)||r.kind==='vehicle')?1123:794,height:(['registrationProof','proof','electronicProof'].includes(view)||r.kind==='vehicle')?794:1123,recordId:r.id,kind:r.kind,view,page:i+1,name:`${f.title||r.id}_${title}_${String(i+1).padStart(2,'0')}`,template}));
}
export function appearanceSVG(svg:string,mode:'digital'|'scan'){if(mode==='digital')return svg;return svg.replace(/(<svg[^>]*>)/,`$1<defs><filter id="scan-tone"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="0.86" intercept="0.05"/><feFuncG type="linear" slope="0.86" intercept="0.05"/><feFuncB type="linear" slope="0.86" intercept="0.05"/></feComponentTransfer></filter></defs><g filter="url(#scan-tone)">`).replace('</svg>','</g></svg>');}
