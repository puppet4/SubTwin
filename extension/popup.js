/**
 * SubTwin - Popup 设置面板脚本
 */

// 页面元素
const elements = {
  enabled: document.getElementById("enabled"),
  translator: document.getElementById("translator"),
  apiKey: document.getElementById("apiKey"),
  apiKeyRow: document.getElementById("apiKeyRow"),
  sourceLang: document.getElementById("sourceLang"),
  targetLang: document.getElementById("targetLang"),
  fontSize: document.getElementById("fontSize"),
  fontColor: document.getElementById("fontColor"),
  fontColorPicker: document.getElementById("fontColorPicker"),
  bgOpacity: document.getElementById("bgOpacity"),
  resetPosition: document.getElementById("resetPosition"),
};

// 根据翻译源显示/隐藏 API Key 输入框
function updateApiKeyVisibility() {
  const translator = elements.translator.value;
  if (translator === "deepl") {
    elements.apiKeyRow.classList.add("show");
  } else {
    elements.apiKeyRow.classList.remove("show");
  }
}

// 加载设置
async function loadSettings() {
  const settings = await chrome.storage.sync.get({
    enabled: true,
    translator: "google",
    apiKey: "",
    sourceLang: "en",
    targetLang: "zh-CN",
    fontSize: "1.8",
    fontColor: "#ffd700",
    bgOpacity: "0.75",
  });

  elements.enabled.checked = settings.enabled;
  elements.translator.value = settings.translator;
  elements.apiKey.value = settings.apiKey;
  elements.sourceLang.value = settings.sourceLang;
  elements.targetLang.value = settings.targetLang;
  elements.fontSize.value = settings.fontSize;
  elements.fontColor.value = settings.fontColor;
  elements.fontColorPicker.value = settings.fontColor;
  elements.bgOpacity.value = settings.bgOpacity;

  updateApiKeyVisibility();
}

// 保存设置
async function saveSettings() {
  const settings = {
    enabled: elements.enabled.checked,
    translator: elements.translator.value,
    apiKey: elements.apiKey.value,
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

// 翻译源变化时更新 API Key 显示
elements.translator.addEventListener("change", () => {
  updateApiKeyVisibility();
  saveSettings();
});

// 监听所有设置变化（使用 input 事件实现实时更新）
elements.enabled.addEventListener("change", saveSettings);
elements.apiKey.addEventListener("input", saveSettings);
elements.sourceLang.addEventListener("change", saveSettings);
elements.targetLang.addEventListener("change", saveSettings);
elements.fontSize.addEventListener("input", saveSettings);
elements.bgOpacity.addEventListener("input", saveSettings);

// 重置字幕位置
elements.resetPosition.addEventListener("click", async () => {
  // 清除保存的位置
  await chrome.storage.sync.remove("subtitlePosition");

  // 通知所有 YouTube 标签页重置位置
  const tabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  tabs.forEach((tab) => {
    chrome.tabs.sendMessage(tab.id, {
      action: "resetPosition",
    }).catch(() => {});
  });
});

// 初始化
loadSettings();
