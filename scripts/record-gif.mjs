/**
 * Record the animated README hero (docs/fleet.gif) from the *real* running app.
 *
 * Chromium renders the live WebGL/Three.js scene via SwiftShader, and this script
 * grabs a burst of frames while the simulation is actually running — so the GIF
 * shows genuine robot motion and path planning, not a mockup.
 *
 * Like scripts/screenshot.mjs, this is an on-demand dev utility (not part of the
 * build/test pipeline), so its two deps are intentionally NOT in package.json.
 * Install them only when you want to regenerate the GIF:
 *
 *   npm i -D playwright sharp
 *   npx playwright install chromium
 *   npm run build && npm start          # serve a production build (port 3000)
 *   node scripts/record-gif.mjs         # writes docs/fleet.gif
 *
 * Env overrides: CAP_URL, CAP_OUT, CAP_W, CAP_H, CAP_WIDTH (output px),
 *   CAP_FRAMES, CAP_DELAY (ms per GIF frame), CAP_COLORS, CAP_SETTLE (ms).
 */

import { chromium } from 'playwright';
import sharp from 'sharp';

const URL = process.env.CAP_URL || 'http://localhost:3000/?s=apartment&n=20';
const OUT = process.env.CAP_OUT || 'docs/fleet.gif';
const W = parseInt(process.env.CAP_W || '1440', 10);
const H = parseInt(process.env.CAP_H || '810', 10);
const OUT_WIDTH = parseInt(process.env.CAP_WIDTH || '900', 10);
const FRAMES = parseInt(process.env.CAP_FRAMES || '64', 10);
const DELAY = parseInt(process.env.CAP_DELAY || '90', 10); // ms per GIF frame
const COLORS = parseInt(process.env.CAP_COLORS || '96', 10);
const SETTLE = parseInt(process.env.CAP_SETTLE || '3500', 10); // let the fleet spread

const OUT_HEIGHT = Math.round((OUT_WIDTH * H) / W);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});

try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 30000 });

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
  await page.waitForTimeout(SETTLE);   // let robots disperse and elevators fill
  await page.keyboard.press('p');      // overlay every robot's planned path
  await page.waitForTimeout(500);
  await page.keyboard.press('u');      // hide the UI panels for a clean 3D frame
  await page.waitForTimeout(500);

  console.log(`Capturing ${FRAMES} frames...`);
  const frames = [];
  for (let i = 0; i < FRAMES; i++) {
    const png = await page.screenshot({ type: 'png' });
    frames.push(
      await sharp(png)
        .resize({ width: OUT_WIDTH, height: OUT_HEIGHT, fit: 'fill' })
        .raw()
        .toBuffer(),
    );
  }

  // Assemble the raw frames into a single animated image (libvips "toilet-roll"
  // layout), then palette-quantize to a compact, looping GIF.
  const sources = frames.map((data) =>
    sharp(data, { raw: { width: OUT_WIDTH, height: OUT_HEIGHT, channels: 3 } }).png().toBuffer(),
  );
  const pngs = await Promise.all(sources);

  await sharp(pngs, { join: { animated: true } })
    .gif({ loop: 0, delay: new Array(FRAMES).fill(DELAY), colours: COLORS, dither: 0.6, effort: 10 })
    .toFile(OUT);

  console.log('Wrote', OUT);
} finally {
  await browser.close();
}
