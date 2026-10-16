import { expect, test } from '@playwright/test';
import { fonts } from '../src/fonts';

test.use({ locale: 'en-US' });

const languages = [
  { code: 'zh-CN', browser: 'zh-SG', name: '简体中文', heading: '输入文字，转换为手写动画', replay: '重新播放' },
  { code: 'zh-TW', browser: 'zh-HK', name: '繁體中文', heading: '輸入文字，轉換為手寫動畫', replay: '重新播放' },
  { code: 'en', browser: 'en-GB', name: 'English', heading: 'Turn your words into handwriting animation', replay: 'Replay' },
  { code: 'es', browser: 'es-MX', name: 'Español', heading: 'Convierte tus palabras en escritura animada', replay: 'Reproducir' },
  { code: 'fr', browser: 'fr-CA', name: 'Français', heading: 'Transformez vos mots en écriture animée', replay: 'Rejouer' },
  { code: 'de', browser: 'de-AT', name: 'Deutsch', heading: 'Verwandle deine Worte in animierte Handschrift', replay: 'Erneut abspielen' },
  { code: 'pt-BR', browser: 'pt-PT', name: 'Português', heading: 'Transforme suas palavras em escrita animada', replay: 'Reproduzir' },
  { code: 'ru', browser: 'ru-RU', name: 'Русский', heading: 'Превратите слова в рукописную анимацию', replay: 'Воспроизвести' },
  { code: 'ja', browser: 'ja-JP', name: '日本語', heading: '入力した言葉を手書きアニメーションに', replay: 'もう一度再生' },
  { code: 'ko', browser: 'ko-KR', name: '한국어', heading: '입력한 글을 손글씨 애니메이션으로', replay: '다시 재생' },
];

for (const language of languages) {
  test.describe(language.name, () => {
    test.use({ locale: language.browser });

    test('detects regional browser language and selects the matching menu entry', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', language.code);
      await expect(page.locator('h1')).toHaveText(language.heading);
      await expect(page.locator('#replay')).toHaveAccessibleName(language.replay);
      await expect(page.locator('#export')).toBeEnabled();
      await page.locator('#language-toggle').click();
      await expect(page.getByRole('menuitemradio', { name: language.name, exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByRole('menuitemradio', { checked: true })).toHaveCount(1);
      await expect(page.getByRole('menuitemradio')).toHaveCount(languages.length);
    });
  });
}

test('switches every language without replacing the drawing or losing editor settings', async ({ page }) => {
  await page.goto('/');
  await page.locator('#text').fill('Keep this draft.');
  await page.locator('#font').selectOption('parisienne');
  await page.locator('#fontSize-value').fill('64');
  await page.locator('#color-value').fill('#123456');
  await page.locator('#alignment [data-alignment="right"]').click();
  await page.locator('#background-palette [data-color="transparent"]').click();
  await page.locator('#loop').check();
  await expect(page.locator('#export')).toBeEnabled();
  const svg = (await page.locator('#drawing > svg').elementHandle())!;

  for (const language of languages) {
    await page.locator('#language-toggle').click();
    await page.getByRole('menuitemradio', { name: language.name, exact: true }).click();
    await expect(page.locator('h1')).toHaveText(language.heading);
    await expect(page.locator('#replay')).toHaveAccessibleName(language.replay);
    await expect(page.locator('#language-menu')).toBeHidden();
    await expect(page.locator('#language-toggle')).toBeFocused();
    await expect(page.locator('#text')).toHaveValue('Keep this draft.');
    await expect(page.locator('#font')).toHaveValue('parisienne');
    await expect(page.locator('#drawing desc')).toContainText('Vara.js / Parisienne');
    await expect(page.locator('#font option')).toHaveCount(fonts.length);
    const fontNames = await page.locator('#font option').allTextContents();
    expect(fontNames.every(name => name.includes(' · ') && !name.includes('font.'))).toBe(true);
    await expect(page.locator('#fontSize-value')).toHaveValue('64');
    await expect(page.locator('#color-value')).toHaveValue('#123456');
    await expect(page.locator('#alignment [data-alignment="right"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#background-palette [data-color="transparent"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#loop')).toBeChecked();
    await expect(page.locator('#export-mode')).toHaveCount(0);
    await expect(page.locator('#export-png')).toHaveText('PNG');
    await expect(page.locator('#export-gif')).toHaveText('GIF');
    expect(await svg.evaluate(element => element === document.querySelector('#drawing > svg'))).toBe(true);
  }

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page.locator('#text')).toHaveValue('Keep this draft.');
  await expect(page.locator('#font')).toHaveValue('parisienne');
  await expect(page.locator('#fontSize-value')).toHaveValue('64');
});

test('translates accessible labels, warnings, empty states and export results immediately', async ({ page }) => {
  await page.goto('/');
  await page.locator('#text').fill('Hello 你好');
  await expect(page.locator('#warning')).toContainText('Unsupported characters: 你 好');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  await expect(page.locator('#warning')).toContainText('当前字体不支持以下字符：你 好');
  await expect(page.locator('#count')).toHaveText('8 字符');
  await expect(page.locator('#export')).toBeDisabled();
  await expect(page.getByRole('slider', { name: '字号', exact: true })).toBeVisible();
  const alignment = page.getByRole('group', { name: '对齐', exact: true });
  for (const name of ['左对齐', '居中', '右对齐']) {
    await expect(alignment.getByRole('button', { name, exact: true })).toHaveAttribute('title', name);
  }
  await expect(page.getByRole('textbox', { name: '十六进制笔画颜色' })).toHaveAttribute('title', /输入 3 位或 6 位/);
  await expect(page.locator('.swatch').first()).toHaveAccessibleName('笔画颜色 #a8e6cf');
  await expect(page.locator('#text')).toHaveAttribute('placeholder', '写下一句话…');
  await expect(page).toHaveTitle('InkMotion · 手写动画');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /将中英文文本/);

  await page.locator('#text').fill('');
  await expect(page.locator('#empty-message')).toHaveText('写点什么，开始你的手写动画');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.locator('#empty-message')).toHaveText('Write something to start your handwriting animation');
  for (const name of ['Left', 'Center', 'Right']) {
    await expect(page.getByRole('group', { name: 'Alignment', exact: true }).getByRole('button', { name, exact: true })).toHaveAttribute('title', name);
  }
  await expect(page.locator('#count')).toHaveText('Characters: 0');
  await expect(page.locator('#warning')).toBeHidden();

  await page.locator('#text').fill('Hello');
  await expect(page.locator('#export')).toBeEnabled();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const stream = await (await downloadEvent).createReadStream();
  let data = '';
  for await (const chunk of stream!) data += chunk.toString();
  expect(data).toContain('Animated handwriting strokes. Font paths: Vara.js / Satisfy.');
  await expect(page.locator('#status')).toBeEmpty();
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  await expect(page.locator('#status')).toBeEmpty();
  await expect(page.locator('#drawing desc')).toHaveText('手写笔画动画。字体路径来源：Vara.js / Satisfy。');

  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('Simulated export failure'); }; });
  await page.locator('#export').click();
  await expect(page.locator('#status')).toHaveText('导出失败，请重试。');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  await expect(page.locator('#status')).toHaveText('Export failed. Please try again.');
});

test('supports keyboard navigation, focus return and outside dismissal', async ({ page }) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: 'Change language' });
  await expect(toggle.locator('svg')).toBeVisible();
  await expect(toggle.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  await toggle.focus();
  await toggle.press('Enter');
  await expect(page.getByRole('menuitemradio', { name: 'English', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: 'Español' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitemradio', { name: '한국어' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: '简体中文', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitemradio', { name: '한국어' })).toBeFocused();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(toggle).toHaveCount(0);
  const spanishToggle = page.getByRole('button', { name: 'Cambiar idioma' });
  await expect(spanishToggle).toBeFocused();
  await spanishToggle.press('ArrowUp');
  await expect(page.getByRole('menuitemradio', { name: '한국어' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(spanishToggle).toBeFocused();
  await expect(spanishToggle).toHaveAttribute('aria-expanded', 'false');
  await spanishToggle.click();
  await page.locator('h1').click();
  await expect(page.locator('#language-menu')).toBeHidden();
  await spanishToggle.click();
  await page.keyboard.press('Tab');
  await expect(page.locator('#language-menu')).toBeHidden();
  await expect(page.locator('#replay')).toBeFocused();
  await spanishToggle.click();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#theme-toggle')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.brand')).toBeFocused();
  await expect(page.locator('#language-menu')).toBeHidden();
});

test('translates loading and failed font states and retains retry behavior', async ({ page }) => {
  let rejectFont: (() => Promise<void>) | undefined;
  await page.route('**/fonts/satisfy.json', route => {
    rejectFont = () => route.fulfill({ status: 503, body: '' });
  });
  await page.goto('/');
  await expect(page.locator('#empty-message')).toHaveText('Loading font…');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'Français' }).click();
  await expect(page.locator('#status')).toHaveText('Chargement de la police…');
  await expect(page.locator('#empty-message')).toHaveText('Chargement de la police…');
  await expect.poll(() => Boolean(rejectFont)).toBe(true);
  await rejectFont!();
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: 'Deutsch' }).click();
  await expect(page.locator('#status')).toContainText('Schriftart konnte nicht geladen werden.');
  await expect(page.locator('#empty-message')).toContainText('Schriftart konnte nicht geladen werden.');
  await page.unroute('**/fonts/satisfy.json');
  await page.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(page.locator('#export')).toBeEnabled();
  await expect(page.locator('#empty')).toBeHidden();
  await expect(page.locator('#status')).toBeEmpty();
});

test('uses browser preference order, ignores invalid saved locales and falls back to English', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['it-IT', 'fr-CA', 'de-DE'] });
    localStorage.setItem('inkmotion.locale.v1', 'invalid');
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  const results = await page.evaluate(async () => {
    const moduleUrl = '/src/i18n.ts';
    const { resolveLocale } = await import(moduleUrl);
    return [[], ['it-IT'], ['zh-Hant'], ['zh-Hans'], ['zh-MO'], ['zh-Hans-HK'], ['EN-us'], ['pt-AO']].map(resolveLocale);
  });
  expect(results).toEqual(['en', 'en', 'zh-TW', 'zh-CN', 'zh-TW', 'zh-CN', 'en', 'pt-BR']);
});

test('keeps language switching and editing usable when local storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage unavailable'); };
    Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); };
  });
  await page.goto('/');
  await page.locator('#language-toggle').click();
  await page.getByRole('menuitemradio', { name: '日本語' }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await page.locator('#text').fill('Still works');
  await expect(page.locator('#drawing title')).toHaveText('Still works');
  await expect(page.locator('#export')).toBeEnabled();
});

for (const width of [1440, 768, 375, 320]) {
  test(`language menu and translated controls fit a ${width}px viewport`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('#export')).toBeEnabled();
    for (const name of ['Deutsch', 'Русский', '한국어']) {
      await page.locator('#language-toggle').click();
      const menuBox = (await page.locator('#language-menu').boundingBox())!;
      const toggleBox = (await page.locator('#language-toggle').boundingBox())!;
      expect(menuBox.x).toBeGreaterThanOrEqual(0);
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      expect(menuBox.x + menuBox.width).toBeCloseTo(toggleBox.x + toggleBox.width, 1);
      await page.getByRole('menuitemradio', { name }).click();
      await expect(page.locator('#export')).toBeEnabled();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      for (const control of await page.locator('.preview-control, .label-row').all()) {
        expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      }
      if (name === 'Deutsch') await page.screenshot({ path: testInfo.outputPath('german-layout.png'), fullPage: true });
    }
    await page.locator('#language-toggle').click();
    await page.screenshot({ path: testInfo.outputPath('language-menu.png'), fullPage: true });
  });
}
