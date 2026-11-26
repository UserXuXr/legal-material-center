import {decodePng} from '../reference-edit/png.js';
import {knockoutPaper} from '../shared/seal.js';

const bitmaps = new Map();
export function sealBitmap(key) { return bitmaps.get(key) || null; }
function bytesFromBase64(text) {
  const clean = String(text || '').replace(/\s/g, '');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export async function prepareSealAsset(seal) {
  if (!seal?.enabled || seal.source !== 'png' || !seal.png) return null;
  if (bitmaps.has(seal.png)) return bitmaps.get(seal.png);
  let decoded;
  try { decoded = await decodePng(bytesFromBase64(seal.png)); }
  catch (error) { throw Error(error?.message || '授权章图不是可读取的 PNG。请另存为 8 位 RGB 或 RGBA 后再上传。'); }
  if (!decoded.width || !decoded.height || decoded.width > 1200 || decoded.height > 1200) throw Error('授权章图边长需在 1 至 1200 像素之间。');
  const asset = {rgba: knockoutPaper(decoded.rgba), width: decoded.width, height: decoded.height};
  bitmaps.set(seal.png, asset);
  return asset;
}
