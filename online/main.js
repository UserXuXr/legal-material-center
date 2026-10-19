import items from './workbenches.json';
const $=s=>document.querySelector(s);const cards=new Map();const icons={business:'文',certificates:'证',finance:'财',rights:'权',contracts:'约',batch:'批'};const states={ready:'可使用'};
function render(items) {
  $('#module-count').textContent = items.length;
  $('#running-count').textContent = '均可在线使用';
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
      link.href = `${import.meta.env.BASE_URL}${encodeURIComponent(item.id)}/`;
      link.setAttribute('aria-label', `进入${item.name}工作台（新标签页）`);
      $('#workbenches').append(card); cards.set(item.id, card);
    }
    card.querySelector('.state').dataset.state = item.state;
    card.querySelector('.state span').textContent = states[item.state] || '待检查';
    card.querySelector('.service-detail').textContent = item.id==='batch'?'逐份保存作业与文件，刷新后可继续':'方案保存在此浏览器，可导出备份';
    card.querySelector('.service-detail').classList.toggle('error', ['error','occupied'].includes(item.state));
  }
}

render(items.map(i=>({...i,state:'ready'})));
