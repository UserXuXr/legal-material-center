import {PDFDocument} from 'pdf-lib';
import {applySealTexture, drawSeal, sealPlacement} from './seal.js';
import {sealBitmap} from '../scans/seal-asset.js';
import {encodePng, sliceVertical} from '../reference-edit/png.js';

const JUDGMENT = /判决书|裁定书|民事判决|民事裁定|刑事判决|刑事裁定|行政判决|行政裁定/;
export function assertNotJudgment(text) {
  if (JUDGMENT.test(String(text || ''))) throw Error('判决书和裁定书不加模拟骑缝章。这一枚章只用于合同等多页材料，不能做成法院骑缝。');
}
function containsWord(bytes, word) {
  const utf8 = new TextEncoder().encode(word);
  const utf16 = new Uint8Array(word.length * 2);
  for (let i = 0; i < word.length; i++) { utf16[i * 2] = 0; utf16[i * 2 + 1] = word.charCodeAt(i); }
  return indexOfBytes(bytes, utf8) >= 0 || indexOfBytes(bytes, utf16) >= 0;
}
function indexOfBytes(haystack, needle) {
  if (!needle.length || haystack.length < needle.length) return -1;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
export function assertNotJudgmentBytes(bytes, extra = '') {
  assertNotJudgment(extra);
  for (const word of ['判决书', '裁定书', '民事判决', '民事裁定', '刑事判决', '刑事裁定', '行政判决', '行政裁定']) {
    if (containsWord(bytes, word)) assertNotJudgment(word);
  }
}
function browserCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}
function paintTexture(ctx, texture) {
  if (texture === 'scan') return;
  const data = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  data.data.set(applySealTexture(data.data, ctx.canvas.width, ctx.canvas.height, texture || 'normal'));
  ctx.putImageData(data, 0, 0);
}
export function renderTexturedSeal(spec, createCanvas = browserCanvas) {
  if (spec.source === 'png') {
    const bmp = sealBitmap(spec.png);
    if (!bmp) throw Error('授权章图还没有读入。请重新选择 PNG。');
    const pad = Math.max(28, Math.round(bmp.width * .08));
    const canvas = createCanvas(bmp.width, bmp.height + pad);
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    const image = ctx.createImageData(bmp.width, bmp.height);
    image.data.set(bmp.rgba);
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = '#c4201e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.max(14, bmp.width * .055)}px SealUI,sans-serif`;
    ctx.fillText('合成样本', bmp.width / 2, bmp.height + pad * .62);
    paintTexture(ctx, spec.texture);
    return canvas;
  }
  const oval = spec.kind === 'oval_contract';
  const width = 480;
  const height = oval ? Math.round(width / 1.36) : 480;
  const extra = spec.kind === 'circle_name_only' || spec.kind === 'name_chop' ? 40 : 0;
  const canvas = createCanvas(width, height + extra);
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  drawSeal(ctx, {...spec, size: width});
  paintTexture(ctx, spec.texture);
  return canvas;
}
export function paintContractSlice(pageCanvas, spec, createCanvas = browserCanvas) {
  const stamp = renderTexturedSeal(spec, createCanvas);
  const box = sealPlacement(pageCanvas.width, pageCanvas.height, stamp.width, stamp.height, {...spec, mode: 'perforation'}, spec.pageIndex || 0);
  const ctx = pageCanvas.getContext('2d');
  ctx.save();
  ctx.globalAlpha = box.opacity;
  ctx.drawImage(stamp, box.sx, 0, box.sw, stamp.height, box.x, box.y, box.dw, box.dh);
  ctx.restore();
  return box;
}
export async function stampContractPerforation(pdfBytes, spec, createCanvas = browserCanvas) {
  if (!spec?.enabled || spec.mode !== 'perforation') throw Error('未选择骑缝。未签署的草稿不会自动加骑缝章。');
  const bytes = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const doc = await PDFDocument.load(bytes);
  assertNotJudgmentBytes(bytes, [spec.filename, spec.textSample, doc.getTitle(), doc.getSubject()].filter(Boolean).join('\n'));
  const pages = doc.getPages();
  if (pages.length < 2) throw Error('骑缝章至少需要连续两页。单页请改用普通盖章，不要把整章重复盖在每一页。');
  if (pages.length > 30) throw Error('骑缝最多覆盖 30 页，请先拆分合同。');
  const stamp = renderTexturedSeal({...spec, pageCount: pages.length}, createCanvas);
  const ctx = stamp.getContext('2d', {willReadFrequently: true});
  const image = ctx.getImageData(0, 0, stamp.width, stamp.height);
  const slices = sliceVertical(image.data, stamp.width, stamp.height, pages.length);
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const size = page.getSize();
    const box = sealPlacement(size.width, size.height, stamp.width, stamp.height, {...spec, mode: 'perforation', pageCount: pages.length}, index);
    const png = await encodePng(slices[index].rgba, slices[index].width, slices[index].height);
    const embedded = await doc.embedPng(png);
    page.drawImage(embedded, {x: box.x, y: size.height - box.y - box.dh, width: box.dw, height: box.dh, opacity: box.opacity});
  }
  return new Uint8Array(await doc.save());
}
