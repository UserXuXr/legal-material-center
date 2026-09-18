import type { RecordItem } from './registry';
import { patentBackground, sampleQRPath, sampleQRSize, sampleBarcodePath, sampleBarcodeWidth } from './patent-art';

const escape = (value: string) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const txt = (x: number, y: number, value: string, size = 17, anchor = 'start', fill = '#29251f') => `<text x="${x}" y="${y}" font-family="Songti SC,SimSun,serif" font-size="${size}" text-anchor="${anchor}" fill="${fill}">${escape(value)}</text>`;
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(0,4)}年${value.slice(5,7)}月${value.slice(8,10)}日` : value;
function lines(value: string, width: number, size = 17) {
  const result: string[] = [];
  for (const paragraph of String(value ?? '').split('\n')) {
    let row = '', used = 0;
    for (const char of paragraph) {
      const advance = /[\u0020-\u007e]/.test(char) ? size * .56 : size;
      if (row && used + advance > width) { result.push(row); row = ''; used = 0; }
      row += char; used += advance;
    }
    result.push(row);
  }
  return result;
}

// The decorative image has no variable text. Every field remains escaped SVG text.
export function patentCertificate(record: RecordItem): string[] {
  const f = record.fields;
  const extra: [string, string][] = [];
  const field = (x: number, y: number, value: string, width: number, label: string, maxLines = 2, size = 17) => {
    const rows = lines(value, width, size);
    if (rows.length > maxLines) {
      extra.push([label, value]);
      return txt(x, y, `详见照面附页第${extra.length}项`, size);
    }
    return rows.map((row, i) => txt(x, y + i * 23, row, size)).join('');
  };
  let front = `<image x="0" y="0" width="794" height="1123" preserveAspectRatio="none" href="${patentBackground}"/>`;
  front += field(79, 104, `证书号第 ${f.certificateNo} 号`, 258, '证书号', 2, 14);
  front += `<g transform="translate(629 89) scale(${75 / sampleQRSize})"><rect width="${sampleQRSize}" height="${sampleQRSize}" fill="#fff"/><path d="${sampleQRPath}" fill="#242321"/></g>`;
  front += txt(667, 178, '样本码', 10, 'middle', '#8f8274');
  const title = `${f.patentType}专利证书`;
  front += `<text x="402" y="265" text-anchor="middle" font-family="Songti SC,SimSun,serif" font-size="39" letter-spacing="10" fill="#181714">${escape(title)}</text>`;
  const nameLabel = f.patentType === '发明' ? '发 明 名 称' : f.patentType === '外观设计' ? '外观设计名称' : '实用新型名称';
  const rows: [string, string][] = [
    [nameLabel, f.title], [f.patentType === '外观设计' ? '设　计　人' : '发　明　人', f.inventors],
    ['专　利　号', f.number], ['专利申请日', date(f.applicationDate)], ['专 利 权 人', f.owner], ['地　　　址', f.address],
  ];
  rows.forEach(([label, value], i) => {
    front += txt(97, 346 + i * 49, `${label}：`, 17);
    front += field(217, 346 + i * 49, value, 483, label);
  });
  front += txt(97, 654, '授权公告日：', 16) + field(207, 654, date(f.grantDate), 205, '授权公告日', 1, 16);
  front += txt(419, 654, '授权公告号：', 16) + field(528, 654, f.publicationNo, 176, '授权公告号', 2, 16);
  const paragraphs = [
    `　　国家知识产权局依照中华人民共和国专利法进行审查，决定授予专利权，颁发${f.patentType}专利证书并在专利登记簿上予以登记。专利权自授权公告之日起生效。`,
    '　　本证书记载专利权登记时的法律状况。专利权的转移、质押、无效、终止、恢复等事项以及专利权人的姓名或名称、地址变更等事项记载在专利登记簿上。',
  ];
  let y = 705;
  for (const paragraph of paragraphs) {
    lines(paragraph, 608, 14).forEach(row => { front += txt(97, y, row, 14); y += 23; });
    y += 7;
  }
  front += `<g transform="translate(98 900) scale(${210 / sampleBarcodeWidth} 1)"><path d="${sampleBarcodePath}" fill="#585146"/></g>`;
  front += txt(98, 934, 'SYN-PATENT · 样本条码', 10, 'start', '#7d7468');
  front += txt(98, 978, '局长', 18) + txt(192, 978, '（样本署名）', 18);
  front += txt(600, 971, '（登记机构样本章）', 18, 'middle');
  front += txt(600, 1029, date(f.issueDate), 19, 'middle');

  const plain = (heading: string) => `<rect width="794" height="1123" fill="#fffefa"/><rect x="42" y="37" width="710" height="1048" fill="none" stroke="#87523e" stroke-width="2"/><rect x="47" y="42" width="700" height="1038" fill="none" stroke="#87523e" stroke-width=".7"/>${txt(397, 140, heading, 30, 'middle')}`;
  const pages = [front];
  // Back and overflow sheets preserve all text, including very long names and numbers.
  const detailPages = (heading: string, entries: [string, string][]) => {
    let body = plain(heading), cursor = 225, continuation = 0;
    const next = () => { pages.push(body); body = plain(`${heading}（续${++continuation}）`); cursor = 225; };
    const write = (value: string, size = 18, x = 98, width = 598) => {
      for (const row of lines(value, width, size)) {
        if (cursor > 1000) next();
        body += txt(x, cursor, row, size); cursor += 30;
      }
    };
    write(`证书号：${f.certificateNo}`, 15);
    write(`专利号：${f.number}`, 15);
    cursor += 48;
    for (const [label, value] of entries) {
      if (cursor > 925) next();
      write(label, 19); cursor += 7;
      write(value, 18, 123, 569); cursor += 27;
    }
    pages.push(body);
  };
  detailPages(`${f.patentType}专利证书（背面）`, [
    ['专利申请日时的申请人', f.initialApplicants],
    [f.patentType === '外观设计' ? '专利申请日时的设计人' : '专利申请日时的发明人', f.initialInventors],
    ['专利申请日', date(f.applicationDate)],
  ]);
  if (extra.length) detailPages('专利证书照面附页', extra.map(([label, value], i) => [`${i + 1}. ${label}`, value]));
  return pages.map((body, i) => `<svg xmlns="http://www.w3.org/2000/svg" width="794" height="1123" viewBox="0 0 794 1123">${body}${txt(397, 1064, '合成测试样本 · 不用于真实登记', 12, 'middle', '#8b6b59')}${txt(725, 1073, `${i + 1} / ${pages.length}`, 10, 'end', '#8b7c70')}</svg>`);
}
