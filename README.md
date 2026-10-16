# InkMotion

一个轻量的手写动画网页工具。以 SVG 路径逐笔绘制，支持 Vara 笔画 JSON 和转换后的单线 SVG 字体；使用原生 TypeScript，所有文本处理与导出在浏览器完成。

## 功能

- 7 款笔画字体：Satisfy、Pacifico、Parisienne、Shadows Into Light、EMS Tech、EMS Nixish 和 Relief SingleLine；均支持英文字母、数字和全部可打印 ASCII 标点。
- EMS 字体还包含带重音的拉丁字母；Relief SingleLine 支持更广的拉丁字符集。是否可导出按当前字体的实际字符覆盖判断。
- 多行文本、自动换行、长词断行；兼容弯引号、长破折号、省略号与不换行空格。
- 实时预览；速度、字号、笔画粗细、颜色、行距、对齐、背景及循环设置。
- 背景默认透明，预览融入深浅色页面；笔画和背景均支持色板、十六进制输入及自定义颜色，自动保存新颜色，长按可删除色块，透明背景选项始终保留。
- 自动播放，画布右上角可重新播放；浏览器本地保存草稿。
- 预览下方一键导出动画 SVG、静态 SVG、PNG、GIF 或视频；SVG / PNG / GIF 可选透明背景。
- 支持简体中文、繁体中文、英语、西班牙语、法语、德语、葡萄牙语、俄语、日语和韩语；右上角语言图标可切换，自动识别浏览器语言并记住手动选择。

当前字体不支持的字符会显示提示并禁用导出，可更换字体或移除这些字符。减少动态效果偏好开启时，预览默认展示完整文字，仍可手动播放。

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

## 导出

动画 SVG 内嵌全部笔画和 SMIL 时序，可直接在现代浏览器打开，无须加载 JavaScript 或字体。循环开启时，书写完成后停留 1 秒再重播。SVG 中保留文本及字体来源信息。

静态 SVG 包含完整书写结果，适合导入设计软件。部分设计软件不播放 SVG 动画，使用静态模式即可。

PNG 包含完整书写结果并保留透明度。GIF 按当前书写速度生成动画，完成后停留 1 秒；是否循环由「循环播放」设置决定。GIF 最多以 20 fps 采样，长动画最多采样 600 帧，保留完整时长。GIF 仅支持全透明或不透明像素，半透明边缘会转换为二值透明。

视频优先导出 MP4；浏览器不支持 MP4 录制时自动使用 WebM。视频以 30 fps 采集一次完整书写并在结尾停留 1 秒，沿用当前速度、颜色和排版；视频文件本身不设置循环。生成需要与视频相近的时间，期间请保持页面在前台。透明背景会使用白色；编码尺寸需要偶数时，在右侧或底部补 1 像素，不缩放笔画。不支持原生录制的浏览器会禁用视频按钮，其余格式仍可使用。

导出的画布宽度与当前预览宽度一致，高度随文字内容调整。文件内容不包含网页的工具栏、阴影或透明背景棋盘格。

## 扩展位置

| 扩展 | 文件 | 做法 |
| --- | --- | --- |
| 界面语言 | `src/i18n.ts` | 在 `locales` 注册语言并按 `Messages` 类型添加完整字典；文案通过 `t()` 读取，静态界面用 `data-i18n` 标记。优先采用已保存的选择，再按浏览器语言列表匹配地区或基础语言，无匹配时回退英语。 |
| 笔画字体 | `src/fonts.ts` | 将兼容 Vara `c/p` 格式的 JSON 放入 `public/fonts/`，注册字体 ID、原名和各语言文案键；保留字体许可。字体按需加载并缓存，选择保存在本地草稿中；SVG 自动标注对应字体来源。 |
| 导出格式 | `src/export.ts` | 在 `exportFormats` 注册 `ExportAdapter`，返回 `Blob` 或 `Promise<Blob>`；排版和动画核心无需修改。 |

`src/engine.ts` 负责字体测量、排版与确定性笔画时间。`Scene` 是预览和导出共享的数据；预览直接复用 SVG 导出实现，`src/raster.ts` 将同一 SVG 笔画与时序光栅化为 PNG / GIF，`src/video.ts` 通过浏览器原生 `MediaRecorder` 将这些帧录制为视频。GIF 编码器及视频模块按需加载。`src/main.ts` 负责输入和播放器控制，`src/style.css` 负责响应式布局。

## 验证

```sh
npx playwright install chromium
npm test
```

浏览器测试覆盖字符与裁切边界、排版、播放/进度、SVG 实际笔画与循环、PNG 像素与透明度、GIF 解码后的笔画时序与循环、MP4 / WebM 解码后的笔画时序与时长、视频能力检测及失败清理、XML 转义、下载、移动布局、草稿、字体加载重试，以及语言识别、切换、持久化和菜单键盘操作。

## 字体与许可

Satisfy、Pacifico、Parisienne 和 Shadows Into Light 来自 [akzhy/Vara](https://github.com/akzhy/Vara/tree/2e76da0b84d8f46f5a676dd285fa35c1382df3b8/fonts)，Vara 数据许可为 MIT。原字体 Satisfy 许可为 Apache 2.0，其余三款为 SIL Open Font License 1.1。

新增字体采用原生单线笔画资源，统一转换为现有的 JSON 格式，不增加运行时依赖：

| 字体 | 风格 | 原字形来源 |
| --- | --- | --- |
| EMS Tech | 建筑手绘 | Architects Daughter |
| EMS Nixish | 复古衬线 | Nixie One |
| Relief SingleLine | 简洁单线 | Relief SingleLine |

EMS 笔画由 Sheldon B. Michaels 制作、Windell H. Oskay 转换为 SVG，来自 [Evil Mad Scientist 的 SVG 字体库](https://gitlab.com/oskay/svg-fonts/-/tree/8c71f2d9e1a5292047bb88e5595a766241b82cc6/fonts/EMS)。Relief 来自 [isdaT 的 Relief SingleLine 项目](https://github.com/isdat-type/Relief-SingleLine/tree/01dfc5779ec1e9e4b288d96c6c96c23bfccbaf9d)。这些字体及转换后的数据均遵循 SIL OFL 1.1；保留各自的原作者、来源、修改说明和完整许可。

字体数据在本地随应用分发，按需加载，无需第三方字体服务。来源和完整许可保存在 `public/fonts/` 下，SVG 导出标注实际字体及其来源。

维护字体时可用开发脚本重新转换 SVG 字体（需要 [uv](https://docs.astral.sh/uv/)，FontTools 版本已在脚本中固定）：

```sh
uv run scripts/convert-svg-font.py /path/to/EMSTech.svg public/fonts/ems-tech.json
uv run scripts/convert-svg-font.py /path/to/ReliefSingleLineSVG-Regular.svg public/fonts/relief-singleline.json
```

转换会翻转字体的 Y 轴、保留曲线和字符宽度，并将每次抬笔拆成独立笔画。只收录单个 Unicode 字符，不处理连字和字距对；原始文件使用上述固定版本，许可文件单独保留。日常开发、构建和使用网页均无需 Python 或 FontTools。

本项目借鉴笔画 JSON 与 SVG 绘制原理，未引入 Vara.js 运行库。GIF 导出使用 [gifenc](https://github.com/mattdesl/gifenc)，MIT 许可保存在 `public/licenses/LICENSE-gifenc.txt`。
