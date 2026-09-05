// ZIAVER 求职自动化助手 - BOSS直聘特定化定制巡航引擎 v2.2
// 特性：高亮职业词条精准匹配、动态千人千面话术、HR回复系统强提醒、跨网站一键切换

(function () {
  'use strict';

  if (window.__ZIAVER_BOSS_AUTOPILOT__) return;
  window.__ZIAVER_BOSS_AUTOPILOT__ = true;

  console.log('[ZIAVER Autopilot] BOSS直聘智能巡航模块 v2.2 已挂载');

  let isRunning = false;
  let isPaused = false;
  let todayCount = 0;
  let sessionCount = 0;
  let lastUnreadCount = 0;
  let pipelineMode = false;
  let pipelineTarget = 10;

  let activeTags = []; // 当前在后台勾选高亮生效的职业词条
  let config = {
    dailyLimit: 30,
    minDelaySec: 9,
    maxDelaySec: 15,
    minSalaryK: 9,
    blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,培训生',
    enableDynamicGreeting: true,
    audioAlert: true,
    desktopNotification: true
  };

  function refreshConfig(callback) {
    if (!chrome.storage || !chrome.storage.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(['config', 'jobTags'], (res) => {
      if (res && res.config) {
        config = { ...config, ...res.config };
        const today = new Date().toISOString().split('T')[0];
        if (config.lastActiveDate === today) {
          const counts = config.siteTodayCounts || {};
          todayCount = counts.boss !== undefined ? counts.boss : (config.todayCount || 0);
        } else {
          todayCount = 0;
        }
      }

      if (res && res.jobTags && Array.isArray(res.jobTags)) {
        activeTags = res.jobTags.filter(t => t.active).map(t => t.name.trim());
      } else {
        // 默认预备词条
        activeTags = ['达人运营', '电商运营', '千川投放', '游戏运营', '游戏社区', '商业摄影', '视觉策划', '综合运营'];
      }

      if (callback) callback();
      updateHUD();
    });
  }

  // ================= 动态智能打招呼拼装引擎 =================
  function synthesizeDynamicGreeting(jobTitle, matchedTag, company) {
    const cleanTitle = (jobTitle || '').replace(/[\(（].*?[\)）]/g, '').trim() || jobTitle || '这个岗位';
    const cleanCompany = (company || '').trim();

    // 1. 若开启自定义话术（默认开启），优先采用后台设定的话术并动态替换变量
    if (config.useCustomGreeting !== false && config.customGreetingTemplate) {
      let template = config.customGreetingTemplate;
      template = template.replace(/\{jobTitle\}/g, cleanTitle);
      template = template.replace(/\{company\}/g, cleanCompany);
      template = template.replace(/\{matchedTag\}/g, matchedTag || '运营');
      template = template.replace(/\{portfolioUrl\}/g, config.portfolioUrl || '');
      return template;
    }

    // 2. 内置新风格默认备用话术（温和干练、重落地、带身体健康祝福）
    return `您好！看到咱们在招「${cleanTitle}」，感觉整体要求跟我还蛮匹配的。我有相关方向的实战经验，执行力强、比较看重数据和落地。简历在附件中，如果合适随时沟通交流，祝您工作顺利、天天开心～`;
  }

  // ================= 高亮职业词条强校验 =================
  function screenJobCard(card) {
    const titleEl = card.querySelector('.job-name, .job-title');
    const salaryEl = card.querySelector('.salary');
    const companyEl = card.querySelector('.company-name, .company-info a');
    const tagsEl = card.querySelector('.tag-list, .job-tags');

    const title = titleEl ? titleEl.textContent.trim() : '';
    const salary = salaryEl ? salaryEl.textContent.trim() : '';
    const company = companyEl ? companyEl.textContent.trim() : '';
    const tags = tagsEl ? tagsEl.textContent.trim() : '';

    if (!title) return { pass: false, reason: '未获取到岗位名称' };

    // 1. 检查是否命中用户高亮选中的职业词条
    let matchedTag = null;
    for (const tag of activeTags) {
      if (title.toLowerCase().includes(tag.toLowerCase())) {
        matchedTag = tag;
        break;
      }
    }

    if (!matchedTag) {
      return {
        pass: false,
        reason: `[未选中词条] 「${title}」未命中当前高亮勾选的 ${activeTags.length} 个职业词条`
      };
    }

    // 2. 黑名单公司或词汇过滤
    const fullText = (title + ' ' + company + ' ' + tags).toLowerCase();
    const blacklist = (config.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);
    for (const word of blacklist) {
      if (fullText.includes(word.toLowerCase())) {
        return { pass: false, reason: `[触发黑名单] 命中词: "${word}" (${company})` };
      }
    }

    // 3. 经验要求拦截
    if (/5-10年|10年以上|8-10年|8年以上/i.test(tags)) {
      return { pass: false, reason: `[经验过高跳过] ${tags}` };
    }

    // 4. 薪资门槛过滤
    const match = salary.match(/(\d+)(?:-(\d+))?K/i);
    if (match) {
      const maxK = match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
      if (maxK < config.minSalaryK) {
        return { pass: false, reason: `[低薪跳过] ${salary} 未达 ${config.minSalaryK}K` };
      }
    }

    return {
      pass: true,
      data: { title, salary, company, tags, matchedTag }
    };
  }

  // ================= Web Audio 提示音 =================
  function playDoubleChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      playTone(587.33, 0, 0.18);
      playTone(880.00, 0.2, 0.35);
    } catch (e) {
      console.warn(e);
    }
  }

  function getRandomDelayMs() {
    const min = config.minDelaySec || 9;
    const max = config.maxDelaySec || 15;
    const sec = Math.random() * (max - min) + min;
    return Math.floor(sec * 1000);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================= Shadow DOM HUD 控制台 =================
  let hudContainer = null;
  let shadowRoot = null;

  function createHUD() {
    if (document.getElementById('ziaver-boss-hud')) return;

    hudContainer = document.createElement('div');
    hudContainer.id = 'ziaver-boss-hud';
    hudContainer.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    `;
    
    shadowRoot = hudContainer.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .hud-panel {
        width: 330px;
        background: rgba(11, 15, 25, 0.96);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(0, 242, 254, 0.35);
        border-radius: 14px;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.65), 0 0 24px rgba(0, 242, 254, 0.15);
        color: #e2e8f0;
        overflow: hidden;
      }
      .hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(90deg, rgba(0, 242, 254, 0.15), rgba(79, 172, 254, 0.05));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        cursor: move;
        user-select: none;
      }
      .hud-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .hud-title {
        font-size: 13px;
        font-weight: 700;
        color: #fff;
      }
      .hud-tag {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(0, 242, 254, 0.2);
        color: #00f2fe;
        font-weight: 600;
      }
      .hud-header-actions {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .hud-mode-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #cbd5e1;
        cursor: pointer;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 4px;
        transition: all 0.15s;
      }
      .hud-mode-btn:hover {
        background: rgba(0, 242, 254, 0.2);
        color: #00f2fe;
        border-color: #00f2fe;
      }
      .hud-minimize-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 16px;
        padding: 4px;
      }
      .hud-minimize-btn:hover {
        color: #fff;
      }
      /* 精简模式 (Compact Mode) */
      .hud-panel.compact {
        width: 275px;
      }
      .hud-panel.compact .stats-grid,
      .hud-panel.compact .tag-indicator,
      .hud-panel.compact .cross-site-bar,
      .hud-panel.compact .log-box {
        display: none !important;
      }
      .hud-panel.compact .hud-body {
        padding: 8px 12px;
        gap: 6px;
      }
      .compact-stat-row {
        display: none;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .hud-panel.compact .compact-stat-row {
        display: flex;
      }
      .hud-body {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .stat-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 8px 12px;
      }
      .stat-label {
        font-size: 11px;
        color: #94a3b8;
        margin-bottom: 3px;
      }
      .stat-val {
        font-size: 18px;
        font-weight: 800;
        color: #00f2fe;
        font-variant-numeric: tabular-nums;
      }
      .tag-indicator {
        background: rgba(0, 242, 254, 0.08);
        border: 1px dashed rgba(0, 242, 254, 0.3);
        border-radius: 6px;
        padding: 6px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
      }
      .tag-link {
        color: #00f2fe;
        text-decoration: underline;
        cursor: pointer;
        font-weight: 600;
      }
      .action-btns {
        display: flex;
        gap: 8px;
      }
      .btn {
        flex: 1;
        padding: 9px 12px;
        border-radius: 8px;
        border: none;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .btn-primary {
        background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
        color: #0b0f19;
        box-shadow: 0 4px 14px rgba(0, 242, 254, 0.3);
      }
      .btn-pause {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }
      .btn-stop {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      .log-box {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10.5px;
        color: #94a3b8;
        background: rgba(0, 0, 0, 0.45);
        padding: 8px 10px;
        border-radius: 6px;
        max-height: 90px;
        overflow-y: auto;
        line-height: 1.45;
        border-left: 2px solid #00f2fe;
      }
      .log-box span.highlight { color: #00f2fe; font-weight: 600; }
      .log-box span.success { color: #10b981; font-weight: 600; }
      .log-box span.skip { color: #64748b; }
      .cross-site-bar {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .cross-title {
        font-size: 10.5px;
        color: #94a3b8;
        display: flex;
        justify-content: space-between;
      }
      .site-chips {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
      }
      .site-chip-btn {
        font-size: 10px;
        padding: 3px 8px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: #cbd5e1;
        cursor: pointer;
      }
      .site-chip-btn:hover {
        background: #00f2fe;
        color: #0b0f19;
      }
      .collapsed { display: none; }
      .pill-badge {
        display: none;
        padding: 8px 14px;
        background: rgba(11, 15, 25, 0.95);
        border: 1px solid #00f2fe;
        border-radius: 30px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        color: #00f2fe;
        font-size: 12px;
        font-weight: 700;
      }
    `;

    const hudHtml = document.createElement('div');
    hudHtml.innerHTML = `
      <div class="hud-panel" id="hud-main">
        <div class="hud-header" id="hud-drag-handle">
          <div class="hud-title-wrap">
            <span class="hud-title">⚡ ZIAVER 求职巡航</span>
            <span class="hud-tag">BOSS直聘</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button class="hud-mode-btn" id="hud-mode-btn" title="切换 精简/完整 模式">⊡ 精简</button>
            <button class="hud-minimize-btn" id="hud-min-btn" title="收起为胶囊">—</button>
          </div>
        </div>
        <div class="hud-body" id="hud-body">
          <div class="compact-stat-row" id="compact-stat-row">
            <span>今日: <b id="compact-val-today" style="color:#00f2fe;">0/30</b> | 本次: <b id="compact-val-sess" style="color:#00f2fe;">0</b></span>
            <span id="compact-status-tag" style="color:#10b981; font-size:10px;">🟢 就绪</span>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">今日已投 / 上限</div>
              <div class="stat-val" id="val-today-count">0 <span class="stat-sub">/ 30</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">本次投递</div>
              <div class="stat-val" id="val-session-count">0</div>
            </div>
          </div>

          <div class="tag-indicator">
            <span>🎯 当前生效词条: <b id="active-tag-count" style="color:#00f2fe;">8</b> 个</span>
            <span class="tag-link" id="btn-open-dashboard">打开完整后台管理 ↗</span>
          </div>

          <div class="action-btns">
            <button class="btn btn-primary" id="btn-toggle-run">
              <span>🚀 开启自动投递</span>
            </button>
            <button class="btn btn-pause" id="btn-pause-run" style="display: none;">
              <span>⏸ 暂停</span>
            </button>
          </div>

          <div style="margin-top: 6px;">
            <button class="btn btn-secondary" id="btn-boss-open-quickfill" style="width:100%; font-size:11.5px; padding:7px 10px; background:rgba(0,242,254,0.12); border:1px solid rgba(0,242,254,0.3); color:#00f2fe; border-radius:6px; cursor:pointer;">
              <span>📋 展开简历速填小抽屉</span>
            </button>
          </div>

          <div class="log-box" id="hud-log-stream">
            <div>[系统就绪] 只投递包含后台高亮词条的岗位，点击启动即可巡航。</div>
          </div>

          <div class="cross-site-bar">
            <div class="cross-title">
              <span>🌐 切换目标网站</span>
              <span style="color:#10b981; font-size:10px;">🟢 HR监听就绪</span>
            </div>
            <div class="site-chips">
              <button class="site-chip-btn" data-url="https://www.liepin.com/zhaopin/?city=050090">猎聘网</button>
              <button class="site-chip-btn" data-url="https://www.lagou.com/wn/jobs?city=%E6%B7%B1%E5%9C%B3" style="border-color:#10b981; color:#34d399;">拉勾网</button>
              <button class="site-chip-btn" data-url="https://careers.tencent.com/search.html">腾讯社招</button>
              <button class="site-chip-btn" data-url="https://jobs.bytedance.com/">字节社招</button>
              <button class="site-chip-btn" data-url="https://we.dji.com/zh-CN/social">大疆社招</button>
              <button class="site-chip-btn" data-url="https://join.qq.com/post.html" style="border-color:#38bdf8; color:#38bdf8;">🎓腾讯校招</button>
              <button class="site-chip-btn" data-url="https://jobs.bytedance.com/campus/position" style="border-color:#60a5fa; color:#60a5fa;">🎓字节校招</button>
              <button class="site-chip-btn" data-url="https://we.dji.com/zh-CN/campus" style="border-color:#00f2fe; color:#00f2fe;">🎓大疆校招</button>
              <button class="site-chip-btn" data-url="https://campus.163.com/" style="border-color:#fb7185; color:#fb7185;">🎓网易校招</button>
            </div>
          </div>
        </div>
      </div>
      <div class="pill-badge" id="hud-pill-badge">
        ⚡ BOSS巡航 (<span id="pill-count">0</span>/<span id="pill-limit">30</span>)
      </div>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(hudHtml);
    document.body.appendChild(hudContainer);

    setupHUDEvents();
  }

  function setupHUDEvents() {
    const minBtn = shadowRoot.getElementById('hud-min-btn');
    const modeBtn = shadowRoot.getElementById('hud-mode-btn');
    const hudMain = shadowRoot.getElementById('hud-main');
    const pillBadge = shadowRoot.getElementById('hud-pill-badge');
    const btnToggle = shadowRoot.getElementById('btn-toggle-run');
    const btnPause = shadowRoot.getElementById('btn-pause-run');

    function applyHUDMode(mode) {
      if (mode === 'mini') {
        hudMain.classList.add('collapsed');
        pillBadge.style.display = 'block';
      } else if (mode === 'compact') {
        hudMain.classList.remove('collapsed');
        pillBadge.style.display = 'none';
        hudMain.classList.add('compact');
        if (modeBtn) {
          modeBtn.textContent = '⊞ 完整';
          modeBtn.title = '切换回完整面板';
        }
        localStorage.setItem('jobcruise_hud_mode', 'compact');
      } else {
        hudMain.classList.remove('collapsed');
        pillBadge.style.display = 'none';
        hudMain.classList.remove('compact');
        if (modeBtn) {
          modeBtn.textContent = '⊡ 精简';
          modeBtn.title = '切换为精简小窗';
        }
        localStorage.setItem('jobcruise_hud_mode', 'full');
      }
    }

    const savedMode = localStorage.getItem('jobcruise_hud_mode') || 'full';
    applyHUDMode(savedMode);

    if (modeBtn) {
      modeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isCompact = hudMain.classList.contains('compact');
        applyHUDMode(isCompact ? 'full' : 'compact');
      });
    }

    minBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      applyHUDMode('mini');
    });

    pillBadge.addEventListener('click', () => {
      const restoreMode = localStorage.getItem('jobcruise_hud_mode') || 'full';
      applyHUDMode(restoreMode);
    });

    // 打开全功能后台管理页
    shadowRoot.getElementById('btn-open-dashboard').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html')
      });
    });

    // 展开/收起简历速填小抽屉
    shadowRoot.getElementById('btn-boss-open-quickfill')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('JOBCRUISE_TOGGLE_QUICKFILL'));
    });

    // 跨网站切换按钮
    shadowRoot.querySelectorAll('.site-chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.getAttribute('data-url');
        if (url) {
          chrome.runtime.sendMessage({ type: 'OPEN_PAGE', url });
        }
      });
    });

    btnToggle.addEventListener('click', () => {
      if (!isRunning) {
        startAutopilot();
      } else {
        stopAutopilot();
      }
    });

    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      const statusTag = shadowRoot.getElementById('compact-status-tag');
      if (isPaused) {
        btnPause.innerHTML = '<span>▶ 继续</span>';
        if (statusTag) { statusTag.textContent = '⏸ 暂停中'; statusTag.style.color = '#f59e0b'; }
        logHUD('<span class="highlight">[已暂停]</span> 巡航挂起中...');
      } else {
        btnPause.innerHTML = '<span>⏸ 暂停</span>';
        if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#00f2fe'; }
        logHUD('<span class="success">[已继续]</span> 恢复投递');
      }
    });

    // 拖拽支持
    const handle = shadowRoot.getElementById('hud-drag-handle');
    let isDragging = false;
    let startX, startY, initialRight, initialBottom;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = hudContainer.getBoundingClientRect();
      initialRight = window.innerWidth - rect.right;
      initialBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = startX - e.clientX;
      const dy = startY - e.clientY;
      hudContainer.style.right = `${Math.max(10, initialRight + dx)}px`;
      hudContainer.style.bottom = `${Math.max(10, initialBottom + dy)}px`;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  function logHUD(html) {
    const stream = shadowRoot?.getElementById('hud-log-stream');
    if (!stream) return;
    const line = document.createElement('div');
    line.innerHTML = html;
    stream.prepend(line);
    while (stream.children.length > 30) {
      stream.removeChild(stream.lastChild);
    }
  }

  function updateHUD() {
    if (!shadowRoot) return;
    const todayEl = shadowRoot.getElementById('val-today-count');
    const sessEl = shadowRoot.getElementById('val-session-count');
    const pillCount = shadowRoot.getElementById('pill-count');
    const pillLimit = shadowRoot.getElementById('pill-limit');
    const tagCountEl = shadowRoot.getElementById('active-tag-count');
    const compactToday = shadowRoot.getElementById('compact-val-today');
    const compactSess = shadowRoot.getElementById('compact-val-sess');

    const limit = config.dailyLimit || 30;
    if (todayEl) {
      todayEl.innerHTML = `${todayCount} <span class="stat-sub">/ ${limit}</span>`;
    }
    if (sessEl) sessEl.textContent = sessionCount;
    if (pillCount) pillCount.textContent = todayCount;
    if (pillLimit) pillLimit.textContent = limit;
    if (tagCountEl) tagCountEl.textContent = activeTags.length;
    if (compactToday) compactToday.textContent = `${todayCount}/${limit}`;
    if (compactSess) compactSess.textContent = sessionCount;
  }

  // ================= HR 回复未读监听 =================
  function startHRReplyWatcher() {
    setInterval(() => {
      const badgeElements = document.querySelectorAll(
        '.nav-item-message .badge, .nav-item-message span.count, [class*="unread-num"], [class*="badge-count"], .header-nav-message span.badge'
      );

      let currentUnread = 0;
      badgeElements.forEach(el => {
        const text = el.textContent.trim();
        const num = parseInt(text, 10);
        if (!isNaN(num) && num > 0) currentUnread += num;
      });

      if (currentUnread > lastUnreadCount) {
        console.log(`[ZIAVER Autopilot] BOSS检测到 HR 新回复！未读增量: ${currentUnread - lastUnreadCount}`);
        if (config.audioAlert) playDoubleChime();
        if (config.desktopNotification) {
          chrome.runtime.sendMessage({
            type: 'HR_REPLY_ALERT',
            text: `BOSS直聘有新的 HR 沟通回复 (${currentUnread} 条未读)，请及时跟进！`
          });
        }
        logHUD(`<span class="success" style="font-weight: bold;">🔔 检测到 HR 新回复！请查看顶栏私信。</span>`);
      }

      lastUnreadCount = currentUnread;
    }, 4000);
  }

  // ================= 登录状态智能识别 =================
  function checkIsLoggedIn() {
    // 1. URL 检查 (登录注册路由)
    if (location.pathname.includes('/user/') || location.href.includes('login') || location.href.includes('signin')) {
      return false;
    }
    // 2. 页面显式存在未登录/登录/注册按钮
    const loginBtns = document.querySelectorAll('.header-login-btn, a[ka*="header-login"], .btn-sign-in, .user-nav .login-btn');
    for (const btn of loginBtns) {
      if (btn.offsetParent !== null && (btn.textContent.includes('登录') || btn.textContent.includes('注册'))) {
        return false;
      }
    }
    // 3. 页面已弹出登录/扫码弹窗
    const loginModal = document.querySelector('.boss-login-dialog, .dialog-signin, .login-register-content, .login-register-dialog, .sign-form, .dialog-wrap .qrcode-box');
    if (loginModal && loginModal.offsetParent !== null) {
      return false;
    }
    // 4. 登录特征元素检测（头像/消息/极客中心）
    const loggedInIndicators = document.querySelectorAll('.nav-figure, .header-nav-user, .nav-item-message, .nav-item-geek, [ka*="header-geek"]');
    if (loggedInIndicators.length > 0) {
      return true;
    }
    return true;
  }

  let isSkipped = false;

  // ================= 投递主流程 =================
  async function startAutopilot(target = null, isFromPipeline = false, initialSessionCount = 0) {
    refreshConfig();
    isSkipped = false;

    // 智能登录态检测
    if (!checkIsLoggedIn()) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD('<span class="highlight" style="color:#f59e0b;">[未登录检测]</span> 未检测到当前网站登录状态，全网流水线自动跳过本站...');
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'boss',
          reason: '未登录账号'
        });
        return;
      } else {
        alert('⚠️ 检测到您尚未登录 BOSS 直聘（或会话已过期）！\n请先在页面右上角完成登录后再开启自动巡航。');
        return;
      }
    }

    if (todayCount >= config.dailyLimit) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD(`<span class="highlight" style="color:#f59e0b;">[安全上限已达]</span> 今日已达安全上限 (${config.dailyLimit} 次)，自动向全网巡航下一站交接...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_FINISHED',
          site: 'boss',
          count: 0
        });
        return;
      } else {
        alert(`⚠️ 今日已达到设定的安全投递上限 (${config.dailyLimit} 次)！\n为保护账号绝对安全，自动停止投递。可在后台调整上限。`);
        return;
      }
    }

    if (activeTags.length === 0) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD('<span class="highlight" style="color:#f59e0b;">[无生效词条]</span> 当前未勾选生效职业词条，全网流水线跳过本站...');
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'boss',
          reason: '未勾选高亮职业词条'
        });
        return;
      } else {
        alert('⚠️ 当前没有高亮选中的生效职业词条！\n请点击控制台上的「打开完整后台管理」勾选要投递的职业标签。');
        return;
      }
    }

    pipelineMode = !!isFromPipeline;
    pipelineTarget = target || (config.dailyLimit || 30);

    isRunning = true;
    isPaused = false;
    sessionCount = initialSessionCount || 0;
    const btnToggle = shadowRoot.getElementById('btn-toggle-run');
    const btnPause = shadowRoot.getElementById('btn-pause-run');
    const statusTag = shadowRoot.getElementById('compact-status-tag');
    if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#00f2fe'; }
    btnToggle.innerHTML = '<span>🛑 停止巡航</span>';
    btnToggle.className = 'btn btn-stop';
    btnPause.style.display = 'flex';

    logHUD(`<span class="highlight">[巡航启动]</span> ${pipelineMode ? `全网流水线模式 (本站目标 ${pipelineTarget} 个，已完成 ${sessionCount})！` : '开始扫描！'}当前高亮生效词条: ${activeTags.slice(0, 4).join(', ')}等 ${activeTags.length} 个`);
    if (document.hidden) {
      logHUD('<span class="skip" style="color:#fbbf24;">[提示] 建议保持窗口展开（或放至 Win+Tab 虚拟桌面），避免最小化被系统节能休眠限速。</span>');
    }

    try {
      await runJobLoop();
    } catch (err) {
      console.error(err);
      logHUD(`<span class="highlight" style="color:#ef4444;">[错误中断]</span> ${err.message || err}`);
    } finally {
      const wasPipeline = pipelineMode;
      const finalCount = sessionCount;
      try {
        sessionStorage.removeItem('ziaver_pipeline_boss_state');
      } catch (e) {}
      stopAutopilot();
      if (wasPipeline && !isSkipped) {
        logHUD(`<span class="success">[本站目标达成]</span> 已完成 ${finalCount} 个，汇报至全网巡航中枢...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_FINISHED',
          site: 'boss',
          count: finalCount
        });
      }
    }
  }

  function stopAutopilot() {
    try {
      sessionStorage.removeItem('ziaver_pipeline_boss_state');
    } catch (e) {}
    isRunning = false;
    isPaused = false;
    const btnToggle = shadowRoot?.getElementById('btn-toggle-run');
    const btnPause = shadowRoot?.getElementById('btn-pause-run');
    const statusTag = shadowRoot?.getElementById('compact-status-tag');
    const btnFold = shadowRoot?.getElementById('btn-fold-panel');
    if (statusTag) { statusTag.textContent = '待命就绪'; statusTag.style.color = '#94a3b8'; }
    if (btnToggle) {
      btnToggle.innerHTML = '<span>🚀 开启自动巡航</span>';
      btnToggle.className = 'btn btn-primary';
    }
    if (btnPause) {
      btnPause.style.display = 'none';
      btnPause.textContent = '⏸️ 暂停';
    }
    logHUD('<span>[巡航结束]</span> 巡航停止。');
  }

  async function runJobLoop() {
    while (isRunning) {
      if (isPaused) {
        await sleep(1000);
        continue;
      }

      if (todayCount >= config.dailyLimit) {
        logHUD(`<span class="highlight">[上限熔断]</span> 今日已达安全上限 ${config.dailyLimit} 个！建议切换至其他平台。`);
        break;
      }

      if (pipelineMode && sessionCount >= pipelineTarget) {
        logHUD(`<span class="highlight">[本站目标达成]</span> 已完成全网流水线设定的本站目标 (${sessionCount}/${pipelineTarget})！`);
        break;
      }

      let jobCards = document.querySelectorAll('.job-card-wrapper, .job-card-box, ul.job-list-box > li');
      if (!jobCards || jobCards.length === 0) {
        window.scrollBy({ top: 400, behavior: 'smooth' });
        await sleep(2500);
        jobCards = document.querySelectorAll('.job-card-wrapper, .job-card-box, ul.job-list-box > li');
      }

      if (!jobCards || jobCards.length === 0) {
        if (!checkIsLoggedIn()) {
          isSkipped = true;
          logHUD('<span class="highlight" style="color:#f59e0b;">[未登录检测]</span> 当前页面为未登录状态，自动跳过本站...');
          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_SKIPPED',
              site: 'boss',
              reason: '未登录账号'
            });
          }
          break;
        }
        logHUD('<span class="skip">未在当前页面找到职位卡片，请打开 BOSS 职位搜索列表页。</span>');
        break;
      }

      for (let i = 0; i < jobCards.length; i++) {
        if (!isRunning) break;
        while (isPaused) await sleep(1000);
        if (todayCount >= config.dailyLimit) break;
        if (pipelineMode && sessionCount >= pipelineTarget) break;

        if (!checkIsLoggedIn()) {
          isSkipped = true;
          logHUD('<span class="highlight" style="color:#ef4444;">[登录态失效]</span> 检测到登录弹窗，已安全跳过本站...');
          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_SKIPPED',
              site: 'boss',
              reason: '弹出登录弹窗'
            });
          }
          break;
        }

        const card = jobCards[i];
        if (card.dataset.ziaverHandled === 'true') continue;
        card.dataset.ziaverHandled = 'true';

        // 核心：基于高亮选中的职业词条进行判断
        const screenResult = screenJobCard(card);
        if (!screenResult.pass) {
          logHUD(`<span class="skip">${screenResult.reason}</span>`);
          continue;
        }

        const { title, salary, company, tags, matchedTag } = screenResult.data;

        // 寻找“立即沟通”
        let btnChat = null;
        const allBtns = card.querySelectorAll('a, button, span');
        for (const b of allBtns) {
          const txt = b.textContent.trim();
          if (txt === '立即沟通' || txt === '打招呼') {
            btnChat = b;
            break;
          }
          if (txt === '继续沟通' || txt === '已沟通') {
            btnChat = null;
            break;
          }
        }

        if (!btnChat) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.click();
          await sleep(1200);

          const detailDrawer = document.querySelector('.job-detail-box, .job-dialog, .job-detail-container');
          if (detailDrawer) {
            const drawerBtns = detailDrawer.querySelectorAll('a, button');
            for (const b of drawerBtns) {
              const txt = b.textContent.trim();
              if (txt === '立即沟通') {
                btnChat = b;
                break;
              }
            }
          }
        }

        if (btnChat) {
          const greetingText = synthesizeDynamicGreeting(title, matchedTag, company);

          logHUD(`<span class="highlight">[命中高亮词条: ${matchedTag}]</span> ${company} · ${title} (${salary})`);
          logHUD(`<span class="skip" style="color:#a5f3fc;">动态话术已合成: "${greetingText.slice(0, 32)}..."</span>`);

          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(Math.floor(Math.random() * 800) + 600);

          btnChat.click();

          await handleGreetingDialog(greetingText);

          todayCount++;
          sessionCount++;
          updateHUD();

          // 独立持久化 BOSS 今日投递数据
          if (chrome.storage && chrome.storage.local) {
            const today = new Date().toISOString().split('T')[0];
            const siteCounts = config.siteTodayCounts || { boss: 0, liepin: 0, lagou: 0, ats: 0 };
            siteCounts.boss = todayCount;
            const totalCount = Object.values(siteCounts).reduce((a, b) => a + (Number(b) || 0), 0);
            chrome.storage.local.set({
              config: { ...config, todayCount: totalCount, siteTodayCounts: siteCounts, lastActiveDate: today }
            });
          }

          // 发送详尽记录至后台表格
          chrome.runtime.sendMessage({
            type: 'APPLY_LOG',
            data: {
              platform: 'BOSS直聘',
              company,
              title,
              salary,
              matchedTag,
              greeting: greetingText,
              status: '已沟通'
            }
          });

          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_PROGRESS',
              site: 'boss',
              count: sessionCount
            });
          }

          logHUD(`<span class="success">[投递成功]</span> 已记录到投递表格！`);

          const delayMs = getRandomDelayMs();
          logHUD(`<span class="skip">安全冷却中... 随机等待 ${(delayMs / 1000).toFixed(1)} 秒</span>`);
          await sleep(delayMs);
        }
      }

      // 强校验：卡片遍历结束后，若今日上限已达或流水线本站目标已达成，立刻终止循环，坚决禁止执行翻页！
      if (!isRunning) break;
      if (todayCount >= config.dailyLimit) {
        logHUD(`<span class="highlight">[安全上限熔断]</span> 今日已达安全上限 ${config.dailyLimit} 次，停止投递！`);
        break;
      }
      if (pipelineMode && sessionCount >= pipelineTarget) {
        logHUD(`<span class="success">[本站目标达成]</span> 已完成设定目标 (${sessionCount}/${pipelineTarget})，停止翻页并向中枢交接！`);
        break;
      }

      if (isRunning && !isPaused) {
        logHUD('<span>[翻页检测]</span> 尝试加载下一页...');
        const nextBtn = document.querySelector('.ui-icon-arrow-right, a.next, .pagination-next');
        if (nextBtn && !nextBtn.classList.contains('disabled')) {
          if (pipelineMode) {
            try {
              sessionStorage.setItem('ziaver_pipeline_boss_state', JSON.stringify({
                inPipeline: true,
                target: pipelineTarget,
                sessionCount: sessionCount,
                timestamp: Date.now()
              }));
            } catch (e) {}
          }
          nextBtn.click();
          await sleep(4000);
        } else {
          window.scrollBy({ top: 800, behavior: 'smooth' });
          await sleep(3500);
        }
      }
    }
  }

  async function handleGreetingDialog(customGreeting) {
    await sleep(1000);
    const modalTextarea = document.querySelector('.dialog-container textarea, .dialog-wrap textarea, .boss-popup textarea');
    if (modalTextarea && modalTextarea.offsetParent !== null) {
      modalTextarea.focus();
      modalTextarea.value = customGreeting;
      modalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      modalTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(600);

      const sendBtn = document.querySelector('.dialog-container button.btn-sure, .dialog-wrap button.btn-primary, .boss-popup .btn-sure');
      if (sendBtn) {
        sendBtn.click();
        await sleep(800);
      }
    }
  }

  function checkAndResumePipeline() {
    try {
      const raw = sessionStorage.getItem('ziaver_pipeline_boss_state');
      if (!raw) return;
      const state = JSON.parse(raw);
      if (!state || !state.inPipeline) return;
      if (Date.now() - state.timestamp > 300000) {
        sessionStorage.removeItem('ziaver_pipeline_boss_state');
        return;
      }

      chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        const currentSite = res.sites && res.sites[res.currentIndex];
        if (res.isActive && currentSite && currentSite.id === 'boss') {
          logHUD(`<span class="highlight">[跨页续航]</span> 正在恢复全网流水线 (进度: ${state.sessionCount || 0}/${state.target})...`);
          setTimeout(() => {
            startAutopilot(state.target, true, state.sessionCount || 0);
          }, 1500);
        } else {
          sessionStorage.removeItem('ziaver_pipeline_boss_state');
        }
      });
    } catch (e) {
      console.warn('[ZIAVER] 检查续航异常:', e);
    }
  }

  // ================= 全网流水线消息监听 =================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_PIPELINE_RUN') {
      const target = request.target || 10;
      console.log('[ZIAVER Autopilot] BOSS 直聘收到全网流水线启动指令，目标:', target);
      refreshConfig(() => {
        startAutopilot(target, true);
      });
      sendResponse({ status: 'started', platform: 'BOSS直聘' });
      return true;
    } else if (request.type === 'STOP_CRUISE_PIPELINE') {
      stopAutopilot();
      sendResponse({ status: 'stopped' });
      return true;
    }
  });

  if (location.hostname.includes('zhipin.com')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        refreshConfig(() => {
          createHUD();
          startHRReplyWatcher();
          checkAndResumePipeline();
        });
      });
    } else {
      refreshConfig(() => {
        createHUD();
        startHRReplyWatcher();
        checkAndResumePipeline();
      });
    }
  }
})();
