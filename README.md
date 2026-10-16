# InkMotion

一个轻量的中英文手写动画网页工具。以 SVG 路径逐笔绘制，支持 Vara 笔画 JSON、单线 SVG 字体、逐点变宽笔画和中文楷体轮廓；使用原生 TypeScript，所有文本处理与导出在浏览器完成。

## 功能

- 14 种字体样式：Satisfy、Pacifico、Parisienne、Shadows Into Light、EMS Tech、EMS Nixish、Relief SingleLine，保留自然粗细的 Caveat、Tangerine、Italianno、Ink Flourish，以及 InkMotion Kaiti 中文楷体、InkMotion Pen 自然硬笔和 InkMotion Note 随性手记。字体菜单按中文手写、拉丁手写分组。
- 中文楷体包含 9,574 个汉字与部件，支持常用简繁中文、中英混排、全角标点和全角空格；只下载输入中用到的汉字，重复字符共用下载与缓存。
- 4 款拉丁变宽字体使用 Tegaki 提取的逐点宽度与椭圆形笔端，沿书写轨迹保留原字体的粗细变化；「笔画粗细」等比例调整这些宽度。Caveat、Tangerine、Ink Flourish 各包含 90 个字符，Italianno 包含 89 个字符；均支持英文字母、数字及大部分 ASCII 标点，暂不包含 `[]{}` 和带重音的拉丁字母，Italianno 另缺少下划线 `_`。Tangerine、Italianno、Ink Flourish 保留原字体的字距与左右留白，让字母自然衔接；Ink Flourish 源自 Parisienne，与原有单线 Parisienne 分别提供。
- EMS 字体还包含带重音的拉丁字母；Relief SingleLine 支持更广的拉丁字符集。是否可导出按当前字体的实际字符覆盖判断。
- 多行文本、自动换行、长词断行；兼容弯引号、长破折号、省略号与不换行空格。
- 实时预览；速度、字号、笔画粗细、颜色、行距、对齐、背景及循环设置。
- 背景默认透明，预览融入深浅色页面；笔画和背景均支持色板、十六进制输入及自定义颜色，自动保存新颜色，长按可删除色块，透明背景选项始终保留。
- 自动播放，画布右上角可重新播放；浏览器本地保存草稿。
- 预览下方一键导出动画 SVG、静态 SVG、PNG、GIF 或视频；SVG / PNG / GIF 可选透明背景。
- 支持简体中文、繁体中文、英语、西班牙语、法语、德语、葡萄牙语、俄语、日语和韩语；右上角语言图标可切换，自动识别浏览器语言并记住手动选择。

当前字体不支持的字符会显示提示并禁用导出，可更换字体或移除这些字符。减少动态效果偏好开启时，预览默认展示完整文字，仍可手动播放。

## 中文手写字体

字体菜单的「中文手写」分组提供三种风格：

| 字体 | 风格与来源 | 汉字覆盖 |
| --- | --- | --- |
| InkMotion Kaiti · 中文楷体 | 保留笔画轮廓的楷体，来自 Make Me a Hanzi | 9,574 个汉字与部件 |
| InkMotion Pen · 自然硬笔 | 源自 LXGW WenKai v1.522，温和、清晰的硬笔风格 | 3,879 个常用简体字及部分高频繁体字 |
| InkMotion Note · 随性手记 | 源自 Yozai v0.868，更随性的手写字形 | 3,879 个常用简体字及部分高频繁体字 |

Pen 和 Note 使用各自字体的笔画轨迹、逐点宽度、笔端、字宽和基线；英文、数字与标点同样来自各自原字体。粗细控制等比例调整笔宽。它们与楷体共用中文排版、按字加载和全部导出格式，切换字体后使用独立的字形缓存。转换版本采用新主名称以遵守原字体的保留名称要求，原字体名称作为来源保留。

两款新字体的笔画由几何算法提取，并参考已有中文笔顺数据自动排序；结果适合手写动画，不作为标准笔顺教材或真实触控笔迹记录。字符集包含 3,500 个常用简体字、高频字的部分繁体对应字及少量补充字，完整列表见 `scripts/chinese-handwriting-chars.txt`。覆盖以实际收录为准，未收录字仍会提示并禁用导出，可选择覆盖更广的中文楷体；不会混入其他字体来掩盖缺字。

在字体菜单选择「InkMotion Kaiti · 中文楷体」，例如输入：

```text
你好，世界！Hello, InkMotion.
繁體中文《手寫動畫》
```

中文保留原始楷体轮廓和逐笔顺序，沿中心线揭示笔画，撇捺有自然粗细；「笔画粗细」对轮廓做扩张或收缩。英文、数字及扩展拉丁字符使用 Relief SingleLine 回退，统一到相同的坐标系和基线。动画 SVG、静态 SVG、PNG、GIF 和视频均使用同一份笔画时间线。导出的 SVG 内嵌轮廓、揭示路径与时序，无须再次下载字库。

中文按字换行，并避免常用闭标点出现在自动换行的行首、开标点出现在行尾；英文单词尽量整体换行。输入法合成期间暂停更新，确认选字后再加载字形。加载失败可重试，快速编辑或切换字体时忽略过期响应。

楷体字形数据固定来自 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi/tree/bddc96d41bef78427ed0e034e9f7e31d71fd1b92)，覆盖以数据实际收录为准；生僻字和 Emoji 缺失时保留现有提示并禁用导出。数据使用大陆笔顺，繁体字不代表台湾等地区的笔顺规范。应用不包含行书连笔、运行时任意 TTF/OTF 转换或地区笔顺切换。

全部中文字形随应用本地分发，字体清单包含字符覆盖索引，浏览器不会为未收录字符发送字形请求。仅加载和测量本次输入所需的汉字，不遍历整套中文字库；无需后端、第三方 CDN 或新的运行时依赖。部署时需保留 `public/fonts/chinese-kaiti/`、`public/fonts/ink-pen/`、`public/fonts/ink-note/` 目录、各自清单和许可文件。

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

`src/engine.ts` 负责字体测量、按字加载、排版与确定性笔画时间。`Scene` 是预览和导出共享的数据；变宽字体的几何与边界计算在 `src/brush.ts` 中，沿轨迹分段揭示，交叉处不会提前显示尚未写到的笔段。中文笔画带有 `outline` 轮廓与中心线揭示宽度，由 `src/export.ts` 统一生成 SVG 遮罩。预览直接复用 SVG 导出实现，`src/raster.ts` 将同一 SVG 笔画与时序光栅化为 PNG / GIF，`src/video.ts` 通过浏览器原生 `MediaRecorder` 将这些帧录制为视频。GIF 编码器及视频模块按需加载。`src/main.ts` 负责输入和播放器控制，`src/style.css` 负责响应式布局。

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

拉丁变宽字体来自 [Tegaki 字体包](https://github.com/gkurt/tegaki/tree/32654a4cfb0fa6a2873264cf693316acd59d1627/packages/renderer/fonts)，统一固定在提交 `32654a4cfb0fa6a2873264cf693316acd59d1627`。4 款原字体均遵循 SIL OFL 1.1：

| 样式 | 风格 | 原字体与作者 | 字体单位 / 空格宽度 |
| --- | --- | --- | --- |
| Caveat | 随性手写，自然轻重 | Caveat · Impallari Type / The Caveat Project Authors | 1000 / 242 |
| Tangerine | 细腻书法，粗细对比鲜明 | Tangerine · Toshi Omagari | 1000 / 150 |
| Italianno | 流畅的连笔花体 | Italianno · Robert Leuschke / The Italianno Project Authors | 1000 / 169 |
| Ink Flourish | 自然花体，带装饰回环 | Parisienne · Brian J. Bonislawsky / Astigmatic (AOETI) | 2048 / 600 |

Ink Flourish 是 Parisienne 的转换版本，采用新的主名称以遵循原字体的保留名称要求。逐点宽度是从字形轮廓提取的几何宽度，并非原始触控笔压感。转换保留所有宽度和笔端，只增加兼容现有引擎的中心线与各字体的实际度量；许可、来源及修改说明见 `public/fonts/LICENSE-Caveat.txt`、`LICENSE-Tangerine.txt`、`LICENSE-Italianno.txt`、`LICENSE-Ink-Flourish.txt` 和 `LICENSE-Tegaki.txt`。这些资源按需加载并缓存，不引入 Tegaki 运行库或 TTF 运行时解析。

字体数据在本地随应用分发，按需加载，无需第三方字体服务。来源和完整许可保存在 `public/fonts/` 下，SVG 导出标注实际字体及其来源。

中文楷体的原始轮廓来自 Arphic PL KaitiM GB / Arphic PL UKai，经 Make Me a Hanzi 标注笔画和中心线。中文数据遵循 Arphic Public License；原始许可、固定来源及修改说明保存在 `public/fonts/LICENSE-Chinese-Kaiti.txt`，每个转换后的汉字文件均包含修改日期与说明。独立的英文回退继续遵循 Relief SingleLine 的 SIL OFL 1.1，新增单线标点为 InkMotion 绘制，导出元数据列出两套字体来源。

维护中文字库时，取得上述固定提交的 `graphics.txt`，运行：

```sh
uv run scripts/convert-hanzi-font.py /path/to/makemeahanzi/graphics.txt public/fonts/chinese-kaiti.json
```

转换保留轮廓曲线与笔顺、翻转 Y 轴、为揭示轨迹补齐端点，并按十进制 Unicode 码点生成文件；清单同时生成字形覆盖索引、统一度量的英文回退和中文标点。FontTools 仅用于离线转换，网页运行不解析 TTF 或整套中文字库。

两款中文手写字体的原始文件分别为 [LXGW WenKai v1.522](https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522) 的 `LXGWWenKai-Regular.ttf` 和 [Yozai v0.868](https://github.com/lxgw/yozai-font/releases/tag/v0.868) 的 `Yozai-Regular.ttf`，均遵循 SIL OFL 1.1。完整原始许可、原作者和转换说明见 `public/fonts/LICENSE-Ink-Pen.txt`、`LICENSE-Ink-Note.txt`。离线几何提取使用相同固定提交的 Tegaki，不引入其运行库或原始 TTF 文件。

维护中文手写字体时，在临时目录检出上述 Tegaki 固定提交，使用 Bun 1.4.3 安装其锁定依赖，然后在本项目中运行：

```sh
bun --conditions=tegaki@dev scripts/generate-chinese-handwriting.ts /path/to/tegaki /path/to/LXGWWenKai-Regular.ttf /tmp/ink-pen
bun --conditions=tegaki@dev scripts/generate-chinese-handwriting.ts /path/to/tegaki /path/to/Yozai-Regular.ttf /tmp/ink-note
python3 scripts/convert-tegaki-font.py /tmp/ink-pen/glyphData.json public/fonts/ink-pen.json --units 1000 --space 350 --preserve-bearings --split-glyphs --ascent 928 --descent 256
python3 scripts/convert-tegaki-font.py /tmp/ink-note/glyphData.json public/fonts/ink-note.json --units 1000 --space 333 --preserve-bearings --split-glyphs --ascent 928 --descent 256
```

生成器复用本地楷体数据作为笔顺参考，无须逐字访问外部服务；输出 `glyphData.json`、`metrics.json` 和提取报告。转换参数必须取自对应的 `metrics.json`，保留宽度与笔端，仅收录真实生成的字形。常用 3,500 字列表固定取自 [handwriting-stroke-transfer](https://github.com/ZhrZhr2022/handwriting-stroke-transfer/blob/1e8a13554a9448e2ae1a1a7e319f49486af6d49f/data/chars/common_3500.txt)；繁体补充使用 Tegaki 的前 1,000 高频字，经 OpenCC 0.1.7 的 `s2t` 转换去重，再补充常见手写相关词语。日常构建、网页使用和导出均不需要这些开发工具。

维护字体时可用开发脚本重新转换 SVG 字体（需要 [uv](https://docs.astral.sh/uv/)，FontTools 版本已在脚本中固定）：

```sh
uv run scripts/convert-svg-font.py /path/to/EMSTech.svg public/fonts/ems-tech.json
uv run scripts/convert-svg-font.py /path/to/ReliefSingleLineSVG-Regular.svg public/fonts/relief-singleline.json
```

转换会翻转字体的 Y 轴、保留曲线和字符宽度，并将每次抬笔拆成独立笔画。只收录单个 Unicode 字符，不处理连字和字距对；原始文件使用上述固定版本，许可文件单独保留。日常开发、构建和使用网页均无需 Python 或 FontTools。

本项目借鉴笔画 JSON 与 SVG 绘制原理，未引入 Vara.js 运行库。GIF 导出使用 [gifenc](https://github.com/mattdesl/gifenc)，MIT 许可保存在 `public/licenses/LICENSE-gifenc.txt`。

维护变宽字体时，在上述固定版本的 Tegaki 仓库中取得对应的 `glyphData.json`，使用 Python 3 转换；`--units` 和 `--space` 必须取自各原字体的实际度量：

```sh
python3 scripts/convert-tegaki-font.py /path/to/tegaki/packages/renderer/fonts/caveat/glyphData.json public/fonts/caveat.json --units 1000 --space 242
python3 scripts/convert-tegaki-font.py /path/to/tegaki/packages/renderer/fonts/tangerine/glyphData.json public/fonts/tangerine.json --units 1000 --space 150 --preserve-bearings
python3 scripts/convert-tegaki-font.py /path/to/tegaki/packages/renderer/fonts/italianno/glyphData.json public/fonts/italianno.json --units 1000 --space 169 --preserve-bearings
python3 scripts/convert-tegaki-font.py /path/to/tegaki/packages/renderer/fonts/parisienne/glyphData.json public/fonts/ink-flourish.json --units 2048 --space 600 --preserve-bearings
```

`--preserve-bearings` 为花体保留原字体的字符前进宽度和左右留白，避免按笔画边界重新排列造成连笔间隙。

采样点保存在可选的 `FontPath.points`（`[x, y, width]`）中，椭圆笔端保存在 `nibs` 中。`p.bsw` 为这类字体的参考宽度：界面的像素线宽相对它等比例缩放全部采样宽度。缺失字符继续使用现有提示并禁用导出；不混入其他字体。预览与 SVG、PNG、GIF、视频导出共用同一份变宽笔触几何和时间线。
