import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const tempDirectory = await mkdtemp(join(tmpdir(), 'pdfeditor-e2e-'));
const server = spawn(process.execPath, ['serve.mjs'], { stdio: 'ignore' });
let browser;

async function createPdf(path, pages) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (const definition of pages) {
    const page = document.addPage(definition.size);
    if (definition.rotation) page.setRotation(degrees(definition.rotation));
    page.drawRectangle({ x: 0, y: 0, width: definition.size[0], height: definition.size[1], color: definition.color });
    page.drawText(definition.label, { x: 35, y: definition.size[1] - 65, size: 28, font, color: rgb(1, 1, 1) });
  }
  await writeFile(path, await document.save());
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch('http://localhost:8000/');
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('로컬 서버가 시작되지 않았습니다.');
}

try {
  const firstPdf = join(tempDirectory, 'first.pdf');
  const secondPdf = join(tempDirectory, 'second.pdf');
  await createPdf(firstPdf, [
    { label: 'FIRST-A', size: [400, 600], color: rgb(.9, .25, .16) },
    { label: 'FIRST-B', size: [600, 400], color: rgb(.15, .35, .75) }
  ]);
  await createPdf(secondPdf, [
    { label: 'SECOND-A', size: [300, 500], color: rgb(.18, .58, .34) }
  ]);

  await waitForServer();
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(error.message));

  await page.goto('http://localhost:8000/', { waitUntil: 'networkidle' });
  await page.locator('#file-input').setInputFiles([firstPdf, secondPdf]);
  await assert.doesNotReject(() => page.locator('.page-card').nth(2).waitFor());
  assert.equal(await page.locator('.page-card').count(), 3, '두 PDF의 페이지가 모두 표시되어야 합니다.');

  await page.locator('.page-card').first().locator('.preview-page').click();
  await page.locator('#page-viewer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#viewer-page-status').textContent(), '1 / 3', '상세 보기의 현재 페이지가 표시되어야 합니다.');
  const initialCanvasWidth = await page.locator('#viewer-canvas').evaluate(canvas => canvas.width);
  await page.locator('#viewer-next').click();
  await page.locator('#viewer-zoom-in').click();
  await page.waitForFunction(width => document.querySelector('#viewer-canvas').width > width, initialCanvasWidth);
  assert.equal(await page.locator('#viewer-page-status').textContent(), '2 / 3', '다음 페이지로 이동할 수 있어야 합니다.');
  assert.equal(await page.locator('#viewer-zoom-label').textContent(), '125%', '확대 비율이 표시되어야 합니다.');
  await page.keyboard.press('Escape');
  await page.locator('#page-viewer').waitFor({ state: 'hidden' });

  await page.locator('#add-watermark').click();
  await page.locator('#watermark-text').fill('검토용');
  await page.locator('#watermark-rotation').fill('35');
  assert.equal(await page.locator('#watermark-rotation-label').textContent(), '35°', '워터마크 각도를 세부 조절할 수 있어야 합니다.');
  await page.locator('#watermark-apply').click();
  await page.locator('#page-viewer').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');

  await page.locator('#add-text').click();
  await page.locator('#text-content').fill('추가 문구');
  await page.locator('#text-apply').click();
  await page.locator('#page-viewer').waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');

  await page.locator('#add-page-numbers').click();
  await page.locator('#number-format').selectOption('total');
  await page.locator('#number-apply').click();
  assert.equal(await page.locator('#undo').isEnabled(), true, '내용 편집을 실행 취소할 수 있어야 합니다.');

  await page.locator('.page-card').first().locator('.preview-page').click();
  await page.locator('#page-viewer').waitFor({ state: 'visible' });
  await page.locator('#add-signature').click();
  const pad = page.locator('#signature-pad');
  const box = await pad.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 60, { steps: 5 });
  await page.mouse.move(box.x + 280, box.y + 130, { steps: 5 });
  await page.mouse.up();
  await page.locator('#signature-apply').click();
  await page.locator('#signature-dialog').waitFor({ state: 'hidden' });
  await page.locator('#page-viewer').waitFor({ state: 'visible' });
  const overlay = page.locator('#viewer-overlay');
  await page.waitForFunction(() => document.querySelector('#viewer-overlay').classList.contains('placement-mode'));
  const overlayBox = await overlay.boundingBox();
  await overlay.dispatchEvent('pointerdown', { clientX: overlayBox.x + overlayBox.width * .45, clientY: overlayBox.y + overlayBox.height * .45, pointerId: 1 });
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('클릭한 위치'));
  await page.waitForFunction(() => document.querySelector('#viewer-overlay').classList.contains('has-movable'));
  await page.locator('#transform-size').fill('24');
  await page.locator('#transform-size').press('Enter');
  await page.locator('#transform-rotation').fill('12');
  await page.locator('#transform-rotation').press('Enter');
  assert.equal(await page.locator('#transform-size').inputValue(), '24', '서명·도장 크기를 값으로 조절할 수 있어야 합니다.');
  assert.equal(await page.locator('#transform-rotation').inputValue(), '12', '서명·도장 회전을 값으로 조절할 수 있어야 합니다.');
  const hitbox = await overlay.evaluate(canvas => JSON.parse(canvas.dataset.hitboxes).at(-1));
  const startX = overlayBox.x + (hitbox.x + hitbox.width / 2) / await overlay.evaluate(canvas => canvas.width) * overlayBox.width;
  const startY = overlayBox.y + (hitbox.y + hitbox.height / 2) / await overlay.evaluate(canvas => canvas.height) * overlayBox.height;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + overlayBox.width * .28, overlayBox.y + overlayBox.height * .32, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('위치를 변경'));
  await page.keyboard.press('Escape');

  await page.locator('.page-card').first().click();
  await page.locator('#rotate-right').click();
  await page.locator('.page-card').first().click();
  await page.locator('#duplicate').click();
  assert.equal(await page.locator('.page-card').count(), 4, '페이지 복제가 반영되어야 합니다.');

  await page.locator('.page-card').last().click();
  await page.locator('#delete').click();
  assert.equal(await page.locator('.page-card').count(), 3, '페이지 삭제가 반영되어야 합니다.');

  await page.locator('.page-card').nth(2).dragTo(page.locator('.page-card').first());
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-button').click();
  const download = await downloadPromise;
  const savedPath = join(tempDirectory, 'result.pdf');
  await download.saveAs(savedPath);

  const result = await PDFDocument.load(await readFile(savedPath));
  assert.equal(result.getPageCount(), 3, '저장된 PDF도 화면과 같은 페이지 수여야 합니다.');
  assert.equal(result.getPage(1).getRotation().angle, 90, '회전 편집이 저장 파일에 반영되어야 합니다.');
  assert.deepEqual(browserErrors, [], `브라우저 오류가 없어야 합니다: ${browserErrors.join(', ')}`);
  console.log('✔ 실제 브라우저에서 페이지 구성, 상세 보기, 워터마크, 텍스트, 번호, 서명, 저장 검증 완료');
} finally {
  if (browser) await browser.close();
  server.kill();
  await rm(tempDirectory, { recursive: true, force: true });
}
