import './style.css';
import { createScene, loadFont, Player, renderScene } from './engine';
import { downloadExport } from './export';
import { fonts } from './fonts';
import { setLocale, t } from './i18n';
import type { FontData, RenderSettings, Scene } from './types';

setLocale(navigator.language);

const icons = {
  pen: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 18c4-9 7-12 11-12-1 5-4 9-8 10l-3 2Zm3-2 5-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  type: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3 15 4-10 4 10M4.5 11h5M13 8.5c4-2 5 0 5 2v4.5m0-4c-6-1-6 5 0 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  settings: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 6h3m4 0h7M3 14h7m4 0h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="6" r="2" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="14" r="2" stroke="currentColor" stroke-width="1.4"/></svg>',
  palette: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3a7 7 0 1 0 0 14h1a1.5 1.5 0 0 0 1.1-2.5 1.5 1.5 0 0 1 1.1-2.5H15a2 2 0 0 0 2-2 7 7 0 0 0-7-7Z" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="10" r="1" fill="currentColor"/><circle cx="8" cy="6.5" r="1" fill="currentColor"/><circle cx="12" cy="6.5" r="1" fill="currentColor"/></svg>',
  replay: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 8a6 6 0 1 1 .5 5M4.5 8V3.5M4.5 8H9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  download: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v9m-3-3 3 3 3-3M4 13v3h12v-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="InkMotion">${icons.pen}<span>InkMotion<span class="brand-dot">.</span></span></a>
  </header>
  <main>
    <div class="intro"><h1>${t('app.description')}</h1></div>
    <div class="workspace">
      <section class="editor" aria-label="${t('app.title')}">
        <div class="text-panel">
          <div class="label-row"><label for="text">${t('text.label')}</label><span id="count" class="muted"></span></div>
          <textarea id="text" spellcheck="false" placeholder="${t('text.placeholder')}" aria-describedby="text-hint warning"></textarea>
          <p id="text-hint" class="hint">${t('text.hint')}</p>
          <p id="warning" class="warning" role="status" hidden></p>
        </div>
        <div class="settings-grid">
          <section class="settings-group" aria-labelledby="typography-title">
            <h3 id="typography-title" class="group-title">${icons.type}${t('settings.typography')}</h3>
            <div class="group-fields">
              <div class="field"><label for="font">${t('font.label')}</label><select id="font">${fonts.map(font => `<option value="${font.id}">${t(font.nameKey)}</option>`).join('')}</select></div>
              <div class="paired-controls">
                <div class="control"><div class="label-row"><label for="fontSize">${t('settings.size')}</label><output for="fontSize" id="fontSize-value"></output></div><input id="fontSize" type="range" min="28" max="96" step="1" /></div>
                <div class="control"><div class="label-row"><label for="lineHeight">${t('settings.lineHeight')}</label><output for="lineHeight" id="lineHeight-value"></output></div><input id="lineHeight" type="range" min="1.3" max="2.4" step="0.05" /></div>
              </div>
              <div class="field"><label for="alignment">${t('settings.alignment')}</label><select id="alignment"><option value="left">${t('settings.left')}</option><option value="center">${t('settings.center')}</option><option value="right">${t('settings.right')}</option></select></div>
            </div>
          </section>
          <section class="settings-group" aria-labelledby="writing-title">
            <h3 id="writing-title" class="group-title">${icons.settings}${t('settings.writing')}</h3>
            <div class="group-fields">
              <div class="control"><div class="label-row"><label for="speed">${t('settings.speed')}</label><output for="speed" id="speed-value"></output></div><input id="speed" type="range" min="0.25" max="3" step="0.25" /></div>
              <div class="control"><div class="label-row"><label for="strokeWidth">${t('settings.stroke')}</label><output for="strokeWidth" id="strokeWidth-value"></output></div><input id="strokeWidth" type="range" min="0.8" max="4" step="0.1" /></div>
              <label class="checkbox-label" for="loop"><span>${t('settings.loop')}</span><input id="loop" type="checkbox" /></label>
            </div>
          </section>
          <section class="settings-group appearance-group" aria-labelledby="appearance-title">
            <h3 id="appearance-title" class="group-title">${icons.palette}${t('settings.appearance')}</h3>
            <div class="group-fields">
              <div class="color-field"><div class="label-row"><label for="color-value">${t('settings.color')}</label><input id="color-value" type="text" aria-label="${t('settings.hexColor')}" title="${t('settings.hexColorHint')}" spellcheck="false" autocomplete="off" autocapitalize="off" /></div><div class="colors">
                ${['#a8e6cf', '#dcedc1', '#ffd3b6', '#ffaaa5', '#ff677d'].map(color => `<button type="button" class="swatch" data-color="${color}" style="--swatch:${color}" aria-label="${t('settings.color')} ${color}" aria-pressed="false"></button>`).join('')}
                <div class="custom-color"><input id="color" type="color" aria-label="${t('settings.customColor')}" /><span aria-hidden="true">+</span></div>
              </div></div>
              <div class="field"><label for="background">${t('settings.background')}</label><select id="background"><option value="#ffffff">${t('settings.white')}</option><option value="transparent">${t('settings.transparent')}</option></select></div>
            </div>
          </section>
        </div>
      </section>
      <section class="preview-panel" aria-labelledby="preview-title">
        <div class="preview-header"><div><h2 id="preview-title">${t('preview.label')}</h2><span id="status" class="preview-status" role="status">${t('preview.loading')}</span></div>
          <div class="export-controls"><select id="export-mode" aria-label="${t('export.mode')}"><option value="animated">${t('export.animated')}</option><option value="static">${t('export.static')}</option></select><button id="export" class="button-primary" type="button" disabled>${icons.download}<span>${t('export.label')}</span></button></div>
        </div>
        <div class="paper-area"><div id="paper" class="paper"><div class="paper-actions"><button id="replay" class="replay-button" type="button" aria-label="${t('player.replay')}" title="${t('player.replay')}" disabled>${icons.replay}</button></div><div id="drawing" class="drawing"></div><div id="empty" class="empty-state">${t('preview.loading')}<button id="retry" type="button" hidden>${t('preview.retry')}</button></div></div></div>
      </section>
    </div>
  </main>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const textInput = $<HTMLTextAreaElement>('text');
const fontInput = $<HTMLSelectElement>('font');
const drawing = $('drawing');
const paper = $('paper');
const empty = $('empty');
const warning = $('warning');
const replayButton = $<HTMLButtonElement>('replay');
const exportButton = $<HTMLButtonElement>('export');
const colorInput = $<HTMLInputElement>('color');
const colorValueInput = $<HTMLInputElement>('color-value');
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
    for (const [key, min, max] of [['fontSize', 28, 96], ['speed', 0.25, 3], ['strokeWidth', 0.8, 4], ['lineHeight', 1.3, 2.4]] as const) {
      if (typeof saved[key] === 'number' && Number.isFinite(saved[key])) settings[key] = Math.min(max, Math.max(min, saved[key]));
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

function updateLabels(): void {
  $('count').textContent = t('text.count', { count: Array.from(textInput.value).length });
  $('speed-value').textContent = `${settings.speed.toFixed(2).replace(/0$/, '').replace(/\.0$/, '')}×`;
  $('fontSize-value').textContent = `${settings.fontSize} px`;
  $('strokeWidth-value').textContent = `${settings.strokeWidth.toFixed(1)} px`;
  $('lineHeight-value').textContent = `${settings.lineHeight.toFixed(2).replace(/0$/, '')}×`;
  colorInput.value = settings.color;
  if (document.activeElement !== colorValueInput) colorValueInput.value = settings.color.toUpperCase();
  document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.color === settings.color));
  });
  for (const key of ['speed', 'fontSize', 'strokeWidth', 'lineHeight'] as const) {
    const input = $<HTMLInputElement>(key);
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
let fontRequest = 0;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function showWarning(message = ''): void {
  warning.hidden = !message;
  warning.textContent = message;
}

function render(): void {
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
  if (!canPlay) empty.firstChild!.textContent = t('preview.empty');
  paper.classList.toggle('transparent', settings.background === 'transparent');
  $('status').textContent = '';
  showWarning(scene.unsupported.length ? t('preview.unsupported', { chars: scene.unsupported.join(' ') }) : '');
  exportButton.disabled = !canPlay || scene.unsupported.length > 0;
  replayButton.disabled = !canPlay;
}

function scheduleRender(delay = 120): void {
  clearTimeout(renderTimer);
  updateLabels();
  // Wait for the updated preview before exporting or replaying.
  exportButton.disabled = replayButton.disabled = true;
  persist();
  renderTimer = window.setTimeout(render, delay);
}

async function selectFont(): Promise<void> {
  const request = ++fontRequest;
  font = undefined;
  exportButton.disabled = replayButton.disabled = true;
  $('status').textContent = t('preview.loading');
  $<HTMLButtonElement>('retry').hidden = true;
  try {
    const selected = fonts.find(item => item.id === settings.fontId) ?? fonts[0];
    const loaded = await loadFont(selected.url);
    if (request !== fontRequest) return;
    font = loaded;
    render();
  } catch {
    if (request !== fontRequest) return;
    $('status').textContent = t('preview.failed');
    empty.hidden = false;
    empty.firstChild!.textContent = t('preview.failed');
    $<HTMLButtonElement>('retry').hidden = false;
  }
}

textInput.addEventListener('input', () => scheduleRender(250));
for (const key of ['speed', 'fontSize', 'strokeWidth', 'lineHeight'] as const) {
  $<HTMLInputElement>(key).addEventListener('input', event => {
    settings[key] = Number((event.target as HTMLInputElement).value);
    scheduleRender();
  });
}
colorInput.addEventListener('input', event => {
  settings.color = (event.target as HTMLInputElement).value;
  scheduleRender();
});
function updateHexColor(commit = false): void {
  const hex = colorValueInput.value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(hex) || (commit && /^[0-9a-f]{3}$/i.test(hex))) {
    const color = `#${hex.length === 3 ? hex.replace(/./g, '$&$&') : hex}`.toLowerCase();
    if (color !== settings.color) {
      settings.color = color;
      scheduleRender();
    }
  }
  if (commit) colorValueInput.value = settings.color.toUpperCase();
}
colorValueInput.addEventListener('input', () => updateHexColor());
colorValueInput.addEventListener('blur', () => updateHexColor(true));
colorValueInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    updateHexColor(true);
  } else if (event.key === 'Escape') colorValueInput.value = settings.color.toUpperCase();
});
document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(button => button.addEventListener('click', () => {
  settings.color = button.dataset.color!;
  scheduleRender(0);
}));
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
exportButton.addEventListener('click', async () => {
  if (!scene || exportButton.disabled) return;
  exportButton.disabled = true;
  try {
    const mode = $<HTMLSelectElement>('export-mode').value === 'static' ? 'static' : 'animated';
    await downloadExport(scene, 'svg', mode);
    $('status').textContent = t('export.success');
  } catch { $('status').textContent = t('export.failed'); }
  finally { exportButton.disabled = !scene?.strokes.length || Boolean(scene?.unsupported.length); }
});

let previousWidth = 0;
new ResizeObserver(entries => {
  const width = Math.round(entries[0].contentRect.width);
  if (width !== previousWidth) {
    previousWidth = width;
    if (font) scheduleRender(150);
  }
}).observe(paper);

updateLabels();
void selectFont();
