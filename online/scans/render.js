import {prepareScan} from './model.js';

export async function renderScan(doc,dependencies={}){
  const {model,blob}=await prepareScan(doc);
  const open=dependencies.openScanSource||(await import('./source.js')).openSource;
  const effects=dependencies.simulateScan||(await import('./effects.js')).simulateScan;
  const {canvasBlob}=await import('./effects.js');
  const source=await open(model,blob),files=[],pageRecords=[],pdfPages=[];
  const stem=doc.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,85)||'扫描件',base=`Reference/${doc.document_id}/r${doc.revision}/${stem}`;
  const settings=model.settings;
  try{
    for(let i=0;i<source.count;i++){
      const seal=model.seal?.enabled?{...model.seal,pageIndex:i,pageCount:source.count}:null;
      const page=await source.page(i,settings.dpi),canvas=effects(page.canvas,settings,i,model.marks,seal,model.signature);
      pageRecords.push({page:i+1,width:canvas.width,height:canvas.height,width_pt:page.widthPt,height_pt:page.heightPt});
      for(const format of doc.formats.filter(f=>f!=='pdf'))files.push({format,path:`${base}_p${i+1}.${format}`,blob:await canvasBlob(canvas,format==='png'?'image/png':'image/jpeg',settings.quality/100),page_count:1,text_layer:'none',template_id:'scan-simulator-v1',template_version:'1.0.0'});
      if(doc.formats.includes('pdf'))pdfPages.push({widthPt:page.widthPt,heightPt:page.heightPt,jpeg:canvas.toDataURL('image/jpeg',settings.quality/100)});
      canvas.width=canvas.height=1;page.canvas.width=page.canvas.height=1;
    }
    if(pdfPages.length){
      const {jsPDF}=await import('jspdf'),first=pdfPages[0];
      const pdf=new jsPDF({unit:'pt',format:[first.widthPt,first.heightPt],orientation:first.widthPt>first.heightPt?'landscape':'portrait',compress:true});
      pdf.setProperties({title:model.title,subject:'合成纸张扫描模拟；图像PDF，无隐藏文字层',creator:'Reference扫描件工作台'});
      pdfPages.forEach((p,i)=>{if(i)pdf.addPage([p.widthPt,p.heightPt],p.widthPt>p.heightPt?'landscape':'portrait');pdf.addImage(p.jpeg,'JPEG',0,0,p.widthPt,p.heightPt);});
      files.push({format:'pdf',path:base+'.pdf',blob:pdf.output('blob'),page_count:pdfPages.length,text_layer:'none',template_id:'scan-simulator-v1',template_version:'1.0.0'});
    }
    const record={schema_version:'scan-record/1',synthetic:true,source:{name:model.source.file.name,sha256:model.source.file.sha256,bytes:model.source.file.bytes,format:model.source.file.format},settings,marks:model.marks,seal:model.seal,signature:model.signature,scan_scope:model.seal?.enabled&&model.seal.texture==='scan'?'整页文字与印记':model.seal?.enabled?'仅印面':null,conversion:source.note,pages:pageRecords};
    return files.map(file=>({...file,scan_record:record}));
  }finally{await source.close();}
}
