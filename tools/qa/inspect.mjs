#!/usr/bin/env node
// QA inspector for the CtrlAI prototypes. Loads a page headless at a phone
// viewport, captures console and page errors plus failed requests, audits the
// senior UX floor (tap target size, body text size), screenshots the page, and
// checks any canvas for blank output. Exits nonzero on hard failures.
// Blank-canvas pixel sampling adapted from majidmanzarpour/threejs-game-skills
// scripts/inspect-threejs-canvas.mjs (MIT).
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

function parseArgs(argv) {
  const args = {
    url: null,
    out: 'tools/qa/output',
    name: null,
    wait: 800,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === '--url') args.url = argv[++i];
    else if (v === '--out') args.out = argv[++i];
    else if (v === '--name') args.name = argv[++i];
    else if (v === '--wait') args.wait = Number(argv[++i]);
    else throw new Error('Unknown argument: ' + v);
  }
  if (!args.url) throw new Error('Usage: inspect.mjs --url URL [--out DIR] [--name BASE] [--wait MS]');
  if (!args.name) {
    const u = new URL(args.url);
    args.name = (u.pathname.replace(/[^a-z0-9-]/gi, '-').replace(/^-+|-+$/g, '') || 'root');
  }
  return args;
}

function sampleCanvasPng(buffer) {
  const png = PNG.sync.read(buffer);
  let min = 255;
  let max = 0;
  let alphaPixels = 0;
  const colors = new Set();
  const total = png.width * png.height;
  const stride = Math.max(1, Math.floor(total / 4096));
  for (let pixel = 0; pixel < total; pixel += stride) {
    const o = pixel * 4;
    const r = png.data[o];
    const g = png.data[o + 1];
    const b = png.data[o + 2];
    const a = png.data[o + 3];
    min = Math.min(min, r, g, b);
    max = Math.max(max, r, g, b);
    if (a > 0) alphaPixels += 1;
    colors.add(`${r >> 4},${g >> 4},${b >> 4}`);
  }
  const variance = max - min;
  const ok = alphaPixels > 256 && (variance > 8 || colors.size > 3);
  return { ok, variance, colorBuckets: colors.size, alphaPixels };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(args.out, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('requestfailed', (r) => {
    failedRequests.push(r.url() + ' :: ' + (r.failure()?.errorText || 'failed'));
  });
  page.on('response', (r) => {
    if (r.status() >= 400) failedRequests.push(r.url() + ' :: HTTP ' + r.status());
  });

  await page.goto(args.url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(args.wait);

  const audit = await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const describe = (el) => {
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      return el.tagName.toLowerCase() + cls;
    };
    const interactive = Array.from(
      document.querySelectorAll('button, a, [role="button"], input, select, .btn, .chip')
    ).filter(visible);
    const smallTargets = interactive
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { sel: describe(el), w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter((t) => t.w < 60 || t.h < 60);
    const textEls = Array.from(document.querySelectorAll('body *')).filter((el) => {
      if (!visible(el)) return false;
      return Array.from(el.childNodes).some(
        (n) => n.nodeType === 3 && n.textContent.trim().length > 2
      );
    });
    const smallText = textEls
      .map((el) => ({ sel: describe(el), fontPx: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((t) => t.fontPx < 28);
    return {
      title: document.title,
      bodyTextLength: (document.body.innerText || '').trim().length,
      interactiveCount: interactive.length,
      smallTargets: smallTargets.slice(0, 12),
      smallTargetCount: smallTargets.length,
      bodyFontPx: parseFloat(getComputedStyle(document.body).fontSize),
      smallTextCount: smallText.length,
      smallTextSample: smallText.slice(0, 12),
      hasCanvas: !!document.querySelector('canvas'),
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  let canvasCheck = null;
  if (audit.hasCanvas) {
    const buf = await page.locator('canvas').first().screenshot();
    canvasCheck = sampleCanvasPng(buf);
  }

  const screenshotPath = path.join(args.out, args.name + '.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await browser.close();

  const hardFailures = [];
  if (pageErrors.length) hardFailures.push('page errors: ' + pageErrors.length);
  if (consoleErrors.length) hardFailures.push('console errors: ' + consoleErrors.length);
  if (failedRequests.length) hardFailures.push('failed requests: ' + failedRequests.length);
  if (audit.bodyTextLength < 10 && !audit.hasCanvas) hardFailures.push('page nearly empty');
  if (canvasCheck && !canvasCheck.ok) hardFailures.push('canvas looks blank');

  const warnings = [];
  if (audit.smallTargetCount > 0) warnings.push('tap targets under 60px: ' + audit.smallTargetCount);
  if (audit.smallTextCount > 0) warnings.push('text under 28px: ' + audit.smallTextCount);
  if (audit.hScroll) warnings.push('horizontal scroll at 390px viewport');

  const report = {
    url: args.url,
    screenshot: screenshotPath,
    ok: hardFailures.length === 0,
    hardFailures,
    warnings,
    audit,
    canvasCheck,
    consoleErrors: consoleErrors.slice(0, 20),
    pageErrors: pageErrors.slice(0, 20),
    failedRequests: failedRequests.slice(0, 20),
  };
  const jsonPath = path.join(args.out, args.name + '.json');
  await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack ? error.stack : error) + '\n');
  process.exit(1);
});
