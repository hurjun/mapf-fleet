/**
 * Capture the README hero image (docs/demo.png) by rendering the *real* running
 * app in a headless browser. Chromium renders the live WebGL/Three.js scene via
 * SwiftShader, so the output is a genuine frame of the simulator — not a mockup.
 *
 * This is an on-demand dev utility, not part of the build/test pipeline, so its
 * two dependencies are intentionally NOT in package.json. Install them only when
 * you want to regenerate the image:
 *
 *   npm i -D playwright sharp
 *   npx playwright install chromium
 *   npm run build && npm start          # serve a production build (port 3000)
 *   node scripts/screenshot.mjs         # writes docs/demo.png (<250 KB)
 *
 * Env overrides: CAP_URL, CAP_OUT, CAP_WAIT (ms), CAP_W, CAP_H, CAP_WIDTH (output px).
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const URL = process.env.CAP_URL || 'http://localhost:3000/?s=apartment&n=20';
const OUT = process.env.CAP_OUT || 'docs/demo.png';
const WAIT = parseInt(process.env.CAP_WAIT || '9000', 10); // let the fleet spread out
const W = parseInt(process.env.CAP_W || '1440', 10);
const H = parseInt(process.env.CAP_H || '810', 10);
const OUT_WIDTH = parseInt(process.env.CAP_WIDTH || '1280', 10);

const browser = await chromium.launch({
  headless: true,
  // Force a software GL backend so WebGL renders without a physical GPU.
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 30000 });

  // Sanity-check that a real GPU context came up (not a 2D fallback).
  const renderer = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
    if (!gl) return 'NO-WEBGL';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'webgl-ok';
  });
  console.log('WebGL renderer:', renderer);

  await page.waitForTimeout(500);
  await page.keyboard.press('Escape'); // dismiss the first-run help overlay
  await page.waitForTimeout(WAIT);
  await page.keyboard.press('p'); // overlay every robot's planned path
  await page.waitForTimeout(1200);
  await page.keyboard.press('u'); // hide the UI panels for a clean 3D frame
  await page.waitForTimeout(800);

  const full = await page.screenshot({ type: 'png' });

  // Downscale + palette-quantize to keep the committed PNG small (<250 KB).
  await sharp(full)
    .resize({ width: OUT_WIDTH })
    .png({ palette: true, colors: 256, effort: 10, compressionLevel: 9, dither: 1.0 })
    .toFile(OUT);
  console.log('Wrote', OUT);
} finally {
  await browser.close();
}
