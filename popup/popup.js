// JobCruise 求职自动化助手 - Popup Controller v2.3

document.addEventListener('DOMContentLoaded', () => {
  // 1. Tab 切换逻辑
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabKey = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const target = document.getElementById('tab-' + tabKey);
      if (target) target.classList.add('active');
    });
  });

  // 2. 打开完整后台控制台
  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html') });
  };

  const topOpenBtn = document.getElementById('btn-open-full-dashboard');
  const heroOpenBtn = document.getElementById('btn-hero-dashboard');
  const heroRetroBtn = document.getElementById('btn-hero-retro');
  const heroResumeDepotBtn = document.getElementById('btn-hero-resume-depot');

  if (topOpenBtn) topOpenBtn.addEventListener('click', openDashboard);
  if (heroOpenBtn) heroOpenBtn.addEventListener('click', openDashboard);
  if (heroRetroBtn) {
    heroRetroBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html?tab=view-retrospective') });
    });
  }
  if (heroResumeDepotBtn) {
    heroResumeDepotBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html?tab=view-resume-depot') });
    });
  }

  // 3. 网站快捷前往按钮
  document.querySelectorAll('.launch-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url) {
        chrome.tabs.create({ url });
      }
    });
  });

  // 4. 加载数据与回显
  const todayCountEl = document.getElementById('stat-today-count');
  const dailyLimitEl = document.getElementById('stat-daily-limit');
  const activeTagsEl = document.getElementById('stat-active-tags');

  const inputDailyLimit = document.getElementById('cfg-daily-limit');
  const inputMinDelay = document.getElementById('cfg-min-delay');
  const inputMaxDelay = document.getElementById('cfg-max-delay');
  const inputMinSalary = document.getElementById('cfg-min-salary');
  const inputHrCooldown = document.getElementById('cfg-hr-cooldown');
  const inputBlacklist = document.getElementById('cfg-blacklist');
  const inputTargetCity = document.getElementById('cfg-target-city');
  const inputStrictCity = document.getElementById('cfg-strict-city');
  const inputCampusProtection = document.getElementById('cfg-campus-protection');

  const logListEl = document.getElementById('log-list');

  // 本地日历日期工具函数 (适配时区)
  function getLocalDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  chrome.storage.local.get(['config', 'jobTags', 'applyLog'], (res) => {
    const config = res.config || {};
    const tags = res.jobTags || [];
    const today = getLocalDateStr();

    // 更新统计 Banner
    if (config.lastActiveDate === today) {
      todayCountEl.textContent = config.todayCount || 0;
    } else {
      todayCountEl.textContent = 0;
      config.lastActiveDate = today;
      config.todayCount = 0;
      config.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
      chrome.storage.local.set({ config });
    }
    const currentLimit = config.dailyLimit || 30;
    dailyLimitEl.textContent = currentLimit;

    // 动态同步全网巡航下拉选项与安全上限联动
    const optFollow = document.querySelector('#pipe-target-select option[value="follow_limit"]');
    if (optFollow) {
      optFollow.textContent = `🔄 跟随设定上限 (${currentLimit}个/站)`;
    }

    const activeCount = tags.filter(t => t.active).length;
    activeTagsEl.textContent = activeCount;

    // 回填设置
    if (inputTargetCity) inputTargetCity.value = config.targetCity || '深圳';
    if (inputStrictCity) inputStrictCity.checked = config.strictCityFilter !== false;
    if (inputCampusProtection) inputCampusProtection.checked = config.enableCampus2024Protection !== false;
    if (config.dailyLimit !== undefined) inputDailyLimit.value = config.dailyLimit;
    if (config.minDelaySec !== undefined) inputMinDelay.value = config.minDelaySec;
    if (config.maxDelaySec !== undefined) inputMaxDelay.value = config.maxDelaySec;
    if (config.minSalaryK !== undefined) inputMinSalary.value = config.minSalaryK;
    if (inputHrCooldown) inputHrCooldown.value = (config.hrAlertCooldownMinutes !== undefined && Number(config.hrAlertCooldownMinutes) > 0) ? config.hrAlertCooldownMinutes : 5;
    if (config.blacklistKeywords !== undefined) {
      inputBlacklist.value = config.blacklistKeywords;
    } else {
      inputBlacklist.value = '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,培训生';
    }

    // 回填日志
    renderLogs(res.applyLog || []);
  });

  function renderLogs(logs) {
    if (!logs || logs.length === 0) {
      logListEl.innerHTML = '<div class="empty-log">暂无今日投递记录。<br>可在完整后台查看详细报表与导出表格。</div>';
      return;
    }

    logListEl.innerHTML = '';
    logs.slice(0, 15).forEach(item => {
      const card = document.createElement('div');
      card.className = 'log-card';
      card.innerHTML = `
        <div class="log-header">
          <span>${item.time || ''}</span>
          <span style="color:#00f2fe;">${item.matchedTag || '已匹配'}</span>
        </div>
        <div class="log-company">${item.company || '未知企业'} · <span class="log-title">${item.title || ''}</span></div>
        <div style="color:#94a3b8; font-size:10.5px; margin-top:2px;">薪资: ${item.salary || '面议'} · 平台: ${item.platform || 'BOSS直聘'}</div>
      `;
      logListEl.appendChild(card);
    });
  }

  // 5. 保存快速参数
  document.getElementById('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const newConfig = {
      targetCity: (inputTargetCity ? inputTargetCity.value.trim() : '') || '深圳',
      strictCityFilter: inputStrictCity ? inputStrictCity.checked : true,
      gradYear: '2024',
      enableCampus2024Protection: inputCampusProtection ? inputCampusProtection.checked : true,
      dailyLimit: parseInt(inputDailyLimit.value, 10) || 30,
      minDelaySec: parseInt(inputMinDelay.value, 10) || 9,
      maxDelaySec: parseInt(inputMaxDelay.value, 10) || 15,
      minSalaryK: parseInt(inputMinSalary.value, 10) || 9,
      hrAlertCooldownMinutes: parseInt(inputHrCooldown ? inputHrCooldown.value : '5', 10) || 5,
      blacklistKeywords: inputBlacklist.value.trim()
    };

    chrome.storage.local.get(['config'], (res) => {
      const merged = { ...(res.config || {}), ...newConfig };
      chrome.storage.local.set({ config: merged }, () => {
        const btn = document.getElementById('btn-save-settings');
        const origText = btn.textContent;
        btn.textContent = '✓ 快速设置已更新！';
        btn.style.background = '#10b981';
        setTimeout(() => {
          btn.textContent = origText;
          btn.style.background = '';
        }, 1500);

        dailyLimitEl.textContent = merged.dailyLimit;
        const optFollowUpdate = document.querySelector('#pipe-target-select option[value="follow_limit"]');
        if (optFollowUpdate) {
          optFollowUpdate.textContent = `🔄 跟随设定上限 (${merged.dailyLimit}个/站)`;
        }
      });
    });
  });

  // ================= 6. 全网流水线多平台协同控制 =================
  const pipeStatusTag = document.getElementById('pipe-status-tag');
  const pipeTargetSelect = document.getElementById('pipe-target-select');
  const pipeProgressWrap = document.getElementById('pipe-progress-wrap');
  const pipeLiveText = document.getElementById('pipe-live-text');
  const pipePercentText = document.getElementById('pipe-percent-text');
  const pipeBarFill = document.getElementById('pipe-bar-fill');
  const btnStartPipeline = document.getElementById('btn-start-pipeline');
  const btnStopPipeline = document.getElementById('btn-stop-pipeline');

  function updatePipelineUI(status) {
    if (!status) return;
    if (status.isActive) {
      if (pipeStatusTag) {
        pipeStatusTag.textContent = '🚀 巡航中';
        pipeStatusTag.className = 'pipeline-status-badge active';
      }
      if (btnStartPipeline) btnStartPipeline.style.display = 'none';
      if (btnStopPipeline) btnStopPipeline.style.display = 'flex';
      if (pipeProgressWrap) pipeProgressWrap.style.display = 'block';

      const siteName = status.currentSite?.name || '当前平台';
      const siteCount = status.currentSiteCount || 0;
      const target = status.perSiteTarget || 10;
      const totalSites = (status.sites && status.sites.length) || 3;
      const currentIndex = status.currentIndex || 0;

      if (pipeLiveText) {
        if (status.siteSkipped && status.siteSkipped[status.currentSite?.id]) {
          pipeLiveText.textContent = `第 ${currentIndex + 1}/${totalSites} 站【${siteName}】: ⚠️ ${status.siteSkipped[status.currentSite?.id]} (自动跳过)`;
        } else {
          pipeLiveText.textContent = `第 ${currentIndex + 1}/${totalSites} 站【${siteName}】: ${siteCount}/${target}`;
        }
      }
      
      const pct = status.overallPercent !== undefined ? status.overallPercent : Math.min(Math.round(((currentIndex * target + Math.min(siteCount, target)) / (totalSites * target)) * 100), 100);

      if (pipePercentText) pipePercentText.textContent = `${pct}%`;
      if (pipeBarFill) pipeBarFill.style.width = `${pct}%`;

      const pipeStepsText = document.getElementById('pipe-steps-text');
      if (pipeStepsText && status.sitesStatus) {
        pipeStepsText.textContent = status.sitesStatus.map(s => {
          if (s.skipped) return `${s.name}(跳过)`;
          if (s.isPassed) return `${s.name}(${s.done})✓`;
          if (s.isCurrent) return `${s.name}(${s.done}/${s.target})🚀`;
          return `${s.name}(待启动)`;
        }).join(' → ');
      }
    } else {
      if (pipeStatusTag) {
        pipeStatusTag.textContent = '待命就绪';
        pipeStatusTag.className = 'pipeline-status-badge';
      }
      if (btnStartPipeline) btnStartPipeline.style.display = 'flex';
      if (btnStopPipeline) btnStopPipeline.style.display = 'none';
      if (pipeProgressWrap) pipeProgressWrap.style.display = 'none';
    }
  }

  function fetchPipelineStatus() {
    chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      updatePipelineUI(res);
    });
  }

  if (btnStartPipeline) {
    btnStartPipeline.addEventListener('click', () => {
      const selectedVal = pipeTargetSelect ? pipeTargetSelect.value : 'follow_limit';
      const target = selectedVal === 'follow_limit' ? 'follow_limit' : (parseInt(selectedVal, 10) || 30);
      chrome.runtime.sendMessage({
        type: 'START_CRUISE_PIPELINE',
        perSiteTarget: target
      }, () => {
        fetchPipelineStatus();
      });
    });
  }

  if (btnStopPipeline) {
    btnStopPipeline.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP_CRUISE_PIPELINE' }, () => {
        fetchPipelineStatus();
      });
    });
  }

  // 定时刷新全网流水线状态
  fetchPipelineStatus();
  setInterval(fetchPipelineStatus, 1500);
});
