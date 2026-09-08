// JobCruise 求职自动化助手 - Background Service Worker v2.3 (Manifest V3)

const DEFAULT_JOB_TAGS = [
  // 1. 电商/达人赛道 (17个)
  { id: 'tag_1', category: '电商/达人', name: '达人运营', active: true },
  { id: 'tag_2', category: '电商/达人', name: '电商运营', active: true },
  { id: 'tag_3', category: '电商/达人', name: '千川投放', active: true },
  { id: 'tag_4', category: '电商/达人', name: '直播运营', active: true },
  { id: 'tag_5', category: '电商/达人', name: '达播BD', active: true },
  { id: 'tag_6', category: '电商/达人', name: '店铺运营', active: true },
  { id: 'tag_7', category: '电商/达人', name: '流量增长', active: true },
  { id: 'tag_8', category: '电商/达人', name: 'KOL运营', active: true },
  { id: 'tag_9', category: '电商/达人', name: 'KOC运营', active: true },
  { id: 'tag_10', category: '电商/达人', name: '达人拓展', active: true },
  { id: 'tag_11', category: '电商/达人', name: '主播运营', active: true },
  { id: 'tag_12', category: '电商/达人', name: '直播间运营', active: true },
  { id: 'tag_13', category: '电商/达人', name: '巨量千川', active: true },
  { id: 'tag_14', category: '电商/达人', name: '信息流投放', active: true },
  { id: 'tag_15', category: '电商/达人', name: '商家运营', active: true },
  { id: 'tag_16', category: '电商/达人', name: '选品运营', active: true },
  { id: 'tag_17', category: '电商/达人', name: 'TikTok运营', active: true },

  // 2. 游戏/社区赛道 (17个)
  { id: 'tag_18', category: '游戏/社区', name: '游戏运营', active: true },
  { id: 'tag_19', category: '游戏/社区', name: '游戏社区', active: true },
  { id: 'tag_20', category: '游戏/社区', name: '玩家运营', active: true },
  { id: 'tag_21', category: '游戏/社区', name: '电竞赛事', active: true },
  { id: 'tag_22', category: '游戏/社区', name: '游戏策划', active: true },
  { id: 'tag_23', category: '游戏/社区', name: '社群运营', active: true },
  { id: 'tag_24', category: '游戏/社区', name: '游戏发行', active: true },
  { id: 'tag_25', category: '游戏/社区', name: '游戏活动运营', active: true },
  { id: 'tag_26', category: '游戏/社区', name: '版本运营', active: true },
  { id: 'tag_27', category: '游戏/社区', name: '游戏商业化', active: true },
  { id: 'tag_28', category: '游戏/社区', name: '核心玩家生态', active: true },
  { id: 'tag_29', category: '游戏/社区', name: '游戏创作者生态', active: true },
  { id: 'tag_30', category: '游戏/社区', name: '游戏二创运营', active: true },
  { id: 'tag_31', category: '游戏/社区', name: '二次元游戏', active: true },
  { id: 'tag_32', category: '游戏/社区', name: '电竞运营', active: true },
  { id: 'tag_33', category: '游戏/社区', name: '海外游戏社区', active: true },
  { id: 'tag_34', category: '游戏/社区', name: 'TapTap运营', active: true },

  // 3. 影像/视觉赛道 (17个)
  { id: 'tag_35', category: '影像/视觉', name: '商业摄影', active: true },
  { id: 'tag_36', category: '影像/视觉', name: '视频编导', active: true },
  { id: 'tag_37', category: '影像/视觉', name: '视觉策划', active: true },
  { id: 'tag_38', category: '影像/视觉', name: '数码影像', active: true },
  { id: 'tag_39', category: '影像/视觉', name: '内容运营', active: true },
  { id: 'tag_40', category: '影像/视觉', name: '短视频运营', active: true },
  { id: 'tag_41', category: '影像/视觉', name: '商业摄影师', active: true },
  { id: 'tag_42', category: '影像/视觉', name: '产品摄影', active: true },
  { id: 'tag_43', category: '影像/视觉', name: '静物摄影', active: true },
  { id: 'tag_44', category: '影像/视觉', name: '人像摄影', active: true },
  { id: 'tag_45', category: '影像/视觉', name: '修图师', active: true },
  { id: 'tag_46', category: '影像/视觉', name: '调色师', active: true },
  { id: 'tag_47', category: '影像/视觉', name: '视频剪辑', active: true },
  { id: 'tag_48', category: '影像/视觉', name: '短视频编导', active: true },
  { id: 'tag_49', category: '影像/视觉', name: '美术策划', active: true },
  { id: 'tag_50', category: '影像/视觉', name: '3D视觉', active: true },
  { id: 'tag_51', category: '影像/视觉', name: 'AIGC内容', active: true },

  // 4. 音乐/音频赛道 (8个)
  { id: 'tag_52', category: '音乐/音频', name: '音乐运营', active: true },
  { id: 'tag_53', category: '音乐/音频', name: '音频内容', active: true },
  { id: 'tag_54', category: '音乐/音频', name: '汽水音乐', active: true },
  { id: 'tag_55', category: '音乐/音频', name: '音乐版权运营', active: true },
  { id: 'tag_56', category: '音乐/音频', name: '音乐宣发', active: true },
  { id: 'tag_57', category: '音乐/音频', name: '音乐企划', active: true },
  { id: 'tag_58', category: '音乐/音频', name: '流媒体运营', active: true },
  { id: 'tag_59', category: '音乐/音频', name: '播客运营', active: true },

  // 5. 综合/市场赛道 (10个)
  { id: 'tag_60', category: '综合/市场', name: '综合运营', active: true },
  { id: 'tag_61', category: '综合/市场', name: '品牌市场', active: true },
  { id: 'tag_62', category: '综合/市场', name: '活动策划', active: true },
  { id: 'tag_63', category: '综合/市场', name: '新媒体运营', active: true },
  { id: 'tag_64', category: '综合/市场', name: '用户运营', active: true },
  { id: 'tag_65', category: '综合/市场', name: '用户增长', active: true },
  { id: 'tag_66', category: '综合/市场', name: '内容营销', active: true },
  { id: 'tag_67', category: '综合/市场', name: '整合营销', active: true },
  { id: 'tag_68', category: '综合/市场', name: 'KOL媒介投放', active: true },
  { id: 'tag_69', category: '综合/市场', name: '品牌公关', active: true }
];

const DEFAULT_GREETING = '您好！看到咱们在招「{jobTitle}」，感觉整体要求跟我还蛮匹配的。我有相关业务实战经验，执行力强、看重数据和实际业务落地。简历在附件中，如果合适随时沟通交流，祝您工作顺利、天天开心～';

// ================= 本地日历日期工具函数 (严谨适配时区，杜绝 UTC 导致早晨日期滞后) =================
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
  if (slot === 'morning') return '上午时段 (06:00-12:00)';
  if (slot === 'afternoon') return '下午时段 (12:00-18:00)';
  return '晚上时段 (18:00-24:00)';
}

// 广播消息至所有激活标签页 (HUD 与 Dashboard 即时无感同步)
function broadcastToAllTabs(message) {
  if (!chrome.tabs || !chrome.tabs.query) return;
  chrome.tabs.query({}, (tabs) => {
    if (chrome.runtime.lastError || !tabs) return;
    tabs.forEach(tab => {
      try {
        chrome.tabs.sendMessage(tab.id, message, () => {
          if (chrome.runtime.lastError) {
            // 忽略未注入 content script 的系统或空标签
          }
        });
      } catch (e) {}
    });
  });
}

function initOrUpdateStorage() {
  chrome.storage.local.get(['config', 'jobTags', 'applyLog', 'keyCompanies'], (res) => {
    const today = getLocalDateStr();
    const initialConfig = {
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
      gradMonth: '9',
      enableCampus2024Protection: true,
      audioAlert: true,
      desktopNotification: true,
      hrAlertCooldownMinutes: 5,
      blacklistKeywords: '外包,单休,大小周,电话销售,无底薪,客服,劳务派遣,培训生',
      enableDynamicGreeting: true,
      useCustomGreeting: true,
      customGreetingTemplate: DEFAULT_GREETING,
      lastActiveDate: today,
      todayCount: 0,
      siteTodayCounts: { boss: 0, liepin: 0, lagou: 0, ats: 0 }
    };

    const updates = {};

    // 1. 配置项智能合并
    if (!res.config) {
      updates.config = initialConfig;
    } else {
      const mergedConfig = { ...initialConfig, ...res.config };
      if (mergedConfig.targetCity === undefined) mergedConfig.targetCity = '深圳';
      if (mergedConfig.strictCityFilter === undefined) mergedConfig.strictCityFilter = true;
      if (mergedConfig.gradYear === undefined) mergedConfig.gradYear = '2024';
      if (mergedConfig.enableCampus2024Protection === undefined) mergedConfig.enableCampus2024Protection = true;
      if (mergedConfig.hrAlertCooldownMinutes === undefined) mergedConfig.hrAlertCooldownMinutes = 5;
      if (mergedConfig.acceptAllInPageFilter === undefined) mergedConfig.acceptAllInPageFilter = true;
      if (!mergedConfig.timeSlotLimits) {
        mergedConfig.timeSlotLimits = { morning: 20, afternoon: 30, evening: 20 };
      }
      if (!mergedConfig.timeSlotCounts) {
        mergedConfig.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
      }

      if (mergedConfig.lastActiveDate !== today) {
        console.log(`[ZIAVER Autopilot] 存储初始化检测到新的一天: 上次活跃「${mergedConfig.lastActiveDate || '无'}」-> 今日「${today}」，执行清零`);
        mergedConfig.lastActiveDate = today;
        mergedConfig.todayCount = 0;
        mergedConfig.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
        mergedConfig.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
      } else if (!mergedConfig.siteTodayCounts) {
        mergedConfig.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
      }
      // 若尚未设置过话术，赋默认新风格
      if (!res.config.customGreetingTemplate) {
        mergedConfig.customGreetingTemplate = DEFAULT_GREETING;
        mergedConfig.useCustomGreeting = true;
      }
      updates.config = mergedConfig;
    }

    // 2. 词条库无损增量合并
    if (!res.jobTags || res.jobTags.length === 0) {
      updates.jobTags = DEFAULT_JOB_TAGS;
    } else {
      const existingNames = new Set(res.jobTags.map(t => (t.name || '').trim().toLowerCase()));
      const newTagsToAdd = DEFAULT_JOB_TAGS.filter(t => !existingNames.has((t.name || '').trim().toLowerCase()));
      if (newTagsToAdd.length > 0) {
        updates.jobTags = [...res.jobTags, ...newTagsToAdd];
        console.log(`[ZIAVER Autopilot] 词库增量合并已追加 ${newTagsToAdd.length} 个新词条`);
      }
    }

    // 3. 投递日志保护
    if (!res.applyLog) {
      updates.applyLog = [];
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log('[ZIAVER Autopilot] 插件存储状态已无损更新 (当前日期:', today, ')');
      });
    }
  });
}

let cachedConfig = null;

// 监听 storage 变动实时更新 cachedConfig
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.config) {
      cachedConfig = changes.config.newValue;
    }
  });
}

// ================= 跨日自动感应检测与每日情报强提醒 (Live Time Sensor) =================
function checkAndPerformDailyRollover(triggerSource = '自动') {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  const today = getLocalDateStr();

  chrome.storage.local.get(['config', 'lastDailyDigestDate'], (res) => {
    let config = res.config || {};
    cachedConfig = config;
    let configChanged = false;

    if (config.lastActiveDate !== today) {
      console.log(`[ZIAVER Autopilot] 自动检测到跨日变更 (${triggerSource}): 上次日期「${config.lastActiveDate || '无'}」-> 今日「${today}」，正在自动重置今日计数！`);
      config.lastActiveDate = today;
      config.todayCount = 0;
      config.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
      config.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
      configChanged = true;
    }

    const updates = {};
    if (configChanged) {
      updates.config = config;
    }

    // 检查是否需要触发今日求职情报强提醒
    const needDigest = !res.lastDailyDigestDate || res.lastDailyDigestDate !== today;
    if (needDigest) {
      updates.lastDailyDigestDate = today;
      setTimeout(() => {
        if (chrome.notifications) {
          chrome.notifications.create('daily_job_digest_' + Date.now(), {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
            title: '🌅 今日全网求职情报已就绪！',
            message: '已为您精选公众号名企直聘、大厂招聘官网与社群内推优质岗位（电商/游戏/视觉运营 · 深圳特选），点击一键查看！',
            priority: 2,
            requireInteraction: true
          });
        }
      }, 2000);
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates, () => {
        console.log(`[ZIAVER Autopilot] 跨日数据与今日情报状态已持久化更新 (${today})`);
        broadcastToAllTabs({
          type: 'DATE_CHANGED',
          today: today,
          config: config
        });
      });
    }
  });
}

// 保持旧接口兼容
function checkDailyJobDigest() {
  checkAndPerformDailyRollover('主动检测');
}

// 1. 生命周期挂载
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ZIAVER Autopilot] 插件安装/更新');
  initOrUpdateStorage();
  checkAndPerformDailyRollover('安装/更新');
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[ZIAVER Autopilot] 浏览器冷启动检查');
  initOrUpdateStorage();
  checkAndPerformDailyRollover('浏览器冷启动');
});

// 2. 创建 Chrome 闹钟进行 5 分钟定时心跳探测（即使用户过夜不关浏览器也能准时跨日刷新）
if (chrome.alarms) {
  try {
    chrome.alarms.create('check_daily_date_and_digest', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'check_daily_date_and_digest') {
        checkAndPerformDailyRollover('定时心跳');
      }
    });
  } catch (e) {
    console.warn('[ZIAVER Autopilot] 创建 alarms 异常:', e);
  }
}

// 3. 用户早晨回到浏览器时的实时感知（聚焦/激活标签瞬间）
if (chrome.windows && chrome.windows.onFocusChanged) {
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
      checkAndPerformDailyRollover('窗口聚焦');
    }
  });
}

if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener(() => {
    checkAndPerformDailyRollover('标签切换');
  });
}

// 4. Service Worker 唤醒时立即执行一次增量同步检查
initOrUpdateStorage();
checkAndPerformDailyRollover('ServiceWorker唤醒');

// ================= 全网多平台流水线巡航调度中心 (Pipeline Engine) =================
const PIPELINE_SITES = [
  {
    id: 'boss',
    name: 'BOSS直聘',
    url: 'https://www.zhipin.com/web/geek/job?city=101280600',
    matchUrl: '*://*.zhipin.com/*'
  },
  {
    id: 'liepin',
    name: '猎聘网',
    url: 'https://www.liepin.com/zhaopin/?city=050090&salary=10$15&workYearCode=1',
    matchUrl: '*://*.liepin.com/*'
  },
  {
    id: 'lagou',
    name: '拉勾招聘',
    url: 'https://www.lagou.com/wn/jobs?city=%E6%B7%B1%E5%9C%B3',
    matchUrl: '*://*.lagou.com/*'
  }
];

let cruisePipeline = {
  isActive: false,
  perSiteTarget: 30,
  currentIndex: 0,
  currentSiteCount: 0,
  activeTabId: null,
  siteStats: {},
  siteSkipped: {}
};

// 获取详尽的全网流水线协同状态 (与早中晚分时段深度对齐)
function getDetailedPipelineStatus() {
  const currentSite = PIPELINE_SITES[cruisePipeline.currentIndex] || null;
  const totalSites = PIPELINE_SITES.length;
  const targetPerSite = cruisePipeline.perSiteTarget || 30;
  const overallTarget = totalSites * targetPerSite;

  const cfg = cachedConfig || {};
  const slot = getCurrentTimeSlot();
  const slotLimits = cfg.timeSlotLimits || { morning: 20, afternoon: 30, evening: 20 };
  const slotCounts = cfg.timeSlotCounts || { morning: 0, afternoon: 0, evening: 0 };
  const slotLimit = slotLimits[slot] !== undefined ? slotLimits[slot] : 20;
  const slotCount = slotCounts[slot] || 0;
  const slotRemaining = Math.max(0, slotLimit - slotCount);
  const slotPercent = slotLimit > 0 ? Math.min(100, Math.round((slotCount / slotLimit) * 100)) : 0;

  let totalDone = 0;
  const sitesStatus = PIPELINE_SITES.map((s, idx) => {
    let done = 0;
    if (idx === cruisePipeline.currentIndex) {
      done = cruisePipeline.currentSiteCount || 0;
    } else {
      done = cruisePipeline.siteStats[s.id] || 0;
    }
    totalDone += done;
    return {
      id: s.id,
      name: s.name,
      done,
      target: targetPerSite,
      isCurrent: idx === cruisePipeline.currentIndex,
      isPassed: idx < cruisePipeline.currentIndex,
      isFuture: idx > cruisePipeline.currentIndex,
      skipped: (cruisePipeline.siteSkipped && cruisePipeline.siteSkipped[s.id]) || null
    };
  });

  const overallPercent = overallTarget > 0 ? Math.min(Math.round((totalDone / overallTarget) * 100), 100) : 0;

  return {
    isActive: cruisePipeline.isActive,
    perSiteTarget: targetPerSite,
    currentIndex: cruisePipeline.currentIndex,
    currentSiteCount: cruisePipeline.currentSiteCount,
    currentSite,
    totalDone,
    overallTarget,
    overallPercent,
    timeSlot: {
      slot,
      slotDisplayName: getTimeSlotDisplayName(slot),
      slotLimit,
      slotCount,
      slotRemaining,
      slotPercent
    },
    sites: PIPELINE_SITES,
    siteStats: cruisePipeline.siteStats,
    siteSkipped: cruisePipeline.siteSkipped,
    sitesStatus
  };
}

// 扩展图标 Badge 徽章实时进度同步
function updateExtensionBadge() {
  if (!chrome.action) return;
  if (!cruisePipeline.isActive) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const status = getDetailedPipelineStatus();
  chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' }); // 优雅炫彩紫
  chrome.action.setBadgeText({ text: `${status.overallPercent}%` });
}

// 广播全网流水线状态至所有标签页 (驱动各网页右下角 HUD 实时更新)
function broadcastPipelineStatus() {
  const payload = getDetailedPipelineStatus();
  chrome.tabs.query({}, (tabs) => {
    if (!tabs) return;
    tabs.forEach(t => {
      chrome.tabs.sendMessage(t.id, {
        type: 'PIPELINE_BROADCAST_STATUS',
        status: payload
      }, () => {
        if (chrome.runtime.lastError) { /* 忽略离线页面 */ }
      });
    });
  });
}

function startCruisePipeline(perSiteTarget = 'follow_slot') {
  chrome.storage.local.get(['config', 'savedBossFilters'], (res) => {
    const config = res.config || {};
    cachedConfig = config;

    const slot = getCurrentTimeSlot();
    const slotLimits = config.timeSlotLimits || { morning: 20, afternoon: 30, evening: 20 };
    const slotCounts = config.timeSlotCounts || { morning: 0, afternoon: 0, evening: 0 };
    const slotLimit = slotLimits[slot] !== undefined ? slotLimits[slot] : 20;
    const slotCount = slotCounts[slot] || 0;
    const slotRemaining = Math.max(0, slotLimit - slotCount);

    let effectiveTarget = 20;
    if (perSiteTarget === 'follow_slot' || perSiteTarget === 'follow_limit') {
      // 深度对齐当前时段！若当前时段尚有剩余额度，以剩余额度为准；若已达成，以本时段上限为准
      effectiveTarget = slotRemaining > 0 ? slotRemaining : slotLimit;
    } else if (Number(perSiteTarget) > 0) {
      effectiveTarget = Number(perSiteTarget);
    }

    cruisePipeline.isActive = true;
    cruisePipeline.perSiteTarget = effectiveTarget;
    cruisePipeline.currentIndex = 0;
    cruisePipeline.currentSiteCount = 0;
    cruisePipeline.siteStats = {};
    cruisePipeline.siteSkipped = {};
    cruisePipeline.slot = slot;
    cruisePipeline.slotLimit = slotLimit;

    updateExtensionBadge();
    broadcastPipelineStatus();

    const slotName = getTimeSlotDisplayName(slot);
    chrome.notifications.create('pipeline_start_' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
      title: `🚀 全网巡航已开启 (对齐 ${slotName})`,
      message: `目标: 本时段巡航 ${effectiveTarget} 个高契合岗位 (当前时段已投: ${slotCount}/${slotLimit})。首站：【${PIPELINE_SITES[0].name}】`,
      priority: 2
    });

    launchCurrentPipelineSite();
  });
}

function stopCruisePipeline() {
  cruisePipeline.isActive = false;
  updateExtensionBadge();
  broadcastPipelineStatus();

  // 广播停止指令至所有页面
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(t => {
      chrome.tabs.sendMessage(t.id, { type: 'STOP_CRUISE_PIPELINE' }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    });
  });

  chrome.notifications.create('pipeline_stop_' + Date.now(), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
    title: '🛑 全网流水线巡航已终止',
    message: '已向各网页发送停止指令，所有自动操作已安全退出。',
    priority: 1
  });
}

function launchCurrentPipelineSite() {
  if (!cruisePipeline.isActive) return;

  if (cruisePipeline.currentIndex >= PIPELINE_SITES.length) {
    finishEntirePipeline();
    return;
  }

  const currentSite = PIPELINE_SITES[cruisePipeline.currentIndex];
  cruisePipeline.currentSiteCount = 0;

  chrome.storage.local.get(['jobTags', 'savedBossFilters'], (res) => {
    const rawTags = (res && res.jobTags) || DEFAULT_JOB_TAGS;
    const activeTags = rawTags.filter(t => t.active).map(t => (t.name || '').trim()).filter(Boolean);
    const firstTag = activeTags.length > 0 ? activeTags[0] : '';

    let siteUrl = currentSite.url;
    if (currentSite.id === 'boss') {
      const savedBoss = res.savedBossFilters;
      if (savedBoss && savedBoss.url && savedBoss.url.includes('zhipin.com')) {
        siteUrl = savedBoss.url;
        console.log('[ZIAVER Pipeline] 🎯 采用已保存的 BOSS 网页筛选参数自动启动:', siteUrl);
      }
    } else if (currentSite.id === 'liepin') {
      // 猎聘优先附带深圳、10-15万、1年以内精准筛选参数
      const lpParams = 'city=050090&salary=10$15&workYearCode=1';
      if (firstTag) {
        siteUrl = `https://www.liepin.com/zhaopin/?${lpParams}&key=${encodeURIComponent(firstTag)}`;
      } else {
        siteUrl = `https://www.liepin.com/zhaopin/?${lpParams}`;
      }
    } else if (currentSite.id === 'lagou') {
      if (firstTag) {
        siteUrl = `https://www.lagou.com/wn/jobs?kd=${encodeURIComponent(firstTag)}&city=%E6%B7%B1%E5%9C%B3`;
      }
    }

    updateExtensionBadge();
    broadcastPipelineStatus();

    chrome.notifications.create('site_switch_' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
      title: `🌐 巡航切换：第 ${cruisePipeline.currentIndex + 1}/${PIPELINE_SITES.length} 站【${currentSite.name}】`,
      message: `正在自动打开或聚焦 ${currentSite.name}${firstTag ? ` (首选检索词: ${firstTag})` : ''}，并启动定向高亮匹配巡航...`,
      priority: 2
    });

    openOrSwitchToSite(siteUrl, currentSite.matchUrl, (tabId) => {
      cruisePipeline.activeTabId = tabId;
      // 页面完全就绪后下发启动巡航指令
      sendPipelineMessageWithRetry(tabId, {
        type: 'START_PIPELINE_RUN',
        target: cruisePipeline.perSiteTarget,
        siteId: currentSite.id,
        activeTags: activeTags,
        currentTagIndex: 0
      }, 4);
    });
  });
}

function openOrSwitchToSite(url, matchUrl, callback) {
  chrome.tabs.query({}, (allTabs) => {
    let targetTab = null;
    let domain = '';
    try {
      domain = new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
      domain = matchUrl.replace(/[\*\:\/]/g, '').replace('www.', '');
    }

    if (allTabs && allTabs.length > 0) {
      targetTab = allTabs.find(t => t.url && domain && t.url.includes(domain));
    }

    if (targetTab) {
      // 聚焦目标标签页所在窗口
      if (targetTab.windowId) {
        chrome.windows.update(targetTab.windowId, { focused: true, state: 'normal' }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }

      chrome.tabs.update(targetTab.id, { active: true }, () => {
        // 先用 PING 探针测试目标标签页的 Content Script 是否存活响应
        chrome.tabs.sendMessage(targetTab.id, { type: 'PING' }, (pong) => {
          if (chrome.runtime.lastError || !pong) {
            // Content Script 离线或扩展刚更新重载导致上下文失效，强制导航/重载并等待就绪
            console.log(`[ZIAVER] 目标标签页 ${domain} 通信未响应，执行重载激活...`);
            chrome.tabs.update(targetTab.id, { url: url }, (updatedTab) => {
              const tid = (updatedTab && updatedTab.id) || targetTab.id;
              waitForPageLoad(tid, callback);
            });
          } else {
            // Content Script 存活正常
            const isJobPage = targetTab.url && (
              targetTab.url.includes('/web/geek/job') ||
              targetTab.url.includes('/zhaopin') ||
              targetTab.url.includes('/wn/jobs')
            );

            // 若已有标签页但未带精准搜索词(如猎聘/拉勾无key/kd)，更新至目标检索URL
            const needsSearchKeyword = (url.includes('key=') && !targetTab.url.includes('key=')) ||
                                       (url.includes('kd=') && !targetTab.url.includes('kd='));

            if (isJobPage && !needsSearchKeyword) {
              setTimeout(() => {
                callback(targetTab.id);
              }, 1200);
            } else {
              chrome.tabs.update(targetTab.id, { url: url }, (updatedTab) => {
                const tid = (updatedTab && updatedTab.id) || targetTab.id;
                waitForPageLoad(tid, callback);
              });
            }
          }
        });
      });
    } else {
      // 标签页不存在，新建并等待加载完成
      chrome.tabs.create({ url, active: true }, (newTab) => {
        if (newTab && newTab.windowId) {
          chrome.windows.update(newTab.windowId, { focused: true, state: 'normal' }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }
        waitForPageLoad(newTab.id, callback);
      });
    }
  });
}

function waitForPageLoad(tabId, callback) {
  let finished = false;
  let timerId = null;

  const done = () => {
    if (finished) return;
    finished = true;
    if (timerId) clearTimeout(timerId);
    chrome.tabs.onUpdated.removeListener(listener);
    // 预留 2.5 秒确保页面脚本及 DOM 挂载就绪
    setTimeout(() => {
      callback(tabId);
    }, 2500);
  };

  const listener = (tid, changeInfo) => {
    if (tid === tabId && changeInfo.status === 'complete') {
      done();
    }
  };
  chrome.tabs.onUpdated.addListener(listener);

  // 10 秒兜底超时
  timerId = setTimeout(() => {
    done();
  }, 10000);
}

function sendPipelineMessageWithRetry(tabId, message, retries = 6) {
  if (!cruisePipeline.isActive) return;
  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError || !response) {
      if (retries > 0) {
        setTimeout(() => {
          sendPipelineMessageWithRetry(tabId, message, retries - 1);
        }, 2000);
      } else {
        const currentSite = PIPELINE_SITES[cruisePipeline.currentIndex];
        const siteName = currentSite ? currentSite.name : '当前站点';
        console.warn(`[ZIAVER Autopilot] 页面通信未响应，自动跳过【${siteName}】`);
        if (currentSite) {
          cruisePipeline.siteStats[currentSite.id] = 0;
          cruisePipeline.siteSkipped = cruisePipeline.siteSkipped || {};
          cruisePipeline.siteSkipped[currentSite.id] = '页面通信未响应';
          
          chrome.notifications.create('site_skipped_' + Date.now(), {
            type: 'basic',
            iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
            title: `⚠️【${siteName}】通信未就绪 · 自动跳过`,
            message: `检测到【${siteName}】通信未就绪（请刷新该页面后重试），已自动跳过并切换至下一站...`,
            priority: 2
          });

          cruisePipeline.currentIndex++;
          setTimeout(() => {
            launchCurrentPipelineSite();
          }, 3500);
        }
      }
    } else {
      console.log(`[ZIAVER Autopilot] 成功启动【${message.siteId || '本站'}】巡航:`, response);
    }
  });
}

function finishEntirePipeline() {
  cruisePipeline.isActive = false;

  if (chrome.action) {
    chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    chrome.action.setBadgeText({ text: '✓' });
    setTimeout(() => {
      if (!cruisePipeline.isActive) {
        chrome.action.setBadgeText({ text: '' });
      }
    }, 20000);
  }
  broadcastPipelineStatus();

  let totalCount = 0;
  const breakdown = [];
  Object.keys(cruisePipeline.siteStats).forEach(siteId => {
    const siteObj = PIPELINE_SITES.find(s => s.id === siteId);
    const name = siteObj ? siteObj.name : siteId;
    if (cruisePipeline.siteSkipped && cruisePipeline.siteSkipped[siteId]) {
      breakdown.push(`${name}: 跳过(${cruisePipeline.siteSkipped[siteId]})`);
    } else {
      const count = cruisePipeline.siteStats[siteId] || 0;
      totalCount += count;
      breakdown.push(`${name}: ${count}个`);
    }
  });

  chrome.notifications.create('pipeline_complete_' + Date.now(), {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
    title: '🎉 今日全网巡航大功告成！',
    message: `已自动完成全部目标平台投递！累计精准沟通 ${totalCount} 家企业 (${breakdown.join('，')})。详细记录已全部存入报表！`,
    priority: 2,
    requireInteraction: true
  });
}

// 处理来自各页面的消息通信
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'START_CRUISE_PIPELINE') {
    startCruisePipeline(request.perSiteTarget);
    sendResponse({ status: 'ok', pipeline: cruisePipeline });
    return true;
  } else if (request.type === 'STOP_CRUISE_PIPELINE') {
    stopCruisePipeline();
    sendResponse({ status: 'ok' });
    return true;
  } else if (request.type === 'GET_PIPELINE_STATUS') {
    sendResponse(getDetailedPipelineStatus());
    return true;
  } else if (request.type === 'PIPELINE_SITE_PROGRESS') {
    cruisePipeline.currentSiteCount = request.count || 0;
    if (request.site) {
      cruisePipeline.siteStats[request.site] = request.count;
    }
    updateExtensionBadge();
    broadcastPipelineStatus();
    sendResponse({ status: 'ok' });
    return true;
  } else if (request.type === 'PIPELINE_SITE_SKIPPED') {
    const skippedSiteId = request.site;
    const reason = request.reason || '未登录';
    cruisePipeline.siteStats[skippedSiteId] = 0;
    cruisePipeline.siteSkipped = cruisePipeline.siteSkipped || {};
    cruisePipeline.siteSkipped[skippedSiteId] = reason;

    updateExtensionBadge();
    broadcastPipelineStatus();

    const finishedSiteObj = PIPELINE_SITES.find(s => s.id === skippedSiteId);
    const siteName = finishedSiteObj ? finishedSiteObj.name : skippedSiteId;

    chrome.notifications.create('site_skipped_' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
      title: `⚠️【${siteName}】${reason} · 自动跳过`,
      message: `检测到【${siteName}】${reason}，已自动为您安全跳过并切换至下一招聘网站...`,
      priority: 2
    });

    cruisePipeline.currentIndex++;
    setTimeout(() => {
      launchCurrentPipelineSite();
    }, 3500);

    sendResponse({ status: 'site_skipped_next_triggered' });
    return true;
  } else if (request.type === 'PIPELINE_SITE_FINISHED') {
    const finishedSiteId = request.site;
    const count = request.count || 0;
    cruisePipeline.siteStats[finishedSiteId] = count;

    updateExtensionBadge();
    broadcastPipelineStatus();

    const finishedSiteObj = PIPELINE_SITES.find(s => s.id === finishedSiteId);
    const siteName = finishedSiteObj ? finishedSiteObj.name : finishedSiteId;

    chrome.notifications.create('site_finished_' + Date.now(), {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
      title: `✅【${siteName}】投递目标已达成 (${count}个)！`,
      message: '正在为您安全冷却并平滑切换至下一招聘网站...',
      priority: 2
    });

    cruisePipeline.currentIndex++;
    setTimeout(() => {
      launchCurrentPipelineSite();
    }, 3500);

    sendResponse({ status: 'next_site_triggered' });
    return true;
  } else if (request.type === 'HR_REPLY_ALERT') {
    // HR 新消息回复系统桌面强提醒与直通路由 (严格遵守持久化存储的冷却周期，杜绝多标签并发堆叠)
    chrome.storage.local.get(['config', 'lastGlobalHRAlertTimestamp'], (res) => {
      const cfg = res.config || {};
      if (cfg.desktopNotification === false) {
        sendResponse({ status: 'desktop_notification_disabled' });
        return;
      }

      const cooldownMins = (cfg.hrAlertCooldownMinutes !== undefined && Number(cfg.hrAlertCooldownMinutes) > 0)
        ? Number(cfg.hrAlertCooldownMinutes)
        : 5;
      const cooldownMs = cooldownMins * 60 * 1000;
      const now = Date.now();
      const lastAlert = Number(res.lastGlobalHRAlertTimestamp) || 0;

      if (now - lastAlert < cooldownMs && lastAlert > 0) {
        console.log(`[ZIAVER Background] ⏳ HR 提醒处于全局防打扰冷却期 (${cooldownMins}分钟内仅弹一次)，已持久化拦截去重`);
        sendResponse({ status: 'cooldown_suppressed' });
        return;
      }

      // 立即持久化记录本次提醒触发时间戳
      chrome.storage.local.set({ lastGlobalHRAlertTimestamp: now });

      const notifId = 'hr_reply_singleton';
      const chatUrl = request.chatUrl || (
        request.platform === 'liepin' ? 'https://www.liepin.com/im/' :
        request.platform === 'lagou' ? 'https://easy.lagou.com/im/chat.htm' :
        'https://www.zhipin.com/web/geek/chat'
      );
      if (!globalThis.notifChatTargetMap) {
        globalThis.notifChatTargetMap = new Map();
      }
      globalThis.notifChatTargetMap.set(notifId, chatUrl);

      let siteTitle = 'BOSS 直聘';
      if (request.platform === 'liepin') siteTitle = '猎聘网';
      else if (request.platform === 'lagou') siteTitle = '拉勾网';

      // 先清除旧通知，确保屏幕右侧永远最多只有 1 个清爽通知，绝不堆叠！
      chrome.notifications.clear(notifId, () => {
        chrome.notifications.create(notifId, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon_128.png'),
          title: `🔔 ${siteTitle} · 检测到 HR 新回复/私信！`,
          message: request.text || '有企业 HR 正在与您互动沟通，点击立即直达聊天界面！',
          priority: 2,
          requireInteraction: false // 自动在数秒后优雅隐退，不卡在屏幕边侧阻塞视野
        });
      });

      sendResponse({ status: 'ok' });
    });
    return true;
  } else if (request.type === 'APPLY_LOG') {
    // 写入投递记录表格与分时段统计
    chrome.storage.local.get(['config', 'applyLog', 'keyCompanies'], (res) => {
      const config = res.config || {};
      const today = getLocalDateStr();
      if (config.lastActiveDate !== today) {
        config.lastActiveDate = today;
        config.todayCount = 0;
        config.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
        config.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
      }
      if (!config.siteTodayCounts) {
        config.siteTodayCounts = { boss: 0, liepin: 0, lagou: 0, ats: 0 };
      }
      if (!config.timeSlotCounts) {
        config.timeSlotCounts = { morning: 0, afternoon: 0, evening: 0 };
      }
      if (!config.timeSlotLimits) {
        config.timeSlotLimits = { morning: 20, afternoon: 30, evening: 20 };
      }

      // 区分平台进行独立今日计数
      const rawPlatform = (request.data && request.data.platform) || '';
      let siteKey = 'boss';
      if (rawPlatform.includes('猎聘') || rawPlatform.toLowerCase().includes('liepin')) {
        siteKey = 'liepin';
      } else if (rawPlatform.includes('拉勾') || rawPlatform.toLowerCase().includes('lagou')) {
        siteKey = 'lagou';
      } else if (rawPlatform.includes('ATS') || rawPlatform.toLowerCase().includes('ats')) {
        siteKey = 'ats';
      }

      if (request.data && request.data.exactCount !== undefined) {
        config.siteTodayCounts[siteKey] = request.data.exactCount;
      } else {
        config.siteTodayCounts[siteKey] = (config.siteTodayCounts[siteKey] || 0) + 1;
      }
      // 汇总各站总和为全网总计数
      config.todayCount = Object.values(config.siteTodayCounts).reduce((a, b) => a + (Number(b) || 0), 0);
      
      // 更新当前时段计数
      const now = new Date();
      const currentSlot = getCurrentTimeSlot(now);
      config.timeSlotCounts[currentSlot] = (config.timeSlotCounts[currentSlot] || 0) + 1;

      const log = res.applyLog || [];
      const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      
      const compName = request.data && request.data.company ? request.data.company.trim() : '企业';
      const jobTitle = request.data && request.data.title ? request.data.title.trim() : '运营';

      log.unshift({
        id: Date.now(),
        time: timeStr,
        platform: request.data.platform || 'BOSS直聘',
        company: compName,
        title: jobTitle,
        salary: request.data.salary || '面议',
        matchedTag: request.data.matchedTag || '综合匹配',
        greeting: request.data.greeting || '',
        status: request.data.status || '已沟通'
      });

      // 保持最近 500 条详尽记录
      if (log.length > 500) log.pop();

      // 自动维护重点企业库中的基础初次联系记录
      let keyCompanies = Array.isArray(res.keyCompanies) ? res.keyCompanies : [];
      if (compName && compName !== '未知企业' && compName !== '企业') {
        const existIdx = keyCompanies.findIndex(item => item.company === compName);
        if (existIdx === -1) {
          keyCompanies.unshift({
            id: 'kc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            company: compName,
            jobTitle: jobTitle,
            hrName: '招聘负责人',
            replyCount: 1,
            lastMessage: request.data.greeting || '已发送初次打招呼沟通',
            lastTime: timeStr,
            chatUrl: request.data.chatUrl || (siteKey === 'liepin' ? 'https://www.liepin.com/im/' : siteKey === 'lagou' ? 'https://easy.lagou.com/im/chat.htm' : 'https://www.zhipin.com/web/geek/chat'),
            platform: request.data.platform || 'BOSS直聘',
            isPinned: false,
            notes: ''
          });
          if (keyCompanies.length > 200) keyCompanies.pop();
        }
      }

      chrome.storage.local.set({ config, applyLog: log, keyCompanies }, () => {
        sendResponse({ 
          success: true, 
          count: config.todayCount, 
          siteCount: config.siteTodayCounts[siteKey], 
          siteKey,
          timeSlot: currentSlot,
          timeSlotCount: config.timeSlotCounts[currentSlot],
          timeSlotLimit: config.timeSlotLimits[currentSlot]
        });
      });
    });
    return true;
  } else if (request.type === 'UPDATE_KEY_COMPANY') {
    // 动态维护与 HR 交流高频的重点公司记录
    chrome.storage.local.get(['keyCompanies'], (res) => {
      let list = Array.isArray(res.keyCompanies) ? res.keyCompanies : [];
      const data = request.data || {};
      const compName = (data.company || '').trim();
      if (!compName || compName === '未知企业' || compName === '企业') {
        sendResponse({ success: false, reason: 'invalid_company_name' });
        return;
      }
      const existingIdx = list.findIndex(item => item.company === compName);
      const now = new Date();
      const timeStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      
      if (existingIdx !== -1) {
        const item = list[existingIdx];
        item.replyCount = (item.replyCount || 0) + (data.replyIncrement || 1);
        if (data.jobTitle) item.jobTitle = data.jobTitle;
        if (data.hrName) item.hrName = data.hrName;
        if (data.lastMessage) item.lastMessage = data.lastMessage;
        if (data.chatUrl) item.chatUrl = data.chatUrl;
        if (data.platform) item.platform = data.platform;
        item.lastTime = timeStr;
      } else {
        list.push({
          id: 'kc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          company: compName,
          jobTitle: data.jobTitle || '运营',
          hrName: data.hrName || '招聘顾问',
          replyCount: data.replyIncrement || 1,
          lastMessage: data.lastMessage || 'HR 发来新沟通信息',
          lastTime: timeStr,
          chatUrl: data.chatUrl || 'https://www.zhipin.com/web/geek/chat',
          platform: data.platform || 'BOSS直聘',
          isPinned: false,
          notes: ''
        });
      }

      // 按置顶与互动频次排序
      list.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return (b.replyCount || 0) - (a.replyCount || 0);
      });

      if (list.length > 200) list = list.slice(0, 200);

      chrome.storage.local.set({ keyCompanies: list }, () => {
        sendResponse({ success: true, count: list.length });
      });
    });
    return true;
  } else if (request.type === 'TOGGLE_PIN_KEY_COMPANY') {
    chrome.storage.local.get(['keyCompanies'], (res) => {
      let list = Array.isArray(res.keyCompanies) ? res.keyCompanies : [];
      const id = request.id;
      const target = list.find(item => item.id === id || item.company === request.company);
      if (target) {
        target.isPinned = !target.isPinned;
        list.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return (b.replyCount || 0) - (a.replyCount || 0);
        });
        chrome.storage.local.set({ keyCompanies: list }, () => {
          sendResponse({ success: true, isPinned: target.isPinned });
        });
      } else {
        sendResponse({ success: false, reason: 'not_found' });
      }
    });
    return true;
  } else if (request.type === 'DELETE_KEY_COMPANY') {
    chrome.storage.local.get(['keyCompanies'], (res) => {
      let list = Array.isArray(res.keyCompanies) ? res.keyCompanies : [];
      list = list.filter(item => item.id !== request.id && item.company !== request.company);
      chrome.storage.local.set({ keyCompanies: list }, () => {
        sendResponse({ success: true });
      });
    });
    return true;
  } else if (request.type === 'OPEN_PAGE') {
    // 跨页面切换调度
    if (request.url) {
      chrome.tabs.create({ 
        url: request.url, 
        active: request.active !== undefined ? request.active : true 
      });
      sendResponse({ status: 'ok' });
    }
  } else if (request.type === 'BATCH_OPEN_PAGES') {
    // 批量在后台标签页打开职位（防浏览器卡死，间隔打开）
    const urls = request.urls || [];
    let opened = 0;
    urls.forEach((url, idx) => {
      setTimeout(() => {
        chrome.tabs.create({ url, active: false });
      }, idx * 600);
      opened++;
    });
    sendResponse({ status: 'ok', count: opened });
    return true;
  } else if (request.type === 'OPEN_DAILY_DIGEST') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#daily-digest') });
    sendResponse({ status: 'ok' });
    return true;
  } else if (request.type === 'LOG_MANUAL_APPLY') {
    // 捕获并深度学习用户手动投递岗位
    chrome.storage.local.get(['manualApplyLog', 'userPreferenceProfile'], (res) => {
      let list = Array.isArray(res.manualApplyLog) ? res.manualApplyLog : [];
      const job = request.job || {};
      if (!job.title && !job.company) {
        sendResponse({ success: false, reason: 'empty_job' });
        return;
      }
      const today = getLocalDateStr();
      const isDuplicate = list.some(item => 
        item.company === job.company && 
        item.title === job.title && 
        (item.applyTime || '').startsWith(today)
      );

      if (!isDuplicate) {
        list.unshift({
          id: 'manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          title: job.title || '未知岗位',
          company: job.company || '未知企业',
          salary: job.salary || '面议',
          experience: job.experience || '经验不限',
          education: job.education || '不限',
          tags: Array.isArray(job.tags) ? job.tags : [],
          location: job.location || '',
          hrName: job.hrName || 'HR',
          hrTitle: job.hrTitle || '',
          jobDesc: (job.jobDesc || '').slice(0, 300),
          platform: job.platform || 'BOSS直聘',
          applyTime: job.applyTime || (new Date().toLocaleString())
        });
        if (list.length > 200) list = list.slice(0, 200);
        const profile = updateUserPreferenceProfile(list);
        chrome.storage.local.set({ manualApplyLog: list, userPreferenceProfile: profile }, () => {
          console.log('[ZIAVER Learning] 🧠 成功记录并学习用户手动投递岗位:', job.title, job.company);
          // 广播学习画像给前端
          broadcastToAllTabs({ type: 'LEARNED_PROFILE_UPDATED', profile, count: list.length });
          sendResponse({ success: true, count: list.length, profile });
        });
      } else {
        sendResponse({ success: true, duplicate: true, count: list.length });
      }
    });
    return true;
  } else if (request.type === 'GET_LEARNED_PROFILE') {
    chrome.storage.local.get(['manualApplyLog', 'userPreferenceProfile'], (res) => {
      const list = Array.isArray(res.manualApplyLog) ? res.manualApplyLog : [];
      const profile = res.userPreferenceProfile || updateUserPreferenceProfile(list);
      sendResponse({ status: 'ok', profile, logs: list });
    });
    return true;
  } else if (request.type === 'SYNC_LEARNED_TAGS') {
    // 将学到的高频词汇一键同步到生效词条
    chrome.storage.local.get(['userPreferenceProfile', 'jobTags'], (res) => {
      const profile = res.userPreferenceProfile || {};
      const keywords = Array.isArray(profile.topKeywords) ? profile.topKeywords : [];
      let tags = Array.isArray(res.jobTags) ? res.jobTags : DEFAULT_JOB_TAGS;
      let addedCount = 0;
      const addedKeywords = [];

      keywords.slice(0, 8).forEach(rawKw => {
        const cleanKw = (typeof rawKw === 'object' ? (rawKw.word || '') : (rawKw || '')).trim();
        if (!cleanKw || cleanKw.length < 2) return;
        const exists = tags.some(t => ((t.text || t.name) || '').trim().toLowerCase() === cleanKw.toLowerCase());
        if (!exists) {
          tags.push({
            id: 'learned_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            name: cleanKw,
            text: cleanKw,
            category: '🧠 手动偏好学习',
            active: true,
            source: 'learned',
            highlightColor: 'rgba(168, 85, 247, 0.4)'
          });
          addedCount++;
          addedKeywords.push(cleanKw);
        } else {
          // 若已存在但未激活，则激活它
          const targetTag = tags.find(t => ((t.text || t.name) || '').trim().toLowerCase() === cleanKw.toLowerCase());
          if (targetTag && !targetTag.active) {
            targetTag.active = true;
            addedCount++;
            addedKeywords.push(`${cleanKw}(激活)`);
          }
        }
      });

      chrome.storage.local.set({ jobTags: tags }, () => {
        sendResponse({ status: 'ok', success: true, addedCount, addedKeywords, totalTags: tags.length, tags });
      });
    });
    return true;
  } else if (request.type === 'CLEAR_MANUAL_LOGS') {
    const emptyProfile = updateUserPreferenceProfile([]);
    chrome.storage.local.set({ manualApplyLog: [], userPreferenceProfile: emptyProfile }, () => {
      sendResponse({ success: true });
    });
    return true;
  } else if (request.type === 'SAVE_BOSS_FILTERS') {
    const filters = request.filters || {};
    chrome.storage.local.set({ savedBossFilters: filters }, () => {
      console.log('[ZIAVER] 💾 已保存用户 BOSS 网页筛选参数:', filters);
      broadcastToAllTabs({ type: 'SAVED_BOSS_FILTERS_UPDATED', filters });
      sendResponse({ success: true, filters });
    });
    return true;
  } else if (request.type === 'GET_SAVED_BOSS_FILTERS') {
    chrome.storage.local.get(['savedBossFilters'], (res) => {
      sendResponse({ status: 'ok', filters: res.savedBossFilters || null });
    });
    return true;
  }
});

// ================= 启发式用户手动投递画像学习算法 =================
function updateUserPreferenceProfile(manualLogs = []) {
  if (!Array.isArray(manualLogs) || manualLogs.length === 0) {
    return {
      sampleCount: 0,
      topKeywords: [],
      salaryBand: '面议',
      salaryPreference: { minAvg: 0, maxAvg: 0 },
      experiencePreference: [],
      educationPreference: [],
      learnedInsights: '尚未捕获到手动投递样本。当您日常在各招聘网站手动点击“立即沟通”时，系统会自动在此深度学习提炼偏好画像。',
      lastUpdated: new Date().toLocaleString()
    };
  }

  const stopWords = new Set([
    '的', '及', '和', '与', '等', '专员', '主管', '经理', '助理', '岗位', '职位', 
    '招聘', '深圳', '南山', '福田', '宝安', '龙岗', '罗湖', '无责', '底薪', '兼职', 
    '全职', '公司', '集团', '有限', '责任', '工作室', '双休', '急聘', '高薪', '直聘', '人员', '工作'
  ]);

  const keywordCounts = {};
  const salaryMins = [];
  const salaryMaxs = [];
  const expCounts = {};
  const eduCounts = {};

  manualLogs.forEach(item => {
    const rawTitle = (item.title || '');
    const tokens = rawTitle.split(/[\s\/\-\+\·\、\(\)（）_]+/).filter(Boolean);
    tokens.forEach(tok => {
      const clean = tok.trim();
      if (clean.length >= 2 && !stopWords.has(clean)) {
        keywordCounts[clean] = (keywordCounts[clean] || 0) + 1;
      }
    });

    // 强化常见运营/策划/数码/影视复合词权重
    const compositeWords = [
      '新媒体运营', '短视频运营', '活动策划', '兼职策划', '达人商务', '达人媒介', 
      '摄影师', '商业摄影', '电商运营', '社群运营', '内容运营', '文案策划', '编导', 
      '视频剪辑', '渠道拓展', '品牌公关', '用户运营'
    ];
    compositeWords.forEach(w => {
      if (rawTitle.includes(w)) {
        keywordCounts[w] = (keywordCounts[w] || 0) + 3;
      }
    });

    if (Array.isArray(item.tags)) {
      item.tags.forEach(t => {
        const clean = (t || '').trim();
        if (clean.length >= 2 && !stopWords.has(clean)) {
          keywordCounts[clean] = (keywordCounts[clean] || 0) + 1;
        }
      });
    }

    const rawSal = item.salary || '';
    const kMatch = rawSal.match(/(\d+)(?:[-~到])(\d+)[kK千]/);
    if (kMatch) {
      salaryMins.push(parseInt(kMatch[1], 10));
      salaryMaxs.push(parseInt(kMatch[2], 10));
    }

    if (item.experience && item.experience !== '不限' && item.experience !== '经验不限') {
      expCounts[item.experience] = (expCounts[item.experience] || 0) + 1;
    }

    if (item.education && item.education !== '不限') {
      eduCounts[item.education] = (eduCounts[item.education] || 0) + 1;
    }
  });

  const sortedKeywords = Object.keys(keywordCounts)
    .sort((a, b) => keywordCounts[b] - keywordCounts[a])
    .slice(0, 10);

  let minAvg = salaryMins.length > 0 ? Math.round(salaryMins.reduce((a, b) => a + b, 0) / salaryMins.length) : 7;
  let maxAvg = salaryMaxs.length > 0 ? Math.round(salaryMaxs.reduce((a, b) => a + b, 0) / salaryMaxs.length) : 12;
  const salaryBand = salaryMins.length > 0 ? `${minAvg}-${maxAvg}K` : '面议/兼职日薪';

  const sortedExp = Object.keys(expCounts).sort((a, b) => expCounts[b] - expCounts[a]);
  const sortedEdu = Object.keys(eduCounts).sort((a, b) => eduCounts[b] - eduCounts[a]);

  const topExp = sortedExp.length > 0 ? sortedExp.slice(0, 2).join(' / ') : '1-3年/经验不限';
  const topEdu = sortedEdu.length > 0 ? sortedEdu.slice(0, 2).join(' / ') : '大专/本科';

  const insights = `基于您最近 ${manualLogs.length} 次手动投递沉淀：\n` +
    `• 核心偏好岗位：【${sortedKeywords.slice(0, 4).join(' / ') || '运营类'}】\n` +
    `• 目标薪资带：${salaryBand}\n` +
    `• 倾向要求：${topExp} · ${topEdu}\n` +
    `巡航引擎已自动将此偏好特征融合至初筛逻辑，优先自动投递相似优质岗位！`;

  return {
    sampleCount: manualLogs.length,
    topKeywords: sortedKeywords,
    keywordCounts,
    salaryBand,
    salaryPreference: { minAvg, maxAvg },
    experiencePreference: sortedExp,
    educationPreference: sortedEdu,
    learnedInsights: insights,
    lastUpdated: new Date().toLocaleString()
  };
}

// 点击桌面通知时，精准区分日常求职情报、HR回复直接跳转与普通巡航切换
chrome.notifications.onClicked.addListener((notifId) => {
  if (notifId && notifId.startsWith('daily_job_digest_')) {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/dashboard.html#daily-digest') });
    return;
  }

  if (notifId && notifId.startsWith('hr_reply_')) {
    const targetUrl = (globalThis.notifChatTargetMap && globalThis.notifChatTargetMap.get(notifId)) || 'https://www.zhipin.com/web/geek/chat';
    if (globalThis.notifChatTargetMap) globalThis.notifChatTargetMap.delete(notifId);

    chrome.tabs.query({}, (tabs) => {
      let existingTab = null;
      if (targetUrl.includes('zhipin.com')) {
        existingTab = tabs.find(t => t.url && t.url.includes('zhipin.com/web/geek/chat')) || tabs.find(t => t.url && t.url.includes('zhipin.com'));
      } else if (targetUrl.includes('liepin.com')) {
        existingTab = tabs.find(t => t.url && t.url.includes('liepin.com/im')) || tabs.find(t => t.url && t.url.includes('liepin.com'));
      } else if (targetUrl.includes('lagou.com')) {
        existingTab = tabs.find(t => t.url && (t.url.includes('lagou.com/im') || t.url.includes('lagou.com/message'))) || tabs.find(t => t.url && t.url.includes('lagou.com'));
      }

      if (existingTab) {
        chrome.windows.update(existingTab.windowId, { focused: true });
        chrome.tabs.update(existingTab.id, { active: true, url: targetUrl });
      } else {
        chrome.tabs.create({ url: targetUrl });
      }
    });
    return;
  }

  chrome.tabs.query({ url: ['*://*.zhipin.com/*', '*://*.liepin.com/*', '*://*.lagou.com/*'] }, (tabs) => {
    if (tabs.length > 0) {
      chrome.windows.update(tabs[0].windowId, { focused: true });
      chrome.tabs.update(tabs[0].id, { active: true });
    }
  });
});
