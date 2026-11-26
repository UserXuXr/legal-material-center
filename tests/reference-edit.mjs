import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {PDFDocument, StandardFonts, rgb, setTextRenderingMode, TextRenderingMode} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import JSZip from 'jszip';
import {EditError, LIMITS} from '../online/reference-edit/errors.js';
import {buildImagePdf, buildMixedFontPdf} from '../online/reference-edit/fixture.js';
import {editPdf} from '../online/reference-edit/edit.js';
import {FONT_CHOICES, resolveSignatureFont} from '../online/reference-edit/fonts.js';
import {cleanSealLabel, cleanSignatureName} from '../online/reference-edit/marks.js';
import {decodePng, encodePng, sliceVertical} from '../online/reference-edit/png.js';
import {editZip, readZip, storedPayload} from '../online/reference-edit/zip.js';

const out = new URL('../work/reference-edit-qa/', import.meta.url);
await fs.mkdir(out, {recursive: true});
const fonts = Object.fromEntries(await Promise.all(Object.entries({
  thin: 'NotoSansSC-Thin.ttf', song: 'NotoSerifSC-Regular.ttf', hei: 'NotoSansSC-Bold.ttf',
  xiaolai: 'handwriting/Xiaolai-Regular.ttf', jason: 'handwriting/JasonHandwriting8p.ttf', chen: 'handwriting/ChenYuluoyan-2.0-Thin.ttf', yshi: 'handwriting/YShiWrittenSC-Regular.ttf', tsuipita: 'handwriting/ToneOZ-Tsuipita-TC.ttf',
}).map(async ([id, name]) => [id, new Uint8Array(await fs.readFile(new URL('../online/public/fonts/' + name, import.meta.url)))])));
const planFonts = {scope: 'body-and-title', body: 'song', title: 'hei'};
const textOf = file => execFileSync('pdftotext', [file, '-'], {encoding: 'utf8'});
const infoOf = file => execFileSync('pdfinfo', [file], {encoding: 'utf8'});

const mixed = await buildMixedFontPdf(fonts);
const mixedCopy = Uint8Array.from(mixed);
const untouched = await editPdf(mixed, {fonts: null, marks: []}, fonts);
assert.equal(untouched.changed, false);
assert.equal(untouched.report.note.includes('不会自动盖章'), true);
assert.deepEqual(untouched.bytes, mixedCopy);
assert.deepEqual(mixed, mixedCopy);
const labels = untouched.analysis.fonts.map(font => font.label);
for (const label of ['细黑', '宋体', 'Arial/西文', '黑体/Noto']) assert(labels.includes(label), labels.join(','));
assert.equal(untouched.analysis.fontEditable, true);
assert.equal(untouched.analysis.pageCount, 2);

const unified = await editPdf(Uint8Array.from(mixed), {fonts: planFonts, marks: []}, fonts);
assert.equal(unified.report.fontsApplied, true);
const unifiedPath = fileURLToPath(new URL('unified.pdf', out));
await fs.writeFile(unifiedPath, unified.bytes);
const unifiedText = textOf(unifiedPath);
for (const field of ['合成买卖合同', '128,000.50', '2026年3月15日', '2026-04-01', '合成案例材料 · 1 / 2', '合成案例材料 · 2 / 2', '付款与交付']) assert(unifiedText.includes(field), field);
assert.equal(unifiedText.split('合成买卖合同').length - 1, 1);
const info = infoOf(unifiedPath);
assert.match(info, /Pages:\s+2/);
assert.match(info, /595\.28 x 841\.89/);
const fontList = execFileSync('pdffonts', [unifiedPath], {encoding: 'utf8'});
assert.match(fontList, /NotoSerifSC/);
assert.match(fontList, /NotoSansSC-Bold/);
const {PDFDocument: Doc} = await import('pdf-lib');
const {paintEvents} = await import('../online/reference-edit/streams.js');
const {inspectPdf, attachFontNames} = await import('../online/reference-edit/inspect.js');
const saved = await Doc.load(Uint8Array.from(unified.bytes));
const active = [];
for (const page of saved.getPages()) {
  let current = '';
  for (const event of paintEvents(saved, page)) {
    if (event.kind === 'font') current = event.baseFont;
    else if (event.kind === 'text' && !event.empty) active.push(current);
  }
}
const checked = attachFontNames(await inspectPdf(Uint8Array.from(unified.bytes)), active);
for (const run of checked.runs.filter(run => run.text.trim())) {
  if (run.role === 'title') assert.match(run.baseFont, /NotoSansSC-Bold/);
  else assert.match(run.baseFont, /NotoSerifSC/);
}
execFileSync('pdftoppm', ['-r', '72', '-png', '-f', '1', '-l', '1', unifiedPath, fileURLToPath(new URL('unified', out))]);
const rendered = await decodePng(await fs.readFile(new URL('unified-1.png', out)));
let dark = 0;
for (let i = 0; i < rendered.rgba.length; i += 4) if (rendered.rgba[i] < 80) dark++;
assert(dark > 80, 'unified glyphs did not paint');

const imagePdf = await buildImagePdf();
const imageAnalysis = await editPdf(imagePdf, {fonts: null, marks: []}, fonts);
assert.equal(imageAnalysis.analysis.fontEditable, false);
assert.match(imageAnalysis.analysis.fontBlockReason, /不能直接改字体/);
await assert.rejects(editPdf(imagePdf, {fonts: planFonts, marks: []}, fonts), error => error instanceof EditError && error.code === 'image-pdf' && /不能直接改字体/.test(error.message));

const hiddenDoc = await PDFDocument.create();
hiddenDoc.registerFontkit(fontkit);
const hiddenFont = await hiddenDoc.embedFont(fonts.song, {subset: false});
const hiddenPage = hiddenDoc.addPage([595.28, 841.89]);
const wash = await encodePng(new Uint8Array(4 * 4).fill(230), 2, 2);
hiddenPage.drawImage(await hiddenDoc.embedPng(wash), {x: 0, y: 0, width: 595.28, height: 841.89});
hiddenPage.pushOperators(setTextRenderingMode(TextRenderingMode.Invisible));
hiddenPage.drawText('隐藏的扫描文字层', {x: 72, y: 700, size: 14, font: hiddenFont, color: rgb(0, 0, 0)});
const hidden = new Uint8Array(await hiddenDoc.save());
const hiddenView = await editPdf(hidden, {fonts: null, marks: []}, fonts);
assert.equal(hiddenView.analysis.kind, 'image');
await assert.rejects(editPdf(hidden, {fonts: planFonts, marks: []}, fonts), /不能直接改字体|不可见/);

const rare = await PDFDocument.create();
rare.registerFontkit(fontkit);
const rareFont = await rare.embedFont(new Uint8Array(await fs.readFile(new URL('../online/public/fonts/NotoSansSC-Regular.ttf', import.meta.url))), {subset: false});
const rarePage = rare.addPage([595.28, 841.89]);
rarePage.drawText('含扩展字㐀的标题', {x: 72, y: 760, size: 22, font: rareFont});
rarePage.drawText('正文仍然可检索。', {x: 72, y: 700, size: 12, font: rareFont});
const rareBytes = Uint8Array.from(await rare.save());
const rareBefore = Uint8Array.from(rareBytes);
await assert.rejects(editPdf(rareBytes, {fonts: planFonts, marks: []}, fonts), error => error instanceof EditError && error.code === 'missing-glyph' && error.message.includes('㐀'));
assert.deepEqual(rareBytes, rareBefore);

await assert.rejects(editPdf(Uint8Array.from(Buffer.from('not a pdf')), {fonts: null, marks: []}, fonts), error => error.code === 'corrupt');
const huge = new Uint8Array(LIMITS.pdfBytes + 1);
huge.set(Buffer.from('%PDF-'));
await assert.rejects(editPdf(huge, {fonts: null, marks: []}, fonts), error => error.code === 'too-large');
const many = await PDFDocument.create();
for (let i = 0; i < LIMITS.pages + 1; i++) many.addPage([200, 200]);
await assert.rejects(editPdf(new Uint8Array(await many.save()), {fonts: null, marks: []}, fonts), error => error.code === 'too-many-pages');
const plain = await PDFDocument.create();
plain.addPage([200, 200]).drawText('open', {x: 10, y: 10, size: 12, font: await plain.embedFont(StandardFonts.Helvetica)});
const encrypted = Buffer.from(await plain.save()).toString('latin1').replace('/Root', '/Encrypt << /Filter /Standard /V 1 /R 2 /P -4 >> /Root');
await assert.rejects(editPdf(Uint8Array.from(Buffer.from(encrypted, 'latin1')), {fonts: null, marks: []}, fonts), error => error.code === 'encrypted');

const width = 90, height = 36, bands = new Uint8Array(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const band = Math.floor(x * 3 / width), i = (y * width + x) * 4;
  bands[i + band] = 255; bands[i + 3] = 255;
}
const sealPng = await encodePng(bands, width, height);
const decoded = await decodePng(sealPng);
const slices = sliceVertical(decoded.rgba, decoded.width, decoded.height, 3);
const rejoined = new Uint8Array(decoded.rgba.length);
for (const slice of slices) for (let y = 0; y < height; y++) {
  const start = Math.round(width * slice.index / 3);
  rejoined.set(slice.rgba.subarray(y * slice.width * 4, (y + 1) * slice.width * 4), (y * width + start) * 4);
}
assert.deepEqual(rejoined, decoded.rgba);
const host = await PDFDocument.create();
host.registerFontkit(fontkit);
const hostFont = await host.embedFont(fonts.song, {subset: false});
host.addPage([595.28, 841.89]).drawText('第一页合同正文', {x: 72, y: 700, size: 16, font: hostFont});
host.addPage([595.28, 841.89]).drawText('第二页合同正文', {x: 72, y: 700, size: 16, font: hostFont});
host.addPage([595.28, 841.89]).drawText('第三页合同正文', {x: 72, y: 700, size: 16, font: hostFont});
const hostBytes = new Uint8Array(await host.save());
await assert.rejects(editPdf(hostBytes, {fonts: null, marks: [{kind: 'seal', mode: 'perforation', png: sealPng, pageStart: 1, pageEnd: 1, widthPt: 90, heightPt: 36}]}, fonts), /骑缝章至少需要连续两页/);
const stamped = await editPdf(hostBytes, {fonts: null, marks: [{kind: 'seal', mode: 'perforation', png: sealPng, pageStart: 1, pageEnd: 3, widthPt: 90, heightPt: 36, yRatio: .5, edge: 'right', opacity: 1}]}, fonts);
const stampPath = fileURLToPath(new URL('seal.pdf', out));
await fs.writeFile(stampPath, stamped.bytes);
assert.match(textOf(stampPath), /第一页合同正文/);
assert.match(stamped.report.notes.join(''), /切开/);
const prefix = fileURLToPath(new URL('seal', out));
execFileSync('pdftoppm', ['-r', '72', '-png', stampPath, prefix]);
const expected = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
for (let page = 1; page <= 3; page++) {
  const image = await decodePng(await fs.readFile(new URL(`seal-${page}.png`, out)));
  const y = Math.round(image.height * .5);
  let edge = 0, center = 0;
  for (let x = image.width - 24; x < image.width - 6; x++) {
    const i = (y * image.width + x) * 4;
    const [r, g, b] = expected[page - 1];
    if (Math.abs(image.rgba[i] - r) < 40 && Math.abs(image.rgba[i + 1] - g) < 40 && Math.abs(image.rgba[i + 2] - b) < 40) edge++;
  }
  const mid = Math.round(image.width / 2);
  const j = (y * image.width + mid) * 4;
  if (image.rgba[j] > 220 && image.rgba[j + 1] > 220 && image.rgba[j + 2] > 220) center++;
  assert(edge > 8, `page ${page} slice is not on the edge`);
  assert.equal(center, 1);
}
assert.throws(() => cleanSealLabel('某某人民法院'), /权威机构|法院/);
const sample = await editPdf(Uint8Array.from(mixed), {fonts: null, marks: [{kind: 'seal', sample: true, label: '甲示例科技有限公司', pageStart: 2, pageEnd: 2, widthPt: 92, heightPt: 92, xRatio: .8, yRatio: .8, opacity: .9}]}, fonts);
const samplePath = fileURLToPath(new URL('sample-seal.pdf', out));
await fs.writeFile(samplePath, sample.bytes);
const sampleText = textOf(samplePath);
assert.match(sampleText, /合成样本章/);
assert.match(sampleText, /甲示例科技有限公司/);
assert.match(sampleText, /合成案例材料/);

const signedOnce = await editPdf(Uint8Array.from(mixed), {fonts: null, marks: [{kind: 'signature', source: 'generated', name: '赵六', page: 1, xRatio: .72, yRatio: .88, widthPt: 110}]}, fonts);
const signedTwice = await editPdf(Uint8Array.from(mixed), {fonts: null, marks: [{kind: 'signature', source: 'generated', name: '赵六', page: 1, xRatio: .72, yRatio: .88, widthPt: 110}]}, fonts);
const signedPath = fileURLToPath(new URL('signed.pdf', out));
await fs.writeFile(signedPath, signedOnce.bytes);
assert.match(textOf(signedPath), /赵六/);
assert.match(textOf(signedPath), /合成买卖合同/);
const undone = await editPdf(Uint8Array.from(mixed), {fonts: null, marks: []}, fonts);
const undonePath = fileURLToPath(new URL('undo.pdf', out));
await fs.writeFile(undonePath, undone.bytes);
assert.equal(textOf(undonePath).includes('赵六'), false);
const [runA, runB] = await Promise.all([signedOnce.bytes, signedTwice.bytes].map(async bytes => (await inspectPdf(Uint8Array.from(bytes))).runs.find(run => run.text.includes('赵六'))));
assert.equal(runA.text, '赵六');
assert.equal(runA.x, runB.x);
assert.equal(runA.y, runB.y);
assert.equal(runA.width, runB.width);
assert.equal(runA.fontSize, runB.fontSize);
assert.throws(() => cleanSignatureName(''), /姓名/);
assert.equal(FONT_CHOICES.sign, undefined);
assert.equal(resolveSignatureFont('sign'), 'xiaolai');
assert.equal(resolveSignatureFont('mashan'), 'xiaolai');
assert.equal(resolveSignatureFont('jason'), 'jason');
const migrated = await editPdf(Uint8Array.from(mixed), {fonts: null, marks: [{kind: 'signature', source: 'generated', font: 'sign', name: '赵六', page: 1, widthPt: 90}]}, fonts);
const migratedPath = fileURLToPath(new URL('migrated.pdf', out));
await fs.writeFile(migratedPath, migrated.bytes);
assert.match(textOf(migratedPath), /赵六/);
await assert.rejects(editPdf(Uint8Array.from(mixed), {fonts: null, marks: [{kind: 'signature', source: 'generated', font: 'chen', name: '赵六', page: 1, widthPt: 90}]}, fonts), /没有这些字/);

const other = await buildImagePdf();
const zip = new JSZip();
zip.file('Reference/合同.pdf', mixed);
zip.file('Reference/附件.pdf', other);
zip.file('notes/readme.txt', '合成目录说明，不要改动。');
const zipBytes = new Uint8Array(await zip.generateAsync({type: 'uint8array', compression: 'DEFLATE'}));
const revised = await editZip(zipBytes, {'Reference/合同.pdf': {fonts: planFonts, marks: [{kind: 'signature', source: 'generated', name: '钱七', page: 2, widthPt: 80, xRatio: .3, yRatio: .9}]}}, fonts, editPdf);
const beforeZip = readZip(zipBytes), afterZip = readZip(revised.bytes);
assert.deepEqual(afterZip.entries.map(entry => entry.path), beforeZip.entries.map(entry => entry.path));
assert.deepEqual(afterZip.entries.map(entry => entry.path), ['Reference/', 'Reference/合同.pdf', 'Reference/附件.pdf', 'notes/', 'notes/readme.txt']);
assert.deepEqual(storedPayload(afterZip, 'Reference/附件.pdf'), storedPayload(beforeZip, 'Reference/附件.pdf'));
assert.deepEqual(storedPayload(afterZip, 'notes/readme.txt'), storedPayload(beforeZip, 'notes/readme.txt'));
const revisedZip = await JSZip.loadAsync(revised.bytes);
assert.match(await revisedZip.file('Reference/合同.pdf').async('string'), /钱七|PDF/);
assert.deepEqual(new Uint8Array(await revisedZip.file('Reference/附件.pdf').async('uint8array')), other);
assert.equal(await revisedZip.file('notes/readme.txt').async('string'), '合成目录说明，不要改动。');
const contract = new Uint8Array(await revisedZip.file('Reference/合同.pdf').async('uint8array'));
const contractPath = fileURLToPath(new URL('zip-contract.pdf', out));
await fs.writeFile(contractPath, contract);
assert.match(textOf(contractPath), /钱七/);
assert.match(textOf(contractPath), /128,000\.50/);
assert.notDeepEqual(contract, mixed);

await assert.rejects(editZip(Uint8Array.from(Buffer.from('PK broken')), {'a.pdf': {fonts: null, marks: []}}, fonts, editPdf), /压缩包/);
console.log('PASS: mixed-font unify, image and invisible limits, missing glyph, corrupt/encrypted/large files, perforation slices, sample seal, stable signature undo, ZIP byte preservation');
