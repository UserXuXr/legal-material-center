import React, {useEffect, useRef, useState} from 'react';
import {analyzePdf, editPdf, emptyPlan} from './edit.js';
import {buildMixedFontPdf} from './fixture.js';
import {FONT_CHOICES, SCOPES, fontUrls, loadEditorFonts, SIGNATURE_FONTS, resolveSignatureFont} from './fonts.js';
import {editZip, entryBytes, readZip} from './zip.js';

const base = import.meta.env.BASE_URL;
const save = (bytes, name) => {
  const blob = new Blob([bytes], {type: name.endsWith('.zip') ? 'application/zip' : 'application/pdf'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

async function drawPage(pdfjs, bytes, pageNumber, canvas) {
  const task = pdfjs.getDocument({data: bytes.slice(), isEvalSupported: false, disableFontFace: false, verbosity: 0});
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({scale: 1.25});
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff'}).promise;
    page.cleanup();
    return pdf.numPages;
  } finally { await task.destroy().catch(() => {}); }
}

export default function App({pdfjs}) {
  const [fonts, setFonts] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState('before');
  const [preview, setPreview] = useState(null);
  const canvas = useRef(null);
  const upload = useRef(null);
  const sealFile = useRef(null);
  const signFile = useRef(null);
  const guard = useRef(false);

  useEffect(() => { loadEditorFonts().then(setFonts).catch(error => setNotice(error.message)); }, []);
  const item = doc?.items.find(entry => entry.path === doc.active) || doc?.items[0];
  const shown = view === 'after' && preview?.path === item?.path ? preview.bytes : item?.bytes;

  useEffect(() => {
    if (!shown || !canvas.current || !pdfjs) return;
    let live = true;
    drawPage(pdfjs, shown, page, canvas.current).catch(error => live && setNotice(error.message));
    return () => { live = false; };
  }, [shown, page, pdfjs]);

  async function perform(fn) {
    if (guard.current) return;
    guard.current = true; setBusy(true); setNotice('');
    try { await fn(); } catch (error) { setNotice(error.message); } finally { guard.current = false; setBusy(false); }
  }
  function updateItem(path, changes) {
    setDoc(current => ({...current, items: current.items.map(entry => entry.path === path ? {...entry, ...changes} : entry)}));
    setPreview(null); setView('before');
  }
  function updatePlan(changes) {
    updateItem(item.path, {plan: {...item.plan, ...changes}});
  }
  async function loadPdf(name, bytes) {
    const analysis = await analyzePdf(bytes);
    setDoc({kind: 'pdf', name, zip: null, items: [{path: name, bytes: Uint8Array.from(bytes), analysis, plan: emptyPlan()}], active: name});
    setPage(1); setView('before'); setPreview(null);
    setNotice(analysis.fontEditable ? `已识别 ${analysis.fonts.map(font => font.label).join('、') || '矢量文字'}。原文件不会被覆盖。` : analysis.fontBlockReason);
  }
  async function loadZip(name, bytes) {
    const zip = readZip(bytes);
    const items = [];
    for (const entry of zip.entries) {
      if (entry.directory || !entry.path.toLowerCase().endsWith('.pdf')) continue;
      const data = await entryBytes(zip, entry);
      try {
        items.push({path: entry.path, bytes: Uint8Array.from(data), analysis: await analyzePdf(data), plan: emptyPlan()});
      } catch (error) {
        items.push({path: entry.path, bytes: Uint8Array.from(data), analysis: {fontEditable: false, fontBlockReason: error.message, fonts: [], pageCount: 0, pages: []}, plan: emptyPlan(), error: error.message});
      }
    }
    if (!items.length) throw new Error('压缩包里没有PDF。其他文件保持原样，不会被修改。');
    setDoc({kind: 'zip', name, zip: Uint8Array.from(bytes), items, active: items[0].path});
    setPage(1); setView('before'); setPreview(null);
    setNotice(`已读取 ${zip.entries.length} 个条目，其中 ${items.length} 份 PDF 可修订。未选中的材料会按原字节保留。`);
  }
  async function onUpload(file) {
    if (!file) return;
    if (file.size > 40 * 1024 * 1024) throw new Error('文件超过40MB，请拆分后再导入。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.name.toLowerCase().endsWith('.zip') || (bytes[0] === 0x50 && bytes[1] === 0x4b)) await loadZip(file.name, bytes);
    else await loadPdf(file.name, bytes);
  }
  async function useExample() {
    await loadPdf('合成买卖合同.pdf', await buildMixedFontPdf(fonts));
  }
  async function previewEdit() {
    const result = await editPdf(item.bytes, item.plan, fonts);
    setPreview({path: item.path, bytes: result.bytes, report: result.report});
    setView('after');
    const note = result.report.fontsApplied ? '预览已换用所选字体，文字仍可检索。' : '预览未改字体。';
    setNotice([note, ...(result.report.notes || []), result.analysis.fontBlockReason && !item.plan.fonts ? result.analysis.fontBlockReason : ''].filter(Boolean).join(''));
  }
  async function exportFile() {
    if (doc.kind === 'zip') {
      const plans = {};
      for (const entry of doc.items) if (entry.plan.fonts || entry.plan.marks.length) plans[entry.path] = entry.plan;
      if (!Object.keys(plans).length) throw new Error('还没有要修订的材料。未签署的草稿不会自动盖章或签名。');
      const revised = await editZip(doc.zip, plans, fonts, editPdf);
      save(revised.bytes, doc.name.replace(/\.zip$/i, '') + '_修订.zip');
      setNotice('已下载新的压缩包。未选择的材料字节未改，原压缩包仍在原处。');
      return;
    }
    const result = preview?.path === item.path ? {bytes: preview.bytes, report: preview.report} : await editPdf(item.bytes, item.plan, fonts);
    const stem = item.path.replace(/\.pdf$/i, '');
    save(result.bytes, (result.changed ? stem + '_修订' : stem + '_副本') + '.pdf');
    setNotice(result.changed ? '已下载修订后的新PDF，原文件没有被覆盖。' : '没有需要写入的修订，已另存一份副本。');
  }
  async function renderSampleSeal(label) {
    const face = new FontFace('RefSong', `url(${fontUrls.song})`);
    await face.load(); document.fonts.add(face);
    const board = document.createElement('canvas'); board.width = 360; board.height = 360;
    const ctx = board.getContext('2d');
    ctx.clearRect(0, 0, 360, 360); ctx.strokeStyle = '#b8141a'; ctx.fillStyle = '#b8141a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(180, 180, 156, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(180, 180, 132, 0, Math.PI * 2); ctx.stroke();
    ctx.font = '32px RefSong'; ctx.fillText('合成样本章', 180, 188);
    ctx.font = '20px RefSong'; ctx.fillText(label, 180, 132);
    const blob = await new Promise(resolve => board.toBlob(resolve, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  function addSeal(extra) {
    const id = crypto.randomUUID();
    updatePlan({marks: [...item.plan.marks, {id, kind: 'seal', mode: 'stamp', sample: true, label: '甲示例科技有限公司', pageStart: page, pageEnd: page, widthPt: 92, heightPt: 92, xRatio: .82, yRatio: .78, opacity: .92, edge: 'right', ...extra}]});
  }
  function addSignature(extra) {
    const id = crypto.randomUUID();
    updatePlan({marks: [...item.plan.marks, {id, kind: 'signature', source: 'generated', font: 'xiaolai', name: '赵六', page, widthPt: 120, xRatio: .7, yRatio: .86, opacity: 1, ...extra}]});
  }
  function placeAt(event) {
    if (!item || busy) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const yRatio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const marks = item.plan.marks.map(mark => ({...mark}));
    const target = [...marks].reverse().find(mark => mark.kind === 'signature' || (mark.kind === 'seal' && mark.mode !== 'perforation'));
    if (!target) { setNotice('先添加普通章或签名，再在预览上点击放置。骑缝章使用页边，不靠点击居中。'); return; }
    if (target.kind === 'signature') target.page = page;
    target.xRatio = xRatio; target.yRatio = yRatio;
    updatePlan({marks});
    setNotice(`已放到第${page}页 ${(xRatio * 100).toFixed(0)}%, ${(yRatio * 100).toFixed(0)}%。导出前可以删除。`);
  }

  return <><header className="ref-header"><a className="back" href={base}>← 素材中心</a><div><h1>材料修订</h1><p>统一矢量文书字体，放置样本章、骑缝章和模拟签名。</p></div><div className="header-actions"><a href={base + 'batch/'}>批量制作 ↗</a><button disabled={!fonts || busy} onClick={() => upload.current.click()}>导入PDF或ZIP</button><button disabled={!fonts || busy} onClick={() => perform(useExample)}>载入合成示例</button></div></header>
  <input ref={upload} hidden type="file" accept=".pdf,.zip,application/pdf,application/zip" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; perform(() => onUpload(file)); }}/>
  {notice && <div className="ref-notice" role="status">{notice}</div>}
  {!fonts ? <p className="loading">正在读取平台字体…</p> : !item ? <main className="empty"><span>文</span><h2>导入一份合成材料</h2><p>支持工作台导出的业务ZIP，或单份矢量PDF。<br/>扫描件不能直接改字体。未添加的章和签名不会自动写上。</p><button className="primary" disabled={busy} onClick={() => upload.current.click()}>选择PDF或ZIP</button></main> : <div className="ref-layout"><aside>
    <span className="eyebrow">01 / 材料</span>
    <nav>{doc.items.map(entry => <button key={entry.path} className={entry.path === item.path ? 'selected' : ''} onClick={() => { setDoc(current => ({...current, active: entry.path})); setPage(1); setView('before'); setPreview(null); }}><small>{entry.analysis.fontEditable ? '矢量PDF' : '图像PDF'}</small><strong>{entry.path.split('/').at(-1)}</strong></button>)}</nav>
    <p className="source-note">原件只在浏览器中读取。导出使用新文件名，不覆盖所选文件，也不改动ZIP里未选择的材料。</p>
  </aside><section className="ref-preview"><div className="preview-top"><div><span className="eyebrow">02 / 预览</span><h2>{item.path.split('/').at(-1)}</h2></div><div className="segmented"><button aria-pressed={view === 'before'} onClick={() => setView('before')}>原稿</button><button aria-pressed={view === 'after'} onClick={() => setView('after')} disabled={!preview}>修订预览</button></div></div>
    <div className="page-toolbar"><button disabled={page <= 1} onClick={() => setPage(value => value - 1)}>上一页</button><span>第 {page} / {item.analysis.pageCount || '—'} 页</span><button disabled={page >= (item.analysis.pageCount || 1)} onClick={() => setPage(value => value + 1)}>下一页</button></div>
    <div className="paper-stage" onClick={placeAt}><canvas ref={canvas} aria-label="PDF页面预览"/></div>
    <p className="source-note">{item.analysis.fontBlockReason || `识别到 ${item.analysis.fonts.map(font => `${font.label}（${font.chars}字）`).join('、') || '矢量文字'}。点击预览可改普通章和签名的位置。`}</p>
  </section><aside className="controls"><span className="eyebrow">03 / 修订</span>
    <fieldset disabled={busy}><label className="check"><input type="checkbox" checked={Boolean(item.plan.fonts)} onChange={event => updatePlan({fonts: event.target.checked ? {scope: 'body-and-title', body: 'song', title: 'hei', pages: null} : null})} disabled={!item.analysis.fontEditable}/>统一可见文字的字体</label>
      {item.plan.fonts && <><label>作用范围<select value={item.plan.fonts.scope} onChange={event => updatePlan({fonts: {...item.plan.fonts, scope: event.target.value}})}>{SCOPES.map(scope => <option key={scope.id} value={scope.id}>{scope.label}</option>)}</select></label>
        <label>正文字体<select value={item.plan.fonts.body} onChange={event => updatePlan({fonts: {...item.plan.fonts, body: event.target.value}})}>{['song', 'hei', 'thin'].map(id => <option key={id} value={id}>{FONT_CHOICES[id].label}</option>)}</select></label>
        <label>标题字体<select value={item.plan.fonts.title} onChange={event => updatePlan({fonts: {...item.plan.fonts, title: event.target.value}})}>{['hei', 'song', 'thin'].map(id => <option key={id} value={id}>{FONT_CHOICES[id].label}</option>)}</select></label>
        <p className="source-note">只改可见矢量文字，并嵌入 OFL 字体。缺字会停下来列出，不会整页变成图片。</p></>}
      {!item.analysis.fontEditable && <p className="warn">{item.analysis.fontBlockReason}</p>}
      <section className="ink-panel"><h3>样本章与授权章</h3>
        <div className="ink-actions"><button onClick={() => addSeal()}>添加样本章</button><button onClick={() => perform(async () => addSeal({mode: 'perforation', sample: false, png: await renderSampleSeal('甲示例科技有限公司'), pageStart: 1, pageEnd: item.analysis.pageCount || 1, widthPt: 90, heightPt: 90, yRatio: .55}))}>添加骑缝章</button><button onClick={() => sealFile.current.click()}>上传授权章</button></div>
        <input ref={sealFile} hidden type="file" accept="image/png" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; perform(async () => { if (!file) return; if (file.type !== 'image/png') throw new Error('请上传PNG章面。'); addSeal({sample: false, png: new Uint8Array(await file.arrayBuffer()), label: ''}); }); }}/>
        <p className="source-note">样本章固定写有“合成样本章”，不能做成法院、公证处或行政机关的章。骑缝章按页切开贴在页边，不是每页重复盖一个整章。</p>
      </section>
      <section className="ink-panel"><h3>个人模拟签名</h3>
        <div className="ink-actions"><button onClick={() => addSignature()}>用姓名生成</button><button onClick={() => signFile.current.click()}>上传授权图片</button><button disabled={!item.plan.marks.length} onClick={() => updatePlan({marks: item.plan.marks.slice(0, -1)})}>撤销上一项</button></div>
        <input ref={signFile} hidden type="file" accept="image/png" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; perform(async () => { if (!file) return; addSignature({source: 'upload', png: new Uint8Array(await file.arrayBuffer()), name: ''}); }); }}/>
        <p className="source-note">姓名签名从五款普通硬笔里选，同一姓名同一字体字形稳定。这不是连续签名，也不临摹笔迹。上传图片只原样放置。默认不签名。缺字会停下列出。</p>
      </section>
      <ul className="mark-list">{item.plan.marks.map(mark => <li key={mark.id}><span>{mark.kind === 'signature' ? `签名 ${mark.name || '图片'}` : mark.mode === 'perforation' ? '骑缝章' : mark.sample ? `样本章 ${mark.label || ''}` : '授权章'}</span><button onClick={() => updatePlan({marks: item.plan.marks.filter(item => item.id !== mark.id)})}>删除</button></li>)}{!item.plan.marks.length && <li className="muted">还没有章或签名</li>}</ul>
      {item.plan.marks.filter(mark => mark.kind === 'seal' && mark.sample).map(mark => <label key={mark.id}>样本章主体<input value={mark.label || ''} maxLength={40} onChange={event => updatePlan({marks: item.plan.marks.map(item => item.id === mark.id ? {...item, label: event.target.value} : item)})}/></label>)}
      {item.plan.marks.filter(mark => mark.kind === 'signature' && mark.source !== 'upload').map(mark => <div key={mark.id}><label>硬笔字体<select aria-label="硬笔字体" value={resolveSignatureFont(mark.font)} onChange={event => updatePlan({marks: item.plan.marks.map(item => item.id === mark.id ? {...item, font: event.target.value} : item)})}>{SIGNATURE_FONTS.map(font => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label><label>签名姓名<input value={mark.name || ''} maxLength={12} onChange={event => updatePlan({marks: item.plan.marks.map(item => item.id === mark.id ? {...item, name: event.target.value} : item)})}/></label><p className="source-note">{SIGNATURE_FONTS.find(font => font.id === resolveSignatureFont(mark.font))?.note} 缺字会停止，不会生成缺字签名。OFL 1.1，子集未覆盖的字不算可用。</p></div>)}
      <button className="primary" onClick={() => perform(previewEdit)}>预览修订</button>
      <button onClick={() => perform(exportFile)}>{doc.kind === 'zip' ? '导出新ZIP' : '导出新PDF'}</button>
    </fieldset>
  </aside></div>}</>;
}
