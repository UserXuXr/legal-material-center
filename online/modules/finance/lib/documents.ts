import { type Project,type Transaction,type DocKind,voucherStyleOf,isLedgerVoucher,voucherUnavailable,requestAmountOf,statementStyleOf,receiptStyleOf,money,unitPrice,invoiceMoney,chineseMoney,totals,itemAmounts,entries,statement } from './finance';
export type DocumentPage={svg:string;width:number;height:number;name:string;kind:DocKind;transactionId?:string;stage?:'invoice'|'payment';templateId?:string;templateVersion?:string;statementSummary?:{opening:number;closing:number;income:number;expense:number;first:number;last:number;count:number}};
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const line=(x1:number,y1:number,x2:number,y2:number,color='#8999ac',width=1)=>`<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${color}" stroke-width="${width}"/>`;
const box=(x:number,y:number,w:number,h:number,stroke='#8999ac',fill='none',r=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" rx="${r}"/>`;
const txt=(x:number,y:number,s:unknown,size=16,color='#192431',anchor='start',weight=400)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" font-weight="${weight}">${esc(s)}</text>`;
function wrap(s:string,width:number,size:number){const lines:string[]=[];let row='',n=0;for(const c of s){const d=c.charCodeAt(0)>255?size:size*.58;if(n+d>width&&row){lines.push(row);row='';n=0;}row+=c;n+=d;}if(row)lines.push(row);return lines;}
const multiline=(x:number,y:number,s:string,w:number,size=16,color='#192431',gap=23)=>wrap(s,w,size).map((a,i)=>txt(x,y+i*gap,a,size,color)).join('');
function finish(body:string,w:number,h:number,name:string,kind:DocKind,meta:Partial<DocumentPage>={}):DocumentPage{return {width:w,height:h,name,kind,...meta,svg:`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/><g font-family="'Songti SC','SimSun','Noto Serif CJK SC',serif">${body}</g><text x="${w-32}" y="${h-20}" text-anchor="end" font-family="sans-serif" font-size="13" fill="#687487">合成测试样本 · 不用于真实业务</text></svg>`};}
const SAMPLE_QR_PATH='M0 0h1v1h-1zM1 0h1v1h-1zM2 0h1v1h-1zM3 0h1v1h-1zM4 0h1v1h-1zM5 0h1v1h-1zM6 0h1v1h-1zM9 0h1v1h-1zM14 0h1v1h-1zM16 0h1v1h-1zM18 0h1v1h-1zM19 0h1v1h-1zM20 0h1v1h-1zM22 0h1v1h-1zM23 0h1v1h-1zM24 0h1v1h-1zM25 0h1v1h-1zM26 0h1v1h-1zM27 0h1v1h-1zM28 0h1v1h-1zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h1v1h-1zM9 1h1v1h-1zM11 1h1v1h-1zM12 1h1v1h-1zM13 1h1v1h-1zM14 1h1v1h-1zM15 1h1v1h-1zM20 1h1v1h-1zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM6 2h1v1h-1zM9 2h1v1h-1zM10 2h1v1h-1zM11 2h1v1h-1zM16 2h1v1h-1zM18 2h1v1h-1zM22 2h1v1h-1zM24 2h1v1h-1zM25 2h1v1h-1zM26 2h1v1h-1zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h1v1h-1zM3 3h1v1h-1zM4 3h1v1h-1zM6 3h1v1h-1zM8 3h1v1h-1zM9 3h1v1h-1zM11 3h1v1h-1zM13 3h1v1h-1zM14 3h1v1h-1zM17 3h1v1h-1zM18 3h1v1h-1zM19 3h1v1h-1zM22 3h1v1h-1zM24 3h1v1h-1zM25 3h1v1h-1zM26 3h1v1h-1zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h1v1h-1zM3 4h1v1h-1zM4 4h1v1h-1zM6 4h1v1h-1zM10 4h1v1h-1zM12 4h1v1h-1zM13 4h1v1h-1zM16 4h1v1h-1zM17 4h1v1h-1zM18 4h1v1h-1zM19 4h1v1h-1zM20 4h1v1h-1zM22 4h1v1h-1zM24 4h1v1h-1zM25 4h1v1h-1zM26 4h1v1h-1zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h1v1h-1zM10 5h1v1h-1zM13 5h1v1h-1zM14 5h1v1h-1zM15 5h1v1h-1zM16 5h1v1h-1zM17 5h1v1h-1zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h1v1h-1zM1 6h1v1h-1zM2 6h1v1h-1zM3 6h1v1h-1zM4 6h1v1h-1zM5 6h1v1h-1zM6 6h1v1h-1zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h1v1h-1zM23 6h1v1h-1zM24 6h1v1h-1zM25 6h1v1h-1zM26 6h1v1h-1zM27 6h1v1h-1zM28 6h1v1h-1zM12 7h1v1h-1zM14 7h1v1h-1zM15 7h1v1h-1zM20 7h1v1h-1zM0 8h1v1h-1zM1 8h1v1h-1zM2 8h1v1h-1zM3 8h1v1h-1zM4 8h1v1h-1zM6 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM9 8h1v1h-1zM10 8h1v1h-1zM12 8h1v1h-1zM13 8h1v1h-1zM14 8h1v1h-1zM17 8h1v1h-1zM19 8h1v1h-1zM21 8h1v1h-1zM23 8h1v1h-1zM25 8h1v1h-1zM27 8h1v1h-1zM4 9h1v1h-1zM7 9h1v1h-1zM8 9h1v1h-1zM9 9h1v1h-1zM13 9h1v1h-1zM16 9h1v1h-1zM19 9h1v1h-1zM20 9h1v1h-1zM22 9h1v1h-1zM23 9h1v1h-1zM24 9h1v1h-1zM28 9h1v1h-1zM0 10h1v1h-1zM1 10h1v1h-1zM2 10h1v1h-1zM4 10h1v1h-1zM5 10h1v1h-1zM6 10h1v1h-1zM8 10h1v1h-1zM9 10h1v1h-1zM11 10h1v1h-1zM12 10h1v1h-1zM15 10h1v1h-1zM16 10h1v1h-1zM17 10h1v1h-1zM18 10h1v1h-1zM20 10h1v1h-1zM21 10h1v1h-1zM23 10h1v1h-1zM24 10h1v1h-1zM0 11h1v1h-1zM1 11h1v1h-1zM2 11h1v1h-1zM5 11h1v1h-1zM8 11h1v1h-1zM9 11h1v1h-1zM10 11h1v1h-1zM11 11h1v1h-1zM14 11h1v1h-1zM15 11h1v1h-1zM16 11h1v1h-1zM21 11h1v1h-1zM23 11h1v1h-1zM25 11h1v1h-1zM27 11h1v1h-1zM0 12h1v1h-1zM1 12h1v1h-1zM6 12h1v1h-1zM8 12h1v1h-1zM9 12h1v1h-1zM11 12h1v1h-1zM13 12h1v1h-1zM14 12h1v1h-1zM17 12h1v1h-1zM25 12h1v1h-1zM26 12h1v1h-1zM0 13h1v1h-1zM4 13h1v1h-1zM7 13h1v1h-1zM8 13h1v1h-1zM9 13h1v1h-1zM10 13h1v1h-1zM12 13h1v1h-1zM17 13h1v1h-1zM19 13h1v1h-1zM20 13h1v1h-1zM21 13h1v1h-1zM22 13h1v1h-1zM23 13h1v1h-1zM24 13h1v1h-1zM28 13h1v1h-1zM2 14h1v1h-1zM3 14h1v1h-1zM4 14h1v1h-1zM6 14h1v1h-1zM7 14h1v1h-1zM10 14h1v1h-1zM13 14h1v1h-1zM15 14h1v1h-1zM16 14h1v1h-1zM18 14h1v1h-1zM22 14h1v1h-1zM23 14h1v1h-1zM24 14h1v1h-1zM25 14h1v1h-1zM26 14h1v1h-1zM0 15h1v1h-1zM1 15h1v1h-1zM3 15h1v1h-1zM4 15h1v1h-1zM8 15h1v1h-1zM9 15h1v1h-1zM10 15h1v1h-1zM12 15h1v1h-1zM14 15h1v1h-1zM19 15h1v1h-1zM20 15h1v1h-1zM21 15h1v1h-1zM24 15h1v1h-1zM27 15h1v1h-1zM0 16h1v1h-1zM3 16h1v1h-1zM4 16h1v1h-1zM6 16h1v1h-1zM7 16h1v1h-1zM8 16h1v1h-1zM9 16h1v1h-1zM10 16h1v1h-1zM12 16h1v1h-1zM13 16h1v1h-1zM14 16h1v1h-1zM15 16h1v1h-1zM17 16h1v1h-1zM20 16h1v1h-1zM25 16h1v1h-1zM26 16h1v1h-1zM0 17h1v1h-1zM1 17h1v1h-1zM2 17h1v1h-1zM3 17h1v1h-1zM4 17h1v1h-1zM7 17h1v1h-1zM8 17h1v1h-1zM9 17h1v1h-1zM16 17h1v1h-1zM17 17h1v1h-1zM18 17h1v1h-1zM19 17h1v1h-1zM20 17h1v1h-1zM21 17h1v1h-1zM22 17h1v1h-1zM23 17h1v1h-1zM24 17h1v1h-1zM26 17h1v1h-1zM28 17h1v1h-1zM0 18h1v1h-1zM2 18h1v1h-1zM6 18h1v1h-1zM7 18h1v1h-1zM8 18h1v1h-1zM9 18h1v1h-1zM10 18h1v1h-1zM11 18h1v1h-1zM12 18h1v1h-1zM14 18h1v1h-1zM15 18h1v1h-1zM16 18h1v1h-1zM17 18h1v1h-1zM24 18h1v1h-1zM26 18h1v1h-1zM0 19h1v1h-1zM4 19h1v1h-1zM5 19h1v1h-1zM7 19h1v1h-1zM9 19h1v1h-1zM10 19h1v1h-1zM11 19h1v1h-1zM14 19h1v1h-1zM15 19h1v1h-1zM18 19h1v1h-1zM19 19h1v1h-1zM20 19h1v1h-1zM27 19h1v1h-1zM0 20h1v1h-1zM2 20h1v1h-1zM5 20h1v1h-1zM6 20h1v1h-1zM7 20h1v1h-1zM8 20h1v1h-1zM9 20h1v1h-1zM10 20h1v1h-1zM11 20h1v1h-1zM17 20h1v1h-1zM19 20h1v1h-1zM20 20h1v1h-1zM21 20h1v1h-1zM22 20h1v1h-1zM23 20h1v1h-1zM24 20h1v1h-1zM26 20h1v1h-1zM27 20h1v1h-1zM28 20h1v1h-1zM8 21h1v1h-1zM9 21h1v1h-1zM10 21h1v1h-1zM12 21h1v1h-1zM13 21h1v1h-1zM16 21h1v1h-1zM20 21h1v1h-1zM24 21h1v1h-1zM25 21h1v1h-1zM26 21h1v1h-1zM27 21h1v1h-1zM28 21h1v1h-1zM0 22h1v1h-1zM1 22h1v1h-1zM2 22h1v1h-1zM3 22h1v1h-1zM4 22h1v1h-1zM5 22h1v1h-1zM6 22h1v1h-1zM8 22h1v1h-1zM9 22h1v1h-1zM10 22h1v1h-1zM13 22h1v1h-1zM14 22h1v1h-1zM15 22h1v1h-1zM19 22h1v1h-1zM20 22h1v1h-1zM22 22h1v1h-1zM24 22h1v1h-1zM25 22h1v1h-1zM26 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM9 23h1v1h-1zM12 23h1v1h-1zM13 23h1v1h-1zM15 23h1v1h-1zM16 23h1v1h-1zM18 23h1v1h-1zM19 23h1v1h-1zM20 23h1v1h-1zM24 23h1v1h-1zM0 24h1v1h-1zM2 24h1v1h-1zM3 24h1v1h-1zM4 24h1v1h-1zM6 24h1v1h-1zM8 24h1v1h-1zM9 24h1v1h-1zM10 24h1v1h-1zM12 24h1v1h-1zM14 24h1v1h-1zM15 24h1v1h-1zM16 24h1v1h-1zM17 24h1v1h-1zM20 24h1v1h-1zM21 24h1v1h-1zM22 24h1v1h-1zM23 24h1v1h-1zM24 24h1v1h-1zM26 24h1v1h-1zM27 24h1v1h-1zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h1v1h-1zM3 25h1v1h-1zM4 25h1v1h-1zM6 25h1v1h-1zM8 25h1v1h-1zM9 25h1v1h-1zM16 25h1v1h-1zM17 25h1v1h-1zM18 25h1v1h-1zM19 25h1v1h-1zM21 25h1v1h-1zM23 25h1v1h-1zM25 25h1v1h-1zM26 25h1v1h-1zM27 25h1v1h-1zM28 25h1v1h-1zM0 26h1v1h-1zM2 26h1v1h-1zM3 26h1v1h-1zM4 26h1v1h-1zM6 26h1v1h-1zM8 26h1v1h-1zM10 26h1v1h-1zM11 26h1v1h-1zM12 26h1v1h-1zM15 26h1v1h-1zM16 26h1v1h-1zM18 26h1v1h-1zM20 26h1v1h-1zM21 26h1v1h-1zM22 26h1v1h-1zM23 26h1v1h-1zM24 26h1v1h-1zM25 26h1v1h-1zM26 26h1v1h-1zM27 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM8 27h1v1h-1zM10 27h1v1h-1zM11 27h1v1h-1zM14 27h1v1h-1zM15 27h1v1h-1zM16 27h1v1h-1zM18 27h1v1h-1zM20 27h1v1h-1zM22 27h1v1h-1zM23 27h1v1h-1zM24 27h1v1h-1zM25 27h1v1h-1zM27 27h1v1h-1zM0 28h1v1h-1zM1 28h1v1h-1zM2 28h1v1h-1zM3 28h1v1h-1zM4 28h1v1h-1zM5 28h1v1h-1zM6 28h1v1h-1zM8 28h1v1h-1zM10 28h1v1h-1zM11 28h1v1h-1zM15 28h1v1h-1zM17 28h1v1h-1zM19 28h1v1h-1zM21 28h1v1h-1zM22 28h1v1h-1zM23 28h1v1h-1zM24 28h1v1h-1zM26 28h1v1h-1z';
export function invoice(p:Project,t:Transaction):DocumentPage{
 if(t.recordType==='bank')throw Error('仅银行收付记录不生成发票');
 const red='#781c25',ink='#151515',a=totals(t),buyer=t.direction==='income'?t.counterparty:p.company,seller=t.direction==='income'?p.company:t.counterparty;
 const label=(x:number,y:number,s:unknown,size=17,anchor='start')=>`<g font-family="'Kaiti SC','STKaiti','KaiTi','Songti SC',serif">${txt(x,y,s,size,red,anchor)}</g>`;
 const data=(x:number,y:number,s:unknown,size=17,anchor='start')=>`<g font-family="Arial,'PingFang SC','Microsoft YaHei',sans-serif">${txt(x,y,s,size,ink,anchor)}</g>`;
 const fitted=(x:number,y:number,s:string,width:number,size=17,anchor='start')=>{const measured=[...s].reduce((n,c)=>n+(c.charCodeAt(0)>255?size:size*.57),0);return data(x,y,s,Math.min(size,size*width/Math.max(measured,1)),anchor);};
 const wrapped=(x:number,y:number,s:string,width:number,size=16,gap=21)=>wrap(s,width,size).map((part,i)=>data(x,y+i*gap,part,size)).join('');
 const rowHeights=t.items.map(i=>Math.max(1,wrap(i.name,207,16).length,wrap(i.spec,117,15).length)*21+9);
 const extra=Math.max(0,rowHeights.reduce((n,h)=>n+h,0)-217),totalY=557+extra,remarkY=601+extra,bottom=716+extra;
 let b=`<g data-template="cn-digital-invoice-reference-v2">`;
 // A real QR encoding a reserved test URL, independent of invoice and taxpayer data.
 b+=`<g transform="translate(40 40) scale(3.75)" fill="#111" shape-rendering="crispEdges"><path d="${SAMPLE_QR_PATH}"/></g>`;
 b+=`<g font-family="'Kaiti SC','STKaiti','KaiTi',serif">${txt(590,88,`电子发票（${t.invoiceType}）`,t.invoiceType==='普通发票'?35:32,red,'middle',600)}</g>`;
 b+=line(376,111,790,111,red,2)+line(376,117,790,117,red,1.2);
 // This occupies the reference seal position but is explicitly a specimen mark.
 b+=`<g transform="translate(602 106) rotate(-7)" fill="none" stroke="#ca2433" role="img" aria-label="财务素材合成专用"><ellipse rx="82" ry="52" stroke-width="3"/><ellipse rx="76" ry="46" stroke-width="1.4"/>${[..."财务素材合成专用"].map((c,i,chars)=>{const angle=-66+i*132/(chars.length-1),r=angle*Math.PI/180;return `<g transform="translate(${Math.sin(r)*65} ${-Math.cos(r)*37+2}) rotate(${angle})" stroke="none">${txt(0,0,c,14,"#ca2433","middle")}</g>`;}).join("")}${txt(0,12,'测试样本',22,'#ca2433','middle',600)}${txt(0,36,'不具备票据效力',12,'#ca2433','middle')}</g>`;
 const dateParts=t.date.split('-');const dateText=dateParts.length===3?`${dateParts[0]}年${Number(dateParts[1])}月${Number(dateParts[2])}日`:t.date;
 b+=label(881,86,'发票号码：',16)+data(971,86,t.invoiceNo,16)+label(881,121,'开票日期：',16)+data(971,121,dateText,16);
 b+=box(30,177,1140,bottom-177,red)+line(600,177,600,302,red)+line(66,177,66,302,red)+line(636,177,636,302,red)+line(30,302,1170,302,red);
 ['购','买','方','信','息'].forEach((c,i)=>b+=label(48,202+i*21,c,16,'middle'));
 ['销','售','方','信','息'].forEach((c,i)=>b+=label(618,202+i*21,c,16,'middle'));
 for(const [x,party] of [[73,buyer],[643,seller]] as const){b+=label(x,220,'名称：',17)+fitted(x+48,220,party.name,466,17);b+=label(x,273,'统一社会信用代码/纳税人识别号：',15)+fitted(x+243,273,party.taxId,272,17);}
 b+=`<g transform="translate(1182 183) rotate(90)">${txt(0,0,`下载次数：${t.downloadCount??1}`,14,'#888')}</g>`;
 const columns=[{label:'项目名称',center:145},{label:'规格型号',center:287},{label:'单　位',center:410},{label:'数　量',center:560},{label:'单　价',center:669},{label:'金　额',center:850},{label:'税率/征收率',center:956},{label:'税　额',center:1134}];
 columns.forEach(c=>b+=label(c.center,323,c.label,17,'middle'));
 let y=345;
 t.items.forEach((item,i)=>{const am=itemAmounts(item);b+=wrapped(32,y,item.name,207,16)+wrapped(234,y,item.spec,117,15)+fitted(410,y,item.unit,82,17,'middle')+fitted(583,y,String(item.quantity),105,17,'end')+fitted(724,y,unitPrice(item.price),136,17,'end')+fitted(870,y,invoiceMoney(am.net),142,17,'end')+data(956,y,`${item.rate}%`,17,'middle')+fitted(1165,y,invoiceMoney(am.tax),137,17,'end');y+=rowHeights[i];});
 b+=label(164,totalY-11,'合　　　计',17,'middle')+data(870,totalY-11,'¥ '+invoiceMoney(a.net),17,'end')+data(1165,totalY-11,'¥ '+invoiceMoney(a.tax),17,'end');
 b+=line(30,totalY,1170,totalY,red)+line(324,totalY,324,remarkY,red)+label(172,totalY+29,'价税合计（大写）',17,'middle');
 b+=`<g stroke="#333" fill="none" stroke-width="1"><circle cx="346" cy="${totalY+23}" r="11"/><path d="M338 ${totalY+15}l16 16m0 -16l-16 16"/></g>`+fitted(363,totalY+29,chineseMoney(a.gross),466,18)+label(829,totalY+29,'（小写）',17)+data(900,totalY+29,'¥ '+invoiceMoney(a.gross),18);
 b+=line(30,remarkY,1170,remarkY,red)+line(66,remarkY,66,bottom,red)+label(48,remarkY+47,'备',17,'middle')+label(48,remarkY+80,'注',17,'middle')+wrapped(79,remarkY+28,t.note,1070,16,22);
 b+=label(116,bottom+44,'开票人：',17)+data(188,bottom+44,p.maker,17)+`</g>`;
 return finish(b,1200,800+extra,`发票_${t.invoiceNo}`,'invoice',{transactionId:t.id});
}
// Receipt layouts share transaction semantics; only the paper geometry differs.
const receiptInk='#191919';
const rtext=(x:number,y:number,s:unknown,size=18,anchor='start',weight=400)=>txt(x,y,s,size,receiptInk,anchor,weight);
const rline=(x1:number,y1:number,x2:number,y2:number,width=1.3)=>line(x1,y1,x2,y2,receiptInk,width);
const rfit=(x:number,y:number,s:string,width:number,size=18)=>{
 const measured=Array.from(s).reduce((n,c)=>n+(c.charCodeAt(0)>255?size:size*.58),0);
 return measured>width?`<g transform="translate(${x} ${y}) scale(${width/measured} 1)">${rtext(0,0,s,size)}</g>`:rtext(x,y,s,size);
};
const rcenter=(y:number,s:string,size=29)=>rtext(560,y,s,size,'middle');
const rwrap=(x:number,y:number,s:string,width:number,size=18,gap=24)=>multiline(x,y,s,width,size,receiptInk,gap);
function receiptStamp(x:number,y:number,oval=false){return `<g transform="translate(${x} ${y}) rotate(-8)" fill="#b62832" stroke="#b62832" aria-label="合成测试电子回单样章"><ellipse rx="${oval?102:76}" ry="${oval?57:76}" fill="none" stroke-width="3"/><ellipse rx="${oval?97:71}" ry="${oval?52:71}" fill="none" stroke-width="1"/>${txt(0,-25,'财务素材合成',17,'#b62832','middle')}${txt(0,4,'测试样本',23,'#b62832','middle',600)}${txt(0,30,'电子回单样章',15,'#b62832','middle')}</g>`;}
const receiptQR=(x:number,y:number)=>`<rect x="${x-10}" y="${y-10}" width="107" height="107" fill="white"/><path transform="translate(${x} ${y}) scale(3)" d="${SAMPLE_QR_PATH}" fill="#111"/>`;
export function receipt(p:Project,t:Transaction):DocumentPage{
 const style=receiptStyleOf(t),payer=t.direction==='income'?t.counterparty:p.company,payee=t.direction==='income'?p.company:t.counterparty;
 const business=t.receiptBusiness??'普通汇兑',channel=t.receiptChannel??'企业网上银行',note=t.receiptNote??'',purpose=t.purpose||t.title;
 const direction=t.direction==='income'?'收款':'付款',dc=t.direction==='income'?'贷':'借',stampDate=t.paymentDate.replace(/-/g,'年').replace(/年(\d{2})年/,'年$1月')+'日';
 const footer=(y:number)=>rtext(36,y,'提示：本回单为合成测试素材，请勿重复记账。',15);
 let b='',h=720;
 if(style==='compact'){
  h=735;
  b=rcenter(64,`${p.bankName}电子回单`,30)+rtext(36,113,`电子回单号：${t.paymentRef}`,16)+rtext(1084,113,`${direction}回单` ,17,'end');
  b+=box(36,136,1048,448,receiptInk)+[208,250,310,352,408,450,534].map(y=>rline(36,y,1084,y)).join('');
  for(const [x,party,label] of [[36,payer,'付款人'],[560,payee,'收款人']] as const){
   b+=rline(x+122,136,x+122,352)+rline(x+122,534,x+122,584);
   b+=rtext(x+61,179,label,22,'middle')+rwrap(x+135,165,party.name,376,18);
   b+=rtext(x+61,236,'账  号',19,'middle')+rfit(x+135,236,party.account,376,18);
   b+=rtext(x+61,285,'开户行',19,'middle')+rwrap(x+135,274,party.bank,376,17);
  }
  b+=rline(560,136,560,352)+rline(560,534,560,584);
  b+=rtext(97,338,'业务种类',17,'middle')+rfit(171,338,business,370,17)+rtext(621,338,'交易日期',17,'middle')+rtext(695,338,t.paymentDate,18);
  b+=rtext(51,380,'金额（小写）',18)+rtext(207,382,'¥ '+money(t.paid),23)+rtext(568,380,'金额（大写）',17)+rfit(704,380,chineseMoney(t.paid),363,17);
  b+=rtext(51,435,'用  途',18)+rfit(171,435,purpose,890,17);
  b+=rtext(97,486,'备  注',18,'middle')+rwrap(171,474,note||'—',894,16,22);
  b+=rtext(97,565,'流水号',17,'middle')+rfit(171,565,t.paymentRef,372,16)+rtext(621,565,'校验码',17,'middle')+rtext(695,565,'SYNTHETIC',16);
  b+=rtext(36,616,`交易渠道：${channel}`,16)+rtext(36,648,`记账时间：${t.paymentTime}`,16)+receiptStamp(965,630,true)+footer(690);
 }else if(style==='corporate'){
  h=700;
  b=rfit(36,57,p.bankName,240,26)+rfit(310,57,'单位客户专用回单',760,29)+rtext(36,104,'币别：人民币',17)+rtext(400,104,stampDate,17)+rfit(665,104,`流水号：${t.paymentRef}`,405,16);
  b+=box(36,123,1048,462,receiptInk)+rline(560,123,560,261)+[169,215].map(y=>rline(77,y,560,y)+rline(601,y,1084,y)).join('');
  for(const [x,party,label] of [[36,payer,'付款人'],[560,payee,'收款人']] as const){
   b+=rline(x+41,123,x+41,261)+rline(x+136,123,x+136,261);
   b+=Array.from(label).map((c,i)=>rtext(x+21,168+i*24,c,18,'middle')).join('');
   for(const [i,label,value] of [[0,'全  称',party.name],[1,'账  号',party.account],[2,'开户行',party.bank]] as const)b+=rtext(x+89,152+i*46,label,17,'middle')+rwrap(x+145,(wrap(value,365,17).length>1?140:152)+i*46,value,365,17,20);
  }
  for(const y of [261,304,346,395])b+=rline(36,y,1084,y);
  b+=rtext(60,290,'金  额',18)+rfit(173,290,'（大写）'+chineseMoney(t.paid),580,19)+rtext(1067,290,'（小写）¥ '+money(t.paid),21,'end');
  b+=rline(165,304,165,395)+rline(560,304,560,395)+rline(690,304,690,395);
  b+=rtext(49,333,'业务种类',17)+rfit(180,333,business,365,17)+rtext(578,333,'借贷标志',17)+rtext(705,333,dc+'方回单',18);
  b+=rtext(49,376,'交易渠道',17)+rfit(180,376,channel,365,17)+rtext(578,376,'用  途',17)+rwrap(705,365,purpose,364,15,18);
  b+=rline(560,395,560,585)+rtext(51,425,'备注：',17)+rwrap(51,453,note,491,16,22)+receiptStamp(784,491)+receiptQR(968,435);
  b+=rtext(36,617,`生成日期：${t.paymentDate}`,16)+rtext(433,617,`交易柜员：${p.maker}`,16)+rfit(728,617,`交易机构：${p.company.bank}`,355,15)+footer(657);
 }else if(style==='payment'){
  h=740;const red='#8c3035';
  b=rfit(36,58,p.bankName,266,28)+rfit(330,60,`国内支付业务${direction}回单`,744,30)+line(36,88,1084,88,red,3);
  b+=rfit(36,124,`回单编号：${t.paymentRef}`,615,16)+rtext(1084,124,`日期：${stampDate}`,17,'end');
  for(const [x,party,label] of [[36,payer,'付款人'],[570,payee,'收款人']] as const){
   b+=rtext(x,169,label+'账号：',18)+rfit(x+129,169,party.account,373,18);
   b+=rtext(x,209,label+'名称：',18)+rwrap(x+129,198,party.name,373,17,23);
   b+=rtext(x,269,label+'开户行：',17)+rwrap(x+129,258,party.bank,373,17,23);
  }
  b+=rtext(36,320,'金额：',18)+rtext(116,320,'CNY '+money(t.paid),23,'start',600)+rfit(116,353,'人民币'+chineseMoney(t.paid),944,19)+rline(36,378,1084,378,1);
  b+=rtext(36,415,'业务类型：'+business,17)+rtext(570,415,'交易渠道：'+channel,17);
  b+=rfit(36,451,'业务标识号：'+t.paymentRef,510,16)+rtext(570,451,'借贷标志：'+dc,17);
  b+=rtext(36,487,'实际记账账号：',17)+rfit(190,487,p.company.account,355,17)+rtext(570,487,'实际记账户名：',17)+rwrap(724,476,p.company.name,354,17,23);
  b+=rtext(36,536,'用途：',17)+rwrap(112,536,purpose,620,16,22)+rtext(36,588,'备注：',17)+rwrap(112,588,note,620,15,20)+receiptStamp(971,589,true);
  b+=rtext(36,681,`交易时间：${t.paymentTime}`,16)+rfit(330,681,`交易流水号：${t.paymentRef}`,508,16)+rtext(870,681,`经办：${p.maker}`,16)+line(36,695,1084,695,red,3);
 }else{
  h=730;
  b=rcenter(55,`${p.bankName}${t.direction==='income'?'汇入回单（来账）':'汇出回单（往账）'}`,27)+rtext(36,97,`回单号：${t.paymentRef}`,16)+rtext(1084,97,stampDate,18,'end');
  b+=box(36,115,1048,512,receiptInk)+rline(560,115,560,400)+[153,216,254,317,360,400,581].map(y=>rline(36,y,1084,y)).join('');
  for(const [x,party,label] of [[36,payer,'付款人'],[560,payee,'收款人']] as const){
   b+=rtext(x+262,141,label,22,'middle')+rtext(x+12,190,'全  称：',18)+rwrap(x+111,178,party.name,396,18,24);
   b+=rtext(x+12,242,'账  号：',18)+rfit(x+111,242,party.account,396,18);
   b+=rtext(x+12,290,'开户行：',18)+rwrap(x+111,278,party.bank,396,18,24);
  }
  b+=rtext(48,347,'金  额：',18)+rfit(147,347,chineseMoney(t.paid),397,18)+rtext(578,347,'小  写：',18)+rtext(681,347,'¥ '+money(t.paid),21);
  b+=rtext(48,387,'用  途：',18)+rwrap(147,377,purpose,397,15,18)+rtext(578,387,'摘  要：',18)+rfit(681,387,business+(t.direction==='income'?'汇入':'汇出'),385,17);
  b+=rtext(48,430,'备  注：',18)+rwrap(147,430,note,670,16,22)+receiptStamp(979,493)+rtext(820,568,'银行样章',16);
  b+=rtext(48,611,'操作流程',17)+rtext(213,611,'经办：'+p.maker,17)+rtext(456,611,'复核：'+p.reviewer,17)+rfit(713,611,'渠道：'+channel,355,16);
  b+=rtext(36,659,'回单查询码：SYNTHETIC（仅为测试字段）',16)+footer(694);
 }
 return finish(b,1120,h,`回单_${t.paymentRef}`,'receipt',{transactionId:t.id,templateId:`receipt-${style}`,templateVersion:'1.0'});
}
type StatementRow=ReturnType<typeof statement>[number];
type StatementColumn={label:string;en?:string;width:number;align?:'right'|'center';value:(r:StatementRow,index:number)=>string};
export function statementPages(p:Project):DocumentPage[]{
 const style=statementStyleOf(p),rows=statement(p),portrait=style==='portrait',w=portrait?1000:1584,h=portrait?1414:1120,margin=38;
 const signed=(r:StatementRow)=>(r.expense?'-':'')+money(r.income||r.expense);
 const amount=(n:number)=>money(n),business=(r:StatementRow)=>r.t.receiptBusiness??'普通汇兑',channel=(r:StatementRow)=>r.t.receiptChannel??'企业网上银行';
 const cols:StatementColumn[]=style==='grid'?[
  {label:'序号',width:52,align:'center',value:(_,i)=>String(i+1)},
  {label:'摘要 / 流水号',width:200,value:r=>(r.t.purpose||r.t.title)+'\n'+r.t.paymentRef},
  {label:'币别',width:68,align:'center',value:()=>'人民币'},
  {label:'交易日期',width:112,align:'center',value:r=>r.t.paymentDate.replace(/-/g,'')},
  {label:'交易金额',width:146,align:'right',value:signed},
  {label:'账户余额',width:153,align:'right',value:r=>amount(r.balance)},
  {label:'交易机构 / 渠道',width:329,value:r=>p.company.bank+'\n'+channel(r)},
  {label:'对方账号与户名',width:448,value:r=>r.t.counterparty.account+'\n'+r.t.counterparty.name},
 ]:style==='bilingual'?[
  {label:'记账日期',en:'Posting date',width:110,value:r=>r.t.paymentDate},
  {label:'记账时间',en:'Posting time',width:85,value:r=>r.t.paymentTime},
  {label:'币别',en:'Currency',width:60,align:'center',value:()=>'CNY'},
  {label:'金额',en:'Amount',width:133,align:'right',value:signed},
  {label:'余额',en:'Balance',width:145,align:'right',value:r=>amount(r.balance)},
  {label:'交易名称',en:'Transaction',width:114,value:business},
  {label:'交易渠道',en:'Channel',width:110,value:channel},
  {label:'附言 / 流水号',en:'Remark / Reference',width:210,value:r=>(r.t.purpose||r.t.title)+'\n'+r.t.paymentRef},
  {label:'对方户名',en:'Counterparty name',width:202,value:r=>r.t.counterparty.name},
  {label:'对方账号',en:'Counterparty account',width:159,value:r=>r.t.counterparty.account},
  {label:'对方开户行',en:'Counterparty bank',width:180,value:r=>r.t.counterparty.bank},
 ]:portrait?[
  {label:'记账日期',width:85,value:r=>r.t.paymentDate},
  {label:'币种',width:40,align:'center',value:()=>'CNY'},
  {label:'收入金额',width:100,align:'right',value:r=>amount(r.income)},
  {label:'支出金额',width:100,align:'right',value:r=>amount(r.expense)},
  {label:'联机余额',width:111,align:'right',value:r=>amount(r.balance)},
  {label:'交易摘要',width:113,value:business},
  {label:'交易对手信息',width:183,value:r=>r.t.counterparty.account+'\n'+r.t.counterparty.name},
  {label:'客户摘要 / 流水号',width:192,value:r=>(r.t.purpose||r.t.title)+'\n'+r.t.paymentRef},
 ]:[
  {label:'序号',en:'No.',width:51,align:'center',value:(_,i)=>String(i+1)},
  {label:'交易日期',en:'Trade date',width:109,value:r=>r.t.paymentDate},
  {label:'交易时间',en:'Trade time',width:94,value:r=>r.t.paymentTime},
  {label:'交易方式',en:'Channel',width:123,value:channel},
  {label:'收支标志',en:'Debit / Credit',width:90,align:'center',value:r=>r.income?'贷（收）':'借（付）'},
  {label:'交易金额',en:'Amount',width:139,align:'right',value:r=>amount(r.income||r.expense)},
  {label:'余额',en:'Balance',width:151,align:'right',value:r=>amount(r.balance)},
  {label:'对方账号',en:'Counterparty account',width:211,value:r=>r.t.counterparty.account},
  {label:'对方户名',en:'Counterparty name',width:244,value:r=>r.t.counterparty.name},
  {label:'摘要 / 流水号',en:'Remark / Reference',width:296,value:r=>(r.t.purpose||r.t.title)+'\n'+r.t.paymentRef},
 ];
 const size=portrait?12:14,gap=portrait?16:19,top=portrait?232:224,head=style==='bilingual'||style==='plain'?59:36,bottom=portrait?1230:936;
 const split=(s:string,width:number)=>s.split('\n').flatMap(part=>/^[A-Za-z0-9][A-Za-z0-9_.:/-]{11,}$/.test(part)?[part]:wrap(part,width,size).length?wrap(part,width,size):['']);
 const prepared=rows.map((r,index)=>{const cells=cols.map(c=>c.align==='right'||/日期|时间/.test(c.label)?[c.value(r,index)]:split(c.value(r,index),c.width-16));return {r,index,cells,height:Math.max(portrait?29:36,Math.max(...cells.map(a=>a.length))*gap+12)};});
 const chunks:typeof prepared[]=[];let chunk:typeof prepared=[],used=0;
 for(const row of prepared){if(chunk.length&&used+row.height>bottom-top-head){chunks.push(chunk);chunk=[];used=0;}chunk.push(row);used+=row.height;}if(chunk.length||!chunks.length)chunks.push(chunk);
 const period=`${rows[0]?.t.paymentDate??'—'} 至 ${rows.at(-1)?.t.paymentDate??'—'}`;
 const totalIn=rows.reduce((s,r)=>round2(s+r.income),0),totalOut=rows.reduce((s,r)=>round2(s+r.expense),0);
 return chunks.map((part,page)=>{
  const opening=page?chunks[page-1].at(-1)!.r.balance:p.openingBalance,closing=part.at(-1)?.r.balance??opening;
  const pageIncome=part.reduce((s,x)=>round2(s+x.r.income),0),pageExpense=part.reduce((s,x)=>round2(s+x.r.expense),0);
  const titles={grid:'单位活期账户全部交易明细',bilingual:'账户流水对账单',portrait:'账户历史交易明细表',plain:'账户交易清单'};
  let b='';
  if(portrait){b+=box(0,0,w,17,'none','#bd343d')+txt(w-38,60,p.bankName,27,'#8b2930','end',600)+txt(w/2,105,titles[style],25,receiptInk,'middle',600);}
  else{b+=rfit(38,62,p.bankName,315,27)+txt(w/2,65,titles[style],28,receiptInk,'middle',600);if(style==='bilingual'||style==='plain')b+=txt(w/2,91,'ACCOUNT TRANSACTION DETAILS',15,receiptInk,'middle');}
  const hy=portrait?144:129,leftWidth=portrait?475:748,right=portrait?535:840;
  b+=rfit(38,hy,'账户名称：'+p.company.name,leftWidth,portrait?14:17)+rfit(right,hy,'账号：'+p.company.account,w-right-38,portrait?14:17);
  b+=rfit(38,hy+28,'开户机构：'+p.company.bank,leftWidth,portrait?13:16)+rtext(right,hy+28,'查询期间：'+period,portrait?13:16);
  b+=rtext(38,hy+57,`币种：人民币 CNY · 本期 ${rows.length} 笔`,portrait?13:16)+rtext(w-38,hy+57,`第 ${page+1} / ${chunks.length} 页`,portrait?13:16,'end');
  const grid=style==='grid',soft=style==='bilingual',red=style==='portrait';
  b+=rtext(38,top-11,`${page?'承前页余额':'期初余额'}：${money(opening)}`,portrait?12:15);
  if(soft)b+=box(38,top,w-76,head,'none','#e6e6e6');
  b+=line(38,top,w-38,top,red?'#962c34':'#333',red?1.7:1)+line(38,top+head,w-38,top+head,'#444',1);
  let x=38;for(const c of cols){const center=x+c.width/2;b+=txt(center,top+(c.en?23:24),c.label,portrait?12:15,receiptInk,'middle',500);if(c.en)b+=txt(center,top+43,c.en,11,receiptInk,'middle');x+=c.width;}
  let y=top+head;
  for(const row of part){x=38;cols.forEach((c,i)=>{row.cells[i].forEach((value,j)=>{const anchor=c.align==='right'?'end':c.align==='center'?'middle':'start',tx=c.align==='right'?x+c.width-8:c.align==='center'?x+c.width/2:x+8;const measured=Array.from(value).reduce((n,ch)=>n+(ch.charCodeAt(0)>255?size:size*.58),0);b+=`<g transform="translate(${tx} ${y+size+7+j*gap}) scale(${Math.min(1,(c.width-16)/(measured||1))} 1)">${txt(0,0,value,size,receiptInk,anchor)}</g>`;});x+=c.width;});y+=row.height;if(grid||soft)b+=line(38,y,w-38,y,grid?'#777':'#c1c1c1',.7);}
  if(!part.length){b+=txt(w/2,y+55,'本期无已收付交易',18,'#666','middle');y+=100;}
  if(grid||soft){x=38;for(const c of cols){b+=line(x,top,x,y,'#777',.7);x+=c.width;}b+=line(w-38,top,w-38,y,'#777',.7);}else b+=line(38,y,w-38,y,'#777',.8);
  const fy=bottom+30;
  b+=rtext(38,fy,`本页收入：${money(pageIncome)} · 本页支出：${money(pageExpense)}`,portrait?12:16)+rtext(w-38,fy,`本页结余：${money(closing)}`,portrait?12:16,'end');
  b+=rtext(38,fy+29,`本期收入：${money(totalIn)} · 本期支出：${money(totalOut)}`,portrait?12:16)+rtext(w-38,fy+29,`期末余额：${money(rows.at(-1)?.balance??p.openingBalance)}`,portrait?12:16,'end');
  b+=rtext(38,fy+62,`本页 ${part.length} 笔${part.length?` · 序号 ${part[0].index+1}–${part.at(-1)!.index+1}`:''}；按交易日期与时间排序。`,portrait?12:15);
  // Place the sample seal in a reserved header area, away from transaction data.
  b+=`<g transform="translate(${portrait?846:1422} ${portrait?93:62}) scale(.55)">${receiptStamp(0,0,true)}</g>`;
  if(red)b+=line(38,h-44,w-38,h-44,'#962c34',1.5);
  return finish(b,w,h,`银行流水_${String(page+1).padStart(2,'0')}`,'statement',{templateId:`statement-${style}`,templateVersion:'1.1',statementSummary:{opening,closing,income:pageIncome,expense:pageExpense,first:part[0]?.index===undefined?0:part[0].index+1,last:part.at(-1)?.index===undefined?0:part.at(-1)!.index+1,count:part.length}});
 });
}
const round2=(v:number)=>Math.round(v*100)/100;
function standardVoucher(p:Project,t:Transaction,stage:'invoice'|'payment'):DocumentPage{
 const es=entries(p,t,stage),color='#3d4e43';let b=txt(560,72,'记 账 凭 证',34,color,'middle',600)+line(440,88,680,88,color,2)+txt(40,127,`核算单位：${p.company.name}`,17)+txt(560,160,`日期：${stage==='invoice'?t.date:t.paymentDate}`,18,'#192431','middle')+txt(1080,127,`记字第 ${t.voucherNo}-${stage==='invoice'?'A':'B'} 号`,18,'#192431','end')+txt(1080,160,`附件：${t.voucherAttachments??1} 张`,16,'#192431','end');
 const cols=[40,336,784,932,1080];b+=box(40,187,1040,346,color)+box(40,187,1040,46,'none','#f3f5f2');cols.slice(1,-1).forEach(x=>b+=line(x,187,x,533,color));['摘 要','会计科目','借方金额','贷方金额'].forEach((h,i)=>b+=txt((cols[i]+cols[i+1])/2,217,h,19,color,'middle'));
 for(let i=0;i<=5;i++)b+=line(40,233+i*60,1080,233+i*60,color);
 es.forEach((e,i)=>{const y=257+i*60;b+=multiline(52,y-3,e.summary,272,14,'#192431',17)+multiline(350,y,e.subject,420,14,'#192431',18)+txt(916,y+10,e.debit?money(e.debit):'',18,'#192431','end')+txt(1064,y+10,e.credit?money(e.credit):'',18,'#192431','end');});
 const debit=es.reduce((s,e)=>round2(s+e.debit),0),credit=es.reduce((s,e)=>round2(s+e.credit),0);
 b+=box(40,533,1040,52,color)+txt(56,565,'合计',19)+txt(350,565,chineseMoney(debit),17)+txt(916,565,money(debit),19,'#192431','end')+txt(1064,565,money(credit),19,'#192431','end');
 b+=txt(42,629,`财务主管：${p.reviewer}`,17)+txt(335,629,`复核：${p.reviewer}`,17)+txt(610,629,`出纳：${p.cashier}`,17)+txt(865,629,`制单：${p.maker}`,17)+txt(42,684,`原始单据：${stage==='invoice'?'发票 '+t.invoiceNo:'银行回单 '+t.paymentRef}`,15,'#687487');
 return finish(b,1120,745,`凭证_${t.voucherNo}-${stage==='invoice'?'A':'B'}`,'voucher',{transactionId:t.id,stage,templateId:'voucher-standard',templateVersion:'1.0'});
}
const amountUnits=['百','十','亿','千','百','十','万','千','百','十','元','角','分'];
export function amountDigits(value:number):string[]{if(!Number.isFinite(value)||value<0||value>=1e11)throw Error('分位金额超出范围');const s=Math.round(value*100).toString();return [...s.padStart(13,' ')];}
function digitGrid(x:number,y:number,width:number,height:number,header=true){let b='';for(let i=0;i<=13;i++)b+=line(x+i*width/13,y,x+i*width/13,y+height,i===11?'#8e4d4d':'#777',i===11?1.2:.7);if(header){b+=rline(x,y+30,x+width,y+30,.8);amountUnits.forEach((u,i)=>b+=txt(x+(i+.5)*width/13,y+21,u,14,receiptInk,'middle'));}return b;}
function digitAmount(x:number,y:number,width:number,value:number,blankZero=false){if(!Number.isFinite(value)||value<0||value>=1e11)return txt(x+width/2,y,'金额待修正',14,'#9a3434','middle');if(blankZero&&!value)return '';const digits=amountDigits(value),first=digits.findIndex(d=>d!==' ');return digits.map((d,i)=>txt(x+(i+.5)*width/13,y,i===first-1?'¥':d,17,receiptInk,'middle')).join('');}
function digitsVoucher(p:Project,t:Transaction,stage:'invoice'|'payment'):DocumentPage{
 const es=entries(p,t,stage),w=1340;let b=txt(w/2,63,'记 账 凭 证',34,receiptInk,'middle')+rline(493,76,846,76)+rline(493,81,846,81)+rtext(40,124,'核算单位：'+p.company.name,18)+rtext(w-40,124,`记字第 ${t.voucherNo}-${stage==='invoice'?'A':'B'} 号`,18,'end')+txt(w/2,158,stage==='invoice'?t.date:t.paymentDate,18,receiptInk,'middle');
 const top=180,headerEnd=264,bottom=604,cols=[40,280,500,780,1040,1300];b+=box(40,top,1260,486,receiptInk)+[280,500,780,1040].map(x=>rline(x,top,x,666)).join('');
 ['摘 要','一级科目','明细科目'].forEach((s,i)=>b+=txt((cols[i]+cols[i+1])/2,228,s,22,receiptInk,'middle'));
 b+=txt(910,214,'借 方',22,receiptInk,'middle')+txt(1170,214,'贷 方',22,receiptInk,'middle')+rline(780,234,1300,234);
 b+=digitGrid(780,234,260,432)+digitGrid(1040,234,260,432);
 for(let i=0;i<=5;i++)b+=rline(40,headerEnd+i*68,1300,headerEnd+i*68,.8);
 es.forEach((e,i)=>{const y=headerEnd+i*68;const [main,...sub]=e.subject.split(' / ');b+=rwrap(51,y+21,e.summary,218,13,17)+rwrap(290,y+19,main,200,12,15)+rwrap(511,y+21,sub.join(' / '),258,13,17)+digitAmount(780,y+40,260,e.debit,true)+digitAmount(1040,y+40,260,e.credit,true);});
 const debit=round2(es.reduce((n,e)=>n+e.debit,0)),credit=round2(es.reduce((n,e)=>n+e.credit,0));
 b+=rtext(62,bottom+39,'合 计',22)+rfit(292,bottom+37,chineseMoney(debit),471,17)+digitAmount(780,bottom+39,260,debit)+digitAmount(1040,bottom+39,260,credit);
 b+=rtext(40,712,'财务主管：'+p.reviewer,17)+rtext(359,712,'复核：'+p.reviewer,17)+rtext(660,712,'出纳：'+p.cashier,17)+rtext(980,712,'制单：'+p.maker,17)+rtext(40,751,'原始单据：'+(stage==='invoice'?t.invoiceNo:t.paymentRef),16)+rtext(1300,751,`附件：${t.voucherAttachments??1} 张`,16,'end');
 return finish(b,w,795,`凭证_${t.voucherNo}-${stage==='invoice'?'A':'B'}`,'voucher',{transactionId:t.id,stage,templateId:'voucher-digits',templateVersion:'1.0'});
}
function paymentProof(p:Project,t:Transaction):DocumentPage{
 const amount=t.paid;let b=txt(600,64,'支 付 证 明 单',34,receiptInk,'middle')+rline(410,78,790,78)+rline(410,83,790,83)+rfit(40,125,'科目：'+p.accountSubject,780,17)+rtext(1160,125,'编号：付证-'+t.voucherNo,18,'end')+txt(600,158,t.paymentDate,18,receiptInk,'middle');
 b+=box(40,183,1120,557,receiptInk);const cols=[40,488,565,640,780,1160];cols.slice(1,-1).forEach(x=>b+=rline(x,183,x,471));
 ['事由或品名','数量','单位','单价'].forEach((label,i)=>b+=txt((cols[i]+cols[i+1])/2,218,label,19,receiptInk,'middle'));
 b+=txt(970,207,'金 额',20,receiptInk,'middle')+rline(780,218,1160,218)+digitGrid(780,218,380,253);
 for(const y of [248,310,372,434,471,525,675])b+=rline(40,y,1160,y,.9);
 b+=rwrap(52,274,t.purpose||t.title,423,17,23)+txt(526,283,'1',18,receiptInk,'middle')+txt(602,283,'笔',18,receiptInk,'middle')+rfit(651,283,invoiceMoney(amount),116,17)+digitAmount(780,283,380,amount);
 b+=rtext(52,459,'合 计',18)+digitAmount(780,459,380,amount);
 b+=rtext(53,506,'共计金额（大写）',18)+rfit(265,506,chineseMoney(amount),620,18)+rtext(1141,506,'¥ '+money(amount),19,'end');
 b+=rline(190,525,190,675)+rline(640,525,640,675)+rline(807,525,807,675)+rtext(63,570,'受款人',19)+rwrap(205,552,t.counterparty.name,420,17,23)+rwrap(657,553,'补充说明 /\n未附单据原因'.replace('\n',''),135,17,23)+rwrap(820,545,t.voucherReason??'',325,13,17);
 b+=rtext(54,712,'付款账户：',17)+rfit(175,712,p.company.account,360,17)+rtext(565,712,'关联回单：',17)+rfit(687,712,t.paymentRef,453,17);
 b+=rtext(40,780,'主管：'+p.reviewer,17)+rtext(330,780,'会计：'+p.reviewer,17)+rtext(620,780,'出纳：'+p.cashier,17)+rtext(900,780,'经手人：'+p.maker,17);
 return finish(b,1200,835,`支付证明单_${t.voucherNo}`,'voucher',{transactionId:t.id,templateId:'voucher-proof',templateVersion:'1.0'});
}
function paymentRequest(p:Project,t:Transaction):DocumentPage{
 const amount=requestAmountOf(t);let b=txt(600,66,'请 款 单',36,receiptInk,'middle')+rline(450,82,750,82)+txt(600,121,t.requestDate??t.date,18,receiptInk,'middle')+rtext(1160,121,'编号：请款-'+t.voucherNo,17,'end');
 b+=box(40,151,1120,443,receiptInk)+rline(40,216,1160,216)+rline(40,298,1160,298)+rline(40,398,1160,398)+rline(40,478,1160,478);
 b+=rtext(55,190,'部门：',19)+rfit(132,190,t.voucherDepartment??'',376,18)+rtext(552,190,'申请项目：',19)+rfit(685,190,t.title,455,18);
 b+=rline(202,216,202,298)+rline(804,216,804,298)+rtext(55,246,'申请金额',18)+rtext(55,274,'（大写）',18)+rfit(219,265,chineseMoney(amount),570,20)+digitGrid(804,216,356,82)+digitAmount(804,281,356,amount);
 b+=rtext(55,332,'请款理由：',19)+rwrap(199,332,t.voucherReason||t.purpose||t.title,942,17,23);
 b+=rtext(55,433,'收款单位：',18)+rwrap(199,426,t.counterparty.name,472,17,23)+rtext(705,426,'收款账号：',17)+rfit(705,458,t.counterparty.account,435,17);
 const roles=['单位负责人','部门负责人','财务负责人','经办人'];for(let i=0;i<4;i++){if(i)b+=rline(40+i*280,478,40+i*280,594);b+=rtext(56+i*280,509,roles[i],18);if(i===3)b+=rtext(896,554,p.maker,20);}
 b+=rfit(40,633,'申请单位：'+p.company.name,780,17)+rtext(1160,633,'申请金额：¥ '+money(amount),19,'end')+rtext(40,675,'申请金额不代表已付款；实际收付以对应交易记录为准。',15);
 return finish(b,1200,726,`请款单_${t.voucherNo}`,'voucher',{transactionId:t.id,templateId:'voucher-request',templateVersion:'1.0'});
}
export function voucher(p:Project,t:Transaction,stage:'invoice'|'payment'):DocumentPage{
 const style=voucherStyleOf(t);return style==='proof'?paymentProof(p,t):style==='request'?paymentRequest(p,t):ledgerVoucher(p,t,stage);
}
export function ledgerVoucher(p:Project,t:Transaction,stage:'invoice'|'payment'):DocumentPage{return voucherStyleOf(t)==='digits'?digitsVoucher(p,t,stage):standardVoucher(p,t,stage);}
export function documentPages(p:Project,t:Transaction,k:DocKind,stage:'invoice'|'payment'='invoice'):DocumentPage[]{return t.recordType==='bank'&&(k==='invoice'||k==='voucher')?[]:k==='invoice'?[invoice(p,t)]:k==='receipt'?[receipt(p,t)]:k==='statement'?statementPages(p):[voucher(p,t,stage)];}
export function allPages(p:Project):DocumentPage[]{return [...p.transactions.flatMap(t=>t.recordType==='bank'?(t.paid>0?[receipt(p,t)]:[]):[invoice(p,t),...(t.paid>0?[receipt(p,t)]:[]),ledgerVoucher(p,t,'invoice'),...(t.paid>0?[ledgerVoucher(p,t,'payment')]:[]),...(!isLedgerVoucher(t)&&!voucherUnavailable(t,'payment')?[voucher(p,t,'payment')]:[])]),...statementPages(p)];}
