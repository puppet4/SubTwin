/**
 * SubTwin - YouTube 字幕翻译插件
 * Phase 9: UX 优化
 * - 拖拽字幕位置
 * - 全屏适配
 * - 翻译状态提示
 */

(function () {
  "use strict";

  console.log("[SubTwin] 插件已加载");

  // YouTube 字幕容器选择器
  const CAPTION_CONTAINER_SELECTOR = ".ytp-caption-window-container";
  const CAPTION_SEGMENT_SELECTOR = ".ytp-caption-segment";

  // 预翻译配置
  const PRE_TRANSLATE_MIN_LENGTH = 15;
  const PRE_TRANSLATE_DEBOUNCE = 300;

  // 默认设置
  let settings = {
    enabled: true,
    translator: "google",
    apiKey: "",
    sourceLang: "en",
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

  function createTranslationOverlay() {
    if (translationOverlay) {
      return translationOverlay;
    }

    const playerContainer = document.querySelector(".html5-video-player");
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
        ((e.clientX - dragOffset.x - containerRect.left) / containerRect.width) * 100;
      const yPercent =
        ((e.clientY - dragOffset.y - containerRect.top) / containerRect.height) * 100;

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
   * 显示翻译中状态
   */
  function showLoading() {
    if (!settings.enabled) return;

    const overlay = createTranslationOverlay();
    if (!overlay) return;

    const textElement = overlay.querySelector("#subtwin-text");
    if (textElement) {
      textElement.textContent = "翻译中...";
      textElement.style.fontStyle = "italic";
      textElement.style.opacity = "0.6";
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
    const segments = document.querySelectorAll(CAPTION_SEGMENT_SELECTOR);
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

  async function translateWithMyMemory(text, sourceLang, targetLang) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    throw new Error(data.responseDetails || "MyMemory 翻译失败");
  }

  async function translateWithGoogle(text, sourceLang, targetLang) {
    const sl = sourceLang === "zh-CN" ? "zh-CN" : sourceLang;
    const tl = targetLang === "zh-CN" ? "zh-CN" : targetLang;

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

  async function translateWithDeepL(text, sourceLang, targetLang, apiKey) {
    if (!apiKey) {
      throw new Error("DeepL 需要 API Key");
    }

    const langMap = {
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

    const sl = langMap[sourceLang] || sourceLang.toUpperCase();
    const tl = langMap[targetLang] || targetLang.toUpperCase();

    const isFreeApi = apiKey.endsWith(":fx");
    const baseUrl = isFreeApi
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [text],
        source_lang: sl,
        target_lang: tl,
      }),
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
              settings.targetLang
            );
            break;
          case "deepl":
            translatedText = await translateWithDeepL(
              text,
              settings.sourceLang,
              settings.targetLang,
              settings.apiKey
            );
            break;
          case "mymemory":
          default:
            translatedText = await translateWithMyMemory(
              text,
              settings.sourceLang,
              settings.targetLang
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
          error.message
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
   * 输出字幕并显示翻译（带状态提示）
   */
  async function outputCaption(text) {
    if (!text || text === lastOutputText || !settings.enabled) {
      return;
    }
    lastOutputText = text;

    console.log("[SubTwin] 原文:", text);

    // 检查缓存：有缓存直接显示，无缓存显示 loading
    const cacheKey = getCacheKey(text);
    if (!translationCache.has(cacheKey)) {
      showLoading();
    }

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

          if (target.closest && target.closest(CAPTION_CONTAINER_SELECTOR)) {
            onCaptionChange();
            break;
          }

          if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                if (node.matches && node.matches(CAPTION_CONTAINER_SELECTOR)) {
                  onCaptionChange();
                  break;
                }
                if (
                  node.querySelector &&
                  node.querySelector(CAPTION_CONTAINER_SELECTOR)
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

    console.log("[SubTwin] 字幕监听已启动（UX 优化版）");
  }

  // 初始化
  loadSettings().then(() => {
    setupFullscreenListener();
    startObserver();
  });
})();
