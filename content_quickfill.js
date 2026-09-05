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
  let searchQuery = '';
  let currentDrawerTab = 'structured'; // 'structured' | 'raw'

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
      const isTextarea = element.tagName === 'TEXTAREA';
      const isInput = element.tagName === 'INPUT';

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

      /* 抽屉背部微暗遮罩 */
      .quickfill-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.25);
        z-index: 2147483646;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s ease;
      }
      .quickfill-backdrop.open {
        opacity: 1;
        pointer-events: auto;
      }

      /* 滑动抽屉主体 */
      .quickfill-drawer {
        position: fixed;
        top: 0;
        right: -450px;
        width: 430px;
        max-width: 95vw;
        height: 100vh;
        z-index: 2147483647;
        background: #0b0f19;
        border-left: 1px solid rgba(0, 242, 254, 0.3);
        box-shadow: -10px 0 36px rgba(0, 0, 0, 0.7);
        display: flex;
        flex-direction: column;
        transition: right 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .quickfill-drawer.open {
        right: 0;
      }

      /* 抽屉顶部 */
      .drawer-header {
        padding: 14px 16px;
        background: #0f172a;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
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

    // 抽屉 DOM 骨架
    const uiWrap = document.createElement('div');
    uiWrap.innerHTML = `
      <!-- 边缘手柄 -->
      <div class="quickfill-pill" id="btn-toggle-drawer" title="点击展开/收起网申简历速填小抽屉">
        <span class="pill-icon">📋</span>
        <span class="pill-text">简历速填</span>
        <span class="pill-badge"></span>
      </div>

      <!-- 背景遮罩 -->
      <div class="quickfill-backdrop" id="quickfill-backdrop"></div>

      <!-- 抽屉主体 -->
      <div class="quickfill-drawer" id="quickfill-drawer">
        <div class="drawer-header">
          <div class="drawer-title-box">
            <span class="drawer-title">📋 简历网申速填库</span>
            <span class="drawer-tag" id="depot-summary-tag">PRO</span>
          </div>
          <button class="drawer-close-btn" id="btn-close-drawer">✕</button>
        </div>

        <!-- 焦点输入框指示器 -->
        <div class="target-monitor-bar no-target" id="target-monitor-bar">
          <div class="monitor-left">
            <span class="target-dot idle" id="target-dot"></span>
            <span id="target-input-name">未选定输入框 (点击页面任意输入框可直接填入)</span>
          </div>
          <span style="opacity: 0.8; font-size: 10px;">点击即填</span>
        </div>

        <!-- 双模视图切换 Tab -->
        <div class="drawer-mode-tabs" style="display:flex; background:#0f172a; border-bottom:1px solid rgba(255,255,255,0.08); padding:0 12px; gap:8px;">
          <button type="button" class="drawer-mode-tab active" id="drawer-tab-structured" style="flex:1; padding:8px 0; background:transparent; border:none; color:#00f2fe; border-bottom:2px solid #00f2fe; font-size:12px; font-weight:700; cursor:pointer;">⚡ 智能分类库</button>
          <button type="button" class="drawer-mode-tab" id="drawer-tab-raw" style="flex:1; padding:8px 0; background:transparent; border:none; color:#94a3b8; border-bottom:2px solid transparent; font-size:12px; font-weight:600; cursor:pointer;">📝 原始分段直达</button>
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
          <span style="color:#64748b; font-size:10px;">支持纯复制与填入</span>
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

  // 11. 绑定抽屉交互控制事件
  function bindDrawerEvents() {
    const pill = shadowRoot.getElementById('btn-toggle-drawer');
    const drawer = shadowRoot.getElementById('quickfill-drawer');
    const backdrop = shadowRoot.getElementById('quickfill-backdrop');
    const btnClose = shadowRoot.getElementById('btn-close-drawer');
    const searchInput = shadowRoot.getElementById('quickfill-search-input');
    const btnOpenDash = shadowRoot.getElementById('btn-open-depot-settings');

    const openDrawer = () => {
      isDrawerOpen = true;
      drawer.classList.add('open');
      backdrop.classList.add('open');
      updateTargetIndicator();
      if (searchInput) searchInput.focus();
    };

    const closeDrawer = () => {
      isDrawerOpen = false;
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
    };

    const toggleDrawer = () => {
      if (isDrawerOpen) closeDrawer();
      else openDrawer();
    };

    if (pill) pill.addEventListener('click', toggleDrawer);
    if (btnClose) btnClose.addEventListener('click', closeDrawer);
    if (backdrop) backdrop.addEventListener('click', closeDrawer);

    // 抽屉双模切换 Tab
    const tabStructured = shadowRoot.getElementById('drawer-tab-structured');
    const tabRaw = shadowRoot.getElementById('drawer-tab-raw');
    if (tabStructured && tabRaw) {
      tabStructured.addEventListener('click', () => {
        currentDrawerTab = 'structured';
        tabStructured.classList.add('active');
        tabStructured.style.borderBottomColor = '#00f2fe';
        tabStructured.style.color = '#00f2fe';
        tabRaw.classList.remove('active');
        tabRaw.style.borderBottomColor = 'transparent';
        tabRaw.style.color = '#94a3b8';
        renderDrawerContent();
      });

      tabRaw.addEventListener('click', () => {
        currentDrawerTab = 'raw';
        tabRaw.classList.add('active');
        tabRaw.style.borderBottomColor = '#00f2fe';
        tabRaw.style.color = '#00f2fe';
        tabStructured.classList.remove('active');
        tabStructured.style.borderBottomColor = 'transparent';
        tabStructured.style.color = '#94a3b8';
        renderDrawerContent();
      });
    }

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

    // 外部自定义事件唤起
    window.addEventListener('JOBCRUISE_TOGGLE_QUICKFILL', toggleDrawer);
    window.addEventListener('JOBCRUISE_OPEN_QUICKFILL', openDrawer);

    // 贴边把手支持鼠标按住垂直拖动
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

  // 12. 页面加载完成后注入
  loadDepotData(() => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', createQuickFillUI);
    } else {
      createQuickFillUI();
    }
  });
})();
