/**
 * SubTwin - Popup 设置面板脚本
 */

// 页面元素
const elements = {
  enabled: document.getElementById("enabled"),
  translator: document.getElementById("translator"),
  apiKey: document.getElementById("apiKey"),
  apiKeyRow: document.getElementById("apiKeyRow"),
  apiKeyHint: document.getElementById("apiKeyHint"),
  baiduAppId: document.getElementById("baiduAppId"),
  baiduAppIdRow: document.getElementById("baiduAppIdRow"),
  apiEndpoint: document.getElementById("apiEndpoint"),
  apiEndpointRow: document.getElementById("apiEndpointRow"),
  aiModel: document.getElementById("aiModel"),
  aiModelRow: document.getElementById("aiModelRow"),
  aiModelHint: document.getElementById("aiModelHint"),
  sourceLang: document.getElementById("sourceLang"),
  targetLang: document.getElementById("targetLang"),
  fontSize: document.getElementById("fontSize"),
  fontColor: document.getElementById("fontColor"),
  fontColorPicker: document.getElementById("fontColorPicker"),
  bgOpacity: document.getElementById("bgOpacity"),
  resetPosition: document.getElementById("resetPosition"),
};

// 翻译源配置
const translatorConfig = {
  google: {
    needsApiKey: false,
    needsEndpoint: false,
    needsModel: false,
    needsBaiduAppId: false,
  },
  mymemory: {
    needsApiKey: false,
    needsEndpoint: false,
    needsModel: false,
    needsBaiduAppId: false,
  },
  deepl: {
    needsApiKey: true,
    needsEndpoint: true,
    needsModel: false,
    needsBaiduAppId: false,
    apiKeyHint: "从 DeepL 获取 API Key (免费版以 :fx 结尾)",
    defaultEndpoint: "https://api-free.deepl.com/v2/translate",
    endpointHint: "免费版使用 api-free.deepl.com，Pro 版使用 api.deepl.com",
  },
  baidu: {
    needsApiKey: true,
    needsEndpoint: false,
    needsModel: false,
    needsBaiduAppId: true,
    apiKeyHint: "百度翻译密钥 (Secret Key)",
  },
  deepseek: {
    needsApiKey: true,
    needsEndpoint: true,
    needsModel: true,
    needsBaiduAppId: false,
    apiKeyHint: "从 DeepSeek 控制台获取 API Key",
    defaultEndpoint: "https://api.deepseek.com/v1/chat/completions",
    defaultModel: "deepseek-chat",
    modelHint: "推荐: deepseek-chat",
  },
  openai: {
    needsApiKey: true,
    needsEndpoint: true,
    needsModel: true,
    needsBaiduAppId: false,
    apiKeyHint: "从 OpenAI 获取 API Key",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    modelHint: "推荐: gpt-4o-mini (便宜) 或 gpt-4o",
  },
  glm: {
    needsApiKey: true,
    needsEndpoint: true,
    needsModel: true,
    needsBaiduAppId: false,
    apiKeyHint: "从智谱 AI 开放平台获取 API Key",
    defaultEndpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-4-flash",
    modelHint: "推荐: glm-4-flash (免费) 或 glm-4",
  },
};

// 根据翻译源显示/隐藏相关设置
function updateTranslatorSettings() {
  const translator = elements.translator.value;
  const config = translatorConfig[translator] || {};

  // API Key
  if (config.needsApiKey) {
    elements.apiKeyRow.classList.add("show");
    elements.apiKeyHint.textContent = config.apiKeyHint || "";
  } else {
    elements.apiKeyRow.classList.remove("show");
  }

  // 百度 AppID
  if (config.needsBaiduAppId) {
    elements.baiduAppIdRow.classList.add("show");
  } else {
    elements.baiduAppIdRow.classList.remove("show");
  }

  // 自定义端点
  if (config.needsEndpoint) {
    elements.apiEndpointRow.classList.add("show");
    // 显示默认端点作为 placeholder
    if (config.defaultEndpoint) {
      elements.apiEndpoint.placeholder = config.defaultEndpoint;
    } else {
      elements.apiEndpoint.placeholder = "留空使用默认端点";
    }
  } else {
    elements.apiEndpointRow.classList.remove("show");
  }

  // AI 模型
  if (config.needsModel) {
    elements.aiModelRow.classList.add("show");
    elements.aiModelHint.textContent = config.modelHint || "";
    // 显示默认模型作为 placeholder
    if (config.defaultModel) {
      elements.aiModel.placeholder = config.defaultModel;
    }
  } else {
    elements.aiModelRow.classList.remove("show");
  }
}

// 加载设置
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
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
  });

  elements.enabled.checked = settings.enabled;
  elements.translator.value = settings.translator;
  elements.apiKey.value = settings.apiKey;
  elements.baiduAppId.value = settings.baiduAppId;
  elements.apiEndpoint.value = settings.apiEndpoint;
  elements.aiModel.value = settings.aiModel;
  elements.sourceLang.value = settings.sourceLang;
  elements.targetLang.value = settings.targetLang;
  elements.fontSize.value = settings.fontSize;
  elements.fontColor.value = settings.fontColor;
  elements.fontColorPicker.value = settings.fontColor;
  elements.bgOpacity.value = settings.bgOpacity;

  updateTranslatorSettings();
}

// 保存设置
async function saveSettings() {
  const settings = {
    enabled: elements.enabled.checked,
    translator: elements.translator.value,
    apiKey: elements.apiKey.value,
    baiduAppId: elements.baiduAppId.value,
    apiEndpoint: elements.apiEndpoint.value,
    aiModel: elements.aiModel.value,
    sourceLang: elements.sourceLang.value,
    targetLang: elements.targetLang.value,
    fontSize: elements.fontSize.value,
    fontColor: elements.fontColor.value,
    bgOpacity: elements.bgOpacity.value,
  };

  await chrome.storage.sync.set(settings);

  // 通知所有 YouTube 标签页更新设置
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      action: "updateSettings",
      settings: settings,
    }).catch(() => {
      // 忽略未连接的标签页
    });
  });
}

// 同步颜色选择器和输入框
elements.fontColorPicker.addEventListener("input", (e) => {
  elements.fontColor.value = e.target.value;
  saveSettings();
});

elements.fontColor.addEventListener("input", (e) => {
  const color = e.target.value;
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    elements.fontColorPicker.value = color;
    saveSettings();
  }
});

// 翻译源变化时更新显示
elements.translator.addEventListener("change", () => {
  updateTranslatorSettings();
  saveSettings();
});

// 监听所有设置变化
elements.enabled.addEventListener("change", saveSettings);
elements.apiKey.addEventListener("input", saveSettings);
elements.baiduAppId.addEventListener("input", saveSettings);
elements.apiEndpoint.addEventListener("input", saveSettings);
elements.aiModel.addEventListener("input", saveSettings);
elements.sourceLang.addEventListener("change", saveSettings);
elements.targetLang.addEventListener("change", saveSettings);
elements.fontSize.addEventListener("input", saveSettings);
elements.bgOpacity.addEventListener("input", saveSettings);

// 重置字幕位置
elements.resetPosition.addEventListener("click", async () => {
  await chrome.storage.sync.remove("subtitlePosition");

  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      action: "resetPosition",
    }).catch(() => {});
  });
});

// 初始化
loadSettings();
