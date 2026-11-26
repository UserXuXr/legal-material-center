import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {encodePng} from './png.js';

async function embedNamed(doc, bytesOrName, baseFont) {
  if (typeof bytesOrName === 'string') return doc.embedFont(bytesOrName, {customName: baseFont});
  return doc.embedFont(bytesOrName, {subset: false, customName: baseFont});
}

// Synthetic vector contract. Fonts are deliberately mixed and then renamed so the
// editor can be checked without any real case file.
export async function buildMixedFontPdf(fonts) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const thin = await embedNamed(doc, fonts.thin, 'SourceHanSansSC-ExtraLight');
  const song = await embedNamed(doc, fonts.song, 'SimSun');
  const noto = await embedNamed(doc, fonts.hei, 'NotoSansSC-Regular');
  const arial = await embedNamed(doc, StandardFonts.Helvetica, 'ArialMT');
  const pages = [
    {title: '合成买卖合同', body: '正文混用字体。价款人民币', amount: '128,000.50', tail: '元，签署日期2026年3月15日。', foot: '合成案例材料 · 1 / 2'},
    {title: '付款与交付', body: '第二页仍是矢量正文。交付地点为示例市甲路1号，', amount: '2026-04-01', tail: '前付清。', foot: '合成案例材料 · 2 / 2'},
  ];
  for (const item of pages) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(item.title, {x: 180, y: 760, size: 22, font: thin, color: rgb(0, 0, 0)});
    page.drawText(item.body, {x: 72, y: 700, size: 12, font: song, color: rgb(.1, .1, .1)});
    const bodyWidth = song.widthOfTextAtSize(item.body, 12);
    page.drawText(item.amount, {x: 72 + bodyWidth + 4, y: 700, size: 12, font: arial, color: rgb(0, 0, 0)});
    const amountWidth = arial.widthOfTextAtSize(item.amount, 12);
    page.drawText(item.tail, {x: 72 + bodyWidth + amountWidth + 8, y: 700, size: 12, font: noto, color: rgb(.1, .1, .1)});
    page.drawText('本合同为合成测试样本，不代表真实交易。', {x: 72, y: 660, size: 12, font: song});
    page.drawText(item.foot, {x: 72, y: 40, size: 9, font: song, color: rgb(.35, .35, .35)});
  }
  return new Uint8Array(await doc.save());
}

export async function buildImagePdf() {
  const doc = await PDFDocument.create();
  const png = await encodePng(Uint8Array.from([180, 170, 150, 255]), 1, 1);
  const image = await doc.embedPng(png);
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawImage(image, {x: 0, y: 0, width: 595.28, height: 841.89});
  }
  return new Uint8Array(await doc.save());
}
