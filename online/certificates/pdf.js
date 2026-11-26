import {jsPDF} from 'jspdf';
import {PT} from './model.js';
import {splitScripts} from '../shared/font-policy.js';
export function createPDF(template, layout, image, fontBase64, searchable, pairing=null) {
  const [w,h]=template.page_mm;
  const pdf=new jsPDF({orientation:w>h?'landscape':'portrait',unit:'mm',format:[w,h],compress:true,putOnlyUsedFonts:true});
  pdf.setProperties({title:template.title+' · 合成测试样本',creator:'测试案例素材中心'});
  pdf.addImage(image,'PNG',0,0,w,h);
  if(searchable){
    const family=pairing?(pairing.chinese==='song'?'NotoSerifSC':pairing.chinese==='thin'?'NotoSansSCThin':'NotoSansSCBold'):'NotoSC';
    const file=pairing?.file||'NotoSansSC-Regular.ttf';
    pdf.addFileToVFS(file,fontBase64);
    pdf.addFont(file,family,'normal');
    for(const field of layout){
      pdf.setFontSize(field.size);pdf.setTextColor(field.color);
      for(const l of field.lines){
        if(!pairing){pdf.setFont(family,'normal');pdf.text(l.text,l.x/PT,l.y/PT,{baseline:'alphabetic'});continue;}
        let x=l.x/PT;
        for(const part of splitScripts(l.text)){
          pdf.setFont(part.kind==='cjk'?family:pairing.latin,'normal');
          pdf.text(part.text,x,l.y/PT,{baseline:'alphabetic'});
          x+=pdf.getTextWidth(part.text);
        }
      }
    }
  }
  return pdf.output('arraybuffer');
}
