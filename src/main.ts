import './style.css';
import { createScene, loadFont, Player, renderScene } from './engine';
import { downloadExport, getVideoMimeType } from './export';
import type { ExportMode } from './export';
import { fonts } from './fonts';
import { getSelectChevron, icons } from './icons';
import { getLocale, getPreferredLocale, locales, setLocale, t } from './i18n';
import { bindPaletteHold } from './palette';
import type { MessageKey } from './i18n';
import type { FontData, RenderSettings, Scene } from './types';

setLocale(getPreferredLocale(), false);
const themeStorageKey = 'inkmotion.theme.v1';
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
let preferredTheme: 'light' | 'dark' | undefined;
try {
  const saved = localStorage.getItem(themeStorageKey);
  if (saved === 'light' || saved === 'dark') preferredTheme = saved;
} catch { /* Follow the system theme when storage is unavailable. */ }

const numericSettings = {
  fontSize: { label: 'settings.size', min: 28, max: 96, step: 1, unit: 'px' },
  lineHeight: { label: 'settings.lineHeight', min: 1.3, max: 2.4, step: 0.05, unit: '×' },
  speed: { label: 'settings.speed', min: 0.25, max: 3, step: 0.25, unit: '×' },
  strokeWidth: { label: 'settings.stroke', min: 0.8, max: 4, step: 0.1, unit: 'px' },
} as const;
type NumericSetting = keyof typeof numericSettings;
const numericKeys = Object.keys(numericSettings) as NumericSetting[];

function numericControl(key: NumericSetting): string {
  const { label, min, max, step, unit } = numericSettings[key];
  return `
    <div class="control">
      <div class="label-row">
        <label for="${key}-value" data-i18n="${label}">${t(label)}</label>
        <div class="value-input numeric-value"><input id="${key}-value" type="number" min="${min}" max="${max}" step="${step}" inputmode="${step === 1 ? 'numeric' : 'decimal'}" /><span aria-hidden="true">${unit}</span></div>
      </div>
      <input id="${key}" type="range" min="${min}" max="${max}" step="${step}" data-i18n-aria-label="${label}" aria-label="${t(label)}" />
    </div>
  `;
}

function normalizeNumericValue(key: NumericSetting, value: number): number {
  const { min, max, step } = numericSettings[key];
  const clamped = Math.min(max, Math.max(min, value));
  return Number((min + Math.round((clamped - min) / step) * step).toFixed(2));
}

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="InkMotion">${icons.pen}<span>InkMotion<span class="brand-dot">.</span></span></a>
    <div class="header-actions">
      <button id="theme-toggle" class="header-control" type="button"></button>
      <div class="language-switcher">
        <button id="language-toggle" class="header-control" type="button" aria-haspopup="menu" aria-controls="language-menu" aria-expanded="false" data-i18n-aria-label="language.label" data-i18n-title="language.label">${icons.languages}</button>
        <div id="language-menu" class="language-menu" role="menu" aria-labelledby="language-toggle" hidden>
          ${locales.map(locale => `<button type="button" role="menuitemradio" aria-checked="${locale.code === getLocale()}" tabindex="-1" data-locale="${locale.code}" lang="${locale.code}"><span>${locale.name}</span>${icons.check}</button>`).join('')}
        </div>
      </div>
    </div>
  </header>
  <main>
    <div class="intro"><h1 data-i18n="app.description">${t('app.description')}</h1></div>
    <div class="workspace">
      <section class="preview-panel" data-i18n-aria-label="preview.label" aria-label="${t('preview.label')}">
        <div class="canvas-preview">
          <div class="paper-area"><div id="paper" class="paper"><div id="drawing" class="drawing"></div><div id="empty" class="empty-state"><span id="empty-message">${t('preview.loading')}</span><button id="retry" type="button" data-i18n="preview.retry" hidden>${t('preview.retry')}</button></div></div></div>
          <button id="replay" class="replay-control" type="button" data-i18n-aria-label="player.replay" data-i18n-title="player.replay" aria-label="${t('player.replay')}" title="${t('player.replay')}" disabled>${icons.replay}</button>
        </div>
        <div class="preview-actions">
          <div class="export-controls">
            <button id="export" class="preview-control" type="button" data-format="svg" data-mode="animated" disabled>${icons.download}<span data-i18n="export.animated">${t('export.animated')}</span></button>
            <button id="export-static" class="preview-control" type="button" data-format="svg" data-mode="static" disabled>${icons.download}<span data-i18n="export.static">${t('export.static')}</span></button>
            <button id="export-png" class="preview-control" type="button" data-format="png" data-mode="static" disabled>${icons.download}<span data-i18n="export.png">${t('export.png')}</span></button>
            <button id="export-gif" class="preview-control" type="button" data-format="gif" data-mode="animated" disabled>${icons.download}<span data-i18n="export.gif">${t('export.gif')}</span></button>
            <button id="export-video" class="preview-control" type="button" data-format="video" data-mode="animated" data-i18n-title="export.videoHint" title="${t('export.videoHint')}" disabled>${icons.download}<span data-i18n="export.video">${t('export.video')}</span></button>
          </div>
          <span id="status" class="preview-status" role="status">${t('preview.loading')}</span>
        </div>
      </section>
      <section class="editor" data-i18n-aria-label="app.title" aria-label="${t('app.title')}">
        <div class="text-panel">
          <div class="label-row"><label for="text" data-i18n="text.label">${t('text.label')}</label><span id="count" class="muted"></span></div>
          <textarea id="text" spellcheck="false" data-i18n-placeholder="text.placeholder" placeholder="${t('text.placeholder')}" aria-describedby="text-hint warning"></textarea>
          <p id="text-hint" class="hint" data-i18n="text.hint">${t('text.hint')}</p>
          <p id="warning" class="warning" role="status" hidden></p>
        </div>
        <div class="settings-grid">
          <section class="settings-group" aria-labelledby="typography-title">
            <h3 id="typography-title" class="group-title">${icons.type}<span data-i18n="settings.typography">${t('settings.typography')}</span></h3>
            <div class="group-fields">
              <div class="field"><label for="font" data-i18n="font.label">${t('font.label')}</label><select id="font">${fonts.map(font => `<option value="${font.id}" data-i18n="${font.nameKey}">${t(font.nameKey)}</option>`).join('')}</select></div>
              <div class="paired-controls">
                ${numericControl('fontSize')}
                ${numericControl('lineHeight')}
              </div>
              <div class="field"><label for="alignment" data-i18n="settings.alignment">${t('settings.alignment')}</label><select id="alignment"><option value="left" data-i18n="settings.left">${t('settings.left')}</option><option value="center" data-i18n="settings.center">${t('settings.center')}</option><option value="right" data-i18n="settings.right">${t('settings.right')}</option></select></div>
            </div>
          </section>
          <section class="settings-group" aria-labelledby="writing-title">
            <h3 id="writing-title" class="group-title">${icons.settings}<span data-i18n="settings.writing">${t('settings.writing')}</span></h3>
            <div class="group-fields">
              ${numericControl('speed')}
              ${numericControl('strokeWidth')}
              <label class="checkbox-label" for="loop"><span data-i18n="settings.loop">${t('settings.loop')}</span><input id="loop" type="checkbox" /></label>
            </div>
          </section>
          <section class="settings-group appearance-group" aria-labelledby="appearance-title">
            <h3 id="appearance-title" class="group-title">${icons.palette}<span data-i18n="settings.appearance">${t('settings.appearance')}</span></h3>
            <div class="group-fields">
              <div class="color-field"><div class="label-row"><label for="color-value" data-i18n="settings.color">${t('settings.color')}</label><input id="color-value" class="value-input" type="text" data-i18n-aria-label="settings.hexColor" data-i18n-title="settings.hexColorHint" aria-label="${t('settings.hexColor')}" title="${t('settings.hexColorHint')}" spellcheck="false" autocomplete="off" autocapitalize="off" /></div><div id="palette" class="colors" role="group" data-i18n-aria-label="settings.palette" aria-label="${t('settings.palette')}">
                <div id="palette-swatches" class="palette-swatches"></div>
                <div class="custom-color"><input id="color" type="color" data-i18n-aria-label="settings.customColor" aria-label="${t('settings.customColor')}" /><span aria-hidden="true">${icons.plus}</span></div>
              </div></div>
              <div class="field"><label for="background" data-i18n="settings.background">${t('settings.background')}</label><select id="background"><option value="#ffffff" data-i18n="settings.white">${t('settings.white')}</option><option value="transparent" data-i18n="settings.transparent">${t('settings.transparent')}</option></select></div>
            </div>
          </section>
        </div>
      </section>
    </div>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const themeToggle = $<HTMLButtonElement>('theme-toggle');

function updateTheme(): void {
  const theme = preferredTheme ?? (systemTheme.matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = theme;
  themeToggle.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
  const label = t(theme === 'dark' ? 'theme.light' : 'theme.dark');
  themeToggle.setAttribute('aria-label', label);
  themeToggle.title = label;
  const style = getComputedStyle(document.documentElement);
  document.documentElement.style.setProperty('--select-chevron', getSelectChevron(style.getPropertyValue('--muted').trim()));
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', style.getPropertyValue('--background').trim());
}

themeToggle.addEventListener('click', () => {
  preferredTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(themeStorageKey, preferredTheme); } catch { /* Theme switching still works without storage. */ }
  updateTheme();
});
systemTheme.addEventListener('change', () => {
  if (!preferredTheme) updateTheme();
});

const textInput = $<HTMLTextAreaElement>('text');
const fontInput = $<HTMLSelectElement>('font');
const drawing = $('drawing');
const paper = $('paper');
const empty = $('empty');
const warning = $('warning');
const replayButton = $<HTMLButtonElement>('replay');
const exportButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.export-controls button'));
const videoSupported = Boolean(getVideoMimeType());
if (!videoSupported) $('export-video').setAttribute('data-i18n-title', 'export.videoUnsupported');
const colorInput = $<HTMLInputElement>('color');
const colorValueInput = $<HTMLInputElement>('color-value');
let hexColorEdited = false;
const paletteSwatches = $('palette-swatches');
let palette = ['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#ff677d'];
const paletteStorageKey = 'inkmotion.palette.v1';
try {
  const saved: unknown = JSON.parse(localStorage.getItem(paletteStorageKey) ?? 'null');
  if (Array.isArray(saved)) {
    palette = [...new Set(saved.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).map(color => color.toLowerCase()))];
  }
} catch { /* Keep the default palette when storage is unavailable or malformed. */ }
const defaults: RenderSettings = {
  fontId: 'satisfy', fontSize: 56, strokeWidth: 1.8, speed: 1, color: '#171717',
  lineHeight: 1.65, alignment: 'left', background: '#ffffff', loop: false, width: 720, padding: 32,
};
let settings = { ...defaults };
let text = 'Make something\nworth remembering.';
const storageKey = 'inkmotion.draft.v1';

try {
  const draft = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
  if (draft) {
    if (typeof draft.text === 'string') text = draft.text;
    const saved = draft.settings ?? {};
    for (const key of numericKeys) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) settings[key] = normalizeNumericValue(key, saved[key]);
    }
    if (/^#[0-9a-f]{6}$/i.test(saved.color)) settings.color = saved.color.toLowerCase();
    if (['left', 'center', 'right'].includes(saved.alignment)) settings.alignment = saved.alignment;
    if (['#ffffff', 'transparent'].includes(saved.background)) settings.background = saved.background;
    if (typeof saved.loop === 'boolean') settings.loop = saved.loop;
    if (fonts.some(font => font.id === saved.fontId)) settings.fontId = saved.fontId;
  }
} catch { /* A private or unavailable storage area should not affect editing. */ }

textInput.value = text;
fontInput.value = settings.fontId;
for (const key of ['speed', 'fontSize', 'strokeWidth', 'lineHeight', 'color', 'alignment', 'background'] as const) {
  $<HTMLInputElement>(key).value = String(settings[key]);
}
$<HTMLInputElement>('loop').checked = settings.loop;

function normalizeHexColor(value: string): string | undefined {
  const hex = value.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return;
  return `#${hex.length === 3 ? hex.replace(/./g, '$&$&') : hex}`.toLowerCase();
}

function swatchMarkup(color: string): string {
  const [red, green, blue] = [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
  const ink = red * .299 + green * .587 + blue * .114 > 150 ? '#171717' : '#ffffff';
  return `<button type="button" class="swatch" data-color="${color}" style="--swatch:${color};--swatch-ink:${ink}" aria-label="${t('settings.color')} ${color}" title="${t('settings.holdToDelete')}" aria-pressed="${color === settings.color}">
    <span class="swatch-delete" aria-hidden="true">${icons.close}<svg class="swatch-ring" viewBox="0 0 28 28"><circle class="swatch-progress" cx="14" cy="14" r="11" pathLength="1" /></svg></span>
  </button>`;
}

function renderPalette(): void {
  cancelPaletteHold();
  paletteSwatches.innerHTML = palette.map(swatchMarkup).join('');
}

function persistPalette(): void {
  try { localStorage.setItem(paletteStorageKey, JSON.stringify(palette)); } catch { /* Editing still works without storage. */ }
}

function savePaletteColor(color: string): void {
  if (palette.includes(color)) return;
  palette.push(color);
  persistPalette();
  paletteSwatches.insertAdjacentHTML('beforeend', swatchMarkup(color));
}

function updateLabels(): void {
  $('count').textContent = t('text.count', { count: Array.from(textInput.value).length });
  colorInput.value = settings.color;
  if (document.activeElement !== colorValueInput) colorValueInput.value = settings.color.toUpperCase();
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.color === settings.color));
  });
  for (const key of numericKeys) {
    const input = $<HTMLInputElement>(key);
    const valueInput = $<HTMLInputElement>(`${key}-value`);
    input.value = String(settings[key]);
    if (document.activeElement !== valueInput) valueInput.value = String(settings[key]);
    input.style.setProperty('--fill', `${(Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100}%`);
  }
}

function persist(): void {
  try { localStorage.setItem(storageKey, JSON.stringify({ text: textInput.value, settings })); } catch { /* Nonessential. */ }
}

let font: FontData | undefined;
let scene: Scene | undefined;
let player: Player | undefined;
let renderTimer = 0;
let exporting = false;
let fontRequest = 0;
let statusMessage: MessageKey | undefined = 'preview.loading';
let emptyMessage: MessageKey = 'preview.loading';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function showWarning(message = ''): void {
  warning.hidden = !message;
  warning.textContent = message;
}

function updateExportButtons(pending = false): void {
  for (const button of exportButtons) {
    button.disabled = pending || exporting || !font || !scene?.strokes.length || Boolean(scene?.unsupported.length) || (button.dataset.format === 'video' && !videoSupported);
  }
}

function refreshMessages(): void {
  $('status').textContent = statusMessage ? t(statusMessage) : '';
  $('empty-message').textContent = t(emptyMessage);
  showWarning(scene?.unsupported.length ? t('preview.unsupported', { chars: scene.unsupported.join(' ') }) : '');
}

function localizeInterface(): void {
  updateTheme();
  for (const attribute of ['textContent', 'aria-label', 'placeholder', 'title']) {
    const marker = attribute === 'textContent' ? 'data-i18n' : `data-i18n-${attribute}`;
    document.querySelectorAll<HTMLElement>(`[${marker}]`).forEach(element => {
      const message = t(element.getAttribute(marker) as MessageKey);
      if (attribute === 'textContent') element.textContent = message;
      else element.setAttribute(attribute, message);
    });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach(button => {
    button.setAttribute('aria-checked', String(button.dataset.locale === getLocale()));
  });
  renderPalette();
  // Update the accessible SVG description without restarting the current animation.
  const description = drawing.querySelector('desc');
  if (description) description.textContent = t('export.animatedDescription');
  updateLabels();
  refreshMessages();
}

const languageToggle = $<HTMLButtonElement>('language-toggle');
const languageMenu = $('language-menu');
const languageButtons = Array.from(languageMenu.querySelectorAll<HTMLButtonElement>('[data-locale]'));

function toggleLanguageMenu(open: boolean, index = languageButtons.findIndex(button => button.dataset.locale === getLocale())): void {
  languageMenu.hidden = !open;
  languageToggle.setAttribute('aria-expanded', String(open));
  if (open) languageButtons[index]?.focus();
}

languageToggle.addEventListener('click', () => toggleLanguageMenu(languageToggle.getAttribute('aria-expanded') !== 'true'));
languageToggle.addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    toggleLanguageMenu(true, event.key === 'ArrowDown' ? 0 : languageButtons.length - 1);
  }
});
languageMenu.addEventListener('keydown', event => {
  const index = languageButtons.indexOf(document.activeElement as HTMLButtonElement);
  let next: number | undefined;
  if (event.key === 'ArrowDown') next = (index + 1) % languageButtons.length;
  if (event.key === 'ArrowUp') next = (index - 1 + languageButtons.length) % languageButtons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = languageButtons.length - 1;
  if (next !== undefined) {
    event.preventDefault();
    languageButtons[next].focus();
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    toggleLanguageMenu(false);
    languageToggle.focus();
  }
  if (event.key === 'Tab') {
    toggleLanguageMenu(false);
    // Continue the normal tab order from the trigger rather than a hidden menu item.
    languageToggle.focus();
  }
});
languageButtons.forEach((button, index) => button.addEventListener('click', () => {
  setLocale(locales[index].code);
  localizeInterface();
  toggleLanguageMenu(false);
  languageToggle.focus();
}));
document.addEventListener('pointerdown', event => {
  if (!(event.target as Element).closest('.language-switcher')) toggleLanguageMenu(false);
});
document.querySelector('.language-switcher')!.addEventListener('focusout', event => {
  const next = (event as FocusEvent).relatedTarget as Node | null;
  if (!next || !document.querySelector('.language-switcher')!.contains(next)) toggleLanguageMenu(false);
});

function render(): void {
  renderTimer = 0;
  if (!font) return;
  player?.destroy();
  player = undefined;
  settings.width = Math.max(240, Math.floor(paper.clientWidth));
  settings.padding = settings.width < 420 ? 24 : 32;
  scene = createScene(font, textInput.value, { ...settings });
  const canPlay = scene.strokes.length > 0;
  drawing.replaceChildren();
  if (canPlay) {
    const svg = renderScene(scene);
    drawing.append(svg);
    player = new Player(svg, scene);
    if (reducedMotion.matches) {
      player.pause();
      player.seek(scene.duration);
    } else player.play();
  }
  empty.hidden = canPlay;
  emptyMessage = 'preview.empty';
  statusMessage = undefined;
  refreshMessages();
  updateExportButtons();
  replayButton.disabled = !canPlay;
}

function scheduleRender(delay = 120): void {
  clearTimeout(renderTimer);
  updateLabels();
  // Wait for the updated preview before exporting or replaying.
  updateExportButtons(true);
  replayButton.disabled = true;
  persist();
  renderTimer = window.setTimeout(render, delay);
}

async function selectFont(): Promise<void> {
  const request = ++fontRequest;
  font = undefined;
  updateExportButtons(true);
  replayButton.disabled = true;
  statusMessage = emptyMessage = 'preview.loading';
  refreshMessages();
  $<HTMLButtonElement>('retry').hidden = true;
  try {
    const selected = fonts.find(item => item.id === settings.fontId) ?? fonts[0];
    const loaded = await loadFont(selected.url);
    if (request !== fontRequest) return;
    font = loaded;
    render();
  } catch {
    if (request !== fontRequest) return;
    statusMessage = emptyMessage = 'preview.failed';
    empty.hidden = false;
    refreshMessages();
    $<HTMLButtonElement>('retry').hidden = false;
  }
}

textInput.addEventListener('input', () => scheduleRender(250));
for (const key of numericKeys) {
  $<HTMLInputElement>(key).addEventListener('input', event => {
    settings[key] = Number((event.target as HTMLInputElement).value);
    scheduleRender();
  });
  const valueInput = $<HTMLInputElement>(`${key}-value`);
  const updateNumericValue = (commit = false): void => {
    const value = valueInput.valueAsNumber;
    if (Number.isFinite(value) && (commit || valueInput.validity.valid)) {
      const normalized = normalizeNumericValue(key, value);
      if (normalized !== settings[key]) {
        settings[key] = normalized;
        scheduleRender();
      }
    }
    if (commit) valueInput.value = String(settings[key]);
  };
  valueInput.addEventListener('input', () => updateNumericValue());
  valueInput.addEventListener('blur', () => updateNumericValue(true));
  valueInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      updateNumericValue(true);
    } else if (event.key === 'Escape') valueInput.value = String(settings[key]);
  });
}
colorInput.addEventListener('input', event => {
  settings.color = (event.target as HTMLInputElement).value;
  scheduleRender();
});
colorInput.addEventListener('change', () => {
  if (settings.color !== colorInput.value) {
    settings.color = colorInput.value;
    scheduleRender();
  }
  savePaletteColor(settings.color);
});
function updateHexColor(commit = false): void {
  const color = normalizeHexColor(colorValueInput.value);
  if (color && (commit || /^#?[0-9a-f]{6}$/i.test(colorValueInput.value.trim()))) {
    if (color !== settings.color) {
      settings.color = color;
      scheduleRender();
    }
  }
  if (commit) {
    colorValueInput.value = settings.color.toUpperCase();
    if (color && hexColorEdited) savePaletteColor(color);
    hexColorEdited = false;
  }
}
colorValueInput.addEventListener('input', () => {
  hexColorEdited = true;
  updateHexColor();
});
colorValueInput.addEventListener('blur', () => updateHexColor(true));
colorValueInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    updateHexColor(true);
  } else if (event.key === 'Escape') {
    colorValueInput.value = settings.color.toUpperCase();
    hexColorEdited = false;
  }
});
const cancelPaletteHold = bindPaletteHold(paletteSwatches, color => {
  const index = palette.indexOf(color);
  if (index < 0) return;
  const focused = paletteSwatches.contains(document.activeElement);
  palette.splice(index, 1);
  persistPalette();
  paletteSwatches.querySelector(`[data-color="${color}"]`)?.remove();
  if (focused) (paletteSwatches.querySelectorAll<HTMLButtonElement>('.swatch')[Math.min(index, palette.length - 1)] ?? colorInput).focus();
});
paletteSwatches.addEventListener('click', event => {
  const button = (event.target as Element).closest<HTMLButtonElement>('button');
  if (!button) return;
  if (button.dataset.color) {
    settings.color = button.dataset.color;
    scheduleRender(0);
  }
});
for (const key of ['alignment', 'background'] as const) {
  $<HTMLSelectElement>(key).addEventListener('change', event => {
    settings = { ...settings, [key]: (event.target as HTMLSelectElement).value };
    scheduleRender(0);
  });
}
$<HTMLInputElement>('loop').addEventListener('change', event => {
  settings.loop = (event.target as HTMLInputElement).checked;
  scheduleRender(0);
});
fontInput.addEventListener('change', () => {
  settings.fontId = fontInput.value;
  persist();
  void selectFont();
});
$<HTMLButtonElement>('retry').addEventListener('click', () => void selectFont());
replayButton.addEventListener('click', () => player?.restart());
exportButtons.forEach(button => button.addEventListener('click', async () => {
  if (!scene || button.disabled) return;
  exporting = true;
  updateExportButtons();
  button.setAttribute('aria-busy', 'true');
  statusMessage = undefined;
  refreshMessages();
  try {
    await downloadExport(scene, button.dataset.format, button.dataset.mode as ExportMode);
  } catch { statusMessage = 'export.failed'; }
  finally {
    exporting = false;
    button.removeAttribute('aria-busy');
    updateExportButtons(Boolean(renderTimer));
  }
  refreshMessages();
}));

let previousWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width);
  if (width !== previousWidth) {
    previousWidth = width;
    if (font) scheduleRender(150);
  }
}).observe(paper);

localizeInterface();
void selectFont();
