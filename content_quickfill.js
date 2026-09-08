// JobCruise 求职自动化助手 - 网页端简历速填武器库悬浮小抽屉 (In-Page Resume Quick-Fill Depot) v2.3
// 作用：在各大招聘平台 (BOSS/猎聘/拉勾/大厂ATS/北森/Moka/大易等) 注册或网申填表时，提供分类简历字段点击复制或一键填入

(function () {
  'use strict';

  if (window.__JOBCRUISE_QUICKFILL_LOADED__) return;
  window.__JOBCRUISE_QUICKFILL_LOADED__ = true;

  let resumeDepot = null;
  let applicantProfile = {};
  let lastTargetInput = null;
  let isDrawerOpen = false;
  let isDrawerPinned = false;
  let searchQuery = '';
  let currentDrawerTab = 'form-match'; // 'form-match' | 'structured' | 'raw'
  let selectedWorkIndex = 0;
  let selectedProjectIndex = 0;
  let currentScannedPageFields = [];
  let formObserver = null;

  // 1. 智能招聘与网申页面识别引擎 (杜绝在百度/B站/知乎/电商等通用网页乱弹)
  function shouldEnableQuickFill() {
    try {
      const host = window.location.hostname.toLowerCase();
      const path = window.location.pathname.toLowerCase();
      const href = window.location.href.toLowerCase();

      // A. 明确属于纯非招聘的通用网站黑名单 (搜索/视频/社交/电商/开发社区等)
      const NON_JOB_HOSTS = [
        'baidu.com', 'google.com', 'bing.com', 'sogou.com',
        'bilibili.com', 'youtube.com', 'weibo.com', 'zhihu.com',
        'twitter.com', 'x.com', 'github.com', 'gitee.com',
        'taobao.com', 'jd.com', 'tmall.com', 'pinduoduo.com',
        'douyin.com', 'kuaishou.com', 'xiaohongshu.com',
        'v2ex.com', 'juejin.cn', 'csdn.net', 'stackoverflow.com',
        'segmentfault.com', 'cnblogs.com', '163.com/news', 'qq.com/news'
      ];
      const isPureNonJobHost = NON_JOB_HOSTS.some(bh => host.endsWith(bh) || host === bh);
      const hasJobKeywordInUrl = /campus|career|jobs?|recruit|zhaopin|hire|talent|intern|graduate|hr\./i.test(href);

      // 如果是通用站点且 URL 没有明确的招聘/校招子路径，直接禁用
      if (isPureNonJobHost && !hasJobKeywordInUrl) {
        return false;
      }

      // B. 明确的招聘与网申平台白名单
      const RECRUITMENT_WHITELISTS = [
        'zhipin.com', 'liepin.com', 'lagou.com', '51job.com', 'zhaopin.com',
        'nowcoder.com', 'niuke.com', 'shixiseng.com', 'yingjiesheng.com',
        'guopin.com', 'maimai.cn', 'kanzhun.com', 'chinahr.com', 'dajie.com',
        'beisen.com', 'mokahr.com', 'dayee.com', 'zhiye.com', '24talk.cn',
        'italent.cn', 'knx.com.cn', 'hodesoft.com', 'hotjob.cn', 'moka.com',
        'tencent.com', 'bytedance.com', 'toutiao.com', '163.com', 'mihoyo.com',
        'dji.com', 'insta360.com', 'meituan.com', 'alibaba.com', 'alipay.com',
        'huawei.com', 'oppo.com', 'vivo.com', 'xiaomi.com'
      ];

      if (RECRUITMENT_WHITELISTS.some(wh => host.includes(wh))) {
        return true;
      }

      // C. URL 包含校招/网申特征关键词
      if (hasJobKeywordInUrl) {
        return true;
      }

      // D. 表单特征检测：页面中如果包含两个以上典型的求职网申输入框特征
      const inputs = document.querySelectorAll('input, textarea');
      let jobFieldHits = 0;
      const JOB_FIELD_REG = /姓名|学历|院校|学校|专业|手机|电话|邮箱|工作经历|项目经验|期望职位|简历|求职|自我评价/i;
      for (let i = 0; i < Math.min(inputs.length, 25); i++) {
        const el = inputs[i];
        const ph = el.getAttribute('placeholder') || '';
        const name = el.getAttribute('name') || '';
        const aria = el.getAttribute('aria-label') || '';
        if (JOB_FIELD_REG.test(ph) || JOB_FIELD_REG.test(name) || JOB_FIELD_REG.test(aria)) {
          jobFieldHits++;
        }
      }
      if (jobFieldHits >= 2) return true;
    } catch (e) {}

    return false;
  }

  // 1. 初始化读取本地存储
  function loadDepotData(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      if (callback) callback();
      return;
    }
    chrome.storage.local.get(['resumeDepot', 'applicantProfile'], (res) => {
      if (res) {
        if (res.resumeDepot) resumeDepot = res.resumeDepot;
        if (res.applicantProfile) applicantProfile = res.applicantProfile;
      }
      if (callback) callback();
    });
  }

  // 监听存储变动 (若用户在 Dashboard 上传新简历，网页端实时热同步)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        let needRerender = false;
        if (changes.resumeDepot) {
          resumeDepot = changes.resumeDepot.newValue;
          needRerender = true;
        }
        if (changes.applicantProfile) {
          applicantProfile = changes.applicantProfile.newValue || {};
          needRerender = true;
        }
        if (needRerender) {
          renderDrawerContent();
        }
      }
    });
  }

  // 2. 捕获网页中当前获得焦点的输入框 (兼容各类 Input/Textarea/富文本及在线文档)
  function isTextInput(el) {
    if (!el || el.nodeType !== 1) return false;
    // 排除插件自身的元素
    if (el.closest && el.closest('#jobcruise-quickfill-root')) return false;

    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'tel', 'url', 'email', 'number', 'password'].includes(type);
    }
    // 支持各类富文本与在线文档 (腾讯文档/飞书/Google Docs/WPS/Notion/语雀等)
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox' || el.getAttribute('g_editable') === 'true') {
      return true;
    }
    if (el.closest && el.closest('[contenteditable="true"], [role="textbox"], [g_editable="true"], .ProseMirror, .ql-editor, .DraftEditor-root, .kdocs-editor, .docs-editor, .feishu-editor')) {
      return true;
    }
    return false;
  }

  function getTargetInputContainer(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el;
    if (el.closest) {
      const richEditor = el.closest('[contenteditable="true"], [role="textbox"], [g_editable="true"], .ProseMirror, .ql-editor');
      if (richEditor) return richEditor;
    }
    return el;
  }

  function getInputLabel(el) {
    if (!el) return '未选定输入框';
    const placeholder = el.getAttribute('placeholder') || '';
    const name = el.getAttribute('name') || el.getAttribute('id') || '';
    const aria = el.getAttribute('aria-label') || '';
    const isDoc = el.isContentEditable || (el.closest && el.closest('[contenteditable="true"], [role="textbox"]'));
    const label = placeholder || aria || name || (isDoc ? '在线文档/文本区域' : (el.tagName === 'TEXTAREA' ? '多行文本框' : '文本输入框'));
    return label.length > 20 ? label.slice(0, 20) + '...' : label;
  }

  document.addEventListener('focusin', (e) => {
    if (isTextInput(e.target)) {
      lastTargetInput = getTargetInputContainer(e.target);
      updateTargetIndicator();
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (isTextInput(e.target)) {
      lastTargetInput = getTargetInputContainer(e.target);
      updateTargetIndicator();
    }
  }, true);

  // 3. 原生表单与在线文档多层次智能填入 (兼容 React / Vue / 腾讯文档 / 飞书 / WPS / Google Docs)
  function fillNativeInput(element, value) {
    if (!element) return false;
    try {
      element.focus();
      const tag = element.tagName;
      const isTextarea = tag === 'TEXTAREA';
      const isInput = tag === 'INPUT';
      const isSelect = tag === 'SELECT';

      // 0. 支持原生 <select> 下拉选项匹配
      if (isSelect && element.options) {
        const valStr = String(value).trim().toLowerCase();
        let matchedIndex = -1;
        for (let i = 0; i < element.options.length; i++) {
          const opt = element.options[i];
          const optText = (opt.text || opt.innerText || '').trim().toLowerCase();
          const optVal = (opt.value || '').trim().toLowerCase();
          if (optText === valStr || optVal === valStr || optText.includes(valStr) || valStr.includes(optText)) {
            matchedIndex = i;
            break;
          }
        }
        if (matchedIndex !== -1) {
          element.selectedIndex = matchedIndex;
          element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          element.dispatchEvent(new Event('blur', { bubbles: true }));
          return true;
        }
      }

      // 1. 标准表单输入框 (Bypass React/Vue 原生 Setter)
      if (isTextarea || isInput) {
        const proto = Object.getPrototypeOf(element);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(element, 'value')?.set;
        if (setter) setter.call(element, value);
        else element.value = value;

        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }

      // 2. 在线文档与富文本内核 (execCommand 原生光标处插入)
      let commandExecuted = false;
      try {
        if (document.queryCommandSupported && document.queryCommandSupported('insertText')) {
          commandExecuted = document.execCommand('insertText', false, value);
        }
      } catch (e) {
        commandExecuted = false;
      }

      if (commandExecuted) {
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        return true;
      }

      // 3. ContentEditable 节点替换或插入
      if (element.isContentEditable || element.getAttribute('contenteditable') === 'true' || element.getAttribute('role') === 'textbox') {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          const textNode = document.createTextNode(value);
          range.insertNode(textNode);
          range.setStartAfter(textNode);
          range.setEndAfter(textNode);
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          element.innerText = value;
        }
        element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        return true;
      }

      // 4. 通用 fallback
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      return true;
    } catch (err) {
      console.warn('[JobCruise QuickFill] 表单填入异常:', err);
      return false;
    }
  }

  // 4. 剪贴板复制工具函数
  function copyToClipboard(text, onSuccess) {
    if (!text) return;
    const clean = String(text).trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(clean).then(() => {
        if (onSuccess) onSuccess();
      }).catch(() => fallbackCopy(clean, onSuccess));
    } else {
      fallbackCopy(clean, onSuccess);
    }
  }

  function fallbackCopy(text, onSuccess) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error('[JobCruise QuickFill] 复制失败:', e);
    }
    document.body.removeChild(ta);
  }

  // ================= 4.1 智能网页输入项提取与简历材料自动对齐引擎 =================
  function updateFormMatchTabBadge() {
    if (!shadowRoot) return;
    const badge = shadowRoot.getElementById('form-match-tab-count');
    if (badge) {
      const count = currentScannedPageFields.length;
      badge.textContent = count > 0 ? `${count}` : '0';
      badge.style.display = count > 0 ? 'inline-block' : 'none';
    }
  }

  function extractFieldMetadata(el) {
    if (!el) return { label: '', isRequired: false, section: '📝 表单信息' };
    let itemLabels = [];
    let isRequired = false;

    if (el.required || el.getAttribute('aria-required') === 'true') {
      isRequired = true;
    }

    // 1. 显式关联的 label：<label for="...">
    if (el.id) {
      try {
        const explicitLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (explicitLabel) {
          const lt = (explicitLabel.innerText || explicitLabel.textContent || '').trim();
          if (lt.includes('*')) isRequired = true;
          const clean = lt.replace(/[\*\:：\s\r\n\t]+/g, ' ').replace(/\(必填\)|（必填）/g, '').trim();
          if (clean) itemLabels.push(clean);
        }
      } catch (e) {}
    }

    // 2. 最近的直接包裹 <label>
    const parentLabel = el.closest && el.closest('label');
    if (parentLabel && itemLabels.length === 0) {
      const plt = (parentLabel.innerText || parentLabel.textContent || '').trim();
      if (plt.includes('*')) isRequired = true;
      const clean = plt.replace(/[\*\:：\s\r\n\t]+/g, ' ').replace(/\(必填\)|（必填）/g, '').trim();
      if (clean && clean !== el.value) itemLabels.push(clean);
    }

    // 3. 常见UI组件库专属容器提取专属label (Ant Design, Element UI, TDesign, Arco, Moka, Beisen)
    const itemContainer = el.closest && el.closest('.ant-form-item, .el-form-item, .arco-form-item, .t-form__item, .form-group, .form-item, .form-row, .field-wrap, .form-field');
    if (itemContainer && itemLabels.length === 0) {
      const labelEl = itemContainer.querySelector('label, .ant-form-item-label, .el-form-item__label, .arco-form-item-label, .t-form__label, .form-label, .item-label, .control-label, .field-label, .form-title');
      if (labelEl) {
        const lt = (labelEl.innerText || labelEl.textContent || '').trim();
        if (lt.includes('*')) isRequired = true;
        const clean = lt.replace(/[\*\:：\s\r\n\t]+/g, ' ').replace(/\(必填\)|（必填）/g, '').trim();
        if (clean) itemLabels.push(clean);
      }
    }

    // 4. 前驱兄弟元素 label (排除纯数字如日历中的天数 "9", "2022")
    if (itemLabels.length === 0) {
      const prev = el.previousElementSibling || (el.parentElement && el.parentElement.previousElementSibling);
      if (prev) {
        const pt = (prev.innerText || prev.textContent || '').trim();
        if (pt.includes('*')) isRequired = true;
        const clean = pt.replace(/[\*\:：\s\r\n\t]+/g, ' ').replace(/\(必填\)|（必填）/g, '').trim();
        if (clean && !/^\d{1,4}$/.test(clean) && clean.length < 35) {
          itemLabels.push(clean);
        }
      }
    }

    // 5. 元素自身属性：placeholder, aria-label, title, data-label, name
    const ph = el.getAttribute('placeholder') || '';
    const aria = el.getAttribute('aria-label') || '';
    const title = el.getAttribute('title') || '';
    const dataLabel = el.getAttribute('data-label') || el.getAttribute('data-field') || el.getAttribute('data-placeholder') || '';
    const name = el.getAttribute('name') || '';

    if (itemLabels.length === 0) {
      if (ph) itemLabels.push(ph.replace(/请输入|请选择|请填写/g, '').trim());
      else if (aria) itemLabels.push(aria);
      else if (title) itemLabels.push(title);
      else if (dataLabel) itemLabels.push(dataLabel);
      else if (name && !/^\d+$/.test(name)) itemLabels.push(name);
    }

    // 探测 Section 区域标题
    let detectedSection = '';
    let curr = el.parentElement;
    let depth = 0;
    while (curr && depth < 8 && curr !== document.body) {
      if (!detectedSection) {
        const headings = curr.querySelectorAll('h1, h2, h3, h4, .section-title, .card-title, .ant-card-head-title, .group-title, .group-header, .form-group-title, .module-title, legend');
        for (const h of headings) {
          const ht = (h.innerText || h.textContent || '').trim();
          if (/个人信息|基本信息|基本资料/i.test(ht)) { detectedSection = '👤 个人信息'; break; }
          else if (/求职意向|期望|意向/i.test(ht)) { detectedSection = '🎯 求职意向'; break; }
          else if (/工作经历|工作经验|实习经历|工作实战|工作履历/i.test(ht)) { detectedSection = '💼 工作经历'; break; }
          else if (/教育背景|教育经历|在校/i.test(ht)) { detectedSection = '🎓 教育背景'; break; }
          else if (/项目经历|项目经验|核心项目/i.test(ht)) { detectedSection = '🚀 项目经历'; break; }
          else if (/自我评价|个人优势|自我介绍/i.test(ht)) { detectedSection = '🌟 自我评价'; break; }
        }
      }
      curr = curr.parentElement;
      depth++;
    }

    const firstLabel = itemLabels[0] || '';
    const cleanLabel = firstLabel.replace(/[\*\:：\s\r\n\t]+/g, ' ').trim();

    return {
      label: cleanLabel,
      isRequired,
      section: detectedSection || '📝 表单信息'
    };
  }

  // 经历行智能拆解器 (支持 · | ｜ • ● ◆ \t 及各类空格格式，并剥除前缀噪声)
  function parseExpLine(line) {
    if (!line) return { company: '', role: '', period: '' };
    let cleanLine = line.replace(/^(?:ADDITIONAL\s*EXPERIENCE\s*\/)?\s*(?:补充经历|工作经历|实习经历|兼职经历|项目经历|主要经历)[：:\s]*/i, '').trim();
    let parts = cleanLine.split(/[|｜·•●◆\t]|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length === 1 && /\s+/.test(cleanLine)) {
      parts = cleanLine.split(/\s+/).map(p => p.trim()).filter(Boolean);
    }

    let period = '';
    let company = '';
    let role = '';

    parts.forEach(p => {
      if (/(?:20\d{2}[.\-\/年—–-]|至今|现在)/.test(p)) {
        period = period ? (period + ' ' + p) : p;
      } else if (!company && /(?:公司|科技|企业|集团|工作室|品牌|互娱|传媒|Studio|Club|有限公司|网络|信息|电商|宣传部|融媒体|中心|医院|机构)/i.test(p)) {
        company = p;
      } else if (!role) {
        role = p;
      } else if (!company) {
        company = p;
      }
    });

    if (!period) {
      const dm = cleanLine.match(/(?:20\d{2}[.\-\/年]\d{1,2}\s*(?:[-–—~至到]\s*(?:20\d{2}[.\-\/年]\d{1,2}|至今|现在))?)/);
      if (dm) period = dm[0].trim();
    }
    if (!company) {
      const cm = cleanLine.match(/(?:[\u4e00-\u9fa5A-Za-z0-9]+(?:公司|科技|企业|集团|工作室|品牌|互娱|传媒|Studio|Club|有限公司|宣传部|融媒体中心|医院))/);
      if (cm) company = cm[0].trim();
    }

    return { company, role, period };
  }

  function sanitizeWorkExperience(w) {
    if (!w) return { company: '', role: '', period: '', desc: '', achievements: [] };
    const clone = { ...w };
    if ((!clone.company || clone.company === '重点实战企业' || clone.company === '重点科技公司') && clone.period) {
      const parsed = parseExpLine(clone.period);
      if (parsed.company) clone.company = parsed.company;
      if (parsed.role && (!clone.role || clone.role === '运营/核心业务专家')) clone.role = parsed.role;
      if (parsed.period) clone.period = parsed.period;
    }
    return clone;
  }

  // 自动嗅探当前页面已填的公司名或职位与简历库中哪一段经历最契合
  function autoDetectMatchingWorkIndex() {
    if (!resumeDepot || !Array.isArray(resumeDepot.workExperiences) || resumeDepot.workExperiences.length <= 1) return;
    const works = resumeDepot.workExperiences;

    try {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea');
      for (const inp of inputs) {
        const val = (inp.value || '').trim();
        if (val && val.length >= 2) {
          for (let i = 0; i < works.length; i++) {
            const w = sanitizeWorkExperience(works[i]);
            const comp = (w.company || '').trim();
            const role = (w.role || '').trim();
            const rawPeriod = (works[i].period || '').trim();

            // 1. 公司名双向模糊匹配 (如 "JADE" 或 "散览" 或 "字节跳动")
            if (comp) {
              if (val.includes(comp) || comp.includes(val)) { selectedWorkIndex = i; return; }
              const compCore = comp.replace(/[\(\)（）\s/]/g, '');
              const valCore = val.replace(/[\(\)（）\s/]/g, '');
              if (compCore.length >= 3 && valCore.length >= 3 && (compCore.includes(valCore) || valCore.includes(compCore))) {
                selectedWorkIndex = i; return;
              }
            }
            // 2. 职位名匹配 (如 "独立商业人像摄影师" 或 "达人运营")
            if (role) {
              if (val.includes(role) || role.includes(val)) { selectedWorkIndex = i; return; }
              const roleParts = role.split(/[\/、\s]/).filter(Boolean);
              for (const rp of roleParts) {
                if (rp.length >= 3 && (val.includes(rp) || rp.includes(val))) { selectedWorkIndex = i; return; }
              }
            }
            // 3. 原始经历头字符串包含 (如包含 JADE 或 摄影 或 瓜子)
            if (rawPeriod && val.length >= 3 && rawPeriod.includes(val)) {
              selectedWorkIndex = i; return;
            }
          }
        }
      }
    } catch (e) {}
  }

  function classifyAndMatchInput(el, fieldMeta) {
    const labelText = typeof fieldMeta === 'string' ? fieldMeta : (fieldMeta.label || '');
    const section = typeof fieldMeta === 'object' ? (fieldMeta.section || '') : '';
    const text = (labelText + ' ' + section).toLowerCase();

    const depot = resumeDepot || {};
    const prof = applicantProfile || {};
    const basic = depot.basicInfo || {};
    const works = (depot.workExperiences || []).map(sanitizeWorkExperience);
    const projects = depot.projects || [];
    const edu = (depot.education && depot.education[0]) || {};

    // 活跃工作/项目经历
    const activeWork = works[selectedWorkIndex] || works[0] || {};
    const activeProj = projects[selectedProjectIndex] || projects[0] || {};

    // 1. 公司名称 / 单位名称 / 就任企业 / 任职公司
    if (/公司名称|单位名称|企业名称|就任单位|任职公司|所任公司|现任公司|所属企业|雇主|employer|company|organization/i.test(text) ||
        (/公司|单位|企业/i.test(text) && !/项目|学校|院校|大学|学院/i.test(text))) {
      const val = activeWork.company || (works[0] && works[0].company) || '重点实战企业';
      return { category: '💼 工作经历', icon: '🏢', fieldName: '公司名称', value: val, key: 'company' };
    }

    // 2. 职位名称 / 岗位名称 / 担任职务 / 职务
    if (/职位名称|岗位名称|担任职位|任职岗位|所任职务|职务|工种|^职位$|^岗位$|role|title|position/i.test(text) &&
        !/期望|目标|意向/i.test(text)) {
      const val = activeWork.role || (works[0] && works[0].role) || prof.targetRole || basic.targetRole || '运营/业务专家';
      return { category: '💼 工作经历', icon: '💼', fieldName: '职位名称', value: val, key: 'role' };
    }

    // 3. 所在部门 / 所属部门 / 团队
    if (/所在部门|所属部门|部门|团队|科室|业务线|事业部|department|dept|division/i.test(text)) {
      let deptVal = activeWork.department || prof.department || '';
      if (!deptVal && activeWork.role) {
        const rPart = activeWork.role.split(/[\/、\s]/)[0];
        if (!/摄影师|设计|讲师|助理|总监/i.test(rPart)) {
          deptVal = rPart + '部';
        }
      }
      return { category: '💼 工作经历', icon: '👥', fieldName: '所在部门', value: deptVal || '', key: 'department' };
    }

    // 4. 工作描述 / 工作职责 / 工作内容 / 工作业绩
    if (/工作描述|工作职责|工作内容|工作业绩|经历描述|职责描述|岗位职责|工作总结|duty|responsibilit|description|achievement/i.test(text) &&
        !/项目/i.test(text)) {
      let val = '';
      if (activeWork.desc && activeWork.achievements && activeWork.achievements.length > 0) {
        val = `${activeWork.desc}\n\n【核心量化业绩】:\n${activeWork.achievements.map(a => a.startsWith('•') || a.startsWith('-') ? a : '• ' + a).join('\n')}`;
      } else if (activeWork.desc) {
        val = activeWork.desc;
      } else if (activeWork.achievements && activeWork.achievements.length > 0) {
        val = activeWork.achievements.map(a => a.startsWith('•') || a.startsWith('-') ? a : '• ' + a).join('\n');
      } else {
        val = '负责业务全链路统筹、核心指标达成及跨专业协同交付。';
      }
      return { category: '💼 工作经历', icon: '📝', fieldName: '工作描述/职责', value: val, key: 'workDesc' };
    }

    // 5. 工作时间与起止日期
    if (/在职时间|工作时间|任职时间|起止时间|period/i.test(labelText)) {
      const val = activeWork.period || '2022.09 - 2024.06';
      return { category: '💼 工作经历', icon: '📅', fieldName: '工作起止时间', value: val, key: 'workPeriod' };
    }
    if (/入职时间|入职日期|开始时间|起始时间|start\s*date|^从$|^from$/i.test(text) && !/毕业|入学|项目/i.test(text)) {
      const p = activeWork.period || '2022.09';
      const start = p.split(/[-~至到]/)[0]?.trim() || '2022.09';
      return { category: '💼 工作经历', icon: '📅', fieldName: '入职时间', value: start, key: 'workStartDate' };
    }
    if (/离职时间|离职日期|结束时间|终止时间|end\s*date|^到$|^至$|^to$/i.test(text) && !/毕业|入学|项目/i.test(text)) {
      const p = activeWork.period || '2024.06';
      const end = p.split(/[-~至到]/)[1]?.trim() || '2024.06';
      return { category: '💼 工作经历', icon: '📅', fieldName: '离职时间', value: end, key: 'workEndDate' };
    }

    // 6. 独立年份选择框 (如 "2022" 或 "年份")
    if (/^(?:20\d{2}|年份|年)$/i.test(labelText.trim()) || (/年份|年/i.test(labelText) && labelText.length <= 4)) {
      const p = activeWork.period || '';
      const yMatch = p.match(/(20\d{2})/);
      const yearVal = yMatch ? yMatch[1] : (labelText.match(/20\d{2}/) ? labelText.match(/20\d{2}/)[0] : '2022');
      return { category: '📅 时间/年份', icon: '📅', fieldName: '年份', value: yearVal, key: 'year' };
    }

    // 7. 独立月份选择框 (如 "9" 或 "月份")
    if (/^(?:[1-9]|1[0-2]|月份|月)$/i.test(labelText.trim()) || (/月份|月/i.test(labelText) && labelText.length <= 4)) {
      const p = activeWork.period || '';
      const mMatch = p.match(/20\d{2}[.\-\/年](\d{1,2})/);
      const monthVal = mMatch ? mMatch[1].padStart(2, '0') : (labelText.match(/^[1-9]$/) ? labelText : '09');
      return { category: '📅 时间/月份', icon: '📅', fieldName: '月份', value: monthVal, key: 'month' };
    }

    // 8. 姓名
    if (/姓名|真实姓名|候选人|申请人|your\s*name|^name$/i.test(text) &&
        !/项目|学校|公司|岗位|职位|职务|微信号|紧急|联系人|推荐/i.test(text)) {
      const val = basic.name || prof.name || '王泽源';
      return { category: '👤 个人信息', icon: '👤', fieldName: '姓名', value: val, key: 'name' };
    }

    // 9. 手机号码
    if (/手机|电话|联系方式|phone|mobile|tel/i.test(text) && !/紧急|推荐|证明人/i.test(text)) {
      const val = basic.phone || prof.phone || '15339169128';
      return { category: '👤 个人信息', icon: '📱', fieldName: '手机号码', value: val, key: 'phone' };
    }

    // 10. 电子邮箱
    if (/邮箱|邮件|email|mail/i.test(text)) {
      const val = basic.email || prof.email || '939431931@qq.com';
      return { category: '👤 个人信息', icon: '📧', fieldName: '电子邮箱', value: val, key: 'email' };
    }

    // 11. 性别
    if (/性别|gender|sex/i.test(text)) {
      const val = prof.gender || '男';
      return { category: '👤 个人信息', icon: '🚻', fieldName: '性别', value: val, key: 'gender' };
    }

    // 12. 出生日期 / 年龄
    if (/出生日期|出生年月|出生时间|生日|birthday|birth|dob/i.test(text) || (/年龄|^age$/i.test(text) && !/年限/i.test(text))) {
      const isPureAge = /年龄|^age$/i.test(text) && !/出生/i.test(text);
      let val = '';
      if (isPureAge) {
        val = prof.age || (prof.gradYear ? `${2026 - (parseInt(prof.gradYear, 10) - 22)}岁` : '22岁');
      } else {
        val = prof.birthDate || (prof.gradYear ? `${parseInt(prof.gradYear, 10) - 22}-09-01` : '2002-09-01');
      }
      return { category: '👤 个人信息', icon: '🎂', fieldName: '出生日期 (年龄)', value: val, key: 'birthDate' };
    }

    // 13. 毕业院校
    if (/院校|学校|毕业学校|毕业院校|就读学校|school|university|college/i.test(text) && !/专业/i.test(text)) {
      const val = edu.school || basic.school || prof.school || '深圳大学';
      return { category: '🎓 教育背景', icon: '🎓', fieldName: '毕业院校', value: val, key: 'school' };
    }

    // 14. 所学专业
    if (/专业|major|所学专业|专业名称/i.test(text)) {
      const val = edu.major || prof.major || '数字媒体 / 运营策划';
      return { category: '🎓 教育背景', icon: '📚', fieldName: '所学专业', value: val, key: 'major' };
    }

    // 15. 最高学历 / 学历层次
    if (/最高学历|学历层次|文化程度|^学历$|^degree$/i.test(text) && !/学校|院校|专业/i.test(text)) {
      const val = prof.degree || edu.degree || '本科';
      return { category: '🎓 教育背景', icon: '📜', fieldName: '最高学历', value: val, key: 'degree' };
    }

    // 16. 毕业年份 / 届别
    if (/毕业时间|毕业年份|届别|毕业年月|graduation/i.test(text)) {
      const val = prof.gradYear || '2024';
      return { category: '🎓 教育背景', icon: '📅', fieldName: '毕业年份/届别', value: val, key: 'gradYear' };
    }

    // 17. 教育起止时间
    if (/在校时间|教育时间|学习时间|就读起止/i.test(text)) {
      const val = edu.period || '2020.09 - 2024.06';
      return { category: '🎓 教育背景', icon: '📅', fieldName: '教育起止时间', value: val, key: 'eduPeriod' };
    }

    // 18. 工作经验年限
    if (/工作经验|工作年限|从业年限|经验年限|experience\s*year/i.test(text)) {
      const val = prof.workYears || '2 年';
      return { category: '👤 个人信息', icon: '⏳', fieldName: '工作经验年限', value: val, key: 'workYears' };
    }

    // 19. 所在地 / 现居地 / 城市
    if (/所在地|现居地|居住地|现居住|现住址|现居|^城市$|^location$/i.test(text) && !/期望|意向|院校/i.test(text)) {
      const val = prof.city || basic.city || '广东深圳';
      return { category: '👤 个人信息', icon: '📍', fieldName: '所在地', value: val, key: 'city' };
    }

    // 20. 期望薪资 / 目标月薪
    if (/期望薪资|期望月薪|目标薪资|期望薪酬|薪资要求|expected\s*salary|target\s*salary/i.test(text) || (/salary|薪资|月薪/i.test(text) && !/当前|现/i.test(text))) {
      const val = prof.targetSalary || '10-20K';
      return { category: '🎯 求职意向', icon: '💰', fieldName: '期望薪资', value: val, key: 'targetSalary' };
    }

    // 21. 期望城市 / 工作地点
    if (/期望城市|意向城市|期望地点|意向地点|工作城市|目标城市|target\s*city/i.test(text)) {
      const val = prof.targetCity || prof.city || basic.city || '深圳';
      return { category: '🎯 求职意向', icon: '🌆', fieldName: '期望城市', value: val, key: 'targetCity' };
    }

    // 22. 期望职位 / 目标岗位
    if (/期望职位|目标岗位|意向岗位|求职意向|target\s*role/i.test(text) && !/工作经历/i.test(section)) {
      const val = prof.targetRole || basic.targetRole || '达人运营/电商运营专家';
      return { category: '🎯 求职意向', icon: '🎯', fieldName: '期望职位', value: val, key: 'targetRole' };
    }

    // 23. 项目经历
    if (/项目名称|项目名|project\s*name/i.test(text)) {
      const val = activeProj.name || '全域电商大促节点战役操盘';
      return { category: '🚀 项目经历', icon: '🚀', fieldName: '项目名称', value: val, key: 'projectName' };
    }
    if (/项目描述|项目背景|项目内容|project\s*desc/i.test(text)) {
      const val = activeProj.desc || '';
      return { category: '🚀 项目经历', icon: '📋', fieldName: '项目描述', value: val, key: 'projectDesc' };
    }
    if (/项目业绩|项目成果|成果与产出|project\s*result/i.test(text)) {
      const val = activeProj.results || '';
      return { category: '🚀 项目经历', icon: '🏆', fieldName: '项目业绩', value: val, key: 'projectResults' };
    }

    // 24. 自我评价 / 个人优势 (严格限定：只有明确指向自我评价、优势、自荐时才填入！)
    if (/自我评价|个人总结|自荐信?|个人优势|自我介绍|自评|核心亮点|优势与能力|summary|about\s*me|intro/i.test(text)) {
      const val = depot.selfIntro?.full || depot.selfIntro?.short || (depot.advantages || []).join('\n');
      return { category: '🌟 自我评价', icon: '🌟', fieldName: '自我评价与优势', value: val, key: 'selfIntro' };
    }

    // 25. 专业技能
    if (/技能|专业技能|擅长|工具|软件|skills?|technolog/i.test(text)) {
      const val = (depot.skills || []).join(', ');
      return { category: '🛠️ 专业技能', icon: '🛠️', fieldName: '专业技能清单', value: val, key: 'skills' };
    }

    // 26. 作品集链接
    if (/作品集|portfolio|链接|主页|个人网站|url|github/i.test(text)) {
      const val = basic.portfolioUrl || prof.portfolioUrl || '';
      return { category: '🔗 作品与成果', icon: '🔗', fieldName: '作品集链接', value: val, key: 'portfolio' };
    }

    // 27. 推荐码 / 内推码
    if (/内推码|推荐码|伯乐码|渠道码|referral|code/i.test(text)) {
      return { category: '🏷️ 招聘渠道', icon: '🏷️', fieldName: '推荐码/内推码', value: '', key: 'referralCode' };
    }

    // 28. 通用兜底：未明确识别的输入项，绝对不能强加自我评价长文！value 留空
    const cleanLabel = (labelText || '未识别输入项').slice(0, 20).trim();
    return {
      category: '📝 其他输入项',
      icon: '📝',
      fieldName: cleanLabel,
      value: '', // 空值！杜绝乱填长文
      key: 'generic'
    };
  }

  function scanCurrentPageInputs() {
    const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="image"]):not([type="reset"]), textarea, select, [contenteditable="true"], [role="textbox"]';
    const allEls = document.querySelectorAll(selector);
    const scanned = [];

    // 优先自动嗅探当前页面已填的公司名与简历库中哪一段经历最契合
    autoDetectMatchingWorkIndex();

    allEls.forEach((el, index) => {
      // 排除插件自身元素
      if (el.closest && el.closest('#jobcruise-quickfill-root')) return;

      // 排除隐藏元素与离屏元素
      if (el.offsetWidth === 0 && el.offsetHeight === 0) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 15 || rect.height < 15) return;
      if (rect.bottom < 0 || rect.top > (window.innerHeight + 5000)) return;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return;

      // 排除日历弹窗、下拉弹窗、分页器中的辅助元素
      if (el.closest('.ant-picker-dropdown, .el-picker-panel, .flatpickr-calendar, .datepicker, .el-select-dropdown, .ant-select-dropdown, .ant-pagination, .el-pagination, .pagination')) return;

      // 排除顶部和底部非表单搜索区
      if (el.closest('header, nav, footer, .header, .footer, .global-search, .search-bar')) return;

      // 排除辅助/只读隐藏组件 (如 aria-hidden, tabindex=-1 且无 value)
      if (el.getAttribute('aria-hidden') === 'true') return;
      if (el.tabIndex === -1 && !el.value && !el.placeholder) return;

      const meta = extractFieldMetadata(el);

      // 如果没有任何 label 且是纯数字或空，排除
      if (!meta.label && !el.placeholder && !el.name && !el.id) return;
      // 排除无意义的纯数字 label (如纯日历单元格 "9", "1", "2")
      if (/^\d{1,2}$/.test(meta.label) && !el.placeholder && !/month|day|year|date|age/i.test(el.name || el.id || '')) return;

      const match = classifyAndMatchInput(el, meta);
      const currentVal = el.value !== undefined ? String(el.value).trim() : (el.innerText || el.textContent || '').trim();

      scanned.push({
        id: `page_field_${index}`,
        element: el,
        labelText: meta.label || match.fieldName,
        isRequired: meta.isRequired,
        section: meta.section,
        matched: match,
        currentValue: currentVal,
        isFilled: !!currentVal
      });
    });

    currentScannedPageFields = scanned;
    updateFormMatchTabBadge();
    return scanned;
  }

  function fillAndHighlightElement(element, value) {
    if (!element) return false;
    const success = fillNativeInput(element, value);
    if (success) {
      try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const origOutline = element.style.outline;
        const origBoxShadow = element.style.boxShadow;
        const origTransition = element.style.transition;
        element.style.transition = 'all 0.25s ease-in-out';
        element.style.outline = '2px solid #00f2fe';
        element.style.boxShadow = '0 0 16px rgba(0, 242, 254, 0.7)';
        setTimeout(() => {
          element.style.outline = origOutline;
          element.style.boxShadow = origBoxShadow;
          element.style.transition = origTransition;
        }, 1200);
      } catch (e) {}
    }
    return success;
  }

  // 5. 创建 Shadow DOM 悬浮抽屉容器
  let shadowRoot = null;
  let container = null;

  function createQuickFillUI() {
    container = document.createElement('div');
    container.id = 'jobcruise-quickfill-root';
    shadowRoot = container.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        font-size: 13px;
        line-height: 1.5;
        color: #f1f5f9;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      /* 贴边悬浮触发把手 (Pill) */
      .quickfill-pill {
        position: fixed;
        right: 0;
        top: 38%;
        transform: translateY(-50%);
        z-index: 2147483645;
        background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);
        border: 1px solid #00f2fe;
        border-right: none;
        border-radius: 12px 0 0 12px;
        padding: 10px 10px 10px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: -4px 0 20px rgba(0, 242, 254, 0.25);
        user-select: none;
        transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .quickfill-pill:hover {
        transform: translateY(-50%) translateX(-4px);
        box-shadow: -6px 0 24px rgba(0, 242, 254, 0.45);
        background: #0f172a;
      }
      .pill-icon { font-size: 15px; }
      .pill-text {
        font-size: 12px;
        font-weight: 700;
        color: #00f2fe;
        writing-mode: vertical-lr;
        letter-spacing: 2px;
      }
      .pill-badge {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 6px #10b981;
      }

      /* 滑动抽屉主体 (无阻断浮动侧边栏，不遮挡左侧网页点击) */
      .quickfill-drawer {
        position: fixed;
        top: 0;
        right: -520px;
        width: 420px;
        max-width: 90vw;
        height: 100vh;
        z-index: 2147483647;
        background: rgba(11, 15, 25, 0.96);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-left: 1px solid rgba(0, 242, 254, 0.35);
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.65);
        display: flex;
        flex-direction: column;
        transition: right 0.28s cubic-bezier(0.16, 1, 0.3, 1);
        pointer-events: auto;
      }
      .quickfill-drawer.open {
        right: 0 !important;
      }
      .quickfill-drawer.pinned {
        border-left: 2px solid #00f2fe;
        box-shadow: -10px 0 40px rgba(0, 242, 254, 0.25), -4px 0 16px rgba(0, 0, 0, 0.8);
      }
      .quickfill-drawer.no-anim {
        transition: none !important;
      }

      /* 拖拽调节宽度手柄 */
      .drawer-resizer {
        position: absolute;
        top: 0;
        left: -4px;
        width: 8px;
        height: 100%;
        cursor: col-resize;
        z-index: 10;
        background: transparent;
        transition: background 0.15s;
      }
      .drawer-resizer:hover, .drawer-resizer.resizing {
        background: rgba(0, 242, 254, 0.4);
      }

      /* 固定常驻 Pin 按钮 */
      .drawer-pin-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #94a3b8;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        transition: all 0.18s;
        white-space: nowrap;
      }
      .drawer-pin-btn:hover {
        background: rgba(0, 242, 254, 0.15);
        border-color: #00f2fe;
        color: #00f2fe;
      }
      .drawer-pin-btn.active {
        background: linear-gradient(135deg, rgba(0, 242, 254, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%);
        border-color: #00f2fe;
        color: #00f2fe;
        box-shadow: 0 0 10px rgba(0, 242, 254, 0.35);
        font-weight: 700;
      }

      /* 抽屉顶部 */
      .drawer-header {
        padding: 14px 16px;
        background: #0f172a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .drawer-title-box {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .drawer-title {
        font-size: 14px;
        font-weight: 700;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .drawer-tag {
        font-size: 10.5px;
        padding: 2px 7px;
        border-radius: 10px;
        background: rgba(0, 242, 254, 0.15);
        color: #00f2fe;
        font-weight: 600;
      }
      .drawer-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 6px;
        transition: all 0.15s;
      }
      .drawer-close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
      }

      /* 目标输入框追踪横条 */
      .target-monitor-bar {
        padding: 8px 14px;
        background: rgba(16, 185, 129, 0.1);
        border-bottom: 1px solid rgba(16, 185, 129, 0.2);
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11.5px;
        color: #a7f3d0;
      }
      .target-monitor-bar.no-target {
        background: rgba(59, 130, 246, 0.08);
        border-bottom-color: rgba(59, 130, 246, 0.15);
        color: #93c5fd;
      }
      .monitor-left {
        display: flex;
        align-items: center;
        gap: 6px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .target-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 6px #10b981;
      }
      .target-dot.idle {
        background: #38bdf8;
        box-shadow: 0 0 6px #38bdf8;
      }

      /* 快速搜索框 */
      .drawer-search-wrap {
        padding: 10px 14px;
        background: #0f172a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .drawer-search-input {
        width: 100%;
        padding: 8px 12px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        color: #fff;
        font-size: 12px;
        outline: none;
        transition: border-color 0.2s;
      }
      .drawer-search-input:focus {
        border-color: #00f2fe;
        background: rgba(0, 242, 254, 0.05);
      }

      /* 抽屉滚动内容区 */
      .drawer-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px 14px;
      }
      .drawer-content::-webkit-scrollbar { width: 5px; }
      .drawer-content::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }

      /* 分类板块折叠卡片 */
      .category-section {
        margin-bottom: 14px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 8px;
        overflow: hidden;
      }
      .category-header {
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.7);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .category-title {
        font-size: 12px;
        font-weight: 700;
        color: #e2e8f0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .category-count {
        font-size: 11px;
        color: #64748b;
      }
      .category-body {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* 条目卡片 (支持点击整卡或按钮) */
      .fill-item-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 6px;
        padding: 8px 10px;
        transition: all 0.18s;
        position: relative;
      }
      .fill-item-card:hover {
        background: rgba(0, 242, 254, 0.05);
        border-color: rgba(0, 242, 254, 0.3);
      }
      .item-top-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .item-title {
        font-weight: 700;
        font-size: 12px;
        color: #38bdf8;
      }
      .item-sub {
        font-size: 11px;
        color: #94a3b8;
      }
      .item-body-text {
        font-size: 11.5px;
        color: #cbd5e1;
        line-height: 1.45;
        white-space: pre-wrap;
      }
      .item-actions {
        display: flex;
        gap: 5px;
        margin-top: 6px;
        flex-wrap: wrap;
      }

      /* 小按钮 */
      .action-mini-btn {
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
        color: #cbd5e1;
        transition: all 0.15s;
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .action-mini-btn:hover {
        background: rgba(0, 242, 254, 0.15);
        color: #00f2fe;
        border-color: #00f2fe;
      }
      .action-mini-btn.primary {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(0, 242, 254, 0.25) 100%);
        border-color: rgba(0, 242, 254, 0.4);
        color: #a7f3d0;
      }
      .action-mini-btn.primary:hover {
        background: #10b981;
        color: #0b0f19;
      }

      /* 技能 & 爱好 药丸胶囊 */
      .chips-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .quick-chip {
        padding: 4px 9px;
        border-radius: 12px;
        font-size: 11px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .quick-chip:hover {
        background: rgba(0, 242, 254, 0.15);
        border-color: #00f2fe;
        color: #00f2fe;
        transform: translateY(-1px);
      }
      .quick-chip.hobby {
        border-color: rgba(244, 63, 94, 0.3);
      }
      .quick-chip.hobby:hover {
        background: rgba(244, 63, 94, 0.18);
        border-color: #fb7185;
        color: #fecdd3;
      }

      /* 底部操作区 */
      .drawer-footer {
        padding: 12px 14px;
        background: #0f172a;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .btn-open-dash {
        background: linear-gradient(135deg, rgba(0, 242, 254, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%);
        border: 1px solid rgba(0, 242, 254, 0.35);
        color: #00f2fe;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 11.5px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
      }
      .btn-open-dash:hover {
        background: #00f2fe;
        color: #0b0f19;
      }

      /* 浮动操作气泡反馈 Toast */
      .quickfill-toast {
        position: absolute;
        top: 60px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #10b981 0%, #00f2fe 100%);
        color: #0b0f19;
        font-weight: 700;
        padding: 6px 14px;
        border-radius: 14px;
        font-size: 11px;
        box-shadow: 0 4px 16px rgba(0, 242, 254, 0.4);
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s;
        z-index: 100;
      }
      .quickfill-toast.show {
        opacity: 1;
      }
    `;

    shadowRoot.appendChild(style);

    // 抽屉 DOM 骨架 (无阻断浮动侧边栏)
    const uiWrap = document.createElement('div');
    uiWrap.innerHTML = `
      <!-- 边缘手柄 -->
      <div class="quickfill-pill" id="btn-toggle-drawer" title="点击展开/收起网申简历速填小抽屉">
        <span class="pill-icon">📋</span>
        <span class="pill-text">简历速填</span>
        <span class="pill-badge"></span>
      </div>

      <!-- 抽屉主体 (浮动Dock，不阻挡网页点击) -->
      <div class="quickfill-drawer" id="quickfill-drawer">
        <!-- 拖拽调节宽度手柄 -->
        <div class="drawer-resizer" id="drawer-resizer" title="按住左右拖动调节面板宽度"></div>

        <div class="drawer-header">
          <div class="drawer-title-box">
            <span class="drawer-title">📋 简历网申速填库</span>
            <span class="drawer-tag" id="depot-summary-tag">PRO</span>
          </div>
          <div style="display:flex; align-items:center; gap:5px;">
            <button class="drawer-pin-btn" id="btn-force-reload-extension" title="代码更新后一键完全重载插件并刷新页面" style="background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.4); font-size:11px; padding:3px 8px; border-radius:4px; cursor:pointer;">🔄 重载插件</button>
            <button class="drawer-pin-btn" id="btn-pin-drawer" title="固定常驻模式：开启后切换网页、翻页或刷新页面均保持展开">📌 固定常驻</button>
            <button class="drawer-close-btn" id="btn-collapse-drawer" title="收起面板" style="font-size:11.5px; padding:4px 7px; font-weight:700; color:#38bdf8; background:rgba(56,189,248,0.12); border-radius:6px;">收起 ⇥</button>
            <button class="drawer-close-btn" id="btn-close-drawer" title="关闭面板">✕</button>
          </div>
        </div>

        <!-- 焦点输入框指示器 -->
        <div class="target-monitor-bar no-target" id="target-monitor-bar">
          <div class="monitor-left">
            <span class="target-dot idle" id="target-dot"></span>
            <span id="target-input-name">未选定输入框 (点击页面任意输入框可直接填入)</span>
          </div>
          <span style="opacity: 0.8; font-size: 10px;">点击即填</span>
        </div>

        <!-- 三模视图切换 Tab -->
        <div class="drawer-mode-tabs" style="display:flex; background:#0f172a; border-bottom:1px solid rgba(255,255,255,0.08); padding:0 8px; gap:4px;">
          <button type="button" class="drawer-mode-tab active" id="drawer-tab-form-match" style="flex:1.25; padding:8px 4px; background:transparent; border:none; color:#00f2fe; border-bottom:2px solid #00f2fe; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap;">
            🎯 网页表单实时对照 <span class="tab-badge" id="form-match-tab-count" style="display:none; background:#10b981; color:#0b0f19; font-size:9.5px; font-weight:800; padding:1px 5px; border-radius:10px;">0</span>
          </button>
          <button type="button" class="drawer-mode-tab" id="drawer-tab-structured" style="flex:1; padding:8px 4px; background:transparent; border:none; color:#94a3b8; border-bottom:2px solid transparent; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;">⚡ 智能分类库</button>
          <button type="button" class="drawer-mode-tab" id="drawer-tab-raw" style="flex:1; padding:8px 4px; background:transparent; border:none; color:#94a3b8; border-bottom:2px solid transparent; font-size:11.5px; font-weight:600; cursor:pointer; white-space:nowrap;">📝 原始分段直达</button>
        </div>

        <!-- 快速搜索框 -->
        <div class="drawer-search-wrap">
          <input type="text" class="drawer-search-input" id="quickfill-search-input" placeholder="🔍 快速搜索经历/公司/技能/业绩/段落..." />
        </div>

        <!-- 滚动内容区 -->
        <div class="drawer-content" id="drawer-items-container">
          <!-- 动态渲染板块卡片 -->
        </div>

        <!-- 底部栏 -->
        <div class="drawer-footer">
          <button class="btn-open-dash" id="btn-open-depot-settings">⚙️ 上传新简历 / 重新解析 ↗</button>
          <span style="color:#10b981; font-weight:700; font-size:10.5px;">v2.11.0 最新引擎已激活</span>
        </div>

        <!-- 浮动通知 Toast -->
        <div class="quickfill-toast" id="quickfill-toast">✓ 已复制到剪贴板！</div>
      </div>
    `;

    shadowRoot.appendChild(uiWrap);
    document.body.appendChild(container);

    bindDrawerEvents();
    renderDrawerContent();
  }

  // 辅助转义函数
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 6. 更新当前聚焦的输入框提示
  function updateTargetIndicator() {
    if (!shadowRoot) return;
    const bar = shadowRoot.getElementById('target-monitor-bar');
    const dot = shadowRoot.getElementById('target-dot');
    const nameEl = shadowRoot.getElementById('target-input-name');
    if (!bar || !dot || !nameEl) return;

    if (lastTargetInput && document.body.contains(lastTargetInput)) {
      const label = getInputLabel(lastTargetInput);
      nameEl.textContent = `当前就绪框: 「${label}」`;
      bar.classList.remove('no-target');
      dot.classList.remove('idle');
    } else {
      nameEl.textContent = `未选定输入框 (点击页面任意输入框可直接填入)`;
      bar.classList.add('no-target');
      dot.classList.add('idle');
    }
  }

  // 7. 浮动 Toast 反馈
  function showToast(msg) {
    if (!shadowRoot) return;
    const toast = shadowRoot.getElementById('quickfill-toast');
    if (!toast) return;
    toast.textContent = msg || '✓ 已处理！';
    toast.classList.add('show');
    clearTimeout(toast.__timer);
    toast.__timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 1500);
  }

  // 8. 智能填入或复制分发
  function handleFillOrCopy(text, forceOnlyCopy = false) {
    if (!text) return;
    const cleanText = String(text).trim();

    copyToClipboard(cleanText, () => {
      if (!forceOnlyCopy && lastTargetInput && document.body.contains(lastTargetInput)) {
        const success = fillNativeInput(lastTargetInput, cleanText);
        if (success) {
          showToast(`✨ 已填入「${getInputLabel(lastTargetInput)}」并复制！`);
          return;
        }
      }
      showToast('✓ 已复制到剪贴板，可直接粘贴！');
    });
  }

  // 8.1 渲染网页输入项实时对照视图 (DOM 输入项嗅探与简历材料 1 对 1 精准映射)
  function renderFormMatchTabContent(containerEl, summaryTag, q) {
    const fields = scanCurrentPageInputs();
    const depot = resumeDepot || {};
    const works = depot.workExperiences || [];
    const projects = depot.projects || [];

    const matchedCount = fields.filter(f => f.matched && f.matched.value).length;
    if (summaryTag) {
      summaryTag.textContent = `${fields.length}表单项 · ${matchedCount}匹配`;
    }

    // 搜索过滤
    const filteredFields = fields.filter(f => {
      if (!q) return true;
      return (f.labelText || '').toLowerCase().includes(q) ||
             (f.section || '').toLowerCase().includes(q) ||
             (f.matched?.fieldName || '').toLowerCase().includes(q) ||
             String(f.matched?.value || '').toLowerCase().includes(q);
    });

    if (fields.length === 0) {
      containerEl.innerHTML = `
        <div style="padding:40px 16px; text-align:center; color:#94a3b8;">
          <div style="font-size:36px; margin-bottom:12px;">🔍</div>
          <div style="font-size:13px; font-weight:700; color:#e2e8f0; margin-bottom:6px;">当前网页暂未探测到可填写的表单输入项</div>
          <div style="font-size:11.5px; color:#64748b; line-height:1.5; margin-bottom:16px;">
            请确认已打开招聘网申页面或注册登记表单。<br>如果页面刚完成加载或刚刚点击了新增按钮，可尝试重新嗅探。
          </div>
          <div style="display:flex; justify-content:center; gap:8px;">
            <button class="action-mini-btn primary" id="btn-empty-rescan" style="padding:6px 14px; font-size:12px;">🔄 重新嗅探页面输入项</button>
            <button class="action-mini-btn" id="btn-goto-structured" style="padding:6px 14px; font-size:12px;">⚡ 切换到分类库</button>
          </div>
        </div>
      `;
      const btnRescan = containerEl.querySelector('#btn-empty-rescan');
      if (btnRescan) {
        btnRescan.onclick = () => {
          scanCurrentPageInputs();
          renderDrawerContent();
          showToast(`🔄 嗅探完成，共找到 ${currentScannedPageFields.length} 个表单项！`);
        };
      }
      const btnGo = containerEl.querySelector('#btn-goto-structured');
      if (btnGo) {
        btnGo.onclick = () => {
          const tabStructured = shadowRoot.getElementById('drawer-tab-structured');
          if (tabStructured) tabStructured.click();
        };
      }
      return;
    }

    // 顶部操作统计栏
    const topBar = document.createElement('div');
    topBar.style.cssText = `
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.9) 100%);
      border: 1px solid rgba(0, 242, 254, 0.25);
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    `;

    const matchRate = Math.round((matchedCount / fields.length) * 100);
    topBar.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:13px; font-weight:700; color:#00f2fe;">🎯 网页表单实时对齐</span>
          <span style="font-size:10.5px; background:rgba(16,185,129,0.15); color:#10b981; padding:2px 7px; border-radius:10px; font-weight:600;">匹配率 ${matchRate}%</span>
        </div>
        <button class="action-mini-btn" id="btn-rescan-page-fields" title="重新遍历页面 DOM 嗅探最新表单项" style="font-size:11px; padding:3px 8px;">
          🔄 重新嗅探
        </button>
      </div>
      <div style="font-size:11px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;">
        <span>共识别到 <b style="color:#fff;">${fields.length}</b> 个输入项，已精准匹配 <b style="color:#a7f3d0;">${matchedCount}</b> 项简历材料</span>
      </div>
      <button class="action-mini-btn primary" id="btn-fill-all-matched" style="width:100%; padding:8px 12px; justify-content:center; font-size:12px; font-weight:700; background:linear-gradient(135deg, #10b981 0%, #00f2fe 100%); color:#0b0f19; border:none; border-radius:6px; box-shadow:0 2px 10px rgba(0,242,254,0.3); cursor:pointer;">
        🚀 一键顺滑填入所有已匹配字段 (${matchedCount} 项)
      </button>
    `;
    containerEl.appendChild(topBar);

    // 绑定重新嗅探与一键填入
    const btnRescan = topBar.querySelector('#btn-rescan-page-fields');
    if (btnRescan) {
      btnRescan.onclick = () => {
        scanCurrentPageInputs();
        renderDrawerContent();
        showToast(`🔄 重新嗅探完成，共找到 ${currentScannedPageFields.length} 个表单项！`);
      };
    }

    const btnFillAll = topBar.querySelector('#btn-fill-all-matched');
    if (btnFillAll) {
      btnFillAll.onclick = async () => {
        btnFillAll.disabled = true;
        btnFillAll.innerHTML = '⏳ 正在拟人化顺滑填入中...';
        const targets = currentScannedPageFields.filter(f => f.matched && f.matched.value && f.element && document.body.contains(f.element));
        let filledCount = 0;
        for (const item of targets) {
          const ok = fillAndHighlightElement(item.element, item.matched.value);
          if (ok) {
            filledCount++;
            item.isFilled = true;
            item.currentValue = item.matched.value;
          }
          await new Promise(r => setTimeout(r, 120));
        }
        showToast(`🎉 成功填入 ${filledCount} 个匹配字段！`);
        btnFillAll.disabled = false;
        btnFillAll.innerHTML = `🚀 一键顺滑填入所有已匹配字段 (${matchedCount} 项)`;
        renderDrawerContent();
      };
    }

    // 经历全局切换栏 (当存在多段经历时，置顶展示当前对照段落，便于随时切换)
    if (works && works.length > 1) {
      const expBar = document.createElement('div');
      expBar.style.cssText = `
        background: rgba(30, 41, 59, 0.7);
        border: 1px solid rgba(0, 242, 254, 0.25);
        border-radius: 6px;
        padding: 7px 10px;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11.5px;
      `;
      expBar.innerHTML = `
        <div style="display:flex; align-items:center; gap:6px; color:#cbd5e1; font-weight:600;">
          <span>💼 对照工作经历：</span>
        </div>
        <select id="global-work-exp-picker" style="background:#0b0f19; border:1px solid rgba(0,242,254,0.3); color:#00f2fe; border-radius:4px; font-size:11px; padding:3px 6px; outline:none; cursor:pointer; max-width:210px;">
          ${works.map((w, idx) => `
            <option value="${idx}" ${idx === selectedWorkIndex ? 'selected' : ''}>第 ${idx + 1} 段: ${escapeHtml((w.company || '重点企业').slice(0, 10))} (${escapeHtml((w.period || '').slice(0, 7))})</option>
          `).join('')}
        </select>
      `;
      const select = expBar.querySelector('#global-work-exp-picker');
      if (select) {
        select.onchange = (e) => {
          selectedWorkIndex = parseInt(e.target.value, 10) || 0;
          scanCurrentPageInputs();
          renderDrawerContent();
          showToast(`✓ 已切换为第 ${selectedWorkIndex + 1} 段工作经历材料`);
        };
      }
      containerEl.appendChild(expBar);
    }

    // 按 Section 分组
    const sectionsMap = new Map();
    filteredFields.forEach(f => {
      const sec = f.section || '📝 表单信息';
      if (!sectionsMap.has(sec)) sectionsMap.set(sec, []);
      sectionsMap.get(sec).push(f);
    });

    sectionsMap.forEach((items, secTitle) => {
      const secEl = document.createElement('div');
      secEl.className = 'category-section';
      secEl.style.marginBottom = '12px';

      const isWorkSec = /工作经历|工作经验|实习/i.test(secTitle);
      const isProjSec = /项目经历|项目经验/i.test(secTitle);

      let switcherHtml = '';
      if (isWorkSec && works.length > 1) {
        switcherHtml = `
          <div style="display:flex; align-items:center; gap:4px; margin-left:auto; margin-right:8px;">
            <span style="font-size:10px; color:#94a3b8;">选定第</span>
            <select class="exp-switch-select" id="work-exp-picker" style="background:#0b0f19; border:1px solid rgba(0,242,254,0.3); color:#00f2fe; border-radius:4px; font-size:10.5px; padding:2px 4px; outline:none; cursor:pointer;">
              ${works.map((w, idx) => `
                <option value="${idx}" ${idx === selectedWorkIndex ? 'selected' : ''}>${idx + 1}段: ${escapeHtml(w.company?.slice(0, 10))} (${escapeHtml(w.period?.slice(0, 7))})</option>
              `).join('')}
            </select>
          </div>
        `;
      } else if (isProjSec && projects.length > 1) {
        switcherHtml = `
          <div style="display:flex; align-items:center; gap:4px; margin-left:auto; margin-right:8px;">
            <span style="font-size:10px; color:#94a3b8;">选定第</span>
            <select class="exp-switch-select" id="proj-exp-picker" style="background:#0b0f19; border:1px solid rgba(192,132,252,0.3); color:#c084fc; border-radius:4px; font-size:10.5px; padding:2px 4px; outline:none; cursor:pointer;">
              ${projects.map((p, idx) => `
                <option value="${idx}" ${idx === selectedProjectIndex ? 'selected' : ''}>${idx + 1}个: ${escapeHtml(p.name?.slice(0, 10))}</option>
              `).join('')}
            </select>
          </div>
        `;
      }

      secEl.innerHTML = `
        <div class="category-header">
          <span class="category-title">${secTitle}</span>
          <div style="display:flex; align-items:center;">
            ${switcherHtml}
            <span class="category-count">${items.length} 项</span>
          </div>
        </div>
        <div class="category-body" style="display:flex; flex-direction:column; gap:8px;"></div>
      `;

      // 绑定经历切换器事件
      const workSelect = secEl.querySelector('#work-exp-picker');
      if (workSelect) {
        workSelect.onchange = (e) => {
          e.stopPropagation();
          selectedWorkIndex = parseInt(e.target.value, 10) || 0;
          scanCurrentPageInputs();
          renderDrawerContent();
          showToast(`✓ 已切换为第 ${selectedWorkIndex + 1} 段工作经历材料`);
        };
      }

      const projSelect = secEl.querySelector('#proj-exp-picker');
      if (projSelect) {
        projSelect.onchange = (e) => {
          e.stopPropagation();
          selectedProjectIndex = parseInt(e.target.value, 10) || 0;
          scanCurrentPageInputs();
          renderDrawerContent();
          showToast(`✓ 已切换为第 ${selectedProjectIndex + 1} 个项目材料`);
        };
      }

      const bodyEl = secEl.querySelector('.category-body');

      items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'fill-item-card';
        card.style.position = 'relative';

        const hasVal = !!item.matched?.value;
        const valText = item.matched?.value || '';
        const curWebVal = item.currentValue;

        card.innerHTML = `
          <div class="item-top-row">
            <div style="display:flex; align-items:center; gap:5px; max-width:65%; overflow:hidden;">
              <span class="item-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHtml(item.labelText)}">
                ${escapeHtml(item.labelText)}
              </span>
              ${item.isRequired ? '<span style="color:#f43f5e; font-weight:700; font-size:13px;" title="必填字段">*</span>' : ''}
            </div>
            <div>
              ${curWebVal ? `
                <span style="font-size:10px; background:rgba(16,185,129,0.15); color:#34d399; padding:1px 6px; border-radius:10px;" title="网页当前值: ${escapeHtml(curWebVal)}">
                  🟢 网页已填: ${escapeHtml(curWebVal.slice(0, 8))}${curWebVal.length > 8 ? '...' : ''}
                </span>
              ` : `
                <span style="font-size:10px; background:rgba(56,189,248,0.12); color:#38bdf8; padding:1px 6px; border-radius:10px;">
                  ⚡ 待填入
                </span>
              `}
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:5px; padding:6px 8px; margin:4px 0; font-size:11.5px; color:${hasVal ? '#a7f3d0' : '#64748b'}; line-height:1.45; max-height:85px; overflow-y:auto; white-space:pre-wrap;">${hasVal ? escapeHtml(valText) : '（未找到对应的简历匹配项，可手动点选或复制）'}</div>
          <div class="item-actions" style="margin-top:6px;">
            ${hasVal ? `
              <button class="action-mini-btn primary btn-fill-single" data-idx="${item.id}">✨ 填入此项</button>
              <button class="action-mini-btn btn-copy-single" data-text="${encodeURIComponent(valText)}">📋 复制</button>
            ` : ''}
            <button class="action-mini-btn btn-locate-single" data-idx="${item.id}">🎯 定位输入框</button>
          </div>
        `;

        // 鼠标悬浮在卡片上，网页对应元素青色发光高亮联动
        card.addEventListener('mouseenter', () => {
          if (item.element && document.body.contains(item.element)) {
            item.element.__origOutline = item.element.style.outline;
            item.element.__origBoxShadow = item.element.style.boxShadow;
            item.element.__origTransition = item.element.style.transition;
            item.element.style.transition = 'box-shadow 0.2s ease, outline 0.2s ease';
            item.element.style.outline = '2px solid #00f2fe';
            item.element.style.boxShadow = '0 0 16px rgba(0, 242, 254, 0.85)';
          }
        });
        card.addEventListener('mouseleave', () => {
          if (item.element && document.body.contains(item.element)) {
            item.element.style.outline = item.element.__origOutline || '';
            item.element.style.boxShadow = item.element.__origBoxShadow || '';
            item.element.style.transition = item.element.__origTransition || '';
          }
        });

        // 绑定单项填入
        const btnFill = card.querySelector('.btn-fill-single');
        if (btnFill) {
          btnFill.onclick = (e) => {
            e.stopPropagation();
            if (item.element && valText) {
              const ok = fillAndHighlightElement(item.element, valText);
              if (ok) {
                item.isFilled = true;
                item.currentValue = valText;
                showToast(`✨ 已成功填入「${item.labelText}」！`);
                renderDrawerContent();
              }
            }
          };
        }

        // 绑定复制
        const btnCopy = card.querySelector('.btn-copy-single');
        if (btnCopy) {
          btnCopy.onclick = (e) => {
            e.stopPropagation();
            copyToClipboard(valText, () => {
              showToast(`📋 已复制「${item.labelText}」材料内容！`);
            });
          };
        }

        // 绑定定位
        const btnLocate = card.querySelector('.btn-locate-single');
        if (btnLocate) {
          btnLocate.onclick = (e) => {
            e.stopPropagation();
            if (item.element && document.body.contains(item.element)) {
              item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              item.element.focus();
              const origOutline = item.element.style.outline;
              item.element.style.outline = '2px solid #38bdf8';
              setTimeout(() => { item.element.style.outline = origOutline; }, 1000);
              showToast(`🎯 已定位至「${item.labelText}」输入框`);
            }
          };
        }

        bodyEl.appendChild(card);
      });

      containerEl.appendChild(secEl);
    });
  }

  // 9. 渲染抽屉各个分类面板
  function renderDrawerContent() {
    if (!shadowRoot) return;
    const containerEl = shadowRoot.getElementById('drawer-items-container');
    const summaryTag = shadowRoot.getElementById('depot-summary-tag');
    if (!containerEl) return;

    const depot = resumeDepot || {
      basicInfo: {},
      advantages: [
        '具备扎实电商大促操盘与达人内容矩阵拓展经验，擅长全链路落地与ROI优化。',
        '熟悉商业摄影布光与视觉分镜，能从审美与硬件特性双向赋能爆款打造。',
        '执行力强、注重数据量化归因，自驱敏捷，能快速在复杂业务中建立SOP。'
      ],
      workExperiences: [
        {
          company: '重点科技公司',
          role: '电商与达人运营专家',
          period: '2023.03 - 至今',
          desc: '负责电商大促全周期排期统筹、达人矩阵拓展及千川投放协同。',
          achievements: ['累计拓展高产出达人超500位，拉动活动期GMV突破8500万，ROI提升38%。', '搭建自动化履约跟进与脚本SOP，缩短内容交付周期40%。']
        }
      ],
      projects: [
        {
          name: '全域电商大促节点战役操盘',
          role: '项目总控',
          period: '2024.04 - 2024.06',
          desc: '联动供应链、运营、投放与主播专场，以数据看板驱动内容爆发。',
          results: '整体GMV达成率132%，打造3个千万直播间，新客成本下降24%。'
        }
      ],
      skills: ['达人拓展BD', '千川投放', '电商大促', '商业摄影', '分镜脚本', '数据分析(SQL/Excel)', '项目SOP'],
      hobbies: ['商业摄影与布光', '户外骑行', '主机与二次元游戏', '视觉设计', '数码极客测评'],
      selfIntro: {
        short: '执行力强，注重数据与实际成果落地，具备多业务跨领域实战经验，沟通协作敏捷高效、抗压即战力强。',
        full: '具备敏锐的商业与数据归因习惯，对工作充满敬业与自驱热情。在以往经历中注重以终为始建立规范化SOP，既有大促节点的冲刺爆发力，又有日常精细化运营与社群维护耐心。为人真诚好沟通，能迅速融入团队打赢硬仗。'
      },
      education: [
        { school: '重点大学', major: '数字媒体 / 运营策划', degree: '本科', period: '2020.09 - 2024.06' }
      ],
      rawSegments: []
    };

    containerEl.innerHTML = '';
    const q = (searchQuery || '').toLowerCase().trim();

    // 过滤辅助函数
    const matchesSearch = (...texts) => {
      if (!q) return true;
      return texts.some(t => String(t || '').toLowerCase().includes(q));
    };

    // 模式 C: 网页输入项实时对照视图
    if (currentDrawerTab === 'form-match') {
      renderFormMatchTabContent(containerEl, summaryTag, q);
      return;
    }

    // 模式 B: 原始分段直达视图
    if (currentDrawerTab === 'raw') {
      const segments = depot.rawSegments || [];
      const matched = segments.filter(s => matchesSearch(s.text));
      if (summaryTag) summaryTag.textContent = `${matched.length}段落`;

      if (matched.length === 0) {
        containerEl.innerHTML = `
          <div style="padding:32px 14px; text-align:center; color:#64748b; font-size:12px;">
            ${segments.length === 0 ? '暂无原始简历段落，可在控制后台上传简历解析！' : '未搜索到匹配的简历段落'}
          </div>
        `;
        return;
      }

      matched.forEach(seg => {
        const card = document.createElement('div');
        card.className = 'fill-item-card';
        card.style.marginBottom = '10px';
        card.innerHTML = `
          <div class="item-top-row">
            <span class="item-title">📄 段落 #${seg.index}</span>
            <span class="item-sub">${seg.charCount} 字</span>
          </div>
          <div class="item-body-text" style="line-height:1.5; font-size:11.5px; max-height:140px; overflow-y:auto; margin:6px 0;">${escapeHtml(seg.text)}</div>
          <div class="item-actions">
            <button class="action-mini-btn primary" data-fill="${encodeURIComponent(seg.text)}">⚡ 填入光标位置</button>
            <button class="action-mini-btn" data-copy="${encodeURIComponent(seg.text)}">📋 仅复制本段</button>
          </div>
        `;
        containerEl.appendChild(card);
      });
      bindItemActionEvents();
      return;
    }

    // 模式 A: 智能分类库视图
    if (summaryTag) {
      const wCount = depot.workExperiences?.length || 0;
      const pCount = depot.projects?.length || 0;
      summaryTag.textContent = `${wCount}工作 · ${pCount}项目`;
    }

    // 板块 1: 个人基础资料与网申信息 (合并 depot.basicInfo 与 applicantProfile)
    const baseInfo = depot.basicInfo || {};
    const prof = applicantProfile || {};
    const baseFields = [
      { label: '姓名', value: baseInfo.name || prof.name || '' },
      { label: '手机', value: baseInfo.phone || prof.phone || '' },
      { label: '微信', value: prof.wechat || '' },
      { label: '邮箱', value: baseInfo.email || prof.email || '' },
      { label: '毕业院校', value: baseInfo.school || prof.school || '' },
      { label: '作品集', value: baseInfo.portfolioUrl || prof.portfolioUrl || '' },
      { label: '目标岗位', value: baseInfo.targetRole || '' },
      { label: '职业定位', value: baseInfo.oneLiner || '' }
    ].filter(f => f.value && matchesSearch(f.label, f.value));

    if (baseFields.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">👤 基础网申档案</span>
          <span class="category-count">${baseFields.length} 项</span>
        </div>
        <div class="category-body">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            ${baseFields.map(f => `
              <div class="fill-item-card" style="padding:6px 8px; cursor:pointer;" data-fill="${encodeURIComponent(f.value)}">
                <div class="item-sub">${f.label}</div>
                <div class="item-body-text" style="font-weight:600; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${f.value}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 2: 核心个人优势
    const matchedAdv = (depot.advantages || []).filter(a => matchesSearch(a));
    if (matchedAdv.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">🌟 核心个人优势</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="action-mini-btn" id="btn-copy-all-adv-drawer">📋 复制全部</button>
            <span class="category-count">${matchedAdv.length} 条</span>
          </div>
        </div>
        <div class="category-body">
          ${matchedAdv.map((adv, idx) => `
            <div class="fill-item-card">
              <div class="item-body-text"><b>${idx + 1}.</b> ${adv}</div>
              <div class="item-actions">
                <button class="action-mini-btn primary" data-fill="${encodeURIComponent(adv)}">⚡ 填入/复制</button>
                <button class="action-mini-btn" data-copy="${encodeURIComponent(adv)}">📋 仅复制</button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 3: 工作经历列表
    const matchedWork = (depot.workExperiences || []).filter(w => matchesSearch(w.company, w.role, w.desc, (w.achievements || []).join(' ')));
    if (matchedWork.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">💼 历任工作实战</span>
          <span class="category-count">${matchedWork.length} 段</span>
        </div>
        <div class="category-body">
          ${matchedWork.map(w => {
            const fullWorkText = `【${w.company}】${w.role} (${w.period})\n职责：${w.desc}\n业绩：\n${(w.achievements || []).map(a => '• ' + a).join('\n')}`;
            return `
              <div class="fill-item-card">
                <div class="item-top-row">
                  <span class="item-title">${w.company}</span>
                  <span class="item-sub">📅 ${w.period}</span>
                </div>
                <div class="item-sub" style="margin-bottom:4px;">职位: <b style="color:#e2e8f0;">${w.role}</b></div>
                ${w.desc ? `<div class="item-body-text"><b>【职责】</b>: ${w.desc}</div>` : ''}
                ${w.achievements && w.achievements.length > 0 ? `
                  <div class="item-body-text" style="color:#a7f3d0; margin-top:4px;">
                    <b>【量化业绩】</b>:
                    ${w.achievements.map(a => `<div>• ${a}</div>`).join('')}
                  </div>
                ` : ''}
                <div class="item-actions">
                  <button class="action-mini-btn primary" data-fill="${encodeURIComponent(fullWorkText)}">⚡ 填入整段经历</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(w.company)}">📋 公司</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(w.role)}">📋 岗位</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(w.period)}">📋 时间</button>
                  ${w.desc ? `<button class="action-mini-btn" data-fill="${encodeURIComponent(w.desc)}">⚡ 填职责</button>` : ''}
                  ${w.achievements && w.achievements.length > 0 ? `<button class="action-mini-btn" data-fill="${encodeURIComponent(w.achievements.join('\n'))}">⚡ 填业绩</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 4: 重点项目经历
    const matchedProj = (depot.projects || []).filter(p => matchesSearch(p.name, p.role, p.desc, p.results));
    if (matchedProj.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">🚀 重点项目经历</span>
          <span class="category-count">${matchedProj.length} 个</span>
        </div>
        <div class="category-body">
          ${matchedProj.map(p => {
            const fullProjText = `【${p.name}】(${p.role} / ${p.period})\n描述：${p.desc}\n成果：${p.results}`;
            return `
              <div class="fill-item-card">
                <div class="item-top-row">
                  <span class="item-title" style="color:#c084fc;">${p.name}</span>
                  <span class="item-sub">📅 ${p.period}</span>
                </div>
                <div class="item-sub" style="margin-bottom:4px;">角色: <b style="color:#e2e8f0;">${p.role}</b></div>
                ${p.desc ? `<div class="item-body-text"><b>【描述】</b>: ${p.desc}</div>` : ''}
                ${p.results ? `<div class="item-body-text" style="color:#a7f3d0; margin-top:4px;"><b>【成果】</b>: ${p.results}</div>` : ''}
                <div class="item-actions">
                  <button class="action-mini-btn primary" data-fill="${encodeURIComponent(fullProjText)}">⚡ 填入整段项目</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(p.name)}">📋 名称</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(p.role)}">📋 角色</button>
                  ${p.desc ? `<button class="action-mini-btn" data-fill="${encodeURIComponent(p.desc)}">⚡ 填详情</button>` : ''}
                  ${p.results ? `<button class="action-mini-btn" data-fill="${encodeURIComponent(p.results)}">⚡ 填成果</button>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 5: 专业技能
    const matchedSkills = (depot.skills || []).filter(s => matchesSearch(s));
    if (matchedSkills.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">🛠️ 专业技能清单</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="action-mini-btn" id="btn-copy-all-skills-drawer">📋 复制全部</button>
            <span class="category-count">${matchedSkills.length} 个</span>
          </div>
        </div>
        <div class="category-body">
          <div class="chips-grid">
            ${matchedSkills.map(skill => `
              <div class="quick-chip" data-fill="${encodeURIComponent(skill)}">
                <span>${skill}</span>
                <span style="font-size:9px; opacity:0.6;">⚡</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 6: 兴趣爱好
    const matchedHobbies = (depot.hobbies || []).filter(h => matchesSearch(h));
    if (matchedHobbies.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">🎨 兴趣爱好与特长</span>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="action-mini-btn" id="btn-copy-all-hobbies-drawer">📋 复制全部</button>
            <span class="category-count">${matchedHobbies.length} 项</span>
          </div>
        </div>
        <div class="category-body">
          <div class="chips-grid">
            ${matchedHobbies.map(hobby => `
              <div class="quick-chip hobby" data-fill="${encodeURIComponent(hobby)}">
                <span>${hobby}</span>
                <span style="font-size:9px; opacity:0.6;">⚡</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 7: 自我介绍与评价
    const introShort = depot.selfIntro?.short || '';
    const introFull = depot.selfIntro?.full || '';
    if (matchesSearch('自我介绍', '评价', introShort, introFull)) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">💬 自我评价与介绍</span>
        </div>
        <div class="category-body">
          ${introShort ? `
            <div class="fill-item-card">
              <div class="item-sub" style="font-weight:700; color:#f472b6;">精简干练版 (100字内)</div>
              <div class="item-body-text" style="margin-top:3px;">${introShort}</div>
              <div class="item-actions">
                <button class="action-mini-btn primary" data-fill="${encodeURIComponent(introShort)}">⚡ 填入/复制精简版</button>
                <button class="action-mini-btn" data-copy="${encodeURIComponent(introShort)}">📋 仅复制</button>
              </div>
            </div>
          ` : ''}
          ${introFull ? `
            <div class="fill-item-card" style="margin-top:6px;">
              <div class="item-sub" style="font-weight:700; color:#f472b6;">完整详述版 (网申问卷)</div>
              <div class="item-body-text" style="margin-top:3px;">${introFull}</div>
              <div class="item-actions">
                <button class="action-mini-btn primary" data-fill="${encodeURIComponent(introFull)}">⚡ 填入/复制完整版</button>
                <button class="action-mini-btn" data-copy="${encodeURIComponent(introFull)}">📋 仅复制</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 板块 8: 教育背景
    const matchedEdu = (depot.education || []).filter(e => matchesSearch(e.school, e.major, e.degree));
    if (matchedEdu.length > 0) {
      const sec = document.createElement('div');
      sec.className = 'category-section';
      sec.innerHTML = `
        <div class="category-header">
          <span class="category-title">🎓 教育履历</span>
          <span class="category-count">${matchedEdu.length} 项</span>
        </div>
        <div class="category-body">
          ${matchedEdu.map(e => {
            const fullEdu = `${e.school} | ${e.major} | ${e.degree} (${e.period}) ${e.highlights || ''}`;
            return `
              <div class="fill-item-card">
                <div class="item-top-row">
                  <span class="item-title" style="color:#34d399;">${e.school}</span>
                  <span class="item-sub">📅 ${e.period}</span>
                </div>
                <div class="item-sub">${e.major} · ${e.degree}</div>
                <div class="item-actions">
                  <button class="action-mini-btn primary" data-fill="${encodeURIComponent(fullEdu)}">⚡ 填入/复制学历</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(e.school)}">📋 学校</button>
                  <button class="action-mini-btn" data-copy="${encodeURIComponent(e.major)}">📋 专业</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
      containerEl.appendChild(sec);
    }

    // 绑定所有的动态复制与填入事件
    bindItemActionEvents();
  }

  // 10. 绑定卡片与按钮事件
  function bindItemActionEvents() {
    if (!shadowRoot) return;

    // 填入/复制按钮
    shadowRoot.querySelectorAll('[data-fill]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const text = decodeURIComponent(el.getAttribute('data-fill'));
        handleFillOrCopy(text, false);
      };
    });

    // 仅复制按钮
    shadowRoot.querySelectorAll('[data-copy]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        const text = decodeURIComponent(el.getAttribute('data-copy'));
        handleFillOrCopy(text, true);
      };
    });

    // 复制全部优势
    const btnAllAdv = shadowRoot.getElementById('btn-copy-all-adv-drawer');
    if (btnAllAdv && resumeDepot?.advantages?.length) {
      btnAllAdv.onclick = (e) => {
        e.stopPropagation();
        const fullAdv = resumeDepot.advantages.map((a, i) => `${i + 1}. ${a}`).join('\n');
        handleFillOrCopy(fullAdv, false);
      };
    }

    // 复制全部技能
    const btnAllSkills = shadowRoot.getElementById('btn-copy-all-skills-drawer');
    if (btnAllSkills && resumeDepot?.skills?.length) {
      btnAllSkills.onclick = (e) => {
        e.stopPropagation();
        handleFillOrCopy(resumeDepot.skills.join(', '), false);
      };
    }

    // 复制全部爱好
    const btnAllHobbies = shadowRoot.getElementById('btn-copy-all-hobbies-drawer');
    if (btnAllHobbies && resumeDepot?.hobbies?.length) {
      btnAllHobbies.onclick = (e) => {
        e.stopPropagation();
        handleFillOrCopy(resumeDepot.hobbies.join(', '), false);
      };
    }
  }

  // 11. 绑定抽屉交互控制事件 (无模态浮动Dock，支持固定常驻与连续点选填表)
  function bindDrawerEvents() {
    const pill = shadowRoot.getElementById('btn-toggle-drawer');
    const drawer = shadowRoot.getElementById('quickfill-drawer');
    const btnPin = shadowRoot.getElementById('btn-pin-drawer');
    const btnCollapse = shadowRoot.getElementById('btn-collapse-drawer');
    const btnClose = shadowRoot.getElementById('btn-close-drawer');
    const searchInput = shadowRoot.getElementById('quickfill-search-input');
    const btnOpenDash = shadowRoot.getElementById('btn-open-depot-settings');
    const resizer = shadowRoot.getElementById('drawer-resizer');

    const updatePinButtonState = () => {
      if (!btnPin) return;
      if (isDrawerPinned) {
        btnPin.classList.add('active');
        btnPin.innerHTML = '📌 已固定常驻';
        btnPin.title = '当前为【已固定常驻】模式：切换网页、翻页或刷新页面均保持展开。点击可取消固定。';
        if (drawer) drawer.classList.add('pinned');
      } else {
        btnPin.classList.remove('active');
        btnPin.innerHTML = '📌 固定常驻';
        btnPin.title = '点击开启【固定常驻】模式：切换网页、翻页或刷新页面均保持展开在屏幕右侧。';
        if (drawer) drawer.classList.remove('pinned');
      }
    };

    const setupFormMutationObserver = () => {
      if (formObserver) formObserver.disconnect();
      formObserver = new MutationObserver(() => {
        if (!isDrawerOpen) return;
        clearTimeout(window.__quickfill_scan_timer);
        window.__quickfill_scan_timer = setTimeout(() => {
          const prevCount = currentScannedPageFields.length;
          const scanned = scanCurrentPageInputs();
          if (scanned.length !== prevCount) {
            if (currentDrawerTab === 'form-match') {
              renderDrawerContent();
            }
            updateFormMatchTabBadge();
          }
        }, 500);
      });
      try {
        formObserver.observe(document.body, { childList: true, subtree: true });
      } catch (e) {}
    };

    const updateTabStyles = () => {
      const tabFormMatch = shadowRoot.getElementById('drawer-tab-form-match');
      const tabStructured = shadowRoot.getElementById('drawer-tab-structured');
      const tabRaw = shadowRoot.getElementById('drawer-tab-raw');
      const allTabs = [
        { el: tabFormMatch, name: 'form-match' },
        { el: tabStructured, name: 'structured' },
        { el: tabRaw, name: 'raw' }
      ];
      allTabs.forEach(({ el, name }) => {
        if (!el) return;
        const isActive = name === currentDrawerTab;
        el.classList.toggle('active', isActive);
        el.style.borderBottomColor = isActive ? '#00f2fe' : 'transparent';
        el.style.color = isActive ? '#00f2fe' : '#94a3b8';
        el.style.fontWeight = isActive ? '700' : '600';
      });
    };

    const openDrawer = (isUserExplicit = false) => {
      isDrawerOpen = true;
      // 用户主动点开时，默认直接固定住
      if (isUserExplicit) {
        isDrawerPinned = true;
        chrome.storage.local.set({ quickfillDrawerPinned: true });
        showToast('📌 面板已固定常驻 (换网页/刷新不关闭)');
      }
      if (drawer) {
        drawer.classList.add('open');
      }
      if (pill) {
        pill.style.opacity = '0';
        pill.style.pointerEvents = 'none';
      }

      // 自动预先嗅探网页输入项
      const scanned = scanCurrentPageInputs();
      if (scanned.length > 0 && currentDrawerTab !== 'structured' && currentDrawerTab !== 'raw') {
        currentDrawerTab = 'form-match';
      }

      updatePinButtonState();
      updateTargetIndicator();
      updateTabStyles();
      setupFormMutationObserver();
      renderDrawerContent();

      if (isUserExplicit && searchInput) {
        setTimeout(() => searchInput.focus(), 150);
      }
    };

    const closeDrawer = () => {
      isDrawerOpen = false;
      isDrawerPinned = false;
      chrome.storage.local.set({ quickfillDrawerPinned: false });
      if (formObserver) {
        formObserver.disconnect();
        formObserver = null;
      }
      if (drawer) {
        drawer.classList.remove('open');
        drawer.classList.remove('pinned');
      }
      if (pill) {
        pill.style.opacity = '1';
        pill.style.pointerEvents = 'auto';
      }
      updatePinButtonState();
      showToast('✓ 面板已收起');
    };

    const toggleDrawer = () => {
      if (isDrawerOpen) closeDrawer();
      else openDrawer(true);
    };

    if (pill) pill.addEventListener('click', toggleDrawer);
    if (btnCollapse) btnCollapse.addEventListener('click', closeDrawer);
    if (btnClose) btnClose.addEventListener('click', closeDrawer);

    if (btnPin) {
      btnPin.addEventListener('click', (e) => {
        e.stopPropagation();
        isDrawerPinned = !isDrawerPinned;
        chrome.storage.local.set({ quickfillDrawerPinned: isDrawerPinned });
        updatePinButtonState();
        if (isDrawerPinned) {
          showToast('📌 面板已固定常驻 (换网页/刷新不关闭)');
        } else {
          showToast('📍 已取消固定常驻 (下次需手动点开)');
        }
      });
    }

    // 拖拽左侧边缘调整抽屉宽度
    if (resizer && drawer) {
      let isResizing = false;
      let startX = 0;
      let startWidth = 420;

      resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = drawer.getBoundingClientRect().width;
        drawer.classList.add('no-anim');
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dx = startX - e.clientX;
        const newWidth = Math.max(340, Math.min(800, startWidth + dx));
        drawer.style.width = `${newWidth}px`;
      });

      window.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          drawer.classList.remove('no-anim');
          resizer.classList.remove('resizing');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          const finalWidth = parseInt(drawer.style.width, 10);
          if (finalWidth) {
            chrome.storage.local.set({ quickfillDrawerWidth: finalWidth });
          }
        }
      });
    }

    // 重载插件并刷新页面按钮
    const btnReloadExt = shadowRoot.getElementById('btn-force-reload-extension');
    if (btnReloadExt) {
      btnReloadExt.addEventListener('click', (e) => {
        e.stopPropagation();
        btnReloadExt.textContent = '⏳ 重载中...';
        btnReloadExt.disabled = true;
        try {
          chrome.runtime.sendMessage({ type: 'RELOAD_EXTENSION' }, () => {
            setTimeout(() => {
              window.location.reload();
            }, 300);
          });
        } catch (err) {
          window.location.reload();
        }
      });
    }

    // 初始化恢复用户自定义宽度与固定常驻状态
    chrome.storage.local.get(['quickfillDrawerPinned', 'quickfillDrawerWidth'], (res) => {
      if (res && res.quickfillDrawerWidth && drawer) {
        drawer.style.width = `${res.quickfillDrawerWidth}px`;
      }
      if (res && res.quickfillDrawerPinned) {
        isDrawerPinned = true;
        openDrawer(false);
      }
    });

    // 抽屉三模切换 Tab
    const tabFormMatch = shadowRoot.getElementById('drawer-tab-form-match');
    const tabStructured = shadowRoot.getElementById('drawer-tab-structured');
    const tabRaw = shadowRoot.getElementById('drawer-tab-raw');

    const switchTab = (tabName) => {
      currentDrawerTab = tabName;
      updateTabStyles();
      renderDrawerContent();
    };

    if (tabFormMatch) tabFormMatch.addEventListener('click', () => switchTab('form-match'));
    if (tabStructured) tabStructured.addEventListener('click', () => switchTab('structured'));
    if (tabRaw) tabRaw.addEventListener('click', () => switchTab('raw'));

    // 搜索实时过滤
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderDrawerContent();
      });
    }

    // 跳转后台管理
    if (btnOpenDash) {
      btnOpenDash.addEventListener('click', () => {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            type: 'OPEN_PAGE',
            url: chrome.runtime.getURL('dashboard/dashboard.html?tab=view-resume-depot')
          });
        }
      });
    }

    // 外部自定义事件唤起 (支持 Popup / 快捷键在任何网页主动唤起)
    window.addEventListener('JOBCRUISE_TOGGLE_QUICKFILL', () => {
      if (!container) createQuickFillUI();
      toggleDrawer();
    });
    window.addEventListener('JOBCRUISE_OPEN_QUICKFILL', () => {
      if (!container) createQuickFillUI();
      openDrawer(true);
    });

    // 贴边把手支持鼠标按住垂直拖动
    if (pill) {
      let isDragging = false;
      let startY = 0;
      let initialTop = 0;

      pill.addEventListener('mousedown', (e) => {
        isDragging = true;
        startY = e.clientY;
        initialTop = pill.getBoundingClientRect().top;
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dy = e.clientY - startY;
        const newTop = Math.max(60, Math.min(window.innerHeight - 60, initialTop + dy));
        pill.style.top = `${newTop}px`;
        pill.style.transform = 'none';
      });

      window.addEventListener('mouseup', () => {
        isDragging = false;
      });
    }
  }

  // 12. 页面加载完成后智能按需注入
  loadDepotData(() => {
    const initOrListen = () => {
      if (shouldEnableQuickFill()) {
        createQuickFillUI();
      } else {
        // 非招聘页面默认静默，但依然监听主动唤起事件
        window.addEventListener('JOBCRUISE_OPEN_QUICKFILL', () => {
          if (!container) createQuickFillUI();
          if (shadowRoot) {
            const drawer = shadowRoot.getElementById('quickfill-drawer');
            if (drawer) drawer.classList.add('open');
          }
        });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initOrListen);
    } else {
      initOrListen();
    }
  });
})();
