/**
 * Capture one clean 3D still per scenario (docs/site-apartment.png,
 * docs/site-factory.png, docs/site-warehouse.png) for the README's
 * "three switchable sites" row. Like scripts/screenshot.mjs, this renders the
 * *real* running app in headless Chromium (SwiftShader WebGL) — every frame is a
 * genuine simulator frame, not a mockup. UI panels are hidden for a clean shot;
 * unlike the hero still, planned-path overlays are left off so each building's
 * structure reads clearly at thumbnail size.
 *
 * On-demand dev utility — its deps are intentionally NOT in package.json:
 *
 *   npm i -D playwright sharp
 *   npx playwright install chromium
 *   npm run dev                          # or: npm run build && npm start
 *   node scripts/screenshot-sites.mjs    # writes docs/site-*.png
 *
 * Env overrides: CAP_BASE (default http://localhost:3000), CAP_WAIT (ms),
 * CAP_W, CAP_H (viewport), CAP_WIDTH (output px).
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const BASE = process.env.CAP_BASE || 'http://localhost:3000';
const WAIT = parseInt(process.env.CAP_WAIT || '7000', 10); // let the fleet spread & installs accumulate
const W = parseInt(process.env.CAP_W || '1280', 10);
const H = parseInt(process.env.CAP_H || '860', 10);
const OUT_WIDTH = parseInt(process.env.CAP_WIDTH || '980', 10);

// One representative fleet per site — lively but not so dense it hides the layout.
const SITES = [
  { id: 'apartment', n: 16 },
  { id: 'factory', n: 14 },
  { id: 'warehouse', n: 14 },
];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

try {
  for (const { id, n } of SITES) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const url = `${BASE}/?s=${id}&n=${n}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('canvas', { timeout: 30000 });

    const renderer = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const gl = c && (c.getContext('webgl2') || c.getContext('webgl'));
      if (!gl) return 'NO-WEBGL';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'webgl-ok';
    });

    await page.waitForTimeout(500);
    await page.keyboard.press('Escape'); // dismiss the first-run help overlay
    await page.waitForTimeout(WAIT);
    await page.keyboard.press('u'); // hide the UI panels for a clean 3D frame
    await page.waitForTimeout(800);

    const full = await page.screenshot({ type: 'png' });
    const out = `docs/site-${id}.png`;
    await sharp(full)
      .resize({ width: OUT_WIDTH })
      .png({ palette: true, colors: 256, effort: 10, compressionLevel: 9, dither: 1.0 })
      .toFile(out);
    console.log(`Wrote ${out}  (WebGL: ${renderer})`);
    await page.close();
  }
} finally {
  await browser.close();
}
