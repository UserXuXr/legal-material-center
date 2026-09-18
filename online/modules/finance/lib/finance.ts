export type DocKind = 'invoice' | 'receipt' | 'statement' | 'voucher';
export const receiptStyles = [
 {value:'compact',label:'紧凑表格式',description:'完整网格、左右账户、底部验证栏；参考北京银行 / 光大样本。'},
 {value:'corporate',label:'单位客户式',description:'纵向收付标签、大块备注、右下章码；参考建行 / 工行样本。'},
 {value:'payment',label:'支付业务式',description:'无框双栏、业务信息分区、底部流水；参考中行 / 民生样本。'},
 {value:'remittance',label:'汇入 / 汇出式',description:'收付双方逐行对照、宽备注区、经办流程；参考兴业样本。'},
] as const;
export type ReceiptStyle = typeof receiptStyles[number]['value'];
export const receiptStyleOf = (t:Transaction):ReceiptStyle => receiptStyles.some(s=>s.value===t.receiptStyle)?t.receiptStyle!:'compact';
export const statementStyles = [
 {value:'grid',label:'横向网格式'},
 {value:'bilingual',label:'双语明细式'},
 {value:'portrait',label:'竖版收支式'},
 {value:'plain',label:'横向简表式'},
] as const;
export type StatementStyle = typeof statementStyles[number]['value'];
export const statementStyleOf = (p:Project):StatementStyle => statementStyles.some(s=>s.value===p.statementStyle)?p.statementStyle!:'grid';
export const voucherStyles=[{value:'standard',label:'通用记账凭证'},{value:'digits',label:'金额分位记账凭证'},{value:'proof',label:'支付证明单'},{value:'request',label:'请款单'}] as const;
export type VoucherStyle=typeof voucherStyles[number]['value'];
export const voucherStyleOf=(t:Transaction):VoucherStyle=>voucherStyles.some(s=>s.value===t.voucherStyle)?t.voucherStyle!:'standard';
export const isLedgerVoucher=(t:Transaction)=>['standard','digits'].includes(voucherStyleOf(t));
export function voucherUnavailable(t:Transaction,stage:'invoice'|'payment'):string{
 if(t.recordType==='bank')return '仅银行收付记录不自动生成会计凭证。';
 const style=voucherStyleOf(t);if((style==='proof'||style==='request')&&t.direction!=='expense')return '支付证明单与请款单用于本方支出，请选择一笔采购 / 付款交易。';
 if((style==='proof'||isLedgerVoucher(t)&&stage==='payment')&&t.paid<=0)return '本笔交易尚未收付款，请填写实际收付金额。';return '';
}
export const requestAmountOf=(t:Transaction)=>t.requestAmount??totals(t).gross;
export type Party = { name: string; taxId: string; bank: string; account: string; address: string };
export type Item = { id: string; name: string; spec: string; unit: string; quantity: number; price: number; rate: number };
export type Transaction = { recordType?: 'trade' | 'bank'; id: string; title: string; direction: 'income' | 'expense'; invoiceType: '普通发票' | '增值税专用发票'; invoiceNo: string; date: string; downloadCount?: number; voucherStyle?: VoucherStyle; voucherAttachments?: number; voucherDepartment?: string; voucherReason?: string; requestAmount?: number; requestDate?: string; receiptStyle?: ReceiptStyle; receiptBusiness?: string; receiptChannel?: string; receiptNote?: string; paymentDate: string; paymentTime: string; paymentRef: string; voucherNo: string; counterparty: Party; items: Item[]; paid: number; purpose: string; note: string };
export type BankMovement = Pick<Transaction,'id'|'title'|'direction'|'paymentDate'|'paymentTime'|'paymentRef'|'counterparty'|'paid'|'purpose'|'receiptBusiness'|'receiptChannel'>;
export type BackgroundMovement = BankMovement & {category:string};
export type BackgroundConfig = {start:string;end:string;count:number;incomePercent:number;expenseMin:number;expenseMax:number;incomeMin:number;incomeMax:number;seed:string};
export const validDate=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export type Project = { version: 1; background?: BackgroundMovement[]; backgroundConfig?: BackgroundConfig; statementStyle?: StatementStyle; name: string; company: Party; openingBalance: number; bankName: string; accountSubject: string; incomeSubject: string; expenseSubject: string; maker: string; reviewer: string; cashier: string; transactions: Transaction[] };
export type Entry = { summary: string; subject: string; debit: number; credit: number };
export const docLabels: Record<DocKind,string> = { invoice:'发票', receipt:'银行回单', statement:'银行流水', voucher:'会计凭证' };
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = (n: number) => (Number.isFinite(n) ? n : 0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
export const unitPrice = (n:number) => (Number.isFinite(n)?n:0).toLocaleString('en-US',{useGrouping:false,maximumFractionDigits:12});
export const invoiceMoney = (n:number) => (Number.isFinite(n)?n:0).toFixed(2);
export const itemAmounts = (i: Item) => { const net=round(i.quantity*i.price); const tax=round(net*i.rate/100); return {net,tax,gross:round(net+tax)}; };
export const totals = (t: Transaction) => t.items.reduce((a,i)=>{const b=itemAmounts(i);return {net:round(a.net+b.net),tax:round(a.tax+b.tax),gross:round(a.gross+b.gross)};},{net:0,tax:0,gross:0});
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function chineseMoney(value: number): string {
 if (!Number.isFinite(value) || value < 0 || value >= 1e12) return '金额超出范围';
 const digits='零壹贰叁肆伍陆柒捌玖'; const cents=Math.round(value*100); let whole=Math.floor(cents/100);
 const small=(n:number)=>{let str='',zero=false;for(let i=3;i>=0;i--){const d=Math.floor(n/10**i)%10;if(d){if(zero&&str)str+='零';str+=digits[d]+['','拾','佰','仟'][i];zero=false;}else if(str)zero=true;}return str;};
 let result=''; const groups:number[]=[]; do{groups.push(whole%10000);whole=Math.floor(whole/10000);}while(whole);
 let gap=false;for(let i=groups.length-1;i>=0;i--){const g=groups[i];if(g){if(result&&(gap||g<1000))result+='零';result+=small(g)+['','万','亿'][i];gap=false;}else if(result)gap=true;}
 result=(result||'零')+'元';const j=Math.floor(cents%100/10),f=cents%10;
 return result+(j?digits[j]+'角':f?'零':'')+(f?digits[f]+'分':j?'':'整');
}
export function entries(p:Project,t:Transaction,stage:'invoice'|'payment'):Entry[]{
 if(t.recordType==='bank')return [];
 const a=totals(t),summary=t.purpose||t.title;
 if(stage==='payment')return t.paid>0 ? t.direction==='income'?[{summary,subject:p.accountSubject,debit:t.paid,credit:0},{summary,subject:`1122 应收账款 / ${t.counterparty.name}`,debit:0,credit:t.paid}]:[{summary,subject:`2202 应付账款 / ${t.counterparty.name}`,debit:t.paid,credit:0},{summary,subject:p.accountSubject,debit:0,credit:t.paid}] : [];
 if(t.direction==='income')return [{summary,subject:`1122 应收账款 / ${t.counterparty.name}`,debit:a.gross,credit:0},{summary,subject:p.incomeSubject,debit:0,credit:a.net},...(a.tax?[{summary,subject:'2221 应交税费 / 应交增值税 / 销项税额',debit:0,credit:a.tax}]:[])];
 const deduct=t.invoiceType==='增值税专用发票';
 return [{summary,subject:p.expenseSubject,debit:deduct?a.net:a.gross,credit:0},...(deduct&&a.tax?[{summary,subject:'2221 应交税费 / 应交增值税 / 进项税额',debit:a.tax,credit:0}]:[]),{summary,subject:`2202 应付账款 / ${t.counterparty.name}`,debit:0,credit:a.gross}];
}
export function statement(p:Project){let balance=p.openingBalance;const movements:{t:BankMovement;source:'case'|'background'}[]=[...p.transactions.filter(t=>t.paid>0).map(t=>({t,source:'case' as const})),...(p.background??[]).map(t=>({t,source:'background' as const}))];return movements.sort((a,b)=>(a.t.paymentDate+a.t.paymentTime+a.t.id).localeCompare(b.t.paymentDate+b.t.paymentTime+b.t.id)).map(({t,source})=>{const income=t.direction==='income'?t.paid:0,expense=t.direction==='expense'?t.paid:0;balance=round(balance+income-expense);return {t,source,income,expense,balance};});}
export function validateBackgroundConfig(c:BackgroundConfig):string[]{
 const e:string[]=[];if(!c||!validDate(c.start)||!validDate(c.end)||c.end<c.start||Date.parse(c.end)-Date.parse(c.start)>365*86400000)e.push('补全日期需有效、起止有序，最多覆盖366天');
 if(!c||!Number.isInteger(c.count)||c.count<1||c.count>500)e.push('补全笔数需为1–500的整数');
 if(!c||!Number.isInteger(c.incomePercent)||c.incomePercent<0||c.incomePercent>100)e.push('收入笔数占比需为0–100的整数');
 if(!c||typeof c.seed!=='string'||!c.seed.trim()||c.seed.length>40)e.push('生成种子需为1–40个字符');
 for(const side of ['income','expense'] as const){const min=c?.[`${side}Min`],max=c?.[`${side}Max`];if(!Number.isFinite(min)||!Number.isFinite(max)||min<.01||max>1e7||min>max||round(min)!==min||round(max)!==max)e.push(`${side==='income'?'收入':'支出'}金额范围需在0.01–1000万元之间，最多两位小数`);}
 return e;
}
const party=(name:string,taxId:string,account:string):Party=>({name,taxId,account,bank:'澄川银行上海科创支行（虚构）',address:'上海市浦东新区云杉路 168 号（虚构地址）'});
export function demo():Project{return {version:1,name:'辰澜云智 · 2026 年 9 月',company:party('辰澜云智科技（上海）有限公司','91310000SYNTH00001A','SYN-3100-8000-1026'),openingBalance:1250000,bankName:'澄川银行',accountSubject:'1002 银行存款 / 澄川银行',incomeSubject:'6001 主营业务收入 / 技术服务',expenseSubject:'6602 管理费用 / 服务费',maker:'周宁',reviewer:'许清',cashier:'林悦',transactions:[
 {id:'tx-001',title:'华京平台年度服务费',direction:'income',invoiceType:'增值税专用发票',invoiceNo:'26312000000000000001',date:'2026-09-01',paymentDate:'2026-09-03',paymentTime:'10:26:38',paymentRef:'SYN202609030001',voucherNo:'001',counterparty:party('华京智能制造有限公司','91310000SYNTH00002B','SYN-3100-8000-2098'),items:[{id:'i1',name:'*信息技术服务*平台服务费',spec:'运维云平台 · 年度服务',unit:'项',quantity:1,price:180000,rate:6},{id:'i2',name:'*信息技术服务*实施服务费',spec:'接口配置及上线支持',unit:'项',quantity:1,price:20000,rate:6}],paid:212000,purpose:'2026 年度运维云平台服务费',note:'服务期间：2026年9月1日至2027年8月31日。'},
 {id:'tx-002',title:'星垣云资源采购',direction:'expense',invoiceType:'增值税专用发票',invoiceNo:'26312000000000000002',date:'2026-09-02',paymentDate:'2026-09-04',paymentTime:'14:08:16',paymentRef:'SYN202609040002',voucherNo:'002',counterparty:party('星垣云计算有限公司','91310000SYNTH00003C','SYN-3100-8000-3316'),items:[{id:'i3',name:'*信息技术服务*云资源服务费',spec:'生产环境 · 9月',unit:'月',quantity:1,price:35000,rate:6}],paid:37100,purpose:'9月生产环境云资源服务费',note:''},
 {id:'tx-003',title:'锐图算法维护服务',direction:'expense',invoiceType:'普通发票',invoiceNo:'26312000000000000003',date:'2026-09-05',paymentDate:'2026-09-07',paymentTime:'09:15:02',paymentRef:'SYN202609070003',voucherNo:'003',counterparty:party('锐图智能软件有限公司','91310000SYNTH00004D','SYN-3100-8000-4428'),items:[{id:'i4',name:'*信息技术服务*软件维护费',spec:'排产算法维护',unit:'年',quantity:1,price:12000,rate:6}],paid:6000,purpose:'算法维护费首期付款',note:'分期支付，剩余款项按约结算。'}]};}
export function validate(p:Project):string[]{
 const errors:string[]=[];const check=(v:string,label:string,max:number)=>{if(!v?.trim())errors.push(`${label}不能为空`);else if(v.length>max)errors.push(`${label}请控制在${max}个字以内`);};
 if(p.statementStyle!==undefined&&!statementStyles.some(s=>s.value===p.statementStyle))errors.push('流水版式无效');
 check(p.name,'批次名称',60);check(p.company.name,'本方名称',40);check(p.company.taxId,'本方税号',30);check(p.company.account,'本方账户',32);check(p.company.bank,'本方开户行',40);check(p.bankName,'银行抬头',20);
 for(const k of ['maker','reviewer','cashier'] as const)check(p[k],{maker:'制单人',reviewer:'复核人',cashier:'出纳'}[k],12);
 for(const k of ['accountSubject','incomeSubject','expenseSubject'] as const)check(p[k],'会计科目',55);
 if(!Number.isFinite(p.openingBalance)||Math.abs(p.openingBalance)>99999999999||round(p.openingBalance)!==p.openingBalance)errors.push('期初余额超出范围或超过两位小数');
 if(p.transactions.length<1||p.transactions.length>100)errors.push('每批支持 1–100 笔交易');
 const inv=new Set<string>(),ref=new Set<string>(),vouchers=new Set<string>();
 p.transactions.forEach((t,i)=>{const pre=`第${i+1}笔：`;const start=errors.length;
 if(t.recordType!==undefined&&!['trade','bank'].includes(t.recordType))errors.push('收付记录类型无效');
 if(t.recordType==='bank'){
  for(const [v,label,max] of [[t.title,'交易名称',40],[t.counterparty.name,'对方名称',40],[t.counterparty.bank,'对方开户行',40],[t.counterparty.account,'对方账户',32],[t.paymentRef,'银行流水号',36],[t.purpose,'用途',48]] as const)check(v,label,max);
  if(!validDate(t.paymentDate))errors.push('交易日期无效');
  if(t.paymentTime&&!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(t.paymentTime))errors.push('交易时间无效');
  if(!['income','expense'].includes(t.direction)||!Number.isFinite(t.paid)||t.paid<=0||t.paid>99999999999||round(t.paid)!==t.paid)errors.push('收付金额需为正数，最多两位小数');
  if(ref.has(t.paymentRef))errors.push('银行流水号重复');ref.add(t.paymentRef);
  if(t.receiptStyle!==undefined&&!receiptStyles.some(s=>s.value===t.receiptStyle))errors.push('回单版式无效');
  for(const [key,max] of [['receiptBusiness',20],['receiptChannel',20],['receiptNote',160]] as const)if(t[key]!==undefined&&(typeof t[key]!=='string'||t[key]!.length>max))errors.push('回单补充字段无效');
  errors.splice(start,errors.length-start,...errors.slice(start).map(e=>pre+e));return;
 }

 check(t.title,'交易名称',40);check(t.counterparty.name,'对方名称',40);check(t.counterparty.taxId,'对方税号',30);check(t.counterparty.bank,'对方开户行',40);check(t.counterparty.account,'对方账户',32);check(t.paymentRef,'银行流水号',36);check(t.voucherNo,'凭证编号',12);
 if(!/^\d{20}$/.test(t.invoiceNo))errors.push('发票号码应为20位数字');
 if(t.voucherStyle!==undefined&&!voucherStyles.some(s=>s.value===t.voucherStyle))errors.push('凭证模板无效');
 if(!isLedgerVoucher(t)&&voucherUnavailable(t,'payment'))errors.push(voucherUnavailable(t,'payment'));
 if(t.voucherAttachments!==undefined&&(!Number.isInteger(t.voucherAttachments)||t.voucherAttachments<0||t.voucherAttachments>99))errors.push('附件张数需为0–99的整数');
 for(const [key,max] of [['voucherDepartment',30],['voucherReason',160]] as const)if(t[key]!==undefined&&(typeof t[key]!=='string'||t[key]!.length>max))errors.push('凭证部门或说明格式无效');
 if(t.requestDate!==undefined&&!validDate(t.requestDate))errors.push('请款日期无效');
 if(t.requestAmount!==undefined&&(!Number.isFinite(t.requestAmount)||t.requestAmount<=0||t.requestAmount>totals(t).gross||round(t.requestAmount)!==t.requestAmount))errors.push('申请金额需大于0且不超过价税合计，最多两位小数');
 if(t.receiptStyle!==undefined&&!receiptStyles.some(s=>s.value===t.receiptStyle))errors.push('回单版式无效');
 for(const [key,max] of [['receiptBusiness',20],['receiptChannel',20],['receiptNote',160]] as const)if(t[key]!==undefined&&(typeof t[key]!=='string'||t[key]!.length>max))errors.push(`回单字段 ${key} 格式无效或超长`);
 if(t.downloadCount!==undefined&&(!Number.isInteger(t.downloadCount)||t.downloadCount<1||t.downloadCount>999))errors.push('票面下载次数需为1–999之间的整数');
 if(inv.has(t.invoiceNo))errors.push('发票号码重复');inv.add(t.invoiceNo);
 if(ref.has(t.paymentRef))errors.push('银行流水号重复');ref.add(t.paymentRef);
 if(vouchers.has(t.voucherNo))errors.push('凭证编号重复');vouchers.add(t.voucherNo);
 if(!validDate(t.date)||t.date<'2024-12-01')errors.push('当前发票模板支持2024年12月1日起的日期');
 if(t.invoiceNo.slice(0,2)!==t.date.slice(2,4))errors.push('发票号码前两位应与开票年份一致');
 if(!validDate(t.paymentDate))errors.push('付款日期无效');
 if(t.paid>0&&t.paymentDate<t.date)errors.push('首版暂不支持先付款后开票，请让付款日期不早于开票日期');
 if(!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(t.paymentTime))errors.push('付款时间需为时:分:秒');
 if(t.direction!=='income'&&t.direction!=='expense')errors.push('收支方向无效');
 if(!['普通发票','增值税专用发票'].includes(t.invoiceType))errors.push('发票种类无效');
 if(t.purpose.length>48||t.note.length>160)errors.push('摘要限48字，备注限160字');
 if(!t.items.length||t.items.length>8)errors.push('每张发票支持1–8行明细');
 t.items.forEach(a=>{check(a.name,'项目名称',40);if(a.spec.length>26||a.unit.length>6)errors.push('规格限26字、单位限6字');if(!Number.isFinite(a.quantity)||a.quantity<=0||a.quantity>1e6||!Number.isFinite(a.price)||a.price<0||a.price>1e8||!Number.isFinite(a.rate)||a.rate<0||a.rate>100)errors.push('数量、单价或税率超出范围');if(Number.isFinite(a.price)&&Number(a.price.toFixed(12))!==a.price)errors.push('单价最多支持12位小数');});
 const a=totals(t);if(a.gross<=0||a.gross>99999999999)errors.push('价税合计应大于0且不超过999亿元');
 if(!Number.isFinite(t.paid)||t.paid<0||round(t.paid)>a.gross||round(t.paid)!==t.paid)errors.push('实付金额需介于0和价税合计之间，最多两位小数');
 errors.splice(start,errors.length-start,...errors.slice(start).map(e=>pre+e));
 });
 if(p.backgroundConfig!==undefined)errors.push(...validateBackgroundConfig(p.backgroundConfig));
 if(p.background!==undefined){
 if(!Array.isArray(p.background)||p.background.length>500)errors.push('日常流水最多500笔');
 else {const ids=new Set(p.transactions.map(t=>t.id));p.background.forEach((t,i)=>{const start=errors.length;
 for(const [value,label,max] of [[t.id,'记录ID',80],[t.title,'日常交易名称',40],[t.category,'日常交易类别',20],[t.paymentRef,'日常流水号',36],[t.purpose,'日常摘要',48],[t.counterparty?.name,'日常对方名称',40],[t.counterparty?.account,'日常对方账号',32],[t.counterparty?.bank,'日常对方开户行',40]] as const)check(value,label,max);
 if(!validDate(t.paymentDate)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(t.paymentTime))errors.push('日常流水日期或时间无效');
 if(!['income','expense'].includes(t.direction)||!Number.isFinite(t.paid)||t.paid<=0||t.paid>1e7||round(t.paid)!==t.paid)errors.push('日常收支方向或金额无效');
 if(ids.has(t.id)||ref.has(t.paymentRef))errors.push('日常流水ID或流水号重复');ids.add(t.id);ref.add(t.paymentRef);
 for(const k of ['receiptBusiness','receiptChannel'] as const)if(t[k]!==undefined&&(typeof t[k]!=='string'||t[k]!.length>20))errors.push('日常业务种类或渠道无效');
 errors.splice(start,errors.length-start,...errors.slice(start).map(e=>`日常第${i+1}笔：`+e));});}}
 return errors;
}
export function parseProject(input:unknown,requireValid=true):Project{
 if(!input||typeof input!=='object')throw Error('请选择本站导出的 JSON 填写方案');
 const p=input as Project;if(p.version!==1||!Array.isArray(p.transactions))throw Error('填写方案版本不受支持');
 const str=(o:unknown,ks:string[])=>!!o&&typeof o==='object'&&ks.every(k=>typeof (o as Record<string,unknown>)[k]==='string');
 const partyOk=(x:unknown)=>str(x,['name','taxId','bank','account','address']);
 if(!str(p,['name','bankName','accountSubject','incomeSubject','expenseSubject','maker','reviewer','cashier'])||!partyOk(p.company)||typeof p.openingBalance!=='number'||!p.transactions.length||p.transactions.length>100)throw Error('填写方案缺少必要字段或交易数超限');
 if(p.statementStyle!==undefined&&!statementStyles.some(s=>s.value===p.statementStyle))throw Error('流水版式不受支持');
 if(p.backgroundConfig!==undefined&&validateBackgroundConfig(p.backgroundConfig).length)throw Error('日常流水生成设置无效');
 if(p.background!==undefined){if(!Array.isArray(p.background)||p.background.length>500)throw Error('日常流水结构或笔数无效');for(const t of p.background)if(!str(t,['id','title','category','direction','paymentDate','paymentTime','paymentRef','purpose'])||!partyOk(t.counterparty)||typeof t.paid!=='number'||['receiptBusiness','receiptChannel'].some(k=>(t as unknown as Record<string,unknown>)[k]!==undefined&&typeof(t as unknown as Record<string,unknown>)[k]!=='string'))throw Error('日常流水字段不完整');}
 const ids=new Set<string>();
 for(const t of p.transactions){if(!str(t,['id','title','direction','invoiceType','invoiceNo','date','paymentDate','paymentTime','paymentRef','voucherNo','purpose','note'])||!partyOk(t.counterparty)||typeof t.paid!=='number'||!Array.isArray(t.items)||t.items.length>8||ids.has(t.id))throw Error('交易字段缺失、重复或超限');ids.add(t.id);if(t.voucherStyle!==undefined&&!voucherStyles.some(s=>s.value===t.voucherStyle))throw Error('凭证模板不受支持');for(const key of ['voucherDepartment','voucherReason','requestDate'] as const)if(t[key]!==undefined&&typeof t[key]!=='string')throw Error('凭证字段格式无效');for(const key of ['voucherAttachments','requestAmount'] as const)if(t[key]!==undefined&&typeof t[key]!=='number')throw Error('凭证金额或附件格式无效');if(t.receiptStyle!==undefined&&!receiptStyles.some(s=>s.value===t.receiptStyle))throw Error('回单版式不受支持');for(const key of ['receiptBusiness','receiptChannel','receiptNote'] as const)if(t[key]!==undefined&&typeof t[key]!=='string')throw Error('回单字段格式不正确');for(const i of t.items)if(!str(i,['id','name','spec','unit'])||!['quantity','price','rate'].every(k=>typeof(i as unknown as Record<string,unknown>)[k]==='number'))throw Error('明细字段不完整');}
 if(requireValid){const errors=validate(p);if(errors.length)throw Error(errors.slice(0,3).join('；'));}return structuredClone(p);
}
