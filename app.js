/* ============================================================
 *  LEGAL AI RADAR - 主渲染逻辑
 *  原生 JS，不依赖任何框架
 * ============================================================ */

const CATEGORY_MAP = {
  'all': { label: '全部', en: 'ALL' },
  'personal-info': { label: '个人信息保护', en: 'PERSONAL INFO' },
  'data-compliance': { label: '数据合规与跨境', en: 'DATA COMPLIANCE' },
  'aigc-regulation': { label: 'AIGC 与算法', en: 'AIGC & ALGORITHM' },
  'legal-judgment': { label: '判决与执法', en: 'JUDGMENT' },
  'cross-border': { label: '域外法与国际', en: 'CROSS-BORDER' }
};

const STATE = {
  data: null,
  filter: 'all'
};

/* ====== 1. 加载数据 ======
 * 优先级：
 * 1) HTTP 协议下：fetch ./data.json （便于 GitHub Pages 部署后 LLM 自动更新 JSON）
 * 2) file:// 协议下（双击打开）：直接读 DOM 内嵌 fallback，避免 CORS 报错
 * 3) fetch 失败兜底：使用 fallback
 */
function readFallback() {
  const el = document.getElementById('fallback-data');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent.trim());
  } catch (e) {
    console.warn('[LEGAL AI RADAR] fallback 数据解析失败', e);
    return null;
  }
}

async function loadData() {
  // file:// 协议下，多数浏览器会拦截 fetch 本地文件，直接走 fallback 避免控制台报错
  if (location.protocol === 'file:') {
    const fb = readFallback();
    if (fb) {
      STATE.data = fb;
      renderAll();
      console.info('[LEGAL AI RADAR] 双击预览模式，使用内嵌 fallback 数据。部署后将走 fetch ./data.json 路径。');
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
      console.warn('[LEGAL AI RADAR] fetch data.json 失败，已回退到内嵌 fallback。', err);
      return;
    }
    console.error('[LEGAL AI RADAR] 加载数据失败：', err);
    const grid = document.getElementById('cards-grid');
    grid.innerHTML = `<div class="empty" style="color:#ff2bd6">
      &gt; ERROR: 无法加载数据<br>
      <span style="font-size:11px;color:#8a8aaa">建议用 VS Code Live Server 或 <code>python3 -m http.server</code> 访问。</span>
    </div>`;
  }
}

/* ====== 2. 渲染顶部统计条 ====== */
function renderStats() {
  const d = STATE.data;
  document.getElementById('stat-total').textContent = String(d.total).padStart(3, '0');
  document.getElementById('stat-today').textContent = '+' + String(d.today_new).padStart(2, '0');
  document.getElementById('stat-updated').textContent = d.updated;
}

/* ====== 3. 渲染分类 Tab ====== */
function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  const items = STATE.data.items;
  const counts = { all: items.length };
  items.forEach(item => {
    counts[item.category] = (counts[item.category] || 0) + 1;
  });

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
      renderCards();
    });
  });
}

/* ====== 4. 渲染卡片 ====== */
function renderCards() {
  const grid = document.getElementById('cards-grid');
  let items = STATE.data.items;
  if (STATE.filter !== 'all') {
    items = items.filter(it => it.category === STATE.filter);
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty">&gt; NO DATA IN THIS CATEGORY</div>`;
    return;
  }

  grid.innerHTML = items.map(item => {
    const cat = CATEGORY_MAP[item.category] || { en: item.category.toUpperCase() };
    return `
      <article class="card" data-id="${escapeHtml(item.id)}">
        <div class="meta-row">
          <span class="source">▎${escapeHtml(item.source)}</span>
          <span class="date">${escapeHtml(item.date)}</span>
        </div>
        <span class="cat-tag" data-cat="${item.category}">${cat.en}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="summary">${escapeHtml(item.summary)}</p>
        <button class="expand-btn" data-action="toggle">&gt; EXPAND ANALYSIS</button>
        <div class="analysis">
          <span class="label">// LEGAL BASIS</span>
          <div class="content">${escapeHtml(item.analysis.legal_basis)}</div>
          <span class="label">// PRACTICAL IMPACT</span>
          <div class="content">${escapeHtml(item.analysis.practical_impact)}</div>
          ${item.url && item.url !== '#' ? `<a href="${escapeHtml(item.url)}" target="_blank" style="color:var(--neon-cyan);font-size:11px;">[ ORIGINAL SOURCE ↗ ]</a>` : ''}
        </div>
      </article>
    `;
  }).join('');

  // 绑定展开按钮
  grid.querySelectorAll('.card').forEach(card => {
    const btn = card.querySelector('.expand-btn');
    const ana = card.querySelector('.analysis');
    if (!btn || !ana) return;

    const toggle = (e) => {
      e.stopPropagation();
      const open = ana.classList.toggle('open');
      btn.textContent = open ? '> COLLAPSE' : '> EXPAND ANALYSIS';
    };

    btn.addEventListener('click', toggle);
    // 点击卡片任何位置也可展开（除链接外）
    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'A' || e.target === btn) return;
      toggle(e);
    });
  });
}

/* ====== 5. HTML 转义 ====== */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ====== 6. 刷新按钮 ====== */
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

/* ====== 7. 整体渲染 ====== */
function renderAll() {
  renderStats();
  renderTabs();
  renderCards();
}

/* ============================================================
 *  背景星空 Canvas
 * ============================================================ */
function initStarsBackground() {
  const canvas = document.getElementById('bg-stars');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let stars = [];
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.floor((canvas.width * canvas.height) / 8000);
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.2,
        a: Math.random(),
        s: Math.random() * 0.02 + 0.005,
        c: pickStarColor()
      });
    }
  }

  function pickStarColor() {
    const r = Math.random();
    if (r < 0.7) return '255,255,255';
    if (r < 0.85) return '0,240,255';
    if (r < 0.95) return '255,43,214';
    return '255,230,0';
  }

  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const st of stars) {
      st.a += st.s;
      const alpha = (Math.sin(st.a) + 1) / 2 * 0.8 + 0.1;
      ctx.beginPath();
      ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${st.c},${alpha})`;
      ctx.shadowBlur = 6;
      ctx.shadowColor = `rgba(${st.c},${alpha})`;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener('resize', resize);
  tick();
}

/* ============================================================
 *  启动
 * ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initStarsBackground();
  bindRefresh();
  loadData();
});
