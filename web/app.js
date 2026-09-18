'use strict';
const $ = selector => document.querySelector(selector);
const states = {ready:'运行中', starting:'启动中', offline:'未启动', occupied:'端口占用', error:'需要处理'};
const icons = {certificates:'证', finance:'财', rights:'权'};
let token = '', modules = [], pending = false, timer, launchBusy = false;
const launchId = location.pathname.startsWith('/open/') ? location.pathname.slice(6) : '';
const cards = new Map();

async function request(path, options) {
  const response = await fetch(path, {...options, signal:AbortSignal.timeout(20000)});
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '暂时无法连接素材中心');
  return data;
}

function render(items) {
  $('#module-count').textContent = items.length;
  $('#running-count').textContent = `${items.filter(m => m.state === 'ready').length} 个正在运行`;
  for (const item of items) {
    let card = cards.get(item.id);
    if (!card) {
      if (!cards.size) $('#workbenches').replaceChildren();
      card = $('#card-template').content.firstElementChild.cloneNode(true);
      card.dataset.module = item.id;
      card.querySelector('.module-icon').textContent = icons[item.id] || item.name.slice(0,1);
      card.querySelector('h3').textContent = item.name;
      card.querySelector('.card-subtitle').textContent = item.subtitle;
      card.querySelector('.card-description').textContent = item.description;
      card.querySelector('.output-formats').textContent = item.outputs;
      for (const name of item.documents) { const li = document.createElement('li'); li.textContent = name; card.querySelector('ul').append(li); }
      const link = card.querySelector('.enter');
      link.href = `/open/${encodeURIComponent(item.id)}`;
      link.setAttribute('aria-label', `进入${item.name}工作台（新标签页）`);
      $('#workbenches').append(card); cards.set(item.id, card);
    }
    card.querySelector('.state').dataset.state = item.state;
    card.querySelector('.state span').textContent = states[item.state] || '待检查';
    card.querySelector('.service-detail').textContent = item.detail;
    card.querySelector('.service-detail').classList.toggle('error', ['error','occupied'].includes(item.state));
  }
}

async function refresh() {
  if (pending) return;
  pending = true; $('#refresh').disabled = true;
  try {
    const data = await request('/api/workbenches');
    token = data.token; modules = data.workbenches;
    render(modules); $('#connection-error').hidden = true;
  } catch (error) {
    $('#connection-error').textContent = '素材中心连接已断开。请重新双击“启动素材中心.command”，然后刷新本页。';
    $('#connection-error').hidden = false;
    $('#running-count').textContent = '连接已断开';
    for (const card of cards.values()) {card.querySelector('.state').dataset.state='offline';card.querySelector('.state span').textContent='待检查';}
    throw error;
  } finally {pending = false; $('#refresh').disabled = false;}
}

function goToWorkbench(item) {
  const url = new URL(item.url);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1'].includes(url.hostname)) throw Error('工作台地址不是本机地址');
  location.replace(url.href);
}

async function launch() {
  if (!launchId || launchBusy) return;
  launchBusy = true; clearTimeout(timer);
  $('#launch-panel').hidden = false; $('#launch-spinner').hidden = false; $('#retry').hidden = true;
  try {
    await refresh();
    let item = modules.find(m => m.id === launchId);
    if (!item) throw Error('这个工作台尚未登记，请返回素材中心。');
    $('#launch-title').textContent = `正在打开${item.name}`;
    document.title = `${item.name} · 素材中心`;
    $('#launch-note').textContent = '首次启动可能需要一点时间，准备好后会自动进入。';
    if (item.state === 'ready') return goToWorkbench(item);
    await request(`/api/start/${encodeURIComponent(launchId)}`, {method:'POST', headers:{'X-Material-Center-Token':token}});
    for (let i = 0; i < 65; i++) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      await refresh(); item = modules.find(m => m.id === launchId);
      if (item.state === 'ready') return goToWorkbench(item);
      if (['error','occupied'].includes(item.state)) throw Error(item.detail);
    }
    throw Error('启动时间较长，请检查启动窗口中的提示，再点击重试。');
  } catch (error) {
    $('#launch-title').textContent = '暂时未能打开工作台';
    $('#launch-note').textContent = error.message;
    $('#launch-spinner').hidden = true; $('#retry').hidden = false;
  } finally {launchBusy = false;}
}

async function tick() {
  if (!document.hidden && !launchBusy) {try {await refresh();} catch {}}
  if (!launchId) timer = setTimeout(tick, 7000);
}
$('#refresh').addEventListener('click', () => refresh().catch(() => {}));
$('#retry').addEventListener('click', launch);
if (launchId) launch(); else tick();
