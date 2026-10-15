const zhCN = {
  'app.title': '手写动画',
  'app.description': '输入文字，转换为手写动画',
  'text.label': '英文文本',
  'text.placeholder': '写下一句话…',
  'text.hint': '支持英文字母、数字、标点与换行',
  'text.count': '{count} 字符',
  'font.label': '字体',
  'font.satisfy': 'Satisfy · 连笔手写',
  'settings.typography': '字体与排版',
  'settings.writing': '书写与播放',
  'settings.appearance': '颜色与画布',
  'settings.speed': '书写速度',
  'settings.size': '字号',
  'settings.stroke': '笔画粗细',
  'settings.color': '笔画颜色',
  'settings.customColor': '自定义笔画颜色',
  'settings.lineHeight': '行距',
  'settings.alignment': '对齐',
  'settings.left': '左对齐',
  'settings.center': '居中',
  'settings.right': '右对齐',
  'settings.background': '背景',
  'settings.white': '白色',
  'settings.transparent': '透明',
  'settings.loop': '循环播放',
  'preview.label': '预览',
  'preview.loading': '正在加载字体…',
  'preview.empty': '写点什么，开始你的手写动画',
  'preview.unsupported': '以下字符暂不支持：{chars}。请使用英文文本。',
  'preview.failed': '字体加载失败，请检查网络后重试。',
  'preview.retry': '重试',
  'player.replay': '重新播放',
  'export.label': '导出 SVG',
  'export.mode': 'SVG 导出类型',
  'export.animated': '动画 SVG',
  'export.static': '静态 SVG',
  'export.failed': '导出失败，请重试。',
  'export.success': 'SVG 已导出',
} as const;

export type MessageKey = keyof typeof zhCN;
export type Messages = Record<MessageKey, string>;

// Add a dictionary here to introduce a language. UI copy stays outside components.
const dictionaries: Record<string, Messages> = { 'zh-CN': zhCN };
let currentLocale = 'zh-CN';

export function setLocale(locale: string): void {
  currentLocale = dictionaries[locale] ? locale : 'zh-CN';
  document.documentElement.lang = currentLocale;
}

export function t(key: MessageKey, values: Record<string, string | number> = {}): string {
  const message = dictionaries[currentLocale][key] ?? zhCN[key];
  return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
