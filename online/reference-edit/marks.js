import {EditError} from './errors.js';

const BLOCKED = /人民法院|人民检察院|公安局|公安厅|公证处|人民政府|市场监督管理局|知识产权局|中华人民共和国|国务院|税务局|海关总署|监察委员会|司法部|国徽/;

export function cleanSealLabel(label) {
  const text = String(label || '').trim();
  if (!text || [...text].length > 40) throw new EditError('样本章的主体名称需为1至40字。', 'seal');
  if (BLOCKED.test(text)) throw new EditError('不能生成冒充法院、公证处、行政机关或其他权威机构的章面。请使用案例中的虚构主体，章面始终带有“合成样本章”。', 'seal');
  return text;
}

export function cleanSignatureName(name) {
  const text = String(name || '').replace(/\s+/g, '').trim();
  if (!text || [...text].length > 12) throw new EditError('模拟签名只接受1至12个字的姓名，用来生成稳定的字体签名。', 'signature');
  if (/[<>{}\\]/.test(text)) throw new EditError('姓名含无法排版的字符。', 'signature');
  return text;
}

export function pagesInRange(pageCount, start, end) {
  const first = Math.max(1, Math.trunc(start || 1));
  const last = Math.min(pageCount, Math.trunc(end || first));
  if (first > last) throw new EditError('页面范围无效。', 'range');
  return Array.from({length: last - first + 1}, (_, i) => first + i);
}

export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

// yRatio is the box center measured from the top of the page, 0–1.
export function boxPosition({pageWidth, pageHeight, width, height, xRatio = .5, yRatio = .5, mode = 'stamp', edge = 'right', sliceIndex = 0, sliceCount = 1}) {
  if (mode === 'perforation') {
    const sliceWidth = width / sliceCount;
    const x = edge === 'left' ? 0 : pageWidth - sliceWidth;
    const y = clamp(pageHeight * (1 - yRatio) - height / 2, 0, Math.max(0, pageHeight - height));
    return {x, y, width: sliceWidth, height, sliceIndex};
  }
  const x = clamp(pageWidth * xRatio - width / 2, 0, Math.max(0, pageWidth - width));
  const y = clamp(pageHeight * (1 - yRatio) - height / 2, 0, Math.max(0, pageHeight - height));
  return {x, y, width, height};
}
