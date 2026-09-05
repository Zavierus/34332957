// ZIAVER 求职自动化助手 - 猎聘网特定化定制巡航模块 v2.2
// 特性：高亮职业词条精准匹配、动态自荐信、投递记录报表记录、跨平台切换

(function () {
  'use strict';

  if (window.__ZIAVER_LIEPIN_AUTOPILOT__) return;
  window.__ZIAVER_LIEPIN_AUTOPILOT__ = true;

  console.log('[ZIAVER Autopilot] 猎聘网定制巡航模块 v2.2 已挂载');

  let isRunning = false;
  let sessionCount = 0;
  let pipelineMode = false;
  let pipelineTarget = 10;
  let activeTags = [];

  let config = {
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
        width: 320px;
        background: rgba(15, 12, 28, 0.96);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(168, 85, 247, 0.4);
        border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(168, 85, 247, 0.2);
        color: #e2e8f0;
        overflow: hidden;
      }
      .hud-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: linear-gradient(90deg, rgba(168, 85, 247, 0.2), rgba(236, 72, 153, 0.05));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
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
      .hud-body {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .stat-val {
        font-size: 18px;
        font-weight: 800;
        color: #c084fc;
      }
      .btn {
        width: 100%;
        padding: 9px 12px;
        border-radius: 8px;
        border: none;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
      }
      .btn-primary {
        background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);
        color: #fff;
      }
      .btn-stop {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
      }
      .log-box {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 10.5px;
        color: #94a3b8;
        background: rgba(0, 0, 0, 0.45);
        padding: 8px 10px;
        border-radius: 6px;
        max-height: 80px;
        overflow-y: auto;
        line-height: 1.4;
        border-left: 2px solid #a855f7;
      }
      .log-box span.highlight { color: #c084fc; }
      .log-box span.success { color: #34d399; }
      .log-box span.skip { color: #64748b; }
      .cross-link {
        font-size: 11px;
        color: #c084fc;
        text-align: right;
        cursor: pointer;
        text-decoration: underline;
      }
    `;

    const hudHtml = document.createElement('div');
    hudHtml.innerHTML = `
      <div class="hud-panel">
        <div class="hud-header">
          <div class="hud-title">
            <span>⚡ ZIAVER 求职巡航</span>
            <span class="hud-tag">猎聘网</span>
          </div>
          <span class="cross-link" id="btn-lp-dashboard">控制后台 ↗</span>
        </div>
        <div class="hud-body">
          <div style="display:flex; justify-content:space-between; background:rgba(255,255,255,0.04); padding:8px 12px; border-radius:8px;">
            <div>
              <div style="font-size:11px; color:#94a3b8;">本次应聘投递</div>
              <div class="stat-val" id="lp-session-count">0</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px; color:#94a3b8;">当前生效词条</div>
              <div class="stat-val" id="lp-tag-count">0</div>
            </div>
          </div>

          <button class="btn btn-primary" id="btn-lp-toggle">
            <span>🚀 开启猎聘定向应聘</span>
          </button>

          <div class="log-box" id="lp-log-stream">
            <div>[猎聘就绪] 点击启动即可开始高亮词条匹配应聘。</div>
          </div>
        </div>
      </div>
    `;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(hudHtml);
    document.body.appendChild(hudContainer);

    shadowRoot.getElementById('btn-lp-dashboard').addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html')
      });
    });

    shadowRoot.getElementById('btn-lp-toggle').addEventListener('click', () => {
      if (!isRunning) {
        startLiepinCruise();
      } else {
        stopLiepinCruise();
      }
    });
  }

  function logHUD(html) {
    const stream = shadowRoot?.getElementById('lp-log-stream');
    if (!stream) return;
    const line = document.createElement('div');
    line.innerHTML = html;
    stream.prepend(line);
    while (stream.children.length > 20) {
      stream.removeChild(stream.lastChild);
    }
  }

  function updateHUD() {
    const sessEl = shadowRoot?.getElementById('lp-session-count');
    const tagCountEl = shadowRoot?.getElementById('lp-tag-count');
    if (sessEl) sessEl.textContent = sessionCount;
    if (tagCountEl) tagCountEl.textContent = activeTags.length;
  }

  async function startLiepinCruise(target = 10, isFromPipeline = false) {
    refreshConfig();
    if (activeTags.length === 0) {
      alert('⚠️ 当前没有高亮选中的生效职业词条！请打开后台管理勾选。');
      return;
    }

    pipelineMode = !!isFromPipeline;
    pipelineTarget = target || 10;
    sessionCount = 0;

    isRunning = true;
    const btn = shadowRoot.getElementById('btn-lp-toggle');
    btn.innerHTML = '<span>🛑 停止巡航</span>';
    btn.className = 'btn btn-stop';
    logHUD(`<span class="highlight">[启动]</span> ${pipelineMode ? `全网流水线模式 (本站目标: ${pipelineTarget})！` : ''}扫描猎聘卡片，校验高亮词条...`);

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
    const btn = shadowRoot?.getElementById('btn-lp-toggle');
    if (btn) {
      btn.innerHTML = '<span>🚀 开启猎聘定向应聘</span>';
      btn.className = 'btn btn-primary';
    }
    logHUD('<span>[结束]</span> 巡航停止。');
  }

  async function runLiepinLoop() {
    while (isRunning) {
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
          updateHUD();

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
