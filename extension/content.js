/**
 * SubTwin - YouTube 字幕翻译插件
 * Phase 7: 多翻译源支持
 */

(function () {
  "use strict";

  console.log("[SubTwin] 插件已加载");

  // YouTube 字幕容器选择器
  const CAPTION_CONTAINER_SELECTOR = ".ytp-caption-window-container";
  const CAPTION_SEGMENT_SELECTOR = ".ytp-caption-segment";

  // 默认设置
  let settings = {
    enabled: true,
    translator: "mymemory",
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
  let translationCache = new Map();
  let translationOverlay = null;

  /**
   * 加载设置
   */
  async function loadSettings() {
    try {
      const stored = await chrome.storage.sync.get(settings);
      settings = { ...settings, ...stored };
      console.log("[SubTwin] 设置已加载:", settings);
      applyStyles();
    } catch (e) {
      console.log("[SubTwin] 使用默认设置");
    }
  }

  /**
   * 应用样式设置
   */
  function applyStyles() {
    if (!translationOverlay) return;

    const textElement = translationOverlay.querySelector("#subtwin-text");
    if (textElement) {
      textElement.style.fontSize = `${settings.fontSize}em`;
      textElement.style.color = settings.fontColor;
      textElement.style.background = `rgba(8, 8, 8, ${settings.bgOpacity})`;
    }
  }

  /**
   * 创建翻译字幕显示元素
   */
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
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 60;
      text-align: center;
      pointer-events: none;
      max-width: 80%;
      transition: opacity 0.15s ease;
    `;

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

    console.log("[SubTwin] 翻译字幕显示元素已创建");
    return translationOverlay;
  }

  /**
   * 显示翻译字幕
   */
  function showTranslation(text) {
    if (!settings.enabled) return;

    const overlay = createTranslationOverlay();
    if (!overlay) return;

    const textElement = overlay.querySelector("#subtwin-text");
    if (textElement) {
      textElement.textContent = text;
      overlay.style.opacity = "1";
      overlay.style.display = "block";
    }
  }

  /**
   * 隐藏翻译字幕
   */
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

  /**
   * 获取当前字幕文本
   */
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

  /**
   * 检查新字幕是否是旧字幕的扩展
   */
  function isExtension(oldText, newText) {
    if (!oldText || !newText) {
      return false;
    }
    return newText.startsWith(oldText);
  }

  // ========== 翻译 API 实现 ==========

  /**
   * MyMemory 翻译 (免费)
   */
  async function translateWithMyMemory(text, sourceLang, targetLang) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
      return data.responseData.translatedText;
    }
    throw new Error(data.responseDetails || "MyMemory 翻译失败");
  }

  /**
   * Google 翻译 (免费接口)
   */
  async function translateWithGoogle(text, sourceLang, targetLang) {
    // 转换语言代码
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

  /**
   * DeepL 翻译 (需要 API Key)
   */
  async function translateWithDeepL(text, sourceLang, targetLang, apiKey) {
    if (!apiKey) {
      throw new Error("DeepL 需要 API Key");
    }

    // 转换语言代码为 DeepL 格式
    const langMap = {
      "en": "EN",
      "zh-CN": "ZH",
      "zh-TW": "ZH",
      "ja": "JA",
      "ko": "KO",
      "fr": "FR",
      "de": "DE",
      "es": "ES",
      "ru": "RU",
    };

    const sl = langMap[sourceLang] || sourceLang.toUpperCase();
    const tl = langMap[targetLang] || targetLang.toUpperCase();

    // 判断是免费还是付费 API（免费 API Key 以 :fx 结尾）
    const isFreeApi = apiKey.endsWith(":fx");
    const baseUrl = isFreeApi
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${apiKey}`,
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

  /**
   * 调用翻译 API (根据设置选择翻译源)
   */
  async function translateText(text) {
    const cacheKey = `${settings.translator}|${settings.sourceLang}|${settings.targetLang}|${text}`;
    if (translationCache.has(cacheKey)) {
      return translationCache.get(cacheKey);
    }

    try {
      let translatedText;

      switch (settings.translator) {
        case "google":
          translatedText = await translateWithGoogle(text, settings.sourceLang, settings.targetLang);
          break;
        case "deepl":
          translatedText = await translateWithDeepL(text, settings.sourceLang, settings.targetLang, settings.apiKey);
          break;
        case "mymemory":
        default:
          translatedText = await translateWithMyMemory(text, settings.sourceLang, settings.targetLang);
          break;
      }

      translationCache.set(cacheKey, translatedText);
      return translatedText;
    } catch (error) {
      console.error(`[SubTwin] 翻译错误 (${settings.translator}):`, error.message);
      return null;
    }
  }

  /**
   * 输出字幕并翻译
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
    }
  }

  /**
   * 处理字幕变化
   */
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
      return;
    }

    if (newText === currentText) {
      return;
    }

    if (isExtension(currentText, newText)) {
      currentText = newText;
      return;
    }

    outputCaption(currentText);
    currentText = newText;
  }

  /**
   * 切换翻译开关
   */
  function toggleTranslation() {
    settings.enabled = !settings.enabled;
    chrome.storage.sync.set({ enabled: settings.enabled });

    if (settings.enabled) {
      console.log("[SubTwin] 翻译已开启");
    } else {
      console.log("[SubTwin] 翻译已关闭");
      hideTranslation();
    }
  }

  /**
   * 监听来自 background/popup 的消息
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggle") {
      toggleTranslation();
      sendResponse({ enabled: settings.enabled });
    }

    if (message.action === "updateSettings") {
      const oldKey = `${settings.translator}|${settings.sourceLang}|${settings.targetLang}`;
      settings = { ...settings, ...message.settings };
      const newKey = `${settings.translator}|${settings.sourceLang}|${settings.targetLang}`;

      // 翻译源或语言改变时清除缓存
      if (oldKey !== newKey) {
        translationCache.clear();
        console.log("[SubTwin] 翻译设置已更改，缓存已清除");
      }

      applyStyles();
      console.log("[SubTwin] 设置已更新:", settings);

      if (!settings.enabled) {
        hideTranslation();
      }
      sendResponse({ success: true });
    }

    return true;
  });

  /**
   * 开始监听字幕变化
   */
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

    console.log("[SubTwin] 字幕监听已启动");
  }

  // 初始化
  loadSettings().then(() => {
    startObserver();
  });
})();
