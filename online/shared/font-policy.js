import fontkit from '@pdf-lib/fontkit';

export const PAIRINGS = [
  {id:'song-times', label:'宋体 + Times', chinese:'song', latin:'times', file:'NotoSerifSC-Regular.ttf'},
  {id:'hei-helvetica', label:'黑体 + Helvetica', chinese:'hei', latin:'helvetica', file:'NotoSansSC-Bold.ttf'},
  {id:'thin-helvetica', label:'细黑 + Helvetica', chinese:'thin', latin:'helvetica', file:'NotoSansSC-Thin.ttf'},
  {id:'song-courier', label:'宋体 + Courier', chinese:'song', latin:'courier', file:'NotoSerifSC-Regular.ttf'},
  {id:'hei-times', label:'黑体 + Times', chinese:'hei', latin:'times', file:'NotoSansSC-Bold.ttf'},
];
const files = {
  song: new URL('../public/fonts/NotoSerifSC-Regular.ttf', import.meta.url),
  hei: new URL('../public/fonts/NotoSansSC-Bold.ttf', import.meta.url),
  thin: new URL('../public/fonts/NotoSansSC-Thin.ttf', import.meta.url),
};
let chosen = null;
export function pairingById(id) {
  const found = PAIRINGS.find(item => item.id === id);
  if (!found) throw Error('没有这个中西文配对');
  return found;
}
export function setExportPairing(id) { chosen = id ? pairingById(id) : null; return chosen; }
export function activePairing() {
  if (chosen) return chosen;
  try {
    const id = globalThis.localStorage?.getItem('reference-export-pairing');
    if (id) return pairingById(id);
  } catch { /* private mode */ }
  return null;
}
export function isCjk(ch) {
  const c = ch.codePointAt(0);
  return c >= 0x3400 && c <= 0x9fff || c >= 0xf900 && c <= 0xfaff || c >= 0x3000 && c <= 0x303f || c >= 0xff00 && c <= 0xffef;
}
export function splitScripts(text) {
  const parts = [];
  for (const ch of text) {
    const kind = isCjk(ch) ? 'cjk' : 'latin';
    if (!parts.length || parts.at(-1).kind !== kind) parts.push({kind, text: ch});
    else parts.at(-1).text += ch;
  }
  return parts;
}
const fonts = new Map();
export function fontOf(bytes) {
  if (!fonts.has(bytes)) fonts.set(bytes, fontkit.create(bytes));
  return fonts.get(bytes);
}
export function missingGlyphs(bytes, text) {
  const font = fontOf(bytes);
  const missing = [];
  const seen = new Set();
  for (const ch of text) {
    if (seen.has(ch) || ch === ' ' || ch === '\n' || ch === '\t') continue;
    seen.add(ch);
    const glyph = font.glyphForCodePoint(ch.codePointAt(0));
    if (!glyph || glyph.id === 0 || glyph.name === '.notdef') missing.push(ch);
  }
  return missing;
}
export async function loadChineseFont(pairing, fetcher = globalThis.fetch) {
  const url = files[pairing.chinese];
  if (url.protocol === 'file:') {
    const {readFile} = await import('node:fs/promises');
    const {fileURLToPath} = await import('node:url');
    return new Uint8Array(await readFile(fileURLToPath(url)));
  }
  const response = await fetcher(url.href);
  if (!response.ok) throw Error('无法读取所选中文字体');
  return new Uint8Array(await response.arrayBuffer());
}
export async function assertCovered(text, pairing) {
  if (!pairing || !text) return;
  const missing = missingGlyphs(await loadChineseFont(pairing), [...String(text)].filter(isCjk).join(''));
  if (missing.length) throw Error(`所选中文字体缺少这些字，已停止且未生成文件：${[...new Set(missing)].slice(0, 24).join(' ')}`);
}
export function officeFonts(pairing) {
  if (!pairing) return null;
  const latin = {times:'Times New Roman', helvetica:'Arial', courier:'Courier New'}[pairing.latin];
  const east = {song:'Noto Serif SC', hei:'Noto Sans SC', thin:'Noto Sans SC'}[pairing.chinese];
  return {ascii:latin, hAnsi:latin, eastAsia:east};
}
export const FONT_COVERAGE = [
  {id:'documents-pdf', entry:'文档与图片 / 文书 PDF', policy:'同一 imageAndTextPDF 配对，可见图注入同一中西文', applies:true},
  {id:'documents-docx', entry:'文档与图片 / 文书 DOCX', policy:'officeFonts 写入 ascii 与 eastAsia', applies:true},
  {id:'images-pdf', entry:'文档与图片 / 图片 PDF', policy:'同一 imageAndTextPDF 配对', applies:true},
  {id:'images-docx', entry:'文档与图片 / 图片转录 DOCX', policy:'officeFonts', applies:true},
  {id:'original', entry:'文档与图片 / 原件', policy:'不适用', applies:false, reason:'原件按收到的字节原样交付，不改字体。'},
  {id:'certificates-pdf', entry:'证照 PDF', policy:'矢量底用 imageAndTextPDF，填写字段用 createPDF，都读同一配对', applies:true},
  {id:'certificates-png', entry:'证照 PNG', policy:'可见文字注入同一配对，缺字停止', applies:true},
  {id:'finance-pdf', entry:'财务 PDF', policy:'pdfFromImages', applies:true},
  {id:'finance-png', entry:'财务 PNG', policy:'可见 SVG 注入同一配对', applies:true},
  {id:'finance-data', entry:'财务 XLSX/CSV', policy:'不适用', applies:false, reason:'结构化数值，没有正文文字层。'},
  {id:'rights-pdf', entry:'权属 PDF', policy:'pdfFromImages', applies:true},
  {id:'rights-png', entry:'权属 PNG', policy:'可见 SVG 注入同一配对', applies:true},
  {id:'contracts-docx', entry:'合同 DOCX', policy:'officeFonts', applies:true},
  {id:'business-docx', entry:'业务文书 DOCX', policy:'officeFonts', applies:true},
  {id:'business-data', entry:'业务台账 XLSX/CSV', policy:'不适用', applies:false, reason:'表格数据，不嵌入正文字体。'},
  {id:'batch', entry:'批量制作', policy:'各引擎导出时读取同一个 activePairing', applies:true},
  {id:'scans', entry:'扫描件模拟', policy:'不适用', applies:false, reason:'输出是图像，没有可检索文字层。页面会写明这一点。'},
  {id:'screenshots', entry:'微信截图', policy:'不适用', applies:false, reason:'交付的是截图 PNG，没有文书文字层。'},
  {id:'reference-edit', entry:'材料修订', policy:'正文和标题嵌入宋体、黑体或细黑；签名使用五款硬笔', applies:true},
];
export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(text);
}

export const HAND_FONTS = [
  {id:'xiaolai', label:'小赖字体 Xiaolai', file:'Xiaolai-Regular.ttf', note:'圆润硬笔。排出的姓名不是连续签名。'},
  {id:'jason', label:'清松手写体8p', file:'JasonHandwriting8p.ttf', note:'原子笔随性日常。不是毛笔，也不是真人连笔。'},
  {id:'chen', label:'辰宇落雁体 2.0 细', file:'ChenYuluoyan-2.0-Thin.ttf', note:'细硬笔。源字库以繁体为主，简体缺字会停止。'},
  {id:'yshi', label:'写意体 SC', file:'YShiWrittenSC-Regular.ttf', note:'中性笔风。不是楷书毛笔。'},
  {id:'tsuipita', label:'晓声通秋茄 ToneOZ Tsuipita', file:'ToneOZ-Tsuipita-TC.ttf', note:'中性签字笔。与前四款不是同一字体换名。'},
];
const handUrls = Object.fromEntries(HAND_FONTS.map(font => [font.id, new URL('../public/fonts/handwriting/' + font.file, import.meta.url)]));
export async function loadHandFont(id, fetcher = globalThis.fetch) {
  const url = handUrls[id];
  if (!url) throw Error('没有这款手写字体');
  if (url.protocol === 'file:') {
    const {readFile} = await import('node:fs/promises');
    const {fileURLToPath} = await import('node:url');
    return new Uint8Array(await readFile(fileURLToPath(url)));
  }
  const response = await fetcher(url.href);
  if (!response.ok) throw Error('无法读取手写字体');
  return new Uint8Array(await response.arrayBuffer());
}
export function handFont(id) {
  const found = HAND_FONTS.find(font => font.id === id);
  if (!found) throw Error('没有这款手写字体');
  return found;
}
