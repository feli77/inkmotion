import { expect, test } from '@playwright/test';

test.use({ locale: 'zh-CN', reducedMotion: 'reduce' });

test('alignment icon buttons update preview and export, support the keyboard and restore the draft', async ({ page }) => {
  await page.goto('/');
  await page.locator('#text').fill('Hello');
  await expect(page.locator('#drawing title')).toHaveText('Hello');
  await expect(page.locator('#export')).toBeEnabled();
  const alignment = page.getByRole('group', { name: '对齐', exact: true });
  const left = alignment.getByRole('button', { name: '左对齐', exact: true });
  const center = alignment.getByRole('button', { name: '居中', exact: true });
  const right = alignment.getByRole('button', { name: '右对齐', exact: true });
  await expect(alignment.getByRole('button')).toHaveCount(3);
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  for (const button of [left, center, right]) {
    await expect(button).toHaveText('');
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  }
  const firstStroke = page.locator('#drawing path').first();
  const strokeX = () => firstStroke.evaluate((path: SVGPathElement) => path.transform.baseVal.consolidate()!.matrix.e);
  const leftX = await strokeX();
  await center.click();
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await expect(left).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(strokeX).toBeGreaterThan(leftX);
  const centerX = await strokeX();
  await center.press('Tab');
  await expect(right).toBeFocused();
  await right.press('Space');
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await expect(alignment.getByRole('button', { pressed: true })).toHaveCount(1);
  await expect.poll(strokeX).toBeGreaterThan(centerX);
  const rightX = await strokeX();
  expect(centerX - leftX).toBeCloseTo((rightX - leftX) / 2, 3);

  const preview = await page.locator('#drawing > svg').innerHTML();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export').click();
  const stream = await (await downloadEvent).createReadStream();
  let data = '';
  for await (const chunk of stream!) data += chunk.toString();
  const exportedPreview = await page.evaluate(svg => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    return document.importNode(root, true).innerHTML;
  }, data);
  expect(exportedPreview).toBe(preview);

  await page.reload();
  await expect(right).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#export')).toBeEnabled();
  expect(await strokeX()).toBeCloseTo(rightX, 3);
  await left.focus();
  await left.press('Enter');
  await expect(left).toHaveAttribute('aria-pressed', 'true');
  await expect(right).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(strokeX).toBeCloseTo(leftX, 3);
});
