/**
 * SubTwin - 视频字幕翻译插件
 * 支持平台：YouTube、Bilibili
 * - 多翻译源：Google、MyMemory、DeepL、百度、DeepSeek、OpenAI、GLM
 * - 源语言自动检测
 * - 自定义 API 端点
 */

(function () {
  "use strict";

  console.log("[SubTwin] 插件已加载");

  // 平台配置
  const PLATFORM_CONFIG = {
    youtube: {
      name: "YouTube",
      captionContainer: ".ytp-caption-window-container",
      captionSegment: ".ytp-caption-segment",
      player: ".html5-video-player",
      rightControls: ".ytp-right-controls",
      buttonClass: "ytp-button",
      buttonWidth: "48px",
      iconSize: "24",
    },
    bilibili: {
      name: "Bilibili",
      captionContainer: ".bpx-player-subtitle-panel",
      captionSegment: ".bpx-player-subtitle-panel-text",
      player: ".bpx-player-container",
      rightControls: ".bpx-player-control-bottom-right",
      buttonClass: "bpx-player-ctrl-btn",
      buttonWidth: "36px",
      iconSize: "18",
    },
  };

  // 平台检测
  function detectPlatform() {
    const host = window.location.hostname;
    if (host.includes("youtube.com")) return "youtube";
    if (host.includes("bilibili.com")) return "bilibili";
    return null;
  }

  let currentPlatform = detectPlatform();
  let platformConfig = currentPlatform ? PLATFORM_CONFIG[currentPlatform] : null;

  if (!currentPlatform) {
    console.log("[SubTwin] 不支持的平台");
    return;
  }

  console.log(`[SubTwin] 检测到平台: ${platformConfig.name}`);

  // 预翻译配置
  const PRE_TRANSLATE_MIN_LENGTH = 15;
  const PRE_TRANSLATE_DEBOUNCE = 300;

  // 默认设置
  let settings = {
    enabled: true,
    translator: "google",
    apiKey: "",
    baiduAppId: "",
    apiEndpoint: "",
    aiModel: "",
    sourceLang: "auto",
    targetLang: "zh-CN",
    fontSize: "1.8",
    fontColor: "#ffd700",
    bgOpacity: "0.75",
  };

  let observer = null;
  let currentText = "";
  let lastOutputText = "";
  let translationOverlay = null;

  // 翻译缓存
  let translationCache = new Map();
  let pendingTranslations = new Map();
  let preTranslateTimer = null;

  // 拖拽状态
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };
  let savedPosition = null; // { x百分比, y百分比 }

  // 播放器开关按钮和设置面板
  let toggleButton = null;
  let settingsPanel = null;

  // ========== 缓存持久化 ==========

  function getCacheKey(text) {
    return `${settings.translator}|${settings.sourceLang}|${settings.targetLang}|${text}`;
  }

  async function loadCache() {
    try {
      const result = await chrome.storage.local.get("translationCache");
      if (result.translationCache) {
        const cached = JSON.parse(result.translationCache);
        const prefix = `${settings.translator}|${settings.sourceLang}|${settings.targetLang}|`;
        for (const [key, value] of Object.entries(cached)) {
          if (key.startsWith(prefix)) {
            translationCache.set(key, value);
          }
        }
        console.log(`[SubTwin] 已加载 ${translationCache.size} 条缓存`);
      }
    } catch (e) {
      console.log("[SubTwin] 加载缓存失败:", e);
    }
  }

  let saveCacheTimer = null;
  function saveCache() {
    if (saveCacheTimer) return;
    saveCacheTimer = setTimeout(async () => {
      saveCacheTimer = null;
      try {
        const cacheObj = Object.fromEntries(translationCache);
        await chrome.storage.local.set({
          translationCache: JSON.stringify(cacheObj),
        });
      } catch (e) {
        console.log("[SubTwin] 保存缓存失败:", e);
      }
    }, 2000);
  }

  // ========== 设置管理 ==========

  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(settings);
      settings = { ...settings, ...stored };

      // 加载保存的位置
      const posResult = await chrome.storage.sync.get("subtitlePosition");
      if (posResult.subtitlePosition) {
        savedPosition = posResult.subtitlePosition;
      }

      console.log("[SubTwin] 设置已加载:", settings);
      applyStyles();
      await loadCache();
    } catch (e) {
      console.log("[SubTwin] 使用默认设置");
    }
  }

  function applyStyles() {
    if (!translationOverlay) return;

    const textElement = translationOverlay.querySelector("#subtwin-text");
    if (textElement) {
      textElement.style.fontSize = `${settings.fontSize}em`;
      textElement.style.color = settings.fontColor;
      textElement.style.background = `rgba(8, 8, 8, ${settings.bgOpacity})`;
    }
  }

  // ========== UI：翻译字幕显示 ==========

  /**
   * 创建播放器上的开关按钮和设置面板
   */
  function createToggleButton() {
    if (toggleButton) {
      updateToggleButton();
      return;
    }

    const rightControls = document.querySelector(platformConfig.rightControls);
    if (!rightControls) {
      setTimeout(createToggleButton, 1000);
      return;
    }

    // 创建按钮容器
    toggleButton = document.createElement("button");
    toggleButton.className = `${platformConfig.buttonClass} subtwin-toggle`;
    toggleButton.title = "SubTwin 翻译设置";
    toggleButton.style.cssText = `
      position: relative;
      width: ${platformConfig.buttonWidth};
      height: 100%;
      padding: 0;
      border: none;
      background: transparent;
      cursor: pointer;
      opacity: 0.9;
      transition: opacity 0.1s;
    `;

    const iconSize = platformConfig.iconSize;
    const statusSize = currentPlatform === 'bilibili' ? '6' : '8';
    const statusBottom = currentPlatform === 'bilibili' ? '4px' : '6px';
    const statusRight = currentPlatform === 'bilibili' ? '6px' : '8px';

    toggleButton.innerHTML = `
      <svg viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" style="fill: currentColor;">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      <div class="subtwin-status" style="
        position: absolute;
        bottom: ${statusBottom};
        right: ${statusRight};
        width: ${statusSize}px;
        height: ${statusSize}px;
        border-radius: 50%;
        background: ${settings.enabled ? "#4CAF50" : "#666"};
        border: 1.5px solid rgba(0,0,0,0.3);
        transition: background 0.2s;
      "></div>
    `;

    toggleButton.addEventListener("mouseenter", () => {
      toggleButton.style.opacity = "1";
      // 悬停时检测字幕，如果没有就显示提示
      if (!hasCaptions()) {
        showToast("未检测到字幕，无法开启翻译");
      }
    });

    toggleButton.addEventListener("mouseleave", () => {
      toggleButton.style.opacity = "0.9";
    });

    toggleButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSettingsPanel();
    });

    rightControls.insertBefore(toggleButton, rightControls.firstChild);

    // 创建设置面板
    createSettingsPanel();

    // 点击外部关闭面板
    document.addEventListener("click", (e) => {
      if (
        settingsPanel &&
        !settingsPanel.contains(e.target) &&
        !toggleButton.contains(e.target)
      ) {
        hideSettingsPanel();
      }
    });

    console.log("[SubTwin] 播放器设置按钮已创建");
  }

  /**
   * 创建设置面板
   */
  function createSettingsPanel() {
    const playerContainer = document.querySelector(platformConfig.player);
    if (!playerContainer) return;

    settingsPanel = document.createElement("div");
    settingsPanel.id = "subtwin-settings-panel";
    settingsPanel.style.cssText = `
      position: absolute;
      width: 180px;
      background: rgba(28, 28, 28, 0.95);
      border-radius: 8px;
      padding: 8px 0;
      z-index: 100;
      display: none;
      color: #fff;
      font-family: "YouTube Sans", Roboto, sans-serif;
      font-size: 13px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
    `;

    settingsPanel.innerHTML = `
      <style>
        #subtwin-settings-panel * {
          box-sizing: border-box;
        }
        #subtwin-settings-panel .menu-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          cursor: pointer;
          transition: background 0.15s;
        }
        #subtwin-settings-panel .menu-item:hover {
          background: rgba(255,255,255,0.1);
        }
        #subtwin-settings-panel .menu-label {
          font-size: 13px;
          color: rgba(255,255,255,0.9);
        }
        #subtwin-settings-panel .menu-value {
          font-size: 12px;
          color: rgba(255,255,255,0.5);
        }
        #subtwin-settings-panel .toggle-switch {
          position: relative;
          width: 36px;
          height: 20px;
        }
        #subtwin-settings-panel .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        #subtwin-settings-panel .toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #555;
          transition: 0.2s;
          border-radius: 20px;
        }
        #subtwin-settings-panel .toggle-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: 0.2s;
          border-radius: 50%;
        }
        #subtwin-settings-panel input:checked + .toggle-slider {
          background-color: #3ea6ff;
        }
        #subtwin-settings-panel input:checked + .toggle-slider:before {
          transform: translateX(16px);
        }
        #subtwin-settings-panel .divider {
          height: 1px;
          background: rgba(255,255,255,0.1);
          margin: 4px 0;
        }
        #subtwin-settings-panel select {
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.5);
          font-size: 12px;
          cursor: pointer;
          text-align: right;
          outline: none;
          -webkit-appearance: none;
          padding-right: 2px;
        }
        #subtwin-settings-panel select option {
          background: #222;
          color: #fff;
        }
        #subtwin-settings-panel .color-wrapper {
          position: relative;
          width: 20px;
          height: 20px;
        }
        #subtwin-settings-panel .color-wrapper input[type="color"] {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          border: none;
          padding: 0;
        }
        #subtwin-settings-panel .color-dot {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.3);
          pointer-events: none;
        }
      </style>

      <div class="menu-item">
        <span class="menu-label">翻译字幕</span>
        <label class="toggle-switch">
          <input type="checkbox" id="subtwin-enabled" ${settings.enabled ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="divider"></div>

      <div class="menu-item">
        <span class="menu-label">翻译源</span>
        <select id="subtwin-translator">
          <option value="google">Google</option>
          <option value="mymemory">MyMemory</option>
          <option value="deepl">DeepL</option>
          <option value="baidu">百度</option>
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="glm">GLM</option>
        </select>
      </div>

      <div class="menu-item">
        <span class="menu-label">源语言</span>
        <select id="subtwin-source">
          <option value="auto">自动</option>
          <option value="en">英语</option>
          <option value="ja">日语</option>
          <option value="ko">韩语</option>
          <option value="zh-CN">中文</option>
        </select>
      </div>

      <div class="menu-item">
        <span class="menu-label">目标语言</span>
        <select id="subtwin-target">
          <option value="zh-CN">简体中文</option>
          <option value="zh-TW">繁体中文</option>
          <option value="en">英语</option>
          <option value="ja">日语</option>
          <option value="ko">韩语</option>
        </select>
      </div>

      <div class="divider"></div>

      <div class="menu-item">
        <span class="menu-label">字体大小</span>
        <select id="subtwin-fontsize">
          <option value="1.2">小</option>
          <option value="1.5">中</option>
          <option value="1.8">大</option>
          <option value="2.2">特大</option>
        </select>
      </div>

      <div class="menu-item">
        <span class="menu-label">字体颜色</span>
        <div class="color-wrapper">
          <div class="color-dot" id="subtwin-colordot" style="background: ${settings.fontColor};"></div>
          <input type="color" id="subtwin-colorpicker" value="${settings.fontColor}">
        </div>
      </div>

      <div class="divider"></div>

      <div class="menu-item" id="subtwin-reset">
        <span class="menu-label">重置位置</span>
        <span class="menu-value">↺</span>
      </div>
    `;

    playerContainer.appendChild(settingsPanel);
    bindPanelEvents();
  }

  /**
   * 绑定面板事件
   */
  function bindPanelEvents() {
    // 开关
    const enabledCheckbox = settingsPanel.querySelector("#subtwin-enabled");
    enabledCheckbox.addEventListener("change", async () => {
      settings.enabled = enabledCheckbox.checked;
      await saveAndApplySettings();
      updateToggleButton();
      if (!settings.enabled) hideTranslation();
    });

    // 翻译源
    const translatorSelect = settingsPanel.querySelector("#subtwin-translator");
    translatorSelect.value = settings.translator;
    translatorSelect.addEventListener("change", async () => {
      settings.translator = translatorSelect.value;
      await saveAndApplySettings();
    });

    // 源语言
    const sourceSelect = settingsPanel.querySelector("#subtwin-source");
    sourceSelect.value = settings.sourceLang;
    sourceSelect.addEventListener("change", async () => {
      settings.sourceLang = sourceSelect.value;
      await saveAndApplySettings();
    });

    // 目标语言
    const targetSelect = settingsPanel.querySelector("#subtwin-target");
    targetSelect.value = settings.targetLang;
    targetSelect.addEventListener("change", async () => {
      settings.targetLang = targetSelect.value;
      await saveAndApplySettings();
    });

    // 字体大小
    const fontSizeSelect = settingsPanel.querySelector("#subtwin-fontsize");
    // 匹配最接近的选项
    const sizes = ["1.2", "1.5", "1.8", "2.2"];
    const closest = sizes.reduce((a, b) =>
      Math.abs(parseFloat(b) - parseFloat(settings.fontSize)) <
      Math.abs(parseFloat(a) - parseFloat(settings.fontSize))
        ? b
        : a,
    );
    fontSizeSelect.value = closest;
    fontSizeSelect.addEventListener("change", async () => {
      settings.fontSize = fontSizeSelect.value;
      await saveAndApplySettings();
    });

    // 字体颜色
    const colorPicker = settingsPanel.querySelector("#subtwin-colorpicker");
    const colorDot = settingsPanel.querySelector("#subtwin-colordot");
    colorPicker.addEventListener("input", async () => {
      colorDot.style.background = colorPicker.value;
      settings.fontColor = colorPicker.value;
      await saveAndApplySettings();
    });

    // 重置位置
    const resetBtn = settingsPanel.querySelector("#subtwin-reset");
    resetBtn.addEventListener("click", () => {
      resetPosition();
      hideSettingsPanel();
    });
  }

  /**
   * 保存并应用设置
   */
  async function saveAndApplySettings() {
    await chrome.storage.sync.set({
      enabled: settings.enabled,
      translator: settings.translator,
      sourceLang: settings.sourceLang,
      targetLang: settings.targetLang,
      fontSize: settings.fontSize,
      fontColor: settings.fontColor,
      bgOpacity: settings.bgOpacity,
    });

    applyStyles();
    translationCache.clear();
    pendingTranslations.clear();
  }

  /**
   * 检测是否存在字幕
   */
  function hasCaptions() {
    const container = document.querySelector(platformConfig.captionContainer);
    if (container) return true;
    // 也检查是否有字幕片段
    const segments = document.querySelectorAll(platformConfig.captionSegment);
    return segments.length > 0;
  }

  /**
   * 显示浮动提示（在按钮上方）
   */
  function showToast(message) {
    const playerContainer = document.querySelector(platformConfig.player);
    if (!playerContainer || !toggleButton) return;

    // 移除已有提示
    const existing = playerContainer.querySelector("#subtwin-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "subtwin-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: absolute;
      background: rgba(28, 28, 28, 0.95);
      color: #fff;
      padding: 10px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 200;
      white-space: nowrap;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.3s ease;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    `;

    playerContainer.appendChild(toast);

    // 定位到按钮上方
    const playerRect = playerContainer.getBoundingClientRect();
    const buttonRect = toggleButton.getBoundingClientRect();
    const toastRect = toast.getBoundingClientRect();

    const right = playerRect.right - buttonRect.right + (buttonRect.width - toastRect.width) / 2;
    const bottom = playerRect.bottom - buttonRect.top + 8;

    toast.style.right = `${Math.max(8, right)}px`;
    toast.style.bottom = `${bottom}px`;

    // 鼠标移开按钮时消失
    const hideToast = () => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
      toggleButton.removeEventListener("mouseleave", hideToast);
    };
    toggleButton.addEventListener("mouseleave", hideToast);
  }

  /**
   * 切换设置面板显示
   */
  function toggleSettingsPanel() {
    if (!settingsPanel) return;

    // 检测是否有字幕
    if (!hasCaptions()) {
      showToast("未检测到字幕，无法开启翻译");
      return;
    }

    if (settingsPanel.style.display === "none") {
      showSettingsPanel();
    } else {
      hideSettingsPanel();
    }
  }

  /**
   * 显示设置面板
   */
  function showSettingsPanel() {
    if (!settingsPanel || !toggleButton) return;

    // 计算按钮位置，将菜单定位到按钮正上方
    const playerContainer = document.querySelector(platformConfig.player);
    if (playerContainer) {
      const playerRect = playerContainer.getBoundingClientRect();
      const buttonRect = toggleButton.getBoundingClientRect();

      // 菜单右边缘与按钮中心对齐
      const buttonCenterX =
        buttonRect.left + buttonRect.width / 2 - playerRect.left;
      const panelWidth = 180;
      const rightPos = playerRect.width - buttonCenterX - panelWidth / 2;

      settingsPanel.style.right = `${Math.max(8, rightPos)}px`;
      settingsPanel.style.bottom = `${playerRect.height - buttonRect.top + playerRect.top + 8}px`;
    }

    settingsPanel.style.display = "block";
    syncPanelWithSettings();
  }

  /**
   * 隐藏设置面板
   */
  function hideSettingsPanel() {
    if (!settingsPanel) return;
    settingsPanel.style.display = "none";
  }

  /**
   * 同步面板与当前设置
   */
  function syncPanelWithSettings() {
    if (!settingsPanel) return;

    settingsPanel.querySelector("#subtwin-enabled").checked = settings.enabled;
    settingsPanel.querySelector("#subtwin-translator").value =
      settings.translator;
    settingsPanel.querySelector("#subtwin-source").value = settings.sourceLang;
    settingsPanel.querySelector("#subtwin-target").value = settings.targetLang;

    // 字体大小匹配最接近的选项
    const sizes = ["1.2", "1.5", "1.8", "2.2"];
    const closest = sizes.reduce((a, b) =>
      Math.abs(parseFloat(b) - parseFloat(settings.fontSize)) <
      Math.abs(parseFloat(a) - parseFloat(settings.fontSize))
        ? b
        : a,
    );
    settingsPanel.querySelector("#subtwin-fontsize").value = closest;

    settingsPanel.querySelector("#subtwin-colorpicker").value =
      settings.fontColor;
    settingsPanel.querySelector("#subtwin-colordot").style.background =
      settings.fontColor;
  }

  /**
   * 更新按钮状态
   */
  function updateToggleButton() {
    if (!toggleButton) return;

    const statusDot = toggleButton.querySelector(".subtwin-status");
    if (statusDot) {
      statusDot.style.background = settings.enabled ? "#4CAF50" : "#666";
    }
    toggleButton.title = settings.enabled
      ? "SubTwin 设置 (已开启)"
      : "SubTwin 设置 (已关闭)";
  }

  function createTranslationOverlay() {
    if (translationOverlay) {
      return translationOverlay;
    }

    const playerContainer = document.querySelector(platformConfig.player);
    if (!playerContainer) {
      return null;
    }

    translationOverlay = document.createElement("div");
    translationOverlay.id = "subtwin-translation";
    translationOverlay.style.cssText = `
      position: absolute;
      z-index: 60;
      text-align: center;
      max-width: 80%;
      transition: opacity 0.15s ease;
      cursor: grab;
      user-select: none;
    `;

    // 应用保存的位置或默认位置
    applyPosition(playerContainer);

    const textElement = document.createElement("span");
    textElement.id = "subtwin-text";
    textElement.style.cssText = `
      display: inline-block;
      background: rgba(8, 8, 8, ${settings.bgOpacity});
      color: ${settings.fontColor};
      font-size: ${settings.fontSize}em;
      font-family: "YouTube Noto", Roboto, Arial, sans-serif;
      padding: 4px 8px;
      border-radius: 4px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;

    translationOverlay.appendChild(textElement);
    playerContainer.appendChild(translationOverlay);

    // 设置拖拽
    setupDrag(playerContainer);

    console.log("[SubTwin] 翻译字幕显示元素已创建");
    return translationOverlay;
  }

  /**
   * 应用位置（保存的或默认的）
   */
  function applyPosition(container) {
    if (!translationOverlay) return;

    if (savedPosition) {
      // 使用保存的百分比位置
      translationOverlay.style.left = `${savedPosition.xPercent}%`;
      translationOverlay.style.bottom = "";
      translationOverlay.style.top = `${savedPosition.yPercent}%`;
      translationOverlay.style.transform = "translateX(-50%)";
    } else {
      // 默认位置：底部居中
      translationOverlay.style.left = "50%";
      translationOverlay.style.bottom = "80px";
      translationOverlay.style.top = "";
      translationOverlay.style.transform = "translateX(-50%)";
    }
  }

  /**
   * 重置到默认位置
   */
  function resetPosition() {
    savedPosition = null;
    if (translationOverlay) {
      const container = translationOverlay.parentElement;
      if (container) {
        applyPosition(container);
      }
    }
  }

  // ========== 拖拽功能 ==========

  function setupDrag(container) {
    translationOverlay.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return; // 只响应左键
      isDragging = true;
      translationOverlay.style.cursor = "grabbing";

      const rect = translationOverlay.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left - rect.width / 2;
      dragOffset.y = e.clientY - rect.top - rect.height / 2;

      // 拖拽时允许接收鼠标事件
      translationOverlay.style.pointerEvents = "auto";

      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging || !translationOverlay) return;

      const containerRect = container.getBoundingClientRect();

      // 计算相对于容器的百分比位置
      const xPercent =
        ((e.clientX - dragOffset.x - containerRect.left) /
          containerRect.width) *
        100;
      const yPercent =
        ((e.clientY - dragOffset.y - containerRect.top) /
          containerRect.height) *
        100;

      // 限制范围
      const clampedX = Math.max(5, Math.min(95, xPercent));
      const clampedY = Math.max(5, Math.min(95, yPercent));

      translationOverlay.style.left = `${clampedX}%`;
      translationOverlay.style.top = `${clampedY}%`;
      translationOverlay.style.bottom = "";
      translationOverlay.style.transform = "translateX(-50%)";

      savedPosition = { xPercent: clampedX, yPercent: clampedY };
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;

      if (translationOverlay) {
        translationOverlay.style.cursor = "grab";
        translationOverlay.style.pointerEvents = "none";
      }

      // 保存位置
      if (savedPosition) {
        chrome.storage.sync.set({ subtitlePosition: savedPosition });
      }
    });
  }

  // ========== 全屏适配 ==========

  function setupFullscreenListener() {
    document.addEventListener("fullscreenchange", () => {
      // 全屏切换时重新应用位置
      if (translationOverlay) {
        const container = translationOverlay.parentElement;
        if (container) {
          applyPosition(container);
        }
      }
    });
  }

  // ========== 显示/隐藏翻译 ==========

  function showTranslation(text) {
    if (!settings.enabled) return;

    const overlay = createTranslationOverlay();
    if (!overlay) return;

    const textElement = overlay.querySelector("#subtwin-text");
    if (textElement) {
      textElement.textContent = text;
      textElement.style.fontStyle = "normal";
      textElement.style.opacity = "1";
      overlay.style.opacity = "1";
      overlay.style.display = "block";
    }
  }

  /**
   * 显示错误状态
   */
  function showError() {
    if (!settings.enabled) return;

    const overlay = createTranslationOverlay();
    if (!overlay) return;

    const textElement = overlay.querySelector("#subtwin-text");
    if (textElement) {
      textElement.textContent = "翻译失败";
      textElement.style.fontStyle = "italic";
      textElement.style.opacity = "0.4";
      overlay.style.opacity = "1";
      overlay.style.display = "block";
    }

    // 2秒后自动隐藏错误提示
    setTimeout(() => {
      if (textElement && textElement.textContent === "翻译失败") {
        hideTranslation();
      }
    }, 2000);
  }

  function hideTranslation() {
    if (translationOverlay) {
      translationOverlay.style.opacity = "0";
      setTimeout(() => {
        if (translationOverlay) {
          translationOverlay.style.display = "none";
        }
      }, 150);
    }
  }

  // ========== 字幕处理 ==========

  function getCaptionText() {
    const segments = document.querySelectorAll(platformConfig.captionSegment);
    if (segments.length === 0) {
      return null;
    }

    let text = "";
    segments.forEach((segment) => {
      text += segment.textContent;
    });

    return text.trim() || null;
  }

  function isExtension(oldText, newText) {
    if (!oldText || !newText) {
      return false;
    }
    return newText.startsWith(oldText);
  }

  // ========== 翻译 API ==========

  // 默认 API 端点
  const DEFAULT_ENDPOINTS = {
    deepl: "https://api-free.deepl.com/v2/translate",
    deeplPro: "https://api.deepl.com/v2/translate",
    deepseek: "https://api.deepseek.com/v1/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions",
    glm: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  };

  // 默认模型
  const DEFAULT_MODELS = {
    deepseek: "deepseek-chat",
    openai: "gpt-4o-mini",
    glm: "glm-4-flash",
  };

  // 语言名称映射（用于 AI 翻译提示词）
  const LANG_NAMES = {
    auto: "自动检测",
    en: "英语",
    "zh-CN": "简体中文",
    "zh-TW": "繁体中文",
    ja: "日语",
    ko: "韩语",
    fr: "法语",
    de: "德语",
    es: "西班牙语",
    ru: "俄语",
  };

  async function translateWithMyMemory(text, sourceLang, targetLang) {
    const sl = sourceLang === "auto" ? "autodetect" : sourceLang;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sl}|${targetLang}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    throw new Error(data.responseDetails || "MyMemory 翻译失败");
  }

  async function translateWithGoogle(text, sourceLang, targetLang) {
    const sl = sourceLang === "auto" ? "auto" : sourceLang;
    const tl = targetLang;

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data[0]) {
      let result = "";
      for (const item of data[0]) {
        if (item[0]) {
          result += item[0];
        }
      }
      return result;
    }
    throw new Error("Google 翻译失败");
  }

  async function translateWithDeepL(text, sourceLang, targetLang) {
    if (!settings.apiKey) {
      throw new Error("DeepL 需要 API Key");
    }

    const langMap = {
      auto: null, // DeepL 支持自动检测，不传 source_lang
      en: "EN",
      "zh-CN": "ZH",
      "zh-TW": "ZH",
      ja: "JA",
      ko: "KO",
      fr: "FR",
      de: "DE",
      es: "ES",
      ru: "RU",
    };

    const sl = langMap[sourceLang];
    const tl = langMap[targetLang] || targetLang.toUpperCase();

    const isFreeApi = settings.apiKey.endsWith(":fx");
    let baseUrl = settings.apiEndpoint;
    if (!baseUrl) {
      baseUrl = isFreeApi
        ? DEFAULT_ENDPOINTS.deepl
        : DEFAULT_ENDPOINTS.deeplPro;
    }

    const body = {
      text: [text],
      target_lang: tl,
    };
    if (sl) {
      body.source_lang = sl;
    }

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`DeepL API 错误: ${response.status}`);
    }

    const data = await response.json();
    if (data.translations && data.translations[0]) {
      return data.translations[0].text;
    }
    throw new Error("DeepL 翻译失败");
  }

  async function translateWithBaidu(text, sourceLang, targetLang) {
    if (!settings.baiduAppId || !settings.apiKey) {
      throw new Error("百度翻译需要 AppID 和密钥");
    }

    const langMap = {
      auto: "auto",
      en: "en",
      "zh-CN": "zh",
      "zh-TW": "cht",
      ja: "jp",
      ko: "kor",
      fr: "fra",
      de: "de",
      es: "spa",
      ru: "ru",
    };

    const from = langMap[sourceLang] || "auto";
    const to = langMap[targetLang] || "zh";

    // 生成签名
    const salt = Date.now().toString();
    const signStr = settings.baiduAppId + text + salt + settings.apiKey;
    const sign = await md5(signStr);

    const params = new URLSearchParams({
      q: text,
      from: from,
      to: to,
      appid: settings.baiduAppId,
      salt: salt,
      sign: sign,
    });

    const response = await fetch(
      `https://fanyi-api.baidu.com/api/trans/vip/translate?${params}`,
    );
    const data = await response.json();

    if (data.error_code) {
      throw new Error(`百度翻译错误: ${data.error_code} - ${data.error_msg}`);
    }

    if (data.trans_result && data.trans_result[0]) {
      return data.trans_result[0].dst;
    }
    throw new Error("百度翻译失败");
  }

  // MD5 哈希函数（百度翻译签名需要）
  async function md5(string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(string);
    const hashBuffer = await crypto.subtle
      .digest("MD5", data)
      .catch(() => null);

    // 如果浏览器不支持 MD5，使用简单实现
    if (!hashBuffer) {
      return simpleMd5(string);
    }

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // 简单 MD5 实现（备用）
  function simpleMd5(string) {
    function md5cycle(x, k) {
      var a = x[0],
        b = x[1],
        c = x[2],
        d = x[3];
      a = ff(a, b, c, d, k[0], 7, -680876936);
      d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819);
      b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897);
      d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341);
      b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416);
      d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063);
      b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682);
      d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290);
      b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510);
      d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713);
      b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691);
      d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335);
      b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438);
      d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961);
      b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467);
      d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473);
      b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558);
      d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562);
      b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060);
      d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632);
      b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174);
      d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979);
      b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487);
      d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520);
      b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844);
      d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905);
      b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571);
      d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523);
      b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359);
      d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380);
      b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070);
      d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259);
      b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]);
      x[1] = add32(b, x[1]);
      x[2] = add32(c, x[2]);
      x[3] = add32(d, x[3]);
    }
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) {
      return cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function gg(a, b, c, d, x, s, t) {
      return cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function hh(a, b, c, d, x, s, t) {
      return cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function ii(a, b, c, d, x, s, t) {
      return cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    function md5blk(s) {
      var md5blks = [],
        i;
      for (i = 0; i < 64; i += 4) {
        md5blks[i >> 2] =
          s.charCodeAt(i) +
          (s.charCodeAt(i + 1) << 8) +
          (s.charCodeAt(i + 2) << 16) +
          (s.charCodeAt(i + 3) << 24);
      }
      return md5blks;
    }
    function md5blk_array(a) {
      var md5blks = [],
        i;
      for (i = 0; i < 64; i += 4) {
        md5blks[i >> 2] =
          a[i] + (a[i + 1] << 8) + (a[i + 2] << 16) + (a[i + 3] << 24);
      }
      return md5blks;
    }
    function md51(s) {
      var n = s.length,
        state = [1732584193, -271733879, -1732584194, 271733878],
        i,
        length,
        tail,
        tmp,
        lo,
        hi;
      for (i = 64; i <= n; i += 64) {
        md5cycle(state, md5blk(s.substring(i - 64, i)));
      }
      s = s.substring(i - 64);
      length = s.length;
      tail = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      for (i = 0; i < length; i++) {
        tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
      }
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) {
        md5cycle(state, tail);
        for (i = 0; i < 16; i++) tail[i] = 0;
      }
      tmp = n * 8;
      tmp = tmp.toString(16).match(/(.*?)(.{0,8})$/);
      lo = parseInt(tmp[2], 16);
      hi = parseInt(tmp[1], 16) || 0;
      tail[14] = lo;
      tail[15] = hi;
      md5cycle(state, tail);
      return state;
    }
    function rhex(n) {
      var s = "",
        j;
      for (j = 0; j < 4; j++) {
        s +=
          ((n >> (j * 8 + 4)) & 0x0f).toString(16) +
          ((n >> (j * 8)) & 0x0f).toString(16);
      }
      return s;
    }
    function hex(x) {
      for (var i = 0; i < x.length; i++) {
        x[i] = rhex(x[i]);
      }
      return x.join("");
    }
    function add32(a, b) {
      return (a + b) & 0xffffffff;
    }
    return hex(md51(string));
  }

  /**
   * AI 翻译通用函数（支持 DeepSeek、OpenAI、GLM）
   */
  async function translateWithAI(text, sourceLang, targetLang, provider) {
    if (!settings.apiKey) {
      throw new Error(`${provider} 需要 API Key`);
    }

    const model = settings.aiModel || DEFAULT_MODELS[provider];
    const endpoint = settings.apiEndpoint || DEFAULT_ENDPOINTS[provider];

    const sourceLangName = LANG_NAMES[sourceLang] || sourceLang;
    const targetLangName = LANG_NAMES[targetLang] || targetLang;

    let systemPrompt;
    if (sourceLang === "auto") {
      systemPrompt = `你是一个专业的字幕翻译器。请将用户提供的文本翻译成${targetLangName}。
要求：
1. 只输出翻译结果，不要有任何解释或额外文字
2. 保持原文的语气和风格
3. 翻译要自然流畅，符合目标语言习惯`;
    } else {
      systemPrompt = `你是一个专业的字幕翻译器。请将用户提供的${sourceLangName}文本翻译成${targetLangName}。
要求：
1. 只输出翻译结果，不要有任何解释或额外文字
2. 保持原文的语气和风格
3. 翻译要自然流畅，符合目标语言习惯`;
    }

    const headers = {
      "Content-Type": "application/json",
    };

    // 不同服务的认证方式
    if (provider === "glm") {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    } else {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }

    const body = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      max_tokens: 1000,
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `${provider} API 错误: ${response.status} - ${errorText}`,
      );
    }

    const data = await response.json();

    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content.trim();
    }

    throw new Error(`${provider} 翻译失败`);
  }

  async function translateText(text, isPrefetch = false) {
    const cacheKey = getCacheKey(text);

    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    if (pendingTranslations.has(cacheKey)) {
      return pendingTranslations.get(cacheKey);
    }

    const translationPromise = (async () => {
      try {
        let translatedText;

        switch (settings.translator) {
          case "google":
            translatedText = await translateWithGoogle(
              text,
              settings.sourceLang,
              settings.targetLang,
            );
            break;
          case "deepl":
            translatedText = await translateWithDeepL(
              text,
              settings.sourceLang,
              settings.targetLang,
            );
            break;
          case "baidu":
            translatedText = await translateWithBaidu(
              text,
              settings.sourceLang,
              settings.targetLang,
            );
            break;
          case "deepseek":
            translatedText = await translateWithAI(
              text,
              settings.sourceLang,
              settings.targetLang,
              "deepseek",
            );
            break;
          case "openai":
            translatedText = await translateWithAI(
              text,
              settings.sourceLang,
              settings.targetLang,
              "openai",
            );
            break;
          case "glm":
            translatedText = await translateWithAI(
              text,
              settings.sourceLang,
              settings.targetLang,
              "glm",
            );
            break;
          case "mymemory":
          default:
            translatedText = await translateWithMyMemory(
              text,
              settings.sourceLang,
              settings.targetLang,
            );
            break;
        }

        translationCache.set(cacheKey, translatedText);
        saveCache();

        if (isPrefetch) {
          console.log("[SubTwin] 预翻译完成:", text.substring(0, 20) + "...");
        }

        return translatedText;
      } catch (error) {
        console.error(
          `[SubTwin] 翻译错误 (${settings.translator}):`,
          error.message,
        );
        return null;
      } finally {
        pendingTranslations.delete(cacheKey);
      }
    })();

    pendingTranslations.set(cacheKey, translationPromise);
    return translationPromise;
  }

  function preTranslate(text) {
    if (!text || text.length < PRE_TRANSLATE_MIN_LENGTH) {
      return;
    }

    const cacheKey = getCacheKey(text);
    if (translationCache.has(cacheKey) || pendingTranslations.has(cacheKey)) {
      return;
    }

    translateText(text, true);
  }

  /**
   * 输出字幕并显示翻译
   */
  async function outputCaption(text) {
    if (!text || text === lastOutputText || !settings.enabled) {
      return;
    }
    lastOutputText = text;

    console.log("[SubTwin] 原文:", text);

    const translated = await translateText(text);
    if (translated) {
      console.log("[SubTwin] 译文:", translated);
      showTranslation(translated);
    } else {
      showError();
    }
  }

  // ========== 字幕变化处理 ==========

  function onCaptionChange() {
    if (!settings.enabled) return;

    const newText = getCaptionText();

    if (!newText) {
      if (currentText) {
        outputCaption(currentText);
        currentText = "";
      }
      setTimeout(hideTranslation, 2000);
      return;
    }

    if (!currentText) {
      currentText = newText;
      preTranslate(newText);
      return;
    }

    if (newText === currentText) {
      return;
    }

    if (isExtension(currentText, newText)) {
      currentText = newText;

      clearTimeout(preTranslateTimer);
      preTranslateTimer = setTimeout(() => {
        preTranslate(currentText);
      }, PRE_TRANSLATE_DEBOUNCE);

      return;
    }

    outputCaption(currentText);
    currentText = newText;
    preTranslate(newText);
  }

  // ========== 消息监听 ==========

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateSettings") {
      const oldKey = `${settings.translator}|${settings.sourceLang}|${settings.targetLang}`;
      settings = { ...settings, ...message.settings };
      const newKey = `${settings.translator}|${settings.sourceLang}|${settings.targetLang}`;

      if (oldKey !== newKey) {
        translationCache.clear();
        pendingTranslations.clear();
        loadCache();
        console.log("[SubTwin] 翻译设置已更改");
      }

      applyStyles();
      updateToggleButton();

      if (!settings.enabled) {
        hideTranslation();
      }
      sendResponse({ success: true });
    }

    if (message.action === "resetPosition") {
      resetPosition();
      sendResponse({ success: true });
    }

    return true;
  });

  // ========== 启动 ==========

  function startObserver() {
    const targetNode = document.body;

    if (!targetNode) {
      console.log("[SubTwin] 等待页面加载...");
      setTimeout(startObserver, 1000);
      return;
    }

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === "childList" ||
          mutation.type === "characterData"
        ) {
          const target = mutation.target;

          if (target.closest && target.closest(platformConfig.captionContainer)) {
            onCaptionChange();
            break;
          }

          if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(platformConfig.captionContainer)) {
                  onCaptionChange();
                  break;
                }
                if (
                  node.querySelector &&
                  node.querySelector(platformConfig.captionContainer)
                ) {
                  onCaptionChange();
                  break;
                }
              }
            }
          }
        }
      }
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    console.log(`[SubTwin] 字幕监听已启动 (${platformConfig.name})`);
  }

  // 初始化
  loadSettings().then(() => {
    setupFullscreenListener();
    startObserver();
    createToggleButton();
  });
})();
