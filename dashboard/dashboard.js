// JobCruise 求职自动化后台控制中心 Controller v2.3

document.addEventListener('DOMContentLoaded', () => {
  // 1. 侧边栏导航切换
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanels = document.querySelectorAll('.view-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.getAttribute('data-view');
      navItems.forEach(n => n.classList.remove('active'));
      viewPanels.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const panel = document.getElementById(targetView);
      if (panel) panel.classList.add('active');
    });
  });

  // 检查 URL 是否指定直接打开某个视图 (例如 ?tab=view-resume-depot 或 #view-resume-depot 或 #daily-digest)
  const urlParams = new URLSearchParams(window.location.search);
  let targetViewName = urlParams.get('tab') || window.location.hash.replace('#', '');
  if (targetViewName === 'daily-digest') targetViewName = 'view-daily-digest';
  if (targetViewName) {
    const targetNavItem = document.querySelector(`.nav-item[data-view="${targetViewName}"]`);
    if (targetNavItem) {
      targetNavItem.click();
    }
  }

  window.addEventListener('hashchange', () => {
    let hash = window.location.hash.replace('#', '');
    if (hash === 'daily-digest') hash = 'view-daily-digest';
    const item = document.querySelector(`.nav-item[data-view="${hash}"]`);
    if (item) item.click();
  });

  // 2. 状态变量
  let currentTags = [];
  let currentLogs = [];
  let currentConfig = {};

  // ================= 本地日历日期工具函数 (适配时区，杜绝 UTC 早晨滞后) =================
  function getLocalDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 3. 数据初始化
  function loadAllData() {
    chrome.storage.local.get(['jobTags', 'applyLog', 'config'], (res) => {
      currentTags = res.jobTags || [];
      currentLogs = res.applyLog || [];
      currentConfig = res.config || {};

      renderTagsLibrary();
      renderLogTable();
      populateSettings();
      updateBadges();
    });
  }

  function updateBadges() {
    const activeCount = currentTags.filter(t => t.active).length;
    document.getElementById('sidebar-tag-count').textContent = activeCount;
    document.getElementById('sidebar-log-count').textContent = currentLogs.length;

    const dashPipeTagsEl = document.getElementById('dash-pipe-active-tags-num');
    if (dashPipeTagsEl) dashPipeTagsEl.textContent = activeCount;

    // 今日统计 (基于本地自然日)
    const today = getLocalDateStr();
    const todayCount = currentLogs.filter(l => (l.time || '').startsWith(today)).length;
    document.getElementById('stat-today-applied').textContent = todayCount;
    document.getElementById('stat-total-applied').textContent = currentLogs.length;
  }

  // ================= 4. 职业词条高亮选择库 =================
  const tagsContainer = document.getElementById('tags-category-list');

  function renderTagsLibrary() {
    tagsContainer.innerHTML = '';

    // 按分类聚合
    const grouped = {};
    currentTags.forEach(tag => {
      const cat = tag.category || '其他分类';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(tag);
    });

    const categoryIcons = {
      '电商/达人': '🛍️',
      '游戏/社区': '🎮',
      '影像/视觉': '📷',
      '音乐/音频': '🎵',
      '综合/市场': '⚡'
    };

    Object.keys(grouped).forEach(cat => {
      const card = document.createElement('div');
      card.className = 'category-card';

      const tagsInCat = grouped[cat];
      const activeInCat = tagsInCat.filter(t => t.active).length;
      const icon = categoryIcons[cat] || '📌';

      card.innerHTML = `
        <div class="category-header">
          <div class="category-title">
            <span>${icon}</span>
            <span>${cat}</span>
          </div>
          <div class="category-stats">已高亮: ${activeInCat} / ${tagsInCat.length}</div>
        </div>
        <div class="chips-wrap" id="chips-${cat}"></div>
      `;

      const chipsWrap = card.querySelector('.chips-wrap');
      tagsInCat.forEach(tag => {
        const chip = document.createElement('div');
        chip.className = `tag-chip ${tag.active ? 'active' : ''}`;
        chip.setAttribute('data-id', tag.id);
        chip.innerHTML = `
          <span class="chip-check">${tag.active ? '✓' : '+'}</span>
          <span>${tag.name}</span>
          ${tag.id.startsWith('custom_') ? '<span class="chip-remove" title="删除词条">×</span>' : ''}
        `;

        // 点击切换高亮状态
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('chip-remove')) {
            // 删除自定义词条
            currentTags = currentTags.filter(t => t.id !== tag.id);
            saveTags();
            return;
          }
          tag.active = !tag.active;
          saveTags();
        });

        chipsWrap.appendChild(chip);
      });

      tagsContainer.appendChild(card);
    });
  }

  function saveTags() {
    chrome.storage.local.set({ jobTags: currentTags }, () => {
      renderTagsLibrary();
      updateBadges();
    });
  }

  // 全部高亮 / 全部取消
  document.getElementById('btn-select-all-tags').addEventListener('click', () => {
    currentTags.forEach(t => t.active = true);
    saveTags();
  });

  document.getElementById('btn-unselect-all-tags').addEventListener('click', () => {
    currentTags.forEach(t => t.active = false);
    saveTags();
  });

  // 添加自定义词条弹窗
  const addModal = document.getElementById('add-tag-modal');
  document.getElementById('btn-open-add-tag-modal').addEventListener('click', () => {
    addModal.style.display = 'flex';
  });

  document.getElementById('btn-close-modal').addEventListener('click', () => {
    addModal.style.display = 'none';
  });
  document.getElementById('btn-cancel-modal').addEventListener('click', () => {
    addModal.style.display = 'none';
  });

  document.getElementById('btn-confirm-add-tag').addEventListener('click', () => {
    const cat = document.getElementById('new-tag-category').value;
    const nameInput = document.getElementById('new-tag-name');
    const name = nameInput.value.trim();

    if (!name) {
      alert('请输入词条名称！');
      return;
    }

    currentTags.push({
      id: 'custom_' + Date.now(),
      category: cat,
      name: name,
      active: true
    });

    saveTags();
    nameInput.value = '';
    addModal.style.display = 'none';
  });

  // ================= 5. 每日投递记录表格 =================
  const tableBody = document.getElementById('application-table-body');
  const searchInput = document.getElementById('table-search-input');
  const platformFilter = document.getElementById('table-platform-filter');

  function renderLogTable() {
    const searchVal = searchInput.value.trim().toLowerCase();
    const platVal = platformFilter.value;

    let filtered = currentLogs.filter(item => {
      const matchSearch = !searchVal || 
        (item.company || '').toLowerCase().includes(searchVal) ||
        (item.title || '').toLowerCase().includes(searchVal);
      
      const matchPlat = platVal === 'ALL' || item.platform === platVal;
      return matchSearch && matchPlat;
    });

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center; padding: 40px; color: #64748b;">
            暂无匹配的投递记录
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(log => {
      const tr = document.createElement('tr');
      const platClass = log.platform === 'BOSS直聘' ? 'badge-boss' : 
                        log.platform === '猎聘网' ? 'badge-liepin' : 
                        log.platform === '拉勾招聘' ? 'badge-lagou' : 'badge-ats';

      tr.innerHTML = `
        <td>${log.time || ''}</td>
        <td><span class="badge-platform ${platClass}">${log.platform || 'BOSS直聘'}</span></td>
        <td style="font-weight:700; color:#fff;">${log.company || ''}</td>
        <td>${log.title || ''}</td>
        <td style="color:#00f2fe; font-weight:600;">${log.salary || '面议'}</td>
        <td><span class="badge-tag-matched">${log.matchedTag || '高亮词条'}</span></td>
        <td><span style="color:#10b981;">✓ ${log.status || '已沟通'}</span></td>
        <td><span class="action-link btn-view-greeting" data-id="${log.id}">查看文案</span></td>
      `;

      tr.querySelector('.btn-view-greeting').addEventListener('click', () => {
        showGreetingModal(log);
      });

      tableBody.appendChild(tr);
    });
  }

  searchInput.addEventListener('input', renderLogTable);
  platformFilter.addEventListener('change', renderLogTable);

  // 查看打招呼文案弹窗
  const greetingModal = document.getElementById('view-greeting-modal');
  function showGreetingModal(log) {
    document.getElementById('modal-greeting-title').textContent = `${log.company} · ${log.title} (沟通文案)`;
    document.getElementById('modal-greeting-text').textContent = log.greeting || '无文案记录';
    greetingModal.style.display = 'flex';
  }

  document.getElementById('btn-close-greeting-modal').addEventListener('click', () => {
    greetingModal.style.display = 'none';
  });

  // 导出 CSV 表格
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (currentLogs.length === 0) {
      alert('当前暂无投递记录可导出！');
      return;
    }

    let csvContent = '\uFEFF投递时间,目标平台,企业名称,岗位名称,薪资待遇,匹配的高亮词条,投递状态,打招呼沟通文案\n';
    currentLogs.forEach(row => {
      const cleanGreeting = (row.greeting || '').replace(/"/g, '""').replace(/\n/g, ' ');
      csvContent += `"${row.time}","${row.platform}","${row.company}","${row.title}","${row.salary}","${row.matchedTag}","${row.status}","${cleanGreeting}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JobCruise_每日求职投递报表_${getLocalDateStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 清空所有记录
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    if (confirm('确定要清空全部投递历史记录吗？（清空后不可恢复）')) {
      chrome.storage.local.set({ applyLog: [] }, () => {
        currentLogs = [];
        renderLogTable();
        updateBadges();
      });
    }
  });

  // ================= 6. 跨网页调度中心 =================
  document.querySelectorAll('.launch-site-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const url = btn.getAttribute('data-url');
      if (url) {
        chrome.tabs.create({ url });
      }
    });
  });

  // ================= 7. 全局参数设置 =================
  const DEFAULT_RECOMMENDED_GREETING = '您好！看到贵司在招「{jobTitle}」，整体要求与我的背景非常契合。我具备相关领域的实操经验，执行力强，注重数据与实际成果落地。简历已附上，期待与您进一步沟通交流，祝您工作顺利、身体健康～';

  function populateSettings() {
    const cfg = currentConfig;
    if (cfg.targetCity !== undefined && document.getElementById('set-target-city')) document.getElementById('set-target-city').value = cfg.targetCity;
    if (cfg.strictCityFilter !== undefined && document.getElementById('set-strict-city')) document.getElementById('set-strict-city').checked = cfg.strictCityFilter;
    if (cfg.enableCampus2024Protection !== undefined && document.getElementById('set-campus-protection')) document.getElementById('set-campus-protection').checked = cfg.enableCampus2024Protection;
    if (cfg.dailyLimit !== undefined) document.getElementById('set-daily-limit').value = cfg.dailyLimit;
    if (cfg.minSalaryK !== undefined) document.getElementById('set-min-salary').value = cfg.minSalaryK;
    if (cfg.minDelaySec !== undefined) document.getElementById('set-min-delay').value = cfg.minDelaySec;
    if (cfg.maxDelaySec !== undefined) document.getElementById('set-max-delay').value = cfg.maxDelaySec;
    if (cfg.blacklistKeywords !== undefined) document.getElementById('set-blacklist').value = cfg.blacklistKeywords;
    if (cfg.audioAlert !== undefined) document.getElementById('set-audio-alert').checked = cfg.audioAlert;
    if (cfg.desktopNotification !== undefined) document.getElementById('set-desktop-notif').checked = cfg.desktopNotification;
    
    // 话术设置
    const greetingBox = document.getElementById('set-custom-greeting');
    if (greetingBox) {
      greetingBox.value = cfg.customGreetingTemplate || DEFAULT_RECOMMENDED_GREETING;
    }
    const useCustomBox = document.getElementById('set-use-custom-greeting');
    if (useCustomBox) {
      useCustomBox.checked = cfg.useCustomGreeting !== false;
    }

    // 个人资料与档案回显
    chrome.storage.local.get(['applicantProfile'], (res) => {
      const prof = res.applicantProfile || {};
      if (prof.name && document.getElementById('prof-name')) document.getElementById('prof-name').value = prof.name;
      if (prof.phone && document.getElementById('prof-phone')) document.getElementById('prof-phone').value = prof.phone;
      if (prof.wechat && document.getElementById('prof-wechat')) document.getElementById('prof-wechat').value = prof.wechat;
      if (prof.email && document.getElementById('prof-email')) document.getElementById('prof-email').value = prof.email;
      if (prof.school && document.getElementById('prof-school')) document.getElementById('prof-school').value = prof.school;
      if (prof.degree && document.getElementById('prof-degree')) document.getElementById('prof-degree').value = prof.degree;
      if (prof.major && document.getElementById('prof-major')) document.getElementById('prof-major').value = prof.major;
      if (document.getElementById('prof-grad-year')) document.getElementById('prof-grad-year').value = prof.gradYear || '2024';
      if (document.getElementById('prof-city')) document.getElementById('prof-city').value = prof.city || '深圳';
      if (prof.targetSalary && document.getElementById('prof-salary')) document.getElementById('prof-salary').value = prof.targetSalary;
      if (prof.portfolioUrl && document.getElementById('prof-portfolio')) document.getElementById('prof-portfolio').value = prof.portfolioUrl;

      if (prof.name && document.getElementById('sidebar-user-name')) {
        document.getElementById('sidebar-user-name').textContent = prof.name;
      }
      if (document.getElementById('sidebar-user-city')) {
        document.getElementById('sidebar-user-city').textContent = `${prof.city || '深圳'} · 2024届 · ${prof.targetSalary || '求职中'}`;
      }
    });
  }

  // 恢复默认话术按钮
  const btnResetGreeting = document.getElementById('btn-reset-greeting');
  if (btnResetGreeting) {
    btnResetGreeting.addEventListener('click', () => {
      const greetingBox = document.getElementById('set-custom-greeting');
      if (greetingBox) {
        greetingBox.value = DEFAULT_RECOMMENDED_GREETING;
        greetingBox.focus();
      }
    });
  }

  document.getElementById('global-settings-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const greetingVal = document.getElementById('set-custom-greeting')?.value.trim() || DEFAULT_RECOMMENDED_GREETING;
    const useCustomVal = document.getElementById('set-use-custom-greeting')?.checked ?? true;
    const targetCityVal = document.getElementById('set-target-city')?.value.trim() || '深圳';
    const strictCityVal = document.getElementById('set-strict-city')?.checked ?? true;
    const campusProtectionVal = document.getElementById('set-campus-protection')?.checked ?? true;

    const newConfig = {
      ...currentConfig,
      targetCity: targetCityVal,
      strictCityFilter: strictCityVal,
      enableCampus2024Protection: campusProtectionVal,
      gradYear: '2024',
      dailyLimit: parseInt(document.getElementById('set-daily-limit').value, 10) || 30,
      minSalaryK: parseInt(document.getElementById('set-min-salary').value, 10) || 9,
      minDelaySec: parseInt(document.getElementById('set-min-delay').value, 10) || 9,
      maxDelaySec: parseInt(document.getElementById('set-max-delay').value, 10) || 15,
      blacklistKeywords: document.getElementById('set-blacklist').value.trim(),
      audioAlert: document.getElementById('set-audio-alert').checked,
      desktopNotification: document.getElementById('set-desktop-notif').checked,
      customGreetingTemplate: greetingVal,
      useCustomGreeting: useCustomVal,
      portfolioUrl: document.getElementById('prof-portfolio')?.value.trim() || ''
    };

    const newProfile = {
      name: document.getElementById('prof-name')?.value.trim() || '',
      phone: document.getElementById('prof-phone')?.value.trim() || '',
      wechat: document.getElementById('prof-wechat')?.value.trim() || '',
      email: document.getElementById('prof-email')?.value.trim() || '',
      school: document.getElementById('prof-school')?.value.trim() || '',
      degree: document.getElementById('prof-degree')?.value.trim() || '',
      major: document.getElementById('prof-major')?.value.trim() || '',
      gradYear: document.getElementById('prof-grad-year')?.value.trim() || '2024',
      city: document.getElementById('prof-city')?.value.trim() || '深圳',
      targetSalary: document.getElementById('prof-salary')?.value.trim() || '',
      portfolioUrl: document.getElementById('prof-portfolio')?.value.trim() || ''
    };

    chrome.storage.local.set({ config: newConfig, applicantProfile: newProfile }, () => {
      currentConfig = newConfig;
      if (newProfile.name && document.getElementById('sidebar-user-name')) {
        document.getElementById('sidebar-user-name').textContent = newProfile.name;
      }
      if (newProfile.city && document.getElementById('sidebar-user-city')) {
        document.getElementById('sidebar-user-city').textContent = `${newProfile.city} · ${newProfile.targetSalary || '求职中'}`;
      }
      const btn = document.getElementById('btn-save-all-settings');
      const origText = btn.textContent;
      btn.textContent = '✓ 所有参数与网申资料已保存并生效！';
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.textContent = origText;
        btn.style.background = '';
      }, 1500);
    });
  });

  // ================= 7.1 跨账户全量配置与数据迁移 =================
  document.getElementById('btn-export-full-backup')?.addEventListener('click', () => {
    chrome.storage.local.get(['jobTags', 'config', 'applicantProfile', 'resumeDepot', 'applyLog'], (res) => {
      const backupData = {
        app: 'JobCruise',
        version: '2.5.5',
        exportTime: new Date().toLocaleString(),
        jobTags: res.jobTags || currentTags || [],
        config: res.config || currentConfig || {},
        applicantProfile: res.applicantProfile || {},
        resumeDepot: res.resumeDepot || null,
        applyLog: res.applyLog || currentLogs || []
      };
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `JobCruise_全量数据备份_${getLocalDateStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showCopyToast('全量数据备份已成功导出！换账户后一键导入即可无缝恢复。');
    });
  });

  const btnTriggerImport = document.getElementById('btn-trigger-import-backup');
  const inputImportFile = document.getElementById('input-import-backup-file');
  if (btnTriggerImport && inputImportFile) {
    btnTriggerImport.addEventListener('click', () => {
      inputImportFile.click();
    });

    inputImportFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = JSON.parse(evt.target.result);
          if (!data || typeof data !== 'object') {
            throw new Error('无效的 JSON 配置文件');
          }

          const updates = {};
          if (Array.isArray(data.jobTags)) updates.jobTags = data.jobTags;
          if (data.config && typeof data.config === 'object') updates.config = data.config;
          if (data.applicantProfile && typeof data.applicantProfile === 'object') updates.applicantProfile = data.applicantProfile;
          if (data.resumeDepot) updates.resumeDepot = data.resumeDepot;
          if (Array.isArray(data.applyLog)) updates.applyLog = data.applyLog;

          chrome.storage.local.set(updates, () => {
            showCopyToast('✅ 全量数据包已成功恢复！正在刷新界面...');
            setTimeout(() => {
              window.location.reload();
            }, 1000);
          });
        } catch (err) {
          alert('导入失败：' + (err.message || '文件格式不正确，请选择导出的备份 JSON 文件'));
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
  }

  // ================= 8. 全网流水线多平台协同控制 =================
  const dashPipeProgressBox = document.getElementById('dash-pipe-progress-box');
  const dashPipeLiveSite = document.getElementById('dash-pipe-live-site');
  const dashPipePercent = document.getElementById('dash-pipe-percent');
  const dashPipeBar = document.getElementById('dash-pipe-bar');
  const dashPipeTarget = document.getElementById('dash-pipe-target');
  const btnDashStartPipeline = document.getElementById('btn-dash-start-pipeline');
  const btnDashStopPipeline = document.getElementById('btn-dash-stop-pipeline');

  function updateDashPipelineUI(status) {
    if (!status) return;
    if (status.isActive) {
      if (btnDashStartPipeline) btnDashStartPipeline.style.display = 'none';
      if (btnDashStopPipeline) btnDashStopPipeline.style.display = 'block';
      if (dashPipeProgressBox) dashPipeProgressBox.style.display = 'block';

      const siteName = status.currentSite?.name || '当前平台';
      const siteCount = status.currentSiteCount || 0;
      const target = status.perSiteTarget || 10;
      const totalSites = (status.sites && status.sites.length) || 3;
      const currentIndex = status.currentIndex || 0;

      if (dashPipeLiveSite) {
        dashPipeLiveSite.textContent = `第 ${currentIndex + 1}/${totalSites} 站【${siteName}】: ${siteCount}/${target} 个已投`;
      }

      const overallCurrent = currentIndex * target + Math.min(siteCount, target);
      const overallTarget = totalSites * target;
      const pct = Math.min(Math.round((overallCurrent / overallTarget) * 100), 100);

      if (dashPipePercent) dashPipePercent.textContent = `${pct}%`;
      if (dashPipeBar) dashPipeBar.style.width = `${pct}%`;
    } else {
      if (btnDashStartPipeline) btnDashStartPipeline.style.display = 'block';
      if (btnDashStopPipeline) btnDashStopPipeline.style.display = 'none';
      if (dashPipeProgressBox) dashPipeProgressBox.style.display = 'none';
    }
  }

  function fetchDashPipelineStatus() {
    chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
      if (chrome.runtime.lastError || !res) return;
      updateDashPipelineUI(res);
    });
  }

  if (btnDashStartPipeline) {
    btnDashStartPipeline.addEventListener('click', () => {
      const target = parseInt(dashPipeTarget.value, 10) || 10;
      chrome.runtime.sendMessage({
        type: 'START_CRUISE_PIPELINE',
        perSiteTarget: target
      }, () => {
        fetchDashPipelineStatus();
      });
    });
  }

  if (btnDashStopPipeline) {
    btnDashStopPipeline.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'STOP_CRUISE_PIPELINE' }, () => {
        fetchDashPipelineStatus();
      });
    });
  }

  // 定时刷新全网流水线状态
  fetchDashPipelineStatus();
  setInterval(fetchDashPipelineStatus, 1500);

  // ================= 9. 每日投递复盘与大厂AI战略顾问中心 =================

  const INDUSTRY_RADAR_DATA = {
    ecommerce: {
      title: '🛍️ 电商与达人运营赛道',
      trend: '2026年抖音电商全域兴趣电商进入存量深水区，纯货架与内容场双轮驱动。达人端由以往的单纯头部大主播专场，转向中腰部垂类达人矩阵式分发+短视频切片授权矩阵化。品牌店播对高转化投放（千川）和高效率达播商务撮合人才需求持续旺盛。出海方面，TikTok Shop 美区与东南亚重点放量，亟需具备国内大促操盘与出海达人拓展复合经验的运营者。',
      hotJobs: ['达人运营', '电商运营', '千川投放', '达播BD', 'TikTok电商运营', '直播间运营', '商家运营', '流量增长'],
      criteria: '核心偏好：看重【真实的达人建联落地漏斗数据】、【大促战役节点把控】与【GMV归因能力】，拒绝虚数和无意义的形容词堆砌。',
      matchAdvice: '若有电商全周期操盘或达人拓展经历，这是绝对的王牌加分项，简历与沟通中务必突出“大促全链路执行与达人建联闭环”，用清晰的建联漏斗与ROI说话！'
    },
    game: {
      title: '🎮 游戏与核心社区运营赛道',
      trend: '2026国内游戏市场重度产品注重精细化长线运营与用户生命周期（LTV）延展，小游戏（微信/抖音小游戏）爆发带来大量轻量化运营需求。在海外，二次元与SLG品类强调全球化社群（Discord/Twitter/Reddit）及创作者二创生态建设。各大厂互娱部门对懂硬核游戏机制、能深入玩家圈层的运营人员求贤若渴。',
      hotJobs: ['游戏运营', '玩家社区运营', '核心玩家生态', '游戏活动策划', '版本运营', '二创生态运营', '电竞赛事', '海外游戏社区'],
      criteria: '核心偏好：极度看重【是否为真正懂游戏机制的硬核高玩】、【能否独立产出竞品数值与社交机制拆解】、【社群舆情敏锐度与同人创作者激励SOP】。',
      matchAdvice: '具备深度硬核游戏经历是许多非核心玩家无法比拟的壁垒，建议务必把“硬核玩家机制拆解报告与社群活动复盘”作为破局钥匙！'
    },
    photo: {
      title: '📷 数码影像与商业视觉策划赛道',
      trend: '大疆 (DJI) 与影石 (Insta360) 引领的智能影像设备市场热度空前，Action 运动相机、Pocket 云台相机、全景相机全面渗透户外骑行、旅行街拍与Vlog创作者。硬件厂商极需既懂摄影技术参数、又具备创作者社区和商业摄影审美的复合型人才；同时，AIGC 商业图文辅助工作流逐步并入商业摄影制作管线。',
      hotJobs: ['商业摄影师', '视觉策划', '数码影像运营', '创作者生态运营', '短视频编导', 'AIGC内容策划', '修图师', '美术策划'],
      criteria: '核心偏好：过硬的视觉审美、商业布光与成片落地能力、摄影师与数码KOL社群语言体系、能否独立输出标杆样片案例。',
      matchAdvice: '拥有扎实的商业摄影/视觉实操经验与精美作品集，是进入影像创作者生态最直接的敲门砖，务必在简历开头直接附上高清作品集链接！'
    },
    audio: {
      title: '🎵 音频与音乐内容运营赛道',
      trend: '字节汽水音乐借助抖音生态扶持独立音乐人与热歌宣发；腾讯TME聚焦长音频、播客及车载智能座舱音频场景分发；音频版权精细化运营与高粘性听众社群成为商业化重点。',
      hotJobs: ['音乐运营', '音频内容运营', '汽水音乐', '播客运营', '音乐宣发', '流媒体运营', '音乐版权运营'],
      criteria: '核心偏好：流行内容嗅觉敏锐、音乐版权商务拓展能力、音频社区促活与播客创作者撮合经验。',
      matchAdvice: '建议结合流行文化敏锐度与年轻群体内容审美，主攻流媒体音乐、播客创作者生态与音频社区促活板块。'
    }
  };

  const BIG_TECH_PLANS = [
    {
      name: '大疆创新 (DJI)',
      tag: '影像生态 / 社区运营',
      pain: '硬件产品线极其强大，但非常需要既懂传感器、色彩科学与商业摄影实操，又能与全球影像创作者同频沟通的“摄影极客”。',
      strategy: '将【扎实摄影/影像视觉实操背景】与作品集链接直接置顶于自荐信第一行。突出对布光构图、商业静物/人像出片的理解，展现极高即战力与业务同频度。',
      action: '在作品集补充《大疆手持影像在商业人像与微电影场景中的样片企划案》，直接击穿面试官防线。'
    },
    {
      name: '影石 Insta360',
      tag: '全球达人BD / 新媒体运营',
      pain: '海外与国内户外运动、街拍全景达人爆发式增长，急需具备规模化建联破冰SOP、高情商撮合以及大促转化的年轻运营。',
      strategy: '打出【精细化达人拓展】与【达人建联落地闭环】，强调数据驱动、抗压执行力强。突出视觉与审美功底能为达人提供内容脚本与视觉指导。',
      action: '自荐信突出：“曾主导全链路达人建联撮合，深谙科技数码KOL痛点，可即插即用落地达人拓展与转化闭环”。'
    },
    {
      name: '腾讯 (IEG互娱 / PCG内容)',
      tag: '游戏社区运营 / 长音频内容',
      pain: '传统运营不懂核心玩家心理，社区活动流于形式容易引发玩家负面舆情；需要真正懂底层经济模型和玩家情绪价值的重度高玩。',
      strategy: '打出【重度硬核玩家深度机制拆解】标签，随自荐信附带一份《竞品机制逆向拆解与版本社群促活提案》，主攻互娱或内容社区部门。',
      action: '准备 1 份精简 PDF《某爆款游戏版本促活机制拆解》，面试时作为降维打击王牌。'
    },
    {
      name: '字节跳动 (抖音电商 / 汽水音乐)',
      tag: '大促操盘 / 达人运营',
      pain: '字节崇尚数据说话、高压高产出、大促期间对落地执行力的极端考核，非大促操盘经历者适应周期极长。',
      strategy: '文案完全匹配互联网敏捷与数据驱动风格（“痛点-抓手-链路-数据归因-落地复盘”），强调极强抗压力与快速执行力。',
      action: '强调“熟悉系统与达人拓展节奏、具备极强大促抗压力与敏捷执行力”。'
    },
    {
      name: '网易游戏 / 米哈游 (miHoYo)',
      tag: '玩家生态 / 二创同人社群',
      pain: '重度ACG与二次元游戏极度依赖玩家二创与同人社群自发安利裂变，需要对同人文化深度浸润的圈内人。',
      strategy: '展示对主流游戏二创生态的敏锐度，提供同人创作者激励方案；突出对同人画师、创作者社群的共鸣与促活能力。',
      action: '自荐信附上同人创作者激励机制与长线玩家社群促活思路。'
    }
  ];

  function runDailyRetrospective() {
    const today = getLocalDateStr();
    let logs = currentLogs.filter(l => (l.time || '').startsWith(today));
    let isFallback = false;

    if (logs.length === 0) {
      logs = currentLogs.slice(0, 25);
      isFallback = true;
    }

    const todayCount = logs.length;
    const limit = currentConfig.dailyLimit || 30;
    const replyCount = logs.filter(l => l.status === '已沟通' || l.status === '已回复' || l.status === '已查看').length;
    const replyRate = todayCount > 0 ? ((replyCount / todayCount) * 100).toFixed(1) : '0.0';

    // 统计高频词条
    const tagCountMap = {};
    logs.forEach(l => {
      const tag = l.matchedTag || '综合匹配';
      tagCountMap[tag] = (tagCountMap[tag] || 0) + 1;
    });
    const sortedTags = Object.entries(tagCountMap).sort((a, b) => b[1] - a[1]);
    const topTagStr = sortedTags.length > 0 ? `${sortedTags[0][0]} (${sortedTags[0][1]}次)` : '暂无数据';
    const tagDistStr = sortedTags.slice(0, 3).map(t => `${t[0]}:${t[1]}`).join(' / ') || '分布均衡';

    // 投递时间分析
    let goldenHourCount = 0;
    logs.forEach(l => {
      const timePart = (l.time || '').split(' ')[1];
      if (timePart) {
        const hour = parseInt(timePart.split(':')[0], 10);
        const min = parseInt(timePart.split(':')[1], 10);
        const timeVal = hour + min / 60;
        if ((timeVal >= 9.5 && timeVal <= 11.5) || (timeVal >= 14 && timeVal <= 17.5)) {
          goldenHourCount++;
        }
      }
    });

    const goldenPct = todayCount > 0 ? Math.round((goldenHourCount / todayCount) * 100) : 0;
    let timingScore = '88分 · 良好';
    let timingScoreClass = 'text-green';
    if (goldenPct >= 70) {
      timingScore = `${goldenPct}% · 极佳时段`;
    } else if (goldenPct >= 40) {
      timingScore = `${goldenPct}% · 良好时段`;
    } else if (todayCount > 0) {
      timingScore = `${goldenPct}% · 建议调整`;
      timingScoreClass = 'text-warn';
    } else {
      timingScore = '待巡航';
    }

    // 回填概览卡片
    const elTodayCount = document.getElementById('retro-today-count');
    const elTodayLimit = document.getElementById('retro-today-limit');
    const elReplyCount = document.getElementById('retro-reply-count');
    const elReplyRate = document.getElementById('retro-reply-rate');
    const elTopTag = document.getElementById('retro-top-tag');
    const elTagDist = document.getElementById('retro-tag-distribution');
    const elTimingScore = document.getElementById('retro-timing-score');
    const elTimingDesc = document.getElementById('retro-timing-desc');

    if (elTodayCount) elTodayCount.textContent = todayCount;
    if (elTodayLimit) elTodayLimit.textContent = isFallback ? '历史最近样本' : `今日安全上限: ${limit}`;
    if (elReplyCount) elReplyCount.textContent = replyCount;
    if (elReplyRate) elReplyRate.textContent = `响应沟通率: ${replyRate}%`;
    if (elTopTag) elTopTag.textContent = topTagStr;
    if (elTagDist) elTagDist.textContent = tagDistStr;
    if (elTimingScore) elTimingScore.textContent = timingScore;
    if (elTimingDesc) elTimingDesc.textContent = `HR黄金时间占比: ${goldenPct}%`;

    // 渲染五维归因诊断
    renderAttributionAnalysis(logs, goldenPct);
    renderFilterEvolutionAdvice(logs, sortedTags);
  }

  function renderAttributionAnalysis(logs, goldenPct) {
    const listEl = document.getElementById('retro-attribution-list');
    if (!listEl) return;

    const cardsData = [
      {
        title: '⏰ 1. 投递时效窗口与 HR 查看波峰归因',
        status: goldenPct >= 60 ? '时段健康' : '时段需微调',
        statusClass: goldenPct >= 60 ? 'status-good' : 'status-warn',
        body: '招聘端存在极强的时间周期效应。上午 9:30-11:30、下午 14:00-17:30 为 HR 批量沟通的高峰期，周二至周四查看率最高。夜间 20:00 之后或周末投递，次日工作日早晨会被成百上千条新打招呼淹没。',
        advice: goldenPct >= 60 
          ? '✓ 当前投递集中在黄金工作时段，保持该节奏，早间 10:00 与下午 14:30 启动全网巡航转化最佳。'
          : '⚠️ 检测到非黄金时段投递比例较高。建议调整巡航启动时间为上午 10:00 或下午 14:30，确保消息排在 HR 沟通列表顶端。'
      },
      {
        title: '🔄 2. 平台生态与反馈周期客观时延',
        status: '客观周期差异',
        statusClass: 'status-good',
        body: '三大目标平台反馈节奏完全不同：<b>BOSS直聘</b> 为即时沟通，若 24 小时内未读或已读不回，常为岗位已收满或虚挂；<b>猎聘网</b> 80% 为猎头或企业HRBP统筹，常规筛选流程需 2~5 个工作日；<b>拉勾网</b> HR 习惯每周固定 1~2 天批量下载简历初筛。',
        advice: '💡 无需因当日无回音产生心理压力：BOSS 直聘看当日即时互动，猎聘网与拉勾网请以 3~5 天后的集中邀约为评估周期。'
      },
      {
        title: '🎯 3. 岗位隐形门槛与年限倒挂排查',
        status: '初筛过滤排查',
        statusClass: 'status-warn',
        body: '在标有“3-5年团队管理”或中高阶岗位上，企业 ATS 算法常设“工作年限”硬性拦截规则，若年限不符容易被系统规则误伤。',
        advice: '🎯 优化筛选范围：优先锁定“1-3年”、“应届生/校招补录”、“经验不限”的高质量岗位，命中算法初筛的通过率将提升 300% 以上。'
      },
      {
        title: '💬 4. 沟通自荐信钩子锐度与差异化击穿',
        status: '温和风格就绪',
        statusClass: 'status-good',
        body: '插件默认合成的话术自然温和且带健康祝福，亲和力极佳。但针对不同赛道，第一句的“钩子”可进一步锐化：电商岗最看重 GMV 与达人漏斗，游戏岗最看重机制拆解，摄影岗最看重作品集链接。',
        advice: '🔥 建议在后台针对不同目标岗位微调占位话术：投电商必提【GMV与达人漏斗】，投游戏必提【核心机制拆解】，投视觉必将【作品集直链置顶】。'
      },
      {
        title: '🏢 5. 招聘端活跃度与“幽灵HC/虚挂岗位”识别',
        status: '行业常态防坑',
        statusClass: 'status-alert',
        body: '招聘软件上约有 25%~35% 的常年挂载岗位属于企业“展示雇主形象”或“购买套餐后系统自动刷新挂着”，HR 甚至数周未登录后台，此类岗位投递无回复属于系统性噪音。',
        advice: '🛡️ 插件已内置起薪过滤与黑名单跳过，在浏览卡片时如见 HR 标注“半年前活跃”可直接在后台将该企业拉入黑名单，聚焦“今日活跃”优质企业。'
      }
    ];

    listEl.innerHTML = '';
    cardsData.forEach(card => {
      const div = document.createElement('div');
      div.className = 'retro-attribution-card';
      div.innerHTML = `
        <div class="retro-attribution-header">
          <div class="retro-attribution-title">${card.title}</div>
          <span class="retro-attribution-status ${card.statusClass}">${card.status}</span>
        </div>
        <div class="retro-attribution-body">${card.body}</div>
        <div class="retro-attribution-advice">${card.advice}</div>
      `;
      listEl.appendChild(div);
    });
  }

  function renderIndustryRadar(category = 'ecommerce') {
    const bodyEl = document.getElementById('retro-industry-body');
    if (!bodyEl) return;

    const data = INDUSTRY_RADAR_DATA[category] || INDUSTRY_RADAR_DATA.ecommerce;

    bodyEl.innerHTML = `
      <div class="industry-intel-card">
        <div class="intel-section">
          <div class="intel-label">📡 赛道前沿风向与招聘趋势</div>
          <div class="intel-desc">${data.trend}</div>
        </div>
        <div class="intel-section">
          <div class="intel-label">🔥 近期高频紧缺岗位标签</div>
          <div class="intel-tags-row">
            ${data.hotJobs.map(j => `<span class="intel-chip">${j}</span>`).join('')}
          </div>
        </div>
        <div class="intel-section">
          <div class="intel-label">🎯 大厂与优质雇主面试痛点偏好</div>
          <div class="intel-desc" style="color:#f1f5f9;">${data.criteria}</div>
        </div>
        <div class="intel-section" style="background:rgba(0,242,254,0.06); padding:10px 14px; border-radius:8px; border-left:3px solid #00f2fe;">
          <div class="intel-label" style="color:#00f2fe;">💡 建议破局切入点</div>
          <div class="intel-desc" style="color:#e2e8f0;">${data.matchAdvice}</div>
        </div>
      </div>
    `;

    // 绑定 tab 切换
    document.querySelectorAll('.retro-ind-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-ind') === category) {
        tab.classList.add('active');
      }
      tab.onclick = () => {
        const ind = tab.getAttribute('data-ind');
        renderIndustryRadar(ind);
      };
    });
  }

  function renderBigTechStrategies() {
    const listEl = document.getElementById('retro-bigtech-list');
    if (!listEl) return;

    listEl.innerHTML = '';
    BIG_TECH_PLANS.forEach(item => {
      const card = document.createElement('div');
      card.className = 'retro-bigtech-card';
      card.innerHTML = `
        <div class="retro-bigtech-header">
          <div class="retro-bigtech-name">
            <span>⚡</span>
            <span>${item.name}</span>
          </div>
          <span class="retro-bigtech-target">${item.tag}</span>
        </div>
        <div class="retro-bigtech-pain"><b>🎯 业务痛点：</b>${item.pain}</div>
        <div class="retro-bigtech-strategy"><b>💡 针对性击穿战略：</b>${item.strategy}</div>
        <div class="retro-bigtech-action"><b>🚀 推荐落地行动：</b>${item.action}</div>
      `;
      listEl.appendChild(card);
    });
  }

  function renderResumeAndPortfolioAdvice() {
    const resumeListEl = document.getElementById('retro-resume-advice-list');
    const portfolioListEl = document.getElementById('retro-portfolio-advice-list');

    if (resumeListEl) {
      resumeListEl.innerHTML = `
        <div class="retro-advice-card">
          <h4>🛍️ 电商运营向微调 (主攻字节/品牌电商)</h4>
          将【字节电商618全周期操盘】置顶首位，用数据化公式展开：<b>负责X类目达人拓展，单月撮合达人Y位，大促期间达成Z万GMV，千川投放投产比达到N</b>；删除模糊形容词，突出执行力与数据归因闭环。
        </div>
        <div class="retro-advice-card">
          <h4>🎮 游戏社区向微调 (主攻腾讯/米哈游/网易)</h4>
          在个人优势首行突出：<b>10000+小时硬核主机/Steam/手游经验，熟悉竞品经济系统与抽卡数值节奏</b>；社群运营经历重点强调“活跃率提升%”、“核心玩家KOL/二创作者孵化数”。
        </div>
        <div class="retro-advice-card">
          <h4>📷 商业摄影与视觉向微调 (主攻大疆/影石)</h4>
          突出：<b>5年商业摄影实战、商业布光与视觉质感把控</b>，服务品牌及成片发布数；简历最上方置顶个人在线作品集直链（workers.dev），方便用人部门秒级浏览。
        </div>
      `;
    }

    if (portfolioListEl) {
      portfolioListEl.innerHTML = `
        <div class="retro-advice-card">
          <span class="portfolio-card-badge">建议补充板卡 1</span>
          <h4>📊《618电商大促全周期操盘复盘看板》</h4>
          <b>形式：</b>在 Workers 展板增加 1 个专属图文锚点或在线 PDF；<br>
          <b>核心内容：</b>大促节奏甘特图、达人分层撮合漏斗图、直播间货盘策略与最终 GMV 增长曲线，直观展示大促统筹操盘素养。
        </div>
        <div class="retro-advice-card">
          <span class="portfolio-card-badge">建议补充板卡 2</span>
          <h4>🎮《头部竞品游戏机制与社区促活深度拆解报告》</h4>
          <b>形式：</b>在线预览 2~3 页专业 PDF；<br>
          <b>核心内容：</b>以某款主流游戏（如原神/绝区零/三角洲/DNF）为案例，逆向拆解版本活动设计亮点、玩家流失痛点与社区舆情引导演练，一击证明万小时硬核玩家深度。
        </div>
        <div class="retro-advice-card">
          <span class="portfolio-card-badge">建议补充板卡 3</span>
          <h4>📷《商业摄影与产品布光策划高清特辑》</h4>
          <b>形式：</b>瀑布流高清组图板卡；<br>
          <b>核心内容：</b>商业人像打光图、静物产品微距质感、科技数码实拍场景，直观展现摄影师语言与高级审美，是大疆与影石用人主管最青睐的即战力证明。
        </div>
      `;
    }
  }

  function renderFilterEvolutionAdvice(logs, sortedTags) {
    const adviceEl = document.getElementById('retro-filter-evolution-content');
    if (!adviceEl) return;

    adviceEl.innerHTML = `
      <div>
        <b>🌟 基于今日投递与行业数据的筛选器迭代建议：</b>
        <ul>
          <li><b>高亮词条微调：</b>当前匹配最多的前三词条为 <code>${sortedTags.slice(0, 3).map(t => t[0]).join(', ') || '达人运营、电商运营、游戏运营'}</code>。建议保持“电商/达人”与“游戏/社区”的双主攻高亮，若主攻影像数码，可点亮新扩容的“创作者生态”与“海外游戏社区”词条。</li>
          <li><b>薪资门槛自适应：</b>深圳 9-15K 属于中初级优质核心区间。对于拉勾招聘和猎聘网，建议保持 9K 起薪过滤，有效剔除地推销售类虚挂岗；BOSS 直聘可保持 8-10K 灵活区间以防错失应届生管培好职位。</li>
          <li><b>黑名单词库扩充：</b>建议在黑名单中增加 <code>地推,骑手,保险代理,无责底薪2000</code>，确保全网流水线投递的每一家企业均为正规科技、互联网与消费电子企业。</li>
          <li><b>黄金启动时间：</b>建议每日上午 <b>10:00</b> 或下午 <b>14:30</b> 点击「🚀 一键开启今日全网巡航」，消息将直接排在企业 HR 沟通列表最顶端。</li>
        </ul>
      </div>
    `;
  }

  function exportRetrospectiveMarkdown() {
    const today = getLocalDateStr();
    const todayCount = document.getElementById('retro-today-count')?.textContent || '0';
    const replyRate = document.getElementById('retro-reply-rate')?.textContent || '0.0%';
    const topTag = document.getElementById('retro-top-tag')?.textContent || '电商/达人运营';
    const timing = document.getElementById('retro-timing-score')?.textContent || '良好';

    let md = `# ⚡ JobCruise 求职每日投递复盘与战略诊断报告\n\n`;
    md += `> **生成日期**：${today}  \n`;
    md += `> **生成系统**：JobCruise 求职自动化巡航助手 (框架开源版)  \n\n`;
    md += `---\n\n`;
    md += `## 📊 一、今日投递大盘战报\n\n`;
    md += `- **今日投递总量**：${todayCount} 个岗位\n`;
    md += `- **响应与沟通表现**：${replyRate}\n`;
    md += `- **高频主攻赛道**：${topTag}\n`;
    md += `- **投递时效健康度**：${timing}\n\n`;
    md += `---\n\n`;
    md += `## 🧐 二、五维未回复智能归因诊断\n\n`;
    md += `1. **时效时段归因**：HR查看高峰集中在 9:30-11:30、14:00-17:30，非工作时段投递易被新消息冲刷，建议固定在黄金窗口开启巡航。\n`;
    md += `2. **平台生态时延**：BOSS直聘为即时微聊（24h无应答常为虚挂）；猎聘网为中高端猎头顾问制（正常审核周期2~5工作日）；拉勾网为批量导出制，无需单日焦虑。\n`;
    md += `3. **岗位隐形门槛**：标有“3-5年经验”岗位易被初筛算法误伤，建议主攻“1-3年”、“应届/校招补录”、“经验不限”岗位。\n`;
    md += `4. **沟通文案钩子**：电商突出大促千万GMV与达人漏斗，游戏突出万小时硬核拆解，摄影突出作品集直链。\n`;
    md += `5. **虚挂假HC识别**：注意辨别“半年前活跃”的长期展示死职位，优先聚焦“今日活跃”优质雇主。\n\n`;
    md += `---\n\n`;
    md += `## 🎯 三、大厂专项靶向破局建议\n\n`;
    BIG_TECH_PLANS.forEach(item => {
      md += `### ⚡ ${item.name} (${item.tag})\n`;
      md += `- **业务痛点**：${item.pain}\n`;
      md += `- **针对性击穿战略**：${item.strategy}\n`;
      md += `- **落地行动**：${item.action}\n\n`;
    });
    md += `---\n\n`;
    md += `## 📝 四、个人作品集/展板建议扩充板卡清单\n\n`;
    md += `1. **【电商】《电商大促全周期操盘复盘看板》**：甘特图、达人撮合漏斗图、GMV归因曲线。\n`;
    md += `2. **【游戏】《头部竞品游戏机制与社区促活深度拆解报告》**：2~3页在线PDF，证明硬核高玩素养。\n`;
    md += `3. **【摄影】《商业摄影与产品布光策划高清特辑》**：人像打光图、静物产品微距质感样片。\n\n`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JobCruise_求职复盘与战略诊断报告_${today}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 绑定复盘中心按钮事件
  const btnRefreshRetro = document.getElementById('btn-refresh-retro');
  const btnRefreshIntel = document.getElementById('btn-refresh-intel');
  const btnExportRetro = document.getElementById('btn-export-retro-md');

  if (btnRefreshRetro) {
    btnRefreshRetro.addEventListener('click', () => {
      runDailyRetrospective();
      const orig = btnRefreshRetro.textContent;
      btnRefreshRetro.textContent = '✓ 诊断已刷新！';
      setTimeout(() => { btnRefreshRetro.textContent = orig; }, 1200);
    });
  }

  if (btnRefreshIntel) {
    btnRefreshIntel.addEventListener('click', () => {
      renderIndustryRadar('ecommerce');
      const orig = btnRefreshIntel.textContent;
      btnRefreshIntel.textContent = '✓ 行业风向已更新！';
      setTimeout(() => { btnRefreshIntel.textContent = orig; }, 1200);
    });
  }

  if (btnExportRetro) {
    btnExportRetro.addEventListener('click', exportRetrospectiveMarkdown);
  }

  // ================= 10. 智能简历解析与网申速填武器库 =================
  let currentResumeDepot = null;

  const DEFAULT_SAMPLE_RESUME = `【个人优势】
1. 具备5年电商大促运营与达人内容矩阵操盘实战经验，深度熟悉全域兴趣电商与达人分层BD拓展SOP。
2. 操盘过多场千万级GMV大型战役节点，擅长数据归因分析（GMV/ROI/转化漏斗）与A/B测试。
3. 具备商业摄影与布光分镜实战背景，能从视觉审美与硬件特性双向赋能内容爆款打造。
4. 敏捷开发与工具编写能力，注重流程自动化与团队工作流提效，抗压能力强、注重业务闭环。

【工作经历】
2023.03 - 至今 | 某头部互联网科技公司 | 电商大促与达人运营专家
- 工作内容：负责抖音电商大促全周期排期统筹、头部与中腰部达人分层建联及千川投放协同。
- 核心业绩：主导大促节点达人矩阵撮合，累计拓展高产出达人超500位，推动活动期GMV突破8500万元，ROI环比提升38%。
- 核心业绩：搭建自动化达人履约跟进表与分镜脚本审核SOP，缩短内容交付周期40%，沉淀多套高转化标杆案例。

2021.07 - 2023.02 | 某新消费数码品牌 | 视觉内容与社区运营负责人
- 工作内容：主导品牌全球影像创作者生态与数码摄影KOL社群运营，负责样片策划与商业摄影布光出片。
- 核心业绩：统筹海外与国内数码极客创作者拓展，搭建万人活跃玩家创作者社群，月均二创爆款播放量超2000万。
- 核心业绩：独立输出3套标杆商业产品图与分镜样片，赋能众筹发布会斩获超额认购300%。

【项目经历】
2024.04 - 2024.06 | 千万级全域兴趣电商大促战役全链路操盘 | 项目总控
- 项目描述：联动供应链、运营、千川投放与头部主播专场，以数据看板驱动货盘排期与内容矩阵爆发。
- 项目业绩：整体GMV达成率132%，打造3个单场破千万直播间，新客获客成本下降24%，实现人群资产深度沉淀。

2023.08 - 2023.11 | 影像创作者全球生态冷启动与爆款孵化计划 | 核心主导
- 项目描述：针对户外运动与街拍全景相机新品上市，制定全球摄影师定向邀请、样机测试及样片宣发闭环。
- 项目业绩：达成100+海外顶级视觉KOL零佣金深度测评，全网曝光超5000万，直接拉动新品首发预售售罄。

【专业技能】
达人BD拓展, 千川投放, 电商大促操盘, 商业摄影, 灯光布光, 分镜脚本, 数据分析(SQL/Excel), 飞书多维表格, 项目SOP搭建, 创作者生态

【兴趣爱好】
商业摄影与布光, 户外骑行, 二次元与主机游戏, 数码极客测评, 咖啡调饮, 探索提效新工具

【自我评价】
精简版：执行力强，看重数据和业务实际落地成果，具备多业务跨领域实战经验，沟通协同敏捷高效、抗压即战力强。
完整版：具备良好的商业敏锐度与数据分析归因习惯，对工作充满敬业与自驱热情。在以往经历中注重以终为始建立规范化SOP，既有大促节点的冲刺爆发力，又有日常精细化运营与社群维护耐心。为人真诚好沟通，能迅速融入团队打赢硬仗。

【教育经历】
重点本科大学 | 数字媒体 / 运营策划 | 本科 | 2020.09 - 2024.06
- 成绩与荣誉：多次获得校级优秀综合奖学金，校融媒体中心核心骨干。
`;

  // 复制反馈气泡 Toast
  function showCopyToast(msg = '已复制到剪贴板！') {
    let toast = document.getElementById('copy-feedback-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'copy-feedback-toast';
      toast.style.cssText = 'position:fixed; top:24px; right:24px; z-index:99999; background:linear-gradient(135deg, #10b981 0%, #00f2fe 100%); color:#0b0f19; font-weight:700; padding:10px 18px; border-radius:8px; box-shadow:0 8px 24px rgba(0,242,254,0.4); font-size:13px; display:flex; align-items:center; gap:8px; pointer-events:none; transition:opacity 0.3s; opacity:0;';
      document.body.appendChild(toast);
    }
    toast.innerHTML = `<span>✓</span> <span>${msg}</span>`;
    toast.style.opacity = '1';
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      toast.style.opacity = '0';
    }, 1600);
  }

  // 复制到剪贴板工具函数
  function copyText(text, btn) {
    if (!text) return;
    const clean = String(text).trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clean).then(() => {
        showCopyToast('已复制到剪贴板，可直接在输入框 Ctrl+V 粘贴！');
        if (btn) {
          const orig = btn.innerHTML;
          btn.classList.add('copied');
          btn.innerHTML = '✓ 已复制';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = orig;
          }, 1200);
        }
      }).catch(() => {
        fallbackCopy(clean, btn);
      });
    } else {
      fallbackCopy(clean, btn);
    }
  }

  function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showCopyToast('已复制到剪贴板！');
    if (btn) {
      const orig = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = '✓ 已复制';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = orig;
      }, 1200);
    }
  }

  // 纯文本分段切分器 (自然段落/空行分段，用于手动快速选中复制与算法兜底)
  function splitRawParagraphs(rawText) {
    if (!rawText || !rawText.trim()) return [];
    // 按双换行或明显模块分割
    const blocks = rawText.split(/\r?\n\s*\r?\n+/).map(b => b.trim()).filter(Boolean);
    const segments = [];

    blocks.forEach((block, idx) => {
      const firstLine = block.split(/\r?\n/)[0].replace(/^[\d+•\-\*、. 【】\[\]]+/, '').trim();
      const title = firstLine.length > 25 ? firstLine.slice(0, 25) + '...' : firstLine || `段落 ${idx + 1}`;
      segments.push({
        id: 'seg_' + (idx + 1),
        index: idx + 1,
        title: title,
        charCount: block.length,
        text: block
      });
    });

    return segments;
  }

  // 纯本地智能简历解析引擎 (升级版：支持基本信息提取、公司项目智能区分、技能爱好隔离、自然分段)
  function parseResumeText(rawText) {
    if (!rawText || !rawText.trim()) return null;

    const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const depot = {
      parsedAt: new Date().toLocaleString(),
      basicInfo: {
        name: '',
        targetRole: '',
        school: '',
        phone: '',
        email: '',
        portfolioUrl: '',
        oneLiner: ''
      },
      advantages: [],
      workExperiences: [],
      projects: [],
      skills: [],
      hobbies: [],
      selfIntro: { short: '', full: '' },
      education: [],
      rawSegments: splitRawParagraphs(rawText)
    };

    // 1. 基础信息扫描抽取 (手机、邮箱、作品集网址、学校)
    const phoneMatch = rawText.match(/(?:(?:\+|00)86)?\s*(1[3-9]\d{9})/);
    if (phoneMatch) depot.basicInfo.phone = phoneMatch[1];

    const emailMatch = rawText.match(/([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)/);
    if (emailMatch) depot.basicInfo.email = emailMatch[1];

    const urlMatch = rawText.match(/(https?:\/\/[^\s"'<>\n\r]+)/);
    if (urlMatch) depot.basicInfo.portfolioUrl = urlMatch[1];

    const schoolMatch = rawText.match(/([\u4e00-\u9fa5]{2,10}(?:大学|学院|高等专科学校))/);
    if (schoolMatch) depot.basicInfo.school = schoolMatch[1];

    // 2. 专业技能与工具词典 (优先判定，绝不让核心工具与专业技术落入兴趣爱好)
    const KNOWN_SKILL_KEYWORDS = [
      'SQL', 'Python', 'Premiere', 'PR', 'AE', 'After Effects', 'PS', 'Photoshop', 'Illustrator', 'AI', 'Final Cut Pro', 'FCP',
      'DaVinci', 'DaVinci Resolve', 'Three.js', 'WebGL', 'GLSL', 'Shader', 'Web Audio API', 'Blender', 'TouchDesigner',
      'esbuild', 'AIGC', 'Midjourney', 'LoRA', 'ChatGPT', 'Claude', 'Claude Code', 'Sora', '即梦', 'Seedance', 'Codex', 'Opencode', 'DSH Harness',
      '飞书', '多维表', '飞书多维表', '千川', '巨量千川', '巨量云图', '巨量算数', '橙蕉', 'ROI', 'SOP', '人群定向', '抖店', 'UTM', '全链路归因',
      '达人BD', '达人分层', '直播脚本', '选题策划', '商业摄影', '三点布光', '分镜', 'Shotlist', 'MCN', 'SLA', '数据透视', '数据清洗',
      'Excel', 'BI', 'Tableau', 'PowerBI', '用户增长', '私域运营', '社群运营', '短视频运营', '内容策划', '矩阵运营', '投放', '复投', '试投'
    ];

    // 3. 逐行状态机解析
    let currentSection = 'header'; // 初始为抬头区域，避免误抓优势
    let currentWork = null;
    let currentProj = null;
    let currentEdu = null;

    const isSectionHeader = (line) => {
      // 技能优先判断，包含核心能力、关键工具、模块、技术栈等
      if (/(?:专业技能|技能特长|职业技能|掌握技能|技能清单|IT技能|专业能力|核心能力|关键工具|技术栈|工具熟练度|软件技能|技能工具|SKILLS)/i.test(line)) return 'skills';
      if (/(?:工作经历|工作经验|职业经历|从业经历|实习经历|工作履历)/i.test(line)) return 'work';
      if (/(?:项目经历|项目经验|核心项目|重点项目|主要项目|实战项目|项目成果|个人项目|主要经历|PROJECT)/i.test(line)) return 'proj';
      if (/(?:个人优势|核心优势|个人亮点|优势亮点|优势与能力|核心亮点|核心竞争力)/i.test(line)) return 'adv';
      // 只有在明确是生活/休闲爱好时才进入 hobbies，带有“能力”或“工具”的在上方已被 skills 捕获
      if (/(?:兴趣爱好|个人爱好|业余爱好|生活方式|特长与爱好|HOBBIES)/i.test(line)) return 'hobbies';
      if (/(?:自我评价|自我介绍|关于我|个人简介|总结与评价|SELF-EVALUATION)/i.test(line)) return 'intro';
      if (/(?:教育背景|教育经历|学习经历|学历情况|EDUCATION)/i.test(line)) return 'edu';
      return null;
    };

    rawLines.forEach((line, idx) => {
      const detected = isSectionHeader(line);
      if (detected) {
        currentSection = detected;
        return;
      }

      if (currentSection === 'header') {
        if (idx <= 6) {
          // 姓名提取
          if (!depot.basicInfo.name && /[\u4e00-\u9fa5]{2,4}(?:\s*\/|\s*·|\s*$)/.test(line) && !line.includes('大学') && !line.includes('申请') && !line.includes('简历') && !line.includes('公司')) {
            const m = line.match(/([\u4e00-\u9fa5]{2,4})/);
            if (m) depot.basicInfo.name = m[1];
          }
          // 定位与期望方向
          if (!depot.basicInfo.targetRole && /(?:设计|产品|技术|运营|策划|研发|工程师|总监|专家)/.test(line) && line.length < 40) {
            depot.basicInfo.targetRole = line;
          }
          // 一句话简介
          if (!depot.basicInfo.oneLiner && /(?:实践者|复合型|探索者|负责人|操盘手)/.test(line) && line.length < 60) {
            depot.basicInfo.oneLiner = line;
          }
        }
      } else if (currentSection === 'adv') {
        const cleanAdv = line.replace(/^[\d+•\-\*、. ]+/, '').trim();
        const isHeaderLike = /(?:1[3-9]\d{9}|@|https?:|深圳大学|求职|简历|APPLICATION)/i.test(cleanAdv);
        if (cleanAdv.length >= 6 && !isHeaderLike) {
          depot.advantages.push(cleanAdv);
        }
      } else if (currentSection === 'work') {
        // 判断是否是内嵌的项目块
        const isInlineProj = /(?:^【?项目[一二三四五12345:：]|●\s*项目|◆\s*项目|主导项目|负责项目|核心项目)/i.test(line);
        if (isInlineProj) {
          if (currentProj) depot.projects.push(currentProj);
          currentProj = {
            id: 'p_' + Math.random().toString(36).substr(2, 6),
            name: line.replace(/^[\d+•\-\*、. 【】\[\]●◆项目:： ]+/, '').trim() || '重点项目',
            role: '主导/核心成员',
            period: '项目周期',
            desc: '',
            results: ''
          };
          return;
        }

        const hasDate = /(20\d{2}[.\-\/年]\d{1,2}|至今|现在)/.test(line);
        const isCompanyEntity = /(?:公司|科技|企业|集团|店|社|工作室|品牌|平台|互娱|传媒|Studio|Club|有限公司)/i.test(line);
        const hasSplit = /[|｜]/.test(line);

        if (hasDate && (hasSplit || isCompanyEntity || line.length < 50)) {
          if (currentWork) depot.workExperiences.push(currentWork);
          const parts = line.split(/[|｜]/).map(p => p.trim());
          let period = '';
          let company = '';
          let role = '';

          parts.forEach(p => {
            if (/(20\d{2}|至今)/.test(p)) {
              period = p;
            } else if (!company && /(?:公司|科技|企业|集团|工作室|品牌|互娱|传媒|Studio|Club|有限公司|网络|网络科技|信息科技|电子商务|文化传媒)/i.test(p)) {
              company = p;
            } else if (!role) {
              role = p;
            } else if (!company) {
              company = p;
            }
          });

          currentWork = {
            id: 'w_' + Math.random().toString(36).substr(2, 6),
            company: company || '重点实战企业',
            role: role || '运营/核心业务专家',
            period: period || '在职期间',
            desc: '',
            achievements: []
          };
        } else if (currentProj) {
          if (/^(?:业绩|成果|量化|产出|结果|指标)/.test(line) || /[\d+%万GMR]/.test(line) && line.length > 15) {
            currentProj.results = (currentProj.results ? currentProj.results + '；' : '') + line.replace(/^[\d+•\-\*、. 核心业绩成果量化:：]+/, '').trim();
          } else {
            currentProj.desc = (currentProj.desc ? currentProj.desc + '\n' : '') + line.replace(/^[•\-\* ]+/, '');
          }
        } else if (currentWork) {
          if (/^(?:业绩|成果|量化|产出|核心业绩|指标|【业绩】)/.test(line) || /[\d+%万GMR]/.test(line) && line.length > 15) {
            currentWork.achievements.push(line.replace(/^[\d+•\-\*、. 核心业绩成果量化:：]+/, '').trim());
          } else {
            currentWork.desc = (currentWork.desc ? currentWork.desc + '\n' : '') + line.replace(/^[•\-\* ]+/, '');
          }
        }
      } else if (currentSection === 'proj') {
        const hasDate = /(20\d{2}[.\-\/年]\d{1,2}|至今)/.test(line);
        const hasSplit = /[|｜]/.test(line);
        const isProjStart = hasDate || hasSplit || /^(?:【|●|◆|项目[一二三四五12345:：]|AIGC|千万级|实战)/i.test(line);

        if (isProjStart && line.length < 70) {
          if (currentProj) depot.projects.push(currentProj);
          const parts = line.split(/[|｜]/).map(p => p.trim());
          let name = '';
          let role = '';
          let period = '';
          parts.forEach(p => {
            if (/(20\d{2}|至今)/.test(p)) period = p;
            else if (!name) name = p.replace(/^[【●◆\d+、. ]+/, '');
            else role = p;
          });
          currentProj = {
            id: 'p_' + Math.random().toString(36).substr(2, 6),
            name: name || '重要项目',
            role: role || '主导/核心成员',
            period: period || '项目周期',
            desc: '',
            results: ''
          };
        } else if (currentProj) {
          if (/^(?:业绩|成果|产出|结果|指标|项目业绩)/.test(line)) {
            currentProj.results = (currentProj.results ? currentProj.results + '；' : '') + line.replace(/^[\d+•\-\*、. 项目业绩成果产出:：]+/, '').trim();
          } else {
            currentProj.desc = (currentProj.desc ? currentProj.desc + ' ' : '') + line.replace(/^[•\-\* ]+/, '');
          }
        }
      } else if (currentSection === 'skills') {
        const rawTokens = line.split(/[,，、/|｜;；\t]/).map(t => t.trim()).filter(Boolean);
        rawTokens.forEach(token => {
          const cleanToken = token.replace(/^[•\-\* ]+/, '').trim();
          if (cleanToken && cleanToken.length <= 30 && !depot.skills.includes(cleanToken)) {
            depot.skills.push(cleanToken);
          }
        });
      } else if (currentSection === 'hobbies') {
        const hasSkills = KNOWN_SKILL_KEYWORDS.some(sk => line.toUpperCase().includes(sk.toUpperCase()));
        if (hasSkills) {
          const rawTokens = line.split(/[,，、/|｜;；\t]/).map(t => t.trim()).filter(Boolean);
          rawTokens.forEach(token => {
            const cleanToken = token.replace(/^[•\-\* ]+/, '').trim();
            if (!cleanToken) return;
            const isSkill = KNOWN_SKILL_KEYWORDS.some(sk => cleanToken.toUpperCase().includes(sk.toUpperCase()));
            if (isSkill) {
              if (!depot.skills.includes(cleanToken)) depot.skills.push(cleanToken);
            } else if (cleanToken.length <= 25 && !depot.hobbies.includes(cleanToken)) {
              depot.hobbies.push(cleanToken);
            }
          });
        } else {
          const rawTokens = line.split(/[,，、/|｜;；\t]/).map(t => t.trim()).filter(Boolean);
          rawTokens.forEach(token => {
            const cleanToken = token.replace(/^[•\-\* ]+/, '').trim();
            if (cleanToken && cleanToken.length <= 25 && !depot.hobbies.includes(cleanToken)) {
              depot.hobbies.push(cleanToken);
            }
          });
        }
      } else if (currentSection === 'intro') {
        if (/^(?:生活方式|爱好|兴趣|个人爱好|业余生活)[：:]/i.test(line) || /Livehouse|音乐现场|城市探索|户外扫街|鸡尾酒|单板滑雪|公路骑行/i.test(line)) {
          const rawTokens = line.replace(/^(?:生活方式|爱好|兴趣)[：:]/i, '').split(/[,，、/|｜;；\t]/).map(t => t.trim()).filter(Boolean);
          rawTokens.forEach(t => {
            const clean = t.replace(/^[•\-\* ]+/, '').trim();
            if (clean && clean.length <= 25 && !depot.hobbies.includes(clean)) depot.hobbies.push(clean);
          });
        }
        if (!depot.selfIntro.full) depot.selfIntro.full = line;
        else depot.selfIntro.full += '\n' + line;
      } else if (currentSection === 'edu') {
        if (!currentEdu) {
          const parts = line.split(/[|｜\t ]+/).filter(Boolean);
          currentEdu = {
            school: parts[0] || depot.basicInfo.school || '高等院校',
            major: parts[1] || '专业方向',
            degree: parts[2] || '本科',
            period: parts[3] || '就读期间',
            highlights: ''
          };
          depot.education.push(currentEdu);
        } else {
          currentEdu.highlights += (currentEdu.highlights ? ' ' : '') + line;
        }
      }
    });

    if (currentWork) depot.workExperiences.push(currentWork);
    if (currentProj) depot.projects.push(currentProj);

    // 重点项目兜底提取：若 projects 为空，从工作职责中扫描项目块
    if (depot.projects.length === 0) {
      depot.workExperiences.forEach(w => {
        if (w.desc && (w.desc.includes('项目') || w.desc.includes('操盘') || w.desc.includes('战役') || w.desc.includes('SOP'))) {
          const pLines = w.desc.split('\n');
          pLines.forEach(pl => {
            if (pl.includes('项目') || pl.includes('战役') || pl.includes('方案') || pl.includes('工作流')) {
              depot.projects.push({
                id: 'p_' + Math.random().toString(36).substr(2, 6),
                name: pl.slice(0, 35).replace(/^[•\-\* ]+/, ''),
                role: w.role || '主导/核心成员',
                period: w.period || '实战期间',
                desc: pl,
                results: (w.achievements && w.achievements[0]) || '取得显著业务突破与量化成果'
              });
            }
          });
        }
      });
    }

    // 技能与爱好二次安全清洗：将所有误留在 hobbies 中的已知技能移回 skills
    if (depot.hobbies && depot.hobbies.length > 0) {
      const remainingHobbies = [];
      depot.hobbies.forEach(h => {
        const isSkill = KNOWN_SKILL_KEYWORDS.some(sk => h.toUpperCase().includes(sk.toUpperCase()));
        if (isSkill) {
          if (!depot.skills.includes(h)) depot.skills.push(h);
        } else {
          remainingHobbies.push(h);
        }
      });
      depot.hobbies = remainingHobbies;
    }

    if (depot.selfIntro.full) {
      depot.selfIntro.short = depot.selfIntro.full.slice(0, 85) + '...';
    } else {
      depot.selfIntro.short = '执行力强，注重数据与实际成果落地，具备多业务跨领域实战经验，沟通协作敏捷高效、抗压即战力强。';
      depot.selfIntro.full = '具备敏锐的商业与数据归因习惯，对工作充满敬业与自驱热情。在以往经历中注重以终为始建立规范化SOP，既有大促节点的冲刺爆发力，又有日常精细化运营与社群维护耐心。为人真诚好沟通，能迅速融入团队打赢硬仗。';
    }

    return depot;
  }

  // 渲染武器库结构化界面
  function renderResumeDepot(depot) {
    if (!depot) return;
    currentResumeDepot = depot;

    // 0. 基本信息渲染
    renderBasicInfo(depot.basicInfo);

    // 1. 优势渲染 (支持删除、编辑)
    renderAdvantages(depot.advantages);

    // 2. 工作经历渲染
    const workListEl = document.getElementById('depot-work-list');
    if (workListEl) {
      workListEl.innerHTML = '';
      (depot.workExperiences || []).forEach(work => {
        const card = document.createElement('div');
        card.className = 'depot-work-card';
        const fullWorkText = `${work.company} | ${work.role} (${work.period})\n工作职责：\n${work.desc}\n核心业绩：\n${(work.achievements || []).join('\n')}`;

        card.innerHTML = `
          <div class="work-card-top">
            <div class="work-org-info">
              <span class="work-company">${work.company}</span>
              <button class="mini-copy-btn" data-copy="${encodeURIComponent(work.company)}" title="复制公司名">📋 公司</button>
              <span class="work-role">${work.role}</span>
              <button class="mini-copy-btn" data-copy="${encodeURIComponent(work.role)}" title="复制岗位">📋 岗位</button>
              <span class="work-period">📅 ${work.period}</span>
              <button class="mini-copy-btn" data-copy="${encodeURIComponent(work.period)}" title="复制时间">📋 时间</button>
            </div>
            <div class="work-actions">
              <button class="mini-copy-btn" data-copy="${encodeURIComponent(fullWorkText)}" style="background:rgba(59,130,246,0.15); border-color:#3b82f6; color:#93c5fd;">📋 复制整段经历</button>
            </div>
          </div>
          ${work.desc ? `<div class="work-desc"><b>【职责内容】</b>：${work.desc} <button class="mini-copy-btn" data-copy="${encodeURIComponent(work.desc)}" style="font-size:10px; padding:1px 6px;">复制职责</button></div>` : ''}
          ${work.achievements && work.achievements.length > 0 ? `
            <div style="margin-top:6px;">
              <b style="font-size:12.5px; color:#34d399;">【核心业绩产出】</b>:
              <ul class="work-achieve-list">
                ${work.achievements.map(a => `<li>${a} <button class="mini-copy-btn" data-copy="${encodeURIComponent(a)}" style="font-size:10px; padding:1px 6px; margin-left:4px;">复制此条</button></li>`).join('')}
              </ul>
            </div>
          ` : ''}
        `;
        workListEl.appendChild(card);
      });
    }

    // 3. 项目经历渲染
    const projListEl = document.getElementById('depot-proj-list');
    if (projListEl) {
      projListEl.innerHTML = '';
      if (!depot.projects || depot.projects.length === 0) {
        projListEl.innerHTML = '<div style="padding:16px; color:#64748b; font-size:12.5px;">暂未识别到独立项目，若项目在工作经历中，可切换至「📝 原始分段自由复制视图」快速复制对应段落！</div>';
      } else {
        depot.projects.forEach(proj => {
          const card = document.createElement('div');
          card.className = 'depot-proj-card';
          const fullProjText = `${proj.name} | ${proj.role} (${proj.period})\n项目描述：${proj.desc}\n项目业绩：${proj.results}`;

          card.innerHTML = `
            <div class="proj-card-top">
              <div class="work-org-info">
                <span class="proj-name">${proj.name}</span>
                <button class="mini-copy-btn" data-copy="${encodeURIComponent(proj.name)}">📋 项目名</button>
                <span class="proj-role">${proj.role}</span>
                <button class="mini-copy-btn" data-copy="${encodeURIComponent(proj.role)}">📋 角色</button>
                <span class="work-period">📅 ${proj.period}</span>
              </div>
              <div class="work-actions">
                <button class="mini-copy-btn" data-copy="${encodeURIComponent(fullProjText)}" style="background:rgba(168,85,247,0.15); border-color:#a855f7; color:#d8b4fe;">📋 复制整段项目</button>
              </div>
            </div>
            ${proj.desc ? `<div class="work-desc"><b>【项目详情】</b>：${proj.desc} <button class="mini-copy-btn" data-copy="${encodeURIComponent(proj.desc)}" style="font-size:10px; padding:1px 6px;">复制描述</button></div>` : ''}
            ${proj.results ? `<div class="work-desc" style="color:#a7f3d0;"><b>【量化产出】</b>：${proj.results} <button class="mini-copy-btn" data-copy="${encodeURIComponent(proj.results)}" style="font-size:10px; padding:1px 6px;">复制成果</button></div>` : ''}
          `;
          projListEl.appendChild(card);
        });
      }
    }

    // 4. 技能清单渲染
    const skillsBoxEl = document.getElementById('depot-skills-box');
    if (skillsBoxEl) {
      skillsBoxEl.innerHTML = '';
      (depot.skills || []).forEach(skill => {
        const chip = document.createElement('div');
        chip.className = 'skill-chip';
        chip.setAttribute('data-copy', encodeURIComponent(skill));
        chip.innerHTML = `<span>${skill}</span> <span style="font-size:10px; opacity:0.7;">📋</span>`;
        skillsBoxEl.appendChild(chip);
      });
    }

    // 5. 兴趣爱好渲染
    const hobbiesBoxEl = document.getElementById('depot-hobbies-box');
    if (hobbiesBoxEl) {
      hobbiesBoxEl.innerHTML = '';
      (depot.hobbies || []).forEach(hobby => {
        const chip = document.createElement('div');
        chip.className = 'skill-chip';
        chip.style.borderColor = 'rgba(244,63,94,0.35)';
        chip.style.color = '#fecdd3';
        chip.setAttribute('data-copy', encodeURIComponent(hobby));
        chip.innerHTML = `<span>${hobby}</span> <span style="font-size:10px; opacity:0.7;">📋</span>`;
        hobbiesBoxEl.appendChild(chip);
      });
    }

    // 6. 自我评价
    if (depot.selfIntro) {
      const shortEl = document.getElementById('intro-short-text');
      const fullEl = document.getElementById('intro-full-text');
      if (shortEl && depot.selfIntro.short) shortEl.textContent = depot.selfIntro.short;
      if (fullEl && depot.selfIntro.full) fullEl.textContent = depot.selfIntro.full;
    }

    // 7. 教育背景
    const eduBoxEl = document.getElementById('depot-edu-box');
    if (eduBoxEl) {
      eduBoxEl.innerHTML = '';
      (depot.education || []).forEach(edu => {
        const item = document.createElement('div');
        item.className = 'depot-edu-item';
        const fullEdu = `${edu.school} | ${edu.major} | ${edu.degree} (${edu.period}) ${edu.highlights || ''}`;
        item.innerHTML = `
          <div>
            <span class="edu-school">${edu.school}</span>
            <span class="edu-major"> · ${edu.major} (${edu.degree})</span>
            <div class="edu-period">📅 ${edu.period} ${edu.highlights ? `| ${edu.highlights}` : ''}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="mini-copy-btn" data-copy="${encodeURIComponent(edu.school)}">📋 学校</button>
            <button class="mini-copy-btn" data-copy="${encodeURIComponent(edu.major)}">📋 专业</button>
            <button class="mini-copy-btn" data-copy="${encodeURIComponent(fullEdu)}">📋 复制全部</button>
          </div>
        `;
        eduBoxEl.appendChild(item);
      });
    }

    // 8. 原始段落自由复制渲染
    const rawSegments = depot.rawSegments || splitRawParagraphs(document.getElementById('raw-resume-text')?.value || '');
    renderRawSegments(rawSegments);

    // 绑定所有的 data-copy 点击复制事件
    bindDepotCopyEvents();

    // 更新状态提示
    const statusText = document.getElementById('parse-status-text');
    if (statusText) {
      const workCount = depot.workExperiences?.length || 0;
      const projCount = depot.projects?.length || 0;
      const advCount = depot.advantages?.length || 0;
      const skillCount = depot.skills?.length || 0;
      const hobbyCount = depot.hobbies?.length || 0;
      const segCount = rawSegments.length;
      statusText.textContent = `解析完毕：已归纳 ${workCount}段工作、${projCount}个项目、${advCount}条优势、${skillCount}个技能、${hobbyCount}项爱好，生成 ${segCount}个自然复制段落！`;
    }
  }

  // 渲染基础档案信息卡片
  function renderBasicInfo(info) {
    const box = document.getElementById('depot-basic-info-grid');
    if (!box) return;
    box.innerHTML = '';
    if (!info) return;

    const fields = [
      { label: '姓名', val: info.name || '求职候选人' },
      { label: '目标方向 / 岗位', val: info.targetRole || '综合运营/内容策划' },
      { label: '毕业院校', val: info.school || '高等院校' },
      { label: '联系手机', val: info.phone || '未提取到手机号' },
      { label: '联系邮箱', val: info.email || '未提取到邮箱' },
      { label: '在线作品集网址', val: info.portfolioUrl || '未提取到作品集URL' },
      { label: '一句话职业定位', val: info.oneLiner || '复合型实践者' }
    ];

    fields.forEach(f => {
      if (!f.val) return;
      const item = document.createElement('div');
      item.className = 'basic-info-card-item';
      item.innerHTML = `
        <div class="basic-info-left">
          <span class="basic-info-label">${f.label}</span>
          <span class="basic-info-val" title="${f.val}">${f.val}</span>
        </div>
        <button class="mini-copy-btn" data-copy="${encodeURIComponent(f.val)}">📋 复制</button>
      `;
      box.appendChild(item);
    });
  }

  // 渲染个人优势 (支持单项编辑、单项删除)
  function renderAdvantages(advantages = []) {
    const advListEl = document.getElementById('depot-adv-list');
    if (!advListEl) return;
    advListEl.innerHTML = '';

    if (!advantages || advantages.length === 0) {
      advListEl.innerHTML = `
        <div style="padding: 24px; text-align:center; color:#64748b; font-size:13px;">
          暂无个人优势（已被清空或未提取）。您可以点击右上角「➕ 添加优势」，或直接切换至「📝 原始分段自由复制视图」！
        </div>
      `;
      return;
    }

    advantages.forEach((adv, idx) => {
      const item = document.createElement('div');
      item.className = 'depot-adv-item';
      item.innerHTML = `
        <div class="depot-adv-text"><b>${idx + 1}.</b> ${adv}</div>
        <div class="adv-item-actions">
          <button class="mini-action-btn edit-adv-btn" data-idx="${idx}">✏️ 编辑</button>
          <button class="mini-action-btn del del-adv-btn" data-idx="${idx}">🗑️ 删除</button>
          <button class="mini-copy-btn" data-copy="${encodeURIComponent(adv)}">📋 复制</button>
        </div>
      `;

      item.querySelector('.edit-adv-btn').onclick = () => {
        const updated = prompt('编辑此条个人优势：', adv);
        if (updated !== null && updated.trim()) {
          currentResumeDepot.advantages[idx] = updated.trim();
          renderAdvantages(currentResumeDepot.advantages);
          chrome.storage.local.set({ resumeDepot: currentResumeDepot });
          showCopyToast('已更新此条优势！');
        }
      };

      item.querySelector('.del-adv-btn').onclick = () => {
        currentResumeDepot.advantages.splice(idx, 1);
        renderAdvantages(currentResumeDepot.advantages);
        chrome.storage.local.set({ resumeDepot: currentResumeDepot });
        showCopyToast('已删除此条优势！');
      };

      advListEl.appendChild(item);
    });
  }

  // 渲染原始自然段落卡片
  function renderRawSegments(segments = [], filterText = '') {
    const listEl = document.getElementById('raw-segments-list');
    const badgeEl = document.getElementById('raw-segments-count-badge');
    const tabBadgeEl = document.getElementById('raw-tab-badge');
    if (!listEl) return;

    let filtered = segments || [];
    if (filterText) {
      const ft = filterText.toLowerCase();
      filtered = filtered.filter(s => s.text.toLowerCase().includes(ft));
    }

    if (badgeEl) badgeEl.textContent = `共 ${segments.length} 个自然段落 (匹配 ${filtered.length} 段)`;
    if (tabBadgeEl) tabBadgeEl.textContent = `${segments.length}段`;

    listEl.innerHTML = '';
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">暂无匹配的简历段落</div>';
      return;
    }

    filtered.forEach(seg => {
      const card = document.createElement('div');
      card.className = 'raw-segment-card';
      card.innerHTML = `
        <div class="raw-segment-header">
          <div class="raw-segment-title">
            <span>📄 段落 #${seg.index}</span>
            <span class="raw-segment-len">(${seg.charCount} 字)</span>
          </div>
          <button class="mini-copy-btn" data-copy="${encodeURIComponent(seg.text)}">📋 一键复制本段</button>
        </div>
        <div class="raw-segment-body">${escapeHtml(seg.text)}</div>
      `;
      listEl.appendChild(card);
    });

    // 绑定本段复制
    listEl.querySelectorAll('[data-copy]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const text = decodeURIComponent(el.getAttribute('data-copy'));
        copyText(text, el);
      };
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 绑定动态复制按钮事件
  function bindDepotCopyEvents() {
    document.querySelectorAll('#resume-depot-result [data-copy]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const text = decodeURIComponent(el.getAttribute('data-copy'));
        copyText(text, el);
      };
    });
  }

  // 初始化武器库交互监听
  function initResumeDepotEvents() {
    // 1. 开始解析按钮
    const btnParse = document.getElementById('btn-start-parse-resume');
    const rawTextEl = document.getElementById('raw-resume-text');
    if (btnParse && rawTextEl) {
      btnParse.addEventListener('click', () => {
        const text = rawTextEl.value.trim();
        if (!text) {
          alert('请先输入或粘贴简历内容！');
          rawTextEl.focus();
          return;
        }
        const parsed = parseResumeText(text);
        if (parsed) {
          renderResumeDepot(parsed);
          // 自动保存至 storage
          chrome.storage.local.set({ resumeDepot: parsed }, () => {
            showCopyToast('简历已分类解析并自动保存至本地网申库！');
          });
        }
      });
    }

    // 2. 粘贴剪贴板
    const btnPaste = document.getElementById('btn-paste-from-clipboard');
    if (btnPaste && rawTextEl) {
      btnPaste.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard.readText().then(t => {
            if (t) {
              rawTextEl.value = t;
              showCopyToast('已从剪贴板读取简历文本！');
            } else {
              alert('剪贴板中无文本，请先在简历中按 Ctrl+C 复制！');
            }
          }).catch(() => {
            alert('浏览器未授予剪贴板读取权限，请直接在输入框按 Ctrl+V 粘贴！');
            rawTextEl.focus();
          });
        } else {
          rawTextEl.focus();
        }
      });
    }

    // 3. 填入范例简历
    const btnDemo = document.getElementById('btn-load-demo-resume');
    if (btnDemo && rawTextEl) {
      btnDemo.addEventListener('click', () => {
        rawTextEl.value = DEFAULT_SAMPLE_RESUME;
        const parsed = parseResumeText(DEFAULT_SAMPLE_RESUME);
        renderResumeDepot(parsed);
        showCopyToast('已载入标准求职范例简历并完成智能解析！');
      });
    }

    // 4. 文件上传与拖拽
    const fileInput = document.getElementById('resume-file-input');
    const triggerUploadBtn = document.getElementById('btn-trigger-upload-file');
    const dropzone = document.getElementById('resume-dropzone');

    if (triggerUploadBtn && fileInput) {
      triggerUploadBtn.addEventListener('click', () => fileInput.click());
    }
    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });
      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleResumeFile(e.dataTransfer.files[0]);
        }
      });
    }

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleResumeFile(e.target.files[0]);
        }
      });
    }

    // PDF 纯离线全文精准提取
    async function extractTextFromPDF(file) {
      if (!window.pdfjsLib) {
        throw new Error('PDF.js 组件未就绪，请刷新页面后重试！');
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = './libs/pdf.worker.js';
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        let lastY = null;
        let pageLines = [];
        let currentLine = '';

        const items = textContent.items || [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.str) continue;
          const currentY = item.transform[5];
          // 纵坐标变动明显则代表段落或换行
          if (lastY !== null && Math.abs(currentY - lastY) > 6) {
            if (currentLine.trim()) {
              pageLines.push(currentLine.trim());
            }
            currentLine = item.str;
          } else {
            // 同一行内的中英文间隔处理
            if (currentLine && !currentLine.endsWith(' ') && !/[\u4e00-\u9fa5]/.test(currentLine.slice(-1)) && !/[\u4e00-\u9fa5]/.test(item.str[0])) {
              currentLine += ' ';
            }
            currentLine += item.str;
          }
          lastY = currentY;
        }
        if (currentLine.trim()) {
          pageLines.push(currentLine.trim());
        }
        fullText += pageLines.join('\n') + '\n\n';
      }

      return fullText.trim();
    }

    // Word (.docx) 纯离线全文精准提取
    async function extractTextFromDocx(file) {
      if (!window.JSZip) {
        throw new Error('JSZip 组件未就绪！');
      }
      const arrayBuffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(arrayBuffer);
      const docXmlFile = zip.file('word/document.xml');
      if (!docXmlFile) {
        throw new Error('未在 DOCX 中找到正文内容文档！');
      }
      const xmlStr = await docXmlFile.async('string');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
      const paragraphs = xmlDoc.getElementsByTagName('w:p');
      const lines = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        const textNodes = p.getElementsByTagName('w:t');
        let lineText = '';
        for (let j = 0; j < textNodes.length; j++) {
          lineText += textNodes[j].textContent;
        }
        if (lineText.trim()) {
          lines.push(lineText.trim());
        }
      }

      return lines.join('\n');
    }

    async function handleResumeFile(file) {
      const filename = file.name.toLowerCase();
      const statusText = document.getElementById('parse-status-text');
      if (statusText) statusText.textContent = `正在读取并解析简历文件: ${file.name}...`;

      try {
        if (filename.endsWith('.json')) {
          const text = await file.text();
          const data = JSON.parse(text);
          renderResumeDepot(data);
          chrome.storage.local.set({ resumeDepot: data }, () => {
            showCopyToast(`成功导入 JSON 武器库数据 (${file.name})！`);
          });
          return;
        }

        let rawText = '';
        if (filename.endsWith('.pdf')) {
          if (statusText) statusText.textContent = `正在使用本地离线引擎深度解析 PDF 页面内容...`;
          rawText = await extractTextFromPDF(file);
          if (!rawText || rawText.length < 20) {
            alert('该 PDF 文件未能提取出文字内容（可能是纯图片扫描件）。\n\n建议直接在 Word 中复制文字，或粘贴到右侧输入框即可快速解析！');
            if (statusText) statusText.textContent = '提示：该 PDF 可能是纯图片扫描件，请直接粘贴文字';
            return;
          }
        } else if (filename.endsWith('.docx')) {
          if (statusText) statusText.textContent = `正在解压提取 Word DOCX 段落内容...`;
          rawText = await extractTextFromDocx(file);
        } else {
          // .txt, .md, .doc 或纯文本文件
          rawText = await file.text();
        }

        if (rawTextEl) rawTextEl.value = rawText;
        const parsed = parseResumeText(rawText);
        if (parsed) {
          renderResumeDepot(parsed);
          chrome.storage.local.set({ resumeDepot: parsed }, () => {
            showCopyToast(`已成功深度解析简历 (${file.name}) 并保存至本地网申库！`);
          });
        }
      } catch (err) {
        console.error('简历文件读取异常:', err);
        alert(`解析文件失败: ${err.message || '未知错误'}\n\n您可直接复制简历文字，粘贴至右侧文本框进行智能分类解析！`);
        if (statusText) statusText.textContent = '解析失败：建议直接复制简历文字粘贴后解析';
      }
    }

    // 5. 视图双模切换 (智能分类 vs 原始分段)
    const tabStructured = document.getElementById('tab-btn-structured');
    const tabRaw = document.getElementById('tab-btn-raw-segments');
    const panelStructured = document.getElementById('resume-depot-result');
    const panelRaw = document.getElementById('resume-raw-segments-result');

    if (tabStructured && tabRaw && panelStructured && panelRaw) {
      tabStructured.addEventListener('click', () => {
        tabStructured.classList.add('active');
        tabRaw.classList.remove('active');
        panelStructured.style.display = 'block';
        panelRaw.style.display = 'none';
      });

      tabRaw.addEventListener('click', () => {
        tabRaw.classList.add('active');
        tabStructured.classList.remove('active');
        panelStructured.style.display = 'none';
        panelRaw.style.display = 'block';

        // 切换时如果尚未渲染原始段落，根据当前文本重新生成
        const rawText = rawTextEl?.value || '';
        const segments = currentResumeDepot?.rawSegments?.length ? currentResumeDepot.rawSegments : splitRawParagraphs(rawText);
        renderRawSegments(segments, document.getElementById('raw-segments-search')?.value.trim() || '');
      });
    }

    // 原始段落搜索过滤
    const rawSearchInput = document.getElementById('raw-segments-search');
    if (rawSearchInput) {
      rawSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        const segments = currentResumeDepot?.rawSegments?.length ? currentResumeDepot.rawSegments : splitRawParagraphs(rawTextEl?.value || '');
        renderRawSegments(segments, query);
      });
    }

    // 复制全部基本档案
    const btnCopyAllBasic = document.getElementById('btn-copy-all-basic');
    if (btnCopyAllBasic) {
      btnCopyAllBasic.addEventListener('click', () => {
        if (!currentResumeDepot?.basicInfo) return;
        const b = currentResumeDepot.basicInfo;
        const text = `姓名：${b.name || ''}\n定位：${b.targetRole || ''}\n学校：${b.school || ''}\n手机：${b.phone || ''}\n邮箱：${b.email || ''}\n作品集：${b.portfolioUrl || ''}\n简介：${b.oneLiner || ''}`;
        copyText(text.trim(), btnCopyAllBasic);
      });
    }

    // 优势模块交互：添加自定义优势与一键清空/隐藏
    const btnAddCustomAdv = document.getElementById('btn-add-custom-adv');
    if (btnAddCustomAdv) {
      btnAddCustomAdv.addEventListener('click', () => {
        const newAdv = prompt('请输入新增的核心优势亮点：');
        if (newAdv && newAdv.trim()) {
          if (!currentResumeDepot) currentResumeDepot = { advantages: [] };
          if (!currentResumeDepot.advantages) currentResumeDepot.advantages = [];
          currentResumeDepot.advantages.push(newAdv.trim());
          renderAdvantages(currentResumeDepot.advantages);
          chrome.storage.local.set({ resumeDepot: currentResumeDepot });
          showCopyToast('已成功添加新核心优势！');
        }
      });
    }

    const btnClearAllAdv = document.getElementById('btn-clear-all-adv');
    if (btnClearAllAdv) {
      btnClearAllAdv.addEventListener('click', () => {
        if (!currentResumeDepot?.advantages?.length) {
          alert('当前暂无优势内容可清空！');
          return;
        }
        if (confirm('确定要清空/隐藏当前全部个人优势吗？（清空后可随时使用原始分段视图复制，或点击「+ 添加优势」重新定制）')) {
          currentResumeDepot.advantages = [];
          renderAdvantages([]);
          chrome.storage.local.set({ resumeDepot: currentResumeDepot });
          showCopyToast('已清空个人优势模块');
        }
      });
    }

    // 复制清洗后全文段落
    const btnCopyAllRawSegments = document.getElementById('btn-copy-all-raw-segments');
    if (btnCopyAllRawSegments) {
      btnCopyAllRawSegments.addEventListener('click', () => {
        const segments = currentResumeDepot?.rawSegments?.length ? currentResumeDepot.rawSegments : splitRawParagraphs(rawTextEl?.value || '');
        if (!segments.length) {
          alert('当前暂无简历段落！');
          return;
        }
        const full = segments.map(s => `【段落 ${s.index}】\n${s.text}`).join('\n\n');
        copyText(full, btnCopyAllRawSegments);
      });
    }

    // 6. 各板块全部复制按钮
    const btnCopyAllAdv = document.getElementById('btn-copy-all-adv');
    if (btnCopyAllAdv) {
      btnCopyAllAdv.addEventListener('click', () => {
        if (!currentResumeDepot?.advantages?.length) return;
        const allText = currentResumeDepot.advantages.map((a, i) => `${i + 1}. ${a}`).join('\n');
        copyText(allText, btnCopyAllAdv);
      });
    }

    const btnCopyAllWork = document.getElementById('btn-copy-all-work');
    if (btnCopyAllWork) {
      btnCopyAllWork.addEventListener('click', () => {
        if (!currentResumeDepot?.workExperiences?.length) return;
        const allText = currentResumeDepot.workExperiences.map(w => {
          return `【${w.company}】${w.role} (${w.period})\n职责：${w.desc}\n业绩：\n${(w.achievements || []).map(a => '• ' + a).join('\n')}`;
        }).join('\n\n');
        copyText(allText, btnCopyAllWork);
      });
    }

    const btnCopyAllProj = document.getElementById('btn-copy-all-proj');
    if (btnCopyAllProj) {
      btnCopyAllProj.addEventListener('click', () => {
        if (!currentResumeDepot?.projects?.length) return;
        const allText = currentResumeDepot.projects.map(p => {
          return `【项目：${p.name}】(${p.role} / ${p.period})\n详情：${p.desc}\n量化产出：${p.results}`;
        }).join('\n\n');
        copyText(allText, btnCopyAllProj);
      });
    }

    const btnCopyAllSkills = document.getElementById('btn-copy-all-skills');
    if (btnCopyAllSkills) {
      btnCopyAllSkills.addEventListener('click', () => {
        if (!currentResumeDepot?.skills?.length) return;
        copyText(currentResumeDepot.skills.join(', '), btnCopyAllSkills);
      });
    }

    const btnCopyAllHobbies = document.getElementById('btn-copy-all-hobbies');
    if (btnCopyAllHobbies) {
      btnCopyAllHobbies.addEventListener('click', () => {
        if (!currentResumeDepot?.hobbies?.length) return;
        copyText(currentResumeDepot.hobbies.join(', '), btnCopyAllHobbies);
      });
    }

    const btnCopyIntroShort = document.getElementById('btn-copy-intro-short');
    if (btnCopyIntroShort) {
      btnCopyIntroShort.addEventListener('click', () => {
        const text = document.getElementById('intro-short-text')?.textContent || '';
        copyText(text, btnCopyIntroShort);
      });
    }

    const btnCopyIntroFull = document.getElementById('btn-copy-intro-full');
    if (btnCopyIntroFull) {
      btnCopyIntroFull.addEventListener('click', () => {
        const text = document.getElementById('intro-full-text')?.textContent || '';
        copyText(text, btnCopyIntroFull);
      });
    }

    const btnCopyAllEdu = document.getElementById('btn-copy-all-edu');
    if (btnCopyAllEdu) {
      btnCopyAllEdu.addEventListener('click', () => {
        if (!currentResumeDepot?.education?.length) return;
        const allEdu = currentResumeDepot.education.map(e => `${e.school} | ${e.major} | ${e.degree} (${e.period}) ${e.highlights || ''}`).join('\n');
        copyText(allEdu, btnCopyAllEdu);
      });
    }

    // 7. 保存武器库
    const btnSaveDepot = document.getElementById('btn-save-resume-depot');
    if (btnSaveDepot) {
      btnSaveDepot.addEventListener('click', () => {
        if (!currentResumeDepot) {
          alert('当前暂无解析内容，请先上传或解析简历！');
          return;
        }
        chrome.storage.local.set({ resumeDepot: currentResumeDepot }, () => {
          showCopyToast('✓ 简历速填武器库已永久保存到本地存储！');
        });
      });
    }

    // 8. 导出武器库 JSON
    const btnExportJson = document.getElementById('btn-export-resume-depot');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        if (!currentResumeDepot) {
          alert('暂无简历数据可导出！');
          return;
        }
        const jsonStr = JSON.stringify(currentResumeDepot, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `JobCruise_网申简历武器库_${getLocalDateStr()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showCopyToast('简历武器库 JSON 备份已导出！');
      });
    }

    // 8.1 导入武器库 JSON
    const btnTriggerImportDepot = document.getElementById('btn-trigger-import-depot');
    const inputImportDepot = document.getElementById('input-import-depot-file');
    if (btnTriggerImportDepot && inputImportDepot) {
      btnTriggerImportDepot.addEventListener('click', () => {
        inputImportDepot.click();
      });

      inputImportDepot.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const depotData = JSON.parse(evt.target.result);
            if (!depotData || typeof depotData !== 'object') {
              throw new Error('无效的简历 JSON 文件');
            }
            const targetDepot = depotData.resumeDepot || depotData;
            currentResumeDepot = targetDepot;
            renderResumeDepot(targetDepot);
            chrome.storage.local.set({ resumeDepot: targetDepot }, () => {
              showCopyToast('✅ 简历武器库已成功导入并保存至本地网申库！');
            });
          } catch (err) {
            alert('简历库导入失败：' + (err.message || '文件格式不正确'));
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    // 9. 清空重置
    const btnClearDepot = document.getElementById('btn-clear-resume-depot');
    if (btnClearDepot) {
      btnClearDepot.addEventListener('click', () => {
        if (confirm('确定要清空当前的简历武器库数据吗？')) {
          chrome.storage.local.remove(['resumeDepot'], () => {
            currentResumeDepot = null;
            if (rawTextEl) rawTextEl.value = '';
            document.getElementById('depot-basic-info-grid').innerHTML = '';
            document.getElementById('depot-adv-list').innerHTML = '';
            document.getElementById('depot-work-list').innerHTML = '';
            document.getElementById('depot-proj-list').innerHTML = '';
            document.getElementById('depot-skills-box').innerHTML = '';
            const hb = document.getElementById('depot-hobbies-box');
            if (hb) hb.innerHTML = '';
            document.getElementById('depot-edu-box').innerHTML = '';
            document.getElementById('raw-segments-list').innerHTML = '';
            document.getElementById('parse-status-text').textContent = '已清空：请上传或粘贴新的简历开始解析';
            showCopyToast('简历武器库已清空');
          });
        }
      });
    }

    // 10. 页面初次加载时回显已有武器库
    chrome.storage.local.get(['resumeDepot'], (res) => {
      if (res && res.resumeDepot) {
        renderResumeDepot(res.resumeDepot);
      } else {
        // 初次加载载入范例便于直接体验
        const parsed = parseResumeText(DEFAULT_SAMPLE_RESUME);
        renderResumeDepot(parsed);
      }
    });
  }

  // ================= 7. 每日全网求职情报与公众号直聘控制中心 =================
  const DEFAULT_DIGEST_JOBS = [
    {
      id: 'job_1',
      title: '海外商业化运营专家 (跨境电商)',
      company: 'Shopee (虾皮跨境)',
      salary: '20-35K·15薪',
      city: '深圳·南山区 (科技园)',
      category: '出海/商业化',
      source: '📱 微信公众号推文直招',
      tags: ['海外商业化', '大促操盘', '周末双休', '六险一金', '年终奖丰厚'],
      notes: '负责东南亚及拉美重点国家站点商业化流量分发与广告变现策略，统筹KA商家大促生命周期，建立数据归因模型。',
      url: 'https://careers.shopee.cn/',
      greeting: '您好！关注到Shopee招聘官方推文正在急聘【海外商业化运营专家】。我长期深耕出海与商业化运营赛道，熟悉海外市场流量漏斗与跨境生态，数据敏感度高、执行落地强。附上我的个人简历与项目案例，期待能与用人主管深入沟通！'
    },
    {
      id: 'job_2',
      title: '海外游戏社区运营 / 海外发行',
      company: '腾讯互娱 (IEG)',
      salary: '18-32K·16薪',
      city: '深圳·南山区 (科兴科学园)',
      category: '游戏/社区',
      source: '🏢 腾讯招聘官方公众号直招',
      tags: ['海外发行', 'Discord/X社群', '创作者生态', '周末双休', '免费早晚餐'],
      notes: '负责腾讯互娱重点出海自研及代理游戏在欧美及亚太地区的Discord/Reddit核心玩家社群搭建、KOL内容孵化与长线版本运营。',
      url: 'https://careers.tencent.com/search.html?query=co_1',
      greeting: '您好！看到腾讯互娱正在招募【海外游戏社区运营】。我有丰富的游戏用户生命周期运营与社群冷启动经验，擅长海外社群矩阵联动与创作者生态激励。简历与作品集已附上，期盼有机会加入IEG团队！'
    },
    {
      id: 'job_3',
      title: 'TikTok 跨境达人运营 / 商务经理',
      company: '字节跳动 (TikTok E-commerce)',
      salary: '22-38K·16薪',
      city: '深圳·福田区 (中心区中洲)',
      category: '电商/达人',
      source: '🚀 字节跳动招聘推文内推',
      tags: ['TikTok电商', '海外网红BD', '带货GMV', '大厂期权', '极客氛围'],
      notes: '负责北美/东南亚TikTok Shop核心类目达人拓展与矩阵签约，促成海外KOL达播带货合作，建立本地化达人服务SOP。',
      url: 'https://jobs.bytedance.com/',
      greeting: '您好！在字节招聘推文看到正在招募【TikTok 跨境达人运营/商务经理】。我具备成熟的达人BD开拓能力与高情商商务谈判经验，能独立攻坚头部海外红人建联。附件已附上以往商务履约与达人带货数据复盘，盼进一步交流！'
    },
    {
      id: 'job_4',
      title: '泛二次元游戏社区运营 / 本地化',
      company: '米哈游 (miHoYo 海外部)',
      salary: '18-30K·14薪',
      city: '深圳 / 支持部分远程',
      category: '游戏/社区',
      source: '🎮 米哈游招聘推文直聘',
      tags: ['二次元出海', '玩家生态', 'UGC运营', '年度大促', '节日大礼包'],
      notes: '负责出海泛二次元旗舰产品的全球同服社群氛围建设、二创大赛组织与本地化玩家反馈跟踪，维护高粘性核心KOC。',
      url: 'https://jobs.mihoyo.com/',
      greeting: '您好！在米哈游招聘推文看到海外业务正在招聘【泛二次元游戏社区运营】。我本身热爱二次元与游戏文化，对核心玩家心理与UGC内容共创有深刻洞察与落地实战。附上我的个人简历与社区运营作品案例，诚挚期待交流！'
    },
    {
      id: 'job_5',
      title: '海外网红媒介拓展 / 商业化运营',
      company: 'SHEIN (希音跨境独角兽)',
      salary: '16-28K·14薪',
      city: '深圳·南山区 (后海汇)',
      category: '出海/商业化',
      source: '📱 微信公众号推文直招',
      tags: ['快时尚出海', 'Instagram/YT网红', 'ROI导向', '扁平管理', '年终丰厚'],
      notes: '负责SHEIN快时尚与美妆家居品类在海外各大主流社媒的KOL/KOC投放与招募，监控ROI投放产出并沉淀爆款合作打法。',
      url: 'https://talent.shein.com/',
      greeting: '您好！关注到希音官方招聘正在直招【海外网红媒介拓展/商业化运营】。我有海外社媒达人矩阵挖掘与投放归因经验，沟通韧性强、追求ROI正循环。附件已同步我的详细工作经历，希望能进一步沟通探讨！'
    },
    {
      id: 'job_6',
      title: '品牌商业摄影师 / 产品视觉创意策划',
      company: '影石 Insta360',
      salary: '16-26K·14薪',
      city: '深圳·宝安区 (海秀路)',
      category: '影像/视觉',
      source: '🏢 Insta360 官方直聘',
      tags: ['全景影像', '商业视觉', '高端产品静物', '创意制片', '年轻团队'],
      notes: '主导Insta360全景相机、运动相机及配件新品的全球宣发主视觉、电商KV摄影及场景化视觉包装，具备商业影棚全流程把控能力。',
      url: 'https://arashivision.hirede.com/',
      greeting: '您好！在Insta360官方招聘推文看到咱们在急聘【品牌商业摄影师/产品视觉创意策划】。我具备多年商业摄影与视觉策划经验，精通布光、构图、修图与场景调性把控，作品集链接已附于简历中，期待能参与打造顶级视觉作品！'
    },
    {
      id: 'job_7',
      title: '高级电商运营专员 / 独立站操盘',
      company: 'Anker (安克创新)',
      salary: '15-26K·14薪',
      city: '深圳·龙华区 / 南山区',
      category: '出海/商业化',
      source: '📱 安克创新公众号推文',
      tags: ['消费电子出海', '独立站运营', '精细化SOP', '五险一金', '海外差旅'],
      notes: '负责安克旗下充电、智能影音等海外独立站与亚马逊站点的日常精细化运营、爆款链接打造及大促活动节点规划。',
      url: 'https://anker.zhiye.com/',
      greeting: '您好！在安克创新招聘推文看到正在热招【高级电商运营专员】。我对消费电子出海运营及精细化SOP流程有着扎实的操盘经验，数据分析与抗压落地能力突出。简历与业绩已附在附件，期待与您深入沟通！'
    },
    {
      id: 'job_8',
      title: '商业空间与产品视觉总监 / 摄影主管',
      company: '喜茶 / 奈雪 (新茶饮品牌出海)',
      salary: '18-28K·14薪',
      city: '深圳·南山区 (大冲)',
      category: '影像/视觉',
      source: '📱 品牌官方公众号推文直聘',
      tags: ['品牌美学', '商业空间', '产品静物', '审美在线', '茶饮下午茶福利'],
      notes: '统筹品牌出海海外旗舰店空间陈列摄影、海外菜单主视觉及新品海报拍摄，把控品牌高品质调性输出。',
      url: 'https://careers.tencent.com/',
      greeting: '您好！关注到贵司官方推文正在招聘【商业空间与产品视觉摄影主管】。我具备成熟的品牌视觉包装、商业空间布光拍摄与后期把控实力，对新消费美学理解深刻。已附上个人摄影作品集，祝贵司业务蒸蒸日上！'
    },
    {
      id: 'job_9',
      title: '自研出海游戏本地化与用户运营',
      company: '莉莉丝游戏 (Lilith Games)',
      salary: '20-35K·16薪',
      city: '深圳 / 远程协同',
      category: '游戏/社区',
      source: '📱 莉莉丝招聘公众号直聘',
      tags: ['SLG出海', '全球同服', '周末双休', '餐饮补贴', '超高年终'],
      notes: '负责海外重度策略SLG及休闲新游的多语言本地化内容校对、跨文化玩家社群维护与节点线上活动策划。',
      url: 'https://careers.lilith.com/',
      greeting: '您好！在莉莉丝招聘公众号看到海外业务正在招聘【自研出海游戏本地化与用户运营】。我对海外主流游戏玩家习惯有深刻洞察，具备成熟的多语境沟通与玩家留存运营策略。简历已附，期盼获得交流机会！'
    },
    {
      id: 'job_10',
      title: '千川/信息流广告投放操盘手',
      company: '头部跨境品牌出海服务商',
      salary: '16-30K + 绩效提成',
      city: '深圳·南山区 (高新园)',
      category: '电商/达人',
      source: '⚡ 猎头直聘急招',
      tags: ['巨量千川', 'Meta/Google投放', '爆量素材', '五险一金', '高额提成'],
      notes: '负责百万级月度消耗账户的买量投放、计划搭建、素材创意脚本测试与ROI控制，与短视频编导紧密协作产出爆量素材。',
      url: 'https://www.zhipin.com/',
      greeting: '您好！看到咱们正在紧急招募【千川/信息流广告投放操盘手】。我熟悉主流投放工具与跑量底层逻辑，对素材网感与投产比把控严密，能抗高消耗指标。期待能与业务负责人直接沟通！'
    },
    {
      id: 'job_11',
      title: '微信视频号 / 抖音电商闭环运营',
      company: '知名品牌华南运营中心',
      salary: '14-22K·13薪',
      city: '深圳·福田区',
      category: '电商/达人',
      source: '📱 公众号直聘专栏',
      tags: ['全域电商', '自播团队', '排品策略', '五险一金', '定期团建'],
      notes: '负责品牌自播间人货场搭建、场控排品与数据复盘，优化直播间自然流承接与成交转化率。',
      url: 'https://www.lagou.com/',
      greeting: '您好！在直招推文看到贵司正在招聘【电商闭环运营】。我有全域直播间搭建与排品推品经验，擅长复盘留存与促单话术优化。简历已同步，期盼进一步联系！'
    },
    {
      id: 'job_12',
      title: '海外发行运营 / 媒介商务主管',
      company: '三七互娱 (37GAMES 海外中心)',
      salary: '16-28K·14薪',
      city: '深圳·南山区',
      category: '出海/商业化',
      source: '🏢 三七互娱招聘推文',
      tags: ['游戏发行', '全球买量', '海外渠道', '双休', '商业保险'],
      notes: '负责海外代理与自研产品在欧美日韩市场的渠道上架对接、海外KOL内容合作与公关推介，配合买量节奏促成新增爆发。',
      url: 'https://talent.37.com/',
      greeting: '您好！关注到三七互娱招聘推文正在招募【海外发行运营/媒介商务主管】。我对海外发行流程与渠道商务建联有系统化认知，执行力坚决，抗压即战力强。简历已附上，期待交流！'
    }
  ];

  const WECHAT_OFFICIAL_ACCOUNTS = [
    {
      name: '腾讯招聘 (Tencent_Recruit)',
      tag: '鹅厂直聘',
      desc: '腾讯官方招聘服务号，每周二/周四推送互娱IEG、CSIG、微信事业群深圳社招特急HC，支持免中介直接推送到总监HR。',
      tip: '💡 关注后回复【深圳运营】或进入底部菜单【社招通道】'
    },
    {
      name: '字节跳动招聘 (bytedance_jobs)',
      tag: '字节内推直聘',
      desc: '字节官方求职号，覆盖TikTok、抖音电商、商业化平台。推文内常附带一键内推二维码，简历直达直属业务Leader。',
      tip: '💡 关注后进入菜单【我要投递 - 社会招聘 - 工作城市选深圳】'
    },
    {
      name: '米哈游招聘 (miHoYo_Job)',
      tag: '米哈游全球HC',
      desc: '米哈游海外拓展与自研新品急聘通道，专注游戏运营、泛二次元社群生态、创作者矩阵与本地化岗位。',
      tip: '💡 关注后回复【海外运营】获取最新批次直聘岗位'
    },
    {
      name: 'Shopee虾皮招聘 (ShopeeCareers)',
      tag: '跨境出海标杆',
      desc: 'Shopee跨境电商与泛出海业务核心招聘号，深圳南山科技园研发与运营大本营，双休不内卷、六险一金福利标杆。',
      tip: '💡 关注后点击【微招聘 - 深圳社招 - 商业化/运营】'
    },
    {
      name: 'DJI大疆招聘 (DJI_Recruitment)',
      tag: '智能影像硬件出海',
      desc: '大疆创新官方社招推文发布平台，包含天空之城总部品牌视觉、商业摄影、海外本地化与产品运营专场。',
      tip: '💡 关注后点击【加入大疆 - 社会招聘 - 搜索设计/运营】'
    },
    {
      name: '华为招聘 (Huawei_Careers)',
      tag: '华为出海与终端',
      desc: '华为终端云服务与海外电商业务官方社招公众号，重点吸纳深港澳地区高素质出海运营、视觉与媒介商务人才。',
      tip: '💡 关注后进入【微招聘 - 社会招聘 - 工作地点深圳】'
    }
  ];

  function initDailyDigest() {
    let customJobs = [];
    let activeCity = 'ALL';
    let activeCategory = 'ALL';
    let searchKeyword = '';

    const container = document.getElementById('digest-cards-container');
    const wechatContainer = document.getElementById('wechat-accounts-container');
    const resultCountEl = document.getElementById('digest-result-count');
    const dateEl = document.getElementById('digest-current-date');

    // 动态渲染今日日期
    if (dateEl) {
      const now = new Date();
      dateEl.textContent = `今日发布：${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 (每日首次启动 Chrome 自动更新)`;
    }

    // 渲染公众号直聘卡片
    if (wechatContainer) {
      wechatContainer.innerHTML = WECHAT_OFFICIAL_ACCOUNTS.map(acc => `
        <div class="wechat-acc-card">
          <div class="wechat-acc-top">
            <span class="wechat-acc-name">${acc.name}</span>
            <span class="wechat-acc-tag">${acc.tag}</span>
          </div>
          <div class="wechat-acc-desc">${acc.desc}</div>
          <div class="wechat-acc-tip">${acc.tip}</div>
        </div>
      `).join('');
    }

    function loadCustomJobs(cb) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['customDigestJobs'], (res) => {
          if (res && Array.isArray(res.customDigestJobs)) {
            customJobs = res.customDigestJobs;
          }
          if (cb) cb();
        });
      } else {
        if (cb) cb();
      }
    }

    function renderCards() {
      if (!container) return;
      const allJobs = [...customJobs, ...DEFAULT_DIGEST_JOBS];

      const filtered = allJobs.filter(job => {
        // 地区筛选
        if (activeCity !== 'ALL') {
          if (activeCity === '深圳' && !job.city.includes('深圳')) return false;
          if (activeCity === '远程/出海' && (!job.city.includes('远程') && !job.city.includes('出海') && !job.category.includes('出海'))) return false;
        }
        // 赛道筛选
        if (activeCategory !== 'ALL') {
          if (activeCategory === '公众号直聘' && !job.source.includes('公众号')) return false;
          if (activeCategory !== '公众号直聘' && job.category !== activeCategory) return false;
        }
        // 搜索关键词
        if (searchKeyword.trim()) {
          const kw = searchKeyword.trim().toLowerCase();
          const targetText = `${job.title} ${job.company} ${job.city} ${job.notes} ${(job.tags || []).join(' ')}`.toLowerCase();
          if (!targetText.includes(kw)) return false;
        }
        return true;
      });

      if (resultCountEl) {
        resultCountEl.textContent = `共 ${filtered.length} 条精选情报 (已过滤)`;
      }

      if (filtered.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #94a3b8; background: rgba(0,0,0,0.2); border-radius: 10px;">
            <div style="font-size: 32px; margin-bottom: 8px;">🔍</div>
            <div style="font-weight: 600;">未找到符合当前条件的招聘情报</div>
            <div style="font-size: 11.5px; margin-top: 4px;">建议切换赛道分类、地区筛选或清空关键词重试。</div>
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(job => `
        <div class="digest-card" data-id="${job.id}">
          <div class="digest-card-header">
            <div class="digest-card-title">${job.title}</div>
            <div class="digest-card-salary">${job.salary}</div>
          </div>
          <div class="digest-card-sub">
            <span class="digest-company-name">🏢 ${job.company}</span>
            <span class="digest-city-tag">📍 ${job.city}</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
            <span style="color: #fbbf24; font-weight: 600;">${job.source}</span>
            <span style="color: #34d399; font-weight: 600;">✨ 契合度 98%</span>
          </div>
          <div class="digest-tags-row">
            ${(job.tags || []).map(t => `<span class="digest-tag-chip ${t.includes('双休') || t.includes('六险') || t.includes('年终') ? 'highlight' : ''}">${t}</span>`).join('')}
          </div>
          <div class="digest-notes-box">
            ${job.notes}
          </div>
          <div class="digest-card-actions">
            <button class="digest-btn-copy" data-greeting="${encodeURIComponent(job.greeting || '')}">
              📋 复制针对性自荐语
            </button>
            <a href="${job.url}" target="_blank" class="digest-btn-link" rel="noopener noreferrer">
              🚀 直达投递 / 推文 ↗
            </a>
          </div>
        </div>
      `).join('');

      container.querySelectorAll('.digest-btn-copy').forEach(btn => {
        btn.addEventListener('click', () => {
          const text = decodeURIComponent(btn.getAttribute('data-greeting') || '');
          if (text) {
            navigator.clipboard.writeText(text);
            showCopyToast('📋 该岗位专属定制自荐信已复制到剪贴板！');
          }
        });
      });
    }

    // 绑定地区按钮
    document.querySelectorAll('#digest-city-filters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#digest-city-filters .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeCity = chip.getAttribute('data-city');
        renderCards();
      });
    });

    // 绑定赛道按钮
    document.querySelectorAll('#digest-category-filters .filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#digest-category-filters .filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        activeCategory = chip.getAttribute('data-cat');
        renderCards();
      });
    });

    // 绑定搜索输入
    const searchInput = document.getElementById('digest-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchKeyword = e.target.value;
        renderCards();
      });
    }

    // 刷新按钮
    document.getElementById('btn-refresh-digest')?.addEventListener('click', () => {
      activeCity = 'ALL';
      activeCategory = 'ALL';
      searchKeyword = '';
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('#digest-city-filters .filter-chip').forEach(c => c.classList.remove('active'));
      document.querySelector('#digest-city-filters .filter-chip[data-city="ALL"]')?.classList.add('active');
      document.querySelectorAll('#digest-category-filters .filter-chip').forEach(c => c.classList.remove('active'));
      document.querySelector('#digest-category-filters .filter-chip[data-cat="ALL"]')?.classList.add('active');
      renderCards();
      showCopyToast('🔄 今日全网求职情报与公众号直招专栏已全部刷新！');
    });

    // 添加自定义线索弹窗
    const modal = document.getElementById('add-digest-job-modal');
    const openBtn = document.getElementById('btn-open-add-digest-job');
    const closeBtn = document.getElementById('btn-close-digest-modal');
    const cancelBtn = document.getElementById('btn-cancel-digest-modal');
    const confirmBtn = document.getElementById('btn-confirm-add-digest');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
      });
    }

    const closeModal = () => {
      if (modal) modal.style.display = 'none';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const title = (document.getElementById('digest-new-title')?.value || '').trim();
        const company = (document.getElementById('digest-new-company')?.value || '').trim();
        const salary = (document.getElementById('digest-new-salary')?.value || '').trim();
        const city = (document.getElementById('digest-new-city')?.value || '').trim();
        const cat = document.getElementById('digest-new-cat')?.value || '出海/商业化';
        const tagsRaw = (document.getElementById('digest-new-tags')?.value || '').trim();
        const url = (document.getElementById('digest-new-url')?.value || '').trim() || 'https://www.zhipin.com/';
        const notes = (document.getElementById('digest-new-notes')?.value || '').trim();

        if (!title || !company) {
          alert('请至少填写岗位名称和公司/团队名称！');
          return;
        }

        const newJob = {
          id: 'custom_' + Date.now(),
          title,
          company,
          salary: salary || '面议/高薪',
          city: city || '深圳',
          category: cat,
          source: '📌 自定义收集线索',
          tags: tagsRaw ? tagsRaw.split(/[,，\s]+/).filter(Boolean) : ['优质自招', '重点跟进'],
          notes: notes || '用户手动记录的高价值求职线索。',
          url,
          greeting: `您好！看到咱们在招聘【${title}】。我有丰富的相关业务方向实战经验，执行力强、注重数据产出，期待能与用人团队沟通！`
        };

        customJobs.unshift(newJob);
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ customDigestJobs: customJobs }, () => {
            closeModal();
            renderCards();
            showCopyToast('🎉 招聘线索已保存并置顶展示！');
          });
        }
      });
    }

    loadCustomJobs(() => {
      renderCards();
    });
  }

  // 初始化简历武器库事件
  initResumeDepotEvents();
  initDailyDigest();

  // 初始化加载
  loadAllData();
  runDailyRetrospective();
  renderIndustryRadar('ecommerce');
  renderBigTechStrategies();
  renderResumeAndPortfolioAdvice();

  // 实时跨日广播与数据同步总线
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'DATE_CHANGED') {
        console.log('[ZIAVER Dashboard] 收到跨日更新通知，重新载入统计大盘:', request.today);
        loadAllData();
        runDailyRetrospective();
        sendResponse({ status: 'ok' });
        return true;
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local') {
        if (changes.applyLog || changes.config || changes.jobTags) {
          loadAllData();
        }
      }
    });
  }

  // 定时心跳更新今日统计（每 30 秒感知日期跨越）
  setInterval(() => {
    updateBadges();
  }, 30000);
});
