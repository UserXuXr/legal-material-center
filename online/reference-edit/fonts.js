import fontkit from '@pdf-lib/fontkit';
import {HAND_FONTS} from '../shared/font-policy.js';

export const FONT_CHOICES = {
  song: {id: 'song', label: '宋体（Noto Serif SC）', role: '正文默认', file: 'NotoSerifSC-Regular.ttf'},
  hei: {id: 'hei', label: '黑体（Noto Sans SC Bold）', role: '标题默认', file: 'NotoSansSC-Bold.ttf'},
  thin: {id: 'thin', label: '细黑（Noto Sans SC）', role: '与站点可检索PDF同属细黑体', file: 'NotoSansSC-Thin.ttf'},
};
export const SIGNATURE_FONTS = HAND_FONTS;
export function resolveSignatureFont(id) {
  if (!id || id === 'sign' || id === 'mashan') return 'xiaolai';
  if (!HAND_FONTS.some(font => font.id === id)) throw new Error('没有这款手写字体');
  return id;
}

const fontBase = import.meta.env?.BASE_URL || '/';
export const fontUrls = {
  song: `${fontBase}fonts/NotoSerifSC-Regular.ttf`,
  hei: `${fontBase}fonts/NotoSansSC-Bold.ttf`,
  thin: `${fontBase}fonts/NotoSansSC-Thin.ttf`,
  ...Object.fromEntries(HAND_FONTS.map(font => [font.id, `${fontBase}fonts/handwriting/${font.file}`])),
};

export async function loadEditorFonts(fetcher = globalThis.fetch) {
  const out = {};
  for (const [id, url] of Object.entries(fontUrls)) {
    const response = await fetcher(url);
    if (!response?.ok) throw new Error('无法读取平台字体，请刷新后重试。');
    out[id] = new Uint8Array(await response.arrayBuffer());
  }
  return out;
}

const loaded = new Map();
export function fontkitOf(bytes) {
  const key = bytes;
  if (loaded.has(key)) return loaded.get(key);
  const font = fontkit.create(bytes);
  loaded.set(key, font);
  return font;
}

export function missingGlyphs(fontBytes, text) {
  const font = fontkitOf(fontBytes);
  const missing = [];
  const seen = new Set();
  for (const ch of text) {
    if (seen.has(ch) || ch === '\u0000') continue;
    seen.add(ch);
    if (ch === ' ' || ch === '\t') continue;
    const glyph = font.glyphForCodePoint(ch.codePointAt(0));
    if (!glyph || glyph.id === 0 || glyph.name === '.notdef') missing.push(ch);
  }
  return missing;
}

export function describeFont(baseFont = '') {
  const name = String(baseFont).replace(/^\//, '');
  const n = name.toLowerCase();
  if (/extralight|thin|light|dengxian|细黑|sourcehansanssc-extralight/.test(n)) return '细黑';
  if (/simsun|songti|stsong|nsimsun|宋体|notoserif|sourcehanserif|mingliu|pming/.test(n)) return '宋体';
  if (/arial|helvetica|calibri|times/.test(n)) return 'Arial/西文';
  if (/noto.*sans|sourcehansans|simhei|heiti|黑体|dengxian|microsoft yahei|wqy/.test(n)) return '黑体/Noto';
  if (!name) return '未识别字体';
  return name;
}

export function classifyRole(run, median) {
  const name = String(run.baseFont || '');
  const n = name.toLowerCase();
  const titleName = /bold|black|heavy|simhei|黑体|title/.test(n) && !/extralight|thin|light|song|serif|simsun|ming|宋/.test(n);
  const short = [...run.text.trim()].length <= 40;
  const titleSize = run.fontSize >= Math.max(16, median * 1.35) && short;
  return titleName || titleSize ? 'title' : 'body';
}

export const SCOPES = [
  {id: 'body-and-title', label: '正文宋体、标题黑体'},
  {id: 'body', label: '只统一正文'},
  {id: 'title', label: '只统一标题'},
  {id: 'all-song', label: '全部改为宋体'},
  {id: 'all-hei', label: '全部改为黑体'},
];

export function fontForRun(run, fontsPlan) {
  if (!fontsPlan) return null;
  if (fontsPlan.pages && !fontsPlan.pages.includes(run.page)) return null;
  if (!run.visible || !run.text) return null;
  const scope = fontsPlan.scope || 'body-and-title';
  if (scope === 'all-song') return fontsPlan.body || 'song';
  if (scope === 'all-hei') return fontsPlan.title || 'hei';
  if (scope === 'body' && run.role !== 'body') return null;
  if (scope === 'title' && run.role !== 'title') return null;
  return run.role === 'title' ? (fontsPlan.title || 'hei') : (fontsPlan.body || 'song');
}
