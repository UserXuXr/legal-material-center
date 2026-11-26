import fontkit from '@pdf-lib/fontkit';
import {PDFDocument, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb, setTextRenderingMode, TextRenderingMode} from 'pdf-lib';
import {EditError, LIMITS, toBytes} from './errors.js';
import {fontForRun, missingGlyphs, resolveSignatureFont, SIGNATURE_FONTS} from './fonts.js';
import {attachFontNames, inspectPdf} from './inspect.js';
import {boxPosition, cleanSealLabel, cleanSignatureName, pagesInRange} from './marks.js';
import {decodePng, encodePng, sliceVertical} from './png.js';
import {paintEvents, blankVisible} from './streams.js';

function friendlyLoadError(error) {
  if (error instanceof EditError) return error;
  if (error?.name === 'EncryptedPDFError' || /encrypt/i.test(error?.message || '')) return new EditError('该PDF已加密或受权限保护，不能直接修改。请先另存为可打开的副本。', 'encrypted');
  if (error?.name === 'MissingPDFHeaderError' || /header|parse|corrupt/i.test(error?.message || '')) return new EditError('PDF已损坏或不是有效文件，没有改写。', 'corrupt');
  return new EditError(`PDF无法读取：${error?.message || '请确认文件完整后重试。'}`, 'corrupt');
}

async function loadDoc(bytes) {
  if (bytes.length > LIMITS.pdfBytes) throw new EditError('PDF超过20MB，请拆分后再修订。', 'too-large');
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') throw new EditError('这不是有效的PDF文件。', 'corrupt');
  try { return await PDFDocument.load(bytes, {updateMetadata: false, ignoreEncryption: false}); }
  catch (error) { throw friendlyLoadError(error); }
}

function activeFonts(doc) {
  const fonts = [];
  for (const page of doc.getPages()) {
    let current = '';
    for (const event of paintEvents(doc, page)) {
      if (event.kind === 'font') current = event.baseFont;
      else if (event.kind === 'text' && !event.empty) fonts.push(current);
    }
  }
  return fonts;
}

function assertPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new EditError('修订方案无效。', 'plan');
  plan.marks ||= [];
  if (!Array.isArray(plan.marks)) throw new EditError('签章列表无效。', 'plan');
  if (plan.marks.length > 40) throw new EditError('一次最多放置40个章或签名。', 'plan');
  return plan;
}

async function embeddedFonts(doc, fontBytes) {
  doc.registerFontkit(fontkit);
  const cache = new Map();
  async function embed(id) {
    if (!fontBytes[id]) throw new EditError('缺少平台字体，无法嵌入。', 'font');
    if (!cache.has(id)) cache.set(id, await doc.embedFont(fontBytes[id], {subset: false}));
    return cache.get(id);
  }
  return {embed, cache};
}

function drawFittedText(page, font, text, {x, y, size, width, angle = 0, color, opacity = 1}) {
  const natural = font.widthOfTextAtSize(text, size) || size;
  const scaleX = width > 0 ? width / natural : 1;
  const safeScale = Number.isFinite(scaleX) && scaleX > 0.35 && scaleX < 3 ? scaleX : 1;
  const rad = angle * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(safeScale * cos, safeScale * sin, -sin, cos, x, y));
  const channel = value => { const n = Number(value); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; };
  page.drawText(text, {x: 0, y: 0, size, font, color: rgb(channel(color?.r), channel(color?.g), channel(color?.b)), opacity});
  page.pushOperators(popGraphicsState());
}

async function drawSeal(doc, page, mark, geometry, pngBytes) {
  const image = await doc.embedPng(pngBytes);
  page.drawImage(image, {x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height, opacity: mark.opacity ?? .9});
}

export async function analyzePdf(input) {
  const original = Uint8Array.from(toBytes(input));
  const doc = await loadDoc(Uint8Array.from(original));
  if (doc.getPageCount() > LIMITS.pages) throw new EditError(`PDF超过${LIMITS.pages}页，请拆分后再修订。`, 'too-many-pages');
  return publicAnalysis(attachFontNames(await inspectPdf(Uint8Array.from(original)), activeFonts(doc)));
}

export async function editPdf(input, plan, fontBytes) {
  const original = Uint8Array.from(toBytes(input));
  assertPlan(plan);
  let doc;
  try { doc = await loadDoc(Uint8Array.from(original)); }
  catch (error) { throw error instanceof EditError ? error : friendlyLoadError(error); }
  if (doc.getPageCount() > LIMITS.pages) throw new EditError(`PDF超过${LIMITS.pages}页，请拆分后再修订。`, 'too-many-pages');
  if (doc.getPageCount() < 1) throw new EditError('PDF没有页面。', 'corrupt');
  for (const page of doc.getPages()) if ((page.getRotation().angle || 0) % 360 !== 0) throw new EditError('页面带有旋转标记。为避免文字和页边章错位，请先展平旋转后再修订。没有改写文件。', 'rotated');
  const inspection = attachFontNames(await inspectPdf(Uint8Array.from(original)), activeFonts(doc));
  const fontsRequested = Boolean(plan.fonts);
  if (fontsRequested && !inspection.fontEditable) throw new EditError(inspection.fontBlockReason, 'image-pdf');
  if (!fontsRequested && !plan.marks.length) {
    return {bytes: original, changed: false, analysis: publicAnalysis(inspection), report: {fontsApplied: false, marks: 0, note: '未选择字体、签章或签名，原字节保持不变。未签署草稿不会自动盖章或签名。'}};
  }
  const rewritten = [];
  if (fontsRequested) {
    const fonts = await embeddedFonts(doc, fontBytes);
    const selected = [];
    inspection.runs.forEach((run, index) => {
      const choice = fontForRun(run, plan.fonts);
      if (!choice) return;
      if (/[\r\n]/.test(run.text)) throw new EditError('有文字含换行控制符，已停止以免错位。没有改写文件。', 'unsupported');
      if (Math.abs(run.angle) > 20 && Math.abs(Math.abs(run.angle) - 90) < 15) throw new EditError('含竖排或大幅旋转的文字。为保留可搜索文字，没有改写，也没有栅格化整页。', 'unsupported');
      const missing = missingGlyphs(fontBytes[choice], run.text);
      if (missing.length) throw new EditError(`所选字体缺少这些字，已停止且未丢字、未改写文件：${missing.slice(0, 24).join(' ')}`, 'missing-glyph');
      selected.push({index, run, choice});
    });
    if (!selected.length) throw new EditError('当前字体范围里没有可更换的可见文字。', 'font');
    const visibleIndexes = [];
    inspection.runs.forEach((run, index) => { if (run.visible) visibleIndexes.push(index); });
    const selectedVisible = new Set(selected.map(item => visibleIndexes.indexOf(item.index)).filter(index => index >= 0));
    let seen = 0;
    for (const page of doc.getPages()) seen += blankVisible(doc, page, selectedVisible, seen);
    if (seen !== visibleIndexes.length) throw new EditError('文字结构无法与页面内容逐段对应。为避免丢字或整页栅格化，没有改写文件。', 'unsupported');
    let cursor = 0;
    for (const page of doc.getPages()) {
      const pageRuns = inspection.runs.filter(run => run.page === cursor + 1 && run.visible);
      const count = pageRuns.length;
      const localSelected = selected.filter(item => item.run.page === cursor + 1);
      for (const item of localSelected) {
        const font = await fonts.embed(item.choice);
        const size = page.getSize();
        if (item.run.x < -5 || item.run.y < -5 || item.run.x > size.width + 5 || item.run.y > size.height + 5) throw new EditError('文字位置超出页面，已停止以免错位。没有改写文件。', 'unsupported');
        drawFittedText(page, font, item.run.text, {...item.run, size: item.run.fontSize});
      }
      cursor += 1;
      if (count < 0) throw new EditError('内部页序错误', 'edit');
    }
    rewritten.push(...selected.map(item => item.run.text));
  }
  const markNotes = [];
  for (const mark of plan.marks) {
    if (mark.kind === 'seal') await placeSeal(doc, mark, markNotes, fontBytes);
    else if (mark.kind === 'signature') await placeSignature(doc, mark, fontBytes, markNotes);
    else throw new EditError('不支持的标记类型。', 'plan');
  }
  const bytes = new Uint8Array(await doc.save({useObjectStreams: false}));
  return {bytes, changed: true, analysis: publicAnalysis(inspection), report: {fontsApplied: fontsRequested, rewritten: rewritten.join('').length, marks: plan.marks.length, notes: markNotes, fontBlockReason: inspection.fontBlockReason}};
}

function publicAnalysis(inspection) {
  return {
    pageCount: inspection.pageCount,
    pages: inspection.pages,
    kind: inspection.kind,
    fontEditable: inspection.fontEditable,
    fontBlockReason: inspection.fontBlockReason,
    fonts: inspection.fonts || [],
    textSample: inspection.runs.filter(run => run.visible).map(run => run.text).join('').slice(0, 800),
  };
}

function drawSampleSeal(page, font, label, geometry, opacity) {
  const cx = geometry.x + geometry.width / 2, cy = geometry.y + geometry.height / 2;
  const radius = Math.min(geometry.width, geometry.height) / 2;
  page.drawEllipse({x: cx, y: cy, xScale: radius, yScale: radius, borderColor: rgb(.72, .08, .1), borderWidth: 1.6, opacity});
  page.drawEllipse({x: cx, y: cy, xScale: radius * .86, yScale: radius * .86, borderColor: rgb(.72, .08, .1), borderWidth: .6, opacity});
  const center = '合成样本章';
  const centerSize = Math.max(7, radius * .28);
  const centerWidth = font.widthOfTextAtSize(center, centerSize);
  page.drawText(center, {x: cx - centerWidth / 2, y: cy - centerSize * .35, size: centerSize, font, color: rgb(.72, .08, .1), opacity});
  let ringSize = Math.max(6, radius * .18);
  let ringWidth = font.widthOfTextAtSize(label, ringSize);
  const maxWidth = radius * 1.35;
  if (ringWidth > maxWidth) { ringSize *= maxWidth / ringWidth; ringWidth = font.widthOfTextAtSize(label, ringSize); }
  page.drawText(label, {x: cx - ringWidth / 2, y: cy + radius * .22, size: ringSize, font, color: rgb(.72, .08, .1), opacity});
}

async function placeSeal(doc, mark, notes, fontBytes) {
  const pages = doc.getPages();
  const range = pagesInRange(pages.length, mark.pageStart, mark.pageEnd);
  const opacity = Number(mark.opacity ?? .92);
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw new EditError('章的透明度需在0到1之间。', 'seal');
  const width = Number(mark.widthPt || 90);
  const height = Number(mark.heightPt || width);
  if (width < 12 || height < 12 || width > 240 || height > 240) throw new EditError('章的尺寸需在12至240磅之间。', 'seal');
  if (mark.sample && mark.mode !== 'perforation') {
    const label = cleanSealLabel(mark.label);
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(fontBytes.song, {subset: false});
    for (const pageNumber of range) {
      const page = pages[pageNumber - 1];
      const size = page.getSize();
      const geometry = boxPosition({pageWidth: size.width, pageHeight: size.height, width, height, xRatio: mark.xRatio ?? .82, yRatio: mark.yRatio ?? .78});
      drawSampleSeal(page, font, label, geometry, opacity);
    }
    notes.push('已放置带“合成样本章”的模拟章，不是权威机构凭证。');
    return;
  }
  if (mark.mode === 'perforation') {
    if (range.length < 2) throw new EditError('骑缝章至少需要连续两页。单页请改用普通盖章，不要把整章重复盖在每一页中央。', 'seal');
    const decoded = await decodePng(mark.png);
    const slices = sliceVertical(decoded.rgba, decoded.width, decoded.height, range.length);
    for (const [index, pageNumber] of range.entries()) {
      const page = pages[pageNumber - 1];
      const size = page.getSize();
      const geometry = boxPosition({pageWidth: size.width, pageHeight: size.height, width, height, yRatio: mark.yRatio ?? .55, mode: 'perforation', edge: mark.edge === 'left' ? 'left' : 'right', sliceIndex: index, sliceCount: range.length});
      const png = await encodePng(slices[index].rgba, slices[index].width, slices[index].height);
      await drawSeal(doc, page, {...mark, opacity}, geometry, png);
    }
    notes.push(`骑缝章按${range.length}页切开，贴在${mark.edge === 'left' ? '左' : '右'}页边，不是整章重复。`);
    return;
  }
  const png = mark.png;
  if (mark.sample) cleanSealLabel(mark.label || '');
  for (const pageNumber of range) {
    const page = pages[pageNumber - 1];
    const size = page.getSize();
    const geometry = boxPosition({pageWidth: size.width, pageHeight: size.height, width, height, xRatio: mark.xRatio ?? .82, yRatio: mark.yRatio ?? .78});
    await drawSeal(doc, page, {...mark, opacity}, geometry, png);
  }
  notes.push(mark.sample ? '已放置带“合成样本章”的模拟章，不是权威机构凭证。' : '已按上传的授权章面放置，未改动其他页面。');
}

async function placeSignature(doc, mark, fontBytes, notes) {
  const pages = doc.getPages();
  const pageNumber = Math.trunc(mark.page || 1);
  if (pageNumber < 1 || pageNumber > pages.length) throw new EditError('签名所在页不存在。', 'signature');
  const page = pages[pageNumber - 1];
  const size = page.getSize();
  const opacity = Number(mark.opacity ?? 1);
  if (!Number.isFinite(opacity) || opacity <= 0 || opacity > 1) throw new EditError('签名透明度需在0到1之间。', 'signature');
  const width = Number(mark.widthPt || 120);
  const height = Number(mark.heightPt || 42);
  const geometry = boxPosition({pageWidth: size.width, pageHeight: size.height, width, height, xRatio: mark.xRatio ?? .7, yRatio: mark.yRatio ?? .86});
  if (mark.source === 'upload') {
    if (!mark.png) throw new EditError('请上传已获授权的签名图片。上传图片会原样放置，不会按照片临摹笔迹。', 'signature');
    await drawSeal(doc, page, {...mark, opacity}, geometry, mark.png);
    notes.push('已放置上传的授权签名图片，未根据图片临摹笔迹。');
    return;
  }
  const name = cleanSignatureName(mark.name);
  const fontId = resolveSignatureFont(mark.font);
  const face = fontBytes[fontId];
  if (!face) throw new EditError('这款硬笔字体没有载入。', 'signature');
  const missing = missingGlyphs(face, name);
  if (missing.length) throw new EditError(`这款手写字体没有这些字，已停止且未生成签名：${missing.join(' ')}`, 'missing-glyph');
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(face, {subset: false});
  const textWidth = font.widthOfTextAtSize(name, 32) || width;
  const scale = width / textWidth;
  page.drawText(name, {x: geometry.x, y: geometry.y + height * .25, size: 32 * scale, font, color: rgb(.12, .12, .16), opacity});
  const label = SIGNATURE_FONTS.find(item => item.id === fontId)?.label || fontId;
  notes.push(`已用${label}按姓名生成稳定字形。同一姓名每次相同，不是连续签名，也不临摹真实笔迹。`);
}

export function emptyPlan() { return {fonts: null, marks: []}; }

export {setTextRenderingMode, TextRenderingMode};
