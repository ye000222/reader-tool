# Reader Tool

> 这是一个帮助总结论文、报告内容和结构，以及翻译文章的阅读工具。

> 一个支持导入 PDF、网页文章，并结合 AI 做翻译、摘要和划词处理的桌面阅读工具。

## 下载入口

- Windows 安装包下载：<https://github.com/ye000222/reader-tool/releases>
- 项目主页：<https://github.com/ye000222/reader-tool>

## 功能简介

- 导入本地 PDF 文档并在应用内阅读
- 导入网页文章并提取正文内容
- 调用 AI 服务进行全文翻译
- 生成文档摘要与分段摘要
- 对选中文本执行翻译、解释等处理
- 本地保存文档和阅读状态

## 技术栈

- React
- TypeScript
- Vite
- Electron
- Zustand

## 本地开发

```bash
npm install
npm run dev
```

## 打包

```bash
npm run pack
```

打包产物默认输出到 `release/` 目录。
