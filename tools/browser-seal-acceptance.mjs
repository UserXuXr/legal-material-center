import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import {encodePng} from '../online/reference-edit/png.js';

const root = '/opt/cursor/artifacts/seal-acceptance';
const downloadDir = '/tmp/seal-acceptance-downloads';
const chrome = '/usr/local/bin/google-chrome';
const port = 9334;
fs.rmSync(root, {recursive: true, force: true});
fs.rmSync(downloadDir, {recursive: true, force: true});
fs.mkdirSync(path.join(root, 'pdf'), {recursive: true});
fs.mkdirSync(path.join(root, 'thumb'), {recursive: true});
fs.mkdirSync(path.join(root, 'ui'), {recursive: true});
fs.mkdirSync(downloadDir, {recursive: true});

const sourcePdf = '/tmp/seal-source.pdf';
const sourcePng = '/tmp/seal-authorized.png';
{
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const [index, label] of ['ONE', 'TWO'].entries()) {
    const page = doc.addPage([420, 560]);
    page.drawRectangle({x: 0, y: 0, width: 420, height: 560, color: rgb(.86, .9, .93)});
    page.drawText(`Synthetic page ${label}`, {x: 36, y: 500, size: 16, font, color: rgb(.1, .15, .2)});
    page.drawText('Amount 1280.50  Date 2026-04-01', {x: 36, y: 470, size: 12, font});
    page.drawText(`Page ${index + 1} of 2`, {x: 36, y: 40, size: 11, font});
  }
  fs.writeFileSync(sourcePdf, await doc.save());
  const width = 96, height = 96, rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const dx = x - 48, dy = y - 48, dist = Math.hypot(dx, dy);
    const ink = dist > 30 && dist < 42;
    rgba[i] = ink ? 196 : 255; rgba[i + 1] = ink ? 32 : 255; rgba[i + 2] = ink ? 30 : 255; rgba[i + 3] = 255;
  }
  fs.writeFileSync(sourcePng, await encodePng(rgba, width, height));
}

const errors = [];
const chromeProc = execFileSync; // keep import used by later pdftoppm
void chromeProc;
const child = await import('node:child_process');
const browser = child.spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
  `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/chrome-seal-acceptance',
  '--window-size=1440,1200', 'about:blank',
], {stdio: 'ignore'});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
try {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); break; }
    catch { await sleep(250); }
  }
  if (!version) throw Error('Chrome 调试端口没有起来');
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) pending.get(message.id)(message);
    else listeners.forEach(listener => listener(message));
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, message => {
      pending.delete(id);
      if (message.error) reject(Error(method + ' ' + JSON.stringify(message.error)));
      else resolve(message.result);
    });
    ws.send(JSON.stringify({id, method, params, sessionId}));
  });
  const target = await send('Target.createTarget', {url: 'about:blank'});
  const attached = await send('Target.attachToTarget', {targetId: target.targetId, flatten: true});
  const session = attached.sessionId;
  const on = (method, handler) => listeners.push(message => { if (message.method === method && message.sessionId === session) handler(message.params); });
  on('Runtime.exceptionThrown', params => errors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'exception'));
  on('Runtime.consoleAPICalled', params => { if (params.type === 'error') errors.push(params.args.map(arg => arg.value || arg.description).join(' ')); });
  await send('Page.enable', {}, session);
  await send('Runtime.enable', {}, session);
  await send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: downloadDir}, session);
  async function waitDownload(timeout = 120000) {
    const start = Date.now();
    const before = new Map(fs.readdirSync(downloadDir).map(name => [name, fs.statSync(path.join(downloadDir, name)).mtimeMs]));
    while (Date.now() - start < timeout) {
      for (const name of fs.readdirSync(downloadDir)) {
        if (name.endsWith('.crdownload')) continue;
        const file = path.join(downloadDir, name);
        const stat = fs.statSync(file);
        if ((before.get(name) || 0) >= stat.mtimeMs) continue;
        await sleep(350);
        const again = fs.statSync(file);
        if (again.size === stat.size && again.size > 500) return file;
      }
      await sleep(200);
    }
    throw Error('没有等到下载文件');
  }
  async function waitExportReady() {
    await evaluate(`new Promise((resolve, reject) => { const t = setInterval(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('制作并下载')); const note = document.querySelector('.scan-notice')?.textContent || ''; if (note && /停止|无效|没有这些字|损坏/.test(note)) { clearInterval(t); reject(Error(note)); } if (button && !button.disabled && !button.textContent.includes('请稍候')) { clearInterval(t); resolve(); } }, 200); setTimeout(() => reject(Error('导出按钮没有恢复')), 120000); })`);
  }
  async function go(url) {
    await send('Page.navigate', {url}, session);
    await sleep(400);
    for (let i = 0; i < 40; i++) {
      const state = await send('Runtime.evaluate', {expression: 'document.readyState', returnByValue: true}, session);
      if (state.result.value === 'complete') return;
      await sleep(200);
    }
  }
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}, session);
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result?.value;
  }
  async function shot(name) {
    const image = await send('Page.captureScreenshot', {format: 'png'}, session);
    fs.writeFileSync(path.join(root, 'ui', name + '.png'), Buffer.from(image.data, 'base64'));
  }
  const kinds = ['circle_emblem', 'oval_contract', 'circle_name_only', 'circle_center_text', 'name_chop'];
  const textures = ['normal', 'light', 'gap', 'heavy', 'scan'];
  const results = [];
  await go('http://127.0.0.1:3016/scans/');
  await evaluate(`new Promise(resolve => { const t = setInterval(() => { if (document.querySelector('input[type=file]')) { clearInterval(t); resolve(); } }, 100); })`);
  const doc = await send('DOM.getDocument', {}, session);
  const input = await send('DOM.querySelector', {nodeId: doc.root.nodeId, selector: 'input[type=file][accept*="pdf"]'}, session);
  await send('DOM.setFileInputFiles', {nodeId: input.nodeId, files: [sourcePdf]}, session);
  await evaluate(`new Promise((resolve, reject) => { const t = setInterval(() => { const note = document.querySelector('.scan-notice')?.textContent || ''; if (note.includes('已导入')) { clearInterval(t); resolve(); } if (note && !note.includes('已导入') && document.body.textContent.includes('请导入')) { clearInterval(t); reject(Error(note)); } }, 150); setTimeout(() => reject(Error('导入超时')), 20000); })`);
  await evaluate(`(() => {
    const set = (el, value) => { const proto = el instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement; Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', {bubbles:true})); };
    const label = [...document.querySelectorAll('label')].find(item => item.firstChild?.textContent?.includes('分辨率'));
    set(label.querySelector('select'), '100');
    set(document.querySelector('input[aria-label="PDF／JPG画质"]'), '60');
  })()`);
  await evaluate(`document.querySelector('.output-panel')?.innerText || ''`).then(text => { if (!text.includes('没有可检索文字层') && !text.includes('不能把它说成仍可检索')) throw Error('扫描页没有说明图像输出不可检索：' + text); });
  await evaluate(`(() => { const box = [...document.querySelectorAll('label')].find(item => item.textContent.includes('在纸张效果之后加盖')).querySelector('input'); if (!box.checked) box.click(); })()`);
  await evaluate(`new Promise(resolve => { const t = setInterval(() => { if (document.querySelector('select[aria-label="章型"]') && document.querySelector('.paper img')) { clearInterval(t); resolve(); } }, 150); })`);
  await shot('scans-seal-default');
  async function choose(label, value) {
    await evaluate(`(() => { const el = document.querySelector('select[aria-label="${label}"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  }
  for (const kind of kinds) for (const texture of textures) {
    await choose('章型', kind);
    await choose('质感', texture);
    await choose('盖印方式', 'stamp');
    await sleep(250);
    await waitExportReady();
    await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('制作并下载')); button.click(); })()`);
    const file = await waitDownload();
    const name = `${kind}__${texture}.pdf`;
    fs.copyFileSync(file, path.join(root, 'pdf', name));
    const info = child.execFileSync('pdfinfo', [path.join(root, 'pdf', name)], {encoding: 'utf8'});
    if (!/Pages:\s+2/.test(info)) throw Error(name + ' 页数不是 2');
    results.push({kind, texture, file: 'pdf/' + name, bytes: fs.statSync(path.join(root, 'pdf', name)).size, pages: 2});
  }
  await choose('盖印方式', 'perforation');
  await choose('章型', 'circle_emblem');
  await choose('质感', 'gap');
  await sleep(400);
  await waitExportReady();
  await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('制作并下载')).click())()`);
  const perf = await waitDownload();
  fs.copyFileSync(perf, path.join(root, 'pdf', 'perforation-gap-circle_emblem.pdf'));
  await choose('盖印方式', 'stamp');
  await choose('章型', 'oval_contract');
  await evaluate(`(() => { const el = document.querySelector('input[aria-label="下弧半径"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '90'); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(600);
  await shot('scans-arc-inset');
  await waitExportReady();
  await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('制作并下载')).click())()`);
  fs.copyFileSync(await waitDownload(), path.join(root, 'pdf', 'arc-oval-bottom-inset-90.pdf'));
  await evaluate(`(() => { const el = document.querySelector('select[aria-label="下弧方向"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, 'rtl'); el.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await sleep(600);
  const direction = await evaluate(`document.querySelector('select[aria-label="下弧方向"]').value`);
  if (direction !== 'rtl') throw Error('下弧方向没有切到右到左');
  await shot('scans-arc-rtl');
  await evaluate(`(() => { const box = [...document.querySelectorAll('label')].find(item => item.textContent.includes('我确认此章图已获授权')).querySelector('input'); if (!box.checked) box.click(); })()`);
  const pngInput = await send('DOM.querySelector', {nodeId: (await send('DOM.getDocument', {}, session)).root.nodeId, selector: 'input[accept="image/png,.png"]'}, session);
  await send('DOM.setFileInputFiles', {nodeId: pngInput.nodeId, files: [sourcePng]}, session);
  await evaluate(`new Promise((resolve, reject) => { const t = setInterval(() => { const note = document.querySelector('.scan-notice')?.textContent || ''; if (note.includes('已读入授权章图')) { clearInterval(t); resolve(); } }, 150); setTimeout(() => reject(Error('授权章图没有读入')), 15000); })`);
  await sleep(700);
  const pngPreview = await evaluate(`(() => { const img = document.querySelector('.paper img'); const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0); const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; let red = 0, white = 0; for (let i = 0; i < data.length; i += 4) { if (data[i] > 150 && data[i + 1] < 80 && data[i + 2] < 80) red++; if (data[i] > 248 && data[i + 1] > 248 && data[i + 2] > 248) white++; } return {red, white, width: canvas.width}; })()`);
  if (pngPreview.red < 30) throw Error('授权章图没有出现在预览上');
  if (pngPreview.white > pngPreview.width * 40) throw Error('授权章图的白底盖住了页面');
  await shot('scans-png-seal');
  await waitExportReady();
  await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('制作并下载')).click())()`);
  fs.copyFileSync(await waitDownload(), path.join(root, 'pdf', 'authorized-png-gap.pdf'));
  await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent === '删除章图').click())()`);
  await sleep(500);
  await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent === '撤销章设置').click())()`);
  await sleep(700);
  const restored = await evaluate(`document.body.innerText.includes('当前使用授权章图')`);
  if (!restored) throw Error('撤销没有恢复授权章图');
  await shot('scans-png-undo');
  await evaluate(`(() => { const box = [...document.querySelectorAll('label')].find(item => item.textContent.includes('在纸张效果之后加盖')).querySelector('input'); if (box.checked) box.click(); const sign = [...document.querySelectorAll('label')].find(item => item.textContent.includes('加一枚字体模拟签名')).querySelector('input'); if (!sign.checked) sign.click(); })()`);
  await evaluate(`new Promise(resolve => { const t = setInterval(() => { if (document.querySelector('select[aria-label="硬笔字体"]')) { clearInterval(t); resolve(); } }, 100); })`);
  const hand = ['xiaolai', 'jason', 'chen', 'yshi', 'tsuipita'];
  for (const font of hand) {
    await choose('硬笔字体', font);
    await evaluate(`(() => { const el = document.querySelector('input[maxlength="12"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '沈予安'); el.dispatchEvent(new Event('input', {bubbles:true})); })()`);
    await sleep(700);
    await shot('signature-' + font);
  }
  await waitExportReady();
  await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('制作并下载')).click())()`);
  fs.copyFileSync(await waitDownload(), path.join(root, 'pdf', 'signature-tsuipita.pdf'));
  const entries = [
    ['materials', 'http://127.0.0.1:3016/materials/', '制作并下载本份'],
    ['certificates', 'http://127.0.0.1:3016/certificates/', '下载 PDF'],
    ['finance', 'http://127.0.0.1:3016/finance/', 'PDF 文件'],
    ['rights', 'http://127.0.0.1:3016/rights/', '本份PDF'],
    ['contracts', 'http://127.0.0.1:3016/contracts/', '下载 Word'],
    ['business', 'http://127.0.0.1:3016/business/', '下载 DOCX'],
  ];
  for (const [id, url, button] of entries) {
    await go(url);
    await evaluate(`new Promise((resolve, reject) => { const t = setInterval(() => { if (document.body.innerText.includes('宋体') || document.body.innerText.includes('导出前中西文') || document.querySelector('select[aria-label="中西文配对"]')) { clearInterval(t); resolve(); } }, 200); setTimeout(() => reject(Error('${id} 页面没有出现字体配对')), 20000); })`);
    if (id === 'certificates') await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('填入示例')); button.click(); })()`);
    if (id === 'contracts') {
      await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('使用示例数据')).click())()`);
      await sleep(300);
      await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('填入示例')).click())()`);
    }
    await sleep(id === 'certificates' || id === 'contracts' ? 900 : 400);
    if (id === 'finance') {
      await evaluate(`(() => { const span = [...document.querySelectorAll('span')].find(item => item.textContent === '导出前中西文'); span.parentElement.querySelector('button').click(); })()`);
      await sleep(300);
    }
    const paired = await evaluate(`(document.querySelector('select[aria-label="中西文配对"]')?.options.length || 0) >= 5 || ['宋体 + Times','黑体 + Helvetica','细黑 + Helvetica','宋体 + Courier','黑体 + Times'].every(label => document.body.textContent.includes(label))`);
    if (!paired) throw Error(id + ' 没有五档中西文配对');
    if (id === 'finance') await send('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27}, session);
    await shot('entry-' + id);
    if (id === 'finance' || id === 'rights') await evaluate(`(() => [...document.querySelectorAll('button')].find(item => item.textContent.includes('导出')).click())()`);
    await sleep(300);
    await evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes(${JSON.stringify(button)})); if (!button || button.disabled) throw Error('导出按钮不可用'); button.click(); })()`);
    const file = await waitDownload(120000);
    const dest = path.join(root, 'pdf', 'entry-' + id + path.extname(file).toLowerCase());
    fs.copyFileSync(file, dest);
    results.push({entry: id, file: path.basename(dest), bytes: fs.statSync(dest).size});
  }
  await go('http://127.0.0.1:3016/screenshots/');
  await sleep(800);
  const screenshotPairing = await evaluate(`[...document.querySelectorAll('select')].some(item => [...item.options].some(option => option.textContent.includes('宋体 +')))`);
  if (screenshotPairing) throw Error('截图工作台不应该出现文书字体配对');
  await shot('entry-screenshots');
  fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify({results, consoleErrors: errors}, null, 2));
  if (errors.length) throw Error('控制台异常：' + errors.slice(0, 8).join('\n'));
  console.log('BROWSER_OK', results.length);
} finally {
  try { ws?.close(); } catch {}
  browser.kill('SIGKILL');
}
