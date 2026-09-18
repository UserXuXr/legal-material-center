import {type Project,type BackgroundConfig,type BackgroundMovement,validDate,validateBackgroundConfig,validate,round,statement} from './finance';
export function backgroundDefaults(p:Project):BackgroundConfig{
 const dates=p.transactions.map(t=>t.paymentDate).filter(validDate).sort();const first=dates[0]??new Date().toISOString().slice(0,10),last=dates.at(-1)??first;
 const end=new Date(Date.UTC(Number(last.slice(0,4)),Number(last.slice(5,7)),0)).toISOString().slice(0,10);
 return {start:first.slice(0,8)+'01',end,count:60,incomePercent:30,expenseMin:50,expenseMax:5000,incomeMin:500,incomeMax:30000,seed:'日常往来-01'};
}
// Fixed vendor identities and weighted categories create recurring, unrelated counterparties.
const vendors=[
 {name:'云榆商贸有限公司',category:'办公采购',purpose:'办公用品采购款',direction:'expense',weight:5},
 {name:'青岚物业服务有限公司',category:'物业租金',purpose:'办公场地物业租金',direction:'expense',weight:1,day:5},
 {name:'沐禾城市服务有限公司',category:'水电费用',purpose:'办公水电费',direction:'expense',weight:1,day:20},
 {name:'林舟物流有限公司',category:'快递物流',purpose:'快递及物流费用',direction:'expense',weight:4},
 {name:'齐越商务服务有限公司',category:'差旅报销',purpose:'员工差旅费用结算',direction:'expense',weight:3},
 {name:'澜杉网络服务有限公司',category:'通信网络',purpose:'网络通信服务费',direction:'expense',weight:1,day:10},
 {name:'澄川银行结算中心',category:'银行手续费',purpose:'转账结算手续费',direction:'expense',weight:3},
 {name:'杉越设备有限公司',category:'设备维护',purpose:'办公设备维护款',direction:'expense',weight:2},
 {name:'云岑数字科技有限公司',category:'其他客户回款',purpose:'技术服务款',direction:'income',weight:5},
 {name:'禾远商贸有限公司',category:'其他客户回款',purpose:'项目服务尾款',direction:'income',weight:4},
 {name:'启棠商务有限公司',category:'其他客户回款',purpose:'咨询服务款',direction:'income',weight:4},
 {name:'青榆信息有限公司',category:'其他客户回款',purpose:'月度服务结算款',direction:'income',weight:3},
 {name:'锦杉办公用品有限公司',category:'采购退款',purpose:'采购退货退款',direction:'income',weight:1},
] as const;
export function generateBackground(p:Project,c:BackgroundConfig):Project{
 const errors=[...validateBackgroundConfig(c),...validate({...p,background:undefined,backgroundConfig:undefined})];if(errors.length)throw Error(errors[0]);
 let hash=2166136261;for(const ch of c.seed)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;let state=hash;
 const random=()=>{state+=0x6D2B79F5;let t=state;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};
 const start=Date.parse(c.start+'T00:00:00Z'),days=Math.round((Date.parse(c.end+'T00:00:00Z')-start)/86400000)+1;
 const directions:('income'|'expense')[]=Array.from({length:c.count},(_,i)=>i<Math.round(c.count*c.incomePercent/100)?'income':'expense');for(let i=directions.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[directions[i],directions[j]]=[directions[j],directions[i]];}
 const excluded=new Set([p.company.name,...p.transactions.map(t=>t.counterparty.name)]),accounts=new Set([p.company.account,...p.transactions.map(t=>t.counterparty.account)]),refs=new Set(p.transactions.map(t=>t.paymentRef)),ids=new Set(p.transactions.map(t=>t.id)),recurring=new Set<string>();
 const rows:BackgroundMovement[]=[];
 for(let i=0;i<c.count;i++){
  const direction=directions[i] as 'income'|'expense';let date=new Date(start+Math.floor(random()*days)*86400000);
  const month=date.toISOString().slice(0,7);
  const pool=vendors.map((v,index)=>({...v,index})).filter(v=>v.direction===direction&&!excluded.has(v.name)&&(v.category!=='银行手续费'||c.expenseMin<=100)&&(!('day' in v)||!recurring.has(month+v.index)));
  if(!pool.length)throw Error('可用日常交易对方不足，请调整生成设置');
  let pick=random()*pool.reduce((n,v)=>n+v.weight,0);const vendor=pool.find(v=>(pick-=v.weight)<0)??pool[0];
  if('day' in vendor){date.setUTCDate(vendor.day);date=new Date(Math.max(start,Math.min(start+(days-1)*86400000,date.getTime())));recurring.add(month+vendor.index);}
  // Enterprise transfers concentrate on business days; keep adjustments within the requested period.
  if(date.getUTCDay()===0||date.getUTCDay()===6){const shift=date.getUTCDay()===0?1:2;const forward=date.getTime()+shift*86400000,back=date.getTime()-(date.getUTCDay()===0?2:1)*86400000;if(forward<=start+(days-1)*86400000&&(!('day' in vendor)||new Date(forward).getUTCMonth()===date.getUTCMonth()))date=new Date(forward);else if(back>=start&&(!('day' in vendor)||new Date(back).getUTCMonth()===date.getUTCMonth()))date=new Date(back);}
  const paymentDate=date.toISOString().slice(0,10),min=c[`${direction}Min`],max=c[`${direction}Max`];
  let paid=round(Math.exp(Math.log(min)+(Math.log(max)-Math.log(min))*random()));
  if(vendor.category==='物业租金')paid=round(Math.max(min,max*(.6+.4*random())));
  if(vendor.category==='银行手续费')paid=round(Math.min(max,min+(Math.max(min,Math.min(max,100))-min)*random()));
  if(['物业租金','其他客户回款'].includes(vendor.category))paid=round(Math.max(min,Math.min(max,Math.round(paid/100)*100)));
  const pad=(n:number)=>String(n).padStart(2,'0'),paymentTime=`${pad(9+Math.floor(random()*9))}:${pad(Math.floor(random()*60))}:${pad(Math.floor(random()*60))}`;
  let paymentRef=`SYN${paymentDate.replace(/-/g,'')}${hash.toString(16).padStart(8,'0')}${String(i+1).padStart(4,'0')}`;while(refs.has(paymentRef))paymentRef+='X';refs.add(paymentRef);
  let id=`daily-${hash.toString(16)}-${i+1}`;while(ids.has(id))id+='x';ids.add(id);
  let account=`SYN-6200-9000-${String(vendor.index+1).padStart(4,'0')}`;while(accounts.has(account))account+='X';
  rows.push({id,title:vendor.purpose,category:vendor.category,direction,paymentDate,paymentTime,paymentRef,paid,purpose:('day' in vendor?month+' ':'')+vendor.purpose,receiptBusiness:vendor.category==='银行手续费'?'手续费扣收':'普通汇兑',receiptChannel:vendor.category==='银行手续费'?'银行自动扣收':'企业网上银行',counterparty:{name:vendor.name,account,bank:'澄川银行城市服务支行（虚构）',taxId:'SYNTHETIC',address:''}});
 }
 const next={...p,background:rows,backgroundConfig:{...c}};const invalid=validate(next);if(invalid.length)throw Error(invalid[0]);return next;
}
export function backgroundBalanceHint(p:Project){const rows=statement(p),lowest=Math.min(p.openingBalance,...rows.map(r=>r.balance));return {lowest,suggestedOpening:round(p.openingBalance+Math.max(0,-lowest))};}
