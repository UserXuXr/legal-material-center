import {EditError} from './errors.js';

function latin1(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return text;
}
function fromLatin1(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255;
  return out;
}
function skipLiteral(src, i) {
  let depth = 1;
  i += 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    i += 1;
  }
  if (depth !== 0) throw new EditError('PDF文字串损坏，已停止改写。', 'corrupt');
  return i;
}
function skipHex(src, i) {
  const end = src.indexOf('>', i + 1);
  if (end < 0) throw new EditError('PDF十六进制文字串损坏，已停止改写。', 'corrupt');
  return end + 1;
}

export function tokenizeContent(bytes) {
  const src = latin1(bytes);
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '%') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '(') { const start = i; i = skipLiteral(src, i); tokens.push({type: 'string', start, end: i}); continue; }
    if (c === '<' && src[i + 1] !== '<') { const start = i; i = skipHex(src, i); tokens.push({type: 'string', start, end: i}); continue; }
    if (c === '<' && src[i + 1] === '<') { tokens.push({type: 'keyword', value: '<<', start: i, end: i + 2}); i += 2; continue; }
    if (c === '>' && src[i + 1] === '>') { tokens.push({type: 'keyword', value: '>>', start: i, end: i + 2}); i += 2; continue; }
    if (c === '[' || c === ']') { tokens.push({type: 'keyword', value: c, start: i, end: i + 1}); i += 1; continue; }
    if (c === '/') {
      const start = i;
      i += 1;
      while (i < src.length && !/[\s()<>[\]{}/%]/.test(src[i])) i += 1;
      tokens.push({type: 'name', value: src.slice(start, i), start, end: i});
      continue;
    }
    if (/[0-9+.-]/.test(c)) {
      const start = i;
      i += 1;
      while (i < src.length && /[0-9.eE+-]/.test(src[i])) i += 1;
      tokens.push({type: 'number', value: src.slice(start, i), start, end: i});
      continue;
    }
    const start = i;
    while (i < src.length && !/[\s()<>[\]{}/%]/.test(src[i])) i += 1;
    const value = src.slice(start, i);
    if (value === 'BI') throw new EditError('页面含内联图像。为避免损坏其余版式，没有改写文字，也没有把页面栅格化。', 'inline-image');
    tokens.push({type: 'keyword', value, start, end: i});
  }
  return {src, tokens};
}

const SHOW = new Set(['Tj', 'TJ', "'", '"']);

export function visibleTextSites(bytes) {
  const {src, tokens} = tokenizeContent(bytes);
  let tr = 0;
  const stack = [];
  const sites = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type !== 'keyword') continue;
    if (token.value === 'q') stack.push(tr);
    else if (token.value === 'Q') tr = stack.pop() ?? 0;
    else if (token.value === 'Tr' && tokens[i - 1]?.type === 'number') tr = Number(tokens[i - 1].value);
    else if (token.value === 'Tf' && tokens[i - 2]?.type === 'name' && tokens[i - 1]?.type === 'number') sites.push({kind: 'font', name: tokens[i - 2].value, size: Number(tokens[i - 1].value), tr});
    else if (token.value === 'Do' && tokens[i - 1]?.type === 'name') sites.push({kind: 'xobject', name: tokens[i - 1].value, tr});
    else if (SHOW.has(token.value)) sites.push({kind: 'text', op: token.value, index: i, tr, visible: tr !== 3});
  }
  return {src, tokens, sites};
}

export function textSiteEmpty(parsed, site) {
  const spans = stringSpans(parsed.tokens, site);
  if (!spans.length) return true;
  return spans.every(([start, end]) => {
    const raw = parsed.src.slice(start, end);
    return raw === '()' || raw === '<>' || /^\([\s]*\)$/.test(raw);
  });
}

function stringSpans(tokens, site) {
  if (site.op === 'Tj' || site.op === "'") {
    const prev = tokens[site.index - 1];
    return prev?.type === 'string' ? [[prev.start, prev.end]] : [];
  }
  if (site.op === '"') {
    const prev = tokens[site.index - 1];
    return prev?.type === 'string' ? [[prev.start, prev.end]] : [];
  }
  const spans = [];
  let depth = 0;
  for (let j = site.index - 1; j >= 0; j--) {
    const token = tokens[j];
    if (token.value === ']') depth += 1;
    else if (token.value === '[') {
      depth -= 1;
      if (depth === 0) break;
    } else if (depth === 1 && token.type === 'string') spans.push([token.start, token.end]);
  }
  return spans;
}

export function blankSites(bytes, indexes) {
  const parsed = visibleTextSites(bytes);
  const chosen = new Set(indexes);
  const spans = [];
  let nth = 0;
  for (const site of parsed.sites) {
    if (site.kind !== 'text' || !site.visible) continue;
    if (chosen.has(nth)) for (const span of stringSpans(parsed.tokens, site)) spans.push(span);
    nth += 1;
  }
  spans.sort((a, b) => a[0] - b[0]);
  let out = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    out += parsed.src.slice(cursor, start) + '()';
    cursor = end;
  }
  out += parsed.src.slice(cursor);
  return fromLatin1(out);
}
