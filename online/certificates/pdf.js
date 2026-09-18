import {jsPDF} from 'jspdf';
import {PT} from './model.js';
export function createPDF(template, layout, image, fontBase64, searchable) {
  const [w,h]=template.page_mm;
  const pdf=new jsPDF({orientation:w>h?'landscape':'portrait',unit:'mm',format:[w,h],compress:true,putOnlyUsedFonts:true});
  pdf.setProperties({title:template.title+' · 合成测试样本',creator:'测试案例素材中心'});
  pdf.addImage(image,'PNG',0,0,w,h);
  if(searchable){
    pdf.addFileToVFS('NotoSansSC-Regular.ttf',fontBase64);
    pdf.addFont('NotoSansSC-Regular.ttf','NotoSC','normal');pdf.setFont('NotoSC','normal');
    for(const field of layout){
      pdf.setFontSize(field.size);pdf.setTextColor(field.color);
      for(const l of field.lines)pdf.text(l.text,l.x/PT,l.y/PT,{baseline:'alphabetic'});
    }
  }
  return pdf.output('arraybuffer');
}
