// ZIAVER 求职自动化助手 - 猎聘网特定化定制巡航模块 v2.3
// 特性：高亮职业词条精准匹配、动态自荐信、投递记录报表记录、3种UI模式切换、跨平台切换

(function () {
  'use strict';

  if (window.__ZIAVER_LIEPIN_AUTOPILOT__) return;
  window.__ZIAVER_LIEPIN_AUTOPILOT__ = true;

  console.log('[ZIAVER Autopilot] 猎聘网定制巡航模块 v2.3 已挂载');

  let isRunning = false;
  let isPaused = false;
  let todayCount = 0;
  let sessionCount = 0;
  let pipelineMode = false;
  let pipelineTarget = 10;
  let activeTags = [];

  let config = {
    dailyLimit: 30,
    minSalaryK: 9,
    blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,保险,推广兼职'
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
          todayCount = config.todayCount || 0;
        } else {
          todayCount = 0;
        }
      }
      if (res && res.jobTags && Array.isArray(res.jobTags)) {
        activeTags = res.jobTags.filter(t => t.active).map(t => t.name.trim());
      } else {
        activeTags = ['达人运营', '电商运营', '游戏运营', '商业摄影', '视觉策划', '综合运营'];
      }
      if (callback) callback();
      updateHUD();
    });
  }

  function generateDynamicNote(title, matchedTag, company) {
    const cleanTitle = (title || '').replace(/[\(（].*?[\)）]/g, '').trim() || title || '这个岗位';
    const cleanCompany = (company || '').trim();

    if (config.useCustomGreeting !== false && config.customGreetingTemplate) {
      let template = config.customGreetingTemplate;
      template = template.replace(/\{jobTitle\}/g, cleanTitle);
      template = template.replace(/\{company\}/g, cleanCompany);
      template = template.replace(/\{matchedTag\}/g, matchedTag || '运营');
      template = template.replace(/\{portfolioUrl\}/g, config.portfolioUrl || '');
      return template;
    }

    return `您好！看到咱们在招「${cleanTitle}」，感觉整体要求跟我还蛮匹配的。我有相关方向的实战经验，执行力强、比较看重数据和落地。简历在附件中，如果合适随时沟通交流，祝您工作顺利、天天开心～`;
  }

  function screenJob(title, salary, company) {
    if (!title) return { pass: false, reason: '未获取到职位标题' };

    // 1. 检查命中高亮职业词条
    let matchedTag = null;
    for (const tag of activeTags) {
      if (title.toLowerCase().includes(tag.toLowerCase())) {
        matchedTag = tag;
        break;
      }
    }

    if (!matchedTag) {
      return { pass: false, reason: `[未选中词条] 「${title}」未命中当前高亮的 ${activeTags.length} 个职业词条` };
    }

    // 2. 黑名单过滤
    const text = (title + ' ' + company).toLowerCase();
    const blacklist = (config.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);
    for (const b of blacklist) {
      if (text.includes(b.toLowerCase())) {
        return { pass: false, reason: `[触发黑名单] 命中词: "${b}"` };
      }
    }

    // 3. 薪资门槛
    const match = salary.match(/(\d+)(?:-(\d+))?K/i);
    if (match) {
      const maxK = match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
      if (maxK < config.minSalaryK) {
        return { pass: false, reason: `[低薪跳过] ${salary} 未达 ${config.minSalaryK}K` };
      }
    }

    return { pass: true, matchedTag };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================= Shadow DOM HUD =================
  let hudContainer = null;
  let shadowRoot = null;

  function createHUD() {
    if (document.getElementById('ziaver-liepin-hud')) return;

    hudContainer = document.createElement('div');
    hudContainer.id = 'ziaver-liepin-hud';
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
        background: rgba(15, 12, 28, 0.96);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(168, 85, 247, 0.45);
        border-radius: 14px;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.65), 0 0 24px rgba(168, 85, 247, 0.2);
        color: #e2e8f0;
        overflow: hidden;
      }
      .hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(90deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.08));
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
        background: rgba(168, 85, 247, 0.25);
        color: #c084fc;
        font-weight: 600;
      }
      .hud-mode-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #e2e8f0;
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .hud-mode-btn:hover {
        background: rgba(168, 85, 247, 0.25);
        color: #c084fc;
        border-color: #c084fc;
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
        color: #c084fc;
        font-variant-numeric: tabular-nums;
      }
      .tag-indicator {
        background: rgba(168, 85, 247, 0.08);
        border: 1px dashed rgba(168, 85, 247, 0.35);
        border-radius: 6px;
        padding: 6px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
      }
      .tag-link {
        color: #c084fc;
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
        background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
        color: #fff;
        box-shadow: 0 4px 14px rgba(168, 85, 247, 0.35);
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
        border-left: 2px solid #a855f7;
      }
      .log-box span.highlight { color: #c084fc; font-weight: 600; }
      .log-box span.success { color: #34d399; font-weight: 600; }
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
        background: #a855f7;
        color: #fff;
      }
      .collapsed { display: none; }
      .pill-badge {
        display: none;
        padding: 8px 14px;
        background: rgba(15, 12, 28, 0.95);
        border: 1px solid #a855f7;
        border-radius: 30px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        color: #c084fc;
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
            <span class="hud-tag">猎聘网</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button class="hud-mode-btn" id="hud-mode-btn" title="切换 精简/完整 模式">⊡ 精简</button>
            <button class="hud-minimize-btn" id="hud-min-btn" title="收起为胶囊">—</button>
          </div>
        </div>
        <div class="hud-body" id="hud-body">
          <div class="compact-stat-row" id="compact-stat-row">
            <span>今日: <b id="compact-val-today" style="color:#c084fc;">0/30</b> | 本次: <b id="compact-val-sess" style="color:#c084fc;">0</b></span>
            <span id="compact-status-tag" style="color:#34d399; font-size:10px;">🟢 就绪</span>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">今日已投 / 上限</div>
              <div class="stat-val" id="val-today-count">0 <span style="font-size:11px; color:#94a3b8;">/ 30</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">本次投递</div>
              <div class="stat-val" id="val-session-count">0</div>
            </div>
          </div>

          <div class="tag-indicator">
            <span>🎯 当前生效词条: <b id="active-tag-count" style="color:#c084fc;">0</b> 个</span>
            <span class="tag-link" id="btn-open-dashboard">打开完整后台管理 ↗</span>
          </div>

          <div class="action-btns">
            <button class="btn btn-primary" id="btn-toggle-run">
              <span>🚀 开启猎聘定向应聘</span>
            </button>
            <button class="btn btn-pause" id="btn-pause-run" style="display: none;">
              <span>⏸ 暂停</span>
            </button>
          </div>

          <div style="margin-top: 6px;">
            <button class="btn btn-secondary" id="btn-lp-open-quickfill" style="width:100%; font-size:11.5px; padding:7px 10px; background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.35); color:#c084fc; border-radius:6px; cursor:pointer;">
              <span>📋 展开简历速填小抽屉</span>
            </button>
          </div>

          <div class="log-box" id="hud-log-stream">
            <div>[猎聘就绪] 点击启动即可开始高亮词条匹配应聘。</div>
          </div>

          <div class="cross-site-bar">
            <div class="cross-title">
              <span>🌐 切换目标网站</span>
              <span style="color:#34d399; font-size:10px;">🟢 巡航互联就绪</span>
            </div>
            <div class="site-chips">
              <button class="site-chip-btn" data-url="https://www.zhipin.com/web/geek/job" style="border-color:#00f2fe; color:#00f2fe;">BOSS直聘</button>
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
        ⚡ 猎聘巡航 (<span id="pill-count">0</span>/<span id="pill-limit">30</span>)
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
    shadowRoot.getElementById('btn-lp-open-quickfill')?.addEventListener('click', () => {
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
        startLiepinCruise();
      } else {
        stopLiepinCruise();
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
        if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#c084fc'; }
        logHUD('<span class="success">[已继续]</span> 恢复应聘');
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
    while (stream.children.length > 25) {
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
      todayEl.innerHTML = `${todayCount} <span style="font-size:11px; color:#94a3b8;">/ ${limit}</span>`;
    }
    if (sessEl) sessEl.textContent = sessionCount;
    if (pillCount) pillCount.textContent = todayCount;
    if (pillLimit) pillLimit.textContent = limit;
    if (tagCountEl) tagCountEl.textContent = activeTags.length;
    if (compactToday) compactToday.textContent = `${todayCount}/${limit}`;
    if (compactSess) compactSess.textContent = sessionCount;
  }

  async function startLiepinCruise(target = 10, isFromPipeline = false) {
    refreshConfig();
    if (todayCount >= (config.dailyLimit || 30)) {
      alert(`⚠️ 今日已达到设定的安全投递上限 (${config.dailyLimit || 30} 次)！\n为保护账号安全，自动停止投递。可在后台调整上限。`);
      return;
    }

    if (activeTags.length === 0) {
      alert('⚠️ 当前没有高亮选中的生效职业词条！请打开后台管理勾选。');
      return;
    }

    pipelineMode = !!isFromPipeline;
    pipelineTarget = target || 10;
    sessionCount = 0;

    isRunning = true;
    isPaused = false;
    const btn = shadowRoot.getElementById('btn-toggle-run');
    const btnPause = shadowRoot.getElementById('btn-pause-run');
    const statusTag = shadowRoot.getElementById('compact-status-tag');
    if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#c084fc'; }
    btn.innerHTML = '<span>🛑 停止巡航</span>';
    btn.className = 'btn btn-stop';
    btnPause.style.display = 'flex';

    logHUD(`<span class="highlight">[启动]</span> ${pipelineMode ? `全网流水线模式 (本站目标: ${pipelineTarget})！` : ''}开始扫描卡片，校验高亮词条...`);

    try {
      await runLiepinLoop();
    } catch (err) {
      console.error(err);
      logHUD(`<span class="skip">[中断] ${err.message || err}</span>`);
    } finally {
      const wasPipeline = pipelineMode;
      const finalCount = sessionCount;
      stopLiepinCruise();
      if (wasPipeline) {
        logHUD(`<span class="highlight">[本站目标达成]</span> 已完成 ${finalCount} 个，汇报至全网巡航中枢...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_FINISHED',
          site: 'liepin',
          count: finalCount
        });
      }
    }
  }

  function stopLiepinCruise() {
    isRunning = false;
    isPaused = false;
    const btn = shadowRoot?.getElementById('btn-toggle-run');
    const btnPause = shadowRoot?.getElementById('btn-pause-run');
    const statusTag = shadowRoot?.getElementById('compact-status-tag');
    if (statusTag) { statusTag.textContent = '🟢 就绪'; statusTag.style.color = '#34d399'; }
    if (btn) {
      btn.innerHTML = '<span>🚀 开启猎聘定向应聘</span>';
      btn.className = 'btn btn-primary';
    }
    if (btnPause) {
      btnPause.style.display = 'none';
      btnPause.innerHTML = '<span>⏸ 暂停</span>';
    }
    logHUD('<span>[结束]</span> 巡航停止。');
  }

  async function runLiepinLoop() {
    while (isRunning) {
      if (isPaused) {
        await sleep(1000);
        continue;
      }

      if (todayCount >= (config.dailyLimit || 30)) {
        logHUD(`<span class="highlight">[上限熔断]</span> 今日已达安全上限 ${config.dailyLimit || 30} 个！建议切换至其他平台。`);
        break;
      }

      if (pipelineMode && sessionCount >= pipelineTarget) {
        logHUD(`<span class="highlight">[本站目标达成]</span> 已完成猎聘设定的本站目标 (${sessionCount}/${pipelineTarget})！`);
        break;
      }

      let cards = document.querySelectorAll('.job-card-pc-container, .job-list-item, [data-nick="job-card"]');
      if (!cards || cards.length === 0) {
        window.scrollBy({ top: 500, behavior: 'smooth' });
        await sleep(2500);
        cards = document.querySelectorAll('.job-card-pc-container, .job-list-item, [data-nick="job-card"]');
      }

      if (!cards || cards.length === 0) {
        logHUD('<span class="skip">未找到职位卡片，请确保在猎聘职位列表页。</span>');
        break;
      }

      for (let i = 0; i < cards.length; i++) {
        if (!isRunning) break;
        while (isPaused) {
          await sleep(1000);
          if (!isRunning) break;
        }
        if (!isRunning) break;

        if (todayCount >= (config.dailyLimit || 30)) break;
        if (pipelineMode && sessionCount >= pipelineTarget) break;

        const card = cards[i];
        if (card.dataset.ziaverHandled === 'true') continue;
        card.dataset.ziaverHandled = 'true';

        const titleEl = card.querySelector('.job-title, .title-text, .ellipsis-1');
        const salaryEl = card.querySelector('.job-salary, .salary');
        const companyEl = card.querySelector('.company-name, .company-info-title');

        const title = titleEl ? titleEl.textContent.trim() : '';
        const salary = salaryEl ? salaryEl.textContent.trim() : '';
        const company = companyEl ? companyEl.textContent.trim() : '';

        const screenResult = screenJob(title, salary, company);
        if (!screenResult.pass) {
          logHUD(`<span class="skip">${screenResult.reason}</span>`);
          continue;
        }

        const matchedTag = screenResult.matchedTag;

        // 寻找“应聘”或“立即沟通”
        let applyBtn = null;
        const buttons = card.querySelectorAll('button, a, span');
        for (const b of buttons) {
          const txt = b.textContent.trim();
          if (txt === '应聘' || txt === '立即应聘' || txt === '极速应聘' || txt === '打招呼') {
            applyBtn = b;
            break;
          }
          if (txt === '已应聘' || txt === '已沟通') {
            applyBtn = null;
            break;
          }
        }

        if (applyBtn) {
          const noteText = generateDynamicNote(title, matchedTag, company);
          logHUD(`<span class="highlight">[命中词条: ${matchedTag}]</span> ${company} · ${title} (${salary})`);
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(1000);

          applyBtn.click();
          await sleep(1200);

          const confirmBtn = document.querySelector('.ant-modal-content button.ant-btn-primary, .react-modal button.btn-primary');
          if (confirmBtn) {
            confirmBtn.click();
            await sleep(800);
          }

          sessionCount++;
          todayCount++;
          updateHUD();

          // 持久化今日统计
          if (chrome.storage && chrome.storage.local) {
            const today = new Date().toISOString().split('T')[0];
            chrome.storage.local.set({
              config: { ...config, todayCount, lastActiveDate: today }
            });
          }

          chrome.runtime.sendMessage({
            type: 'APPLY_LOG',
            data: {
              platform: '猎聘网',
              company,
              title,
              salary,
              matchedTag,
              greeting: noteText,
              status: '已应聘'
            }
          });

          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_PROGRESS',
              site: 'liepin',
              count: sessionCount
            });
          }

          logHUD(`<span class="success">[应聘成功]</span> 已记录到报表表格！`);

          const delay = Math.floor(Math.random() * 6000) + 8000;
          await sleep(delay);
        }
      }

      const nextPage = document.querySelector('.ant-pagination-next:not(.ant-pagination-disabled) button, a.pagination-next');
      if (nextPage) {
        nextPage.click();
        await sleep(3500);
      } else {
        break;
      }
    }
  }

  // ================= 全网流水线消息监听 =================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_PIPELINE_RUN') {
      const target = request.target || 10;
      console.log('[ZIAVER Autopilot] 猎聘网收到全网流水线启动指令，目标:', target);
      refreshConfig(() => {
        startLiepinCruise(target, true);
      });
      sendResponse({ status: 'started', platform: '猎聘网' });
      return true;
    } else if (request.type === 'STOP_CRUISE_PIPELINE') {
      stopLiepinCruise();
      sendResponse({ status: 'stopped' });
      return true;
    }
  });

  if (location.hostname.includes('liepin.com')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        refreshConfig(createHUD);
      });
    } else {
      refreshConfig(createHUD);
    }
  }
})();
