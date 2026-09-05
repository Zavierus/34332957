// JobCruise 求职自动化助手 - 大厂ATS官网智能巡航引擎 & 网申副驾驶 v2.3 (ATS Cruise & Co-Pilot)
// 适配目标：腾讯(Tencent)、字节跳动(ByteDance)、大疆(DJI)、影石(Insta360)、网易(NetEase)、米哈游(miHoYo) 及 北森/大易等ATS系统
// 核心模块：
// 1. 职位列表智能雷达巡航 (List Radar)：自动扫描、高亮命中词条、过滤黑名单、一键后台批量打开
// 2. 网申表单全自动流转回填 (Form Auto-Pilot)：自适应注入个人档案、作品集直链、针对各大厂的定制文案
// 3. 投递名额安全防御锁 (Safe-Submit Lock)：严防消耗大厂申请名额，提交前醒目确认并自动记入 Excel 导出日志

(function () {
  'use strict';

  if (window.__JOBCRUISE_ATS_COPILOT__) return;
  window.__JOBCRUISE_ATS_COPILOT__ = true;

  console.log('[JobCruise Autopilot] 大厂ATS智能巡航引擎已激活');

  // ================= 1. 候选人全景网申档案（支持在后台自主配置） =================
  let CANDIDATE = {
    name: '求职者',
    gender: '男',
    ethnic: '汉族',
    politics: '群众',
    phone: '13800138000',
    wechat: 'my_wechat_id',
    email: 'job_applicant@example.com',
    school: '示范大学',
    degree: '本科',
    major: '运营策划/数字媒体',
    gradYear: '2024',
    city: '广东深圳',
    nativePlace: '广东深圳',
    targetSalary: '10-20K',
    portfolioUrl: '',
    resumeUrl: ''
  };

  // 动态从后台 storage 加载用户自主配置的档案
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['applicantProfile'], (res) => {
      if (res && res.applicantProfile) {
        CANDIDATE = { ...CANDIDATE, ...res.applicantProfile };
      }
    });
  }

  // ================= 2. 大厂特定化定制数据与适配话术 =================
  const PORTAL_CONFIG = {
    DJI: {
      name: '大疆创新 (DJI)',
      domainRegex: /(dji\.com|dji\.zhiye\.com)/i,
      themeColor: '#00f2fe',
      bgColor: 'linear-gradient(135deg, #0b1329 0%, #1e293b 100%)',
      badge: '📷 影像/社区/达人创作者生态',
      highlightPitch: '您好！关注到大疆在招这个岗位，整体要求与我的从业背景非常契合。我熟悉无人机与手持影像设备生态；执行力强、比较看重数据和落地，能打通从产品硬核特性到高质视觉内容的全链路。简历在附件中，期待与您沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '主导商业摄影与视觉策划，负责创作者生态建联与全周期内容排期，兼具视觉审美、工业化执行力与数据归因思维。'
    },
    INSTA360: {
      name: '影石 Insta360',
      domainRegex: /(insta360\.com|arashivision\.zhiye\.com)/i,
      themeColor: '#fbbf24',
      bgColor: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)',
      badge: '🌍 全球达人BD/摄影创作者',
      highlightPitch: '您好！看到影石在招这个岗位，整体要求跟我挺契合的。我熟悉达人分层BD拓展与内容SOP，对数码极客审美与影像创作有浓厚热情，执行力强、注重实际业务落地。简历在附件中，期待与您沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '负责头部与高潜KOL分层建联与内容转化落地，精细化拆解脚本与转化漏斗，实现内容曝光向业务沉淀的有效流转。'
    },
    TENCENT: {
      name: '腾讯招聘 (Tencent)',
      domainRegex: /(tencent\.com|join\.qq\.com)/i,
      themeColor: '#38bdf8',
      bgColor: 'linear-gradient(135deg, #082f49 0%, #0f172a 100%)',
      badge: '🎮 IEG游戏/社区/PCG长音频',
      highlightPitch: '您好！看到腾讯在招这个岗位，感觉方向跟我很对口。我具备深度游戏体验与机制拆解能力，熟悉玩家社区生态与内容运营，沟通协作高效、看重数据和落地。简历在附件中，期待与您沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '对主流竞技与二次元核心赛道有体系化认知；具备成熟的社群活动组织、达人联动与玩家情绪风向捕捉能力，懂玩家更懂产品。'
    },
    BYTEDANCE: {
      name: '字节跳动 (ByteDance)',
      domainRegex: /(bytedance\.com|toutiao\.com)/i,
      themeColor: '#3b82f6',
      bgColor: 'linear-gradient(135deg, #172554 0%, #0f172a 100%)',
      badge: '🛍️ 抖音电商/汽水音乐/大促运营',
      highlightPitch: '您好！看到字节在招这个岗位，感觉经历很对口。我具备电商大促、达人内容与千川投放实战经验，协同敏捷、注重数据归因与全链路落地。简历在附件中，期待与您沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '参与大促全链路节点运营，主导商家对接、达人内容调优与数据归因，以A/B测试与数据驱动实现业务稳定落地。'
    },
    NETEASE: {
      name: '网易招聘 (NetEase)',
      domainRegex: /(163\.com|netease\.com)/i,
      themeColor: '#f43f5e',
      bgColor: 'linear-gradient(135deg, #4c0519 0%, #0f172a 100%)',
      badge: '🎮 互娱游戏/云音乐运营',
      highlightPitch: '您好！看到网易在招这个岗位，整体要求跟我还蛮契合的。我是重度游戏与数字内容用户，擅长社群运营、创作者二创激励与内容宣发，注重长线运营与口碑维护。简历在附件中，期待与您沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '擅长用户社区生态活跃、创作者二创激励与流媒体内容宣发，注重长线运营与用户口碑维护。'
    },
    MIHOYO: {
      name: '米哈游 (miHoYo)',
      domainRegex: /mihoyo\.com/i,
      themeColor: '#06b6d4',
      bgColor: 'linear-gradient(135deg, #083344 0%, #0f172a 100%)',
      badge: '🎮 二次元游戏/IP社区',
      highlightPitch: '您好！看到米哈游在招这个岗位，方向跟我非常契合。我是二次元与重度游戏玩家，深度参与玩家社区与二创生态，具备良好的玩家同理心与活动执行力。简历在附件中，期待与您沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '深度拆解角色设定、版本活动与二创传播模型，具备强烈的玩家同理心与活动执行力。'
    },
    OTHER_ATS: {
      name: '大厂官方招聘 (ATS)',
      domainRegex: /.*/,
      themeColor: '#10b981',
      bgColor: 'linear-gradient(135deg, #064e3b 0%, #0f172a 100%)',
      badge: '⚡ 智能网申副驾驶',
      highlightPitch: '您好！看到咱们在招这个岗位，感觉整体要求跟我还蛮匹配的。我有相关业务实战经验，执行力强、看重数据和实际业务落地。简历在附件中，如果合适随时沟通交流，祝您工作顺利、天天开心～',
      projectSnippet: '主导大型营销节点与数字内容运营，精通数据归因与全链路执行，兼具审美与落地能力。'
    }
  };

  // 识别当前网站
  function getCurrentPortal() {
    const host = location.hostname;
    for (const key of ['DJI', 'INSTA360', 'TENCENT', 'BYTEDANCE', 'NETEASE', 'MIHOYO']) {
      if (PORTAL_CONFIG[key] && PORTAL_CONFIG[key].domainRegex.test(host)) {
        return PORTAL_CONFIG[key];
      }
    }
    return PORTAL_CONFIG.OTHER_ATS;
  }

  // 存储状态
  let activeTags = [];
  let currentConfig = {};
  let matchedJobsOnPage = [];

  function loadStorageData(callback) {
    if (!chrome.storage || !chrome.storage.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(['config', 'jobTags'], (res) => {
      if (res && res.config) currentConfig = res.config;
      if (res && res.jobTags && Array.isArray(res.jobTags)) {
        activeTags = res.jobTags.filter(t => t.active).map(t => t.name.trim());
      } else {
        activeTags = ['达人运营', '电商运营', '千川投放', '游戏运营', '商业摄影', '视觉策划', '综合运营'];
      }
      if (callback) callback();
    });
  }

  // ================= 3. 智能表单填充逻辑 (React/Vue/Antd/Element兼容) =================
  function setNativeValue(element, value) {
    if (!element) return;
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function autoFillCurrentPage(portal) {
    let filledCount = 0;
    const inputs = document.querySelectorAll('input, textarea');

    // 优先采用配置的自定义打招呼话术或大厂定向自荐文案
    const pitchText = (currentConfig.useCustomGreeting !== false && currentConfig.customGreetingTemplate)
      ? currentConfig.customGreetingTemplate.replace(/\{portfolioUrl\}/g, CANDIDATE.portfolioUrl)
      : portal.highlightPitch;

    inputs.forEach(input => {
      if (input.type === 'hidden' || input.disabled || input.readOnly) return;

      const placeholder = (input.placeholder || '').toLowerCase();
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const label = (input.closest('label')?.textContent || 
                     input.closest('.ant-form-item')?.textContent || 
                     input.closest('.form-item')?.textContent || 
                     input.closest('.el-form-item')?.textContent || '').toLowerCase();
      const context = (placeholder + ' ' + name + ' ' + id + ' ' + label).toLowerCase();

      // 姓名
      if (/姓名|真实姓名|candidate.*name|your.*name|姓\s*名/i.test(context) && !/紧急|推荐|联系人/i.test(context)) {
        setNativeValue(input, CANDIDATE.name);
        filledCount++;
      }
      // 手机
      else if (/手机|电话|联系电话|phone|mobile/i.test(context) && !/紧急|推荐/i.test(context)) {
        setNativeValue(input, CANDIDATE.phone);
        filledCount++;
      }
      // 邮箱
      else if (/邮箱|email|mail/i.test(context)) {
        setNativeValue(input, CANDIDATE.email);
        filledCount++;
      }
      // 毕业院校
      else if (/毕业院校|学校|高校|大学|school|university/i.test(context)) {
        setNativeValue(input, CANDIDATE.school);
        filledCount++;
      }
      // 学历
      else if (/最高学历|学历|degree|education/i.test(context) && input.tagName === 'INPUT') {
        setNativeValue(input, CANDIDATE.degree);
        filledCount++;
      }
      // 专业
      else if (/专业|major/i.test(context)) {
        setNativeValue(input, CANDIDATE.major);
        filledCount++;
      }
      // 毕业年份/时间
      else if (/毕业时间|毕业年份|graduation/i.test(context)) {
        setNativeValue(input, CANDIDATE.gradYear);
        filledCount++;
      }
      // 所在城市 / 期望城市
      else if (/现居|城市|期望工作地|city|location/i.test(context) && !/院校所在/i.test(context)) {
        setNativeValue(input, CANDIDATE.city);
        filledCount++;
      }
      // 简历附件直链
      else if (/简历.*(链接|地址|url)|resume.*url/i.test(context)) {
        setNativeValue(input, CANDIDATE.resumeUrl);
        filledCount++;
      }
      // 微信号
      else if (/微信号?|wechat|wx/i.test(context) && !/联系人/i.test(context)) {
        setNativeValue(input, CANDIDATE.wechat);
        filledCount++;
      }
      // 民族
      else if (/民族|nation/i.test(context)) {
        setNativeValue(input, CANDIDATE.ethnic);
        filledCount++;
      }
      // 政治面貌
      else if (/政治面貌|politics/i.test(context)) {
        setNativeValue(input, CANDIDATE.politics);
        filledCount++;
      }
      // 籍贯 / 生源地
      else if (/籍贯|生源地|出生地/i.test(context)) {
        setNativeValue(input, CANDIDATE.nativePlace);
        filledCount++;
      }
      // 作品集 / 个人主页 / 链接
      else if (/作品|作品集|链接|主页|个人主页|blog|portfolio|github|web/i.test(context)) {
        setNativeValue(input, CANDIDATE.portfolioUrl);
        filledCount++;
      }
      // 自我介绍 / 优势亮点
      else if (/自我评价|自我介绍|优势|个人简介|自荐|introduction|summary/i.test(context)) {
        setNativeValue(input, pitchText);
        filledCount++;
      }
    });

    return filledCount;
  }

  // ================= 4. 职位列表雷达巡航扫描器 (List Radar) =================
  function scanJobList(portal) {
    matchedJobsOnPage = [];
    const blacklist = (currentConfig.blacklistKeywords || '').split(/[,，|、\s]+/).filter(Boolean);

    // 适配各大厂社招与校招职位列表卡片选择器
    const candidateCards = document.querySelectorAll(
      // 腾讯社招 & 腾讯校招 (join.qq.com)
      '.recruit-list-item, .search-list-item, .table-item, [class*="job-item"], [class*="post-item"], [class*="postItem"], [class*="jobItem"], .post-item, .job-item, ' +
      // 字节社招 & 字节校招 (jobs.bytedance.com/campus)
      '.position-item, [class*="positionCard"], [class*="position-card"], [class*="jobCard"], [class*="position_card"], ' +
      // 大疆校招 & 影石校招 & 网易校招 (campus.163.com) & 米哈游校招
      '[class*="career-item"], [class*="job-list"] > li, [class*="jobList"] > li, .el-table__row, .ant-table-row, tr[class*="table-row"], ' +
      // 通用与北森系统 (Zhiye)
      '.list-item, .job-list-item, [class*="job-card"], [class*="card-item"]'
    );

    let totalCardsFound = candidateCards.length;
    let matchCount = 0;

    candidateCards.forEach(card => {
      const text = card.textContent || '';
      const titleEl = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="name"], a[href*="post"], a[href*="job"], a[href*="position"]');
      const title = (titleEl ? titleEl.textContent : text).trim();

      // 链接提取
      let linkEl = card.querySelector('a[href*="detail"], a[href*="position"], a[href*="post"], a[href*="job"], a');
      let linkUrl = linkEl ? linkEl.href : null;
      if (!linkUrl && card.tagName === 'A') linkUrl = card.href;

      // 黑名单检查
      const isBlacklisted = blacklist.some(b => text.toLowerCase().includes(b.toLowerCase()));
      if (isBlacklisted) return;

      // 匹配词条库
      let matchedTag = null;
      for (const tag of activeTags) {
        if (title.toLowerCase().includes(tag.toLowerCase()) || text.toLowerCase().includes(tag.toLowerCase())) {
          matchedTag = tag;
          break;
        }
      }

      if (matchedTag) {
        matchCount++;
        // 高亮视觉标记
        card.style.outline = `2px solid ${portal.themeColor}`;
        card.style.boxShadow = `0 0 16px rgba(0, 242, 254, 0.3)`;
        card.style.borderRadius = '8px';
        card.style.transition = 'all 0.3s ease';

        // 注入高亮标签
        if (!card.querySelector('.ziaver-radar-badge')) {
          const badge = document.createElement('div');
          badge.className = 'ziaver-radar-badge';
          badge.style.cssText = `
            display: inline-block;
            background: linear-gradient(135deg, ${portal.themeColor} 0%, #3b82f6 100%);
            color: #0b0f19;
            font-size: 11px;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 4px;
            margin-right: 6px;
            vertical-align: middle;
          `;
          badge.textContent = `★ 命中: ${matchedTag}`;
          if (titleEl) {
            titleEl.prepend(badge);
          } else {
            card.prepend(badge);
          }
        }

        matchedJobsOnPage.push({
          title: title.slice(0, 30),
          url: linkUrl,
          matchedTag: matchedTag
        });
      }
    });

    return { total: totalCardsFound, matched: matchCount, jobs: matchedJobsOnPage };
  }

  // ================= 5. 大厂网申防误投安全锁 (Safe-Submit Lock) =================
  function setupSafeSubmitLock(portal, shadowRoot) {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a, input[type="submit"]');
      if (!target) return;

      const text = (target.textContent || target.value || '').trim();
      const isSubmitBtn = /提交申请|确认提交|提交网申|确认投递|立即投递|submit\s*application/i.test(text);

      if (isSubmitBtn && !target.dataset.ziaverConfirmed) {
        e.preventDefault();
        e.stopPropagation();

        // 弹出安全确认锁弹窗
        const pageTitle = document.title || '当前岗位';
        const confirmMsg = `⚠️【大厂投递名额保护提醒】\n\n您正在准备提交「${portal.name}」的网申！\n多数大厂同一招聘季严格限制仅能投递 1~2 个岗位，投递后将占用您的珍贵名额。\n\n当前页面：${pageTitle.slice(0, 40)}\n\n确定要正式提交这份网申吗？`;
        
        if (window.confirm(confirmMsg)) {
          target.dataset.ziaverConfirmed = 'true';
          
          // 写入投递记录到 Excel 数据库
          chrome.runtime.sendMessage({
            type: 'APPLY_LOG',
            data: {
              platform: portal.name,
              company: portal.name.split(' ')[0],
              title: pageTitle.slice(0, 30),
              salary: '官网网申',
              matchedTag: '大厂直投',
              greeting: portal.highlightPitch.slice(0, 60),
              status: '已投递网申'
            }
          });

          // 触发原本提交事件
          target.click();
        }
      }
    }, true);
  }

  // ================= 6. ATS Co-Pilot 巡航控制坞 (Shadow DOM) =================
  function createATSCopilot() {
    if (document.getElementById('ziaver-ats-dock')) return;

    const portal = getCurrentPortal();

    const dock = document.createElement('div');
    dock.id = 'ziaver-ats-dock';
    dock.style.cssText = `
      position: fixed;
      top: 90px;
      right: 20px;
      z-index: 99999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
    `;

    const shadow = dock.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .ats-panel {
        width: 336px;
        background: rgba(15, 23, 42, 0.96);
        backdrop-filter: blur(18px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 24px rgba(0, 242, 254, 0.12);
        color: #e2e8f0;
        overflow: hidden;
        transition: all 0.25s ease;
      }
      .ats-header {
        padding: 12px 16px;
        background: ${portal.bgColor};
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ats-title {
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ats-badge {
        font-size: 10.5px;
        padding: 2px 8px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.15);
        color: ${portal.themeColor};
        font-weight: 600;
      }
      .ats-body {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 11px;
        max-height: 520px;
        overflow-y: auto;
      }
      .radar-card {
        background: rgba(0, 242, 254, 0.05);
        border: 1px solid rgba(0, 242, 254, 0.2);
        border-radius: 9px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .radar-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .radar-title {
        font-size: 12px;
        font-weight: 700;
        color: ${portal.themeColor};
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .radar-stats {
        font-size: 11px;
        color: #cbd5e1;
      }
      .radar-btn-group {
        display: flex;
        gap: 6px;
      }
      .btn-mini {
        flex: 1;
        padding: 6px 8px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: rgba(255, 255, 255, 0.08);
        color: #fff;
        cursor: pointer;
        transition: all 0.15s;
        text-align: center;
      }
      .btn-mini:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: ${portal.themeColor};
      }
      .btn-mini.primary {
        background: linear-gradient(135deg, ${portal.themeColor} 0%, #3b82f6 100%);
        color: #0b0f19;
        font-weight: 700;
        border: none;
      }
      .quick-btn {
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: none;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        background: linear-gradient(135deg, ${portal.themeColor} 0%, #3b82f6 100%);
        color: #0b0f19;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
        transition: transform 0.15s;
      }
      .quick-btn:hover { transform: translateY(-1px); }
      .section-label {
        font-size: 10.5px;
        color: #94a3b8;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .snippet-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 9px 10px;
        cursor: pointer;
        transition: all 0.2s;
        position: relative;
      }
      .snippet-card:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: ${portal.themeColor};
      }
      .snippet-title {
        font-size: 11px;
        font-weight: 700;
        color: ${portal.themeColor};
        display: flex;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .snippet-text {
        font-size: 11px;
        color: #cbd5e1;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .copy-hint {
        font-size: 10px;
        color: #64748b;
      }
      .toast {
        position: absolute;
        bottom: 12px;
        left: 50%;
        transform: translateX(-50%);
        background: #10b981;
        color: #fff;
        padding: 5px 12px;
        border-radius: 14px;
        font-size: 11px;
        display: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        z-index: 100;
      }
    `;

    const isCampus = /campus|join\.qq\.com|校招|应届|校园招聘/i.test(location.href);
    const badgeTitle = isCampus ? `🎓 ${portal.name} · 校招应届` : portal.name;

    const content = document.createElement('div');
    content.innerHTML = `
      <div class="ats-panel">
        <div class="ats-header">
          <div class="ats-title">
            <span>⚡ 大厂巡航副驾驶</span>
          </div>
          <span class="ats-badge">${badgeTitle}</span>
        </div>
        <div class="ats-body">
          <!-- 职位雷达扫描卡片 -->
          <div class="radar-card" id="radar-box">
            <div class="radar-title-row">
              <div class="radar-title">
                <span>🛰️ 列表雷达巡航</span>
              </div>
              <span class="radar-stats" id="radar-stats-text">正在探测岗位...</span>
            </div>
            <div class="radar-btn-group">
              <button class="btn-mini primary" id="btn-radar-batch-open" title="批量打开当前页面命中的高契合度岗位">
                <span>🚀 批量打开命中 (<span id="radar-matched-count">0</span>)</span>
              </button>
              <button class="btn-mini" id="btn-radar-rescan">
                <span>🔍 刷新雷达</span>
              </button>
            </div>
          </div>

          <!-- 网申表单自动推进 -->
          <button class="quick-btn" id="btn-autofill">
            <span>✨ 一键自动填入表单</span>
          </button>

          <div class="section-label">针对该大厂的核心亮点文案 (点击即复制)</div>
          
          <div class="snippet-card" data-copy="${portal.highlightPitch}">
            <div class="snippet-title">
              <span>🎯 真诚干练自荐文案</span>
              <span class="copy-hint">点击复制</span>
            </div>
            <div class="snippet-text">${portal.highlightPitch}</div>
          </div>

          <div class="snippet-card" data-copy="${portal.projectSnippet}">
            <div class="snippet-title">
              <span>💼 核心项目与优势摘要</span>
              <span class="copy-hint">点击复制</span>
            </div>
            <div class="snippet-text">${portal.projectSnippet}</div>
          </div>

          <div class="section-label">个人高频信息 (点击即复制)</div>

          <div class="snippet-card" data-copy="${CANDIDATE.portfolioUrl}">
            <div class="snippet-title">
              <span>🌐 3D互动作品集链接</span>
              <span class="copy-hint">点击复制</span>
            </div>
            <div class="snippet-text">${CANDIDATE.portfolioUrl}</div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <div class="snippet-card" data-copy="${CANDIDATE.name}">
              <div class="snippet-title">姓名</div>
              <div class="snippet-text">${CANDIDATE.name}</div>
            </div>
            <div class="snippet-card" data-copy="${CANDIDATE.phone}">
              <div class="snippet-title">手机</div>
              <div class="snippet-text">${CANDIDATE.phone}</div>
            </div>
            <div class="snippet-card" data-copy="${CANDIDATE.wechat}">
              <div class="snippet-title">微信</div>
              <div class="snippet-text">${CANDIDATE.wechat}</div>
            </div>
            <div class="snippet-card" data-copy="${CANDIDATE.email}">
              <div class="snippet-title">邮箱</div>
              <div class="snippet-text">${CANDIDATE.email}</div>
            </div>
            <div class="snippet-card" data-copy="${CANDIDATE.school}">
              <div class="snippet-title">院校</div>
              <div class="snippet-text">${CANDIDATE.school} (24届)</div>
            </div>
            <div class="snippet-card" data-copy="${CANDIDATE.resumeUrl}">
              <div class="snippet-title">简历直链</div>
              <div class="snippet-text">PDF直链</div>
            </div>
          </div>
        </div>
        <div class="toast" id="ats-toast">✓ 已复制到剪贴板</div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(content);
    document.body.appendChild(dock);

    // 绑定事件与逻辑
    const toast = shadow.getElementById('ats-toast');
    const showToast = (msg) => {
      toast.textContent = msg || '✓ 已复制到剪贴板';
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 1800);
    };

    // 表单填充
    shadow.getElementById('btn-autofill').addEventListener('click', () => {
      const count = autoFillCurrentPage(portal);
      showToast(`✨ 成功探测并填入 ${count} 个字段！`);
    });

    // 复制文案卡片
    shadow.querySelectorAll('.snippet-card').forEach(card => {
      card.addEventListener('click', () => {
        const text = card.getAttribute('data-copy');
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('✓ 已复制到剪贴板');
          });
        }
      });
    });

    // 雷达扫描执行函数
    const runRadarScan = () => {
      const res = scanJobList(portal);
      const statsEl = shadow.getElementById('radar-stats-text');
      const countEl = shadow.getElementById('radar-matched-count');
      
      if (statsEl) {
        if (res.total > 0) {
          statsEl.textContent = `扫描 ${res.total} 个，命中 ${res.matched} 个！`;
        } else {
          statsEl.textContent = `当前处于详情/网申页`;
        }
      }
      if (countEl) {
        countEl.textContent = res.matched;
      }
    };

    // 批量在新标签页打开命中岗位
    shadow.getElementById('btn-radar-batch-open').addEventListener('click', () => {
      const validUrls = matchedJobsOnPage.map(j => j.url).filter(Boolean);
      if (validUrls.length === 0) {
        showToast('⚠️ 当前列表未探测到带链接的命中岗位');
        return;
      }
      chrome.runtime.sendMessage({
        type: 'BATCH_OPEN_PAGES',
        urls: validUrls
      }, (res) => {
        showToast(`🚀 已在后台平滑打开 ${validUrls.length} 个岗位！`);
      });
    });

    shadow.getElementById('btn-radar-rescan').addEventListener('click', () => {
      runRadarScan();
      showToast('🔍 雷达已重新扫描本页！');
    });

    // 初始运行雷达扫描
    setTimeout(runRadarScan, 1500);
    // 监听DOM变动，翻页后自动扫描
    let scanTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(runRadarScan, 1200);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // 启用大厂投递名额安全锁
    setupSafeSubmitLock(portal, shadow);
  }

  // 页面加载完成后注入
  loadStorageData(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createATSCopilot);
    } else {
      createATSCopilot();
    }
  });
})();
