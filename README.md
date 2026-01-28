# SubTwin

Chrome 视频字幕翻译插件 - 在 YouTube 原字幕下方显示翻译字幕。

## 功能

- 实时监听 YouTube 字幕并翻译显示
- 多翻译源支持：MyMemory (免费)、Google 翻译 (免费)、DeepL (API Key)
- 快捷键 `Alt+T` 快速开关翻译
- 设置面板：语言切换、字体大小、颜色、背景透明度
- 字幕去重，避免重复翻译

## 安装方式

1. 打开 Chrome 浏览器，访问 `chrome://extensions/`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `extension` 文件夹

## 使用方法

1. 打开 YouTube 视频，开启字幕
2. 翻译字幕自动显示在原字幕上方（金黄色）
3. 点击扩展图标打开设置面板
4. 按 `Alt+T` 快速开关翻译

## 项目结构

```
SubTwin/
├── extension/
│   ├── manifest.json      # 扩展配置
│   ├── content.js         # 字幕监听与翻译
│   ├── background.js      # 快捷键处理
│   ├── popup.html         # 设置面板界面
│   ├── popup.js           # 设置面板逻辑
│   └── icons/             # 扩展图标
├── README.md
└── .gitignore
```

## 技术栈

- Chrome Extension (Manifest V3)
- 纯 JavaScript (ES6)
- 仅支持 YouTube
