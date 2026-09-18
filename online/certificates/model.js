import {matchTemplate} from './template-match.js';
export const PT = 72 / 25.4;
const object = v => v && typeof v === 'object' && !Array.isArray(v);
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || +value.slice(0,4)<1) return false;
  const d = new Date(value+'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0,10) === value;
}
export function cleanProject(input, templates) {
  if (!object(input) || input.version !== 1 || !object(input.values)) throw Error('请选择本工作台导出的填写方案');
  const t = templates.find(x=>x.id === input.template_id);
  if (!t) throw Error('找不到这份模板');
  const allowed = new Set(templates.filter(x=>x.kind===t.kind).flatMap(x=>x.fields.map(f=>f.key)));
  const values={};
  for (const [k,v] of Object.entries(input.values)) {
    if (!allowed.has(k) || typeof v!=='string' || v.length>5000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v)) throw Error('填写方案含不支持的字段或字符');
    values[k] = v.trim().replace(/\t/g,' ');
  }
  if (!['native','raster_200dpi'].includes(input.capture)) throw Error('请选择支持的 PDF 类型');
  if (!t.issuer_scopes.includes(input.issuer_scope)) throw Error('请选择模板支持的发证范围');
  if (!validDate(input.as_of)) throw Error('请填写有效的事实基准日期');
  if (input.name!==undefined && (typeof input.name!=='string' || input.name.length>100)) throw Error('方案名称应不超过100字');
  const p={version:1,template_id:t.id,name:input.name?.trim()||t.title,values,capture:input.capture,issuer_scope:input.issuer_scope,as_of:input.as_of};
  if (input.id && /^[a-f0-9]{32}$/.test(input.id)) p.id=input.id;
  if(input.preserveMissing!==undefined){if(typeof input.preserveMissing!=='boolean')throw Error('未载字段设置无效');p.preserveMissing=input.preserveMissing;}
  if(input.templateDate){if(!validDate(input.templateDate))throw Error('版式参考日期无效');p.templateDate=input.templateDate;}
  return p;
}
export function validateProject(input, templates) {
  const project=cleanProject(input,templates);
  const match=matchTemplate(templates,project);
  if (match.status!=='matched') throw Error(match.message);
  const template=match.template;project.template_id=template.id;
  for (const f of template.fields) {
    if (!project.preserveMissing && !project.values[f.key]?.trim()) throw Error('请填写'+f.label);
    if (f.type==='date' && project.values[f.key] && !validDate(project.values[f.key])) throw Error(f.label+'不是有效日期');
  }
  const v=project.values, issued=v['certificate.issued_on'], until=v['certificate.valid_until'];
  if (until && ((v['certificate.valid_from'] && v['certificate.valid_from']>until) || issued>until)) throw Error('有效期结束日期不能早于开始日期或发证日期');
  if (issued && v['entity.established_on'] && v['entity.established_on']>issued) throw Error('成立日期不能晚于发证日期');
  for (const k of ['entity.credit_code','certificate.number']) if ((v[k]||'').length>42) throw Error('证照编号或信用代码超过42字');
  const warnings=[];
  if (issued>project.as_of) warnings.push('发证日期晚于事实基准日期');
  if (until && until<project.as_of) warnings.push('此证照在事实基准日期已超过有效期');
  return {project,template,warnings};
}
function dateCN(s) { if(!s)return '';if(!validDate(s))throw Error('日期格式不正确');const [y,m,d]=s.split('-');return `${+y}年${+m}月${+d}日`; }
export function elementText(e, values) {
  if(e.format==='date_range'){const dates=e.keys.map(k=>dateCN(values[k]));return dates.every(Boolean)?dates.join(' 至 '):dates.some(Boolean)?(dates[0]||'未载明')+' 至 '+(dates[1]||'未载明'):'';}
  const v=values[e.key]||'';
  return e.format==='date_cn'?dateCN(v):v;
}
export function widthOf(text,size,metrics) {
  return Array.from(text).reduce((sum,ch)=>{
    const w=metrics.widths[ch.codePointAt(0)];
    if (w===undefined) throw Error('当前字体不支持字符「'+ch+'」，请替换后生成');
    return sum+w/metrics.units*size;
  },0);
}
export function layoutFields(template, values, metrics) {
  return template.elements.map(e=>{
    const text=elementText(e,values),max=e.w*PT;
    for(let size=e.size;size>=(e.min_size||e.size)-0.001;size-=0.25) {
      let lines=[];
      for(const paragraph of text.split('\n')) {
        let line='';
        for(const c of Array.from(paragraph)) {
          if(widthOf(line+c,size,metrics)>max+0.01 && line){lines.push(line);line='';}
          line+=c;
        }
        lines.push(line);
      }
      if(lines.some(l=>widthOf(l,size,metrics)>max+0.01) || size+(lines.length-1)*size*1.38>e.h*PT+0.01)continue;
      return {key:e.key||e.keys.join('+'),size,color:e.color||'#181715',lines:lines.map((text,i)=>{
        const width=widthOf(text,size,metrics),free=max-width;
        return {text,width,x:e.x*PT+(e.align==='center'?free/2:e.align==='right'?free:0),y:e.y*PT+size*.87+i*size*1.38};
      })};
    }
    throw Error('「'+(e.key||e.keys.join(' / '))+'」文字超过版面容量，请缩短内容或分行');
  });
}
