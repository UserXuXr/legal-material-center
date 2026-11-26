const INK = '#c4201e';
const BLOCKED = /人民法院|人民检察院|公安局|公安厅|公证处|人民政府|市场监督管理局|知识产权局|中华人民共和国|国务院|税务局|海关总署|监察委员会|司法部|国徽/;
export const SEAL_KINDS = [
  {id:'circle_emblem', label:'圆形公司章', note:'中心星徽，外圈公司名，下弧为合成样本章'},
  {id:'oval_contract', label:'横椭圆合同专用章', note:'外圈公司名，中心「合同专用章」，无星'},
  {id:'circle_name_only', label:'圆形外圈公司名', note:'中心留空，合成标识写在章外'},
  {id:'circle_center_text', label:'圆形中心文字专用章', note:'中心「合同专用章」，无星'},
  {id:'name_chop', label:'个人姓名方章', note:'双框竖排，无钻石纹，合成标识在章外'},
];
export const SEAL_TEXTURES = [
  {id:'normal', label:'正常盖印', scope:'仅印面'},
  {id:'light', label:'少墨', scope:'仅印面，整体变细变疏'},
  {id:'gap', label:'局部缺印', scope:'仅印面，成片接触缺失'},
  {id:'heavy', label:'稠墨', scope:'仅印面，笔画增厚洇连'},
  {id:'scan', label:'扫描', scope:'整页文字与印记一起退化'},
];
export function cleanSealText(value, label) {
  const text = String(value || '').trim();
  if (!text || [...text].length > 40) throw Error(`${label}需为1至40字`);
  if (BLOCKED.test(text)) throw Error('不能生成冒充法院、公证处或行政机关的章面。请使用虚构主体，并保留合成样本标记。');
  return text;
}
export function uprightAngle(tangentDeg) {
  let angle = tangentDeg;
  while (angle <= -180) angle += 360;
  while (angle > 180) angle -= 360;
  if (Math.abs(angle) > 90) angle += 180;
  while (angle <= -180) angle += 360;
  while (angle > 180) angle -= 360;
  return angle;
}
function ellipsePoint(cx, cy, rx, ry, theta) {
  return [cx + rx * Math.cos(theta), cy + ry * Math.sin(theta)];
}
function tangentDeg(rx, ry, theta) {
  return Math.atan2(ry * Math.cos(theta), -rx * Math.sin(theta)) * 180 / Math.PI;
}
export function arcGlyphAngles(text, cx, cy, rx, ry, startDeg, endDeg, widths, tracking = 1.06) {
  const start = startDeg * Math.PI / 180, end = endDeg * Math.PI / 180;
  const steps = 400;
  const thetas = Array.from({length: steps + 1}, (_, i) => start + (end - start) * i / steps);
  const segs = [0];
  for (let i = 1; i < thetas.length; i++) {
    const p0 = ellipsePoint(cx, cy, rx, ry, thetas[i - 1]), p1 = ellipsePoint(cx, cy, rx, ry, thetas[i]);
    segs.push(segs.at(-1) + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
  }
  const total = segs.at(-1);
  let scale = tracking;
  let need = widths.reduce((sum, width) => sum + width, 0) * scale;
  if (need > total) { scale = total / (widths.reduce((sum, width) => sum + width, 0) * 1.02); need = widths.reduce((sum, width) => sum + width, 0) * scale; }
  let cursor = Math.max(0, total - need) / 2;
  return [...text].map((ch, index) => {
    const width = widths[index] * scale;
    const target = cursor + width / 2;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (segs[mid] < target) lo = mid + 1; else hi = mid; }
    const theta = thetas[Math.min(lo, thetas.length - 1)];
    const [x, y] = ellipsePoint(cx, cy, rx, ry, theta);
    const angle = uprightAngle(tangentDeg(rx, ry, theta));
    cursor += width;
    return {ch, x, y, angle};
  });
}
function star(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? inner : outer;
    const angle = (-90 + i * 36) * Math.PI / 180;
    const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
}
function ring(ctx, cx, cy, rx, ry, width) {
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
}
function arcText(ctx, text, cx, cy, rx, ry, start, end, size, tracking) {
  ctx.font = `700 ${size}px SealUI`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const widths = [...text].map(ch => ctx.measureText(ch).width * .72);
  for (const glyph of arcGlyphAngles(text, cx, cy, rx, ry, start, end, widths, tracking)) {
    ctx.save(); ctx.translate(glyph.x, glyph.y); ctx.rotate(glyph.angle * Math.PI / 180); ctx.fillText(glyph.ch, 0, 0); ctx.restore();
  }
}
export function drawSeal(ctx, spec) {
  const company = cleanSealText(spec.company || '苍澜示意科技有限公司', '章面主体');
  const kind = spec.kind || 'circle_emblem';
  const size = spec.size || 520;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = INK; ctx.strokeStyle = INK;
  const topStart = spec.topStart ?? spec.topSpan?.[0] ?? DEFAULT_ARC.topStart;
  const topEnd = spec.topEnd ?? spec.topSpan?.[1] ?? DEFAULT_ARC.topEnd;
  const bottomStart = spec.bottomStart ?? spec.bottomSpan?.[0] ?? DEFAULT_ARC.bottomStart;
  const bottomEnd = spec.bottomEnd ?? spec.bottomSpan?.[1] ?? DEFAULT_ARC.bottomEnd;
  const topTrack = spec.topTracking || DEFAULT_ARC.topTracking, bottomTrack = spec.bottomTracking || DEFAULT_ARC.bottomTracking;
  const topInset = Number.isFinite(spec.topInset) ? spec.topInset : DEFAULT_ARC.topInset;
  const bottomInset = Number.isFinite(spec.bottomInset) ? spec.bottomInset : (kind === 'oval_contract' ? 48 : DEFAULT_ARC.bottomInset);
  if (kind === 'name_chop') {
    const name = cleanSealText(spec.person || '沈予安', '姓名');
    const chars = [...name].slice(0, 4);
    const margin = 18;
    ctx.lineWidth = 8; ctx.strokeRect(margin, margin, size - margin * 2, size - margin * 2);
    ctx.lineWidth = 4; ctx.strokeRect(margin + 16, margin + 16, size - (margin + 16) * 2, size - (margin + 16) * 2);
    ctx.font = `700 ${size * .2}px SealUI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    chars.forEach((ch, index) => ctx.fillText(ch, size / 2, size * (.28 + index * .16)));
    ctx.font = `600 ${size * .06}px SealUI`; ctx.fillText('合成样本', size / 2, size - 8);
    return;
  }
  const oval = kind === 'oval_contract';
  const width = oval ? size : size, height = oval ? Math.round(size / 1.36) : size;
  const cx = ctx.canvas.width / 2, cy = ctx.canvas.height / 2;
  const rx = (oval ? width : size) * .46, ry = (oval ? height : size) * .46;
  ring(ctx, cx, cy, rx, ry, 7);
  ring(ctx, cx, cy, rx - 16, ry - 16, 3);
  arcText(ctx, company, cx, cy, Math.max(8, rx - topInset), Math.max(8, ry - topInset), topStart, topEnd, size * (oval ? .05 : .064), topTrack);
  if (kind === 'circle_emblem') {
    star(ctx, cx, cy - 6, size * .11, size * .045);
    arcText(ctx, '合成样本章', cx, cy, Math.max(8, rx - bottomInset), Math.max(8, ry - bottomInset), bottomStart, bottomEnd, size * .05, bottomTrack);
  } else if (kind === 'oval_contract' || kind === 'circle_center_text') {
    ctx.font = `700 ${size * .07}px SealUI`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('合同专用章', cx, cy);
    arcText(ctx, '合成样本章', cx, cy, Math.max(8, rx - bottomInset), Math.max(8, ry - bottomInset), bottomStart, bottomEnd, size * .042, bottomTrack);
  } else if (kind === 'circle_name_only') {
    ctx.font = `600 ${size * .055}px SealUI`; ctx.textAlign = 'center';
    ctx.fillText('合成样本', cx, cy + ry + 18);
  }
}
function rand(seed) { let state = seed >>> 0; return () => (state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 4294967296; }
function noise(width, height, cell, next) {
  const gw = Math.ceil(width / cell) + 2, gh = Math.ceil(height / cell) + 2;
  const grid = Array.from({length: gw * gh}, () => next());
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy), tx = gx - x0, ty = gy - y0;
    const at = (yy, xx) => grid[yy * gw + xx];
    out[y * width + x] = at(y0, x0) * (1 - tx) * (1 - ty) + at(y0, x0 + 1) * tx * (1 - ty) + at(y0 + 1, x0) * (1 - tx) * ty + at(y0 + 1, x0 + 1) * tx * ty;
  }
  return out;
}
function filterAlpha(alpha, width, height, radius, mode) {
  const out = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = mode === 'max' ? 0 : 255;
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const xx = Math.min(width - 1, Math.max(0, x + dx)), yy = Math.min(height - 1, Math.max(0, y + dy));
      const sample = alpha[yy * width + xx];
      value = mode === 'max' ? Math.max(value, sample) : Math.min(value, sample);
    }
    out[y * width + x] = value;
  }
  return out;
}
export function applySealTexture(rgba, width, height, texture, seed = 20261121) {
  const out = new Uint8ClampedArray(rgba);
  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = out[i * 4 + 3];
  if (texture === 'normal' || texture === 'scan') {
    for (let i = 0; i < alpha.length; i++) out[i * 4 + 3] = Math.round(alpha[i] * .94);
    return out;
  }
  if (texture === 'light') {
    const thin = filterAlpha(alpha, width, height, 1, 'min');
    const grain = noise(width, height, 3, rand(seed + 21));
    for (let i = 0; i < alpha.length; i++) {
      const mixed = thin[i] * .82 + alpha[i] * .2;
      const value = mixed * (.62 + .3 * grain[i]);
      out[i * 4 + 3] = Math.max(0, Math.min(255, value));
      out[i * 4] = Math.min(255, out[i * 4] + 28);
    }
    return out;
  }
  if (texture === 'gap') {
    const next = rand(seed + 2);
    const large = noise(width, height, 36, next), mid = noise(width, height, 16, next);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const tilt = (x / width) * .7 + (y / height) * .4;
      let contact = Math.max(0, Math.min(1, 1.05 - tilt - (large[i] < .48 ? 1 : 0)));
      if (mid[i] <= .45) contact = 0;
      const base = alpha[i];
      out[i * 4 + 3] = Math.max(0, Math.min(255, base * contact + base * .02 * (contact < .15 ? 1 : 0)));
    }
    return out;
  }
  if (texture === 'heavy') {
    const fat = filterAlpha(alpha, width, height, 2, 'max');
    const near = filterAlpha(alpha, width, height, 5, 'max');
    const blobs = noise(width, height, 26, rand(seed + 22));
    for (let i = 0; i < alpha.length; i++) {
      let extra = fat[i];
      if (blobs[i] > .60 && alpha[i] > 8) extra = Math.min(255, extra * 1.18 + 36);
      let value = .55 * extra + .35 * alpha[i];
      value *= Math.min(1, near[i] / 255 * 1.25);
      out[i * 4 + 3] = Math.max(0, Math.min(255, value));
      out[i * 4] = Math.round(out[i * 4] * .86);
      out[i * 4 + 1] = Math.round(out[i * 4 + 1] * .72);
    }
    return out;
  }
  throw Error('未知的盖印质感');
}
export function applyPageScan(rgba, width, height, seed = 20261125) {
  const next = rand(seed);
  const out = new Uint8ClampedArray(rgba.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    let r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const gray = (r + g + b) / 3;
    r = r * .5 + gray * .5; g = g * .5 + gray * .5; b = b * .5 + gray * .5;
    const grain = (next() - .5) * 28 + Math.sin(y / 3.2) * 4;
    const lift = (r - 128) * 1.2 + 122 + grain;
    out[i] = out[i + 1] = out[i + 2] = Math.max(0, Math.min(255, lift * (b ? 1 : 1)));
    out[i] = Math.max(0, Math.min(255, (r - 128) * 1.15 + 118 + grain));
    out[i + 1] = Math.max(0, Math.min(255, (g - 128) * 1.15 + 118 + grain));
    out[i + 2] = Math.max(0, Math.min(255, (b - 128) * 1.15 + 118 + grain));
    out[i + 3] = 255;
  }
  return out;
}
export function inkStats(rgba) {
  let coverage = 0, sum = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] > 16) { coverage++; sum += rgba[i]; }
  return {coverage, mean: coverage ? sum / coverage : 0};
}
export const SCAN_SCOPE = '扫描质感作用于整页文字和印记，不只印在章上。少墨、缺印和稠墨只改变章面。';
export const DEFAULT_ARC = {topStart:-200, topEnd:20, topTracking:1.06, topInset:28, bottomStart:130, bottomEnd:50, bottomTracking:1.08, bottomInset:34};
export function arcReadsLeftToRight(start, end, rx = 140, ry = 100) {
  const glyphs = arcGlyphAngles('左右', 200, 200, rx, ry, start, end, [16, 16]);
  return glyphs[0].x <= glyphs.at(-1).x;
}
export function knockoutPaper(rgba) {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < out.length; i += 4) {
    const min = Math.min(out[i], out[i + 1], out[i + 2]);
    const max = Math.max(out[i], out[i + 1], out[i + 2]);
    if (out[i + 3] > 200 && min > 242 && max - min < 14) out[i + 3] = 0;
  }
  return out;
}
// One seal is split across every page. Boundaries use rounding so the parts
// meet exactly and the last page keeps the remainder. A second seal is not started.
export function verticalSlice(width, parts, index) {
  if (!Number.isInteger(parts) || parts < 2) throw Error('骑缝章至少需要连续两页。');
  if (!Number.isInteger(index) || index < 0 || index >= parts) throw Error('骑缝页码超出范围。');
  const start = Math.round(width * index / parts);
  const end = Math.round(width * (index + 1) / parts);
  if (end <= start) throw Error(`这一枚章只有 ${width} 像素宽，不能均分成 ${parts} 页。请减少页数，或换一张更宽的章图。`);
  return {start, end, width: end - start};
}
export function sealPlacement(pageW, pageH, stampW, stampH, seal, pageIndex = 0) {
  const scale = seal.scale ?? .2;
  const pages = Math.max(1, seal.pageCount || 1);
  const slice = seal.mode === 'perforation' && pages > 1;
  const part = slice ? verticalSlice(stampW, pages, Math.min(pageIndex, pages - 1)) : {start: 0, width: stampW};
  const sx = part.start;
  const sw = part.width;
  const fullW = pageW * scale;
  const dw = slice ? fullW * (sw / stampW) : fullW;
  const dh = fullW * (stampH / stampW);
  let x = slice ? (seal.edge === 'left' ? 0 : pageW - dw) : (seal.xRatio ?? .72) * pageW;
  let y = (seal.yRatio ?? .55) * pageH - dh / 2;
  x = Math.max(0, Math.min(Math.max(0, pageW - dw), x));
  y = Math.max(0, Math.min(Math.max(0, pageH - dh), y));
  return {slice, sx, sw, dw, dh, x, y, opacity: Math.max(.15, Math.min(1, seal.opacity ?? .92))};
}
