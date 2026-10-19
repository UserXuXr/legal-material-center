import {imageAndTextPDF,withTimeout} from '../../../shared/pdf.js';
import {type Project,type DocKind,voucherStyleOf,voucherStyles,isLedgerVoucher,voucherUnavailable,requestAmountOf,statementStyleOf,statementStyles,receiptStyleOf,receiptStyles,totals,itemAmounts,entries,statement,validate} from './finance';
import {type DocumentPage,allPages} from './documents';
export type Appearance='digital'|'scan';
export const safeName=(s:string)=>s.replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'财务素材';
export function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=safeName(name);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function saveProject(p:Project){download(new Blob([JSON.stringify(p,null,2)],{type:'application/json;charset=utf-8'}),p.name+'_填写方案.json');}
export function appearanceSVG(svg:string,mode:Appearance){return mode==='digital'?svg:svg.replace('<g font-family=',`<defs><filter id="scan"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="0.86" intercept="0.055"/><feFuncG type="linear" slope="0.86" intercept="0.055"/><feFuncB type="linear" slope="0.86" intercept="0.055"/></feComponentTransfer></filter></defs><g filter="url(#scan)" font-family=`);}
export async function pngData(page:DocumentPage,mode:Appearance):Promise<string>{
 await document.fonts.ready;
 const svg=appearanceSVG(page.svg,mode),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{const im=new Image();await new Promise<void>((resolve,reject)=>{im.onload=()=>resolve();im.onerror=()=>reject(Error('图像生成失败，请尝试 SVG 导出'));im.src=url;});const canvas=document.createElement('canvas');canvas.width=page.width*2;canvas.height=page.height*2;const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器无法创建图像');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(im,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');}finally{URL.revokeObjectURL(url);}
}
export async function pdfFromImages(pages:DocumentPage[],images:string[],options={}){return imageAndTextPDF(pages,images,options);}
export async function exportPDF(pages:DocumentPage[],mode:Appearance,render=pngData,options={}){const images=[];for(const page of pages)images.push(await withTimeout(render(page,mode)));return pdfFromImages(pages,images,options);}
export function financialGroups(p:Project){
 const groups=new Map<string,{id:string;name:string;kind:DocKind;pages:DocumentPage[]}>();
 for(const page of allPages(p)){
  const id=page.kind==='statement'?'statement':`${page.kind}-${page.transactionId}-${page.stage??page.templateId??'document'}`;
  let group=groups.get(id);if(!group){group={id,name:page.kind==='statement'?p.name+'_银行流水':page.name,kind:page.kind,pages:[]};groups.set(id,group);}group.pages.push(page);
 }
 return [...groups.values()];
}
export function csvCell(value:unknown){let s=String(value??'');if(typeof value==='string'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
export function csvRows(rows:unknown[][]){return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');}
export function dataRows(p:Project,kind:DocKind):unknown[][]{
 if(kind==='statement')return [['交易日期','时间','银行流水号','本方户名','本方账号','对方户名','对方账号','摘要','收入金额','支出金额','余额','流水版式','模板版本','对方开户行','业务种类','交易渠道','记录来源'],...statement(p).map(r=>[r.t.paymentDate,r.t.paymentTime,r.t.paymentRef,p.company.name,p.company.account,r.t.counterparty.name,r.t.counterparty.account,r.t.purpose,r.income,r.expense,r.balance,statementStyles.find(s=>s.value===statementStyleOf(p))!.label,'1.0',r.t.counterparty.bank,r.t.receiptBusiness??'普通汇兑',r.t.receiptChannel??'企业网上银行',r.source==='case'?'案件交易':'日常补全'])];
 if(kind==='voucher')return [['凭证日期','凭证号','阶段','摘要','会计科目','借方金额','贷方金额','关联单据号','模板名称','模板版本','业务单据金额'],...p.transactions.flatMap(t=>{
 const ledger=(['invoice','payment'] as const).flatMap(stage=>entries(p,t,stage).map(e=>[stage==='invoice'?t.date:t.paymentDate,`${t.voucherNo}-${stage==='invoice'?'A':'B'}`,stage==='invoice'?'开票确认':'收付款',e.summary,e.subject,e.debit,e.credit,stage==='invoice'?t.invoiceNo:t.paymentRef,voucherStyleOf(t)==='digits'?'金额分位记账凭证':'通用记账凭证','1.0','']));
 if(!isLedgerVoucher(t)&&!voucherUnavailable(t,'payment')){const request=voucherStyleOf(t)==='request';ledger.push([request?t.requestDate??t.date:t.paymentDate,(request?'请款-':'付证-')+t.voucherNo,request?'请款申请':'支付证明',t.voucherReason||t.purpose,'','','',request?t.invoiceNo:t.paymentRef,voucherStyles.find(s=>s.value===voucherStyleOf(t))!.label,'1.0',request?requestAmountOf(t):t.paid]);}return ledger;})];
 if(kind==='receipt')return [['交易日期','时间','流水号','付款人','付款账号','收款人','收款账号','金额','币种','用途','回单版式','模板版本','业务种类','交易渠道','回单备注'],...p.transactions.filter(t=>t.paid>0).map(t=>{const payer=t.direction==='income'?t.counterparty:p.company,payee=t.direction==='income'?p.company:t.counterparty;return[t.paymentDate,t.paymentTime,t.paymentRef,payer.name,payer.account,payee.name,payee.account,t.paid,'CNY',t.purpose,receiptStyles.find(s=>s.value===receiptStyleOf(t))!.label,'1.0',t.receiptBusiness??'普通汇兑',t.receiptChannel??'企业网上银行',t.receiptNote??''];})];
 return [['开票日期','发票号码','票种','购方名称','销方名称','项目名称','规格型号','单位','数量','不含税单价','税率','不含税金额','税额','价税合计'],...p.transactions.filter(t=>t.recordType!=='bank').flatMap(t=>t.items.map(i=>{const {net,tax}=itemAmounts(i);return[t.date,t.invoiceNo,t.invoiceType,t.direction==='income'?t.counterparty.name:p.company.name,t.direction==='income'?p.company.name:t.counterparty.name,i.name,i.spec,i.unit,i.quantity,i.price,i.rate/100,net,tax,Math.round((net+tax)*100)/100];}))];
}
export async function workbookBuffer(p:Project):Promise<ArrayBuffer>{
 const mod=await import('exceljs');const ExcelJS=mod.default;const wb=new ExcelJS.Workbook();wb.creator='财务素材工作台';wb.subject='合成测试样本';
 const overview=wb.addWorksheet('批次说明');overview.columns=[{width:24},{width:70}];overview.addRows([['财务素材合成批次',p.name],['用途','合成测试样本，不用于真实业务'],['本方企业',p.company.name],['本方账户',p.company.account],['期初余额',p.openingBalance],['币种','人民币 CNY'],['会计口径','按开票确认和实际收付款分别生成凭证；专票采购默认可抵扣，普票采购价税计入所填科目。'],['发票模板','2024年12月起数电发票结构；银行为虚构模板'],['日常补全','仅补入银行流水，不生成发票、回单或会计凭证；流水表记录来源列区分案件与日常。'],['关联方式','按发票号码、银行流水号和凭证编号关联；完整可复用方案见 JSON。']]);overview.getCell('B5').numFmt='#,##0.00';
 for(const [kind,title] of [['invoice','发票明细'],['receipt','银行回单'],['statement','银行流水'],['voucher','会计凭证']] as [DocKind,string][]){const ws=wb.addWorksheet(title);const rows=dataRows(p,kind);ws.addRows(rows);ws.views=[{state:'frozen',ySplit:1}];ws.autoFilter={from:{row:1,column:1},to:{row:rows.length,column:rows[0].length}};ws.columns.forEach((col,i)=>{col.width=['项目名称','购方名称','销方名称','付款人','收款人','本方户名','对方户名','会计科目','摘要','用途'].includes(String(rows[0][i]))?35:22;});ws.getRow(1).height=28;ws.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF23425A'}};});ws.eachRow((r,n)=>{if(n===1)return;r.height=23;r.eachCell((c,i)=>{if(typeof c.value==='number')c.numFmt='#,##0.00';if(i===1&&typeof c.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(c.value)){c.value=new Date(c.value+'T00:00:00Z');c.numFmt='yyyy-mm-dd';}});});
 if(kind==='invoice')for(let r=2;r<=rows.length;r++){ws.getCell(`J${r}`).numFmt='0.############';ws.getColumn('J').width=26;ws.getCell(`K${r}`).numFmt='0.##%';ws.getCell(`L${r}`).value={formula:`ROUND(I${r}*J${r},2)`,result:rows[r-1][11] as number};ws.getCell(`M${r}`).value={formula:`ROUND(L${r}*K${r},2)`,result:rows[r-1][12] as number};ws.getCell(`N${r}`).value={formula:`L${r}+M${r}`,result:rows[r-1][13] as number};}
 if(kind==='statement')for(let r=2;r<=rows.length;r++)ws.getCell(`K${r}`).value={formula:r===2?`'批次说明'!B5+I${r}-J${r}`:`K${r-1}+I${r}-J${r}`,result:rows[r-1][10] as number};
 ws.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};ws.headerFooter.oddFooter='合成测试样本 · 不用于真实业务 | 第 &P 页 / 共 &N 页';}
 return await wb.xlsx.writeBuffer() as ArrayBuffer;
}
export async function exportBundle(p:Project,mode:Appearance,onProgress:(n:number,label:string)=>void,renderPage=pngData,pdfOptions={}){
 const errors=validate(p);if(errors.length)throw Error(errors[0]);const {default:JSZip}=await import('jszip');const zip=new JSZip();const groups=financialGroups(p);const folders={invoice:'01_发票',receipt:'02_银行回单',statement:'03_银行流水',voucher:'04_会计凭证'};
 const count=groups.reduce((n,g)=>n+g.pages.length,0);let done=0;const manifest=[];
 for(const group of groups){
  const base=`delivery/${folders[group.kind]}/${safeName(group.name)}`,images=[];
  for(const [i,page] of group.pages.entries()){
   const png=await withTimeout(renderPage(page,mode));images.push(png);zip.file(`${base}_p${i+1}.svg`,appearanceSVG(page.svg,mode));zip.file(`${base}_p${i+1}.png`,png.split(',')[1],{base64:true});onProgress(Math.round(++done/count*88),`正在生成 ${done} / ${count} 页`);
  }
  zip.file(base+'.pdf',await (await pdfFromImages(group.pages,images,pdfOptions)).arrayBuffer());manifest.push({document_id:group.id,path:base+'.pdf',pages:group.pages.length});
 }
 zip.file('authoring/填写方案.json',JSON.stringify(p,null,2));zip.file('authoring/财务关联台账.xlsx',await workbookBuffer(p));for(const kind of ['invoice','receipt','statement','voucher'] as DocKind[])zip.file(`authoring/${folders[kind]}.csv`,csvRows(dataRows(p,kind)));
 zip.file('authoring/素材索引.json',JSON.stringify({schema_version:2,batch:p.name,synthetic:true,appearance:mode,documents:manifest},null,2));
 zip.file('使用说明.txt','delivery 为业务材料，authoring 为制作记录，不向被测模型发放。\n同一流水全部页合并为一份PDF；PNG和SVG按页保存。\nPDF默认保留原版面并加入SVG文字层，底图内的图片文字不包括在文字层中。\n逐份制作与失败重试请使用批量制作入口。\n');return zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:4}},meta=>onProgress(Math.round(92+meta.percent*.08),'正在打包文件'));
}
