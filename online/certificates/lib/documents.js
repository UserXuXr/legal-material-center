import {validateProject,layoutFields,PT} from '../model.js';
import {technologyArt} from '../technology-art.js';
export const escapeXML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
/** Pure page renderer. The editor requires neither an API nor font/image loading. */
export function renderCertificate(project,templates,metrics,background){
  const result=validateProject(project,templates),layout=layoutFields(result.template,result.project.values,metrics);
  if(!result.template.vector_style&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(background))throw Error('证照底图格式不正确');
  const [w,h]=result.template.page_mm;
  const text=layout.flatMap(f=>f.lines.filter(l=>l.text).map(l=>`<text x="${l.x}" y="${l.y}" font-size="${f.size}" fill="${escapeXML(f.color)}"${l.width>0?` textLength="${l.width}" lengthAdjust="spacingAndGlyphs"`:''}>${escapeXML(l.text)}</text>`)).join('');
  const art=result.template.vector_style?technologyArt(result.template):`<image href="${background}" width="${w*PT}" height="${h*PT}"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w*PT}" height="${h*PT}" viewBox="0 0 ${w*PT} ${h*PT}"><title>${escapeXML(result.template.title)} · 合成测试样本</title><g font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif">${art}${text}</g></svg>`;
  return {...result,layout,background,svg,width:w*PT,height:h*PT};
}
