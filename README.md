# SubTwin

🎬 YouTube / Bilibili 实时字幕翻译 Chrome 扩展，支持多种翻译源，支持 AI 硬字幕识别。

## 功能

- 支持平台：YouTube、Bilibili (B站)
- 实时监听视频字幕并翻译显示
- 多翻译源支持：
  - 免费：Google 翻译、MyMemory
  - API Key：DeepL、百度翻译、DeepSeek、OpenAI、GLM
- **AI 硬字幕识别**：使用 AI 视觉模型识别并翻译硬字幕
- 自动检测字幕模式：有 CC 字幕时使用字幕翻译，无 CC 字幕时自动切换 AI OCR
- 播放器内置设置菜单，快速切换翻译开关和选项
- 字幕位置可拖拽调整
- 翻译缓存，避免重复请求

## 支持的字幕类型

- YouTube CC 字幕
- B站 CC 字幕 / AI 字幕 / 番剧字幕
- **硬字幕**（烧录在视频画面中的字幕）- 需配置 OpenAI 或 GLM API Key

## 安装方式

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `extension` 文件夹

## 使用方法

1. 打开 YouTube 或 B站 视频，开启字幕
2. 翻译字幕自动显示在原字幕上方
3. 悬停播放器控制栏的翻译按钮打开设置菜单
4. 拖拽翻译字幕可调整位置

### AI 硬字幕识别

1. 在设置中配置 OpenAI 或 GLM 的 API Key
2. 开启「硬字幕 AI」开关
3. 插件会自动截取视频底部区域，使用 AI 视觉模型识别并翻译

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
- AI 视觉 OCR (OpenAI GPT-4o / GLM-4V)
