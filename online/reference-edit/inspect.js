import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {EditError, LIMITS, toBytes} from './errors.js';
import {classifyRole, describeFont} from './fonts.js';

function matrixOf(value) {
  if (!value) return [1, 0, 0, 1, 0, 0];
  return [value[0], value[1], value[2], value[3], value[4], value[5]].map(n => Number(n) || 0);
}
function translate(matrix, tx, ty) {
  return [matrix[0], matrix[1], matrix[2], matrix[3], matrix[4] + tx * matrix[0] + ty * matrix[2], matrix[5] + tx * matrix[1] + ty * matrix[3]];
}

function readRun(args, fontSize, matrix) {
  const list = Array.isArray(args?.[0]) ? args[0] : [];
  let text = '';
  let units = 0;
  for (const item of list) {
    if (typeof item === 'number') units -= item;
    else if (item?.unicode) { text += item.unicode; units += Number(item.width) || 0; }
  }
  const scale = Math.hypot(matrix[0], matrix[1]) || 1;
  return {text, width: units / 1000 * fontSize * scale, fontSize: fontSize * scale, x: matrix[4], y: matrix[5], angle: Math.atan2(matrix[1], matrix[0]) * 180 / Math.PI};
}

export async function openPdfDocument(bytes) {
  const data = toBytes(bytes);
  if (data.length > LIMITS.pdfBytes) throw new EditError('PDF超过20MB，请拆分后再修订。', 'too-large');
  if (data.length < 5 || String.fromCharCode(...data.subarray(0, 5)) !== '%PDF-') throw new EditError('这不是有效的PDF文件。', 'corrupt');
  const task = pdfjs.getDocument({data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0});
  try { return {task, pdf: await task.promise}; }
  catch (error) {
    await task.destroy().catch(() => {});
    if (error?.name === 'PasswordException' || /encrypt|password/i.test(error?.message || '')) throw new EditError('该PDF已加密或需要打开密码，不能直接修改。请先另存为可打开的副本。', 'encrypted');
    throw new EditError(`PDF无法读取：${error?.message || '文件损坏'}`, 'corrupt');
  }
}

export async function inspectPdf(bytes) {
  const opened = await openPdfDocument(bytes);
  try {
    if (opened.pdf.numPages > LIMITS.pages) throw new EditError(`PDF超过${LIMITS.pages}页，请拆分后再修订。`, 'too-many-pages');
    if (opened.pdf.numPages < 1) throw new EditError('PDF没有页面。', 'corrupt');
    const runs = [];
    const pages = [];
    let images = 0;
    for (let pageNumber = 1; pageNumber <= opened.pdf.numPages; pageNumber++) {
      const page = await opened.pdf.getPage(pageNumber);
      const view = page.getViewport({scale: 1});
      pages.push({page: pageNumber, width: view.width, height: view.height, rotation: view.rotation || 0});
      const op = await page.getOperatorList();
      let fontName = '', fontSize = 12, tr = 0, leading = 0, matrix = [1, 0, 0, 1, 0, 0];
      let color = {r: 0, g: 0, b: 0};
      const stack = [];
      const OPS = pdfjs.OPS;
      for (let i = 0; i < op.fnArray.length; i++) {
        const fn = op.fnArray[i], args = op.argsArray[i];
        if (fn === OPS.save) stack.push({fontName, fontSize, tr, leading, matrix: [...matrix], color: {...color}});
        else if (fn === OPS.restore) {
          const saved = stack.pop();
          if (saved) ({fontName, fontSize, tr, leading, matrix, color} = saved);
        } else if (fn === OPS.setFont) { fontName = args[0]; fontSize = args[1]; }
        else if (fn === OPS.setTextRenderingMode) tr = args[0];
        else if (fn === OPS.setLeading) leading = args[0] || 0;
        else if (fn === OPS.setTextMatrix) matrix = matrixOf(args[0]);
        else if (fn === OPS.moveText) matrix = translate(matrix, args[0] || 0, args[1] || 0);
        else if (fn === OPS.nextLine) matrix = translate(matrix, 0, -leading);
        else if (fn === OPS.setFillRGBColor) color = {r: args[0], g: args[1], b: args[2]};
        else if (fn === OPS.setFillGray) color = {r: args[0], g: args[0], b: args[0]};
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintImageXObjectRepeat) images += 1;
        else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
          if (fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) matrix = translate(matrix, 0, -leading);
          const run = readRun(args, fontSize, matrix);
          runs.push({...run, page: pageNumber, fontKey: fontName, renderingMode: tr, visible: tr !== 3, color: {...color}});
          matrix = translate(matrix, run.width / (Math.hypot(matrix[0], matrix[1]) || 1), 0);
        }
      }
      page.cleanup();
    }
    const visible = runs.filter(run => run.visible && run.text.trim());
    const sizes = visible.map(run => run.fontSize).sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] || 12;
    for (const run of runs) run.role = classifyRole(run, median);
    const kind = visible.length ? 'vector' : images || runs.length ? 'image' : 'empty';
    const fontEditable = kind === 'vector';
    let fontBlockReason = null;
    if (!fontEditable) {
      fontBlockReason = runs.length
        ? '可见内容是整页图像或扫描件，文字层不可见。不能直接改字体，本次不会把它当成已经统一字体。'
        : '这是扫描件或整页图像PDF，没有可改写的矢量文字。不能直接改字体，本次不会把它当成已经处理成功。';
    }
    return {pageCount: opened.pdf.numPages, pages, runs, images, kind, fontEditable, fontBlockReason, median};
  } finally { await opened.task.destroy().catch(() => {}); }
}

export function attachFontNames(inspection, activeFonts) {
  const visible = inspection.runs.filter(run => run.visible && run.text);
  if (activeFonts.length === visible.length) visible.forEach((run, index) => { run.baseFont = activeFonts[index] || ''; });
  else {
    const keys = [];
    for (const run of visible) if (run.fontKey && !keys.includes(run.fontKey)) keys.push(run.fontKey);
    keys.forEach((key, index) => {
      const base = activeFonts[index] || '';
      for (const run of visible) if (run.fontKey === key && !run.baseFont) run.baseFont = base;
    });
  }
  for (const run of inspection.runs) run.baseFont ||= '';
  const groups = new Map();
  for (const run of inspection.runs) {
    if (!run.visible || !run.text.trim()) continue;
    const base = run.baseFont || '未命名字体';
    const group = groups.get(base) || {baseFont: base, label: describeFont(base), chars: 0, title: 0, body: 0, pages: new Set(), sample: ''};
    group.chars += [...run.text].length;
    group[run.role] += [...run.text].length;
    group.pages.add(run.page);
    if (group.sample.length < 24) group.sample += run.text;
    groups.set(base, group);
  }
  inspection.fonts = [...groups.values()].map(group => ({...group, pages: [...group.pages]}));
  const sizes = inspection.runs.filter(run => run.visible && run.text.trim()).map(run => run.fontSize).sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || inspection.median || 12;
  for (const run of inspection.runs) run.role = classifyRole(run, median);
  return inspection;
}

export function pageText(inspection) {
  return inspection.runs.filter(run => run.visible).map(run => run.text).join('');
}
