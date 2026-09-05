// ZIAVER 求职自动化助手 - 拉勾招聘特定化定制巡航引擎 v2.3
// 特性：高亮职业词条精准匹配、动态温和话术、防风控拟人延时、全网流水线协同

(function () {
  'use strict';

  if (window.__ZIAVER_LAGOU_AUTOPILOT__) return;
  window.__ZIAVER_LAGOU_AUTOPILOT__ = true;

  console.log('[ZIAVER Autopilot] 拉勾招聘智能巡航模块 v2.3 已挂载');

  let isRunning = false;
  let isPaused = false;
  let todayCount = 0;
  let sessionCount = 0;
  let pipelineMode = false;
  let pipelineTarget = 10;
  let activeTags = [];

  let config = {
    dailyLimit: 30,
    minDelaySec: 9,
    maxDelaySec: 15,
    minSalaryK: 9,
    blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,培训生,保险',
    enableDynamicGreeting: true,
    useCustomGreeting: true,
    customGreetingTemplate: '您好！看到咱们在招「{jobTitle}」，感觉整体要求跟我还蛮匹配的。我有相关业务实战经验，执行力强、看重数据和实际业务落地。简历在附件中，如果合适随时沟通交流，祝您工作顺利、天天开心～'
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
          todayCount = counts.lagou !== undefined ? counts.lagou : 0;
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

  // ================= 动态自荐话术拼装 =================
  function synthesizeGreeting(title, matchedTag, company) {
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

  // ================= 职位强规则筛选 =================
  function screenJobCard(card) {
    const titleEl = card.querySelector('[class*="position-name"], [class*="title"], h3, .p-top__1F7CL a, a.position_link');
    const salaryEl = card.querySelector('[class*="money__"], [class*="salary"], .money');
    const companyEl = card.querySelector('[class*="company-name__"], [class*="company_name"], .company-name');
    const descEl = card.querySelector('[class*="irrelevant-desc"], [class*="desc__"], [class*="industry"], .job-desc');

    const title = titleEl ? titleEl.textContent.trim() : '';
    const salary = salaryEl ? salaryEl.textContent.trim() : '';
    const company = companyEl ? companyEl.textContent.trim() : '';
    const desc = descEl ? descEl.textContent.trim() : '';

    if (!title) return { pass: false, reason: '未获取到职位名称' };

    // 1. 检查命中高亮职业词条
    let matchedTag = null;
    for (const tag of activeTags) {
      if (title.toLowerCase().includes(tag.toLowerCase())) {
        matchedTag = tag;
        break;
      }
    }

    if (!matchedTag) {
      return { pass: false, reason: `[未选中词条] 「${title}」未命中高亮勾选的 ${activeTags.length} 个职业词条` };
    }

    // 2. 黑名单过滤
    const fullText = (title + ' ' + company + ' ' + desc).toLowerCase();
    const blacklist = (config.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);
    for (const word of blacklist) {
      if (fullText.includes(word.toLowerCase())) {
        return { pass: false, reason: `[触发黑名单] 命中词: "${word}" (${company})` };
      }
    }

    // 3. 经验年限过长过滤 (跳过5年以上)
    if (/5-10年|10年以上|8-10年|8年以上|5年以上/i.test(desc)) {
      return { pass: false, reason: `[经验要求过高跳过] ${desc}` };
    }

    // 4. 薪资门槛过滤
    const match = salary.match(/(\d+)(?:-(\d+))?K/i);
    if (match) {
      const maxK = match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
      if (maxK < config.minSalaryK) {
        return { pass: false, reason: `[低薪跳过] ${salary} 未达门槛 ${config.minSalaryK}K` };
      }
    }

    return {
      pass: true,
      data: { title, salary, company, desc, matchedTag }
    };
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
      playTone(523.25, 0, 0.18);
      playTone(783.99, 0.2, 0.35);
    } catch (e) {
      console.warn(e);
    }
  }

  // ================= Shadow DOM HUD 控制台 =================
  let hudContainer = null;
  let shadowRoot = null;

  function createHUD() {
    if (document.getElementById('ziaver-lagou-hud')) return;

    hudContainer = document.createElement('div');
    hudContainer.id = 'ziaver-lagou-hud';
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
        background: rgba(10, 25, 20, 0.96);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border: 1px solid rgba(16, 185, 129, 0.45);
        border-radius: 14px;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.65), 0 0 24px rgba(16, 185, 129, 0.2);
        color: #e2e8f0;
        overflow: hidden;
      }
      .hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(90deg, rgba(16, 185, 129, 0.2), rgba(6, 182, 212, 0.08));
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
        background: rgba(16, 185, 129, 0.25);
        color: #34d399;
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
        background: rgba(16, 185, 129, 0.25);
        color: #34d399;
        border-color: #34d399;
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
      .hud-panel.compact .pipeline-badge,
      .hud-panel.compact .tag-indicator,
      .hud-panel.compact .cross-site-bar,
      .hud-panel.compact .hud-log-box {
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
        color: #34d399;
        font-variant-numeric: tabular-nums;
      }
      .pipeline-badge {
        background: rgba(16, 185, 129, 0.15);
        border: 1px solid rgba(16, 185, 129, 0.3);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 11px;
        color: #6ee7b7;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .tag-indicator {
        background: rgba(16, 185, 129, 0.08);
        border: 1px dashed rgba(16, 185, 129, 0.35);
        border-radius: 6px;
        padding: 6px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
      }
      .tag-link {
        color: #34d399;
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
        transition: all 0.2s;
      }
      .btn-primary {
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: #fff;
        box-shadow: 0 4px 14px rgba(16, 185, 129, 0.35);
      }
      .btn-pause {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
        border: 1px solid rgba(245, 158, 11, 0.3);
      }
      .btn-stop {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: #fff;
      }
      .btn-secondary {
        background: rgba(255, 255, 255, 0.08);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .hud-log-box {
        background: rgba(0, 0, 0, 0.35);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 11px;
        line-height: 1.5;
        height: 95px;
        overflow-y: auto;
        color: #cbd5e1;
        font-family: monospace;
      }
      .hud-log-box span.highlight { color: #34d399; font-weight: bold; }
      .hud-log-box span.skip { color: #64748b; }
      .hud-log-box span.success { color: #10b981; font-weight: bold; }
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
        background: #10b981;
        color: #0b0f19;
      }
      .collapsed { display: none; }
      .pill-badge {
        display: none;
        padding: 8px 14px;
        background: rgba(10, 25, 20, 0.95);
        border: 1px solid #10b981;
        border-radius: 30px;
        cursor: pointer;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        color: #34d399;
        font-size: 12px;
        font-weight: 700;
      }
    `;

    const hudHtml = document.createElement('div');
    hudHtml.innerHTML = `
      <div class="hud-panel" id="hud-main">
        <div class="hud-header" id="hud-drag-handle">
          <div class="hud-title-wrap">
            <span style="font-size:14px;">⚡</span>
            <span class="hud-title">ZIAVER 求职巡航</span>
            <span class="hud-tag">拉勾招聘</span>
          </div>
          <div style="display:flex; align-items:center; gap:4px;">
            <button class="hud-mode-btn" id="hud-mode-btn" title="切换 精简/完整 模式">⊡ 精简</button>
            <button class="hud-minimize-btn" id="btn-minimize-hud" title="收起为胶囊">—</button>
          </div>
        </div>
        <div class="hud-body" id="hud-body-content">
          <div class="compact-stat-row" id="compact-stat-row">
            <span>今日: <b id="compact-val-today" style="color:#34d399;">0/30</b> | 本次: <b id="compact-val-sess" style="color:#34d399;">0</b></span>
            <span id="compact-status-tag" style="color:#10b981; font-size:10px;">🟢 就绪</span>
          </div>

          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">今日已投 / 上限</div>
              <div class="stat-val" id="val-today-count">0 <span style="font-size:11px; color:#94a3b8;">/ 30</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">本次巡航已投</div>
              <div class="stat-val" id="hud-session-count">0</div>
            </div>
          </div>

          <div class="tag-indicator">
            <span>🎯 当前生效词条: <b id="hud-active-tags" style="color:#34d399;">0</b> 个</span>
            <span class="tag-link" id="btn-open-dashboard">打开完整后台管理 ↗</span>
          </div>

          <div class="pipeline-badge" id="hud-pipeline-indicator" style="display:none;">
            <span>🌐 全网流水线协同模式</span>
            <span id="hud-pipeline-target-info">目标: 10</span>
          </div>

          <div class="action-btns">
            <button class="btn btn-primary" id="btn-toggle-run">
              <span>🚀 开启拉勾投递</span>
            </button>
            <button class="btn btn-pause" id="btn-pause-run" style="display:none; max-width:80px;">
              <span>⏸ 暂停</span>
            </button>
          </div>

          <div style="margin-top: 4px;">
            <button class="btn btn-secondary" id="btn-lagou-open-quickfill" style="width:100%; font-size:11.5px; padding:7px 10px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); color:#34d399; border-radius:6px; cursor:pointer;">
              <span>📋 展开简历速填小抽屉</span>
            </button>
          </div>

          <div class="hud-log-box" id="hud-log-scroll">
            <div style="color:#94a3b8;">[就绪] 严格匹配高亮词条与9K起薪，点击开启或由全网流水线调用。</div>
          </div>

          <div class="cross-site-bar">
            <div class="cross-title">
              <span>🌐 切换目标网站</span>
              <span style="color:#10b981; font-size:10px;">🟢 巡航互联就绪</span>
            </div>
            <div class="site-chips">
              <button class="site-chip-btn" data-url="https://www.zhipin.com/web/geek/job" style="border-color:#00f2fe; color:#00f2fe;">BOSS直聘</button>
              <button class="site-chip-btn" data-url="https://www.liepin.com/zhaopin/?city=050090" style="border-color:#a855f7; color:#c084fc;">猎聘网</button>
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
        ⚡ 拉勾巡航 (<span id="pill-count">0</span>/<span id="pill-limit">30</span>)
      </div>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(hudHtml);
    document.body.appendChild(hudContainer);

    // 绑定事件
    const btnToggle = shadowRoot.getElementById('btn-toggle-run');
    const btnPause = shadowRoot.getElementById('btn-pause-run');
    const btnMin = shadowRoot.getElementById('btn-minimize-hud');
    const modeBtn = shadowRoot.getElementById('hud-mode-btn');
    const hudMain = shadowRoot.getElementById('hud-main');
    const pillBadge = shadowRoot.getElementById('hud-pill-badge');

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

    btnMin.addEventListener('click', (e) => {
      e.stopPropagation();
      applyHUDMode('mini');
    });

    pillBadge.addEventListener('click', () => {
      const restoreMode = localStorage.getItem('jobcruise_hud_mode') || 'full';
      applyHUDMode(restoreMode);
    });

    // 打开全功能后台管理页
    shadowRoot.getElementById('btn-open-dashboard')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html')
      });
    });

    // 展开简历速填小抽屉
    shadowRoot.getElementById('btn-lagou-open-quickfill')?.addEventListener('click', () => {
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
      if (isRunning) {
        stopAutopilot();
      } else {
        startAutopilot(config.dailyLimit || 30);
      }
    });

    btnPause.addEventListener('click', () => {
      isPaused = !isPaused;
      const statusTag = shadowRoot.getElementById('compact-status-tag');
      btnPause.innerHTML = isPaused ? '<span>▶ 继续</span>' : '<span>⏸ 暂停</span>';
      if (isPaused) {
        if (statusTag) { statusTag.textContent = '⏸ 暂停中'; statusTag.style.color = '#f59e0b'; }
      } else {
        if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#34d399'; }
      }
      logHUD(isPaused ? '<span class="skip">[已暂停] 等待指令继续...</span>' : '<span>[恢复] 继续巡航扫描...</span>');
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

    updateHUD();
  }

  function updateHUD() {
    if (!shadowRoot) return;
    const sessionEl = shadowRoot.getElementById('hud-session-count');
    const tagsEl = shadowRoot.getElementById('hud-active-tags');
    const todayEl = shadowRoot.getElementById('val-today-count');
    const pillCount = shadowRoot.getElementById('pill-count');
    const pillLimit = shadowRoot.getElementById('pill-limit');
    const compactToday = shadowRoot.getElementById('compact-val-today');
    const compactSess = shadowRoot.getElementById('compact-val-sess');

    const limit = config.dailyLimit || 30;
    if (sessionEl) sessionEl.textContent = sessionCount;
    if (tagsEl) tagsEl.textContent = activeTags.length;
    if (todayEl) todayEl.innerHTML = `${todayCount} <span style="font-size:11px; color:#94a3b8;">/ ${limit}</span>`;
    if (pillCount) pillCount.textContent = todayCount;
    if (pillLimit) pillLimit.textContent = limit;
    if (compactToday) compactToday.textContent = `${todayCount}/${limit}`;
    if (compactSess) compactSess.textContent = sessionCount;

    const pipeInd = shadowRoot.getElementById('hud-pipeline-indicator');
    const pipeInfo = shadowRoot.getElementById('hud-pipeline-target-info');
    if (pipeInd && pipeInfo) {
      if (pipelineMode) {
        pipeInd.style.display = 'flex';
        pipeInfo.textContent = `本站进度: ${sessionCount}/${pipelineTarget}`;
      } else {
        pipeInd.style.display = 'none';
      }
    }
  }

  function logHUD(htmlMsg) {
    if (!shadowRoot) return;
    const logBox = shadowRoot.getElementById('hud-log-scroll');
    if (!logBox) return;
    const item = document.createElement('div');
    const time = new Date().toTimeString().split(' ')[0];
    item.innerHTML = `<span style="color:#64748b;">${time}</span> ${htmlMsg}`;
    logBox.appendChild(item);
    logBox.scrollTop = logBox.scrollHeight;
  }

  // ================= 拉勾登录态智能识别 =================
  function checkIsLoggedIn() {
    // 1. URL 检测
    if (location.hostname.includes('passport.lagou.com') || location.pathname.includes('/login')) {
      return false;
    }
    // 2. 存在显式登录/注册按钮
    const loginBtns = document.querySelectorAll('a[href*="passport.lagou.com/login"], .login-btn, .unlogin-box, .header-login, .login_btn, [data-lg-tj-id="header_login"]');
    for (const btn of loginBtns) {
      if (btn.offsetParent !== null && (btn.textContent.includes('登录') || btn.textContent.includes('注册'))) {
        return false;
      }
    }
    // 3. 弹出了登录弹窗/二维码
    const loginModal = document.querySelector('.login-modal, #lg_login, .passport-login-container, .modal-login, .modal-dialog .login-box');
    if (loginModal && loginModal.offsetParent !== null) {
      return false;
    }
    // 4. 登录特征元素检测（个人下拉/头像/用户名）
    const loggedInIndicators = document.querySelectorAll('.user_dropdown, .user-avatar, .user-info, .avatar_wrap, .login-success');
    if (loggedInIndicators.length > 0) {
      return true;
    }
    return true;
  }

  let isSkipped = false;

  // ================= 巡航运行逻辑 =================
  async function startAutopilot(targetCount = 10, isFromPipeline = false) {
    if (isRunning) return;
    refreshConfig();
    isSkipped = false;

    // 智能登录态检测
    if (!checkIsLoggedIn()) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD('<span class="highlight" style="color:#f59e0b;">[未登录检测]</span> 未检测到拉勾登录状态，全网流水线自动跳过本站...');
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'lagou',
          reason: '未登录账号'
        });
        return;
      } else {
        alert('⚠️ 检测到您尚未登录拉勾招聘（或会话已过期）！\n请先在页面右上角登录后再开启自动巡航。');
        return;
      }
    }

    if (todayCount >= (config.dailyLimit || 30)) {
      alert(`⚠️ 今日已达到设定的安全投递上限 (${config.dailyLimit || 30} 次)！\n为保护账号安全，自动停止投递。可在后台调整上限。`);
      return;
    }

    if (activeTags.length === 0) {
      alert('⚠️ 当前没有高亮选中的生效职业词条！请打开后台管理勾选。');
      return;
    }

    pipelineMode = isFromPipeline;
    pipelineTarget = targetCount || (config.dailyLimit || 30);

    isRunning = true;
    isPaused = false;
    sessionCount = 0;

    const btnToggle = shadowRoot?.getElementById('btn-toggle-run');
    const btnPause = shadowRoot?.getElementById('btn-pause-run');
    const statusTag = shadowRoot?.getElementById('compact-status-tag');
    if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#34d399'; }
    if (btnToggle) {
      btnToggle.innerHTML = '<span>🛑 停止巡航</span>';
      btnToggle.className = 'btn btn-stop';
    }
    if (btnPause) {
      btnPause.style.display = 'flex';
    }

    updateHUD();
    logHUD(`<span class="highlight">[拉勾巡航启动]</span> 目标数量: ${pipelineTarget} 个，当前生效词条: ${activeTags.slice(0, 4).join(', ')} 等 ${activeTags.length} 个`);

    try {
      await runLagouLoop();
    } catch (err) {
      console.error(err);
      logHUD(`<span class="highlight" style="color:#ef4444;">[异常中断]</span> ${err.message || err}`);
    } finally {
      const wasPipeline = pipelineMode;
      const finalCount = sessionCount;
      stopAutopilot();

      if (wasPipeline && !isSkipped) {
        logHUD(`<span class="success">[本站目标达成]</span> 已完成 ${finalCount} 个，汇报至全网巡航中枢...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_FINISHED',
          site: 'lagou',
          count: finalCount
        });
      }
    }
  }

  function stopAutopilot() {
    isRunning = false;
    isPaused = false;
    const btnToggle = shadowRoot?.getElementById('btn-toggle-run');
    const btnPause = shadowRoot?.getElementById('btn-pause-run');
    const statusTag = shadowRoot?.getElementById('compact-status-tag');
    if (statusTag) { statusTag.textContent = '🟢 就绪'; statusTag.style.color = '#10b981'; }
    if (btnToggle) {
      btnToggle.innerHTML = '<span>🚀 开启拉勾投递</span>';
      btnToggle.className = 'btn btn-primary';
    }
    if (btnPause) {
      btnPause.style.display = 'none';
      btnPause.innerHTML = '<span>⏸ 暂停</span>';
    }
    logHUD('<span>[巡航结束]</span> 拉勾巡航已停止。');
  }

  async function runLagouLoop() {
    while (isRunning) {
      if (isPaused) {
        await sleep(1000);
        continue;
      }

      if (sessionCount >= pipelineTarget) {
        logHUD(`<span class="highlight">[目标达成]</span> 本站已投递 ${sessionCount}/${pipelineTarget} 个！`);
        break;
      }

      // 获取拉勾职位卡片选择器集合
      let jobCards = document.querySelectorAll(
        '.item__10RTO, .job-card-box, [class*="item__"], .list__3By4c > div, [class*="job-item"], [data-lg-tj-id="item"]'
      );

      if (!jobCards || jobCards.length === 0) {
        window.scrollBy({ top: 450, behavior: 'smooth' });
        await sleep(2500);
        jobCards = document.querySelectorAll(
          '.item__10RTO, .job-card-box, [class*="item__"], .list__3By4c > div, [class*="job-item"], [data-lg-tj-id="item"]'
        );
      }

      if (!jobCards || jobCards.length === 0) {
        if (!checkIsLoggedIn()) {
          isSkipped = true;
          logHUD('<span class="highlight" style="color:#f59e0b;">[未登录检测]</span> 拉勾页面为未登录状态，全网流水线自动跳过本站...');
          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_SKIPPED',
              site: 'lagou',
              reason: '未登录账号'
            });
          }
          break;
        }
        logHUD('<span class="skip">当前未检测到职位卡片，请确保在拉勾深圳职位列表页。</span>');
        break;
      }

      for (let i = 0; i < jobCards.length; i++) {
        if (!isRunning) break;
        while (isPaused) await sleep(1000);
        if (sessionCount >= pipelineTarget) break;

        if (!checkIsLoggedIn()) {
          isSkipped = true;
          logHUD('<span class="highlight" style="color:#ef4444;">[登录态失效]</span> 检测到登录弹窗，已安全跳过本站...');
          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_SKIPPED',
              site: 'lagou',
              reason: '弹出登录弹窗'
            });
          }
          break;
        }

        const card = jobCards[i];
        if (card.dataset.ziaverHandled === 'true') continue;
        card.dataset.ziaverHandled = 'true';

        // 强规则校验
        const screenResult = screenJobCard(card);
        if (!screenResult.pass) {
          logHUD(`<span class="skip">${screenResult.reason}</span>`);
          continue;
        }

        const { title, salary, company, desc, matchedTag } = screenResult.data;

        // 寻找卡片上的“立即沟通”或“聊一聊”或“投递”按钮
        let btnChat = null;
        const allBtns = card.querySelectorAll('a, button, span');
        for (const b of allBtns) {
          const txt = b.textContent.trim();
          if (txt === '立即沟通' || txt === '聊一聊' || txt === '打招呼' || txt === '投递简历') {
            btnChat = b;
            break;
          }
          if (txt === '继续沟通' || txt === '已沟通' || txt === '已投递') {
            btnChat = null;
            break;
          }
        }

        // 若卡片上未直接露出按钮，尝试移入悬浮或点击卡片触发详情侧栏
        if (!btnChat) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const evt = new MouseEvent('mouseover', { bubbles: true });
          card.dispatchEvent(evt);
          await sleep(600);

          const hoveredBtns = card.querySelectorAll('a, button, span');
          for (const b of hoveredBtns) {
            const txt = b.textContent.trim();
            if (txt === '立即沟通' || txt === '聊一聊' || txt === '投递简历') {
              btnChat = b;
              break;
            }
          }
        }

        if (btnChat) {
          const greetingText = synthesizeGreeting(title, matchedTag, company);

          logHUD(`<span class="highlight">[命中词条: ${matchedTag}]</span> ${company} · ${title} (${salary})`);
          logHUD(`<span class="skip" style="color:#6ee7b7;">合成自然话术: "${greetingText.slice(0, 30)}..."</span>`);

          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(800);

          btnChat.click();
          playDoubleChime();

          // 尝试处理可能弹出的打招呼输入弹窗或确认按钮
          await handleLagouModal(greetingText);

          sessionCount++;
          todayCount++;
          updateHUD();

          // 持久化今日统计 (拉勾独立计数)
          if (chrome.storage && chrome.storage.local) {
            const today = new Date().toISOString().split('T')[0];
            const siteCounts = config.siteTodayCounts || { boss: 0, liepin: 0, lagou: 0, ats: 0 };
            siteCounts.lagou = todayCount;
            const totalCount = Object.values(siteCounts).reduce((a, b) => a + (Number(b) || 0), 0);
            chrome.storage.local.set({
              config: { ...config, todayCount: totalCount, siteTodayCounts: siteCounts, lastActiveDate: today }
            });
          }

          // 记录至后台投递中心
          chrome.runtime.sendMessage({
            type: 'APPLY_LOG',
            data: {
              platform: '拉勾招聘',
              company,
              title,
              salary,
              matchedTag,
              greeting: greetingText,
              status: '已沟通'
            }
          });

          // 向流水线汇报实时进度
          chrome.runtime.sendMessage({
            type: 'PIPELINE_SITE_PROGRESS',
            site: 'lagou',
            count: sessionCount
          });

          logHUD(`<span class="success">[投递成功]</span> 已记录到报表表格！`);

          const delayMs = getRandomDelayMs();
          logHUD(`<span class="skip">拟人化等待 ${(delayMs / 1000).toFixed(1)} 秒防风控...</span>`);
          await sleep(delayMs);
        }
      }

      // 翻页处理
      if (isRunning && !isPaused && sessionCount < pipelineTarget) {
        logHUD('<span>[翻页检测]</span> 尝试翻到下一页...');
        const nextPageBtn = document.querySelector(
          '.ant-pagination-next:not(.ant-pagination-disabled) button, a.pagination-next, [class*="pagination-next"]'
        );
        if (nextPageBtn) {
          nextPageBtn.click();
          await sleep(4000);
        } else {
          window.scrollBy({ top: 800, behavior: 'smooth' });
          await sleep(3500);
          // 若到底无下一页，停止循环
          const endEl = document.querySelector('.ant-pagination-disabled, [class*="no-more"]');
          if (endEl) {
            logHUD('<span>[已至末页]</span> 没有更多符合条件的岗位。');
            break;
          }
        }
      }
    }
  }

  async function handleLagouModal(greetingText) {
    await sleep(1000);
    const modalTextarea = document.querySelector('.ant-modal-content textarea, [class*="dialog"] textarea, [class*="modal"] textarea');
    if (modalTextarea && modalTextarea.offsetParent !== null) {
      modalTextarea.focus();
      modalTextarea.value = greetingText;
      modalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      modalTextarea.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(600);

      const confirmBtn = document.querySelector('.ant-modal-content button.ant-btn-primary, [class*="dialog"] button.btn-primary');
      if (confirmBtn) {
        confirmBtn.click();
        await sleep(800);
      }
    }
  }

  // ================= 消息总线监听 =================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_PIPELINE_RUN') {
      const target = request.target || 10;
      console.log('[ZIAVER Autopilot] 收到全网流水线启动指令，拉勾目标:', target);
      refreshConfig(() => {
        startAutopilot(target, true);
      });
      sendResponse({ status: 'started', platform: '拉勾招聘' });
      return true;
    } else if (request.type === 'STOP_CRUISE_PIPELINE') {
      stopAutopilot();
      sendResponse({ status: 'stopped' });
      return true;
    }
  });

  // 页面挂载启动
  if (location.hostname.includes('lagou.com')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        refreshConfig(createHUD);
      });
    } else {
      refreshConfig(createHUD);
    }
  }
})();
