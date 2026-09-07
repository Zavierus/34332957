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
  let currentTagIndex = 0;
  let pipelineStatusCache = null;

  // 捕获并抑制聊一聊弹出的多余空白新标签页，防止多窗口泛滥
  let lastLiepinChatOpenedTime = 0;
  const rawWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (isRunning && url && (String(url).includes('/im/') || String(url).includes('/chat/') || String(url).includes('liepin.com/a/'))) {
      console.log('[ZIAVER 猎聘] 捕获并抑制聊一聊弹出的聊天新标签页:', url);
      lastLiepinChatOpenedTime = Date.now();
      return null;
    }
    return rawWindowOpen.apply(this, arguments);
  };

  let config = {
    dailyLimit: 30,
    minSalaryK: 9,
    targetCity: '深圳',
    strictCityFilter: true,
    gradYear: '2024',
    enableCampus2024Protection: true,
    blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,保险,推广兼职,培训生',
    acceptAllInPageFilter: true // 优先按页面筛选投递，避免微小词差导致岗位被跳过
  };

  // ================= 本地日历日期工具函数 (适配时区，杜绝 UTC 早晨滞后) =================
  function getLocalDateStr(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function refreshConfig(callback) {
    if (!chrome.storage || !chrome.storage.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(['config', 'jobTags'], (res) => {
      const today = getLocalDateStr();
      if (res && res.config) {
        config = { targetCity: '深圳', acceptAllInPageFilter: true, ...config, ...res.config };
        if (config.lastActiveDate === today) {
          const counts = config.siteTodayCounts || {};
          todayCount = counts.liepin !== undefined ? counts.liepin : 0;
        } else {
          // 跨日检测：自动清零并写回 storage
          console.log(`[ZIAVER Autopilot] 猎聘网检测到跨日: 上次活跃「${config.lastActiveDate || '无'}」-> 今日「${today}」，执行清零`);
          todayCount = 0;
          config.lastActiveDate = today;
          config.todayCount = 0;
          config.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
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
        activeTags = ['达人运营', '电商运营', '游戏运营', '商业摄影', '视觉策划', '综合运营'];
      }
      if (callback) callback();
      updateHUD();
    });
  }

  function generateDynamicNote(title, matchedTag, company, isCampus2024 = false) {
    const cleanTitle = (title || '').replace(/[\(（].*?[\)）]/g, '').trim() || title || '这个岗位';
    const cleanCompany = (company || '').trim();

    // 🎓 2024届校招/补录专属自荐信（强调2024年9月毕业资质 + 近一年商业化实战经验）
    if (isCampus2024) {
      return `您好！看到咱们在招「${cleanTitle}」，我于2024年9月毕业，正好完全符合贵司对2024届/应届择业期的毕业时间要求；同时在过去一年中我积累了扎实的商业化运营与业务落地实战经验（涵盖海外运营、达人拓展与数据复盘），自驱力强、重数据重执行。附件已附上完整简历，非常期待能与您做进一步沟通，祝您工作顺利、天天开心～`;
    }

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

  // ================= 薪资解析器 (兼容猎聘 10-15万、10万以下、8-12K 等格式) =================
  function parseSalaryMaxK(salaryStr) {
    if (!salaryStr) return null;
    const s = salaryStr.trim();
    // 10-15万 或 10-15万·13薪 或 15万以上
    const wanMatch = s.match(/(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?万/);
    if (wanMatch) {
      const maxWan = wanMatch[2] ? parseFloat(wanMatch[2]) : parseFloat(wanMatch[1]);
      return Math.round((maxWan * 10000) / 12 / 1000); // 15万年薪折算月薪约 12.5K
    }
    if (s.includes('10万以下')) return 8;
    const kMatch = s.match(/(\d+)(?:-(\d+))?[k千]/i);
    if (kMatch) {
      return kMatch[2] ? parseInt(kMatch[2], 10) : parseInt(kMatch[1], 10);
    }
    return null;
  }

  // ================= 猎聘顶部筛选自动化检测与应用引擎 =================
  function getLiepinCurrentFilters() {
    let city = '';
    let salary = '';
    let exp = '';
    let active = '';

    // 1. 从页面“已选条件”区域提取
    const selectedContainers = document.querySelectorAll(
      '.selected-box, .selected-condition, .selected-item-box, [class*="selected"], .search-condition'
    );
    for (const box of selectedContainers) {
      const text = box.textContent || '';
      if (text.includes('已选条件') || text.includes('深圳') || text.includes('10-15万') || text.includes('1年以内') || text.includes('10万以下')) {
        const tags = Array.from(box.querySelectorAll('span, a, div, .ant-tag')).map(el => el.textContent.replace(/[x×]/g, '').trim()).filter(Boolean);
        for (const t of tags) {
          if (t.includes('深圳') || t.includes('北京') || t.includes('上海') || t.includes('广州')) city = t;
          if (t.includes('万') || t.includes('千') || t.includes('薪')) salary = t;
          if (t.includes('年') || t.includes('应届') || t.includes('实习')) exp = t;
        }
      }
    }

    // 2. 从 URL Query 参数提取补充
    const params = new URLSearchParams(window.location.search);
    if (!city && params.get('city') === '050090') city = '深圳';
    if (!salary && params.get('salary')) {
      const s = params.get('salary');
      if (s === '10$15') salary = '10-15万';
      else salary = s;
    }
    if (!exp && params.get('workYearCode')) {
      const w = params.get('workYearCode');
      if (w === '1') exp = '1年以内';
      else if (w === '0') exp = '应届生';
      else exp = `${w}年`;
    }

    const hasFilters = !!(city || salary || exp);
    const summary = [city, salary, exp].filter(Boolean).join(' · ') || '未选(全量推荐)';

    return { city, salary, exp, hasFilters, summary };
  }

  async function applyLiepinTopFilters(customOptions = {}) {
    const targetCity = customOptions.city || '深圳';
    const targetSalary = customOptions.salary || '10-15万';
    const targetExp = customOptions.exp || '1年以内';
    const targetActive = customOptions.recruiterActive || '不限';

    logHUD(`<span class="highlight">[自动配置筛选]</span> 正在为您配置顶部精选筛选：【${targetCity} · ${targetSalary} · ${targetExp} · 活跃:${targetActive}】...`);

    function tryClickOption(catHint, optName) {
      const allElements = document.querySelectorAll('div, dl, tr, p, section, li');
      for (const row of allElements) {
        if (row.children.length >= 2 && row.children.length <= 40) {
          const rowText = (row.textContent || '').slice(0, 120);
          if (rowText.includes(catHint)) {
            const items = row.querySelectorAll('a, span, button, li');
            for (const item of items) {
              const txt = item.textContent.trim();
              if (txt === optName && item.children.length === 0) {
                if (item.classList.contains('active') || item.classList.contains('selected') || item.classList.contains('ant-tag')) {
                  return true;
                }
                try {
                  item.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  ['mouseenter', 'mousedown', 'mouseup', 'click'].forEach(evt => {
                    item.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
                  });
                  if (typeof item.click === 'function') item.click();
                  return true;
                } catch (e) {}
              }
            }
          }
        }
      }
      return false;
    }

    tryClickOption('城市', targetCity);
    await sleep(400);
    tryClickOption('薪资', targetSalary);
    await sleep(400);
    tryClickOption('经验', targetExp);
    await sleep(400);
    tryClickOption('招聘者活跃', targetActive);
    await sleep(800);

    const curFilters = getLiepinCurrentFilters();
    if (!curFilters.hasFilters || !curFilters.city.includes('深圳')) {
      const currentUrl = new URL(window.location.href);
      currentUrl.pathname = '/zhaopin/';
      currentUrl.searchParams.set('city', '050090');
      currentUrl.searchParams.set('salary', '10$15');
      currentUrl.searchParams.set('workYearCode', '1');
      if (!currentUrl.searchParams.get('key')) {
        const firstTag = activeTags[0] || '运营';
        currentUrl.searchParams.set('key', firstTag);
      }
      logHUD(`<span class="success">[精准URL载入]</span> 正在跳转至包含精选条件的搜索页: ${targetCity} · ${targetSalary} · ${targetExp}...`);
      await sleep(600);
      window.location.href = currentUrl.toString();
      return;
    }

    logHUD(`<span class="success">[筛选已就绪]</span> 顶部筛选已成功配置：<b>${curFilters.summary}</b>！`);
    updateHUD();
  }

  // ================= 智能卡片聊一聊按钮与状态识别引擎 =================
  function findLiepinChatButton(card) {
    if (!card) return { button: null, isHandled: false, reason: '未获取到卡片DOM' };

    // 1. 模拟鼠标移入卡片，激活悬浮出现的“聊一聊”按钮
    try {
      card.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    } catch (e) {}

    // 2. 预先检查卡片中是否已明确显示为已沟通/已应聘
    const cardFullText = (card.textContent || '').trim();
    const alreadyDoneTokens = ['已沟通', '继续沟通', '已应聘', '已投递', '已打招呼', '已聊', '聊过', '已联系', '再次沟通'];

    // 3. 猎聘目标可点击的沟通/应聘按钮文字（涵盖“聊一聊”）
    const targetTokens = ['聊一聊', '去聊聊', '立即沟通', '在线沟通', '打招呼', '立即应聘', '极速应聘', '应聘', '投递简历', '沟通'];

    // 4. 优先检查具备按钮属性或类名的交互元素
    const candidateNodes = card.querySelectorAll(
      'button, a, div[role="button"], span.btn, .btn-chat, .chat-btn, .btn-apply, .apply-btn, [class*="chat"], [class*="apply"], [class*="btn"], .job-card-pc-container button, [data-nick="job-card"] button, .job-card-right button, .job-card-right a'
    );

    for (const el of candidateNodes) {
      const txt = el.textContent.trim();
      // 判断是否已沟通
      if (alreadyDoneTokens.some(tok => txt === tok || (txt.includes(tok) && !targetTokens.some(tt => txt.includes(tt))))) {
        return { button: null, isHandled: true, reason: `此前已沟通/已应聘 (${txt})` };
      }
      // 判断是否可发起沟通
      if (targetTokens.some(tok => txt === tok || txt.includes(tok))) {
        if (el.disabled || el.getAttribute('disabled') !== null || el.classList.contains('disabled') || el.classList.contains('ant-btn-disabled')) {
          return { button: null, isHandled: true, reason: '按钮处于禁用状态' };
        }
        return { button: el, isHandled: false, text: txt };
      }
    }

    // 5. 若常规按钮未查到，遍历所有叶子文本节点进行二次深度查找
    const allLeafNodes = card.querySelectorAll('*');
    for (const leaf of allLeafNodes) {
      if (leaf.children.length === 0) {
        const txt = leaf.textContent.trim();
        if (targetTokens.includes(txt)) {
          const clickable = leaf.closest('button, a, div[role="button"], [class*="btn"]') || leaf;
          return { button: clickable, isHandled: false, text: txt };
        }
        if (alreadyDoneTokens.includes(txt)) {
          return { button: null, isHandled: true, reason: `此前已沟通 (${txt})` };
        }
      }
    }

    return { button: null, isHandled: false, reason: '未找到可用的聊一聊/应聘按钮' };
  }

  // ================= 严格地理位置核验引擎 (猎聘网 - 杜绝上海/异地侵入) =================
  function verifyLiepinJobLocation(card, title = '', company = '') {
    const targetCity = (config.targetCity || '深圳').trim();
    if (config.strictCityFilter === false) {
      return { pass: true, jobArea: targetCity };
    }

    const OTHER_CITIES = [
      '上海', '北京', '广州', '杭州', '成都', '武汉', '南京', '东莞', '佛山', '西安',
      '长沙', '苏州', '重庆', '天津', '青岛', '厦门', '珠海', '郑州', '合肥', '无锡',
      '宁波', '中山', '惠州', '济南', '沈阳', '大连', '昆明', '南宁', '长春', '哈尔滨'
    ].filter(c => c !== targetCity);

    const SZ_DISTRICTS = ['南山', '福田', '宝安', '龙岗', '龙华', '罗湖', '光明', '坪山', '盐田', '大鹏'];

    // 1. 优先提取 DOM 明确地点
    const areaEl = card ? card.querySelector('.job-dq-box, .job-area, .job-city, [data-nick="job-area"], .area-box, .city-name, [class*="job-dq"], [class*="city-name"]') : null;
    let jobArea = areaEl ? areaEl.textContent.trim() : '';
    if (!jobArea && card) {
      const infoEl = card.querySelector('.job-info, .job-labels-box, .job-card-left, .ellipsis-1');
      if (infoEl) {
        const m = infoEl.textContent.match(/([^\s·•|]+-[^\s·•|]+|[^\s·•|]+市|[^\s·•|]+区)/);
        if (m) jobArea = m[0];
      }
    }

    if (jobArea) {
      if (jobArea.includes(targetCity) || (targetCity === '深圳' && SZ_DISTRICTS.some(d => jobArea.includes(d)))) {
        return { pass: true, jobArea };
      }
      const detectedOther = OTHER_CITIES.find(c => jobArea.includes(c));
      if (detectedOther) {
        return { pass: false, reason: `[异地跳过] 岗位地点为「${jobArea}」，明确归属异地城市(${detectedOther})，非${targetCity}` };
      }
      if (!jobArea.includes('远程') && !jobArea.includes('全国') && !jobArea.includes('异地')) {
        return { pass: false, reason: `[异地跳过] 岗位地点为「${jobArea}」，未包含目标城市(${targetCity})` };
      }
    }

    // 2. 兜底扫描：全卡片文本排查
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

  // ================= 2024届校招与优质应届宝藏识别引擎 (猎聘网) =================
  function detect2024CampusOpportunity(title, company, cardLabels = '', desc = '', cardText = '') {
    if (config.enableCampus2024Protection === false) {
      return { isCampus2024: false };
    }
    const combined = `${title} ${company} ${cardLabels} ${desc} ${cardText}`.toLowerCase();

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

  function screenJob(title, salary, company, card) {
    if (!title) return { pass: false, reason: '未获取到职位标题' };

    // 0. 目标城市强过滤（严格防异地侵入，默认锁定深圳）
    const locResult = verifyLiepinJobLocation(card, title, company);
    if (!locResult.pass) {
      return locResult;
    }

    // 提取卡片业务标签 (猎聘卡片通常带有业务领域/核心技能标签)
    let cardLabels = '';
    if (card) {
      const labelEls = card.querySelectorAll('.labels-box, .job-labels-box, .tag-item, .tag-box span, .labels-item, .job-tag, .tag-list span, .job-labels span');
      cardLabels = Array.from(labelEls).map(el => el.textContent.trim()).filter(Boolean).join(' ');
    }

    const fullCardText = `${title} ${cardLabels}`.toLowerCase();

    // 1. 2024届校招/补录与优质应届通道识别
    const rawCardText = card ? (card.innerText || card.textContent || '') : '';
    const campusCheck = detect2024CampusOpportunity(title, company, cardLabels, '', `${fullCardText} ${rawCardText}`);

    // 2. 检查命中高亮职业词条 (精准标题匹配 + 业务标签命中 + 柔性语义匹配)
    let matchedTag = null;
    let matchType = '';

    for (const tag of activeTags) {
      const lowerTag = tag.toLowerCase();
      // A. 标题直接包含完整词条
      if (title.toLowerCase().includes(lowerTag)) {
        matchedTag = tag;
        matchType = '标题命中';
        break;
      }
      // B. 卡片标签命中完整词条
      if (cardLabels.toLowerCase().includes(lowerTag)) {
        matchedTag = tag;
        matchType = '业务标签命中';
        break;
      }
      // C. 柔性赛道意图匹配 (大幅提高猎聘卡片命中率)
      if (lowerTag === '达人运营' || lowerTag === '达播bd' || lowerTag === '达人拓展' || lowerTag === '媒介') {
        if (fullCardText.includes('达人') && (fullCardText.includes('运营') || fullCardText.includes('bd') || fullCardText.includes('商务') || fullCardText.includes('合作') || fullCardText.includes('媒介') || fullCardText.includes('渠道'))) {
          matchedTag = tag;
          matchType = '达人/商务柔性命中';
          break;
        }
      } else if (lowerTag === '千川投放' || lowerTag === '巨量千川') {
        if (fullCardText.includes('千川') || (fullCardText.includes('信息流') && fullCardText.includes('投放')) || fullCardText.includes('广告投放')) {
          matchedTag = tag;
          matchType = '千川投放柔性命中';
          break;
        }
      } else if (lowerTag === '电商运营' || lowerTag === '店铺运营') {
        if ((fullCardText.includes('电商') || fullCardText.includes('店铺') || fullCardText.includes('天猫') || fullCardText.includes('抖音') || fullCardText.includes('淘系') || fullCardText.includes('京东') || fullCardText.includes('跨境')) && (fullCardText.includes('运营') || fullCardText.includes('店长') || fullCardText.includes('操盘') || fullCardText.includes('专员') || fullCardText.includes('助理'))) {
          matchedTag = tag;
          matchType = '电商赛道柔性命中';
          break;
        }
      } else if (lowerTag === '直播运营' || lowerTag === '直播间运营') {
        if (fullCardText.includes('直播') && (fullCardText.includes('运营') || fullCardText.includes('场控') || fullCardText.includes('中控') || fullCardText.includes('排品') || fullCardText.includes('主播'))) {
          matchedTag = tag;
          matchType = '直播赛道柔性命中';
          break;
        }
      } else if (lowerTag === '短视频运营' || lowerTag === '短视频编导') {
        if ((fullCardText.includes('短视频') || fullCardText.includes('新媒体') || fullCardText.includes('视频')) && (fullCardText.includes('运营') || fullCardText.includes('编导') || fullCardText.includes('剪辑') || fullCardText.includes('策划'))) {
          matchedTag = tag;
          matchType = '短视频赛道柔性命中';
          break;
        }
      } else if (lowerTag === '游戏运营' || lowerTag === '游戏社区' || lowerTag === '玩家运营') {
        if (fullCardText.includes('游戏') && (fullCardText.includes('运营') || fullCardText.includes('社区') || fullCardText.includes('发行') || fullCardText.includes('生态') || fullCardText.includes('策划'))) {
          matchedTag = tag;
          matchType = '游戏赛道柔性命中';
          break;
        }
      } else if (lowerTag === '商业摄影' || lowerTag === '摄影' || lowerTag === '视觉策划') {
        if (fullCardText.includes('摄影') || fullCardText.includes('摄像') || fullCardText.includes('视觉') || fullCardText.includes('美工') || fullCardText.includes('修图') || fullCardText.includes('设计') || fullCardText.includes('策划')) {
          matchedTag = tag;
          matchType = '摄影/视觉赛道柔性命中';
          break;
        }
      } else if (lowerTag === '综合运营' || lowerTag === '运营专员' || lowerTag === '用户运营') {
        if (fullCardText.includes('运营') || fullCardText.includes('专员') || fullCardText.includes('助理') || fullCardText.includes('执行')) {
          matchedTag = tag;
          matchType = '综合运营柔性命中';
          break;
        }
      }
    }

    // D. 若未命中常规词条，但该岗位属于 2024届校招/应届宝藏，赋予专属标签放行
    if (!matchedTag && campusCheck.isCampus2024) {
      matchedTag = campusCheck.tag;
      matchType = '🎓24届校招宝藏专场命中';
    }

    // E. 页面筛选宽容模式：若当前页面已是用户按筛选（深圳·10-15万·1年）过滤出的列表，且包含运营/电商/新媒体/视觉/商务相关词汇，自动予以匹配
    if (!matchedTag && config.acceptAllInPageFilter !== false) {
      const curFilters = getLiepinCurrentFilters();
      if (curFilters.hasFilters) {
        const broadKeywords = ['运营', '专员', '助理', '电商', '视觉', '设计', '摄影', '策划', '新媒体', '短视频', '商务', '媒介', '渠道', '投放', '店长', '执行'];
        if (broadKeywords.some(k => fullCardText.includes(k))) {
          matchedTag = activeTags[0] || '综合运营';
          matchType = '页面精选筛选自适应命中';
        }
      }
    }

    if (!matchedTag) {
      return { pass: false, reason: `[未选中词条] 「${title}」未命中当前高亮的 ${activeTags.length} 个职业词条` };
    }

    // 3. 黑名单过滤 (2024届校招对管培生/助理等免疫误伤)
    const text = (title + ' ' + company + ' ' + cardLabels + ' ' + rawCardText).toLowerCase();
    const blacklist = (config.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);
    for (const b of blacklist) {
      const lowerB = b.toLowerCase().trim();
      if (!lowerB) continue;
      // 🎓 2024届校招保护特权：对管培生、培训生、运营助理免疫误杀
      if (campusCheck.isCampus2024 && (lowerB === '培训生' || lowerB === '管培生' || lowerB === '助理' || lowerB === '实习')) {
        continue;
      }
      if (text.includes(lowerB)) {
        return { pass: false, reason: `[触发黑名单] 命中词: "${b}"` };
      }
    }

    // 4. 薪资门槛 (智能兼容万/千/K，2024届校招保护免低薪拦截)
    const maxK = parseSalaryMaxK(salary);
    if (!campusCheck.isCampus2024 && maxK !== null && maxK < config.minSalaryK) {
      const curFilters = getLiepinCurrentFilters();
      if (!curFilters.salary || (!curFilters.salary.includes('10万以下') && !curFilters.salary.includes('10-15万'))) {
        return { pass: false, reason: `[低薪跳过] ${salary} 未达 ${config.minSalaryK}K` };
      }
    }

    return { pass: true, matchedTag, matchType, isCampus2024: campusCheck.isCampus2024, jobArea: locResult.jobArea };
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ================= Web Audio 提示音与音频上下文预解锁 (猎聘网) =================
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

      playTone(587.33, 0, 0.20);
      playTone(880.00, 0.22, 0.38);
    } catch (e) {
      console.warn('[Liepin Audio Alert Warning]', e);
    }
  }

  // ================= 浏览器标签页交替闪烁 =================
  let titleFlashInterval = null;
  let originalDocTitle = document.title;
  function startTitleFlashing(alertTitle = '【🔔 猎聘HR来新消息了!】') {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    if (!originalDocTitle || originalDocTitle.includes('新消息') || originalDocTitle.includes('HR')) {
      originalDocTitle = '猎聘网';
    }
    let flag = true;
    let count = 0;
    titleFlashInterval = setInterval(() => {
      document.title = flag ? alertTitle : originalDocTitle;
      flag = !flag;
      count++;
      if (count > 20) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalDocTitle;
      }
    }, 800);

    const onFocus = () => {
      if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalDocTitle;
      }
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);
  }

  // ================= 猎聘专属高可见度 Toast 弹窗 =================
  function showLiepinHRReplyToast(info = {}) {
    let toast = document.getElementById('ziaver-liepin-hr-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ziaver-liepin-hr-toast';
      toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #1e102f 0%, #2e1065 100%);
        border: 1.5px solid #a855f7;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 30px rgba(168, 85, 247, 0.4);
        border-radius: 12px;
        padding: 14px 18px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 320px;
        max-width: 440px;
        animation: ziaverLiepinSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
      `;
      const styleTag = document.createElement('style');
      styleTag.textContent = `
        @keyframes ziaverLiepinSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes ziaverLiepinPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(168,85,247,0.6)); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 16px rgba(168,85,247,0.95)); }
        }
      `;
      document.head.appendChild(styleTag);
      document.body.appendChild(toast);
    }

    const unreadCount = info.count || 1;
    const title = info.title || '猎聘网 · HR 新回复';
    const desc = info.desc || `检测到猎聘企业 HR 正在与您互动沟通，请及时跟进！`;
    const chatUrl = info.chatUrl || 'https://www.liepin.com/im/';

    toast.innerHTML = `
      <div style="font-size: 26px; line-height: 1; animation: ziaverLiepinPulse 2s infinite ease-in-out;">🔔</div>
      <div style="flex: 1;">
        <div style="font-size: 13.5px; font-weight: 700; color: #c084fc; display: flex; align-items: center; justify-content: space-between;">
          <span>${title}</span>
          <span style="font-size: 11px; background: rgba(168,85,247,0.25); color:#e9d5ff; padding: 2px 6px; border-radius: 10px; font-weight:600;">${unreadCount} 条新消息</span>
        </div>
        <div style="font-size: 12px; color: #e2e8f0; margin-top: 4px; line-height: 1.4;">${desc}</div>
      </div>
      <button id="ziaver-liepin-toast-btn" style="
        background: linear-gradient(135deg, #a855f7 0%, #c084fc 100%);
        border: none;
        border-radius: 6px;
        color: #fff;
        font-weight: 700;
        font-size: 11.5px;
        padding: 6px 12px;
        cursor: pointer;
        white-space: nowrap;
        box-shadow: 0 4px 12px rgba(168, 85, 247, 0.4);
      ">查看 ↗</button>
    `;

    toast.onclick = () => {
      window.open(chatUrl, '_blank');
      toast.remove();
    };

    const btn = toast.querySelector('#ziaver-liepin-toast-btn');
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        window.open(chatUrl, '_blank');
        toast.remove();
      };
    }

    if (toast._timer) clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.style.transition = 'opacity 0.5s, transform 0.5s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 500);
      }
    }, 8500);
  }

  // ================= HR 回复与私信多维强提醒引擎 (猎聘网) =================
  let lastLiepinUnreadCount = 0;
  let lastLiepinFriendMsgCount = -1;
  let lastLiepinTitleHasMessage = false;

  function startHRReplyWatcher() {
    try {
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const titleObs = new MutationObserver(() => {
          checkLiepinTitleForHR();
        });
        titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) {}

    setInterval(() => {
      checkAllLiepinHRMessageSources();
    }, 2500);
  }

  function checkLiepinTitleForHR() {
    const title = document.title || '';
    const hasMsg = /【.*?新消息.*?】|【\d+条|\(\d+\)\s*猎聘/i.test(title);
    if (hasMsg && !lastLiepinTitleHasMessage) {
      lastLiepinTitleHasMessage = true;
      dispatchLiepinHRReplyNotification({
        title: '🔔 猎聘网 · HR 发来新消息！',
        desc: '系统检测到网页标题出现新消息动态提示，猎头或HR正在期待您的回复～',
        count: 1
      });
    } else if (!hasMsg) {
      lastLiepinTitleHasMessage = false;
    }
  }

  function checkAllLiepinHRMessageSources() {
    let detectedUnread = 0;
    let hasRedDot = false;

    // A. 顶栏消息气泡扫描
    const headerMsgLinks = document.querySelectorAll(
      'a[href*="/im/"], a[href*="/chat/"], [data-nick="header-im"], .header-im, .header-message'
    );
    headerMsgLinks.forEach(link => {
      const badges = link.querySelectorAll(
        '.header-im-count, .im-badge, [class*="unread-count"], [class*="badge"], [class*="red-dot"], span.dot, i.dot'
      );
      badges.forEach(b => {
        if (b.offsetWidth > 0 || b.offsetHeight > 0 || window.getComputedStyle(b).display !== 'none') {
          const txt = b.textContent.trim();
          const num = parseInt(txt, 10);
          if (!isNaN(num) && num > 0) detectedUnread = Math.max(detectedUnread, num);
          else hasRedDot = true;
        }
      });
      const textMatch = (link.textContent || '').match(/[\(（](\d+)[\)）]/);
      if (textMatch) {
        const n = parseInt(textMatch[1], 10);
        if (!isNaN(n) && n > 0) detectedUnread = Math.max(detectedUnread, n);
      }
    });

    // B. 猎聘聊天内页扫描 (/im/)
    let inChatNewMessage = false;
    if (window.location.pathname.includes('/im/') || window.location.pathname.includes('/chat/')) {
      const chatUserBadges = document.querySelectorAll(
        '[class*="conversation"] [class*="unread"], [class*="conversation"] [class*="badge"], .im-list [class*="badge"]'
      );
      chatUserBadges.forEach(el => {
        if (el.offsetWidth > 0 || el.offsetHeight > 0) {
          const num = parseInt(el.textContent.trim(), 10);
          if (!isNaN(num) && num > 0) detectedUnread = Math.max(detectedUnread, num);
          else hasRedDot = true;
        }
      });

      const friendMsgs = document.querySelectorAll(
        '[class*="msg-item"][class*="friend"], [class*="chat-message"][class*="left"], [class*="item-friend"], .msg-left'
      );
      const curCount = friendMsgs.length;
      if (lastLiepinFriendMsgCount !== -1 && curCount > lastLiepinFriendMsgCount) {
        inChatNewMessage = true;
      }
      lastLiepinFriendMsgCount = curCount;
    }

    checkLiepinTitleForHR();

    const effectiveUnread = detectedUnread > 0 ? detectedUnread : (hasRedDot ? 1 : 0);
    const hasIncreased = effectiveUnread > lastLiepinUnreadCount;

    if (hasIncreased || inChatNewMessage) {
      console.log(`[ZIAVER Liepin] 🔔 侦测到猎聘 HR 新回复/私信！未读数: ${effectiveUnread}`);
      dispatchLiepinHRReplyNotification({
        title: '🔔 猎聘网 · HR 新回复/私信！',
        desc: inChatNewMessage ? '猎聘 HR 正在对话窗口中发来新消息！' : `有猎聘 HR/猎头正在与您互动沟通 (${effectiveUnread} 条未读)，请及时跟进！`,
        count: effectiveUnread || 1
      });
    }

    lastLiepinUnreadCount = effectiveUnread;
  }

  function dispatchLiepinHRReplyNotification(info = {}) {
    if (config.audioAlert !== false) playDoubleChime();
    showLiepinHRReplyToast({
      title: info.title || '猎聘网 · HR 新回复',
      desc: info.desc || '检测到企业 HR 正在与您互动，请及时跟进！',
      count: info.count || 1,
      chatUrl: 'https://www.liepin.com/im/'
    });
    startTitleFlashing('【🔔 猎聘HR来新消息了!】');
    if (config.desktopNotification !== false) {
      chrome.runtime.sendMessage({
        type: 'HR_REPLY_ALERT',
        platform: 'liepin',
        chatUrl: 'https://www.liepin.com/im/',
        text: info.desc || `猎聘网有新的 HR 沟通回复 (${info.count || 1} 条未读)，请及时跟进！`
      });
    }
    if (typeof logHUD === 'function') {
      logHUD(`<span class="success" style="font-weight: bold;">🔔 检测到猎聘 HR 新回复！请查看消息中心。</span>`);
    }
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
      /* 全网流水线专属进度卡片样式 */
      .pipeline-card {
        background: rgba(168, 85, 247, 0.12);
        border: 1px solid rgba(168, 85, 247, 0.45);
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
        color: #e9d5ff;
      }
      .pipe-pulse-dot {
        width: 7px;
        height: 7px;
        background: #34d399;
        border-radius: 50%;
        display: inline-block;
        margin-right: 5px;
        box-shadow: 0 0 8px #34d399;
        animation: pipePulse 1.5s infinite;
      }
      @keyframes pipePulse {
        0% { transform: scale(0.9); opacity: 0.7; }
        50% { transform: scale(1.3); opacity: 1; }
        100% { transform: scale(0.9); opacity: 0.7; }
      }
      .pipe-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(168, 85, 247, 0.35);
        color: #e9d5ff;
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
        background: linear-gradient(90deg, #a855f7 0%, #ec4899 100%);
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
            <span id="compact-pipe-stat" style="display:none; color:#c084fc; font-weight:700;">🌐 全网 0%</span>
            <span id="compact-status-tag" style="color:#34d399; font-size:10px;">🟢 就绪</span>
          </div>

          <!-- 全网流水线专属进度卡片 (Pipeline Banner) -->
          <div class="pipeline-card" id="hud-pipeline-card" style="display: none;">
            <div class="pipeline-header">
              <div style="display:flex; align-items:center;">
                <span class="pipe-pulse-dot"></span>
                <span class="pipe-title">🌐 全网流水线协同巡航中</span>
              </div>
              <span class="pipe-badge" id="hud-pipe-site-tag">第 2/3 站</span>
            </div>
            <div class="pipeline-info-row">
              <span id="hud-pipe-site-text" style="color:#e2e8f0; font-weight:700;">【猎聘网】</span>
              <span id="hud-pipe-counts" style="color:#cbd5e1; font-size:11px;">今日: <b id="hud-pipe-site-today" style="color:#c084fc;">0</b>/<span id="hud-pipe-site-limit">30</span> <span style="color:#94a3b8; font-size:10px;">(本次 <b id="hud-pipe-site-count" style="color:#e9d5ff;">+0</b>/<span id="hud-pipe-site-target">30</span>)</span></span>
            </div>
            <div class="pipeline-bar-wrap">
              <div class="pipeline-bar-fill" id="hud-pipe-bar-fill" style="width: 0%;"></div>
            </div>
            <div class="pipeline-total-row">
              <span id="hud-pipe-step-list" style="font-size:10px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;">BOSS ✓ → 猎聘 🚀 → 拉勾 ⏳</span>
              <span id="hud-pipe-percent-text" style="font-size:11px; font-weight:800; color:#c084fc;">0%</span>
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
                <span style="font-size:10px; color:#c084fc; text-decoration:underline;">✏️改上限</span>
              </div>
              <div class="stat-val" id="val-today-count">0 <span style="font-size:11px; color:#94a3b8;">/ 30</span></div>
            </div>
            <div class="stat-card" id="btn-quick-adjust-city" style="cursor: pointer; transition: border-color 0.2s;" title="点击可修改目标城市 (默认: 深圳)">
              <div class="stat-label" style="display:flex; justify-content:space-between; align-items:center;">
                <span>📍 目标城市</span>
                <span style="font-size:10px; color:#c084fc; text-decoration:underline;">✏️换城市</span>
              </div>
              <div class="stat-val" id="val-target-city" style="font-size: 15px; color: #34d399; margin-top: 3px;">深圳</div>
            </div>
          </div>

          <div class="tag-indicator">
            <span>🎯 当前生效词条: <b id="active-tag-count" style="color:#c084fc;">0</b> 个</span>
            <span class="tag-link" id="btn-open-dashboard">打开完整后台管理 ↗</span>
          </div>

          <!-- 猎聘顶部筛选自适应面板 -->
          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(168, 85, 247, 0.25); border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
              <span>📌 页面筛选: <b id="val-lp-filter-status" style="color: #34d399;">检测中...</b></span>
              <span id="btn-lp-recheck-filter" style="color: #c084fc; text-decoration: underline; cursor: pointer; font-size: 10px;">刷新检测</span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary" id="btn-lp-apply-preset-filter" style="flex: 1; font-size: 11px; padding: 6px 8px; background: rgba(236, 72, 153, 0.18); border: 1px solid rgba(236, 72, 153, 0.45); color: #f472b6; border-radius: 6px; cursor: pointer; font-weight: 700;" title="点击自动在猎聘顶部勾选：深圳 · 10-15万 · 1年以内 · 不限活跃">
                <span>🎯 一键帮我选 (深圳·10-15万·1年)</span>
              </button>
            </div>
            <label style="font-size: 10px; color: #cbd5e1; display: flex; align-items: center; gap: 5px; cursor: pointer;">
              <input type="checkbox" id="chk-lp-filter-match-mode" checked style="accent-color: #a855f7;">
              <span>优先按页面筛选投递 (页面选好时不因词条微差跳过)</span>
            </label>
          </div>

          <div class="action-btns">
            <button class="btn btn-primary" id="btn-toggle-run">
              <span>🚀 开启猎聘定向应聘</span>
            </button>
            <button class="btn btn-pause" id="btn-pause-run" style="display: none;">
              <span>⏸ 暂停</span>
            </button>
          </div>

          <div style="display: flex; gap: 6px; margin-top: 6px;">
            <button class="btn btn-secondary" id="btn-lp-open-quickfill" style="flex:1; font-size:11px; padding:6px 8px; background:rgba(168,85,247,0.15); border:1px solid rgba(168,85,247,0.35); color:#c084fc; border-radius:6px; cursor:pointer;">
              <span>📋 简历速填小抽屉</span>
            </button>
            <button class="btn btn-secondary" id="btn-lp-open-digest" style="flex:1; font-size:11px; padding:6px 8px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.35); color:#fbbf24; border-radius:6px; cursor:pointer;" title="查看每日全网优质求职情报与公众号直招推文">
              <span>📰 今日全网情报</span>
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding: 0 2px;">
            <span style="font-size: 10.5px; color: #94a3b8; font-weight: 600;">📋 实时运行日志 (保留最新80条)</span>
            <span id="btn-clear-lp-log" style="font-size: 10px; color: #c084fc; text-decoration: underline; cursor: pointer;">清空</span>
          </div>
          <div class="log-box" id="hud-log-stream" style="max-height: 120px; overflow-y: auto;">
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
        ⚡ 猎聘巡航 (<span id="pill-count">0</span>/<span id="pill-limit">30</span>)<span id="pill-pipe-stat" style="display:none; margin-left:4px; color:#c084fc;"> | 🌐 0%</span>
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

    // 终止全网流水线巡航
    shadowRoot.getElementById('btn-hud-stop-pipeline')?.addEventListener('click', () => {
      logHUD('<span class="highlight">[终止巡航]</span> 正在终止全网流水线协同调度...');
      chrome.runtime.sendMessage({ type: 'STOP_CRUISE_PIPELINE' }, () => {
        stopLiepinCruise();
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
      const input = prompt(`⚡【快速调节每日投递上限】\n当前每日安全上限为：${currentLimit} 次\n\n请输入新的每日投递上限 (支持 5 ~ 999 次)：`, currentLimit);
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

    // 原地快捷切换目标城市
    shadowRoot.getElementById('btn-quick-adjust-city')?.addEventListener('click', () => {
      const curCity = config.targetCity || '深圳';
      const input = prompt(`📍【切换猎聘巡航目标城市】\n当前猎聘锁定城市为：${curCity}\n\n如需更换，请输入目标城市名称（如：深圳、广州、上海、北京等）：`, curCity);
      if (input !== null && input.trim()) {
        const newCity = input.trim();
        config.targetCity = newCity;
        chrome.storage.local.get(['config'], (res) => {
          const cfg = res.config || {};
          cfg.targetCity = newCity;
          chrome.storage.local.set({ config: cfg }, () => {
            updateHUD();
            logHUD(`<span class="success">[城市已锁定]</span> 猎聘目标城市已切换为 <b>${newCity}</b>，非该城市岗位将自动跳过！`);
          });
        });
      }
    });

    // 查看今日全网求职情报
    shadowRoot.getElementById('btn-lp-open-digest')?.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        type: 'OPEN_PAGE',
        url: chrome.runtime.getURL('dashboard/dashboard.html#daily-digest')
      });
    });

    // 猎聘顶部筛选一键自动配置与刷新检测
    shadowRoot.getElementById('btn-lp-apply-preset-filter')?.addEventListener('click', () => {
      applyLiepinTopFilters();
    });
    shadowRoot.getElementById('btn-lp-recheck-filter')?.addEventListener('click', () => {
      updateHUD();
      const curFilters = getLiepinCurrentFilters();
      logHUD(`<span class="highlight">[筛选状态]</span> 猎聘当前已生效条件：<b>${curFilters.summary}</b>`);
    });
    const chkFilterMatch = shadowRoot.getElementById('chk-lp-filter-match-mode');
    if (chkFilterMatch) {
      chkFilterMatch.checked = config.acceptAllInPageFilter !== false;
      chkFilterMatch.addEventListener('change', () => {
        config.acceptAllInPageFilter = chkFilterMatch.checked;
        logHUD(`<span class="highlight">[匹配策略]</span> 已${config.acceptAllInPageFilter ? '开启' : '关闭'}【优先按页面筛选投递】`);
      });
    }

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

    // 清空日志按钮
    shadowRoot.getElementById('btn-clear-lp-log')?.addEventListener('click', () => {
      const stream = shadowRoot.getElementById('hud-log-stream');
      if (stream) {
        stream.innerHTML = '<div style="color:#64748b;">[系统就绪] 日志已清空，猎聘巡航待命...</div>';
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

    // 控制台镜像输出
    const plainText = html.replace(/<[^>]+>/g, '');
    console.log(`%c[ZIAVER 猎聘] ${timeStr} ${plainText}`, 'color: #c084fc;');

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
    pipelineStatusCache = status;
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
      const siteName = curSite ? curSite.name : '猎聘网';

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
      todayEl.innerHTML = `${todayCount} <span style="font-size:11px; color:#94a3b8;">/ ${limit}</span>`;
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

    const cityEl = shadowRoot.getElementById('val-target-city');
    if (cityEl) cityEl.textContent = config.targetCity || '深圳';

    const curFilters = getLiepinCurrentFilters();
    const filterEl = shadowRoot.getElementById('val-lp-filter-status');
    if (filterEl) {
      filterEl.textContent = curFilters.summary;
      filterEl.style.color = curFilters.hasFilters ? '#34d399' : '#f59e0b';
    }
  }

  // ================= 猎聘登录态智能识别 =================
  function checkIsLoggedIn() {
    // 1. 明确的未登录路由
    if (location.hostname.includes('passport.liepin.com') || location.pathname.startsWith('/login')) {
      return false;
    }

    // 2. 强特征：只要存在候选人已登录元素，坚决判定已登录
    const loggedInIndicators = document.querySelectorAll(
      '.header-avatar-box, .user-name, .user-menu-item .avatar, .nav-user-info, [data-selector="header-avatar"], .nav-user-avatar, .header-user-nav, .user-info, .header-quick-menu .name'
    );
    for (const ind of loggedInIndicators) {
      if (ind && (ind.offsetWidth > 0 || ind.offsetHeight > 0 || ind.getClientRects().length > 0)) {
        return true;
      }
    }

    // 3. 检查是否有真实可见的登录弹窗
    const loginModal = document.querySelector('.login-modal-wrapper, .quick-login-wrap, .ant-modal-content .login-container');
    if (loginModal) {
      const style = window.getComputedStyle(loginModal);
      const rect = loginModal.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 120 && rect.height > 120) {
        return false;
      }
    }

    // 4. 显式未登录按钮
    const candidateLoginBtn = document.querySelector('.header-login-btn, .quick-login-btn');
    if (candidateLoginBtn) {
      const txt = candidateLoginBtn.textContent.trim();
      const style = window.getComputedStyle(candidateLoginBtn);
      if (style.display !== 'none' && (txt === '登录/注册' || txt === '登录' || txt === '注册')) {
        return false;
      }
    }

    return true;
  }

  let isSkipped = false;

  async function startLiepinCruise(target = null, isFromPipeline = false, initialSessionCount = 0, tagIdx = 0) {
    refreshConfig();
    isSkipped = false;
    currentTagIndex = tagIdx || 0;

    // 智能登录态检测
    if (!checkIsLoggedIn()) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD('<span class="highlight" style="color:#f59e0b;">[未登录检测]</span> 未检测到猎聘登录状态，全网流水线自动跳过本站...');
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'liepin',
          reason: '未登录账号'
        });
        return;
      } else {
        alert('⚠️ 检测到您尚未登录猎聘网（或会话已过期）！\n请先在页面右上角完成登录后再开启自动巡航。');
        return;
      }
    }

    if (todayCount >= (config.dailyLimit || 30)) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD(`<span class="highlight" style="color:#f59e0b;">[安全上限已达]</span> 今日已达安全上限 (${todayCount}/${config.dailyLimit || 30} 次)，自动向全网流水线交接...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'liepin',
          reason: `今日投递已满额 (${todayCount}/${config.dailyLimit || 30})`
        });
        return;
      } else {
        alert(`⚠️ 今日已达到设定的安全投递上限 (${config.dailyLimit || 30} 次)！\n当前今日已投递 ${todayCount} 次。为保护账号安全，自动停止投递。可在后台调整上限。`);
        return;
      }
    }

    if (activeTags.length === 0) {
      if (isFromPipeline) {
        isSkipped = true;
        logHUD('<span class="highlight" style="color:#f59e0b;">[无生效词条]</span> 当前未勾选生效职业词条，全网流水线跳过本站...');
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'liepin',
          reason: '未勾选高亮职业词条'
        });
        return;
      } else {
        alert('⚠️ 当前没有高亮选中的生效职业词条！请打开后台管理勾选。');
        return;
      }
    }

    pipelineMode = !!isFromPipeline;
    pipelineTarget = target || (config.dailyLimit || 30);
    sessionCount = initialSessionCount || 0;

    // 智能定向检索与页面筛选保护：
    // 若用户在页面已选好条件（如深圳、10-15万、1年以内等）或 URL 已经带有筛选参数，绝对不强制重定向刷新覆盖用户的筛选！
    const currentUrl = window.location.href;
    const targetTag = activeTags[currentTagIndex] || activeTags[0] || '';
    const curFilters = getLiepinCurrentFilters();
    const hasUserFilters = curFilters.hasFilters || currentUrl.includes('salary=') || currentUrl.includes('workYearCode=');

    if (hasUserFilters) {
      logHUD(`<span class="success">[保留页面筛选]</span> 检测到页面已包含筛选条件（<b>${curFilters.summary}</b>），直接在当前筛选列表进行定向投递！`);
    } else if (targetTag && !currentUrl.includes('key=')) {
      logHUD(`<span class="highlight">[自动配置筛选]</span> 正在为您载入【${targetTag}】并自动配置（深圳 · 10-15万 · 1年以内）精准条件...`);
      if (pipelineMode) {
        try {
          sessionStorage.setItem('ziaver_pipeline_liepin_state', JSON.stringify({
            inPipeline: true,
            target: pipelineTarget,
            sessionCount: sessionCount,
            currentTagIndex: currentTagIndex,
            timestamp: Date.now()
          }));
        } catch (e) {}
      }
      setTimeout(() => {
        window.location.href = `https://www.liepin.com/zhaopin/?city=050090&salary=10$15&workYearCode=1&key=${encodeURIComponent(targetTag)}`;
      }, 1000);
      return;
    }

    isRunning = true;
    isPaused = false;
    const btn = shadowRoot.getElementById('btn-toggle-run');
    const btnPause = shadowRoot.getElementById('btn-pause-run');
    const statusTag = shadowRoot.getElementById('compact-status-tag');
    if (statusTag) { statusTag.textContent = '🚀 巡航中'; statusTag.style.color = '#c084fc'; }
    btn.innerHTML = '<span>🛑 停止巡航</span>';
    btn.className = 'btn btn-stop';
    btnPause.style.display = 'flex';

    logHUD(`<span class="highlight">[启动]</span> ${pipelineMode ? `全网流水线模式 (本站目标: ${pipelineTarget}，当前检索词:【${targetTag}】)！` : `当前检索词:【${targetTag}】`}开始精准扫描卡片...`);
    if (document.hidden) {
      logHUD('<span class="skip" style="color:#fbbf24;">[提示] 建议保持窗口展开（或放至 Win+Tab 虚拟桌面），避免最小化被系统节能休眠限速。</span>');
    }

    try {
      await runLiepinLoop();
    } catch (err) {
      console.error(err);
      logHUD(`<span class="skip">[中断] ${err.message || err}</span>`);
    } finally {
      const wasPipeline = pipelineMode;
      const finalCount = sessionCount;
      try {
        sessionStorage.removeItem('ziaver_pipeline_liepin_state');
      } catch (e) {}
      stopLiepinCruise();
      if (wasPipeline && !isSkipped) {
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
    try {
      sessionStorage.removeItem('ziaver_pipeline_liepin_state');
    } catch (e) {}
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
        if (!checkIsLoggedIn()) {
          isSkipped = true;
          logHUD('<span class="highlight" style="color:#f59e0b;">[未登录检测]</span> 猎聘页面为未登录状态，全网流水线自动跳过本站...');
          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_SKIPPED',
              site: 'liepin',
              reason: '未登录账号'
            });
          }
          break;
        }
        logHUD('<span class="skip">未找到职位卡片，请确保在猎聘职位列表页。</span>');
        break;
      }

      let pageMatchedCount = 0;

      for (let i = 0; i < cards.length; i++) {
        if (!isRunning) break;
        while (isPaused) {
          await sleep(1000);
          if (!isRunning) break;
        }
        if (!isRunning) break;

        if (todayCount >= (config.dailyLimit || 30)) break;
        if (pipelineMode && sessionCount >= pipelineTarget) break;

        if (!checkIsLoggedIn()) {
          isSkipped = true;
          logHUD('<span class="highlight" style="color:#ef4444;">[登录态失效]</span> 检测到登录弹窗，已安全跳过本站...');
          if (pipelineMode) {
            chrome.runtime.sendMessage({
              type: 'PIPELINE_SITE_SKIPPED',
              site: 'liepin',
              reason: '弹出登录弹窗'
            });
          }
          break;
        }

        const card = cards[i];
        if (card.dataset.ziaverHandled === 'true') continue;
        card.dataset.ziaverHandled = 'true';

        const titleEl = card.querySelector('.job-title, .title-text, .ellipsis-1');
        const salaryEl = card.querySelector('.job-salary, .salary');
        const companyEl = card.querySelector('.company-name, .company-info-title');

        const title = titleEl ? titleEl.textContent.trim() : '';
        const salary = salaryEl ? salaryEl.textContent.trim() : '';
        const company = companyEl ? companyEl.textContent.trim() : '';

        const screenResult = screenJob(title, salary, company, card);
        if (!screenResult.pass) {
          logHUD(`<span class="skip">${screenResult.reason}</span>`);
          continue;
        }

        pageMatchedCount++;
        const matchedTag = screenResult.matchedTag;

        // 寻找猎聘“聊一聊”或“立即沟通”或“应聘”按钮
        const btnInfo = findLiepinChatButton(card);
        if (btnInfo.isHandled) {
          logHUD(`<span class="skip">[已沟通跳过] ${company} · ${title} (${btnInfo.reason})</span>`);
          continue;
        }

        const applyBtn = btnInfo.button;
        if (!applyBtn) {
          logHUD(`<span class="skip">[未找到按钮] ${company} · ${title} (未找到可用的聊一聊/应聘按钮)</span>`);
          continue;
        }

        const isCampus = !!screenResult.isCampus2024;
        const noteText = generateDynamicNote(title, matchedTag, company, isCampus);

        if (isCampus) {
          logHUD(`<span class="success">[🎓24届校招宝藏命中]</span> ${company} · ${title} (${salary}) <span style="font-size:10px; color:#c084fc;">[符合2024年9月毕业资质]</span>`);
        } else {
          logHUD(`<span class="highlight">[命中岗位: ${matchedTag}${screenResult.matchType ? ` · ${screenResult.matchType}` : ''}]</span> ${company} · ${title} (${salary})`);
        }
        
        try {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid #c084fc';
        } catch (e) {}
        await sleep(Math.floor(Math.random() * 500) + 600);

        // 严格校验猎聘应聘与真实送达回执
        const applyResult = await executeAndVerifyLiepinApply(card, applyBtn, noteText);
        try {
          card.style.outline = applyResult.success ? '2px solid #34d399' : 'none';
        } catch (e) {}

          if (applyResult.success) {
            sessionCount++;
            todayCount++;
            updateHUD();

            // 持久化今日统计 (猎聘独立计数)
            if (chrome.storage && chrome.storage.local) {
              const today = getLocalDateStr();
              const siteCounts = config.siteTodayCounts || { boss: 0, liepin: 0, lagou: 0, ats: 0 };
              siteCounts.liepin = todayCount;
              const totalCount = Object.values(siteCounts).reduce((a, b) => a + (Number(b) || 0), 0);
              chrome.storage.local.set({
                config: { ...config, todayCount: totalCount, siteTodayCounts: siteCounts, lastActiveDate: today }
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
                count: sessionCount,
                todayCount: todayCount
              });
            }

            logHUD(`<span class="success">[真实应聘确认]</span> ${company} · ${title} 应聘成功并记录入库！`);

            const delay = Math.floor(Math.random() * 5000) + 7000;
            logHUD(`<span class="skip">安全冷却中... 等待 ${(delay / 1000).toFixed(1)} 秒</span>`);
            await sleep(delay);
          } else if (applyResult.reason === 'limit_reached') {
            logHUD(`<span class="highlight" style="color:#ef4444; font-weight:bold;">🛑【平台上限熔断】猎聘网已达今日应聘上限！自动停止巡航。</span>`);
            if (pipelineMode) {
              logHUD('<span class="highlight" style="color:#f59e0b;">[流水线转场] 猎聘已满额，自动向全网巡航下一站交接...</span>');
              chrome.runtime.sendMessage({
                type: 'PIPELINE_SITE_FINISHED',
                site: 'liepin',
                count: sessionCount
              });
            }
            break;
          } else if (applyResult.reason === 'captcha_triggered') {
            logHUD(`<span class="highlight" style="color:#f59e0b; font-weight:bold;">⚠️【人机验证拦截】请手动完成验证后点击【继续】！</span>`);
          } else if (applyResult.reason === 'audit_issue') {
            logHUD(`<span class="highlight" style="color:#f59e0b; font-weight:bold;">⚠️【猎聘审核/资质拦截】${applyResult.message}，已自动跳过该岗位</span>`);
            await sleep(800);
          } else {
            logHUD(`<span class="skip" style="color:#94a3b8;">[送达未确认] ${company} · ${title} (${applyResult.message || '未响应'})，已跳过 (不计入投递数)</span>`);
            await sleep(600);
          }
        }

      // 强拦截：卡片遍历结束后，若今日上限已达或流水线本站目标已达成，立刻终止循环，坚决禁止执行翻页！
      if (!isRunning) break;
      if (todayCount >= (config.dailyLimit || 30)) {
        logHUD(`<span class="highlight">[安全上限熔断]</span> 今日已达安全上限 ${config.dailyLimit || 30} 次，停止投递！`);
        break;
      }
      if (pipelineMode && sessionCount >= pipelineTarget) {
        logHUD(`<span class="success">[本站目标达成]</span> 已完成猎聘设定目标 (${sessionCount}/${pipelineTarget})，停止翻页并向中枢交接！`);
        break;
      }

      const nextPage = document.querySelector('.ant-pagination-next:not(.ant-pagination-disabled) button, a.pagination-next');

      // 智能换词判定：如果当前页没有产生任何命中，且无下一页(或已翻完)，自动轮转下一个高亮词条继续巡航
      if (!nextPage || pageMatchedCount === 0) {
        if (currentTagIndex + 1 < activeTags.length && (!pipelineMode || sessionCount < pipelineTarget)) {
          const nextTag = activeTags[currentTagIndex + 1];
          logHUD(`<span class="highlight">[智能换词轮转]</span> 词条【${activeTags[currentTagIndex]}】暂无可投岗位，自动换词切换至【${nextTag}】继续搜寻...`);
          if (pipelineMode) {
            try {
              sessionStorage.setItem('ziaver_pipeline_liepin_state', JSON.stringify({
                inPipeline: true,
                target: pipelineTarget,
                sessionCount: sessionCount,
                currentTagIndex: currentTagIndex + 1,
                timestamp: Date.now()
              }));
            } catch (e) {}
          }
          await sleep(2000);
          const nextUrlObj = new URL(window.location.href);
          nextUrlObj.searchParams.set('key', nextTag);
          if (!nextUrlObj.searchParams.get('city')) nextUrlObj.searchParams.set('city', '050090');
          if (!nextUrlObj.searchParams.get('salary')) nextUrlObj.searchParams.set('salary', '10$15');
          if (!nextUrlObj.searchParams.get('workYearCode')) nextUrlObj.searchParams.set('workYearCode', '1');
          window.location.href = nextUrlObj.toString();
          return;
        }
      }

      if (nextPage) {
        if (pipelineMode) {
          try {
            sessionStorage.setItem('ziaver_pipeline_liepin_state', JSON.stringify({
              inPipeline: true,
              target: pipelineTarget,
              sessionCount: sessionCount,
              currentTagIndex: currentTagIndex,
              timestamp: Date.now()
            }));
          } catch (e) {}
        }
        nextPage.click();
        await sleep(3500);
      }
    }
  }

  // ================= 严格送达校验与风控熔断引擎 (猎聘) =================
  async function executeAndVerifyLiepinApply(card, applyBtn, noteText) {
    function triggerSafeClick(el) {
      if (!el) return;
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {}

      // 关键防跳盾：杜绝 <a> 标签原生导航跳转至 /im/ 或新标签页破坏巡航
      const linkEl = el.tagName === 'A' ? el : el.closest('a');
      if (linkEl) {
        linkEl.removeAttribute('target');
        linkEl.setAttribute('data-original-href', linkEl.getAttribute('href') || '');
        linkEl.setAttribute('href', 'javascript:void(0);');
      }
      const preventJump = (e) => {
        if (linkEl) e.preventDefault();
      };
      el.addEventListener('click', preventJump, { capture: true, once: true });

      ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(evtName => {
        try {
          el.dispatchEvent(new MouseEvent(evtName, { bubbles: true, cancelable: true, view: window }));
        } catch (e) {}
      });
      if (typeof el.click === 'function') {
        try { el.click(); } catch (e) {}
      }
    }

    function checkLiepinCaptcha() {
      const captcha = document.querySelector('.nc_wrapper, .geetest_holder, [class*="captcha"], [class*="verify-box"]');
      if (captcha && (captcha.offsetWidth > 0 || captcha.offsetHeight > 0)) return true;
      const bodyText = (document.body.innerText || '').slice(0, 3000);
      return bodyText.includes('请完成安全验证') || bodyText.includes('完成拼图') || bodyText.includes('滑动验证');
    }

    function checkLiepinLimitDialog() {
      const modals = document.querySelectorAll('.ant-modal-content, .react-modal, .dialog-box');
      for (const m of modals) {
        if (m.offsetWidth > 0 && m.offsetHeight > 0) {
          const txt = m.textContent.trim();
          if (
            txt.includes('今日投递次数已达上限') ||
            txt.includes('投递次数已达上限') ||
            txt.includes('投递过于频繁') ||
            txt.includes('操作过于频繁') ||
            txt.includes('已达今日上限') ||
            txt.includes('投递已满')
          ) {
            const btn = m.querySelector('button, .ant-btn');
            if (btn) btn.click();
            return true;
          }
        }
      }
      const toasts = document.querySelectorAll('.ant-message-notice, .message-wrap, .toast');
      for (const t of toasts) {
        const txt = t.textContent.trim();
        if (txt.includes('上限') || txt.includes('过于频繁') || txt.includes('明天再试')) {
          return true;
        }
      }
      return false;
    }

    function checkLiepinAuditOrProfileIssue() {
      const modals = document.querySelectorAll('.ant-modal-content, .react-modal, .dialog-box, .ant-message, [class*="modal"]');
      for (const m of modals) {
        if (m.offsetWidth > 0 && m.offsetHeight > 0) {
          const txt = m.textContent.trim();
          if (txt.includes('审核中') || txt.includes('审核未通过') || txt.includes('未通过审核') || txt.includes('审核提示')) {
            return { issue: true, reason: '简历正在审核中或未通过，暂不可投递' };
          }
          if (txt.includes('完善简历') || txt.includes('简历完整度') || txt.includes('请先创建简历') || txt.includes('请完善在线简历') || txt.includes('暂无简历')) {
            return { issue: true, reason: '猎聘在线简历未完善，请先完善在线简历' };
          }
          if (txt.includes('实名认证') || txt.includes('人脸识别') || txt.includes('账号受限') || txt.includes('风控检测') || txt.includes('账号异常')) {
            return { issue: true, reason: '账号触发猎聘安全审核或需要实名认证' };
          }
        }
      }
      return null;
    }

    async function handleLiepinModal() {
      // 1. 自动选中默认简历单选框 (若未选中)
      const uncheckedRadio = document.querySelector('.ant-modal-content input[type="radio"]:not(:checked), .react-modal input[type="radio"]:not(:checked)');
      if (uncheckedRadio) triggerSafeClick(uncheckedRadio);
      const uncheckedRadioLabel = document.querySelector('.ant-modal-content .ant-radio-wrapper:not(.ant-radio-wrapper-checked), .react-modal .radio-item:not(.active)');
      if (uncheckedRadioLabel) triggerSafeClick(uncheckedRadioLabel);

      // 2. 自动勾选协议复选框 (若存在)
      const agreeCheckbox = document.querySelector('.ant-modal-content input[type="checkbox"]:not(:checked), .react-modal input[type="checkbox"]:not(:checked)');
      if (agreeCheckbox) triggerSafeClick(agreeCheckbox);
      const agreeCheckboxLabel = document.querySelector('.ant-modal-content .ant-checkbox-wrapper:not(.ant-checkbox-wrapper-checked)');
      if (agreeCheckboxLabel) triggerSafeClick(agreeCheckboxLabel);

      // 3. 填写自荐信/打招呼附言
      const textarea = document.querySelector('.ant-modal-content textarea, .react-modal textarea, [class*="modal"] textarea');
      if (textarea && textarea.offsetParent !== null) {
        textarea.focus();
        textarea.value = noteText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(350);
      }

      // 4. 点击确认提交按钮
      const confirmBtns = document.querySelectorAll(
        '.ant-modal-content button, .react-modal button, [class*="modal"] button, .dialog-box button'
      );
      for (const btn of confirmBtns) {
        const txt = btn.textContent.trim();
        if (
          txt === '确定' || txt === '确认' || txt === '发送' || txt === '提交' ||
          txt === '聊一聊' || txt === '立即沟通' || txt === '确认应聘' || txt === '立即投递' ||
          btn.classList.contains('ant-btn-primary')
        ) {
          triggerSafeClick(btn);
          await sleep(600);
          break;
        }
      }

      // 5. 检查是否展开了聊天侧栏/抽屉输入框 (补充发送个性化自荐信)
      const imInput = document.querySelector('.im-chat [contenteditable="true"], .chat-conversation [contenteditable="true"], .chat-editor textarea, textarea.im-editor-input, [class*="chat"] textarea');
      if (imInput && (imInput.offsetWidth > 0 || imInput.offsetHeight > 0)) {
        imInput.focus();
        if (imInput.isContentEditable || imInput.getAttribute('contenteditable') === 'true') {
          imInput.innerText = noteText;
        } else {
          imInput.value = noteText;
        }
        imInput.dispatchEvent(new Event('input', { bubbles: true }));
        imInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(350);
        const sendBtn = document.querySelector('.im-chat .btn-send, .chat-conversation .btn-send, button.im-send-btn, button[class*="send"]');
        if (sendBtn) {
          triggerSafeClick(sendBtn);
          await sleep(500);
        } else {
          imInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
          await sleep(500);
        }
      }
    }

    function checkIsLiepinSuccess() {
      const curTxt = applyBtn ? applyBtn.textContent.trim() : '';
      const successWords = ['已应聘', '已沟通', '应聘成功', '继续沟通', '已投递', '已打招呼', '聊过'];
      if (successWords.some(w => curTxt.includes(w))) return true;

      const cardBtns = card.querySelectorAll('button, a, span');
      for (const b of cardBtns) {
        const t = b.textContent.trim();
        if (successWords.some(w => t.includes(w))) return true;
      }

      const toasts = document.querySelectorAll('.ant-message-success, .ant-message-notice-success, .toast-success, .ant-message-notice, .toast');
      for (const t of toasts) {
        const txt = t.textContent.trim();
        if (
          txt.includes('应聘成功') || txt.includes('投递成功') || txt.includes('打招呼成功') ||
          txt.includes('沟通成功') || txt.includes('发起成功') || txt.includes('成功') ||
          txt.includes('已发起') || txt.includes('已发送')
        ) {
          return true;
        }
      }

      // 检查是否调用了 window.open 打开聊天窗
      if (lastLiepinChatOpenedTime && Date.now() - lastLiepinChatOpenedTime < 5000) {
        return true;
      }

      // 检查是否打开了 IM 侧边栏/聊天面板
      const imContainer = document.querySelector('.im-chat, .chat-conversation, .chat-box, .chat-editor, .im-editor');
      if (imContainer && (imContainer.offsetWidth > 0 || imContainer.offsetHeight > 0)) {
        return true;
      }

      return false;
    }

    function dismissStuckModal() {
      const closeBtn = document.querySelector('.ant-modal-close, .react-modal-close, .close-btn, [class*="modal-close"]');
      if (closeBtn && closeBtn.offsetWidth > 0) closeBtn.click();
    }

    if (checkLiepinCaptcha()) {
      isPaused = true;
      return { success: false, reason: 'captcha_triggered', message: '触发平台人机验证' };
    }

    const preAudit = checkLiepinAuditOrProfileIssue();
    if (preAudit) {
      return { success: false, reason: 'audit_issue', message: preAudit.reason };
    }

    // 执行真实点击序列
    triggerSafeClick(applyBtn);
    await sleep(800);

    if (checkLiepinLimitDialog()) {
      return { success: false, reason: 'limit_reached', message: '猎聘今日投递次数已达上限' };
    }

    const postClickAudit = checkLiepinAuditOrProfileIssue();
    if (postClickAudit) {
      dismissStuckModal();
      return { success: false, reason: 'audit_issue', message: postClickAudit.reason };
    }

    await handleLiepinModal();

    const start = Date.now();
    let isSuccess = false;
    while (Date.now() - start < 3000) {
      if (checkLiepinLimitDialog()) {
        return { success: false, reason: 'limit_reached', message: '猎聘今日投递次数已达上限' };
      }
      const loopAudit = checkLiepinAuditOrProfileIssue();
      if (loopAudit) {
        dismissStuckModal();
        return { success: false, reason: 'audit_issue', message: loopAudit.reason };
      }
      if (checkIsLiepinSuccess()) {
        isSuccess = true;
        break;
      }
      await sleep(300);
    }

    if (isSuccess) {
      return { success: true };
    } else {
      dismissStuckModal();
      return { success: false, reason: 'unverified', message: '未检测到成功回执' };
    }
  }

  function checkAndResumePipeline() {
    try {
      const raw = sessionStorage.getItem('ziaver_pipeline_liepin_state');
      chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        renderPipelineHUD(res);

        if (!raw) return;
        const state = JSON.parse(raw);
        if (!state || !state.inPipeline) return;
        if (Date.now() - state.timestamp > 300000) {
          sessionStorage.removeItem('ziaver_pipeline_liepin_state');
          return;
        }

        const currentSite = res.sites && res.sites[res.currentIndex];
        if (res.isActive && currentSite && currentSite.id === 'liepin') {
          const tagIdx = state.currentTagIndex || 0;
          currentTagIndex = tagIdx;
          const searchKeyword = activeTags[tagIdx] || '运营';
          logHUD(`<span class="highlight">[跨页续航]</span> 正在恢复全网流水线 (进度: ${state.sessionCount || 0}/${state.target}，当前检索词:【${searchKeyword}】)...`);
          setTimeout(() => {
            startLiepinCruise(state.target, true, state.sessionCount || 0, tagIdx);
          }, 1500);
        } else {
          sessionStorage.removeItem('ziaver_pipeline_liepin_state');
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
      if (request.activeTags && Array.isArray(request.activeTags) && request.activeTags.length > 0) {
        activeTags = request.activeTags;
      }
      currentTagIndex = request.currentTagIndex || 0;
      console.log('[ZIAVER Autopilot] 猎聘网收到全网流水线启动指令，目标:', target, '词条索引:', currentTagIndex);
      refreshConfig(() => {
        startLiepinCruise(target, true, 0, currentTagIndex);
      });
      sendResponse({ status: 'started', platform: '猎聘网' });
      return true;
    } else if (request.type === 'STOP_CRUISE_PIPELINE') {
      stopLiepinCruise();
      renderPipelineHUD({ isActive: false });
      sendResponse({ status: 'stopped' });
      return true;
    } else if (request.type === 'PIPELINE_BROADCAST_STATUS') {
      renderPipelineHUD(request.status);
      sendResponse({ status: 'ok' });
      return true;
    } else if (request.type === 'DATE_CHANGED') {
      console.log('[ZIAVER Autopilot] 猎聘网收到跨日广播，新日期:', request.today);
      refreshConfig();
      sendResponse({ status: 'ok' });
      return true;
    } else if (request.type === 'PING') {
      sendResponse({ status: 'pong', platform: '猎聘网' });
      return true;
    }
  });

  // ================= 实时跨日状态感应探针 (防止开着标签页过夜不刷新的情况) =================
  setInterval(() => {
    const today = getLocalDateStr();
    if (config.lastActiveDate && config.lastActiveDate !== today) {
      console.log('[ZIAVER Autopilot] 猎聘网页面探针感应到跨日变更，自动刷新配置与今日计数');
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

  // ================= HR 智能快捷回复应答助手 (猎聘网) =================
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
      background: rgba(15, 12, 28, 0.95);
      border: 1px solid #c084fc;
      color: #e2e8f0;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 16px rgba(168,85,247,0.25);
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
      '.im-editor [contenteditable="true"]',
      '.chat-message-input',
      'textarea.chat-input',
      '.im-editor textarea',
      '.chat-editor textarea',
      'textarea',
      'input[type="text"]'
    ];
    let targetInput = null;
    for (const sel of inputSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.closest('#ziaver-liepin-hud') || el.closest('#ziaver-quick-reply-bar')) continue;
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
      const editorContainers = document.querySelectorAll('.im-editor, .im-input, .chat-box, .chat-editor, .chat-conversation, .chat-input, .message-controls, .im-chat, .chat-op, .im-send-box, .chat-send-box');
      if (!editorContainers || editorContainers.length === 0) return;

      if (document.getElementById('ziaver-quick-reply-bar')) return;

      const bar = document.createElement('div');
      bar.id = 'ziaver-quick-reply-bar';
      bar.style.cssText = `
        position: relative;
        z-index: 9999;
        margin: 6px 0;
        padding: 7px 12px;
        background: rgba(15, 12, 28, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(168, 85, 247, 0.45);
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      `;

      const allReplies = [...DEFAULT_QUICK_REPLIES, ...customReplies];

      bar.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: #c084fc;">⚡ HR 智能快捷回复助手</span>
            <span style="font-size: 10px; color: #94a3b8;">(点击一键填入输入框)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="btn-add-quick-reply" style="background: rgba(168, 85, 247, 0.15); border: 1px dashed rgba(168, 85, 247, 0.4); color: #c084fc; font-size: 10.5px; padding: 2px 7px; border-radius: 4px; cursor: pointer;">+ 自定义话术</button>
            <button id="btn-toggle-qr-collapse" style="background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 0 4px;" title="收起/展开">—</button>
          </div>
        </div>
        <div id="qr-chips-container" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 3px; scrollbar-width: thin;">
          ${allReplies.map(r => `
            <div class="qr-chip" data-id="${r.id}" title="${r.title}：\n${r.text}" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(168, 85, 247, 0.3); border-radius: 14px; padding: 3px 9px; cursor: pointer; white-space: nowrap; font-size: 11px; color: #e2e8f0; transition: all 0.15s ease;">
              <span class="qr-chip-text">${r.tag || r.title}</span>
              <span class="qr-copy-btn" data-text="${encodeURIComponent(r.text)}" title="仅复制到剪贴板" style="color: #94a3b8; font-size: 10px; margin-left: 2px; padding: 0 2px;">📋</span>
              ${r.id.startsWith('custom_') ? `<span class="qr-del-btn" data-id="${r.id}" title="删除此自定义话术" style="color: #ef4444; font-size: 10px; margin-left: 2px;">×</span>` : ''}
            </div>
          `).join('')}
        </div>
      `;

      const targetContainer = document.querySelector('.im-editor, .im-input, .chat-box, .chat-editor, .chat-conversation, .chat-input, .message-controls, .im-chat, .chat-op, .im-send-box, .chat-send-box');
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
          chip.style.background = 'rgba(168, 85, 247, 0.2)';
          chip.style.borderColor = '#c084fc';
        });
        chip.addEventListener('mouseleave', () => {
          chip.style.background = 'rgba(255, 255, 255, 0.06)';
          chip.style.borderColor = 'rgba(168, 85, 247, 0.3)';
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

  if (location.hostname.includes('liepin.com')) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        refreshConfig(() => {
          createHUD();
          startHRReplyWatcher();
          checkAndResumePipeline();
          initChatQuickReplies();
        });
      });
    } else {
      refreshConfig(() => {
        createHUD();
        startHRReplyWatcher();
        checkAndResumePipeline();
        initChatQuickReplies();
      });
    }
  }
})();
