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
  let currentTagIndex = 0;
  let pipelineStatusCache = null;

  // 捕获并抑制立即沟通弹出的聊天新标签页/新窗口，彻底防止页面跳入聊天页卡死
  let lastLagouChatOpenedTime = 0;
  const rawWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (isRunning && url && (String(url).includes('/chat') || String(url).includes('/im') || String(url).includes('lagou.com/im'))) {
      console.log('[ZIAVER 拉勾] 成功捕获并抑制立即沟通弹出的聊天新标签页:', url);
      lastLagouChatOpenedTime = Date.now();
      return null;
    }
    return rawWindowOpen.apply(this, arguments);
  };

  let config = {
    dailyLimit: 30,
    minDelaySec: 9,
    maxDelaySec: 15,
    minSalaryK: 9,
    targetCity: '深圳',
    strictCityFilter: true,
    gradYear: '2024',
    enableCampus2024Protection: true,
    blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,培训生,保险',
    enableDynamicGreeting: true,
    useCustomGreeting: true,
    customGreetingTemplate: '您好！看到咱们在招「{jobTitle}」，感觉整体要求跟我还蛮匹配的。我有相关业务实战经验，执行力强、看重数据和实际业务落地。简历在附件中，如果合适随时沟通交流，祝您工作顺利、天天开心～'
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
        config = { ...config, ...res.config };
        if (config.lastActiveDate === today) {
          const counts = config.siteTodayCounts || {};
          todayCount = counts.lagou !== undefined ? counts.lagou : 0;
        } else {
          // 跨日检测：自动清零并写回 storage
          console.log(`[ZIAVER Autopilot] 拉勾招聘检测到跨日: 上次活跃「${config.lastActiveDate || '无'}」-> 今日「${today}」，执行清零`);
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

  // ================= 严格地理位置核验引擎 (拉勾网 - 杜绝上海/异地侵入) =================
  function verifyLagouJobLocation(card, title = '', company = '') {
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

    // 1. 优先提取 DOM 明确地点 (拉勾卡片通常在 .p-bom 或 .item-bom 中的 span 标有 "深圳 · 南山区")
    const locSelectors = [
      '[class*="city"]', '[class*="area"]', '.item-bom__1bT73 span', '.p-bom__JlNur span',
      '[class*="desc__"]', '[class*="company-address"]', '.position-name span'
    ];
    let jobArea = '';
    for (const sel of locSelectors) {
      const els = card ? card.querySelectorAll(sel) : [];
      for (const el of els) {
        const txt = el.textContent.trim();
        if (txt.includes('·') || txt.includes('市') || txt.includes('区') || OTHER_CITIES.some(c => txt.includes(c)) || txt.includes(targetCity)) {
          jobArea = txt;
          break;
        }
      }
      if (jobArea) break;
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

  // ================= 2024届校招与优质应届宝藏识别引擎 (拉勾网) =================
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

  // ================= 动态自荐话术拼装 =================
  function synthesizeGreeting(title, matchedTag, company, isCampus2024 = false) {
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

    // 0. 目标城市强过滤（严格杜绝上海等异地侵入，默认锁定深圳）
    const locResult = verifyLagouJobLocation(card, title, company);
    if (!locResult.pass) {
      return locResult;
    }

    // 提取卡片业务标签与属性
    let cardLabels = '';
    if (card) {
      const labelEls = card.querySelectorAll('[class*="tag-item"], [class*="label"], [class*="word__"], .item-bom__1bT73 span, .job-tags span');
      cardLabels = Array.from(labelEls).map(el => el.textContent.trim()).filter(Boolean).join(' ');
    }

    const fullCardText = `${title} ${cardLabels} ${desc}`.toLowerCase();

    // 1. 2024届校招/补录与优质应届通道识别
    const rawCardText = card ? (card.innerText || card.textContent || '') : '';
    const campusCheck = detect2024CampusOpportunity(title, company, cardLabels, desc, `${fullCardText} ${rawCardText}`);

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
      // B. 卡片业务标签命中完整词条
      if (cardLabels.toLowerCase().includes(lowerTag)) {
        matchedTag = tag;
        matchType = '业务标签命中';
        break;
      }
      // C. 柔性赛道意图匹配
      if (lowerTag === '达人运营' || lowerTag === '达播bd' || lowerTag === '达人拓展') {
        if (fullCardText.includes('达人') && (fullCardText.includes('运营') || fullCardText.includes('bd') || fullCardText.includes('商务') || fullCardText.includes('合作') || fullCardText.includes('媒介'))) {
          matchedTag = tag;
          matchType = '达人赛道柔性命中';
          break;
        }
      } else if (lowerTag === '千川投放' || lowerTag === '巨量千川') {
        if (fullCardText.includes('千川') || (fullCardText.includes('信息流') && fullCardText.includes('投放'))) {
          matchedTag = tag;
          matchType = '千川投放柔性命中';
          break;
        }
      } else if (lowerTag === '电商运营' || lowerTag === '店铺运营') {
        if ((fullCardText.includes('电商') || fullCardText.includes('店铺') || fullCardText.includes('天猫') || fullCardText.includes('抖音') || fullCardText.includes('淘系')) && (fullCardText.includes('运营') || fullCardText.includes('店长') || fullCardText.includes('操盘') || fullCardText.includes('专员'))) {
          matchedTag = tag;
          matchType = '电商赛道柔性命中';
          break;
        }
      } else if (lowerTag === '直播运营' || lowerTag === '直播间运营') {
        if (fullCardText.includes('直播') && (fullCardText.includes('运营') || fullCardText.includes('场控') || fullCardText.includes('中控') || fullCardText.includes('排品'))) {
          matchedTag = tag;
          matchType = '直播赛道柔性命中';
          break;
        }
      } else if (lowerTag === '短视频运营' || lowerTag === '短视频编导') {
        if (fullCardText.includes('短视频') && (fullCardText.includes('运营') || fullCardText.includes('编导') || fullCardText.includes('剪辑'))) {
          matchedTag = tag;
          matchType = '短视频赛道柔性命中';
          break;
        }
      } else if (lowerTag === '游戏运营' || lowerTag === '游戏社区' || lowerTag === '玩家运营') {
        if (fullCardText.includes('游戏') && (fullCardText.includes('运营') || fullCardText.includes('社区') || fullCardText.includes('发行') || fullCardText.includes('生态'))) {
          matchedTag = tag;
          matchType = '游戏赛道柔性命中';
          break;
        }
      }
    }

    // 若未命中常规词条，但该岗位属于 2024届校招/应届宝藏，赋予专属标签放行
    if (!matchedTag && campusCheck.isCampus2024) {
      matchedTag = campusCheck.tag;
      matchType = '🎓24届校招宝藏专场命中';
    }

    if (!matchedTag) {
      return { pass: false, reason: `[未选中词条] 「${title}」未命中高亮勾选的 ${activeTags.length} 个职业词条` };
    }

    // 3. 黑名单过滤 (2024届校招对管培生/助理等免疫误伤)
    const fullText = (title + ' ' + company + ' ' + desc + ' ' + cardLabels + ' ' + rawCardText).toLowerCase();
    const blacklist = (config.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);
    for (const word of blacklist) {
      const lowerWord = word.toLowerCase().trim();
      if (!lowerWord) continue;
      // 🎓 2024届校招保护特权：对管培生、培训生、运营助理免疫误杀
      if (campusCheck.isCampus2024 && (lowerWord === '培训生' || lowerWord === '管培生' || lowerWord === '助理' || lowerWord === '实习')) {
        continue;
      }
      if (fullText.includes(lowerWord)) {
        return { pass: false, reason: `[触发黑名单] 命中词: "${word}" (${company})` };
      }
    }

    // 4. 经验年限过长过滤 (校招应届岗位自动豁免)
    if (!campusCheck.isCampus2024 && /5-10年|10年以上|8-10年|8年以上|5年以上/i.test(desc)) {
      return { pass: false, reason: `[经验要求过高跳过] ${desc}` };
    }

    // 5. 薪资门槛过滤 (2024届校招岗位免低薪拦截)
    const match = salary.match(/(\d+)(?:-(\d+))?K/i);
    if (match) {
      const maxK = match[2] ? parseInt(match[2], 10) : parseInt(match[1], 10);
      if (maxK < config.minSalaryK) {
        if (!campusCheck.isCampus2024) {
          return { pass: false, reason: `[低薪跳过] ${salary} 未达门槛 ${config.minSalaryK}K` };
        }
      }
    }

    return {
      pass: true,
      data: { title, salary, company, desc, matchedTag, isCampus2024: campusCheck.isCampus2024, jobArea: locResult.jobArea }
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

  // ================= Web Audio 提示音与音频上下文预解锁 (拉勾网) =================
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

      playTone(523.25, 0, 0.20);
      playTone(783.99, 0.22, 0.38);
    } catch (e) {
      console.warn('[Lagou Audio Alert Warning]', e);
    }
  }

  // ================= 浏览器标签页交替闪烁 =================
  let titleFlashInterval = null;
  let originalDocTitle = document.title;
  let isSelfFlashingTitle = false;

  function startTitleFlashing(alertTitle = '【🔔 拉勾HR来新消息了!】') {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    if (!originalDocTitle || originalDocTitle.includes('新消息') || originalDocTitle.includes('HR') || originalDocTitle.includes('🔔')) {
      originalDocTitle = '拉勾网';
    }
    let flag = true;
    let count = 0;
    isSelfFlashingTitle = true;
    titleFlashInterval = setInterval(() => {
      document.title = flag ? alertTitle : originalDocTitle;
      flag = !flag;
      count++;
      if (count > 16) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalDocTitle;
        setTimeout(() => { isSelfFlashingTitle = false; }, 1000);
      }
    }, 800);

    const onFocus = () => {
      if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
        document.title = originalDocTitle;
        setTimeout(() => { isSelfFlashingTitle = false; }, 1000);
      }
      window.removeEventListener('focus', onFocus);
    };
    window.addEventListener('focus', onFocus);
  }

  // ================= 拉勾网专属高可见度 Toast 弹窗 =================
  function showLagouHRReplyToast(info = {}) {
    let toast = document.getElementById('ziaver-lagou-hr-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ziaver-lagou-hr-toast';
      toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 2147483647;
        background: linear-gradient(135deg, #0f172a 0%, #064e3b 100%);
        border: 1.5px solid #10b981;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.75), 0 0 30px rgba(16, 185, 129, 0.35);
        border-radius: 12px;
        padding: 12px 16px;
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 300px;
        max-width: 420px;
        animation: ziaverLagouSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        cursor: pointer;
        user-select: none;
      `;
      const styleTag = document.createElement('style');
      styleTag.textContent = `
        @keyframes ziaverLagouSlideIn {
          from { transform: translateX(110%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes ziaverLagouPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(16,185,129,0.6)); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 16px rgba(16,185,129,0.95)); }
        }
      `;
      document.head.appendChild(styleTag);
      document.body.appendChild(toast);
    }

    const unreadCount = info.count || 1;
    const title = info.title || '拉勾网 · HR 新回复';
    const desc = info.desc || `检测到拉勾企业 HR 正在与您互动沟通，请及时跟进！`;
    const chatUrl = info.chatUrl || 'https://easy.lagou.com/im/chat.htm';

    toast.innerHTML = `
      <div style="font-size: 24px; line-height: 1; animation: ziaverLagouPulse 2s infinite ease-in-out;">🔔</div>
      <div style="flex: 1; overflow: hidden;">
        <div style="font-size: 13px; font-weight: 700; color: #34d399; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
          <span style="font-size: 10.5px; background: rgba(16,185,129,0.25); color:#a7f3d0; padding: 2px 6px; border-radius: 10px; font-weight:600; white-space: nowrap;">${unreadCount} 条未读</span>
        </div>
        <div style="font-size: 11.5px; color: #e2e8f0; margin-top: 3px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${desc}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button id="ziaver-lagou-toast-btn" style="
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          border: none;
          border-radius: 6px;
          color: #fff;
          font-weight: 700;
          font-size: 11px;
          padding: 5px 10px;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
        ">查看 ↗</button>
        <button id="ziaver-lagou-close-btn" style="
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 6px;
          color: #94a3b8;
          font-size: 12px;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        " title="关闭通知">✕</button>
      </div>
    `;

    const closeToast = () => {
      if (toast && toast.parentNode) {
        toast.style.transition = 'opacity 0.3s, transform 0.3s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => { if (toast && toast.parentNode) toast.remove(); }, 300);
      }
    };

    toast.onclick = () => {
      window.open(chatUrl, '_blank');
      closeToast();
    };

    const btn = toast.querySelector('#ziaver-lagou-toast-btn');
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        window.open(chatUrl, '_blank');
        closeToast();
      };
    }

    const btnClose = toast.querySelector('#ziaver-lagou-close-btn');
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
      startDismissTimer(1800);
    };

    startDismissTimer(3500);
  }

  // ================= HR 回复与私信多维强提醒引擎 (拉勾网 - 严格未读、防误报、防循环、深度过滤) =================
  let lastLagouUnreadCount = 0;
  let lastLagouFriendMsgCount = -1;
  let lastLagouAlertTimestamp = 0;
  let isLagouWatcherInitialized = false;
  let lagouWatcherInitTimestamp = Date.now();

  const LG_SYSTEM_BLACKLIST = [
    '附件简历', '简历请求', '已发送', '已投递', '对方已同意', '交换了', '联系方式',
    '已查看', '已读', '送达', '系统消息', '打招呼', '已接受', '已拒绝', '已同意',
    '请求已发送', '简历已发送', '发起了', '开通了', '完成了', '已过期',
    '面试邀请', '点击预览', '收到你的', '不合适', '查看简历', '拉勾小秘书',
    '系统通知', '职位推荐', '安全提醒', '温馨提示'
  ];

  function isLagouSystemText(text) {
    if (!text) return true;
    const clean = String(text).trim();
    if (clean.length === 0) return true;
    return LG_SYSTEM_BLACKLIST.some(kw => clean.includes(kw));
  }

  function checkLagouChatLastBubbleIsRealHR() {
    if (!window.location.pathname.includes('/im/') && !window.location.pathname.includes('/message/')) return true;
    const chatContainer = document.querySelector('[class*="chat-message-list"], [class*="message-list"], [class*="msg-container"]');
    if (!chatContainer) return true;

    const allMsgItems = chatContainer.querySelectorAll('[class*="msg-item"], [class*="chat-item"], [class*="message-item"]');
    if (allMsgItems.length === 0) return false;

    const lastItem = allMsgItems[allMsgItems.length - 1];
    if (!lastItem) return false;

    const cls = (lastItem.className || '').toLowerCase();
    if (cls.includes('right') || cls.includes('myself') || cls.includes('self') || cls.includes('me')) return false;
    if (cls.includes('system') || cls.includes('tip') || cls.includes('notice') || cls.includes('card') || cls.includes('status')) return false;

    const text = (lastItem.textContent || '').trim();
    if (isLagouSystemText(text)) return false;

    return true;
  }

  function checkLagouSidebarUnreadIsRealHR() {
    if (!window.location.pathname.includes('/im/') && !window.location.pathname.includes('/message/')) return true;
    const unreadItems = document.querySelectorAll(
      '.chat-list li:has([class*="unread"]), .chat-list li:has([class*="badge"]), [class*="session-item"]:has([class*="unread"])'
    );
    if (unreadItems.length > 0) {
      let hasReal = false;
      unreadItems.forEach(item => {
        const preview = item.querySelector('[class*="last-msg"], [class*="msg-preview"], [class*="text"], p');
        const text = preview ? preview.textContent.trim() : item.textContent.trim();
        if (!isLagouSystemText(text)) hasReal = true;
      });
      return hasReal;
    }

    const firstItem = document.querySelector('.chat-list li, [class*="session-item"]');
    if (firstItem) {
      const preview = firstItem.querySelector('[class*="last-msg"], [class*="msg-preview"], [class*="text"], p');
      const text = preview ? preview.textContent.trim() : '';
      if (text && isLagouSystemText(text)) return false;
    }

    return true;
  }

  function startHRReplyWatcher() {
    lagouWatcherInitTimestamp = Date.now();
    try {
      const titleEl = document.querySelector('title');
      if (titleEl) {
        const titleObs = new MutationObserver(() => {
          if (!isSelfFlashingTitle) {
            checkLagouTitleForHR();
          }
        });
        titleObs.observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
    } catch (e) {}

    setInterval(() => {
      checkAllLagouHRMessageSources();
    }, 3000);
  }

  function checkLagouTitleForHR() {
    if (isSelfFlashingTitle) return;
    const title = document.title || '';
    if (title.includes('🔔') || title.includes('JobCruise') || title.includes('ZIAVER')) return;

    if (Date.now() - lagouWatcherInitTimestamp < 4000) return;

    const m = title.match(/[\(（](\d+)[\)）]/) || title.match(/【(\d+)条?(?:新消息)?】/);
    if (m) {
      const count = parseInt(m[1], 10);
      if (count > 0 && isLagouWatcherInitialized && count > lastLagouUnreadCount) {
        if (!checkLagouChatLastBubbleIsRealHR() || !checkLagouSidebarUnreadIsRealHR()) {
          lastLagouUnreadCount = count;
          return;
        }

        if (Date.now() - lastLagouAlertTimestamp > 12000) {
          lastLagouAlertTimestamp = Date.now();
          dispatchLagouHRReplyNotification({
            title: '🔔 拉勾网 · HR 新回复/私信！',
            desc: `有拉勾企业 HR 正在期待您的回复 (${count} 条未读)，请及时跟进！`,
            count
          });
        }
        lastLagouUnreadCount = count;
      }
    } else if (lastLagouUnreadCount > 0) {
      lastLagouUnreadCount = 0;
    }
  }

  function checkAllLagouHRMessageSources() {
    let detectedUnread = 0;

    // A. 顶栏消息气泡扫描：必须提取数字 > 0，绝不抓取无数字占位符
    const headerMsgLinks = document.querySelectorAll(
      'a[href*="/message/"], a[href*="/im/"], a[data-lg-tj-id="message"], .header-msg, .nav-message'
    );
    headerMsgLinks.forEach(link => {
      const badges = link.querySelectorAll(
        '.msg-count, .msg_count, .badge, [class*="unread"], [class*="badge"]'
      );
      badges.forEach(b => {
        if (b.offsetWidth > 0 && b.offsetHeight > 0 && window.getComputedStyle(b).display !== 'none' && window.getComputedStyle(b).visibility !== 'hidden') {
          const txt = b.textContent.trim();
          const num = parseInt(txt, 10);
          if (!isNaN(num) && num > 0) detectedUnread = Math.max(detectedUnread, num);
        }
      });
      const textMatch = (link.textContent || '').match(/[\(（](\d+)[\)）]/);
      if (textMatch) {
        const n = parseInt(textMatch[1], 10);
        if (!isNaN(n) && n > 0) detectedUnread = Math.max(detectedUnread, n);
      }
    });

    // B. 拉勾聊天/消息内页扫描
    let inChatNewMessage = false;
    if (window.location.pathname.includes('/im/') || window.location.pathname.includes('/message/')) {
      const chatUserBadges = document.querySelectorAll(
        '.chat-list [class*="unread"], .chat-list [class*="badge"], [class*="session-item"] [class*="unread"]'
      );
      chatUserBadges.forEach(el => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none') {
          const num = parseInt(el.textContent.trim(), 10);
          if (!isNaN(num) && num > 0) detectedUnread = Math.max(detectedUnread, num);
        }
      });

      const allCandidatesLG = document.querySelectorAll(
        '[class*="item-left"], [class*="friend"], [class*="other-message"], .msg-item-left'
      );
      let realCountLG = 0;
      allCandidatesLG.forEach(el => {
        const cls = (el.className || '').toLowerCase();
        if (cls.includes('system') || cls.includes('tip') || cls.includes('notice') || cls.includes('event') || cls.includes('notification') || cls.includes('resume') || cls.includes('card')) return;
        const txt = (el.textContent || '').trim();
        if (txt.length === 0 || isLagouSystemText(txt)) return;
        realCountLG++;
      });
      const curCount = realCountLG;
      if (isLagouWatcherInitialized && lastLagouFriendMsgCount > 0 && curCount > lastLagouFriendMsgCount) {
        if (checkLagouChatLastBubbleIsRealHR()) {
          inChatNewMessage = true;
        }
      }
      lastLagouFriendMsgCount = curCount;
    }

    // 首次扫描基准化或前 4 秒稳态期：首屏坚决不弹窗打扰！
    if (!isLagouWatcherInitialized || (Date.now() - lagouWatcherInitTimestamp < 4000)) {
      lastLagouUnreadCount = detectedUnread;
      isLagouWatcherInitialized = true;
      return;
    }

    if (detectedUnread === 0 && lastLagouUnreadCount > 0) {
      lastLagouUnreadCount = 0;
      return;
    }

    const hasIncreased = detectedUnread > lastLagouUnreadCount;
    const now = Date.now();

    if (hasIncreased || inChatNewMessage) {
      const isRealHR = checkLagouChatLastBubbleIsRealHR() && checkLagouSidebarUnreadIsRealHR();
      if (!isRealHR) {
        console.log('[ZIAVER Lagou] ⏭ 未读增量被深度二次验证拦截（命中系统消息），静默跳过');
        lastLagouUnreadCount = detectedUnread;
        return;
      }

      if (now - lastLagouAlertTimestamp > 10000) {
        lastLagouAlertTimestamp = now;
        console.log(`[ZIAVER Lagou] 🔔 侦测到真实的拉勾 HR 新未读！未读数: ${detectedUnread}, 上次: ${lastLagouUnreadCount}`);
        dispatchLagouHRReplyNotification({
          title: '🔔 拉勾网 · HR 新回复/私信！',
          desc: inChatNewMessage ? '拉勾 HR 正在对话窗口中发来新消息！' : `有拉勾 HR 正在与您互动沟通 (${detectedUnread} 条未读)，请及时跟进！`,
          count: detectedUnread || 1
        });
      }
    }

    lastLagouUnreadCount = detectedUnread;
  }

  function dispatchLagouHRReplyNotification(info = {}) {
    if (config.audioAlert !== false) playDoubleChime();
    showLagouHRReplyToast({
      title: info.title || '拉勾网 · HR 新回复',
      desc: info.desc || '检测到企业 HR 正在与您互动，请及时跟进！',
      count: info.count || 1,
      chatUrl: 'https://easy.lagou.com/im/chat.htm'
    });
    startTitleFlashing('【🔔 拉勾HR来新消息了!】');
    if (config.desktopNotification !== false) {
      chrome.runtime.sendMessage({
        type: 'HR_REPLY_ALERT',
        platform: 'lagou',
        chatUrl: 'https://easy.lagou.com/im/chat.htm',
        text: info.desc || `拉勾网有新的 HR 沟通回复 (${info.count || 1} 条未读)，请及时跟进！`
      });
    }
    if (typeof logHUD === 'function') {
      logHUD(`<span class="success" style="font-weight: bold;">🔔 检测到拉勾 HR 新回复！请查看消息中心。</span>`);
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
      /* 全网流水线专属进度卡片样式 */
      .pipeline-card {
        background: rgba(16, 185, 129, 0.1);
        border: 1px solid rgba(16, 185, 129, 0.4);
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
        color: #a7f3d0;
      }
      .pipe-pulse-dot {
        width: 7px;
        height: 7px;
        background: #10b981;
        border-radius: 50%;
        display: inline-block;
        margin-right: 5px;
        box-shadow: 0 0 8px #10b981;
        animation: pipePulseLagou 1.5s infinite;
      }
      @keyframes pipePulseLagou {
        0% { transform: scale(0.9); opacity: 0.7; }
        50% { transform: scale(1.3); opacity: 1; }
        100% { transform: scale(0.9); opacity: 0.7; }
      }
      .pipe-badge {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(16, 185, 129, 0.25);
        color: #a7f3d0;
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
        background: linear-gradient(90deg, #10b981 0%, #06b6d4 100%);
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
            <span id="compact-pipe-stat" style="display:none; color:#34d399; font-weight:700;">🌐 全网 0%</span>
            <span id="compact-status-tag" style="color:#10b981; font-size:10px;">🟢 就绪</span>
          </div>

          <!-- 全网流水线专属进度卡片 (Pipeline Banner) -->
          <div class="pipeline-card" id="hud-pipeline-card" style="display: none;">
            <div class="pipeline-header">
              <div style="display:flex; align-items:center;">
                <span class="pipe-pulse-dot"></span>
                <span class="pipe-title">🌐 全网流水线协同巡航中</span>
              </div>
              <span class="pipe-badge" id="hud-pipe-site-tag">第 3/3 站</span>
            </div>
            <div class="pipeline-info-row">
              <span id="hud-pipe-site-text" style="color:#e2e8f0; font-weight:700;">【拉勾招聘】</span>
              <span id="hud-pipe-counts" style="color:#cbd5e1; font-size:11px;">今日: <b id="hud-pipe-site-today" style="color:#34d399;">0</b>/<span id="hud-pipe-site-limit">30</span> <span style="color:#94a3b8; font-size:10px;">(本次 <b id="hud-pipe-site-count" style="color:#6ee7b7;">+0</b>/<span id="hud-pipe-site-target">30</span>)</span></span>
            </div>
            <div class="pipeline-bar-wrap">
              <div class="pipeline-bar-fill" id="hud-pipe-bar-fill" style="width: 0%;"></div>
            </div>
            <div class="pipeline-total-row">
              <span id="hud-pipe-step-list" style="font-size:10px; color:#94a3b8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:210px;">BOSS ✓ → 猎聘 ✓ → 拉勾 🚀</span>
              <span id="hud-pipe-percent-text" style="font-size:11px; font-weight:800; color:#34d399;">0%</span>
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
                <span style="font-size:10px; color:#34d399; text-decoration:underline;">✏️改上限</span>
              </div>
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

          <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.04); border:1px solid rgba(16,185,129,0.25); border-radius:6px; padding:4px 8px; margin-bottom:6px; font-size:10px;">
            <span>📍 锁定城市: <b id="hud-city-name" style="color:#34d399;">深圳</b> <span style="color:#10b981; font-size:9.5px;">(严防异地)</span></span>
            <span style="color:#c084fc;">🎓 24届校招保护: <b style="color:#34d399;">已激活</b></span>
          </div>

          <div class="action-btns">
            <button class="btn btn-primary" id="btn-toggle-run">
              <span>🚀 开启拉勾投递</span>
            </button>
            <button class="btn btn-pause" id="btn-pause-run" style="display:none; max-width:80px;">
              <span>⏸ 暂停</span>
            </button>
          </div>

          <div style="display: flex; gap: 6px; margin-top: 4px;">
            <button class="btn btn-secondary" id="btn-lagou-open-quickfill" style="flex:1; font-size:11px; padding:6px 8px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.3); color:#34d399; border-radius:6px; cursor:pointer;">
              <span>📋 简历速填小抽屉</span>
            </button>
            <button class="btn btn-secondary" id="btn-lagou-open-digest" style="flex:1; font-size:11px; padding:6px 8px; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.35); color:#fbbf24; border-radius:6px; cursor:pointer;" title="查看每日全网优质求职情报与公众号直招推文">
              <span>📰 今日全网情报</span>
            </button>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding: 0 2px;">
            <span style="font-size: 10.5px; color: #94a3b8; font-weight: 600;">📋 实时运行日志 (保留最新80条)</span>
            <span id="btn-clear-lagou-log" style="font-size: 10px; color: #34d399; text-decoration: underline; cursor: pointer;">清空</span>
          </div>
          <div class="hud-log-box" id="hud-log-scroll" style="max-height: 120px; overflow-y: auto;">
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
        ⚡ 拉勾巡航 (<span id="pill-count">0</span>/<span id="pill-limit">30</span>)<span id="pill-pipe-stat" style="display:none; color:#34d399; font-weight:700;"></span>
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

    // 查看今日全网求职情报
    shadowRoot.getElementById('btn-lagou-open-digest')?.addEventListener('click', () => {
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

    // 清空日志按钮
    shadowRoot.getElementById('btn-clear-lagou-log')?.addEventListener('click', () => {
      const stream = shadowRoot.getElementById('hud-log-scroll');
      if (stream) {
        stream.innerHTML = '<div style="color:#64748b;">[系统就绪] 日志已清空，拉勾巡航待命...</div>';
      }
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    updateHUD();
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
      const curIdx = status.currentIndex !== undefined ? status.currentIndex : 2;
      const curSite = status.currentSite || (status.sites && status.sites[curIdx]);
      const siteName = curSite ? curSite.name : '拉勾招聘';

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

    // 同步更新流水线卡片今日与本次投递计数
    const pipeTodayEl = shadowRoot.getElementById('hud-pipe-site-today');
    const pipeLimitEl = shadowRoot.getElementById('hud-pipe-site-limit');
    const pipeCountEl = shadowRoot.getElementById('hud-pipe-site-count');
    const pipeTargetEl = shadowRoot.getElementById('hud-pipe-site-target');
    if (pipeTodayEl) pipeTodayEl.textContent = todayCount;
    if (pipeLimitEl) pipeLimitEl.textContent = limit;
    if (pipeCountEl) pipeCountEl.textContent = `+${sessionCount}`;
    if (pipeTargetEl) pipeTargetEl.textContent = pipelineTarget || limit;

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

    const cityEl = shadowRoot.getElementById('hud-city-name');
    if (cityEl) cityEl.textContent = config.targetCity || '深圳';
  }

  function logHUD(htmlMsg) {
    if (!shadowRoot) return;
    const logBox = shadowRoot.getElementById('hud-log-scroll');
    if (!logBox) return;
    const now = new Date();
    const timeStr = `[${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}]`;

    // 控制台镜像输出
    const plainText = htmlMsg.replace(/<[^>]+>/g, '');
    console.log(`%c[ZIAVER 拉勾] ${timeStr} ${plainText}`, 'color: #34d399;');

    const line = document.createElement('div');
    line.style.cssText = 'margin-bottom: 2px; word-break: break-all;';
    line.innerHTML = `<span style="color:#64748b; font-size:10px; margin-right:4px;">${timeStr}</span>${htmlMsg}`;
    logBox.prepend(line);
    while (logBox.children.length > 80) {
      logBox.removeChild(logBox.lastChild);
    }
  }

  // ================= 拉勾登录态智能识别 =================
  function checkIsLoggedIn() {
    // 1. 明确的未登录路由
    if (location.hostname.includes('passport.lagou.com') || location.pathname.startsWith('/login')) {
      return false;
    }

    // 2. 强特征：只要存在候选人已登录元素，坚决判定已登录
    const loggedInIndicators = document.querySelectorAll(
      '.user_dropdown, .user-avatar, .user-info, .avatar_wrap, .login-success, #lg_tbar .user_nav, .header-user, [data-lg-tj-id="header_user"]'
    );
    for (const ind of loggedInIndicators) {
      if (ind && (ind.offsetWidth > 0 || ind.offsetHeight > 0 || ind.getClientRects().length > 0)) {
        return true;
      }
    }

    // 3. 检查是否有真实可见的登录弹窗
    const loginModal = document.querySelector('.login-modal, #lg_login, .passport-login-container, .modal-login');
    if (loginModal) {
      const style = window.getComputedStyle(loginModal);
      const rect = loginModal.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 120 && rect.height > 120) {
        return false;
      }
    }

    // 4. 检查显式未登录按钮
    const candidateLoginBtn = document.querySelector('.unlogin-box, .header-login, [data-lg-tj-id="header_login"]');
    if (candidateLoginBtn) {
      const txt = candidateLoginBtn.textContent.trim();
      const style = window.getComputedStyle(candidateLoginBtn);
      if (style.display !== 'none' && (txt.includes('登录') || txt.includes('注册'))) {
        return false;
      }
    }

    return true;
  }

  let isSkipped = false;

  // ================= 巡航运行逻辑 =================
  async function startAutopilot(targetCount = 10, isFromPipeline = false, initialSessionCount = 0, tagIdx = 0) {
    if (isRunning) return;
    refreshConfig();
    isSkipped = false;
    currentTagIndex = tagIdx || 0;

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
      if (isFromPipeline) {
        isSkipped = true;
        logHUD(`<span class="highlight" style="color:#f59e0b;">[安全上限已达]</span> 今日已达安全上限 (${todayCount}/${config.dailyLimit || 30} 次)，自动向全网流水线交接...`);
        chrome.runtime.sendMessage({
          type: 'PIPELINE_SITE_SKIPPED',
          site: 'lagou',
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
          site: 'lagou',
          reason: '未勾选高亮职业词条'
        });
        return;
      } else {
        alert('⚠️ 当前没有高亮选中的生效职业词条！请打开后台管理勾选。');
        return;
      }
    }

    pipelineMode = isFromPipeline;
    pipelineTarget = targetCount || (config.dailyLimit || 30);
    sessionCount = initialSessionCount || 0;

    // 智能定向检索关键词校验：如果拉勾当前未带 kd= 参数，自动导航至精准搜索
    const currentUrl = window.location.href;
    const targetTag = activeTags[currentTagIndex] || activeTags[0] || '';
    if (targetTag && !currentUrl.includes('kd=')) {
      logHUD(`<span class="highlight">[定向检索重定向]</span> 拉勾当前未包含关键词，正在自动进入【${targetTag}】精准定向搜索...`);
      if (pipelineMode) {
        try {
          sessionStorage.setItem('ziaver_pipeline_lagou_state', JSON.stringify({
            inPipeline: true,
            target: pipelineTarget,
            sessionCount: sessionCount,
            currentTagIndex: currentTagIndex,
            timestamp: Date.now()
          }));
        } catch (e) {}
      }
      setTimeout(() => {
        window.location.href = `https://www.lagou.com/wn/jobs?kd=${encodeURIComponent(targetTag)}&city=%E6%B7%B1%E5%9C%B3`;
      }, 1200);
      return;
    }

    isRunning = true;
    isPaused = false;

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
    logHUD(`<span class="highlight">[拉勾巡航启动]</span> ${pipelineMode ? `全网流水线模式 (本站目标: ${pipelineTarget}，当前检索词:【${targetTag}】)！` : `当前检索词:【${targetTag}】`} (已完成 ${sessionCount} 个)`);
    if (document.hidden) {
      logHUD('<span class="skip" style="color:#fbbf24;">[提示] 建议保持窗口展开（或放至 Win+Tab 虚拟桌面），避免最小化被系统节能休眠限速。</span>');
    }

    try {
      await runLagouLoop();
    } catch (err) {
      console.error(err);
      logHUD(`<span class="highlight" style="color:#ef4444;">[异常中断]</span> ${err.message || err}`);
    } finally {
      const wasPipeline = pipelineMode;
      const finalCount = sessionCount;
      try {
        sessionStorage.removeItem('ziaver_pipeline_lagou_state');
      } catch (e) {}
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
    try {
      sessionStorage.removeItem('ziaver_pipeline_lagou_state');
    } catch (e) {}
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
          const isCampus = !!screenResult.data?.isCampus2024;
          const greetingText = synthesizeGreeting(title, matchedTag, company, isCampus);

          if (isCampus) {
            logHUD(`<span class="success">[🎓24届校招宝藏命中]</span> ${company} · ${title} (${salary}) <span style="font-size:10px; color:#c084fc;">[符合2024年9月毕业资质]</span>`);
          } else {
            logHUD(`<span class="highlight">[命中词条: ${matchedTag}]</span> ${company} · ${title} (${salary})`);
          }
          logHUD(`<span class="skip" style="color:#6ee7b7;">合成自然话术: "${greetingText.slice(0, 30)}..."</span>`);

          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await sleep(Math.floor(Math.random() * 500) + 600);

          // 严格校验拉勾投递与真实送达回执
          const chatResult = await executeAndVerifyLagouChat(card, btnChat, greetingText);

          if (chatResult.success) {
            sessionCount++;
            todayCount++;
            updateHUD();

            // 持久化今日统计 (拉勾独立计数)
            if (chrome.storage && chrome.storage.local) {
              const today = getLocalDateStr();
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
            if (pipelineMode) {
              chrome.runtime.sendMessage({
                type: 'PIPELINE_SITE_PROGRESS',
                site: 'lagou',
                count: sessionCount,
                todayCount: todayCount
              });
            }

            logHUD(`<span class="success">[真实投递确认]</span> ${company} · ${title} 成功送达入库！`);

            const delayMs = getRandomDelayMs();
            logHUD(`<span class="skip">拟人化等待 ${(delayMs / 1000).toFixed(1)} 秒防风控...</span>`);
            await sleep(delayMs);
          } else if (chatResult.reason === 'limit_reached') {
            logHUD(`<span class="highlight" style="color:#ef4444; font-weight:bold;">🛑【平台上限熔断】拉勾网已达今日投递/沟通上限！已自动停止巡航。</span>`);
            if (pipelineMode) {
              logHUD('<span class="highlight" style="color:#f59e0b;">[流水线转场] 拉勾已满额，自动向中枢汇报完成...</span>');
              chrome.runtime.sendMessage({
                type: 'PIPELINE_SITE_FINISHED',
                site: 'lagou',
                count: sessionCount
              });
            }
            break;
          } else if (chatResult.reason === 'captcha_triggered') {
            logHUD(`<span class="highlight" style="color:#f59e0b; font-weight:bold;">⚠️【人机验证拦截】请手动完成验证后点击【继续】！</span>`);
          } else {
            logHUD(`<span class="skip" style="color:#94a3b8;">[送达未确认] ${company} · ${title} (${chatResult.message || '未响应'})，已安全跳过</span>`);
            await sleep(600);
          }
        }
      }

      // 强校验：卡片遍历结束后，若今日上限已达或流水线本站目标已达成，立刻终止循环，坚决禁止执行翻页！
      if (!isRunning) break;
      if (todayCount >= (config.dailyLimit || 30)) {
        logHUD(`<span class="highlight">[安全上限熔断]</span> 今日已达安全上限 ${config.dailyLimit || 30} 次，停止投递！`);
        break;
      }
      if (pipelineMode && sessionCount >= pipelineTarget) {
        logHUD(`<span class="success">[本站目标达成]</span> 已完成拉勾设定目标 (${sessionCount}/${pipelineTarget})，停止翻页并向中枢交接！`);
        break;
      }

      // 翻页处理
      if (isRunning && !isPaused && sessionCount < pipelineTarget) {
        logHUD('<span>[翻页检测]</span> 尝试翻到下一页...');
        const nextPageBtn = document.querySelector(
          '.ant-pagination-next:not(.ant-pagination-disabled) button, a.pagination-next, [class*="pagination-next"]'
        );
        if (nextPageBtn) {
          if (pipelineMode) {
            try {
              sessionStorage.setItem('ziaver_pipeline_lagou_state', JSON.stringify({
                inPipeline: true,
                target: pipelineTarget,
                sessionCount: sessionCount,
                currentTagIndex: currentTagIndex,
                timestamp: Date.now()
              }));
            } catch (e) {}
          }
          nextPageBtn.click();
          await sleep(4000);
        } else {
          // 智能换词轮转：若当前词在拉勾已翻到底且未达目标，自动轮转至下一个高亮词条
          if (currentTagIndex + 1 < activeTags.length && (!pipelineMode || sessionCount < pipelineTarget)) {
            const nextTag = activeTags[currentTagIndex + 1];
            logHUD(`<span class="highlight">[智能换词轮转]</span> 词条【${activeTags[currentTagIndex]}】在拉勾已无更多岗位，自动换词切换至【${nextTag}】继续搜寻...`);
            if (pipelineMode) {
              try {
                sessionStorage.setItem('ziaver_pipeline_lagou_state', JSON.stringify({
                  inPipeline: true,
                  target: pipelineTarget,
                  sessionCount: sessionCount,
                  currentTagIndex: currentTagIndex + 1,
                  timestamp: Date.now()
                }));
              } catch (e) {}
            }
            await sleep(2000);
            window.location.href = `https://www.lagou.com/wn/jobs?kd=${encodeURIComponent(nextTag)}&city=%E6%B7%B1%E5%9C%B3`;
            return;
          }
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

  // ================= 严格送达校验与风控熔断引擎 (拉勾) =================
  async function executeAndVerifyLagouChat(card, btnChat, greetingText) {
    function checkLagouCaptcha() {
      const captcha = document.querySelector('.nc_wrapper, .geetest_holder, [class*="captcha"], [class*="verify-box"], #captcha');
      if (captcha && (captcha.offsetWidth > 0 || captcha.offsetHeight > 0)) return true;
      const bodyText = (document.body.innerText || '').slice(0, 3000);
      return bodyText.includes('请完成安全验证') || bodyText.includes('完成拼图') || bodyText.includes('滑动验证');
    }

    function checkLagouLimitDialog() {
      const modals = document.querySelectorAll('.ant-modal-content, [class*="dialog"], [class*="modal"]');
      for (const m of modals) {
        if (m.offsetWidth > 0 && m.offsetHeight > 0) {
          const txt = m.textContent.trim();
          if (
            txt.includes('今日投递次数已达上限') ||
            txt.includes('投递次数已达上限') ||
            txt.includes('沟通次数已达上限') ||
            txt.includes('沟通次数已用完') ||
            txt.includes('操作过于频繁') ||
            txt.includes('已达今日上限')
          ) {
            const btn = m.querySelector('button, .ant-btn, .close-btn');
            if (btn) btn.click();
            return true;
          }
        }
      }
      const toasts = document.querySelectorAll('.ant-message-notice, .message-wrap, .toast, [class*="toast"]');
      for (const t of toasts) {
        const txt = t.textContent.trim();
        if (txt.includes('上限') || txt.includes('过于频繁') || txt.includes('次数已用完')) {
          return true;
        }
      }
      return false;
    }

    async function handleLagouModalInner() {
      const modalTextarea = document.querySelector('.ant-modal-content textarea, [class*="dialog"] textarea, [class*="modal"] textarea');
      if (modalTextarea && modalTextarea.offsetParent !== null) {
        modalTextarea.focus();
        modalTextarea.value = greetingText;
        modalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        modalTextarea.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);

        const confirmBtn = document.querySelector('.ant-modal-content button.ant-btn-primary, [class*="dialog"] button.btn-primary');
        if (confirmBtn) {
          confirmBtn.click();
          await sleep(800);
        }
      }
    }

    function checkIsLagouSuccess() {
      const curTxt = btnChat ? btnChat.textContent.trim() : '';
      if (curTxt === '继续沟通' || curTxt === '已沟通' || curTxt === '已投递') return true;
      const cardBtns = card.querySelectorAll('a, button, span');
      for (const b of cardBtns) {
        const t = b.textContent.trim();
        if (t === '继续沟通' || t === '已沟通' || t === '已投递') return true;
      }
      const toasts = document.querySelectorAll('.ant-message-success, .ant-message-notice-success, .toast-success');
      for (const t of toasts) {
        const txt = t.textContent.trim();
        if (txt.includes('投递成功') || txt.includes('打招呼成功') || txt.includes('成功') || txt.includes('已发送')) {
          return true;
        }
      }
      return false;
    }

    function dismissStuckModal() {
      const closeBtn = document.querySelector('.ant-modal-close, [class*="dialog"] .close, .close-btn');
      if (closeBtn && closeBtn.offsetWidth > 0) closeBtn.click();
    }

    if (checkLagouCaptcha()) {
      isPaused = true;
      return { success: false, reason: 'captcha_triggered', message: '触发人机验证' };
    }

    // 关键防跳盾：杜绝 <a> 标签原生导航跳转破坏巡航
    const linkEl = btnChat.tagName === 'A' ? btnChat : btnChat.closest('a');
    if (linkEl) {
      linkEl.removeAttribute('target');
      linkEl.setAttribute('data-original-href', linkEl.getAttribute('href') || '');
      linkEl.setAttribute('href', 'javascript:void(0);');
    }
    const preventJump = (e) => {
      if (linkEl) e.preventDefault();
    };
    btnChat.addEventListener('click', preventJump, { capture: true, once: true });

    ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(evt => {
      try {
        btnChat.dispatchEvent(new MouseEvent(evt, { bubbles: true, cancelable: true, view: window }));
      } catch (e) {}
    });
    try {
      btnChat.click();
    } catch (e) {}
    playDoubleChime();
    await sleep(800);

    if (checkLagouLimitDialog()) {
      return { success: false, reason: 'limit_reached', message: '拉勾今日投递或沟通已达上限' };
    }

    await handleLagouModalInner();

    const start = Date.now();
    let isSuccess = false;
    while (Date.now() - start < 2500) {
      if (checkLagouLimitDialog()) {
        return { success: false, reason: 'limit_reached', message: '拉勾今日投递或沟通已达上限' };
      }
      if (checkIsLagouSuccess()) {
        isSuccess = true;
        break;
      }
      await sleep(300);
    }

    if (isSuccess) {
      return { success: true };
    } else {
      dismissStuckModal();
      return { success: false, reason: 'unverified', message: '未收到成功状态改变' };
    }
  }

  function checkAndResumePipeline() {
    try {
      const raw = sessionStorage.getItem('ziaver_pipeline_lagou_state');
      chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res) return;
        renderPipelineHUD(res);

        if (!raw) return;
        const state = JSON.parse(raw);
        if (!state || !state.inPipeline) return;
        if (Date.now() - state.timestamp > 300000) {
          sessionStorage.removeItem('ziaver_pipeline_lagou_state');
          return;
        }

        const currentSite = res.sites && res.sites[res.currentIndex];
        if (res.isActive && currentSite && currentSite.id === 'lagou') {
          const tagIdx = state.currentTagIndex || 0;
          currentTagIndex = tagIdx;
          logHUD(`<span class="highlight">[跨页续航]</span> 正在恢复全网流水线 (进度: ${state.sessionCount || 0}/${state.target})...`);
          setTimeout(() => {
            startAutopilot(state.target, true, state.sessionCount || 0, tagIdx);
          }, 1500);
        } else {
          sessionStorage.removeItem('ziaver_pipeline_lagou_state');
        }
      });
    } catch (e) {
      console.warn('[ZIAVER] 检查续航异常:', e);
    }
  }

  // ================= 消息总线监听 =================
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'START_PIPELINE_RUN') {
      const target = request.target || 10;
      if (request.activeTags && Array.isArray(request.activeTags) && request.activeTags.length > 0) {
        activeTags = request.activeTags;
      }
      currentTagIndex = request.currentTagIndex || 0;
      console.log('[ZIAVER Autopilot] 收到全网流水线启动指令，拉勾目标:', target, '词条索引:', currentTagIndex);
      refreshConfig(() => {
        startAutopilot(target, true, 0, currentTagIndex);
        chrome.runtime.sendMessage({ type: 'GET_PIPELINE_STATUS' }, (res) => {
          if (res) renderPipelineHUD(res);
        });
      });
      sendResponse({ status: 'started', platform: '拉勾招聘' });
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
      console.log('[ZIAVER Autopilot] 拉勾招聘收到跨日广播，新日期:', request.today);
      refreshConfig();
      sendResponse({ status: 'ok' });
      return true;
    } else if (request.type === 'PING') {
      sendResponse({ status: 'pong', platform: '拉勾招聘' });
      return true;
    }
  });

  // ================= 实时跨日状态感应探针 (防止开着标签页过夜不刷新的情况) =================
  setInterval(() => {
    const today = getLocalDateStr();
    if (config.lastActiveDate && config.lastActiveDate !== today) {
      console.log('[ZIAVER Autopilot] 拉勾招聘页面探针感应到跨日变更，自动刷新配置与今日计数');
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

  // ================= HR 智能快捷回复应答助手 (拉勾招聘) =================
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
      border: 1px solid #10b981;
      color: #e2e8f0;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5), 0 0 16px rgba(16,185,129,0.25);
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
        if (el.closest('#ziaver-lagou-hud') || el.closest('#ziaver-quick-reply-bar')) continue;
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
        background: rgba(11, 15, 25, 0.96);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border: 1px solid rgba(16, 185, 129, 0.4);
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      `;

      const allReplies = [...DEFAULT_QUICK_REPLIES, ...customReplies];

      bar.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: #34d399;">⚡ HR 智能快捷回复助手</span>
            <span style="font-size: 10px; color: #94a3b8;">(点击一键填入输入框)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            <button id="btn-add-quick-reply" style="background: rgba(16, 185, 129, 0.15); border: 1px dashed rgba(16, 185, 129, 0.4); color: #34d399; font-size: 10.5px; padding: 2px 7px; border-radius: 4px; cursor: pointer;">+ 自定义话术</button>
            <button id="btn-toggle-qr-collapse" style="background: transparent; border: none; color: #94a3b8; font-size: 12px; cursor: pointer; padding: 0 4px;" title="收起/展开">—</button>
          </div>
        </div>
        <div id="qr-chips-container" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 3px; scrollbar-width: thin;">
          ${allReplies.map(r => `
            <div class="qr-chip" data-id="${r.id}" title="${r.title}：\n${r.text}" style="display: inline-flex; align-items: center; gap: 4px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 14px; padding: 3px 9px; cursor: pointer; white-space: nowrap; font-size: 11px; color: #e2e8f0; transition: all 0.15s ease;">
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
          chip.style.background = 'rgba(16, 185, 129, 0.2)';
          chip.style.borderColor = '#34d399';
        });
        chip.addEventListener('mouseleave', () => {
          chip.style.background = 'rgba(255, 255, 255, 0.06)';
          chip.style.borderColor = 'rgba(16, 185, 129, 0.25)';
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

  // 页面挂载启动
  if (location.hostname.includes('lagou.com')) {
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
