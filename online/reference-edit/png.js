import {EditError} from './errors.js';
import {verticalSlice} from '../shared/seal.js';

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function codec(data, format, compress) {
  const stream = compress ? new CompressionStream(format) : new DecompressionStream(format);
  return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());
}
export const deflate = data => codec(data, 'deflate', true);
export const inflate = data => codec(data, 'deflate', false);
export const inflateRaw = data => codec(data, 'deflate-raw', false);

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export async function encodePng(rgba, width, height) {
  if (rgba.length !== width * height * 4) throw new EditError('章面像素尺寸不正确', 'image');
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    raw[y * (width * 4 + 1)] = 0;
    raw.set(rgba.subarray(row, row + width * 4), y * (width * 4 + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6;
  const sig = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array())];
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function decodePng(bytes) {
  const src = toUint8(bytes);
  if (src.length < 8 || src[0] !== 137 || src[1] !== 80) throw new EditError('章面需要PNG文件。', 'image');
  let pos = 8, width = 0, height = 0, depth = 0, color = 0, idat = [];
  while (pos + 8 <= src.length) {
    const length = new DataView(src.buffer, src.byteOffset + pos, 4).getUint32(0);
    const type = String.fromCharCode(...src.subarray(pos + 4, pos + 8));
    const data = src.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === 'IHDR') {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = view.getUint32(0); height = view.getUint32(4); depth = data[8]; color = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
  }
  if (depth !== 8 || ![2, 6].includes(color)) throw new EditError('暂只支持8位RGB或RGBA的PNG。请在图像软件中另存为PNG后再上传。', 'image');
  const packed = new Uint8Array(idat.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of idat) { packed.set(part, offset); offset += part.length; }
  const raw = await inflate(packed);
  const channels = color === 6 ? 4 : 3;
  const stride = width * channels;
  const rgba = new Uint8Array(width * height * 4);
  let i = 0;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[i]; i += 1;
    const row = Uint8Array.from(raw.subarray(i, i + stride)); i += stride;
    for (let x = 0; x < row.length; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev[x], ul = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      else if (filter === 2) row[x] = (row[x] + up) & 255;
      else if (filter === 3) row[x] = (row[x] + ((left + up) >> 1)) & 255;
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, ul)) & 255;
      else if (filter !== 0) throw new EditError('PNG过滤方式无法读取，请重新导出PNG。', 'image');
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = (y * width + x) * 4;
      rgba[d] = row[s]; rgba[d + 1] = row[s + 1]; rgba[d + 2] = row[s + 2]; rgba[d + 3] = channels === 4 ? row[s + 3] : 255;
    }
    prev = row;
  }
  return {width, height, rgba};
}

function toUint8(bytes) { return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); }

export function sliceVertical(rgba, width, height, parts) {
  if (parts < 2) throw new EditError('骑缝章至少需要连续两页。单页请使用普通盖章。', 'seal');
  const slices = [];
  for (let part = 0; part < parts; part++) {
    const {start, width: sliceWidth} = verticalSlice(width, parts, part);
    const end = start + sliceWidth;
    const out = new Uint8Array(sliceWidth * height * 4);
    for (let y = 0; y < height; y++) out.set(rgba.subarray((y * width + start) * 4, (y * width + end) * 4), y * sliceWidth * 4);
    slices.push({rgba: out, width: sliceWidth, height, index: part});
  }
  return slices;
}
