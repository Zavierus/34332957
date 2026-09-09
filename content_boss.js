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

  // 捕获并抑制立即沟通弹出的聊天新标签页/新窗口，彻底防止页面跳入聊天页卡死
  let lastBossChatOpenedTime = 0;
  const rawWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (isRunning && url && (String(url).includes('/chat') || String(url).includes('/geek/chat') || String(url).includes('zhipin.com/web/geek/chat'))) {
      console.log('[ZIAVER BOSS] 成功捕获并抑制立即沟通弹出的聊天新标签页:', url);
      lastBossChatOpenedTime = Date.now();
      return null;
    }
    return rawWindowOpen.apply(this, arguments);
  };

  let activeTags = []; // 当前在后台勾选高亮生效的职业词条
  let userPreferenceProfile = null; // 用户手动投递偏好画像 (从后台深度学习沉淀)
  let savedBossFilters = null; // 已记忆的 BOSS 网页筛选参数
  let isAutomatingCard = false; // 标记是否为自动化巡航触发的点击 (杜绝误判为手动投递)

  let config = {
    dailyLimit: 70,
    timeSlotLimits: { morning: 20, afternoon: 30, evening: 20 },
    timeSlotCounts: { morning: 0, afternoon: 0, evening: 0 },
    acceptAllInPageFilter: true,
    minDelaySec: 9,
    maxDelaySec: 15,
    minSalaryK: 9,
    targetCity: '深圳',
    strictCityFilter: true,
    gradYear: '2024',
    enableCampus2024Protection: true,
    blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,培训生',
    enableDynamicGreeting: true,
    audioAlert: true,
    desktopNotification: true
  };

  // ================= 本地日历日期工具函数 (适配时区，杜绝 UTC 早晨滞后) =================
  function getLocalDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // ================= 分时段定义 (上午 06:00-12:00 | 下午 12:00-18:00 | 晚上 18:00-24:00/06:00) =================
  function getCurrentTimeSlot(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const hour = d.getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }

  function getTimeSlotDisplayName(slot) {
    if (slot === 'morning') return '🌅 上午 (06:00-12:00)';
    if (slot === 'afternoon') return '☀️ 下午 (12:00-18:00)';
    return '🌙 晚上 (18:00-24:00)';
  }

  // ================= BOSS 直聘顶部筛选自动化感知引擎 =================
  function getBossCurrentFilters() {
    let exp = '';
    let edu = '';
    let salary = '';
    let jobType = '';
    let city = '';
    let activeTab = '';
    let filterDetails = [];

    // 1. 扫描页面顶部筛选项按钮文字 (如 "工作经验 (1)", "学历要求 (1)")
    const filterElements = document.querySelectorAll(
      '.filter-select-box, .condition-filter-select, .current-select, [class*="filter-select"], [class*="condition-filter"], .search-condition-wrapper div, .search-condition-wrapper span, .condition-box div, .condition-box span, .filter-item, .dropdown-select'
    );
    for (const el of filterElements) {
      const txt = (el.textContent || '').trim();
      if (!txt) continue;
      if (/工作经验\s*\(\d+\)/.test(txt)) {
        exp = txt;
        filterDetails.push(txt);
      }
      if (/学历要求\s*\(\d+\)/.test(txt)) {
        edu = txt;
        filterDetails.push(txt);
      }
      if (/薪资待遇\s*\(\d+\)/.test(txt)) {
        salary = txt;
        filterDetails.push(txt);
      }
      if (/求职类型\s*\(\d+\)/.test(txt)) {
        jobType = txt;
        filterDetails.push(txt);
      }
      if (txt.includes('深圳') && (el.classList.contains('city-label') || el.classList.contains('active') || el.classList.contains('selected') || txt === '深圳')) {
        city = '深圳';
      }
    }

    // 2. 检查 URL 参数
    try {
      const params = new URLSearchParams(window.location.search);
      if (!exp && params.get('experience')) {
        exp = `工作经验(代码${params.get('experience')})`;
        filterDetails.push(exp);
      }
      if (!edu && params.get('degree')) {
        edu = `学历要求(代码${params.get('degree')})`;
        filterDetails.push(edu);
      }
      if (!salary && params.get('salary')) {
        salary = `薪资(代码${params.get('salary')})`;
        filterDetails.push(salary);
      }
      if (!jobType && params.get('jobType')) {
        jobType = `求职类型(代码${params.get('jobType')})`;
        filterDetails.push(jobType);
      }
      if (!city && (params.get('city') === '101280600' || window.location.href.includes('101280600'))) {
        city = '深圳';
      }
    } catch (e) {}

    // 3. 检查顶部活跃的子标签 (如 "兼职", "游戏运营(深圳)", "内容运营(深圳)")
    const activeTabEl = document.querySelector('.recommend-job-nav .active, .job-tab-box .active, .sub-nav .active, .tab-item.active, [class*="tab"][class*="active"]');
    if (activeTabEl) {
      activeTab = activeTabEl.textContent.trim();
      if (activeTab && activeTab !== '推荐') {
        filterDetails.push(`分类:${activeTab}`);
      }
    }

    const hasFilters = filterDetails.length > 0 || !!(exp || edu || salary || jobType);
    const summary = filterDetails.join(' · ') || (hasFilters ? '已开启页面精选筛选' : '未选(全量推荐)');

    return {
      hasFilters,
      exp,
      edu,
      salary,
      jobType,
      city,
      activeTab,
      summary
    };
  }

  // ================= 用户日常手动投递智能感知与深度学习引擎 =================
  let isManualInterceptorBound = false;
  function initManualApplyInterceptor() {
    if (isManualInterceptorBound) return;
    isManualInterceptorBound = true;

    document.addEventListener('click', (e) => {
      // 若当前是自动巡航脚本在点击，跳过捕获，防止自循环上报
      if (isAutomatingCard) return;

      const target = e.target;
      if (!target) return;

      // 探测是否点击了沟通按钮
      const btn = target.closest(
        '.btn-startchat, .op-btn-chat, .btn-sure, [ka*="job_list_chat"], [class*="startchat"], [class*="btn-chat"], [class*="btn-sure"]'
      );
      const btnText = (target.textContent || (btn ? btn.textContent : '')).trim();
      const isChatClick = !!btn || /立即沟通|继续沟通|打招呼|确定/i.test(btnText);

      if (!isChatClick) return;

      // 提取被点击岗位卡片的信息
      let card = target.closest('.job-card-wrapper, .job-card-box, .job-card, li.job-card-item, [class*="job-card"]');
      let title = '';
      let company = '';
      let salary = '';
      let experience = '';
      let education = '';
      let location = '';
      let hrName = '';
      let hrTitle = '';
      let tags = [];

      if (card) {
        const titleEl = card.querySelector('.job-name, .job-title, a[ka*="job_list_"], [class*="job-name"]');
        const companyEl = card.querySelector('.company-name, .company-info a, [class*="company-name"]');
        const salaryEl = card.querySelector('.salary, [class*="salary"]');
        const infoEl = card.querySelector('.tag-list, .job-tags, .info-desc');
        const hrEl = card.querySelector('.info-public, [class*="boss-info"]');

        title = titleEl ? titleEl.textContent.trim() : '';
        company = companyEl ? companyEl.textContent.trim() : '';
        salary = salaryEl ? salaryEl.textContent.trim() : '';
        const infoText = infoEl ? infoEl.textContent.trim() : '';
        
        if (infoText) {
          const parts = infoText.split(/[\s·,]+/);
          parts.forEach(p => {
            if (/年|应届|不限/.test(p)) experience = p;
            if (/大专|本科|硕士|学历/.test(p)) education = p;
            tags.push(p);
          });
        }
        if (hrEl) {
          hrName = hrEl.textContent.trim();
        }
      } else if (window.location.pathname.includes('/job_detail/')) {
        // 岗位详情页内手动投递
        const titleEl = document.querySelector('.name h1, .job-name, .pos-bread');
        const companyEl = document.querySelector('.company-info a, .business-info h3, .name-box a');
        const salaryEl = document.querySelector('.salary, .job-banner .salary');
        const bossNameEl = document.querySelector('.boss-info .boss-name, .job-boss-info .name');
        const infoEl = document.querySelector('.job-banner .tag-list, .job-banner .job-tags');

        title = titleEl ? titleEl.textContent.trim() : '';
        company = companyEl ? companyEl.textContent.trim() : '';
        salary = salaryEl ? salaryEl.textContent.trim() : '';
        hrName = bossNameEl ? bossNameEl.textContent.trim() : '';

        if (infoEl) {
          const parts = infoEl.textContent.split(/[\s·,]+/);
          parts.forEach(p => {
            if (/年|应届|不限/.test(p)) experience = p;
            if (/大专|本科|硕士/.test(p)) education = p;
            tags.push(p);
          });
        }
      }

      if (title || company) {
        const jobData = {
          title: title || '运营岗位',
          company: company || '直聘企业',
          salary: salary || '面议',
          experience: experience || '经验不限',
          education: education || '不限',
          tags: tags.filter(Boolean),
          location,
          hrName,
          hrTitle,
          platform: 'BOSS直聘',
          applyTime: new Date().toLocaleString()
        };

        chrome.runtime.sendMessage({
          type: 'LOG_MANUAL_APPLY',
          job: jobData
        }, (res) => {
          if (res && res.success && !res.duplicate) {
            logHUD(`<span class="highlight" style="color:#c084fc;">🧠 [偏好学习] 已感知并深度学习您手动投递的【${jobData.title}】(${jobData.company})！</span>`);
            if (res.profile) {
              userPreferenceProfile = res.profile;
            }
            updateHUD();
          }
        });
      }
    }, true);
  }

  function refreshConfig(callback) {
    if (!chrome.storage || !chrome.storage.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(['config', 'jobTags', 'userPreferenceProfile', 'savedBossFilters'], (res) => {
      const today = getLocalDateStr();
      if (res && res.userPreferenceProfile) {
        userPreferenceProfile = res.userPreferenceProfile;
      }
      if (res && res.savedBossFilters) {
        savedBossFilters = res.savedBossFilters;
      }

      if (res && res.config) {
        config = { ...config, ...res.config };
        if (!config.timeSlotLimits) {
          config.timeSlotLimits = { morning: 20, afternoon: 30, evening: 20 };
        }
        if (!config.timeSlotCounts) {
          config.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
        }
        if (config.acceptAllInPageFilter === undefined) {
          config.acceptAllInPageFilter = true;
        }

        if (config.lastActiveDate === today) {
          const counts = config.siteTodayCounts || {};
          todayCount = counts.boss !== undefined ? counts.boss : (config.todayCount || 0);
        } else {
          // 跨日检测：自动清零并写回 storage
          console.log(`[ZIAVER Autopilot] BOSS 直聘检测到跨日: 上次活跃「${config.lastActiveDate || '无'}」-> 今日「${today}」，执行清零`);
          todayCount = 0;
          config.lastActiveDate = today;
          config.todayCount = 0;
          config.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
          config.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
          chrome.storage.local.set({
            config: { ...config }
          });
        }
      } else {
        todayCount = 0;
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

  // ================= 严格地理位置核验引擎 (杜绝上海/异地侵入) =================
  function verifyJobLocation(card, title = '', company = '') {
    const targetCity = (config.targetCity || '深圳').trim();
    if (config.strictCityFilter === false) {
      return { pass: true, jobArea: targetCity };
    }

    // 异地知名城市库 (一旦在地点出现且未标明深圳，坚决直接拦截)
    const OTHER_CITIES = [
      '上海', '北京', '广州', '杭州', '成都', '武汉', '南京', '苏州', '西安',
      '长沙', '重庆', '天津', '郑州', '合肥', '青岛', '无锡', '宁波', '厦门',
      '福州', '东莞', '佛山', '珠海', '中山', '惠州', '济南', '沈阳', '大连',
      '昆明', '南宁', '长春', '哈尔滨', '石家庄', '太原', '贵阳', '南昌', '温州'
    ].filter(c => c !== targetCity);

    // 目标城市辖区 (以深圳为例)
    const SZ_DISTRICTS = ['南山', '福田', '宝安', '龙岗', '龙华', '罗湖', '光明', '坪山', '盐田', '大鹏'];

    // 1. 优先从卡片明确的地点 DOM 元素中提取
    const locSelectors = [
      '.job-area', '.job-area-wrapper', '[class*="job-area"]', '[class*="area-wrapper"]',
      '.job-city', '[class*="job-city"]', '.job-card-left .job-area', '.job-title .job-area'
    ];
    let jobArea = '';
    for (const sel of locSelectors) {
      const el = card ? card.querySelector(sel) : null;
      if (el && el.textContent.trim()) {
        jobArea = el.textContent.trim();
        break;
      }
    }

    // 若未直接命中专用元素，尝试从卡片信息描述行匹配 (例如 "深圳·南山区·科技园 1-3年 本科" 或 "上海·浦东新区")
    if (!jobArea && card) {
      const infoEl = card.querySelector('.info-desc, .job-info, .tag-list, .job-card-left');
      if (infoEl) {
        const m = infoEl.textContent.match(/([^\s·•|]+-[^\s·•|]+|[^\s·•|]+市|[^\s·•|]+区)/);
        if (m) jobArea = m[0];
      }
    }

    if (jobArea) {
      // 若包含目标城市或深圳明确辖区，直接核验通过
      if (jobArea.includes(targetCity) || (targetCity === '深圳' && SZ_DISTRICTS.some(d => jobArea.includes(d)))) {
        return { pass: true, jobArea };
      }
      // 若明确包含任一其它大中城市名（如上海），坚决秒级拦截
      const detectedOther = OTHER_CITIES.find(c => jobArea.includes(c));
      if (detectedOther) {
        return { pass: false, reason: `[异地跳过] 岗位地点为「${jobArea}」，明确归属异地城市(${detectedOther})，非${targetCity}` };
      }
      // 若页面当前已经锁定了目标城市（例如在深圳站 101280600 / 页面已选深圳），且未命中异地城市，放行商圈与地铁站地点
      const pageFilters = getBossCurrentFilters();
      if (pageFilters.city.includes(targetCity) || window.location.href.includes('101280600')) {
        return { pass: true, jobArea: `${targetCity}·${jobArea}` };
      }
      // 若未标明目标城市，且非远程/全国，视为异地跳过
      if (!jobArea.includes('远程') && !jobArea.includes('全国')) {
        return { pass: false, reason: `[异地跳过] 岗位地点为「${jobArea}」，未包含目标城市(${targetCity})` };
      }
    }

    // 2. 兜底扫描：对全卡片文本做强行异地排查
    const rawCardText = (card ? (card.innerText || card.textContent || '') : '') + ' ' + title + ' ' + company;
    const hasTarget = rawCardText.includes(targetCity) || (targetCity === '深圳' && SZ_DISTRICTS.some(d => rawCardText.includes(d)));
    if (!hasTarget) {
      const detectedOther = OTHER_CITIES.find(c => rawCardText.includes(c));
      if (detectedOther) {
        return { pass: false, reason: `[异地跳过] 卡片信息显示异地城市(${detectedOther})且未标明${targetCity}` };
      }
    }

    return { pass: true, jobArea: jobArea || targetCity };
  }

  // ================= 2024届校招与优质应届宝藏识别引擎 =================
  function detect2024CampusOpportunity(title, company, tags, desc = '', cardText = '') {
    if (config.enableCampus2024Protection === false) {
      return { isCampus2024: false };
    }
    const combined = `${title} ${company} ${tags} ${desc} ${cardText}`.toLowerCase();

    // 1. 2024届/校招/应届明确标识 (包含24届、2024届、秋招补录、回流、毕业1-2年内、择业期等)
    const is2024Explicit = /2024届|24届|2024年毕业|24年毕业|2024秋招|24秋招|2024应届|24应届|24届补录|24届回流|毕业1年内|毕业2年内|择业期|初入职场|毕业生专场|应届专场/i.test(combined);
    const isCampusGeneral = /校园招聘|校招|应届生|应届毕业生|管理培训生|管培生|初级运营|助理/i.test(combined);

    // 2. 核心业务赛道相关度（商业化、海外、运营、电商、达人、商务、BD、投放、游戏、社区、摄影、策划、管培等）
    const isRelevantDomain = /运营|商业化|海外|国际化|电商|达人|商务|bd|媒介|千川|投放|游戏|社区|摄影|视觉|内容|策划|管培/i.test(combined);

    // 3. 严格排除明显要求高年限的资深社招
    const isHighExp = /5-10年|10年以上|8-10年|3-5年|5年以上/i.test(combined);

    if (is2024Explicit && isRelevantDomain && !isHighExp) {
      return {
        isCampus2024: true,
        priority: 'high',
        type: '2024届专属宝藏',
        tag: '🎓24届校招/补录'
      };
    }

    if (isCampusGeneral && isRelevantDomain && !isHighExp) {
      return {
        isCampus2024: true,
        priority: 'medium',
        type: '应届/校招通道',
        tag: '🎓校招应届优质岗'
      };
    }

    return { isCampus2024: false };
  }

  // ================= 动态智能打招呼拼装引擎 =================
  function synthesizeDynamicGreeting(jobTitle, matchedTag, company, isCampus2024 = false) {
    const cleanTitle = (jobTitle || '').replace(/[\(（].*?[\)）]/g, '').trim() || jobTitle || '这个岗位';
    const cleanCompany = (company || '').trim();

    // 🎓 2024届校招/补录/应届专属打招呼（直击HR对毕业时间痛点，强调24年9月毕业+近一年实战积累）
    if (isCampus2024) {
      return `您好！看到咱们在招「${cleanTitle}」，我于2024年9月毕业，正好完全符合贵司对2024届/应届择业期的毕业时间要求；同时在过去一年中我积累了扎实的商业化运营与业务落地实战经验（涵盖海外运营、达人拓展与数据复盘），自驱力强、重数据重执行。附件已附上完整简历，非常期待能与您做进一步沟通，祝您工作顺利、天天开心～`;
    }

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

  // ================= 高亮职业词条与综合规则强校验 =================
  function screenJobCard(card) {
    const titleEl = card.querySelector('.job-name, .job-title, .job-card-left .job-name, a[ka*="job_list_"], [class*="job-name"]');
    const salaryEl = card.querySelector('.salary, [class*="salary"]');
    const companyEl = card.querySelector('.company-name, .company-info a, [class*="company-name"], .company-info');
    const tagsEl = card.querySelector('.tag-list, .job-tags, .info-desc, [class*="tag-list"]');

    const title = titleEl ? titleEl.textContent.trim() : '';
    const salary = salaryEl ? salaryEl.textContent.trim() : '';
    const company = companyEl ? companyEl.textContent.trim() : '';
    const tags = tagsEl ? tagsEl.textContent.trim() : '';

    if (!title) return { pass: false, reason: '未获取到岗位名称' };

    // 0. 目标城市强校验（严格杜绝上海等异地侵入，默认锁定深圳）
    const locResult = verifyJobLocation(card, title, company);
    if (!locResult.pass) {
      return locResult;
    }

    // 1. 2024届校招/补录与优质应届通道识别
    const rawCardText = card ? (card.innerText || card.textContent || '') : '';
    const campusCheck = detect2024CampusOpportunity(title, company, tags, '', rawCardText);

    // 2. 检查是否命中用户高亮选中的职业词条
    let matchedTag = null;
    let matchType = '词条高亮精准命中';
    for (const tag of activeTags) {
      if (title.toLowerCase().includes(tag.toLowerCase())) {
        matchedTag = tag;
        break;
      }
    }
    // 若常规词条未直接完全匹配，但该岗位属于 2024届校招/应届宝藏，赋予专属标签放行
    if (!matchedTag && campusCheck.isCampus2024) {
      matchedTag = campusCheck.tag;
      matchType = '🎓24届校招宝藏专场命中';
    }

    // 2.1 页面精选筛选自适应放行模式 (解决用户在页面勾选工作经验/学历等条件后只滚动不投递的问题)
    const curFilters = getBossCurrentFilters();
    if (!matchedTag && config.acceptAllInPageFilter !== false) {
      if (curFilters.hasFilters) {
        // 用户已在页面设置了筛选条件（如工作经验/学历/兼职），说明列表展示的正是用户所需的目标岗位
        const broadKeywords = [
          '运营', '专员', '助理', '电商', '视觉', '设计', '摄影', '策划', '新媒体',
          '短视频', '商务', '媒介', '渠道', '投放', '店长', '执行', '游戏', '兼职',
          '内容', '推广', '自媒体', '剪辑', '文案', '管培生', '实习', '应届'
        ];
        const rawLower = (title + ' ' + tags + ' ' + rawCardText).toLowerCase();
        if (broadKeywords.some(k => rawLower.includes(k)) || curFilters.activeTab) {
          matchedTag = activeTags[0] || (curFilters.activeTab ? curFilters.activeTab.replace(/[\(（].*?[\)）]/g, '') : '综合运营');
          matchType = `页面筛选放行 (${curFilters.summary})`;
        }
      }
    }

    // 2.2 融合用户手动投递偏好画像 (深度学习用户手动点击投递习惯)
    if (!matchedTag && userPreferenceProfile && Array.isArray(userPreferenceProfile.topKeywords) && userPreferenceProfile.topKeywords.length > 0) {
      const rawLower = (title + ' ' + tags + ' ' + rawCardText).toLowerCase();
      for (const rawKw of userPreferenceProfile.topKeywords) {
        const mkw = typeof rawKw === 'object' ? (rawKw.word || '') : rawKw;
        if (mkw && mkw.length >= 2 && rawLower.includes(mkw.toLowerCase())) {
          matchedTag = mkw;
          matchType = `🧠 命中手动投递偏好【${mkw}】`;
          break;
        }
      }
    }

    if (!matchedTag) {
      return {
        pass: false,
        reason: `[未选中词条] 「${title}」未命中当前高亮勾选的 ${activeTags.length} 个职业词条`
      };
    }

    // 3. 黑名单公司或词汇过滤
    const fullText = (title + ' ' + company + ' ' + tags + ' ' + rawCardText).toLowerCase();
    const blacklist = (config.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);
    for (const word of blacklist) {
      const lowerWord = word.toLowerCase().trim();
      if (!lowerWord) continue;
      // 🎓 2024届校招保护特权：对大厂管培生、业务培训生、运营助理等免疫误杀
      if (campusCheck.isCampus2024 && (lowerWord === '培训生' || lowerWord === '管培生' || lowerWord === '助理' || lowerWord === '实习')) {
        continue;
      }
      if (fullText.includes(lowerWord)) {
        return { pass: false, reason: `[触发黑名单] 命中词: "${word}" (${company})` };
      }
    }

    // 4. 经验要求拦截 (若用户在页面顶栏已选择「工作经验」，说明页面已由平台过滤，豁免本地正则拦截)
    const isExpPageFiltered = !!(curFilters.exp);
    if (!campusCheck.isCampus2024 && !isExpPageFiltered && /5-10年|10年以上|8-10年|8年以上/i.test(tags)) {
      return { pass: false, reason: `[经验过高跳过] ${tags}` };
    }

    // 5. 薪资门槛过滤 (若是2024届大厂校招、兼职/实习/日薪、或页面已设定经验/学历筛选，给予自适应保护)
    const isPartTimeOrDaily = salary.includes('天') || salary.includes('时') || (curFilters.activeTab && curFilters.activeTab.includes('兼职'));
    if (!isPartTimeOrDaily) {
      const match = salary.match(/(\d+)(?:-(\d+))?K/i);
      if (match) {
        const maxK = match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
        if (maxK < config.minSalaryK) {
          if (!campusCheck.isCampus2024 && !curFilters.hasFilters) {
            return { pass: false, reason: `[低薪跳过] ${salary} 未达 ${config.minSalaryK}K` };
          }
        }
      }
    }

    return {
      pass: true,
      data: { title, salary, company, tags, matchedTag, matchType, isCampus2024: campusCheck.isCampus2024, jobArea: locResult.jobArea }
    };
  }

  // ================= Web Audio 提示音与音频上下文预解锁 =================
  let sharedAudioCtx = null;
  function getOrCreateAudioContext() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      if (!sharedAudioCtx) {
        sharedAudioCtx = new AudioCtx();
      }
      if (sharedAudioCtx.state === 'suspended') {
        sharedAudioCtx.resume().catch(() => {});
      }
      return sharedAudioCtx;
    } catch (e) {
      return null;
    }
  }

  // 页面初次交互时自动激活音频上下文（击破 Chrome 自动播放拦截）
  const unlockAudio = () => {
    try {
      const ctx = getOrCreateAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (e) {}
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });

  async function playDoubleChime() {
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      if (ctx.state === 'suspended') return;

      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(0.28, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration);
      };

      // 清脆双音叮咚 (587.33Hz -> 880Hz)
      playTone(587.33, 0, 0.20);
      playTone(880.00, 0.22, 0.38);
    } catch (e) {
      console.warn('[Audio Alert Warning]', e);
    }
  }

  // ================= 浏览器标签页交替闪烁 =================
  let titleFlashInterval = null;
  let originalDocTitle = document.title;
  let isSelfFlashingTitle = false;

  function startTitleFlashing(alertTitle = '【🔔 HR来新消息了!】') {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    const baseTitle = document.title || 'BOSS直聘';
    let flag = true;
    let count = 0;
    isSelfFlashingTitle = true;
    titleFlashInterval = setInterval(() => {
      document.title = flag ? alertTitle : baseTitle;
      flag = !flag;
      count++;
      if (count > 10) { // 约 8 秒后自动平滑停止
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = baseTitle;
        setTimeout(() => { isSelfFlashingTitle = false; }, 1500);
      }
    }, 800);

    const onFocus = () => {
      if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = baseTitle;
        setTimeout(() => { isSelfFlashingTitle = false; }, 1500);
      }
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);
  }

  // ================= 页面内 mini 紧凑胶囊 Toast (轻巧小巧，不占屏幕，3.5s优雅淡出) =================
  function showHRReplyToast(info = {}) {
    let toast = document.getElementById('ziaver-hr-reply-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ziaver-hr-reply-toast';
      toast.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(0, 242, 254, 0.45);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(0, 242, 254, 0.15);
        border-radius: 8px;
        padding: 6px 12px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        display: flex;
        align-items: center;
        gap: 8px;
        max-width: 280px;
        animation: ziaverSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
        user-select: none;
      `;
      const styleTag = document.createElement('style');
      styleTag.textContent = `
        @keyframes ziaverSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `;
      document.head.appendChild(styleTag);
      document.body.appendChild(toast);
    }

    const unreadCount = info.count || 1;
    const title = info.title || 'BOSS 直聘 · HR 新回复';
    const desc = info.desc || `企业 HR 正在与您互动，请及时跟进！`;
    const chatUrl = info.chatUrl || 'https://www.zhipin.com/web/geek/chat';

    toast.innerHTML = `
      <div style="font-size: 15px; line-height: 1;">🔔</div>
      <div style="flex: 1; overflow: hidden;">
        <div style="font-size: 11.5px; font-weight: 700; color: #00f2fe; display: flex; align-items: center; justify-content: space-between; gap: 6px;">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
          <span style="font-size: 9.5px; background: rgba(0,242,254,0.2); color:#38bdf8; padding: 1px 5px; border-radius: 8px; font-weight:600; white-space: nowrap;">${unreadCount}条未读</span>
        </div>
        <div style="font-size: 10px; color: #cbd5e1; margin-top: 1px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${desc}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 4px;">
        <button id="ziaver-toast-goto-btn" style="
          background: #00f2fe;
          border: none;
          border-radius: 4px;
          color: #0f172a;
          font-weight: 700;
          font-size: 10px;
          padding: 3px 7px;
          cursor: pointer;
          white-space: nowrap;
        ">查看</button>
        <button id="ziaver-toast-close-btn" style="
          background: transparent;
          border: none;
          color: #94a3b8;
          font-size: 11px;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        " title="关闭通知">✕</button>
      </div>
    `;

    const closeToast = () => {
      if (toast && toast.parentNode) {
        toast.style.transition = 'opacity 0.25s, transform 0.25s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => { if (toast && toast.parentNode) toast.remove(); }, 250);
      }
    };

    toast.onclick = () => {
      window.open(chatUrl, '_blank');
      closeToast();
    };

    const btnGoto = toast.querySelector('#ziaver-toast-goto-btn');
    if (btnGoto) {
      btnGoto.onclick = (e) => {
        e.stopPropagation();
        window.open(chatUrl, '_blank');
        closeToast();
      };
    }

    const btnClose = toast.querySelector('#ziaver-toast-close-btn');
    if (btnClose) {
      btnClose.onclick = (e) => {
        e.stopPropagation();
        closeToast();
      };
    }

    const startDismissTimer = (delay = 3500) => {
      if (toast._timer) clearTimeout(toast._timer);
      toast._timer = setTimeout(closeToast, delay);
    };

    toast.onmouseenter = () => {
      if (toast._timer) clearTimeout(toast._timer);
    };

    toast.onmouseleave = () => {
      startDismissTimer(1500);
    };

    startDismissTimer(3500);
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
      /* 全网流水线专属进度卡片样式 */
      .pipeline-card {
        background: rgba(0, 242, 254, 0.1);
        border: 1px solid rgba(0, 242, 254, 0.4);
        border-radius: 8px;
        padding: 9px 11px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .pipeline-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
        font-weight: 700;
        color: #a5f3fc;
      }
      .pipe-pulse-dot {
        width: 7px;
        height: 7px;
        background: #00f2fe;
        border-radius: 50%;
        display: inline-block;
        margin-right: 5px;
        box-shadow: 0 0 8px #00f2fe;
        animation: pipePulseBoss 1.5s infinite;
      }
      @keyframes pipePulseBoss {
        0% { transform: scale(0.9); opacity: 0.7; }
        50% { transform: scale(1.3); opacity: 1; }
        100% { transform: scale(0.9); opacity: 0.7; }
      }
      .pipe-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(0, 242, 254, 0.25);
        color: #a5f3fc;
      }
      .pipeline-info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11.5px;
      }
      .pipeline-bar-wrap {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 3px;
        overflow: hidden;
        margin: 2px 0;
      }
      .pipeline-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #00f2fe 0%, #4facfe 100%);
        border-radius: 3px;
        transition: width 0.4s ease;
      }
      .pipeline-total-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
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
            <span id="compact-pipe-stat" style="display:none; color:#00f2fe; font-weight:700;">🌐 全网 0%</span>
            <span id="compact-status-tag" style="color:#10b981; font-size:10px;">🟢 就绪</span>
          </div>

          <!-- 全网流水线专属进度卡片 (Pipeline Banner) -->
          <div class="pipeline-card" id="hud-pipeline-card" style="display: none;">
            <div class="pipeline-header">
              <div style="display:flex; align-items:center;">
                <span class="pipe-pulse-dot"></span>
                <span class="pipe-title">🌐 全网流水线协同巡航中</span>
              </div>
              <span class="pipe-badge" id="hud-pipe-site-tag">第 1/3 站</span>
            </div>
            <div class="pipeline-info-row">
              <span id="hud-pipe-site-text" style="color:#e2e8f0; font-weight:700;">【BOSS直聘】</span>
              <span id="hud-pipe-counts" style="color:#cbd5e1; font-size:11px;">今日: <b id="hud-pipe-site-today" style="color:#00f2fe;">0</b>/<span id="hud-pipe-site-limit">30</span> <span style="color:#94a3b8; font-size:10px;">(本次 <b id="hud-pipe-site-count" style="color:#38bdf8;">+0</b>/<span id="hud-pipe-site-target">30</span>)</span></span>
            </div>
            <div class="pipeline-bar-wrap">
              <div class="pipeline-bar-fill" id="hud-pipe-bar-fill" style="width: 0%;"></div>
            </div>
            <div class="pipeline-total-row">
              <span id="hud-pipe-step-list" style="font-size:10px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;">BOSS 🚀 → 猎聘 ⏳ → 拉勾 ⏳</span>
              <span id="hud-pipe-percent-text" style="font-size:11px; font-weight:800; color:#00f2fe;">0%</span>
            </div>
            <div style="margin-top: 4px;">
              <button class="btn btn-stop-pipeline" id="btn-hud-stop-pipeline" style="width:100%; padding:5px 8px; font-size:10.5px; background:rgba(239,68,68,0.2); border:1px solid rgba(239,68,68,0.4); color:#fca5a5; border-radius:6px; cursor:pointer; font-weight:600;">
                🛑 终止全网流水线巡航
              </button>
            </div>
          </div>

          <div class="stats-grid">
            <div class="stat-card" id="btn-quick-adjust-limit" style="cursor: pointer; transition: border-color 0.2s;" title="点击可直接修改今日上限 (5~999)">
              <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>今日已投 / 上限</span>
                <span style="font-size:10px; color:#00f2fe; text-decoration:underline;">✏️改上限</span>
              </div>
              <div class="stat-val" id="val-today-count">0 <span class="stat-sub">/ 30</span></div>
            </div>
            <div class="stat-card">
              <div class="stat-label">本次投递</div>
              <div class="stat-val" id="val-session-count">0</div>
            </div>
          </div>

          <!-- 分时段额度指示器 (上午 06:00-12:00 | 下午 12:00-18:00 | 晚上 18:00-24:00) -->
          <div class="time-slot-grid" id="hud-time-slot-grid" style="display: flex; gap: 4px; margin-bottom: 6px;">
            <div class="slot-pill" id="slot-pill-morning" style="flex: 1; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 4px 2px; text-align: center; font-size: 10px;">
              <div style="color: #94a3b8; font-size: 9.5px;">🌅 上午</div>
              <div style="font-weight: 700; color: #38bdf8;" id="val-slot-morning">0/20</div>
            </div>
            <div class="slot-pill" id="slot-pill-afternoon" style="flex: 1; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 4px 2px; text-align: center; font-size: 10px;">
              <div style="color: #94a3b8; font-size: 9.5px;">☀️ 下午</div>
              <div style="font-weight: 700; color: #38bdf8;" id="val-slot-afternoon">0/30</div>
            </div>
            <div class="slot-pill" id="slot-pill-evening" style="flex: 1; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 4px 2px; text-align: center; font-size: 10px;">
              <div style="color: #94a3b8; font-size: 9.5px;">🌙 晚上</div>
              <div style="font-weight: 700; color: #38bdf8;" id="val-slot-evening">0/20</div>
            </div>
          </div>

          <!-- 重点跟进企业榜单条目 -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 6px; padding: 4px 8px; margin-bottom: 6px; font-size: 10px;">
            <span style="color: #fbbf24; font-weight: 600;">⭐ 重点跟进: <b id="hud-key-companies-count">0</b> 家高频交流企业</span>
            <span class="tag-link" id="btn-hud-open-key-companies" style="color: #f59e0b; cursor: pointer; text-decoration: underline;">查看榜单 ↗</span>
          </div>

          <!-- 记忆筛选与自动巡航联动 -->
          <div id="hud-saved-filter-bar" style="display: flex; justify-content: space-between; align-items: center; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 6px; padding: 4px 8px; margin-bottom: 6px; font-size: 10px;">
            <span style="color: #38bdf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 175px;">📌 巡航筛选: <b id="hud-saved-filter-desc">实时页面</b></span>
            <span class="tag-link" id="btn-save-boss-filters" style="color: #00f2fe; cursor: pointer; text-decoration: underline; font-weight: 600;" title="记住当前页面上的经验/学历/兼职等全部筛选项，巡航时自动加载">💾 记住筛选</span>
          </div>

          <!-- 手动投递偏好学习画像条目 -->
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(168, 85, 247, 0.08); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 6px; padding: 4px 8px; margin-bottom: 6px; font-size: 10px;">
            <span style="color: #c084fc; font-weight: 600;">🧠 手动偏好学习: <b id="hud-manual-learned-count">0</b> 条样本</span>
            <span class="tag-link" id="btn-hud-open-learning" style="color: #a855f7; cursor: pointer; text-decoration: underline;">偏好画像 ↗</span>
          </div>

          <!-- 页面筛选自适应放行指示器 -->
          <div id="hud-page-filter-status" style="display: none; background: rgba(16, 185, 129, 0.08); border: 1px dashed rgba(16, 185, 129, 0.35); border-radius: 6px; padding: 4px 8px; margin-bottom: 6px; font-size: 10px; color: #34d399;">
            <span>🎯 页面筛选已激活：<b id="hud-page-filter-summary">已开启</b> (自适应放行)</span>
          </div>

          <div class="tag-indicator">
            <span>🎯 当前生效词条: <b id="active-tag-count" style="color:#00f2fe;">8</b> 个</span>
            <span class="tag-link" id="btn-open-dashboard">打开完整后台管理 ↗</span>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); border:1px solid rgba(0,242,254,0.18); border-radius:6px; padding:4px 8px; margin-bottom:6px; font-size:10px;">
            <span>📍 锁定城市: <b id="hud-city-name" style="color:#38bdf8;">深圳</b> <span style="color:#10b981; font-size:9.5px;">(严防异地)</span></span>
            <span style="color:#c084fc;">🎓 24届校招保护: <b style="color:#34d399;">已激活</b></span>
          </div>

          <div style="background: rgba(0,242,254,0.06); border: 1px solid rgba(0,242,254,0.2); border-radius: 6px; padding: 5px 8px; margin-bottom: 6px; font-size: 10px; color: #94a3b8; line-height: 1.4;">
            <span style="color:#00f2fe; font-weight:600;">🛡️ 防跳盾已激活：</span>自动拦截聊天跳转并确保留在此页连续投递；已开启后台自荐信与聊天输入框双轨送达！
          </div>

          <div class="action-btns">
            <button class="btn btn-primary" id="btn-toggle-run">
              <span>🚀 开启自动投递</span>
            </button>
            <button class="btn btn-pause" id="btn-pause-run" style="display: none;">
              <span>⏸ 暂停</span>
            </button>
          </div>

          <div style="display: flex; gap: 6px; margin-top: 6px;">
            <button class="btn btn-secondary" id="btn-boss-open-quickfill" style="flex: 1; font-size: 11px; padding: 7px 6px; background: rgba(0,242,254,0.12); border: 1px solid rgba(0,242,254,0.3); color: #00f2fe; border-radius: 6px; cursor: pointer;">
              <span>📋 简历速填抽屉</span>
            </button>
            <button class="btn btn-secondary" id="btn-boss-open-digest" style="flex: 1; font-size: 11px; padding: 7px 6px; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.35); color: #fbbf24; border-radius: 6px; cursor: pointer;" title="查看今日公众号与名企直招情报">
              <span>📰 今日全网情报</span>
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding: 0 2px;">
            <span style="font-size: 10.5px; color: #94a3b8; font-weight: 600;">📋 实时运行日志 (保留最新80条)</span>
            <span id="btn-clear-boss-log" style="font-size: 10px; color: #00f2fe; text-decoration: underline; cursor: pointer;">清空</span>
          </div>
          <div class="log-box" id="hud-log-stream" style="max-height: 120px; overflow-y: auto;">
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
        ⚡ BOSS巡航 (<span id="pill-count">0</span>/<span id="pill-limit">30</span>)<span id="pill-pipe-stat" style="display:none; margin-left:4px; color:#00f2fe;"> | 🌐 0%</span>
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

    // 打开重点跟进企业榜单
    shadowRoot.getElementById('btn-hud-open-key-companies')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html#key-companies')
      });
    });

    // 记忆当前页面筛选条件
    shadowRoot.getElementById('btn-save-boss-filters')?.addEventListener('click', () => {
      const cur = getBossCurrentFilters();
      const filterData = {
        url: window.location.href,
        query: window.location.search,
        summary: cur.summary,
        savedTime: new Date().toLocaleString()
      };
      chrome.runtime.sendMessage({
        type: 'SAVE_BOSS_FILTERS',
        filters: filterData
      }, (res) => {
        savedBossFilters = filterData;
        logHUD(`💾 <span class="success">[筛选已记忆]</span> 已保存当前页面筛选：【${cur.summary}】！后续全网巡航将自动采用此条件。`);
        updateHUD();
      });
    });

    // 打开手动投递偏好学习中心
    shadowRoot.getElementById('btn-hud-open-learning')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html#manual-learning')
      });
    });

    // 展开/收起简历速填小抽屉
    shadowRoot.getElementById('btn-boss-open-quickfill')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('JOBCRUISE_TOGGLE_QUICKFILL'));
    });

    // 查看今日全网情报
    shadowRoot.getElementById('btn-boss-open-digest')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html#daily-digest')
      });
    });

    // 终止全网流水线巡航
    shadowRoot.getElementById('btn-hud-stop-pipeline')?.addEventListener('click', () => {
      logHUD('<span class="highlight">[终止巡航]</span> 正在终止全网流水线协同调度...');
      chrome.runtime.sendMessage({ type: 'STOP_CRUISE_PIPELINE' }, () => {
        stopAutopilot();
        renderPipelineHUD({ isActive: false });
      });
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

    // 原地快捷调节今日投递上限
    shadowRoot.getElementById('btn-quick-adjust-limit')?.addEventListener('click', () => {
      const currentLimit = config.dailyLimit || 30;
      const input = prompt(`⚡【快速调节每日投递上限】\n当前每日安全投递上限为：${currentLimit} 次\n\n请输入新的每日投递上限 (支持 5 ~ 999 次)：`, currentLimit);
      if (input !== null) {
        const newLimit = parseInt(input.trim(), 10);
        if (!isNaN(newLimit) && newLimit >= 5 && newLimit <= 999) {
          config.dailyLimit = newLimit;
          if (pipelineMode && (!pipelineTarget || pipelineTarget === currentLimit)) {
            pipelineTarget = newLimit;
          }
          chrome.storage.local.get(['config'], (res) => {
            const cfg = res.config || {};
            cfg.dailyLimit = newLimit;
            chrome.storage.local.set({ config: cfg }, () => {
              updateHUD();
              logHUD(`<span class="success">[上限已更新]</span> 今日安全投递上限已快速调整为 <b>${newLimit}</b> 次！`);
            });
          });
        } else {
          alert('请输入 5 到 999 之间的有效整数！');
        }
      }
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

    // 清空日志按钮
    shadowRoot.getElementById('btn-clear-boss-log')?.addEventListener('click', () => {
      const stream = shadowRoot.getElementById('hud-log-stream');
      if (stream) {
        stream.innerHTML = '<div style="color:#64748b;">[系统就绪] 日志已清空，巡航待命中...</div>';
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  function logHUD(html) {
    const stream = shadowRoot?.getElementById('hud-log-stream');
    if (!stream) return;
    const now = new Date();
    const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;
    
    // 控制台镜像详细输出 (去除 HTML 标签)
    const plainText = html.replace(/<[^>]+>/g, '');
    console.log(`%c[ZIAVER BOSS] ${timeStr} ${plainText}`, 'color: #00f2fe;');

    const line = document.createElement('div');
    line.style.cssText = 'margin-bottom: 2px; word-break: break-all;';
    line.innerHTML = `<span style="color:#64748b; font-size:10px; margin-right:4px;">${timeStr}</span>${html}`;
    stream.prepend(line);
    while (stream.children.length > 80) {
      stream.removeChild(stream.lastChild);
    }
  }

  // 渲染全网流水线实时协同卡片
  function renderPipelineHUD(status) {
    if (!shadowRoot) return;
    const card = shadowRoot.getElementById('hud-pipeline-card');
    const compactPipe = shadowRoot.getElementById('compact-pipe-stat');
    const pillPipe = shadowRoot.getElementById('pill-pipe-stat');
    if (!card) return;

    if (status && status.isActive) {
      card.style.display = 'flex';
      const siteTag = shadowRoot.getElementById('hud-pipe-site-tag');
      const siteText = shadowRoot.getElementById('hud-pipe-site-text');
      const siteCountEl = shadowRoot.getElementById('hud-pipe-site-count');
      const siteTargetEl = shadowRoot.getElementById('hud-pipe-site-target');
      const barFill = shadowRoot.getElementById('hud-pipe-bar-fill');
      const stepList = shadowRoot.getElementById('hud-pipe-step-list');
      const pctText = shadowRoot.getElementById('hud-pipe-percent-text');

      const totalSites = (status.sites && status.sites.length) || 3;
      const curIdx = status.currentIndex !== undefined ? status.currentIndex : 0;
      const curSite = status.currentSite || (status.sites && status.sites[curIdx]);
      const siteName = curSite ? curSite.name : 'BOSS直聘';

      if (siteTag) siteTag.textContent = `第 ${curIdx + 1}/${totalSites} 站`;
      if (siteText) siteText.textContent = `【${siteName}】`;
      const limit = config.dailyLimit || 30;
      const pipeTodayEl = shadowRoot.getElementById('hud-pipe-site-today');
      const pipeLimitEl = shadowRoot.getElementById('hud-pipe-site-limit');
      if (pipeTodayEl) pipeTodayEl.textContent = todayCount;
      if (pipeLimitEl) pipeLimitEl.textContent = limit;
      if (siteCountEl) siteCountEl.textContent = `+${status.currentSiteCount !== undefined ? status.currentSiteCount : sessionCount}`;
      if (siteTargetEl) siteTargetEl.textContent = status.perSiteTarget || 30;

      const pct = status.overallPercent !== undefined ? status.overallPercent : 0;
      if (barFill) barFill.style.width = `${pct}%`;
      if (pctText) pctText.textContent = `${pct}%`;

      if (compactPipe) {
        compactPipe.style.display = 'inline';
        compactPipe.textContent = `🌐 全网 ${pct}%`;
      }
      if (pillPipe) {
        pillPipe.style.display = 'inline';
        pillPipe.textContent = ` | 🌐 ${pct}%`;
      }

      if (stepList && status.sitesStatus) {
        stepList.textContent = status.sitesStatus.map(s => {
          if (s.skipped) return `${s.name}(跳过)`;
          if (s.isPassed) return `${s.name}(${s.done})✓`;
          if (s.isCurrent) return `${s.name}(${s.done}/${s.target})🚀`;
          return `${s.name}(待启动)`;
        }).join(' → ');
      }
    } else {
      card.style.display = 'none';
      if (compactPipe) compactPipe.style.display = 'none';
      if (pillPipe) pillPipe.style.display = 'none';
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

    // 同步更新流水线卡片今日与本次投递计数
    const pipeTodayEl = shadowRoot.getElementById('hud-pipe-site-today');
    const pipeLimitEl = shadowRoot.getElementById('hud-pipe-site-limit');
    const pipeCountEl = shadowRoot.getElementById('hud-pipe-site-count');
    const pipeTargetEl = shadowRoot.getElementById('hud-pipe-site-target');
    if (pipeTodayEl) pipeTodayEl.textContent = todayCount;
    if (pipeLimitEl) pipeLimitEl.textContent = limit;
    if (pipeCountEl) pipeCountEl.textContent = `+${sessionCount}`;
    if (pipeTargetEl) pipeTargetEl.textContent = pipelineTarget || limit;

    const cityEl = shadowRoot.getElementById('hud-city-name');
    if (cityEl) cityEl.textContent = config.targetCity || '深圳';

    // 分时段额度指示器实时更新与当前活跃时段高亮
    const slotCounts = config.timeSlotCounts || { morning: 0, afternoon: 0, evening: 0 };
    const slotLimits = config.timeSlotLimits || { morning: 20, afternoon: 30, evening: 20 };
    const curSlot = getCurrentTimeSlot();

    const mVal = shadowRoot.getElementById('val-slot-morning');
    const aVal = shadowRoot.getElementById('val-slot-afternoon');
    const eVal = shadowRoot.getElementById('val-slot-evening');
    if (mVal) mVal.textContent = `${slotCounts.morning || 0}/${slotLimits.morning || 20}`;
    if (aVal) aVal.textContent = `${slotCounts.afternoon || 0}/${slotLimits.afternoon || 30}`;
    if (eVal) eVal.textContent = `${slotCounts.evening || 0}/${slotLimits.evening || 20}`;

    const pillM = shadowRoot.getElementById('slot-pill-morning');
    const pillA = shadowRoot.getElementById('slot-pill-afternoon');
    const pillE = shadowRoot.getElementById('slot-pill-evening');
    if (pillM) pillM.style.borderColor = curSlot === 'morning' ? '#00f2fe' : 'rgba(255,255,255,0.12)';
    if (pillA) pillA.style.borderColor = curSlot === 'afternoon' ? '#00f2fe' : 'rgba(255,255,255,0.12)';
    if (pillE) pillE.style.borderColor = curSlot === 'evening' ? '#00f2fe' : 'rgba(255,255,255,0.12)';

    // 页面筛选状态感知与自适应放行条
    const pageFilterStatusEl = shadowRoot.getElementById('hud-page-filter-status');
    const pageFilterSummaryEl = shadowRoot.getElementById('hud-page-filter-summary');
    const curFilters = getBossCurrentFilters();
    if (pageFilterStatusEl && pageFilterSummaryEl) {
      if (curFilters.hasFilters) {
        pageFilterStatusEl.style.display = 'block';
        pageFilterSummaryEl.textContent = curFilters.summary;
      } else {
        pageFilterStatusEl.style.display = 'none';
      }
    }

    // 重点跟进企业数、手动学习样本数与记忆筛选状态异步读取
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['keyCompanies', 'manualApplyLog', 'savedBossFilters'], (kRes) => {
        const kList = Array.isArray(kRes.keyCompanies) ? kRes.keyCompanies : [];
        const kcEl = shadowRoot.getElementById('hud-key-companies-count');
        if (kcEl) kcEl.textContent = kList.length;

        const mList = Array.isArray(kRes.manualApplyLog) ? kRes.manualApplyLog : [];
        const mlEl = shadowRoot.getElementById('hud-manual-learned-count');
        if (mlEl) mlEl.textContent = mList.length;

        const sfDesc = shadowRoot.getElementById('hud-saved-filter-desc');
        if (sfDesc) {
          if (kRes.savedBossFilters && kRes.savedBossFilters.summary) {
            sfDesc.textContent = kRes.savedBossFilters.summary;
          } else {
            sfDesc.textContent = '跟随当前页面';
          }
        }
      });
    }
  }

  // ================= HR 回复与私信多维强提醒引擎 (v2.11.4 彻底根除死锁重构版) =================
  let lastFriendMsgCount = -1;
  let lastAlertTimestamp = 0;
  let isWatcherInitialized = false;
  let watcherInitTimestamp = Date.now();
  let lastTitleHasMessage = false;
  let lastTitleUnreadCount = 0;
  let lastHeaderUnreadCount = 0;
  let lastHeaderHasRedDot = false;
  let lastChatSidebarKey = '';
  let lastHasHRUnreadBadge = false;
  let lastFloatNoticeText = '';

  const SYSTEM_REPLY_BLACKLIST = [
    '直聘小秘书', '安全中心', '平台提示', '直聘助手', '以下是系统消息',
    '安全防诈提醒', '谨防求职诈骗', '请勿轻易提供', '温馨提示：'
  ];

  function isSystemMessageText(text) {
    if (!text) return true;
    const clean = String(text).trim();
    if (clean.length === 0) return true;
    return SYSTEM_REPLY_BLACKLIST.some(kw => clean.includes(kw));
  }

  // 检查是否是官方系统机器人/通知账号
  function isSystemBotName(name) {
    if (!name) return false;
    const n = String(name).trim();
    return n.includes('小秘书') || n.includes('助手') || n.includes('系统通知') || n.includes('安全中心') || n.includes('官方');
  }

  // 自动扫描 BOSS 聊天左侧联系人列表，提取与 HR 交流较多的重点企业
  function scanAndSyncBossKeyCompanies() {
    if (!window.location.pathname.startsWith('/web/geek/chat')) return;
    const chatItems = document.querySelectorAll(
      '.user-list li, .chat-user-list li, [class*="conversation-item"], [class*="chat-user-item"]'
    );
    if (!chatItems || chatItems.length === 0) return;

    chatItems.forEach((item, index) => {
      if (index > 30) return; // 扫描最近 30 个活跃会话
      try {
        const textAll = item.textContent || '';
        const nameEl = item.querySelector('.name-wrap, .name-box, [class*="name-text"], .title-text, .user-name');
        const hrName = nameEl ? nameEl.textContent.trim() : '';

        const compEl = item.querySelector('.company-name, [class*="company"], .source-name');
        let company = compEl ? compEl.textContent.trim() : '';

        const jobEl = item.querySelector('.job-name, [class*="job-name"], .position-name');
        const jobTitle = jobEl ? jobEl.textContent.trim() : '运营';

        const lastMsgEl = item.querySelector('.last-msg, [class*="last-msg"], [class*="msg-preview"], p');
        const lastMsg = lastMsgEl ? lastMsgEl.textContent.trim() : '';

        if (!company) {
          const mComp = textAll.match(/(?:·|\s)([^\s·•|]{2,18}(?:科技|网络|文化|传媒|游戏|互动|电商|信息|实业|商贸|咨询|贸易|集团|公司))/);
          if (mComp) company = mComp[1];
        }

        if (company && company.length >= 2 && !company.includes('系统') && !company.includes('助手')) {
          chrome.runtime.sendMessage({
            type: 'UPDATE_KEY_COMPANY',
            data: {
              company,
              jobTitle,
              hrName: hrName || '招聘顾问',
              lastMessage: lastMsg || '沟通交流中',
              platform: 'BOSS直聘',
              chatUrl: window.location.href
            }
          });
        }
      } catch (e) {}
    });
  }

  function startHRReplyWatcher() {
    // 岗位详情页 (/job_detail/) 与非主要页面不启动 HR 监听，防止批量打开职位标签页时产生并发提醒
    if (window.location.pathname.includes('/job_detail/') || window.location.pathname.includes('/user/')) {
      return;
    }

    watcherInitTimestamp = Date.now();

    // 1. 初始化时读取上次提醒时间戳
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['lastGlobalHRAlertTimestamp'], (res) => {
        lastAlertTimestamp = Number(res.lastGlobalHRAlertTimestamp) || 0;
        isWatcherInitialized = true;
      });
    } else {
      isWatcherInitialized = true;
    }

    // 2. 标题变动监听 (MutationObserver 极速感知)
    try {
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const titleObs = new MutationObserver(() => {
          if (!isSelfFlashingTitle) {
            checkTitleForHRMessage();
          }
        });
        titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) {}

    // 3. 周期性巡检：每 2.5 秒探测一次顶栏未读、右下角浮动通知和会话列表
    setInterval(() => {
      checkAllHRMessageSources();
    }, 2500);

    // 4. 在聊天界面自动解析并同步高频交流重点企业
    if (window.location.pathname.startsWith('/web/geek/chat')) {
      setTimeout(() => { scanAndSyncBossKeyCompanies(); }, 2500);
      setInterval(() => { scanAndSyncBossKeyCompanies(); }, 15000);
    }
  }

  // 提取标题中的未读标识（彻底解绑数字大小比较，改为事件状态检测）
  function isTitleHavingMessage(title) {
    if (!title) return false;
    if (title.includes('🔔') || title.includes('JobCruise') || title.includes('ZIAVER')) return false;

    // 兼容所有主流格式：(1), （1）, [1], 【1】, 【1条新消息】, 1条新消息, (新消息), 【新消息】, 有新招呼
    return /[\(（](\d+|新消息|有新招呼)[\)）]|【.*?新消息.*?】|【\d+条|\[\d+\]|\d+条新消息|有新招呼|HR回复/i.test(title);
  }

  function extractUnreadCountFromTitle(title) {
    if (!title) return 0;
    if (title.includes('🔔') || title.includes('JobCruise') || title.includes('ZIAVER')) return 0;

    const m = title.match(/[\(（](\d+)[\)）]/) ||
              title.match(/【(\d+)条?(?:新消息)?】/) ||
              title.match(/\[(\d+)\]/) ||
              title.match(/(\d+)条新消息/);
    if (m) {
      const count = parseInt(m[1], 10);
      if (!isNaN(count) && count > 0 && count <= 999) return count;
    }
    if (isTitleHavingMessage(title)) return 1;
    return 0;
  }

  // 标题变动监听：当标题进入“含未读”状态，或者标题未读数变化时触发
  function checkTitleForHRMessage() {
    if (isSelfFlashingTitle) return;
    const title = document.title || '';
    if (title.includes('🔔') || title.includes('JobCruise') || title.includes('ZIAVER')) return;

    // 页面加载前 3 秒稳态基准期，避免刚打开页面就误弹
    if (Date.now() - watcherInitTimestamp < 3000) return;

    const hasMsg = isTitleHavingMessage(title);
    const count = extractUnreadCountFromTitle(title) || 1;
    const now = Date.now();

    if (hasMsg) {
      // 仅在标题由无消息变为有消息，或者标题中的未读数字发生递增时触发报警（彻底阻断每12秒死循环反复报警Bug）
      const isNewMessageState = !lastTitleHasMessage;
      const hasCountIncreased = count > lastTitleUnreadCount;

      if (isNewMessageState || hasCountIncreased) {
        lastTitleHasMessage = true;
        lastTitleUnreadCount = Math.max(lastTitleUnreadCount, count);
        lastAlertTimestamp = now;

        console.log(`[ZIAVER Autopilot] 🔔 BOSS 网页标题侦测到 HR 新回复动态！标题: "${title}", 未读数: ${count}`);

        dispatchHRReplyNotification({
          title: '🔔 BOSS 直聘 · HR 新回复/私信！',
          desc: `检测到网页标签出现新消息动态提示 (${count} 条未读)，请及时跟进！`,
          count
        });
      }
    } else {
      // 只有在顶栏也无未读、且当前非闪烁状态时，才真正重置标题状态（防止闪烁和切页伪重置导致死循环）
      if (!isSelfFlashingTitle && lastHeaderUnreadCount === 0 && !lastHeaderHasRedDot) {
        lastTitleHasMessage = false;
        lastTitleUnreadCount = 0;
      }
    }
  }

  // 顶栏徽标与红点扫描（全面支持数字与无数字红点）
  function extractHeaderUnreadInfo() {
    let count = 0;
    let hasRedDot = false;

    // 1. 扫描专门的消息徽标与红点类名
    const badgeSelectors = [
      '.nav-chat-num',
      '.header-chat-count',
      '.header-message-count',
      '.msg-count',
      '.header-msg-count',
      '.nav-item-message .badge',
      '.nav-item-chat .badge',
      '.user-nav .badge',
      '[class*="chat-num"]',
      '[class*="msg-num"]',
      'a[href*="/chat"] .badge',
      'a[href*="/chat"] .nav-chat-num',
      '[ka*="header-message"] .badge',
      '[ka*="header-chat"] .badge',
      '.nav-item-message [class*="num"]',
      '.nav-item-chat [class*="num"]',
      '.red-dot',
      '.red-point',
      'i.dot',
      'span.dot'
    ];
    const badges = document.querySelectorAll(badgeSelectors.join(', '));
    badges.forEach(b => {
      if (!b) return;
      if (b.offsetWidth <= 0 && b.offsetHeight <= 0) return;
      const style = window.getComputedStyle(b);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      const txt = b.textContent.trim();
      const m = txt.match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n > 0 && n <= 999) {
          count = Math.max(count, n);
        }
      } else {
        // 无数字红点（小圆点）
        hasRedDot = true;
      }
    });

    // 2. 扫描顶栏消息相关链接/容器内部
    const navItems = document.querySelectorAll(
      '.nav-item-message, .nav-item-chat, a[href*="/web/geek/chat"], a[href*="/chat"], [ka*="header-message"], [ka*="header-chat"]'
    );
    navItems.forEach(item => {
      if (!item || (item.offsetWidth <= 0 && item.offsetHeight <= 0)) return;
      const style = window.getComputedStyle(item);
      if (style.display === 'none' || style.visibility === 'hidden') return;

      const innerSpans = item.querySelectorAll('span, i, em, b, strong');
      innerSpans.forEach(sp => {
        const txt = sp.textContent.trim();
        const m = txt.match(/^(\d+)\+?$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n) && n > 0 && n <= 999) {
            count = Math.max(count, n);
          }
        }
      });

      const itemText = item.textContent || '';
      const textMatch = itemText.match(/(?:消息|沟通|私信)[^\d]*(\d+)/);
      if (textMatch) {
        const n = parseInt(textMatch[1], 10);
        if (!isNaN(n) && n > 0 && n <= 999) {
          count = Math.max(count, n);
        }
      }
    });

    return { count, hasRedDot };
  }

  // 嗅探页面上弹出的浮动聊天通知卡片（BOSS直聘在非聊天页常有右下角即时浮窗）
  function checkFloatChatNotice() {
    const floatNoticeEls = document.querySelectorAll(
      '.chat-message-notice, .geek-chat-notice, [class*="chat-notice"], [class*="message-notice"], [class*="chat-pop"]'
    );
    for (const el of floatNoticeEls) {
      if (el && el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none') {
        const txt = (el.textContent || '').trim();
        if (txt.length > 0 && !isSystemMessageText(txt)) {
          return { found: true, text: txt };
        }
      }
    }
    return { found: false, text: '' };
  }

  // 全方位周期巡检（顶栏 + 浮窗 + 聊天侧栏 + 聊天气泡 + 标题）
  function checkAllHRMessageSources() {
    // 首次稳态期（基准化顶栏、标题与浮窗，避免新开标签页即误报）
    if (!isWatcherInitialized || (Date.now() - watcherInitTimestamp < 3000)) {
      const initHeader = extractHeaderUnreadInfo();
      lastHeaderUnreadCount = initHeader.count;
      lastHeaderHasRedDot = initHeader.hasRedDot;
      lastTitleHasMessage = isTitleHavingMessage(document.title || '');
      lastTitleUnreadCount = extractUnreadCountFromTitle(document.title || '');
      const initFloat = checkFloatChatNotice();
      if (initFloat.found) {
        lastFloatNoticeText = initFloat.text;
      }
      isWatcherInitialized = true;
      return;
    }

    const now = Date.now();
    let shouldTriggerAlert = false;
    let alertReason = '';
    let alertCount = 1;

    // A. 顶栏消息与红点检测
    const headerInfo = extractHeaderUnreadInfo();
    if (headerInfo.count > lastHeaderUnreadCount) {
      shouldTriggerAlert = true;
      alertReason = `顶栏消息数增加 (${headerInfo.count} 条未读)`;
      alertCount = headerInfo.count;
    } else if (headerInfo.hasRedDot && !lastHeaderHasRedDot) {
      shouldTriggerAlert = true;
      alertReason = `顶栏出现新消息红点标记`;
      alertCount = headerInfo.count || 1;
    }
    lastHeaderUnreadCount = headerInfo.count;
    lastHeaderHasRedDot = headerInfo.hasRedDot;

    // B. 右下角即时浮窗卡片检测（带文本指纹去重，同一浮窗停留期间绝不重复报警）
    const floatNotice = checkFloatChatNotice();
    if (floatNotice.found) {
      if (floatNotice.text !== lastFloatNoticeText) {
        lastFloatNoticeText = floatNotice.text;
        shouldTriggerAlert = true;
        alertReason = `右下角收到 HR 实时弹窗消息: "${floatNotice.text.slice(0, 30)}"`;
        alertCount = Math.max(alertCount, headerInfo.count || 1);
      }
    } else {
      lastFloatNoticeText = '';
    }

    // C. 聊天页面深度监听 (/web/geek/chat)
    if (window.location.pathname.startsWith('/web/geek/chat')) {
      // 1. 左侧联系人列表扫描：检查是否有未读的真实 HR 联系人
      const chatItems = document.querySelectorAll(
        '.user-list li, .chat-user-list li, [class*="conversation-item"], [class*="chat-user-item"]'
      );
      if (chatItems.length > 0) {
        const topItem = chatItems[0];
        const topNameEl = topItem.querySelector('.name-wrap, .name-box, [class*="name"], .user-name');
        const topName = topNameEl ? topNameEl.textContent.trim() : '';
        const topMsgEl = topItem.querySelector('.last-msg, [class*="last-msg"], [class*="msg-preview"], p');
        const topMsg = topMsgEl ? topMsgEl.textContent.trim() : '';
        const currentSidebarKey = `${topName}|${topMsg}`;

        // 检查列表中是否有未读真实 HR
        let hasHRUnreadBadge = false;
        chatItems.forEach(item => {
          const nameEl = item.querySelector('.name-wrap, .name-box, [class*="name"], .user-name');
          const name = nameEl ? nameEl.textContent.trim() : '';
          if (isSystemBotName(name)) return;

          const badgeEl = item.querySelector('.unread, .badge, [class*="unread"], [class*="badge"], .dot');
          if (badgeEl && badgeEl.offsetWidth > 0 && badgeEl.offsetHeight > 0 && window.getComputedStyle(badgeEl).display !== 'none') {
            hasHRUnreadBadge = true;
          }
        });

        if (lastChatSidebarKey && currentSidebarKey !== lastChatSidebarKey) {
          // 置顶联系人变动或最新消息内容刷新
          if (!isSystemBotName(topName) && !isSystemMessageText(topMsg)) {
            shouldTriggerAlert = true;
            alertReason = `聊天列表最新消息变动: ${topName} ("${topMsg.slice(0, 25)}")`;
          }
        } else if (hasHRUnreadBadge && !lastHasHRUnreadBadge) {
          // 仅在红点由无到有首次出现时触发，坚决杜绝每隔15秒无条件重新报警Bug
          shouldTriggerAlert = true;
          alertReason = `会话列表中出现 HR 新未读标记`;
        }
        lastHasHRUnreadBadge = hasHRUnreadBadge;
        lastChatSidebarKey = currentSidebarKey;
      }

      // 2. 当前对话窗口新气泡扫描
      const friendMsgs = document.querySelectorAll(
        '.chat-conversation .item-friend, .chat-message-list .item-friend, [class*="item-friend"], [class*="friend-message"], [class*="item-boss"]'
      );
      let realFriendCount = 0;
      friendMsgs.forEach(el => {
        const txt = (el.textContent || '').trim();
        if (txt.length > 0 && !isSystemMessageText(txt)) {
          realFriendCount++;
        }
      });
      if (lastFriendMsgCount !== -1 && realFriendCount > lastFriendMsgCount) {
        shouldTriggerAlert = true;
        alertReason = `当前会话窗口收到 HR 新气泡回复`;
      }
      lastFriendMsgCount = realFriendCount;
    }

    // D. 网页标题兜底
    checkTitleForHRMessage();

    // E. 触发多维报警
    if (shouldTriggerAlert) {
      lastAlertTimestamp = now;

      console.log(`[ZIAVER Autopilot] 🔔 BOSS 侦测到 HR 新回复！触发原因: ${alertReason}`);

      dispatchHRReplyNotification({
        title: '🔔 BOSS 直聘 · HR 新回复/私信！',
        desc: `【${alertReason}】，企业 HR 正在期待您的回复，请及时跟进！`,
        count: alertCount
      });
    }
  }

  let lastLocalDispatchTime = 0;
  function dispatchHRReplyNotification(info = {}) {
    const now = Date.now();
    if (!info.isTest && (now - lastLocalDispatchTime < 30000)) {
      console.log('[ZIAVER Autopilot] 🛡️ 命中当前页面 30 秒防抖锁，静默跳过重复上报');
      return;
    }
    lastLocalDispatchTime = now;

    // 1. 穿透式提示音：统一交由 background.js 通过 offscreen 全局单例发声，杜绝多标签页本地声音混响
    // (仅在后台离线或测试模式异常时由本地 fallback)

    // 2. 页面内 mini 紧凑胶囊 Toast
    showHRReplyToast({
      title: info.title || 'BOSS 直聘 · HR 新回复',
      desc: info.desc || '检测到企业 HR 正在与您互动，请及时跟进！',
      count: info.count || 1,
      chatUrl: 'https://www.zhipin.com/web/geek/chat'
    });

    // 3. 浏览器标签页交替闪烁
    startTitleFlashing('【🔔 HR来新消息了!】');

    // 4. JobCruise HUD 悬浮窗黄金高亮播报（即使静音也一眼可见！）
    logHUD(`<span class="highlight" style="color: #fbbf24; font-weight: bold; background: rgba(251, 191, 36, 0.15); padding: 2px 6px; border-radius: 4px;">🔔 【HR新回复】${info.desc || '企业 HR 发来新消息！已触发声音与桌面通知。'}</span>`);

    // 5. 系统级桌面弹窗通知与后台全局唯一发声
    chrome.runtime.sendMessage({
      type: 'HR_REPLY_ALERT',
      platform: 'boss',
      isTest: !!info.isTest,
      count: info.count || 1,
      chatUrl: 'https://www.zhipin.com/web/geek/chat',
      text: info.desc || `BOSS直聘有新的 HR 沟通回复 (${info.count || 1} 条未读)，请及时跟进！`
    }, (res) => {
      if (chrome.runtime.lastError) {
        if (config.audioAlert !== false && info.isTest) {
          playDoubleChime();
        }
      }
    });
  }

  // 提供全局测试接口：允许用户在控制台随时执行 window.__testHRReplyAlert() 验证提示音与弹窗
  window.__testHRReplyAlert = function() {
    dispatchHRReplyNotification({
      title: '🔔 [测试] BOSS 直聘 · HR 回复提醒',
      desc: '这是一条测试通知！验证后台穿透发声、页面 Toast 与桌面通知是否正常触发。',
      count: 1,
      isTest: true
    });
    console.log('[ZIAVER Autopilot] ✅ 已手动触发 HR 回复提醒测试！');
  };

  // ================= 登录状态智能识别 =================
  function checkIsLoggedIn() {
    // 1. 明确的未登录路由
    if (location.hostname.startsWith('login.') || location.pathname.startsWith('/login') || location.pathname.startsWith('/user/login')) {
      return false;
    }

    // 2. 强特征：只要存在任何候选人已登录元素，坚决判定为已登录！
    const loggedInIndicators = document.querySelectorAll(
      '.nav-figure, .header-nav-user, .nav-item-geek, [ka*="header-geek"], .user-avatar, .nav-item-message, .nav-item-chat, a.nav-item-resume, [ka="header-resume"], [ka*="header-username"], .user-nav .avatar'
    );
    for (const ind of loggedInIndicators) {
      if (ind && (ind.offsetWidth > 0 || ind.offsetHeight > 0 || ind.getClientRects().length > 0)) {
        return true;
      }
    }

    // 3. 检查是否有真正呈现在屏幕正中央的登录弹窗 (排除后台或APP下载二维码)
    const loginModal = document.querySelector('.boss-login-dialog, .dialog-signin, .login-register-dialog');
    if (loginModal) {
      const style = window.getComputedStyle(loginModal);
      const rect = loginModal.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 120 && rect.height > 120) {
        return false;
      }
    }

    // 4. 只有在没有已登录标识、且明确存在“登录/注册”候选人按钮时，才判定未登录
    const candidateLoginBtn = document.querySelector('.user-nav a[ka="header-login"], .header-login-btn');
    if (candidateLoginBtn) {
      const txt = candidateLoginBtn.textContent.trim();
      const style = window.getComputedStyle(candidateLoginBtn);
      if (style.display !== 'none' && (txt === '登录/注册' || txt === '登录' || txt === '注册')) {
        return false;
      }
    }

    // 5. 处于职位搜索列表页且有职位卡片展示，默认判定为正常可用态
    return true;
  }

  let isSkipped = false;

  // ================= 投递主流程 =================
  async function startAutopilot(target = null, isFromPipeline = false, initialSessionCount = 0) {
    refreshConfig();
    isSkipped = false;

    // 智能路由检测：若当前处于聊天界面，自动重定向至职位检索列表页再开启巡航，坚决杜绝在聊天页卡死
    if (window.location.pathname.startsWith('/web/geek/chat')) {
      logHUD('<span class="highlight" style="color:#00f2fe;">[路由自动修正]</span> 检测到当前处于聊天界面，正在自动为您前往职位搜索页开启巡航...');
      sessionStorage.setItem('ziaver_auto_start_boss_cruise', JSON.stringify({
        target,
        isFromPipeline,
        initialSessionCount
      }));
      setTimeout(() => {
        window.location.href = 'https://www.zhipin.com/web/geek/job?city=101280600';
      }, 600);
      return;
    }

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
        logHUD(`<span class="highlight" style="color:#f59e0b;">[安全上限已达]</span> 今日已达安全上限 (${todayCount}/${config.dailyLimit} 次)，自动向全网巡航下一站交接...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'boss',
          reason: `今日投递已满额 (${todayCount}/${config.dailyLimit})`
        });
        return;
      } else {
        alert(`⚠️ 今日已达到设定的安全投递上限 (${config.dailyLimit} 次)！\n当前今日已投递 ${todayCount} 次。为保护账号绝对安全，自动停止投递。可在后台调整上限。`);
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

  // ================= 弹窗管理与遮罩清理工具 =================
  function cleanModalMasks() {
    const masks = document.querySelectorAll(
      '.dialog-mask, .boss-dialog-mask, .v-modal, .ui-mask, .mask-box, [class*="dialog-mask"], [class*="modal-mask"]'
    );
    for (const m of masks) {
      if (!m || m.id === 'ziaver-boss-hud' || m.closest('#ziaver-boss-hud')) continue;
      const rect = m.getBoundingClientRect();
      if (rect.width >= window.innerWidth * 0.6 && rect.height >= window.innerHeight * 0.6) {
        m.remove();
      }
    }
  }

  function handleBossAlreadySentDialog() {
    // 1. 查找全页面中所有可能的模态弹窗容器
    const dialogSelectors = [
      '.boss-dialog', '.dialog-container', '.dialog-wrap', '.dialog-box', 
      '.ui-dialog', '.boss-popup', '.greet-boss-dialog', '.stay-page-dialog',
      '[class*="dialog"]', '[class*="modal"]', '[class*="popup"]', '[role="dialog"]'
    ];
    
    let handled = false;
    const dialogs = document.querySelectorAll(dialogSelectors.join(', '));
    for (const d of dialogs) {
      if (!d || d.id === 'ziaver-boss-hud' || d.closest('#ziaver-boss-hud')) continue;
      
      const txt = (d.textContent || '').trim();
      if (
        txt.includes('已向BOSS发送消息') ||
        txt.includes('已向对方发送') ||
        txt.includes('设置招呼语') ||
        txt.includes('留在此页') ||
        txt.includes('留在当前页') ||
        txt.includes('沟通已发起') ||
        txt.includes('发起聊天') ||
        txt.includes('打招呼成功') ||
        (txt.includes('去聊天') && (txt.includes('留在') || txt.includes('发送消息') || txt.includes('您好')))
      ) {
        // 关键防护：必须优先点击「留在此页」，坚决严禁点击「去聊天」或「继续沟通」（否则会跳转到聊天流中断检索）
        let stayBtn = null;
        const allBtns = d.querySelectorAll('button, a, span, .btn');
        for (const b of allBtns) {
          const bTxt = b.textContent.trim();
          if (
            bTxt === '留在此页' || bTxt.includes('留在此页') ||
            bTxt === '留在当前页' || bTxt.includes('留在当前') ||
            bTxt === '我知道了' || bTxt === '知道了' ||
            (bTxt === '确定' && !bTxt.includes('去聊天'))
          ) {
            stayBtn = b;
            break;
          }
        }

        if (stayBtn) {
          stayBtn.click();
          handled = true;
        } else {
          // 若未找到“留在此页”按钮，点击右上角 ✕ 关闭按钮，绝不点击去聊天
          const closeBtn = d.querySelector('.icon-close, .close, .dialog-close, .close-btn, .iboss-close, [ka*="close"], svg, button.close');
          if (closeBtn) {
            closeBtn.click();
            handled = true;
          } else {
            d.style.display = 'none';
            d.remove();
            handled = true;
          }
        }

        // 清理背景遮罩
        cleanModalMasks();
        return true;
      }
    }

    // 2. 兜底扫描全文档文本包含“留在此页”或“留在当前页”的按钮
    const fallbackBtns = document.querySelectorAll('button, a, span');
    for (const b of fallbackBtns) {
      if (!b || b.closest('#ziaver-boss-hud')) continue;
      const bTxt = b.textContent.trim();
      if (bTxt === '留在此页' || bTxt.includes('留在此页') || bTxt === '留在当前页') {
        b.click();
        cleanModalMasks();
        return true;
      }
    }

    return handled;
  }

  async function runJobLoop() {
    // 循环启动前，先清理残留弹窗和遮罩
    if (handleBossAlreadySentDialog()) {
      logHUD('<span class="success">[环境清理] 检测到屏幕中央残留的「已向BOSS发送消息」回执，已自动点击「留在此页」并移除遮罩</span>');
      await sleep(400);
    }
    cleanModalMasks();

    while (isRunning) {
      if (isPaused) {
        await sleep(1000);
        continue;
      }

      const currentSlot = getCurrentTimeSlot();
      const currentSlotLimit = (config.timeSlotLimits && config.timeSlotLimits[currentSlot]) || 20;
      const currentSlotCount = (config.timeSlotCounts && config.timeSlotCounts[currentSlot]) || 0;

      if (currentSlotCount >= currentSlotLimit) {
        logHUD(`<span class="highlight">[时段额度达标]</span> ${getTimeSlotDisplayName(currentSlot)} 额度已完成 (${currentSlotCount}/${currentSlotLimit})！今日全天已投 ${todayCount}/${config.dailyLimit}。为防风控已暂停本时段。`);
        break;
      }

      if (todayCount >= config.dailyLimit) {
        logHUD(`<span class="highlight">[上限熔断]</span> 今日已达安全上限 ${config.dailyLimit} 个！建议切换至其他平台。`);
        break;
      }

      if (pipelineMode && sessionCount >= pipelineTarget) {
        logHUD(`<span class="highlight">[本站目标达成]</span> 已完成全网流水线设定的本站目标 (${sessionCount}/${pipelineTarget})！`);
        break;
      }

      // 确保界面无遮挡
      handleBossAlreadySentDialog();
      cleanModalMasks();

      let jobCards = document.querySelectorAll('.job-card-wrapper, .job-card-box, ul.job-list-box > li, .job-card-body');
      if (!jobCards || jobCards.length === 0) {
        logHUD('<span class="skip">[视口滚动] 当前视口未见职位卡片，尝试平滑向下滚动 400px...</span>');
        window.scrollBy({ top: 400, behavior: 'smooth' });
        await sleep(2500);
        jobCards = document.querySelectorAll('.job-card-wrapper, .job-card-box, ul.job-list-box > li, .job-card-body');
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

      let unhandledCount = 0;
      jobCards.forEach(c => { if (c.dataset.ziaverHandled !== 'true') unhandledCount++; });
      logHUD(`<span class="highlight">[卡片扫描]</span> 当前页共发现 ${jobCards.length} 个职位 (待比对: ${unhandledCount} 个)`);

      for (let i = 0; i < jobCards.length; i++) {
        if (!isRunning) break;
        while (isPaused) await sleep(1000);
        const loopSlot = getCurrentTimeSlot();
        const loopSlotLimit = (config.timeSlotLimits && config.timeSlotLimits[loopSlot]) || 20;
        const loopSlotCount = (config.timeSlotCounts && config.timeSlotCounts[loopSlot]) || 0;
        if (loopSlotCount >= loopSlotLimit) {
          logHUD(`<span class="highlight">[时段额度达标]</span> ${getTimeSlotDisplayName(loopSlot)} 额度已完成 (${loopSlotCount}/${loopSlotLimit})，暂停投递。`);
          break;
        }
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

        // 每次处理卡片前，再次确保没有弹窗遮罩阻挡
        handleBossAlreadySentDialog();
        cleanModalMasks();

        // 提取岗位与企业基本信息，用于精细化 Debug 日志
        const titleEl = card.querySelector('.job-name, .job-title, .job-card-left .job-name, a[ka*="job_list_"], [class*="job-name"]');
        const salaryEl = card.querySelector('.salary, [class*="salary"]');
        const companyEl = card.querySelector('.company-name, .company-info a, [class*="company-name"], .company-info');
        const previewTitle = titleEl ? titleEl.textContent.trim() : '未知岗位';
        const previewSalary = salaryEl ? salaryEl.textContent.trim() : '面议';
        const previewCompany = companyEl ? companyEl.textContent.trim() : '未知企业';

        // 1. 快速排查：若卡片已有「继续沟通」或「已沟通」，坚决直接跳过！绝不点开详情抽屉浪费时间
        const cardRawText = card.innerText || card.textContent || '';
        if (
          cardRawText.includes('继续沟通') ||
          cardRawText.includes('已沟通') ||
          cardRawText.includes('已聊过')
        ) {
          logHUD(`<span class="skip">[已沟通跳过] #${i + 1} ${previewCompany} · ${previewTitle} (此前已沟通过)</span>`);
          continue;
        }

        // 2. 基于高亮选中的职业词条进行判断
        const screenResult = screenJobCard(card);
        if (!screenResult.pass) {
          logHUD(`<span class="skip">[规则过滤] #${i + 1} ${previewCompany} · ${previewTitle}: ${screenResult.reason}</span>`);
          continue;
        }

        const { title, salary, company, tags, matchedTag } = screenResult.data;

        // 3. 寻找“立即沟通”按钮
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
          logHUD(`<span class="skip">[展开抽屉] #${i + 1} 卡片无外置按钮，尝试展开右侧详情抽屉...</span>`);
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
              if (txt === '继续沟通' || txt === '已沟通') {
                logHUD(`<span class="skip">[已沟通跳过] #${i + 1} ${company} · ${title} (详情抽屉显示已沟通)</span>`);
                break;
              }
            }
          }
        }

        if (!btnChat) {
          logHUD(`<span class="skip">[无可用按钮] #${i + 1} ${company} · ${title} 未找到「立即沟通」按钮，安全跳过</span>`);
          continue;
        }

        const isCampus = !!screenResult.data?.isCampus2024;
        const greetingText = synthesizeDynamicGreeting(title, matchedTag, company, isCampus);

        if (isCampus) {
          logHUD(`<span class="success">[🎓24届校招宝藏命中]</span> #${i + 1} ${company} · ${title} (${salary}) <span style="font-size:10px; color:#c084fc;">[符合2024年9月毕业资质]</span>`);
        } else {
          logHUD(`<span class="highlight">[🎯命中词条: ${matchedTag}]</span> #${i + 1} ${company} · ${title} (${salary})`);
        }
        logHUD(`<span class="skip" style="color:#a5f3fc;">[动态话术合成] "${greetingText.slice(0, 32)}..."</span>`);

        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(Math.floor(Math.random() * 500) + 400);

        // 严格校验投递过程与真实送达回执 (捕获「已向BOSS发送消息」并点击「留在此页」)
        let chatResult = null;
        try {
          isAutomatingCard = true;
          chatResult = await executeAndVerifyBossChat(card, btnChat, greetingText);
        } finally {
          isAutomatingCard = false;
        }

        if (chatResult && chatResult.success) {
          todayCount++;
          sessionCount++;
          const currentSlot = getCurrentTimeSlot();
          if (!config.timeSlotCounts) {
            config.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
          }
          config.timeSlotCounts[currentSlot] = (config.timeSlotCounts[currentSlot] || 0) + 1;
          updateHUD();

          // 独立持久化 BOSS 今日投递数据与分时段数据
          if (chrome.storage && chrome.storage.local) {
            const today = getLocalDateStr();
            const siteCounts = config.siteTodayCounts || { boss: 0, liepin: 0, lagou: 0, ats: 0 };
            siteCounts.boss = todayCount;
            const totalCount = Object.values(siteCounts).reduce((a, b) => a + (Number(b) || 0), 0);
            config.todayCount = totalCount;
            config.siteTodayCounts = siteCounts;
            config.lastActiveDate = today;
            chrome.storage.local.set({
              config: { 
                ...config, 
                todayCount: totalCount, 
                siteTodayCounts: siteCounts, 
                timeSlotCounts: config.timeSlotCounts,
                lastActiveDate: today 
              }
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
              status: '已沟通',
              exactCount: todayCount
            }
          });

          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_PROGRESS',
              site: 'boss',
              count: sessionCount,
              todayCount: todayCount
            });
          }

          logHUD(`<span class="success">[真实送达确认]</span> #${sessionCount} 消息已成功送达并入库报表！(今日已投 ${todayCount}/${config.dailyLimit})`);

          const delayMs = getRandomDelayMs();
          logHUD(`<span class="skip">[防风控冷却] 随机安全等待 ${(delayMs / 1000).toFixed(1)} 秒...</span>`);
          await sleep(delayMs);
        } else if (chatResult.reason === 'limit_reached') {
          logHUD(`<span class="highlight" style="color:#ef4444; font-weight:bold; font-size:12px;">🛑【平台上限熔断】BOSS直聘已达到今日沟通上限！为防止风控封号，已立即自动停止巡航。</span>`);
          if (pipelineMode) {
            logHUD('<span class="highlight" style="color:#f59e0b;">[流水线转场] BOSS本站已满额，自动向全网巡航下一站交接...</span>');
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_FINISHED',
              site: 'boss',
              count: sessionCount
            });
          }
          break;
        } else if (chatResult.reason === 'captcha_triggered') {
          logHUD(`<span class="highlight" style="color:#f59e0b; font-weight:bold;">⚠️【滑块验证拦截】已自动暂停巡航，请手动完成页面人机验证后点击【继续】！</span>`);
        } else {
          logHUD(`<span class="skip" style="color:#94a3b8;">[送达未确认] #${i + 1} ${company} · ${title} (${chatResult.message || '未响应'})，安全跳过 (不虚增计数)</span>`);
          await sleep(600);
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
        logHUD('<span>[本屏处理完毕]</span> 本视口职位卡片已全部处理，正在尝试加载下一页/加载更多...');
        const nextBtn = document.querySelector('.ui-icon-arrow-right, a.next, .pagination-next');
        if (nextBtn && !nextBtn.classList.contains('disabled')) {
          logHUD('<span>[翻页动作]</span> 检测到下一页按钮，点击翻页...');
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
          logHUD('<span>[滚动加载]</span> 平滑向下滚动 800px 触发新职位加载...');
          window.scrollBy({ top: 800, behavior: 'smooth' });
          await sleep(3500);
        }
      }
    }
  }

  // ================= 严格送达校验与风控熔断引擎 =================
  async function executeAndVerifyBossChat(card, btnChat, greetingText) {
    // 1. 检查是否存在安全滑块验证
    function checkCaptcha() {
      const captchaEl = document.querySelector(
        '.geetest_holder, .nc_wrapper, .sec-verify-box, #captcha, [class*="captcha"], [class*="verify-box"]'
      );
      if (captchaEl && (captchaEl.offsetWidth > 0 || captchaEl.offsetHeight > 0)) {
        return true;
      }
      const bodyText = (document.body.innerText || '').slice(0, 3000);
      return bodyText.includes('请完成安全验证') || bodyText.includes('完成拼图') || bodyText.includes('请完成验证');
    }

    // 2. 检查平台风控/打招呼上限弹窗
    function checkPlatformLimitDialog() {
      const modals = document.querySelectorAll('.dialog-container, .boss-popup, .dialog-wrap, .dialog-box, .boss-dialog, .ui-dialog');
      for (const m of modals) {
        if (m.offsetWidth > 0 && m.offsetHeight > 0) {
          const txt = m.textContent.trim();
          if (
            txt.includes('今日打招呼次数已达上限') ||
            txt.includes('打招呼次数已达上限') ||
            txt.includes('沟通次数已达上限') ||
            txt.includes('打招呼已用完') ||
            txt.includes('沟通人数已达上限') ||
            txt.includes('今日沟通人数已达上限') ||
            txt.includes('操作过于频繁') ||
            txt.includes('沟通过于频繁') ||
            txt.includes('今日已达到上限') ||
            txt.includes('达到今日沟通上限') ||
            txt.includes('请明天再来')
          ) {
            const confirmBtn = m.querySelector('button, .btn, .dialog-close, .close-btn, .iboss-close');
            if (confirmBtn) confirmBtn.click();
            return true;
          }
        }
      }
      // 检查 Toast 提示
      const toasts = document.querySelectorAll('.toast, .boss-toast, [class*="toast"], .message-wrap, .ant-message');
      for (const t of toasts) {
        const txt = t.textContent.trim();
        if (
          txt.includes('上限') ||
          txt.includes('过于频繁') ||
          txt.includes('打招呼次数已用完') ||
          txt.includes('请明天再来')
        ) {
          return true;
        }
      }
      return false;
    }

    // 3. 检查并处理二次确认弹窗 (无 textarea 的通用确认弹窗，如期望薪资/城市不符、代招急聘确认)
    async function handleSecondaryConfirmDialog() {
      const modals = document.querySelectorAll('.dialog-container, .boss-popup, .dialog-wrap, .dialog-box, .ui-dialog');
      for (const m of modals) {
        if (m.offsetWidth > 0 && m.offsetHeight > 0) {
          // 如果带有 textarea，交给输入话术逻辑处理
          if (m.querySelector('textarea')) continue;

          const txt = m.textContent.trim();
          if (
            txt.includes('期望') ||
            txt.includes('不符') ||
            txt.includes('是否继续') ||
            txt.includes('仍要沟通') ||
            txt.includes('代招') ||
            txt.includes('急聘') ||
            txt.includes('确认沟通')
          ) {
            logHUD('<span class="highlight">[二次确认]</span> 自动确认平台岗位期望差异提示...');
            const buttons = m.querySelectorAll('button, a, .btn');
            for (const b of buttons) {
              const bTxt = b.textContent.trim();
              if (bTxt === '仍要沟通' || bTxt === '确定' || bTxt === '确认' || bTxt === '继续沟通' || bTxt === '我知道了') {
                b.click();
                await sleep(800);
                return true;
              }
            }
          }
        }
      }
      return false;
    }

    // 4. 处理带 textarea 的自定义打招呼弹窗
    async function handleGreetingTextareaDialog() {
      const modalTextarea = document.querySelector('.dialog-container textarea, .dialog-wrap textarea, .boss-popup textarea, .greet-boss-dialog textarea');
      if (modalTextarea && modalTextarea.offsetParent !== null) {
        modalTextarea.focus();
        modalTextarea.value = greetingText;
        modalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        modalTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);

        const sendBtn = document.querySelector(
          '.dialog-container button.btn-sure, .dialog-wrap button.btn-primary, .boss-popup .btn-sure, .greet-boss-dialog button.btn-sure, .dialog-container button.btn-primary'
        );
        if (sendBtn) {
          sendBtn.click();
          await sleep(800);
          return true;
        }
      }
      return false;
    }

    // 4.1 检查并发送抽屉或聊天小窗中的输入框 (确保后台个性化自荐话术真实送达HR)
    async function handleChatDrawerOrBoxGreeting(text) {
      if (!text) return false;
      const selectors = [
        '.chat-conversation [contenteditable="true"]',
        '.chat-box [contenteditable="true"]',
        '.im-chat [contenteditable="true"]',
        '.geek-chat-dialog [contenteditable="true"]',
        '.chat-editor [contenteditable="true"]',
        '.chat-input[contenteditable="true"]',
        '.chat-conversation textarea',
        '.chat-box textarea',
        '.im-chat textarea',
        '.geek-chat-dialog textarea',
        '.chat-editor textarea',
        '.chat-input textarea'
      ];
      for (let attempt = 0; attempt < 3; attempt++) {
        for (const sel of selectors) {
          const input = document.querySelector(sel);
          if (input && (input.offsetWidth > 0 || input.offsetHeight > 0)) {
            logHUD('<span class="highlight">[自荐信发送]</span> 检测到聊天窗口输入框，正在自动键入后台定制自荐信...');
            input.focus();
            if (input.isContentEditable || input.getAttribute('contenteditable') === 'true') {
              input.innerText = text;
            } else {
              input.value = text;
            }
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(400);

            const sendBtn = document.querySelector(
              '.chat-conversation .btn-send, .chat-box .btn-send, .im-chat .btn-send, .geek-chat-dialog .btn-send, ' +
              '.chat-editor .btn-send, button.btn-send, [ka="chat_send"], button[class*="send"]'
            );
            if (sendBtn) {
              sendBtn.click();
              logHUD('<span class="success">[自荐信送达]</span> 后台个性化定制自荐话术已成功通过聊天窗口发送！');
              await sleep(600);
              return true;
            } else {
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
              logHUD('<span class="success">[自荐信送达]</span> 后台个性化定制自荐话术已成功回车发送！');
              await sleep(600);
              return true;
            }
          }
        }
        await sleep(250);
      }
      return false;
    }

    // 5. 检查是否确认成功送达
    function checkIsDeliverySuccess() {
      // 5.1 核心：若捕获到「已向BOSS发送消息」回执弹窗，点击「留在此页」并直接判定送达成功！
      if (handleBossAlreadySentDialog()) {
        logHUD('<span class="success">[弹窗捕获] 检测到「已向BOSS发送消息」！自动点击「留在此页」并移除遮罩</span>');
        return true;
      }

      // 5.2 检查按钮文本是否已变更为已沟通状态
      const curTxt = btnChat ? btnChat.textContent.trim() : '';
      if (curTxt === '继续沟通' || curTxt === '已沟通' || curTxt === '已聊过' || curTxt.includes('继续沟通') || curTxt.includes('已沟通')) {
        return true;
      }

      // 5.3 检查卡片整体原始文本，防止DOM重构或嵌套标签导致精确匹配漏判
      const cardRawText = (card.innerText || card.textContent || '');
      if (
        cardRawText.includes('继续沟通') ||
        cardRawText.includes('已沟通') ||
        cardRawText.includes('已聊过') ||
        cardRawText.includes('已聊')
      ) {
        return true;
      }

      const cardBtns = card.querySelectorAll('a, button, span');
      for (const b of cardBtns) {
        const t = b.textContent.trim();
        if (t === '继续沟通' || t === '已沟通' || t === '已聊过' || t.includes('继续沟通') || t.includes('已沟通')) {
          return true;
        }
      }

      // 5.4 检查页面Toast提示 (涵盖“打招呼成功”、“还可以与...聊”等常见回执)
      const toasts = document.querySelectorAll('.toast, .boss-toast, [class*="toast"], .message-wrap, .ant-message, [class*="message-notice"]');
      for (const t of toasts) {
        const txt = t.textContent.trim();
        if (
          txt.includes('打招呼成功') ||
          txt.includes('消息已发送') ||
          txt.includes('已向对方发送') ||
          txt.includes('沟通成功') ||
          txt.includes('发送成功') ||
          (txt.includes('还可以') && txt.includes('聊')) ||
          (txt.includes('还可') && txt.includes('沟通'))
        ) {
          return true;
        }
      }

      // 5.5 检查IM聊天小窗/抽屉
      const imDialog = document.querySelector('.chat-conversation, .chat-box, .im-chat, .geek-chat-dialog');
      if (imDialog && (imDialog.offsetWidth > 0 || imDialog.offsetHeight > 0)) {
        return true;
      }
      return false;
    }

    // 6. 清理可能卡住的残留弹窗，防止遮挡后续卡片点击
    function dismissAnyStuckDialog() {
      handleBossAlreadySentDialog();
      const closeBtns = document.querySelectorAll('.dialog-close, .close-btn, .iboss-close, .dialog-wrap .close, .dialog-container .close');
      for (const cb of closeBtns) {
        if (cb.offsetWidth > 0 && cb.offsetHeight > 0) {
          cb.click();
        }
      }
      cleanModalMasks();
    }

    // === 执行投递与阶段状态检查 ===
    if (checkCaptcha()) {
      isPaused = true;
      playDoubleChime();
      return { success: false, reason: 'captcha_triggered', message: '触发平台安全滑块验证' };
    }

    let isSuccess = false;

    // 关键防跳盾：杜绝 <a> 标签原生导航跳转至 /web/geek/chat 破坏主检索流
    const linkEl = btnChat.tagName === 'A' ? btnChat : btnChat.closest('a');
    let origHref = '';
    if (linkEl) {
      linkEl.removeAttribute('target');
      origHref = linkEl.getAttribute('href') || '';
      if (origHref && !origHref.startsWith('javascript:')) {
        linkEl.setAttribute('data-original-href', origHref);
        linkEl.setAttribute('href', 'javascript:void(0);');
        setTimeout(() => {
          try {
            if (linkEl && linkEl.isConnected && origHref) {
              linkEl.setAttribute('href', origHref);
            }
          } catch (e) {}
        }, 1200);
      }
    }
    const preventJumpHandler = (e) => {
      if (linkEl) e.preventDefault();
    };
    btnChat.addEventListener('click', preventJumpHandler, { capture: true, once: true });

    // 记录当前待发自荐信（用于页面应急自愈）
    try {
      sessionStorage.setItem('ziaver_pending_chat_greeting', greetingText);
    } catch (e) {}

    // 触发真实拟人化鼠标事件序列并点击“立即沟通”
    logHUD('<span class="highlight">[触发沟通]</span> 正在点击【立即沟通】...');
    ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(evt => {
      try {
        btnChat.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
    });
    try {
      btnChat.click();
    } catch (e) {}

    // 极速侦测并自动点击「留在此页」，坚决拦截弹窗跳转与快速送达捕获
    for (let t = 0; t < 10; t++) {
      if (handleBossAlreadySentDialog()) {
        logHUD('<span class="success">[弹窗捕获] 成功捕获「已向BOSS发送消息」！自动点击「留在此页」，清除阻挡遮罩</span>');
        isSuccess = true;
        break;
      }
      if (checkIsDeliverySuccess()) {
        isSuccess = true;
        break;
      }
      await sleep(60);
    }

    // 检查是否立刻触发了上限熔断
    if (checkPlatformLimitDialog()) {
      return { success: false, reason: 'limit_reached', message: '平台今日打招呼次数已达上限' };
    }

    // 检查是否弹出滑块
    if (checkCaptcha()) {
      isPaused = true;
      playDoubleChime();
      return { success: false, reason: 'captcha_triggered', message: '触发平台安全滑块验证' };
    }

    // 处理自定义打招呼 textarea (若平台弹窗展示输入框)
    if (await handleGreetingTextareaDialog()) {
      isSuccess = true;
    }

    // 检查并发送抽屉或聊天小窗中的输入框 (确保后台个性化自荐话术真实送达HR)
    if (await handleChatDrawerOrBoxGreeting(greetingText)) {
      isSuccess = true;
    }

    // 处理二次确认弹窗
    if (await handleSecondaryConfirmDialog()) {
      await sleep(400);
      if (handleBossAlreadySentDialog() || checkIsDeliverySuccess()) {
        isSuccess = true;
      }
    }

    // 若极速侦测或弹窗发送已锁定送达成功，立即返回，杜绝冗余无谓死等
    if (isSuccess) {
      try { sessionStorage.removeItem('ziaver_pending_chat_greeting'); } catch (e) {}
      cleanModalMasks();
      return { success: true, message: '已成功送达并确认回执' };
    }

    // 轮询 3.5 秒严格校验送达回执
    const startTime = Date.now();
    while (Date.now() - startTime < 3500) {
      if (handleBossAlreadySentDialog()) {
        logHUD('<span class="success">[弹窗捕获] 轮询检测到「已向BOSS发送消息」！自动点击「留在此页」并清理遮罩</span>');
        isSuccess = true;
        break;
      }
      if (checkPlatformLimitDialog()) {
        return { success: false, reason: 'limit_reached', message: '平台今日打招呼次数已达上限' };
      }
      if (checkCaptcha()) {
        isPaused = true;
        playDoubleChime();
        return { success: false, reason: 'captcha_triggered', message: '触发平台安全滑块验证' };
      }
      if (checkIsDeliverySuccess()) {
        isSuccess = true;
        break;
      }
      await sleep(200);
    }

    if (isSuccess) {
      try { sessionStorage.removeItem('ziaver_pending_chat_greeting'); } catch (e) {}
      cleanModalMasks();
      return { success: true, message: '已成功送达并确认回执' };
    } else {
      try { sessionStorage.removeItem('ziaver_pending_chat_greeting'); } catch (e) {}
      // 未确认成功：安全关闭可能残留的弹窗，防止遮罩阻挡
      dismissAnyStuckDialog();
      cleanModalMasks();
      return {
        success: false,
        reason: 'unverified',
        message: '未检测到按钮转变为已沟通或成功回执，已跳过'
      };
    }
  }

  function checkAndResumePipeline() {
    try {
      const raw = sessionStorage.getItem('ziaver_pipeline_boss_state');
      chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        renderPipelineHUD(res);

        if (!raw) return;
        const state = JSON.parse(raw);
        if (!state || !state.inPipeline) return;
        if (Date.now() - state.timestamp > 300000) {
          sessionStorage.removeItem('ziaver_pipeline_boss_state');
          return;
        }

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
        chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
          if (res) renderPipelineHUD(res);
        });
      });
      sendResponse({ status: 'started', platform: 'BOSS直聘' });
      return true;
    } else if (request.type === 'STOP_CRUISE_PIPELINE') {
      stopAutopilot();
      renderPipelineHUD({ isActive: false });
      sendResponse({ status: 'stopped' });
      return true;
    } else if (request.type === 'PIPELINE_BROADCAST_STATUS') {
      renderPipelineHUD(request.status);
      sendResponse({ status: 'ok' });
      return true;
    } else if (request.type === 'DATE_CHANGED') {
      console.log('[ZIAVER Autopilot] BOSS 直聘收到跨日广播，新日期:', request.today);
      refreshConfig();
      sendResponse({ status: 'ok' });
      return true;
    } else if (request.type === 'HR_ALERT_COORDINATION_SYNC') {
      // 接收来自 background 的多标签页协同广播，即时对齐本地基准，避免本标签页后续定时器误报
      if (request.platform === 'boss') {
        lastAlertTimestamp = request.timestamp || Date.now();
        if (request.count) {
          lastHeaderUnreadCount = Math.max(lastHeaderUnreadCount, request.count);
          lastTitleUnreadCount = Math.max(lastTitleUnreadCount, request.count);
        }
        lastTitleHasMessage = true;
      }
      sendResponse({ status: 'synced' });
      return true;
    } else if (request.type === 'PING') {
      sendResponse({ status: 'pong', platform: 'BOSS直聘' });
      return true;
    }
  });

  // ================= 实时跨日状态感应探针 (防止开着标签页过夜不刷新的情况) =================
  setInterval(() => {
    const today = getLocalDateStr();
    if (config.lastActiveDate && config.lastActiveDate !== today) {
      console.log('[ZIAVER Autopilot] BOSS 直聘页面探针感应到跨日变更，自动刷新配置与今日计数');
      refreshConfig();
    }
  }, 20000);

  window.addEventListener('focus', () => {
    const today = getLocalDateStr();
    if (config.lastActiveDate && config.lastActiveDate !== today) {
      refreshConfig();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      const today = getLocalDateStr();
      if (config.lastActiveDate && config.lastActiveDate !== today) {
        refreshConfig();
      }
    }
  });

  // ================= HR 智能快捷回复应答助手 =================
  const DEFAULT_QUICK_REPLIES = [
    {
      id: 'qr_1',
      tag: '🌍 问询海外区域/品类',
      title: '请教海外区域与业务品类 (核心定制)',
      text: '您好，感谢关注！我仔细看了一下咱们的岗位要求，想先请教一下，咱们目前这条业务线主要面向的是哪个海外区域和核心业务品类呢？方便的话我可以针对性提供过往的海外商业化实战案例与数据复盘～'
    },
    {
      id: 'qr_grad2024',
      tag: '🎓 24届应届/实战优势',
      title: '说明2024年9月毕业+一年实战落地经验',
      text: '您好，感谢关注与青睐！我是2024年9月毕业，完全符合贵司对2024届/应届择业期的时间要求；同时已有近一年的商业化实战落地经验，执行力与数据复盘能力强。请问目前岗位方便约一个沟通时间吗？'
    },
    {
      id: 'qr_2',
      tag: '📋 索取岗位JD',
      title: '积极意向+索取详细职责与JD',
      text: '您好，非常感谢您的认可与邀请！我对咱们公司的业务方向很感兴趣。方便发一下该岗位的详细职责与业务重点吗？随时沟通交流～'
    },
    {
      id: 'qr_3',
      tag: '📄 简历/作品案例推送',
      title: '沉淀案例推送+约聊',
      text: '您好，非常荣幸收到关注！附件已更新我针对该方向沉淀的最新简历与作品案例（包含达人拓展SOP与商业化投放复盘），背景契合度较高。请问咱们方便约个时间做进一步电话沟通吗？'
    },
    {
      id: 'qr_4',
      tag: '💰 薪资与作息',
      title: '了解薪资预算与上下班机制',
      text: '您好，收到邀请，非常感谢！想先简单了解一下，咱们目前该岗位的薪资预算区间以及作息/加班机制是怎样的呢？'
    },
    {
      id: 'qr_5',
      tag: '🤝 礼貌婉拒',
      title: '方向略有偏差，委婉婉拒',
      text: '您好，非常感谢您的认可与邀请！仔细评估后感觉目前个人求职规划略有偏差，暂时不考虑该机会，祝您早日招到心仪候选人！'
    }
  ];

  function showQuickReplyToast(msg) {
    const existing = document.getElementById('ziaver-qr-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'ziaver-qr-toast';
    toast.style.cssText = `
      position: fixed;
      top: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(11, 15, 25, 0.95);
      border: 1px solid #00f2fe;
      color: #e2e8f0;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 16px rgba(0,242,254,0.25);
      z-index: 99999999;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 350);
    }, 2200);
  }

  function fillChatInput(text) {
    const inputSelectors = [
      'div.chat-input[contenteditable="true"]',
      'div[contenteditable="true"]',
      '.chat-editor [contenteditable="true"]',
      '.chat-message-input',
      'textarea.chat-input',
      '.chat-editor textarea',
      'textarea'
    ];
    let targetInput = null;
    for (const sel of inputSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.closest('#ziaver-boss-hud') || el.closest('#ziaver-quick-reply-bar')) continue;
        if (el.offsetWidth > 0 || el.offsetHeight > 0) {
          targetInput = el;
          break;
        }
      }
      if (targetInput) break;
    }

    if (!targetInput) {
      navigator.clipboard.writeText(text);
      showQuickReplyToast('📋 已复制到剪贴板，请在聊天框按 Ctrl+V 粘贴！');
      return;
    }

    targetInput.focus();
    if (targetInput.isContentEditable) {
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      if (!targetInput.innerText.trim()) {
        targetInput.innerText = text;
      }
      targetInput.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
      targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
    } else {
      targetInput.value = text;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    showQuickReplyToast('✨ 话术已一键填入输入框，请核对微调后发送！');
  }

  function initChatQuickReplies() {
    let customReplies = [];

    function loadReplies(cb) {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['customQuickReplies'], (res) => {
          if (res && Array.isArray(res.customQuickReplies)) {
            customReplies = res.customQuickReplies;
          }
          if (cb) cb();
        });
      } else {
        if (cb) cb();
      }
    }

    function renderBar() {
      const editorContainers = document.querySelectorAll('.chat-editor, .chat-conversation, .chat-input, .message-controls, .im-chat, .chat-op');
      if (!editorContainers || editorContainers.length === 0) return;

      if (document.getElementById('ziaver-quick-reply-bar')) return;

      const bar = document.createElement('div');
      bar.id = 'ziaver-quick-reply-bar';
      bar.style.cssText = `
        position: relative;
        z-index: 9999;
        margin: 6px 0;
        padding: 7px 12px;
        background: rgba(11, 15, 25, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(0, 242, 254, 0.35);
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      `;

      const allReplies = [...DEFAULT_QUICK_REPLIES, ...customReplies];

      bar.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: #00f2fe;">⚡ HR 智能快捷回复助手</span>
            <span style="font-size: 10px; color: #94a3b8;">(点击一键填入输入框)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="btn-add-quick-reply" style="background: rgba(0, 242, 254, 0.15); border: 1px dashed rgba(0, 242, 254, 0.4); color: #00f2fe; font-size: 10.5px; padding: 2px 7px; border-radius: 4px; cursor: pointer;">+ 自定义话术</button>
            <button id="btn-toggle-qr-collapse" style="background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 0 4px;" title="收起/展开">—</button>
          </div>
        </div>
        <div id="qr-chips-container" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 3px; scrollbar-width: thin;">
          ${allReplies.map(r => `
            <div class="qr-chip" data-id="${r.id}" title="${r.title}：\n${r.text}" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 14px; padding: 3px 9px; cursor: pointer; white-space: nowrap; font-size: 11px; color: #e2e8f0; transition: all 0.15s ease;">
              <span class="qr-chip-text">${r.tag || r.title}</span>
              <span class="qr-copy-btn" data-text="${encodeURIComponent(r.text)}" title="仅复制到剪贴板" style="color: #94a3b8; font-size: 10px; margin-left: 2px; padding: 0 2px;">📋</span>
              ${r.id.startsWith('custom_') ? `<span class="qr-del-btn" data-id="${r.id}" title="删除此自定义话术" style="color: #ef4444; font-size: 10px; margin-left: 2px;">×</span>` : ''}
            </div>
          `).join('')}
        </div>
      `;

      const targetContainer = document.querySelector('.chat-editor, .chat-input, .message-controls, .im-chat, .chat-op');
      if (targetContainer) {
        targetContainer.parentNode.insertBefore(bar, targetContainer);
      } else {
        document.body.appendChild(bar);
      }

      bar.querySelectorAll('.qr-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('qr-copy-btn') || e.target.classList.contains('qr-del-btn')) return;
          const id = chip.getAttribute('data-id');
          const reply = allReplies.find(r => r.id === id);
          if (reply) {
            fillChatInput(reply.text);
          }
        });
        chip.addEventListener('mouseenter', () => {
          chip.style.background = 'rgba(0, 242, 254, 0.2)';
          chip.style.borderColor = '#00f2fe';
        });
        chip.addEventListener('mouseleave', () => {
          chip.style.background = 'rgba(255, 255, 255, 0.06)';
          chip.style.borderColor = 'rgba(0, 242, 254, 0.25)';
        });
      });

      bar.querySelectorAll('.qr-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const text = decodeURIComponent(btn.getAttribute('data-text'));
          navigator.clipboard.writeText(text);
          showQuickReplyToast('📋 话术已复制到剪贴板！');
        });
      });

      bar.querySelectorAll('.qr-del-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          customReplies = customReplies.filter(r => r.id !== id);
          if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ customQuickReplies: customReplies }, () => {
              bar.remove();
              renderBar();
              showQuickReplyToast('🗑️ 自定义话术已删除');
            });
          }
        });
      });

      bar.querySelector('#btn-add-quick-reply')?.addEventListener('click', () => {
        const tag = prompt('请输入快捷话术标签名称 (例如: 问询海外作息 / 远程办公):');
        if (!tag || !tag.trim()) return;
        const text = prompt('请输入回复话术完整内容:');
        if (!text || !text.trim()) return;

        const newReply = {
          id: 'custom_' + Date.now(),
          tag: tag.trim(),
          title: tag.trim(),
          text: text.trim()
        };
        customReplies.push(newReply);
        if (chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ customQuickReplies: customReplies }, () => {
            bar.remove();
            renderBar();
            showQuickReplyToast('🎉 自定义话术已保存并添加到工具条！');
          });
        }
      });

      const toggleBtn = bar.querySelector('#btn-toggle-qr-collapse');
      const chipsContainer = bar.querySelector('#qr-chips-container');
      toggleBtn?.addEventListener('click', () => {
        if (chipsContainer.style.display === 'none') {
          chipsContainer.style.display = 'flex';
          toggleBtn.textContent = '—';
        } else {
          chipsContainer.style.display = 'none';
          toggleBtn.textContent = '+';
        }
      });
    }

    loadReplies(() => {
      renderBar();
      setInterval(() => {
        if (!document.getElementById('ziaver-quick-reply-bar')) {
          renderBar();
        }
      }, 2000);
    });
  }

  // 1. 检查并自动恢复从聊天界面重定向至职位检索页的巡航
  function checkAndResumeFromChatRedirect() {
    try {
      const savedAutoStart = sessionStorage.getItem('ziaver_auto_start_boss_cruise');
      if (savedAutoStart && window.location.pathname.startsWith('/web/geek/job')) {
        sessionStorage.removeItem('ziaver_auto_start_boss_cruise');
        const params = JSON.parse(savedAutoStart);
        setTimeout(() => {
          logHUD('<span class="success">[自动续航]</span> 已成功回到职位检索页，正在无缝启动巡航！');
          startAutopilot(params.target, params.isFromPipeline, params.initialSessionCount);
        }, 1200);
      }
    } catch (e) {}
  }

  // 2. 聊天界面应急自荐信补发与自动返回机制 (兜底方案)
  async function checkAndHandleChatPageRescue() {
    if (!window.location.pathname.startsWith('/web/geek/chat')) return;
    try {
      const pendingGreeting = sessionStorage.getItem('ziaver_pending_chat_greeting');
      if (pendingGreeting) {
        sessionStorage.removeItem('ziaver_pending_chat_greeting');
        console.log('[ZIAVER BOSS] 兜底捕获：检测到未发送的后台自荐信，正在聊天页自动键入补发...', pendingGreeting.slice(0, 30));
        await sleep(1500);
        const chatInput = document.querySelector(
          '.chat-conversation [contenteditable="true"], .chat-box [contenteditable="true"], .im-chat [contenteditable="true"], ' +
          '.chat-editor [contenteditable="true"], .chat-input[contenteditable="true"], textarea.chat-input, textarea'
        );
        if (chatInput) {
          chatInput.focus();
          if (chatInput.isContentEditable || chatInput.getAttribute('contenteditable') === 'true') {
            chatInput.innerText = pendingGreeting;
          } else {
            chatInput.value = pendingGreeting;
          }
          chatInput.dispatchEvent(new Event('input', { bubbles: true }));
          chatInput.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(500);
          const sendBtn = document.querySelector('.btn-send, button[ka="chat_send"], button[class*="send"]');
          if (sendBtn) {
            sendBtn.click();
          } else {
            chatInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          }
          await sleep(800);
          console.log('[ZIAVER BOSS] 聊天页自荐信已成功送达！正在自动返回职位列表页继续巡航...');
          window.location.href = 'https://www.zhipin.com/web/geek/job?city=101280600';
        }
      }
    } catch (e) {}
  }

  if (location.hostname.includes('zhipin.com')) {
    initManualApplyInterceptor();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        refreshConfig(() => {
          createHUD();
          startHRReplyWatcher();
          checkAndResumePipeline();
          initChatQuickReplies();
          checkAndResumeFromChatRedirect();
          checkAndHandleChatPageRescue();
        });
      });
    } else {
      refreshConfig(() => {
        createHUD();
        startHRReplyWatcher();
        checkAndResumePipeline();
        initChatQuickReplies();
        checkAndResumeFromChatRedirect();
        checkAndHandleChatPageRescue();
      });
    }
  }
})();
