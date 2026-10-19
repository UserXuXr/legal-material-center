// A searchable text layer over the exact existing SVG raster preserves the form's layout.
const FONT_URL = new URL('../public/fonts/NotoSansSC-Regular.ttf', import.meta.url).href;
let fontPromise;
export const withTimeout = (promise, ms = 30000, message = '文件生成超时，请重试') => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), ms); })])
    .finally(() => clearTimeout(timer));
};
export async function loadPDFFont(fetcher = fetch) {
  if (!fontPromise) fontPromise = (async () => {
    const response = await fetcher(FONT_URL, {signal: AbortSignal.timeout(20000)});
    if (!response.ok) throw Error('无法读取中文字体');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 1000 || bytes[0] !== 0 || bytes[1] !== 1) throw Error('中文字体格式不正确');
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(binary);
  })().catch(error => { fontPromise = undefined; throw Error(`可检索PDF字体加载失败：${error.message}。可重试，或明确选择图像PDF。`); });
  return fontPromise;
}
const identity = [1, 0, 0, 1, 0, 0];
const multiply = (p, q) => [p[0]*q[0]+p[2]*q[1],p[1]*q[0]+p[3]*q[1],p[0]*q[2]+p[2]*q[3],p[1]*q[2]+p[3]*q[3],p[0]*q[4]+p[2]*q[5]+p[4],p[1]*q[4]+p[3]*q[5]+p[5]];
function transform(value = '') {
  let result = identity;
  const matches = [...value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)];
  if (value.replace(/([a-zA-Z]+)\s*\(([^)]*)\)/g, '').trim()) throw Error('SVG变换格式不正确');
  for (const [, name, params] of matches) {
    const v = params.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (!v.length || v.some(n => !Number.isFinite(n))) throw Error('SVG变换参数无效');
    let matrix;
    if (name === 'matrix' && v.length === 6) matrix = v;
    else if (name === 'translate' && v.length <= 2) matrix = [1,0,0,1,v[0],v[1] || 0];
    else if (name === 'scale' && v.length <= 2) matrix = [v[0],0,0,v[1] ?? v[0],0,0];
    else if (name === 'rotate' && [1,3].includes(v.length)) {
      const a = v[0] * Math.PI / 180, rotation = [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];
      matrix = v.length === 1 ? rotation : multiply(multiply([1,0,0,1,v[1],v[2]], rotation), [1,0,0,1,-v[1],-v[2]]);
    } else throw Error(`文字层尚不支持SVG变换：${name}`);
    result = multiply(result, matrix);
  }
  return result;
}
export function svgTextRuns(svg, Parser = globalThis.DOMParser) {
  if (!Parser) throw Error('当前环境缺少SVG文字解析器');
  const doc = new Parser().parseFromString(svg, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'svg') throw Error('SVG文档损坏');
  const runs = [];
  const number = (v, fallback = 0) => v === '' || v == null ? fallback : parseFloat(v);
  function walk(node, parentMatrix, inherited) {
    if (node.nodeType !== 1 || ['defs','image','title','desc','metadata','clipPath','mask'].includes(node.localName)) return;
    const style = Object.fromEntries((node.getAttribute('style') || '').split(';').map(s => s.split(':').map(x => x.trim())).filter(a => a.length === 2));
    const attr = k => node.getAttribute(k) || style[k];
    if (attr('display') === 'none' || attr('visibility') === 'hidden' || attr('opacity') === '0') return;
    const matrix = multiply(parentMatrix, transform(attr('transform') || ''));
    const state = {size:number(attr('font-size'), inherited.size), anchor:attr('text-anchor') || inherited.anchor};
    if (node.localName === 'text') {
      // Current renderers emit one positioned text element per line, not unpositioned rich spans.
      if (node.getElementsByTagName('tspan').length) throw Error('多行SVG文字请先按行定位后再导出可检索PDF');
      const text = node.textContent || '';
      if (!text.trim()) return;
      const x = number(attr('x')) + number(attr('dx')), y = number(attr('y')) + number(attr('dy'));
      const run = {text, x:matrix[0]*x+matrix[2]*y+matrix[4], y:matrix[1]*x+matrix[3]*y+matrix[5], size:state.size*Math.hypot(matrix[2],matrix[3]), horizontalScale:Math.hypot(matrix[0],matrix[1])/Math.hypot(matrix[2],matrix[3]), anchor:state.anchor, angle:-Math.atan2(matrix[1],matrix[0])*180/Math.PI};
      if (![run.x,run.y,run.size].every(Number.isFinite) || run.size <= 0) throw Error('SVG文字位置或字号无效');
      runs.push(run);
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child, matrix, state);
  }
  walk(doc.documentElement, identity, {size:16, anchor:'start'});
  return runs;
}
export async function imageAndTextPDF(pages, images, {searchable = true, dimensions = p => [p.width * .6, p.height * .6], fontLoader = loadPDFFont, Parser} = {}) {
  if (!pages.length || pages.length !== images.length) throw Error('PDF页与图片数量不一致');
  const allRuns = searchable ? pages.map(page => {
    const runs = svgTextRuns(page.svg, Parser);
    if (!runs.length) throw Error('当前页面没有可提取文字，不能标记为可检索PDF');
    return runs;
  }) : [];
  const {jsPDF} = await import('jspdf');
  const first = dimensions(pages[0]);
  const pdf = new jsPDF({unit:'pt', format:first, orientation:first[0] > first[1] ? 'landscape' : 'portrait', compress:true, putOnlyUsedFonts:true});
  pdf.setProperties({title:'法律业务材料 · 合成测试样本', creator:'法律材料工作台', subject:searchable ? '原始版面与可检索SVG文字层；底图内文字不包含在文字层中' : '图像版PDF'});
  if (searchable) {
    pdf.addFileToVFS('NotoSansSC-Regular.ttf', await fontLoader());
    pdf.addFont('NotoSansSC-Regular.ttf', 'MaterialSC', 'normal');
    pdf.setFont('MaterialSC','normal');
  }
  pages.forEach((page, i) => {
    const [w,h] = dimensions(page);
    if (![w,h,page.width,page.height].every(n => Number.isFinite(n) && n > 0)) throw Error('PDF页面尺寸无效');
    if (i) pdf.addPage([w,h], w > h ? 'landscape' : 'portrait');
    pdf.addImage(images[i], 'PNG', 0, 0, w, h, undefined, 'FAST');
    if (searchable) for (const run of allRuns[i]) {
      pdf.setFontSize(run.size * h / page.height);
      const offset=pdf.getTextWidth(run.text)*run.horizontalScale*(run.anchor==='end'?1:run.anchor==='middle'?.5:0),radians=-run.angle*Math.PI/180;
      pdf.text(run.text, run.x * w / page.width-Math.cos(radians)*offset, run.y * h / page.height-Math.sin(radians)*offset, {
        baseline:'alphabetic',horizontalScale:run.horizontalScale,angle:run.angle,renderingMode:'invisible',
      });
    }
  });
  return pdf.output('blob');
}
