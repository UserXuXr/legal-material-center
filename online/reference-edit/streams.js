import {PDFArray, PDFName, PDFRawStream, decodePDFRawStream} from 'pdf-lib';
import {EditError} from './errors.js';
import {blankSites, textSiteEmpty, visibleTextSites} from './content.js';

export function streamBytes(stream) {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode();
  if (typeof stream.getContents === 'function') {
    const contents = stream.getContents();
    if (contents instanceof Uint8Array) return contents;
  }
  throw new EditError('页面内容流无法解码。没有改写文件。', 'unsupported');
}

function isForm(object) {
  return object?.dict?.get?.(PDFName.of('Subtype'))?.toString() === '/Form';
}
function lookup(dict, nameToken) {
  if (!dict?.entries) return null;
  for (const [key, value] of dict.entries()) if (key.toString() === nameToken) return value;
  return null;
}
function contentRefs(page) {
  const contents = page.node.Contents();
  if (!contents) return [];
  if (contents instanceof PDFArray) return Array.from({length: contents.size()}, (_, i) => contents.get(i));
  const ref = page.node.get(PDFName.of('Contents'));
  return ref ? [ref] : [];
}

// Visit fonts and visible text in the same order a viewer paints the page.
export function paintEvents(doc, page) {
  const events = [];
  const seen = new Set();
  function visit(resources, ref) {
    const stream = doc.context.lookup(ref);
    const bytes = streamBytes(stream);
    const parsed = visibleTextSites(bytes);
    let local = 0;
    for (const site of parsed.sites) {
      if (site.kind === 'font') {
        const fontRef = resources && lookup(resources.lookup?.(PDFName.of('Font')), site.name);
        const font = fontRef ? doc.context.lookup(fontRef) : null;
        const base = font?.get?.(PDFName.of('BaseFont'))?.toString?.() || site.name;
        events.push({kind: 'font', baseFont: base.replace(/^\//, ''), size: site.size});
      } else if (site.kind === 'text' && site.visible) {
        events.push({kind: 'text', ref, localIndex: local, empty: textSiteEmpty(parsed, site)});
        local += 1;
      } else if (site.kind === 'xobject') {
        const xobjRef = resources && lookup(resources.lookup?.(PDFName.of('XObject')), site.name);
        const id = String(xobjRef);
        if (!xobjRef || seen.has(id)) continue;
        const xobj = doc.context.lookup(xobjRef);
        if (!isForm(xobj)) continue;
        seen.add(id);
        visit(xobj.dict.lookup(PDFName.of('Resources')) || resources, xobjRef);
      }
    }
  }
  for (const ref of contentRefs(page)) visit(page.node.Resources(), ref);
  return events;
}

export function blankVisible(doc, page, selectedGlobal, start) {
  const events = paintEvents(doc, page).filter(event => event.kind === 'text');
  const chosen = [];
  events.forEach((event, index) => { if (selectedGlobal.has(start + index)) chosen.push(event); });
  const byRef = new Map();
  for (const event of chosen) {
    const list = byRef.get(event.ref) || [];
    list.push(event.localIndex);
    byRef.set(event.ref, list);
  }
  for (const [ref, indexes] of byRef) {
    const current = doc.context.lookup(ref);
    const next = blankSites(streamBytes(current), indexes);
    const dict = current.dict.clone(doc.context);
    dict.delete(PDFName.of('Filter'));
    dict.delete(PDFName.of('DecodeParms'));
    doc.context.assign(ref, PDFRawStream.of(dict, next));
  }
  return events.length;
}
