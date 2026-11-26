import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {DOMParser} from '@xmldom/xmldom';
import {imageAndTextPDF} from '../online/shared/pdf.js';
import {FONT_COVERAGE,PAIRINGS,activePairing,handFont,loadHandFont,missingGlyphs,officeFonts,setExportPairing} from '../online/shared/font-policy.js';
import {SEAL_KINDS,SEAL_TEXTURES,applyPageScan,applySealTexture,arcGlyphAngles,arcReadsLeftToRight,drawSeal,inkStats,knockoutPaper,sealPlacement,uprightAngle,verticalSlice} from '../online/shared/seal.js';
import {renderNewMaterial} from '../online/materials/render.js';
import {exampleDocument} from '../online/materials/documents.js';
import {pdfFromImages as financePdf} from '../online/modules/finance/lib/export.ts';
import {documentPages as financePages} from '../online/modules/finance/lib/documents.ts';
import {demo} from '../online/modules/finance/lib/finance.ts';
import {cleanSeal} from '../online/scans/model.js';
import {editZip,readZip,storedPayload} from '../online/reference-edit/zip.js';
import {editPdf} from '../online/reference-edit/edit.js';
import JSZip from 'jszip';

GlobalFonts.registerFromPath(fileURLToPath(new URL('../online/public/fonts/NotoSansSC-Bold.ttf', import.meta.url)), 'SealUI');
const rare = '龘';
for (const font of ['xiaolai','jason','chen','yshi','tsuipita']) {
  handFont(font);
  const bytes = await loadHandFont(font);
  const missing = missingGlyphs(bytes, rare + '国');
  assert.equal(missing.includes(rare), true, font);
  assert.equal(missing.includes('国'), false, font + ' should cover 国');
  assert.equal(missingGlyphs(bytes, '沈予安').length, 0, font);
}
assert.throws(() => handFont('mashan'), /没有这款/);

const bottom = arcGlyphAngles('合成样本章', 200, 200, 140, 140, 130, 50, Array(5).fill(18));
assert.equal(bottom.length, 5);
assert(bottom.every(glyph => Math.abs(glyph.angle) <= 90), 'bottom arc stays upright');
assert(bottom[0].x < bottom.at(-1).x, 'bottom arc reads left to right');
const inward = uprightAngle(170);
assert(Math.abs(inward) <= 90);

function canvasSeal(spec) {
  const oval = spec.kind === 'oval_contract';
  const width = 360, height = oval ? Math.round(width / 1.36) : 360;
  const canvas = createCanvas(width, height + (spec.kind === 'name_chop' || spec.kind === 'circle_name_only' ? 28 : 0));
  const ctx = canvas.getContext('2d');
  drawSeal(ctx, {...spec, size: width});
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const textured = applySealTexture(image.data, canvas.width, canvas.height, spec.texture || 'normal');
  return {rgba: textured, width: canvas.width, height: canvas.height};
}
const hashes = new Set();
const stats = {};
for (const kind of SEAL_KINDS) for (const texture of SEAL_TEXTURES.filter(item => item.id !== 'scan')) {
  const image = canvasSeal({kind: kind.id, texture: texture.id, company: '苍澜示意科技有限公司', person: '沈予安'});
  const ink = inkStats(image.rgba);
  stats[kind.id] ||= {}; stats[kind.id][texture.id] = ink;
  let hash = 0;
  for (let i = 0; i < image.rgba.length; i += 80) hash = Math.imul(hash, 31) + image.rgba[i] >>> 0;
  const key = kind.id + ':' + texture.id + ':' + hash + ':' + ink.coverage;
  assert.equal(hashes.has(key), false);
  hashes.add(key);
}
for (const kind of SEAL_KINDS) {
  const row = stats[kind.id];
  assert(row.light.mean < row.normal.mean * .9, kind.id + ' light');
  assert(row.gap.coverage < row.light.coverage, kind.id + ' gap');
  assert(row.heavy.coverage > row.normal.coverage, kind.id + ' heavy');
}
const base = canvasSeal({kind:'circle_emblem', texture:'normal', company:'苍澜示意科技有限公司'});
const heavy = canvasSeal({kind:'circle_emblem', texture:'heavy', company:'苍澜示意科技有限公司'});
for (const image of [base, heavy]) {
  for (const widths of [[90,90,90,90], [70,80,100,110]]) {
    assert.equal(widths.reduce((sum, width) => sum + width, 0), image.width);
    let x = 0; const parts = widths.map((width, index) => {
      const slice = new Uint8Array(width * image.height * 4);
      for (let y = 0; y < image.height; y++) slice.set(image.rgba.subarray((y * image.width + x) * 4, (y * image.width + x + width) * 4), y * width * 4);
      x += width; return slice;
    });
    const back = new Uint8Array(image.rgba.length); x = 0;
    parts.forEach((slice, index) => {
      for (let y = 0; y < image.height; y++) back.set(slice.subarray(y * widths[index] * 4, (y + 1) * widths[index] * 4), (y * image.width + x) * 4);
      x += widths[index];
    });
    assert.equal(back.length, image.rgba.length);
    for (let i = 0; i < back.length; i++) if (back[i] !== image.rgba[i]) throw new Error('骑缝拼合在第 ' + i + ' 个字节不一致');
  }
}
const page = new Uint8Array(80 * 40 * 4);
for (let i = 0; i < page.length; i += 4) { page[i] = page[i + 1] = page[i + 2] = 250; page[i + 3] = 255; }
page[4] = 10;
const scanned = applyPageScan(page, 80, 40);
assert.notEqual(scanned[4], page[4]);
assert.notEqual(scanned[scanned.length - 2], page[page.length - 2]);
assert.throws(() => cleanSeal({enabled:true, kind:'circle_emblem', texture:'normal', company:'某某人民法院'}), /法院/);
assert.equal(cleanSeal(null), null);
assert.equal(cleanSeal({enabled:false}).enabled, false);

setExportPairing('song-times');
const song = activePairing();
setExportPairing('hei-helvetica');
const hei = activePairing();
assert.equal(song.chinese, 'song'); assert.equal(hei.latin, 'helvetica');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text x="20" y="40">合成合同 RMB 128,000.50 元</text><text x="20" y="80">合成案例材料</text></svg>`;
const png = 'data:image/png;base64,' + Buffer.from(await (await import('sharp')).default({create:{width:20,height:20,channels:3,background:'#fff'}}).png().toBuffer()).toString('base64');
const pageSpec = {width:400, height:200, svg};
async function fontNames(blob) {
  const path = fileURLToPath(new URL('../work/seal-platform.pdf', import.meta.url));
  await fs.mkdir(new URL('../work/', import.meta.url), {recursive:true});
  await fs.writeFile(path, Buffer.from(await blob.arrayBuffer()));
  return execFileSync('pdffonts', [path], {encoding:'utf8'});
}
setExportPairing('song-times');
const docPdf = await renderNewMaterial({document_id:'font-doc', revision:1, title:'劳动合同', engine:'documents', formats:['pdf'], pdf_mode:'searchable', payload:{document:exampleDocument('employment-contract')}}, {Parser:DOMParser, rasterize: async () => png});
const finance = financePages(demo(), demo().transactions[0], 'invoice');
const financeBlob = await financePdf(finance, finance.map(() => png), {Parser:DOMParser, dimensions:() => [400, 200]});
const docFonts = await fontNames(docPdf.find(file => file.format === 'pdf').blob);
const financeFonts = await fontNames(financeBlob);
assert.match(docFonts, /NotoSerifSC/); assert.match(docFonts, /Times/);
assert.match(financeFonts, /NotoSerifSC/); assert.match(financeFonts, /Times/);
const direct = await imageAndTextPDF([pageSpec], [png], {pairing: PAIRINGS.find(item => item.id === 'hei-helvetica'), Parser:DOMParser, dimensions:() => [400, 200]});
assert.match(await fontNames(direct), /NotoSansSCBold/);
assert.match(await fontNames(direct), /Helvetica/);
const text = execFileSync('pdftotext', [fileURLToPath(new URL('../work/seal-platform.pdf', import.meta.url)), '-'], {encoding:'utf8'});
assert.match(text, /128,000\.50|合成/);
await assert.rejects(imageAndTextPDF([{width:200,height:100,svg:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="10" y="40">缺字龘</text></svg>'}], [png], {pairing: song, Parser:DOMParser, dimensions:() => [200, 100]}), /缺少这些字/);

const {cleanSignature}=await import('../online/scans/model.js');
assert.equal(cleanSignature(null).enabled, false);
assert.equal(cleanSignature({enabled:false}).enabled, false);
assert.throws(() => cleanSignature({enabled:true, font:'xiaolai', name:''}), /姓名/);

const zip = new JSZip();
zip.file('Reference/a.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF'));
zip.file('notes/keep.txt', '保持原字节');
const packed = new Uint8Array(await zip.generateAsync({type:'uint8array', compression:'DEFLATE'}));
const before = readZip(packed);
const replaced = await editZip(packed, {}, null, async () => { throw Error('不应改写'); }).catch(error => error);
assert.match(String(replaced.message || replaced), /请选择|没有/);
assert.deepEqual(storedPayload(readZip(packed), 'notes/keep.txt'), storedPayload(before, 'notes/keep.txt'));
assert.equal(arcReadsLeftToRight(130, 50), true);
assert.equal(arcReadsLeftToRight(50, 130), false);
assert.equal(arcReadsLeftToRight(-200, 20, 160, 160), true);
const wide = canvasSeal({kind:'oval_contract', texture:'normal', company:'苍澜示意科技有限公司', topInset:12, bottomInset:18, topStart:-200, topEnd:20});
const tight = canvasSeal({kind:'oval_contract', texture:'normal', company:'苍澜示意科技有限公司', topInset:80, bottomInset:90, topStart:30, topEnd:-210});
assert.notEqual(inkStats(wide.rgba).coverage, inkStats(tight.rgba).coverage);
const kept = cleanSeal({enabled:true, kind:'circle_emblem', texture:'normal', company:'苍澜示意科技有限公司', topStart:-180, topEnd:15, bottomStart:140, bottomEnd:40, topTracking:1.2, bottomTracking:1.3, topInset:40, bottomInset:55, xRatio:.33, yRatio:.61, scale:.18, opacity:.5});
assert.equal(cleanSeal(kept).topStart, -180);
assert.equal(cleanSeal(kept).opacity, .5);
assert.equal(cleanSeal(kept).bottomEnd, 40);
const white = new Uint8Array(8 * 8 * 4);
for (let i = 0; i < white.length; i += 4) { white[i] = white[i + 1] = white[i + 2] = 255; white[i + 3] = 255; }
white[0] = 196; white[1] = 32; white[2] = 30;
const opened = knockoutPaper(white);
assert.equal(opened[3], 255);
assert.equal(opened[7], 0);
const {encodePng} = await import('../online/reference-edit/png.js');
const pngBytes = await encodePng(white, 8, 8);
const b64 = Buffer.from(pngBytes).toString('base64');
assert.throws(() => cleanSeal({enabled:true, kind:'circle_emblem', texture:'gap', source:'png', company:'苍澜示意科技有限公司', png:b64}), /授权/);
const authorized = cleanSeal({enabled:true, kind:'circle_emblem', texture:'gap', source:'png', authorized:true, company:'苍澜示意科技有限公司', png:b64});
const {prepareSealAsset, sealBitmap} = await import('../online/scans/seal-asset.js');
const asset = await prepareSealAsset(authorized);
assert.equal(asset.rgba[3], 255);
assert.equal(asset.rgba[7], 0);
assert.equal(sealBitmap(authorized.png), asset);
await assert.rejects(prepareSealAsset(cleanSeal({enabled:true, kind:'circle_name_only', texture:'normal', source:'png', authorized:true, company:'苍澜示意科技有限公司', png:'A'.repeat(48)})), /PNG|无法|过滤|章面/);
const right = sealPlacement(1000, 1400, 300, 300, {mode:'perforation', pageCount:3, edge:'right', scale:.24, yRatio:.5}, 2);
const left = sealPlacement(1000, 1400, 300, 300, {mode:'perforation', pageCount:3, edge:'left', scale:.24, yRatio:.5}, 0);
assert.equal(Math.round(right.x + right.dw), 1000);
assert.equal(left.x, 0);
assert.notEqual(right.sw, 300);
const names = new Set(FONT_COVERAGE.map(item => item.id));
for (const id of ['documents-pdf','documents-docx','images-pdf','original','certificates-pdf','finance-pdf','finance-data','rights-pdf','contracts-docx','business-docx','business-data','batch','scans','screenshots','reference-edit']) assert.equal(names.has(id), true, id);
assert.equal(officeFonts(PAIRINGS.find(item => item.id === 'song-times')).ascii, 'Times New Roman');
assert.equal(officeFonts(PAIRINGS.find(item => item.id === 'hei-helvetica')).eastAsia, 'Noto Sans SC');
setExportPairing('hei-times');
const docx = await renderNewMaterial({document_id:'font-docx', revision:1, title:'劳动合同', engine:'documents', formats:['docx'], pdf_mode:'searchable', payload:{document:exampleDocument('employment-contract')}});
const styles = await (await JSZip.loadAsync(await docx[0].blob.arrayBuffer())).file('word/styles.xml').async('string');
assert.match(styles, /Times New Roman/);
assert.match(styles, /Noto Sans SC/);
const {stampContractPerforation} = await import('../online/shared/contract-perforation.js');
const {PDFDocument, StandardFonts} = await import('pdf-lib');
const host = await PDFDocument.create();
const roman = await host.embedFont(StandardFonts.Helvetica);
host.addPage([420, 560]).drawText('Contract page one 1280.50', {x: 36, y: 500, size: 14, font: roman});
host.addPage([420, 560]).drawText('Contract page two 2026-04-01', {x: 36, y: 500, size: 14, font: roman});
const raw = new Uint8Array(await host.save());
const untouched = raw.slice();
await assert.rejects(stampContractPerforation(raw, {enabled: false, mode: 'perforation'}, createCanvas), /不会自动/);
assert.deepEqual(raw, untouched);
const {decodePng, sliceVertical} = await import('../online/reference-edit/png.js');
for (const count of [3, 4, 5, 7, 8, 30]) {
  let covered = 0;
  const widths = [];
  for (let index = 0; index < count; index++) {
    const part = verticalSlice(480, count, index);
    assert.equal(part.start, covered);
    covered = part.end;
    widths.push(part.width);
    const box = sealPlacement(420, 560, 480, 480, {mode: 'perforation', pageCount: count, edge: 'right', scale: .3, yRatio: .5}, index);
    assert.equal(box.sx, part.start);
    assert.equal(box.sw, part.width);
    assert.equal(Math.round((box.x + box.dw) * 100), 42000);
  }
  assert.equal(covered, 480);
  assert.equal(widths.reduce((sum, width) => sum + width, 0), 480);
  const band = new Uint8Array(480 * 4 * 4);
  for (let x = 0; x < 480; x++) for (let y = 0; y < 4; y++) {
    const i = (y * 480 + x) * 4;
    band[i] = x % 251; band[i + 1] = (x * 3) % 251; band[i + 2] = 20; band[i + 3] = 255;
  }
  const parts = sliceVertical(band, 480, 4, count);
  const back = new Uint8Array(band.length);
  let cursor = 0;
  for (const part of parts) {
    assert.equal(part.width, widths[part.index]);
    for (let y = 0; y < 4; y++) back.set(part.rgba.subarray(y * part.width * 4, (y + 1) * part.width * 4), (y * 480 + cursor) * 4);
    cursor += part.width;
  }
  assert.deepEqual(back, band);
}
assert.throws(() => verticalSlice(4, 8, 3), /不能均分/);
async function stampedContract(count) {
  const book = await PDFDocument.create();
  const face = await book.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < count; index++) book.addPage([420, 560]).drawText(`Contract page ${index + 1} amount 1280.50`, {x: 36, y: 500, size: 14, font: face});
  const source = new Uint8Array(await book.save());
  const kept = source.slice();
  const output = await stampContractPerforation(source, {enabled: true, mode: 'perforation', kind: 'circle_emblem', texture: 'normal', company: '苍澜示意科技有限公司', edge: 'right', scale: .36, yRatio: .5, opacity: 1, filename: `买卖合同-${count}页.pdf`}, createCanvas);
  assert.deepEqual(source, kept);
  const path = fileURLToPath(new URL(`../work/contract-perforation-${count}.pdf`, import.meta.url));
  await fs.writeFile(path, output);
  const text = execFileSync('pdftotext', [path, '-'], {encoding: 'utf8'});
  for (let index = 1; index <= count; index++) assert.match(text, new RegExp(`page ${index} amount 1280\\.50`));
  execFileSync('pdftoppm', ['-r', '72', '-png', path, fileURLToPath(new URL(`../work/contract-perforation-${count}`, import.meta.url))]);
  const fingerprints = [];
  for (let page = 1; page <= count; page++) {
    const image = await decodePng(await fs.readFile(new URL(`../work/contract-perforation-${count}-${page}.png`, import.meta.url)));
    let right = 0, center = 0, signature = 0;
    for (let y = 0; y < image.height; y++) {
      for (let x = image.width - 28; x < image.width; x++) {
        const i = (y * image.width + x) * 4;
        if (image.rgba[i] > 140 && image.rgba[i + 1] < 100 && image.rgba[i + 2] < 100) {
          right++;
          signature = Math.imul(signature, 33) + y + x >>> 0;
        }
      }
      const mid = (y * image.width + Math.round(image.width / 2)) * 4;
      if (image.rgba[mid] > 140 && image.rgba[mid + 1] < 100 && image.rgba[mid + 2] < 100) center++;
    }
    assert(right > 12, `${count} pages, page ${page} perforation is not on the edge`);
    assert(center < 5, `${count} pages, page ${page} repeats a full seal`);
    fingerprints.push(signature);
  }
  assert.equal(new Set(fingerprints).size, count, `${count} pages reused a slice`);
}
await stampedContract(3);
await stampedContract(5);
await stampedContract(8);
const one = await PDFDocument.create();
one.addPage([420, 560]);
await assert.rejects(stampContractPerforation(new Uint8Array(await one.save()), {enabled: true, mode: 'perforation', kind: 'circle_emblem', texture: 'normal', filename: '单页.pdf'}, createCanvas), /至少需要连续两页/);
const ruling = await PDFDocument.create();
ruling.setTitle('民事裁定书');
ruling.addPage([420, 560]); ruling.addPage([420, 560]);
await assert.rejects(stampContractPerforation(new Uint8Array(await ruling.save()), {enabled: true, mode: 'perforation', kind: 'circle_emblem', texture: 'normal', filename: '材料.pdf'}, createCanvas), /裁定书/);
await assert.rejects(stampContractPerforation(raw, {enabled: true, mode: 'perforation', kind: 'circle_emblem', texture: 'normal', filename: '民事判决书.pdf'}, createCanvas), /判决书/);
console.log('PASS: five handwriting fonts, 5x5 textures, upright arcs, perforation reassembly, paired export fonts, unsigned drafts, scan scope');
