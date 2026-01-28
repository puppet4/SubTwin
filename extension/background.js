/**
 * SubTwin - Background Service Worker
 * 处理快捷键和消息传递
 */

// 监听快捷键
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-translation") {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url && tab.url.includes("youtube.com")) {
      // 发送消息给 content script
      chrome.tabs.sendMessage(tab.id, { action: "toggle" });
    }
  }
});

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSettings") {
    chrome.storage.sync.get(
      {
        enabled: true,
        sourceLang: "en",
        targetLang: "zh-CN",
        fontSize: "1.8",
        fontColor: "#ffd700",
        bgOpacity: "0.75",
      },
      (settings) => {
        sendResponse(settings);
      },
    );
    return true; // 保持消息通道开放
  }

  if (message.action === "saveSettings") {
    chrome.storage.sync.set(message.settings, () => {
      // 通知所有 YouTube 标签页更新设置
      chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
        tabs.forEach((tab) => {
          chrome.tabs.sendMessage(tab.id, {
            action: "updateSettings",
            settings: message.settings,
          });
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }
});

console.log("[SubTwin] Background service worker 已启动");
