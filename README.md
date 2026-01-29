# SubTwin

Chrome 视频字幕翻译插件 - 在 YouTube/Bilibili 原字幕下方显示翻译字幕。

## 功能

- 支持平台：YouTube、Bilibili (B站)
- 实时监听视频字幕并翻译显示
- 多翻译源支持：
  - 免费：Google 翻译、MyMemory
  - API Key：DeepL、百度翻译、DeepSeek、OpenAI、GLM
- 播放器内置设置菜单，快速切换翻译开关和选项
- 字幕位置可拖拽调整
- 自动检测字幕，无字幕时悬停按钮会提示
- 翻译缓存，避免重复请求

## 支持的字幕类型

- YouTube CC 字幕
- B站 CC 字幕 / AI 字幕 / 番剧字幕

**注意**：不支持硬字幕（烧录在视频画面中的字幕），硬字幕需要 OCR 技术识别。

## 安装方式

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `extension` 文件夹

## 使用方法

1. 打开 YouTube 或 B站 视频，开启字幕
2. 翻译字幕自动显示在原字幕上方
3. 点击播放器控制栏的翻译按钮打开设置菜单
4. 拖拽翻译字幕可调整位置

## 项目结构

```
SubTwin/
├── extension/
│   ├── manifest.json      # 扩展配置
│   ├── content.js         # 字幕监听与翻译
│   ├── popup.html         # 设置面板界面
│   ├── popup.js           # 设置面板逻辑
│   └── icons/             # 扩展图标
├── README.md
└── .gitignore
```

## 技术栈

- Chrome Extension (Manifest V3)
- 纯 JavaScript (ES6)
- 支持 YouTube、Bilibili
