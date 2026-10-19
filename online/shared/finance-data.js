// Business exports deliberately exclude generator provenance columns and hidden sheets.
export async function businessRows(project,kind,{stage='invoice',variant='business'}={}) {
  const {dataRows}=await import('../modules/finance/lib/export.ts');
  const {isLedgerVoucher}=await import('../modules/finance/lib/finance.ts');
  let rows=dataRows(project,kind),headers=rows[0];
  if(kind==='voucher') {
    const t=project.transactions[0],label=variant==='ledger'||isLedgerVoucher(t)||stage==='invoice'?(stage==='invoice'?'开票确认':'收付款'):(t.voucherStyle==='request'?'请款申请':'支付证明');
    rows=[headers,...rows.slice(1).filter(r=>r[2]===label)];
  }
  const indexes=headers.map((h,i)=>['记录来源','模板名称','模板版本','流水版式','回单版式'].includes(h)?-1:i).filter(i=>i>=0);
  return rows.map(row=>indexes.map(i=>row[i]));
}
export async function businessDataFile(project,kind,format,options={}) {
  const rows=await businessRows(project,kind,options);
  if(format==='csv') {
    const {csvRows}=await import('../modules/finance/lib/export.ts');return new Blob([csvRows(rows)],{type:'text/csv;charset=utf-8'});
  }
  const {default:ExcelJS}=await import('exceljs'),wb=new ExcelJS.Workbook();
  wb.creator='法律材料工作台';wb.subject='合成案例材料';wb.calcProperties.fullCalcOnLoad=true;
  const sheet=wb.addWorksheet({invoice:'发票明细',receipt:'银行回单',statement:'银行流水',voucher:'会计凭证'}[kind]);sheet.addRows(rows);
  sheet.columns.forEach((column,i)=>{column.width=/名称|户名|摘要|用途|项目|科目/.test(rows[0][i])?32:22;});
  sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter={from:{row:1,column:1},to:{row:rows.length,column:rows[0].length}};
  sheet.getRow(1).height=30;sheet.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF365C43'}};cell.alignment={vertical:'middle',wrapText:true};});
  sheet.eachRow((row,index)=>{if(index===1)return;row.height=28;row.eachCell(cell=>{cell.alignment={vertical:'middle',wrapText:true};if(typeof cell.value==='number')cell.numFmt='#,##0.00';});});
  if(kind==='invoice')for(let row=2;row<=rows.length;row++){
    sheet.getCell(`L${row}`).value={formula:`ROUND(I${row}*J${row},2)`,result:rows[row-1][11]};
    sheet.getCell(`M${row}`).value={formula:`ROUND(L${row}*K${row},2)`,result:rows[row-1][12]};
    sheet.getCell(`N${row}`).value={formula:`L${row}+M${row}`,result:rows[row-1][13]};sheet.getColumn('K').numFmt='0.##%';sheet.getColumn('J').numFmt='0.############';
  }
  if(kind==='statement'){
    const account=wb.addWorksheet('账户信息');account.columns=[{width:25},{width:48}];account.addRows([['本方户名',project.company.name],['本方账号',project.company.account],['币种','CNY'],['期初余额',project.openingBalance]]);account.getCell('B4').numFmt='#,##0.00';
    for(let row=2;row<=rows.length;row++)sheet.getCell(`K${row}`).value={formula:row===2?`'账户信息'!B4+I${row}-J${row}`:`K${row-1}+I${row}-J${row}`,result:rows[row-1][10]};
  }
  sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};
  sheet.headerFooter.oddFooter='合成案例材料 | 第 &P 页 / 共 &N 页';
  return new Blob([await wb.xlsx.writeBuffer()],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export async function observedFinancialLedgers(batch) {
  const {statement}=await import('../modules/finance/lib/finance.ts'),ledgers=[],issues=[];
  for(const doc of batch.documents.filter(d=>d.engine==='finance'&&d.payload.kind==='statement')){
    try {
    const p=doc.payload.project;let balance=Math.round(p.openingBalance*100);
    const rows=statement(p).map(({t,source,balance:displayBalance})=>{
      const amount=Math.round(t.paid*100);balance+=t.direction==='income'?amount:-amount;
      if(!Number.isSafeInteger(balance)||Math.round(displayBalance*100)!==balance)throw Error('流水整数分核对失败，不能生成台账辅助记录');
      return {id:t.id,date:t.paymentDate,time:t.paymentTime,direction:t.direction,amount_cents:amount,balance_cents:balance,counterparty:t.counterparty.name,source};
    });
    const c=p.backgroundConfig;
    ledgers.push({id:'observed-'+doc.document_id,document_id:doc.document_id,opening_balance_cents:Math.round(p.openingBalance*100),closing_balance_cents:balance,rows,...(c?{supplement:{seed:c.seed,count:c.count,start_date:c.start,end_date:c.end,income_ratio_percent:c.incomePercent,income_bounds_cents:[Math.round(c.incomeMin*100),Math.round(c.incomeMax*100)],expense_bounds_cents:[Math.round(c.expenseMin*100),Math.round(c.expenseMax*100)]}}:{})});
    }catch(error){issues.push({document_id:doc.document_id,message:error.message});}
  }
  return {issues,basis:'workbench-input-observation',note:'仅反映工作台输入与排序；须独立对照plan冻结事实，不得覆盖Pipeline的预期台账或充当财务核对PASS。',ledgers};
}
