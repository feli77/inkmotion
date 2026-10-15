# InkMotion

一个轻量的英文手写动画网页工具。基于 Vara.js 的笔画 JSON 原理，以 SVG 路径逐笔绘制；使用原生 TypeScript，所有文本处理与导出在浏览器完成。

## 功能

- Satisfy 连笔字体：英文字母、数字和全部可打印 ASCII 标点。
- 多行文本、自动换行、长词断行；兼容弯引号、长破折号、省略号与不换行空格。
- 实时预览；速度、字号、笔画粗细、颜色、行距、对齐、背景及循环设置。
- 自动播放，画布右上角可重新播放；浏览器本地保存草稿。
- 导出动画 SVG 或静态 SVG，可选透明背景。
- 中文界面，预留语言字典、字体注册表与多格式导出接口。

不支持的字符会显示提示并禁用导出，避免生成缺字文件。减少动态效果偏好开启时，预览默认展示完整文字，仍可手动播放。

## 本地运行

需要 Node.js 22.12 或更新版本。

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。构建和预览生产产物：

```sh
npm run build
npm run preview
```

## Cloudflare Workers 部署

项目使用 Workers Static Assets，配置在 `wrangler.jsonc`；无需数据库、API 服务或服务端动画渲染。部署前可修改配置中的 `name`。

```sh
npx wrangler login
npm run deploy
```

部署命令先构建 `dist/`，再将静态资源发布至 Cloudflare Workers。

```sh
npm run deploy:check  # 构建并验证打包，不发布
npm run worker:dev    # 通过本地 Wrangler 预览生产产物
```

## SVG 导出

动画 SVG 内嵌全部笔画和 SMIL 时序，可直接在现代浏览器打开，无须加载 JavaScript 或字体。循环开启时，书写完成后停留 1 秒再重播。SVG 中保留文本及字体来源信息。

静态 SVG 包含完整书写结果，适合导入设计软件。部分设计软件不播放 SVG 动画，使用静态模式即可。

导出的画布宽度与当前预览宽度一致，高度随文字内容调整。文件内容不包含网页的工具栏、阴影或透明背景棋盘格。

## 扩展位置

| 扩展 | 文件 | 做法 |
| --- | --- | --- |
| 界面语言 | `src/i18n.ts` | 按 `Messages` 类型添加字典并注册，文案通过 `t()` 读取；`setLocale()` 选择语言，无匹配时回退中文。 |
| 笔画字体 | `src/fonts.ts` | 将兼容 Vara `c/p` 格式的 JSON 放入 `public/fonts/`，注册字体及文案键；保留字体许可。 |
| 导出格式 | `src/export.ts` | 在 `exportFormats` 注册 `ExportAdapter`，返回 `Blob` 或 `Promise<Blob>`；排版和动画核心无需修改。 |

`src/engine.ts` 负责字体测量、排版与确定性笔画时间。`Scene` 是预览和导出共享的数据；预览直接复用 SVG 导出实现。`src/main.ts` 负责输入和播放器控制，`src/style.css` 负责响应式布局。

## 验证

```sh
npx playwright install chromium
npm test
```

浏览器测试覆盖字符与裁切边界、排版、播放/进度、SVG 实际笔画与循环、XML 转义、下载、移动布局、草稿和字体加载重试。

## 字体与许可

Satisfy 笔画 JSON 来自 [akzhy/Vara](https://github.com/akzhy/Vara/blob/master/fonts/Satisfy/SatisfySL.json)。Vara 数据许可为 MIT，原字体 Satisfy 许可为 Apache 2.0。来源和完整许可保存在 `public/fonts/` 下。

本项目借鉴笔画 JSON 与 SVG 绘制原理，未引入 Vara.js 运行库。
