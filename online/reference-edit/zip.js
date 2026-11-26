import {EditError, LIMITS, toBytes} from './errors.js';
import {crc32, inflateRaw} from './png.js';

function u16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
function u32(bytes, offset) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }
function writeU16(view, offset, value) { view.setUint16(offset, value, true); }
function writeU32(view, offset, value) { view.setUint32(offset, value, true); }

function findEocd(bytes) {
  const start = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= start; i--) if (u32(bytes, i) === 0x06054b50) return i;
  throw new EditError('压缩包损坏或不是ZIP，没有修改任何材料。', 'corrupt-zip');
}

export function readZip(bytes) {
  const src = toBytes(bytes);
  if (src.length > LIMITS.zipBytes) throw new EditError('压缩包超过40MB，请拆分后再修订。', 'too-large');
  const eocd = findEocd(src);
  const count = u16(src, eocd + 10);
  const size = u32(src, eocd + 12);
  const offset = u32(src, eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new EditError('压缩包使用ZIP64或过大，请拆分后再修订。', 'zip64');
  const entries = [];
  let pos = offset;
  for (let n = 0; n < count; n++) {
    if (u32(src, pos) !== 0x02014b50) throw new EditError('压缩包目录损坏，没有修改任何材料。', 'corrupt-zip');
    const flags = u16(src, pos + 8);
    const method = u16(src, pos + 10);
    const crc = u32(src, pos + 16);
    const compressed = u32(src, pos + 20);
    const uncompressed = u32(src, pos + 24);
    const nameLen = u16(src, pos + 28);
    const extraLen = u16(src, pos + 30);
    const commentLen = u16(src, pos + 32);
    const local = u32(src, pos + 42);
    const nameBytes = src.subarray(pos + 46, pos + 46 + nameLen);
    if (flags & 1) throw new EditError('压缩包已加密，不能修订。', 'encrypted');
    if (compressed === 0xffffffff || uncompressed === 0xffffffff) throw new EditError('压缩包使用ZIP64，请拆分后再修订。', 'zip64');
    const path = new TextDecoder(flags & 0x800 ? 'utf-8' : 'utf-8').decode(nameBytes);
    entries.push({path, nameBytes, flags, method, crc, compressed, uncompressed, local, directory: path.endsWith('/')});
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return {src, entries};
}

export function storedPayload(zip, path) {
  const entry = zip.entries.find(item => item.path === path);
  if (!entry) throw new EditError(`压缩包中没有${path}`, 'corrupt-zip');
  const nameLen = u16(zip.src, entry.local + 26);
  const extraLen = u16(zip.src, entry.local + 28);
  return zip.src.subarray(entry.local + 30 + nameLen + extraLen, entry.local + 30 + nameLen + extraLen + entry.compressed);
}

export async function entryBytes(zip, entry) {
  const local = entry.local;
  if (u32(zip.src, local) !== 0x04034b50) throw new EditError(`压缩包中的${entry.path}已损坏。`, 'corrupt-zip');
  const nameLen = u16(zip.src, local + 26);
  const extraLen = u16(zip.src, local + 28);
  const data = zip.src.subarray(local + 30 + nameLen + extraLen, local + 30 + nameLen + extraLen + entry.compressed);
  if (entry.method === 0) return data;
  if (entry.method === 8) return inflateRaw(data);
  throw new EditError(`${entry.path}使用了不支持的压缩方式，已跳过且未改写。`, 'zip');
}

function localRecordEnd(src, entry) {
  const nameLen = u16(src, entry.local + 26);
  const extraLen = u16(src, entry.local + 28);
  let end = entry.local + 30 + nameLen + extraLen + entry.compressed;
  if (entry.flags & 8) end += u32(src, end) === 0x08074b50 ? 16 : 12;
  return end;
}

function storedEntry(nameBytes, data) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  writeU32(view, 0, 0x04034b50);
  writeU16(view, 4, 20);
  writeU16(view, 6, 0x800);
  writeU16(view, 8, 0);
  writeU32(view, 14, crc32(data));
  writeU32(view, 18, data.length);
  writeU32(view, 22, data.length);
  writeU16(view, 26, nameBytes.length);
  return {header, nameBytes, data, crc: u32(header, 14)};
}

function centralEntry(entry, offset, nameBytes, data) {
  const out = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(out.buffer);
  writeU32(view, 0, 0x02014b50);
  writeU16(view, 4, 20);
  writeU16(view, 6, 20);
  writeU16(view, 8, data ? 0x800 : entry.flags);
  writeU16(view, 10, data ? 0 : entry.method);
  writeU32(view, 16, data ? crc32(data) : entry.crc);
  writeU32(view, 20, data ? data.length : entry.compressed);
  writeU32(view, 24, data ? data.length : entry.uncompressed);
  writeU16(view, 28, nameBytes.length);
  writeU32(view, 42, offset);
  out.set(nameBytes, 46);
  return out;
}

export function replaceZipEntries(zipBytes, replacements) {
  const zip = readZip(zipBytes);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const entry of zip.entries) {
    const replacement = replacements[entry.path];
    if (replacement === undefined) {
      const raw = zip.src.subarray(entry.local, localRecordEnd(zip.src, entry));
      parts.push(raw);
      central.push(centralEntry(entry, offset, entry.nameBytes, null));
      offset += raw.length;
    } else {
      const stored = storedEntry(entry.nameBytes, replacement);
      parts.push(stored.header, stored.nameBytes, stored.data);
      central.push(centralEntry(entry, offset, entry.nameBytes, replacement));
      offset += stored.header.length + stored.nameBytes.length + stored.data.length;
    }
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  writeU32(view, 0, 0x06054b50);
  writeU16(view, 8, zip.entries.length);
  writeU16(view, 10, zip.entries.length);
  writeU32(view, 12, centralSize);
  writeU32(view, 16, offset);
  const out = new Uint8Array(offset + centralSize + 22);
  let cursor = 0;
  for (const part of parts) { out.set(part, cursor); cursor += part.length; }
  for (const part of central) { out.set(part, cursor); cursor += part.length; }
  out.set(eocd, cursor);
  return out;
}

export async function editZip(zipBytes, plans, fontBytes, edit) {
  const zip = readZip(zipBytes);
  const paths = Object.keys(plans);
  if (!paths.length) throw new EditError('请选择要修订的PDF。未选择的材料不会改动。', 'plan');
  const replacements = {};
  const reports = {};
  for (const path of paths) {
    const entry = zip.entries.find(item => item.path === path);
    if (!entry || entry.directory) throw new EditError(`压缩包中没有所选材料：${path}`, 'plan');
    if (!path.toLowerCase().endsWith('.pdf')) throw new EditError(`只能修订PDF。${path}保持原样，请勿把它当作已处理。`, 'plan');
    const bytes = await entryBytes(zip, entry);
    const result = await edit(bytes, plans[path], fontBytes);
    replacements[path] = result.bytes;
    reports[path] = result;
  }
  return {bytes: replaceZipEntries(zip.src, replacements), reports, entries: zip.entries.map(entry => entry.path)};
}
