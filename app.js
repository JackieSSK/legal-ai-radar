/* ============================================================
 *  LEGAL AI RADAR - 主渲染逻辑 v2
 *  原生 JS，零依赖
 *  v2 新增：风险等级 / 行业标签 / 倒计时 / 搜索 / 视图切换 / 已读 / 收藏
 * ============================================================ */

const CATEGORY_MAP = {
  'all':              { label: '全部',          en: 'ALL' },
  'personal-info':    { label: '个人信息保护',  en: 'PERSONAL INFO' },
  'data-compliance':  { label: '数据合规与跨境', en: 'DATA COMPLIANCE' },
  'aigc-regulation':  { label: 'AIGC 与算法',    en: 'AIGC & ALGORITHM' },
  'legal-judgment':   { label: '判决与执法',    en: 'JUDGMENT' },
  'cross-border':     { label: '域外法与国际',  en: 'CROSS-BORDER' }
};

const RISK_MAP = {
  high:   { en: 'HIGH RISK', cn: '高风险' },
  medium: { en: 'MEDIUM',    cn: '中等' },
  info:   { en: 'INFO',      cn: '提示' }
};

const STATE = {
  data: null,
  filter: 'all',
  search: '',
  industry: null,           // 行业标签过滤
  view: 'card',             // 'card' | 'list'
  showFavOnly: false,
  readSet: new Set(),
  favSet: new Set()
};

const LS_READ = 'legal-radar-read';
const LS_FAV  = 'legal-radar-fav';
const LS_VIEW = 'legal-radar-view';

/* ====== 加载 / 持久化用户状态 ====== */
function loadUserState() {
  try {
    STATE.readSet = new Set(JSON.parse(localStorage.getItem(LS_READ) || '[]'));
    STATE.favSet  = new Set(JSON.parse(localStorage.getItem(LS_FAV)  || '[]'));
    const v = localStorage.getItem(LS_VIEW);
    if (v === 'list' || v === 'card') STATE.view = v;
  } catch (e) {
    console.warn('[LEGAL AI RADAR] localStorage 读取失败', e);
  }
}

function saveRead() { localStorage.setItem(LS_READ, JSON.stringify([...STATE.readSet])); }
function saveFav()  { localStorage.setItem(LS_FAV,  JSON.stringify([...STATE.favSet])); }
function saveView() { localStorage.setItem(LS_VIEW, STATE.view); }

/* ====== 数据加载 ====== */
function readFallback() {
  const el = document.getElementById('fallback-data');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent.trim());
  } catch (e) {
    console.warn('[LEGAL AI RADAR] fallback 解析失败', e);
    return null;
  }
}

async function loadData() {
  if (location.protocol === 'file:') {
    const fb = readFallback();
    if (fb) {
      STATE.data = fb;
      renderAll();
      return;
    }
  }

  try {
    const res = await fetch('./data.json?t=' + Date.now());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    STATE.data = await res.json();
    renderAll();
  } catch (err) {
    const fb = readFallback();
    if (fb) {
      STATE.data = fb;
      renderAll();
      console.warn('[LEGAL AI RADAR] fetch 失败回退 fallback', err);
      return;
    }
    console.error('[LEGAL AI RADAR] 加载数据失败：', err);
    document.getElementById('cards-grid').innerHTML =
      `<div class="empty" style="color:var(--neon-pink)">&gt; ERROR: 无法加载数据</div>`;
  }
}

/* ====== 渲染：统计条 ====== */
function renderStats() {
  const d = STATE.data;
  document.getElementById('stat-total').textContent = String(d.total).padStart(3, '0');
  document.getElementById('stat-today').textContent = '+' + String(d.today_new).padStart(2, '0');
  document.getElementById('stat-favs').textContent = String(STATE.favSet.size).padStart(2, '0');
  document.getElementById('stat-updated').textContent = d.updated;
}

/* ====== 渲染：分类 Tab ====== */
function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  const items = STATE.data.items;
  const counts = { all: items.length };
  items.forEach(it => { counts[it.category] = (counts[it.category] || 0) + 1; });

  tabsEl.innerHTML = Object.keys(CATEGORY_MAP).map(key => {
    const info = CATEGORY_MAP[key];
    const cnt = counts[key] || 0;
    const active = key === STATE.filter ? 'active' : '';
    return `<button class="tab ${active}" data-cat="${key}">
      ${info.en}<span class="count">[${String(cnt).padStart(2,'0')}]</span>
    </button>`;
  }).join('');

  tabsEl.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.filter = btn.getAttribute('data-cat');
      renderTabs();
      renderFilterStatus();
      renderCards();
    });
  });
}

/* ====== 渲染：过滤标识条 ====== */
function renderFilterStatus() {
  const el = document.getElementById('filter-status');
  const pills = [];
  if (STATE.search) pills.push(`<span class="pill">SEARCH: "${escapeHtml(STATE.search)}"<span class="x" data-action="clear-search">×</span></span>`);
  if (STATE.industry) pills.push(`<span class="pill">行业: ${escapeHtml(STATE.industry)}<span class="x" data-action="clear-industry">×</span></span>`);
  if (STATE.showFavOnly) pills.push(`<span class="pill">⭐ 仅看收藏<span class="x" data-action="clear-fav-only">×</span></span>`);

  if (!pills.length) { el.innerHTML = ''; el.style.display = 'none'; return; }

  el.innerHTML = `<span>// ACTIVE FILTERS:</span>` + pills.join('');
  el.style.display = 'flex';

  el.querySelectorAll('.x').forEach(x => {
    x.addEventListener('click', () => {
      const a = x.getAttribute('data-action');
      if (a === 'clear-search')   { STATE.search = ''; document.getElementById('search-input').value = ''; }
      if (a === 'clear-industry') { STATE.industry = null; }
      if (a === 'clear-fav-only') { STATE.showFavOnly = false; }
      renderFilterStatus();
      renderCards();
    });
  });
}

/* ====== 计算倒计时 ====== */
function calcCountdown(keyDate) {
  if (!keyDate) return null;
  const target = new Date(keyDate + 'T23:59:59');
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return diffDays;
}

function countdownClass(days) {
  if (days === null) return '';
  if (days < 0) return 'expired';
  if (days <= 30) return 'urgent';
  return '';
}

function countdownText(days, label) {
  if (days === null) return '';
  if (days < 0)  return `${label} 已过 ${Math.abs(days)} 天`;
  if (days === 0) return `${label} 今日到期`;
  return `距${label}还剩 ${days} 天`;
}

/* ====== 过滤数据 ====== */
function filterItems() {
  let items = STATE.data.items.slice();

  // 分类
  if (STATE.filter !== 'all') {
    items = items.filter(it => it.category === STATE.filter);
  }
  // 行业
  if (STATE.industry) {
    items = items.filter(it => (it.tags || []).includes(STATE.industry));
  }
  // 仅收藏
  if (STATE.showFavOnly) {
    items = items.filter(it => STATE.favSet.has(it.id));
  }
  // 搜索
  const q = STATE.search.trim().toLowerCase();
  if (q) {
    items = items.filter(it => {
      const blob = [
        it.title, it.summary, it.source,
        (it.tags || []).join(' '),
        it.analysis && it.analysis.legal_basis,
        it.analysis && it.analysis.practical_impact
      ].filter(Boolean).join(' ').toLowerCase();
      return blob.includes(q);
    });
  }

  // 排序：按倒计时紧迫度 → 风险 → 日期
  const riskOrder = { high: 0, medium: 1, info: 2 };
  items.sort((a, b) => {
    const ad = calcCountdown(a.key_date);
    const bd = calcCountdown(b.key_date);
    // 有倒计时且未过期的优先（小天数排前）
    const aValid = ad !== null && ad >= 0;
    const bValid = bd !== null && bd >= 0;
    if (aValid && bValid && ad !== bd) return ad - bd;
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    // 风险等级
    const ra = riskOrder[a.risk_level] ?? 3;
    const rb = riskOrder[b.risk_level] ?? 3;
    if (ra !== rb) return ra - rb;
    // 日期
    return (b.date || '').localeCompare(a.date || '');
  });

  return items;
}

/* ====== 渲染：卡片 ====== */
function renderCards() {
  const grid = document.getElementById('cards-grid');
  grid.classList.toggle('list-view', STATE.view === 'list');

  const items = filterItems();
  if (!items.length) {
    grid.innerHTML = `<div class="empty">&gt; NO MATCHING ENTRIES</div>`;
    return;
  }

  grid.innerHTML = items.map(item => {
    const cat = CATEGORY_MAP[item.category] || { en: item.category.toUpperCase() };
    const risk = RISK_MAP[item.risk_level] || RISK_MAP.info;
    const days = calcCountdown(item.key_date);
    const cdClass = countdownClass(days);
    const cdText = countdownText(days, item.key_date_label || '截止');

    const tagHtml = (item.tags || []).map(tag => {
      const active = tag === STATE.industry ? ' active' : '';
      return `<span class="industry-tag${active}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`;
    }).join('');

    const isRead = STATE.readSet.has(item.id);
    const isFav  = STATE.favSet.has(item.id);

    return `
      <article class="card${isRead ? ' read' : ''}" data-id="${escapeHtml(item.id)}" data-risk="${escapeHtml(item.risk_level || 'info')}">
        <span class="risk-badge ${escapeHtml(item.risk_level || 'info')}">${risk.en}</span>
        <button class="fav-btn${isFav ? ' active' : ''}" data-action="toggle-fav" title="收藏">${isFav ? '★' : '☆'}</button>
        <div class="meta-row">
          <span class="source" title="${escapeHtml(item.source)}">▎${escapeHtml(item.source)}</span>
          <span class="date">${escapeHtml(item.date)}</span>
        </div>
        <span class="cat-tag" data-cat="${item.category}">${cat.en}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="summary">${escapeHtml(item.summary)}</p>
        ${tagHtml ? `<div class="tag-row">${tagHtml}</div>` : ''}
        ${days !== null ? `<span class="countdown ${cdClass}">${escapeHtml(cdText)}</span>` : ''}
        <button class="expand-btn" data-action="toggle-analysis">&gt; 法律分析 / EXPAND</button>
        <div class="analysis">
          <span class="label">// LEGAL BASIS · 法条依据</span>
          <div class="content">${escapeHtml(item.analysis.legal_basis)}</div>
          <span class="label">// PRACTICAL IMPACT · 实务影响</span>
          <div class="content">${escapeHtml(item.analysis.practical_impact)}</div>
          ${item.url && item.url !== '#' ? `<a href="${escapeHtml(item.url)}" target="_blank" style="color:var(--neon-cyan);font-size:11px;">[ ORIGINAL SOURCE ↗ ]</a>` : ''}
        </div>
      </article>
    `;
  }).join('');

  // 绑定卡片交互
  grid.querySelectorAll('.card').forEach(card => {
    const id = card.getAttribute('data-id');
    const ana = card.querySelector('.analysis');
    const expBtn = card.querySelector('.expand-btn');
    const favBtn = card.querySelector('.fav-btn');

    const toggleAnalysis = (e) => {
      if (e) e.stopPropagation();
      // 标记已读
      if (!STATE.readSet.has(id)) {
        STATE.readSet.add(id);
        saveRead();
        card.classList.add('read');
      }
      const open = ana.classList.toggle('open');
      expBtn.textContent = open ? '> COLLAPSE' : '> 法律分析 / EXPAND';
    };

    expBtn.addEventListener('click', toggleAnalysis);

    // 收藏按钮
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (STATE.favSet.has(id)) {
        STATE.favSet.delete(id);
        favBtn.classList.remove('active');
        favBtn.textContent = '☆';
      } else {
        STATE.favSet.add(id);
        favBtn.classList.add('active');
        favBtn.textContent = '★';
      }
      saveFav();
      document.getElementById('stat-favs').textContent = String(STATE.favSet.size).padStart(2, '0');
    });

    // 行业标签
    card.querySelectorAll('.industry-tag').forEach(t => {
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        const tag = t.getAttribute('data-tag');
        STATE.industry = (STATE.industry === tag) ? null : tag;
        renderFilterStatus();
        renderCards();
      });
    });

    // 卡片点击展开（避开按钮、链接、标签）
    card.addEventListener('click', (e) => {
      const tag = e.target.tagName;
      if (tag === 'A' || tag === 'BUTTON') return;
      if (e.target.classList.contains('industry-tag')) return;
      toggleAnalysis(e);
    });
  });
}

/* ====== 搜索（debounce 200ms） ====== */
function bindSearch() {
  const input = document.getElementById('search-input');
  let timer = null;
  input.addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      STATE.search = e.target.value || '';
      renderFilterStatus();
      renderCards();
    }, 200);
  });
}

/* ====== 视图切换 ====== */
function bindViewToggle() {
  document.querySelectorAll('.view-btn').forEach(b => {
    b.addEventListener('click', () => {
      const v = b.getAttribute('data-view');
      STATE.view = v;
      saveView();
      document.querySelectorAll('.view-btn').forEach(x => x.classList.toggle('active', x === b));
      renderCards();
    });
  });
  // 初始化
  document.querySelectorAll('.view-btn').forEach(x => {
    x.classList.toggle('active', x.getAttribute('data-view') === STATE.view);
  });
}

/* ====== 仅看收藏 toggle（顶栏 stat-favs 卡片可点击） ====== */
function bindFavStat() {
  const card = document.getElementById('stat-favs-card');
  if (!card) return;
  card.addEventListener('click', () => {
    STATE.showFavOnly = !STATE.showFavOnly;
    card.classList.toggle('active', STATE.showFavOnly);
    renderFilterStatus();
    renderCards();
  });
}

/* ====== HTML 转义 ====== */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ====== 刷新按钮 ====== */
function bindRefresh() {
  const btn = document.getElementById('refresh-btn');
  btn.addEventListener('click', async () => {
    btn.classList.add('spinning');
    btn.disabled = true;
    await loadData();
    setTimeout(() => {
      btn.classList.remove('spinning');
      btn.disabled = false;
    }, 600);
  });
}

/* ====== 整体渲染 ====== */
function renderAll() {
  renderStats();
  renderTabs();
  renderFilterStatus();
  renderCards();
}

/* ====== 启动 ====== */
document.addEventListener('DOMContentLoaded', () => {
  loadUserState();
  bindSearch();
  bindViewToggle();
  bindFavStat();
  bindRefresh();
  loadData();
});
