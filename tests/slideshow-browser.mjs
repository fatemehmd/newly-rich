import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';

const baseFlag = process.argv.indexOf('--base-url');
const base = process.env.BASE_URL || (baseFlag >= 0 ? process.argv[baseFlag + 1] : null) || 'http://127.0.0.1:8787';
const live = process.argv.includes('--production');
const browser = await chromium.launch({channel: 'chrome', headless: true});
const errors = [];
const receipts = [];
await mkdir('test-results', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.on('pageerror', error => errors.push(error.message));
  const deck = await (await page.request.get(`${base}/slides.json`)).json();
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#slide-image')?.complete && document.querySelector('#slide-image')?.naturalWidth === 1671 && document.querySelector('#slide-stage')?.getAttribute('aria-busy') === 'false');
  assert.equal(await page.locator('#page-count').textContent(), '1 / 21');
  assert.equal(await page.locator('#previous').isDisabled(), true);
  await page.locator('#next').click();
  assert.equal(await page.locator('#page-count').textContent(), '2 / 21');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#page-count').textContent(), '3 / 21');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#page-count').textContent(), '2 / 21');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#page-count')?.textContent === '3 / 21');
  // Visit every slide at its shareable URL and verify one complete image fits.
  for (const slide of deck.slides) {
    await page.goto(`${base}/slide/${slide.id}`);
    await page.waitForFunction(() => document.querySelector('#slide-image')?.complete && document.querySelector('#slide-image')?.naturalWidth === 1671);
    assert.equal(await page.locator('#slideshow img:visible').count(), 1);
    const geometry = await page.locator('#slide-image').evaluate(img => {const r=img.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};});
    assert(geometry.x >= 0 && geometry.y >= 0 && geometry.x + geometry.w <= geometry.vw + 1 && geometry.y + geometry.h <= geometry.vh, slide.id);
    assert(Math.abs(geometry.w / geometry.h - 1671/941) < .005, slide.id);
  }
  await page.goto(`${base}/slide/01-abundance`);
  await page.waitForFunction(() => document.querySelector('#slide-image')?.complete && document.querySelector('#slide-image')?.naturalWidth === 1671 && document.querySelector('#slide-stage')?.getAttribute('aria-busy') === 'false');
  await page.locator('#slide-image').evaluate(img => img.decode());
  await page.screenshot({path: 'test-results/desktop.png'});
  await page.locator('#leave-feedback').click();
  assert.equal(await page.locator('#feedback-slide').inputValue(), '01-abundance');
  const draft = 'Design QA draft: retain this text until submitted.';
  await page.locator('#feedback-comment').fill(draft);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#feedback-comment')?.value?.includes('Design QA draft'));
  assert.equal(await page.locator('#feedback-comment').inputValue(), draft);
  await page.locator('#feedback-author').fill('System QA');
  const comment = `Deployment verification only (${deck.revision}). This is an automated test, not a design change request.`;
  await page.locator('#feedback-comment').fill(comment);
  const receiptPromise = page.waitForResponse(response => response.url().endsWith('/api/feedback') && response.request().method() === 'POST');
  await page.locator('#submit-feedback').click();
  const saved = await receiptPromise;
  assert.equal(saved.status(), 201);
  const receipt = await saved.json();
  assert(receipt.ok && receipt.id);
  receipts.push({id: receipt.id, revision: deck.revision, comment});
  await page.waitForFunction(() => document.querySelector('#feedback-status')?.dataset.state === 'success');
  assert.equal(await page.locator('#feedback-comment').inputValue(), '');
  await page.screenshot({path: 'test-results/feedback-desktop.png'});
  if (!live) {
    await page.locator('#feedback-comment').fill('Keep this draft when the network fails.');
    await page.route('**/api/feedback', route => route.abort('internetdisconnected'));
    await page.locator('#submit-feedback').click();
    await page.waitForFunction(() => document.querySelector('#feedback-status')?.dataset.state === 'error');
    assert.equal(await page.locator('#feedback-comment').inputValue(), 'Keep this draft when the network fails.');
    await page.unroute('**/api/feedback');
  }
  // On mobile, the slide remains whole; native pinch zoom remains enabled.
  const phone = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(`${base}/slide/08-not-done`);
  await phone.waitForFunction(() => document.querySelector('#slide-image')?.complete && document.querySelector('#slide-image')?.naturalWidth === 1671 && document.querySelector('#slide-stage')?.getAttribute('aria-busy') === 'false');
  await phone.locator('#slide-image').evaluate(img => img.decode());
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const frame = await phone.locator('#slide-image').boundingBox();
  assert(frame.x >= 0 && frame.x + frame.width <= 391);
  assert(Math.abs(frame.width/frame.height - 1671/941) < .005);
  await phone.screenshot({path:'test-results/phone.png'});
  await phone.locator('#next').tap();
  assert.equal(await phone.locator('#page-count').textContent(), '11 / 21');
  await phone.locator('#leave-feedback').tap();
  await phone.waitForSelector('#feedback-form');
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.locator('#feedback-comment').fill('Phone draft');
  await phone.screenshot({path:'test-results/feedback-phone.png',fullPage:true});
  await phone.goto(`${base}/slide/19-beyond`);
  await phone.waitForSelector('#slide-image');
  await phone.locator('#next').tap();
  assert.equal(new URL(phone.url()).pathname, '/feedback');
  assert.equal(await phone.locator('#next').isDisabled(), true);
  await phone.locator('#previous').tap();
  assert.equal(new URL(phone.url()).pathname, '/slide/19-beyond');
  assert.deepEqual(errors, []);
  await writeFile('test-results/receipts.json', JSON.stringify(receipts,null,2)+'\n');
  console.log(JSON.stringify({ok:true,base,slides:deck.slides.length,desktop:true,mobile:true,feedbackReceipts:receipts.map(x=>x.id)}));
} finally {
  await browser.close();
}
