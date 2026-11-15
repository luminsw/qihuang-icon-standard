/**
 * Headless-browser SVG rendering.
 *
 * The browser is the renderer because it is the only SVG engine already on the
 * machine that resolves gradients, clip paths, and CJK text the same way the
 * committed PNGs were produced. Rendering through it keeps regenerated assets
 * comparable with what the standard was calibrated against.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const WINDOWS_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
];

/**
 * Locate a Chromium-family browser usable for `--screenshot`.
 * @param {string} [explicit] - path from the tool call, highest priority.
 * @returns {{path: string, source: string}|null} the browser and where it came from.
 */
export function findBrowser(explicit) {
  const candidates = [
    ...[explicit ? [explicit, 'tool call'] : []],
    ...(process.env.CHROME ? [[process.env.CHROME, 'CHROME env']] : []),
    ...(process.env.LOCALAPPDATA
      ? [[path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'), 'LOCALAPPDATA']]
      : []),
    ...WINDOWS_CANDIDATES.map((candidatePath) => [candidatePath, 'well-known path']),
  ];
  for (const [candidatePath, source] of candidates) {
    if (existsSync(candidatePath)) return { path: candidatePath, source };
  }
  return null;
}

/**
 * Render one SVG to a PNG of an exact pixel size with transparency preserved.
 * @param {{browser: string, svgPath: string, pngPath: string, size: number, workDir?: string}} job - render job.
 * @returns {{bytes: number}} output size.
 */
export function renderOne({ browser, svgPath, pngPath, size, workDir }) {
  const dir = workDir ?? path.dirname(svgPath);
  mkdirSync(dir, { recursive: true });
  mkdirSync(path.dirname(pngPath), { recursive: true });
  const htmlPath = path.join(dir, `.render-${path.basename(pngPath, '.png')}.html`);
  const source = path.relative(dir, svgPath).replaceAll('\\', '/');
  writeFileSync(
    htmlPath,
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}img{display:block;width:${size}px;height:${size}px}</style><img src="${source}">`,
  );
  try {
    execFileSync(
      browser,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--default-background-color=00000000',
        `--window-size=${size},${size}`,
        `--screenshot=${pngPath}`,
        `file:///${htmlPath.replaceAll('\\', '/')}`,
      ],
      { stdio: 'ignore', timeout: 60_000 },
    );
  } finally {
    rmSync(htmlPath, { force: true });
  }
  return { bytes: existsSync(pngPath) ? statSync(pngPath).size : 0 };
}

/**
 * Write a generated SVG to a temporary file so the renderer can load it.
 * @param {string} svgText - SVG document.
 * @param {string} name - file name inside the temporary directory.
 * @returns {{dir: string, file: string, cleanup: () => void}} the temporary location.
 */
export function writeTempSvg(svgText, name) {
  const dir = mkdtempSync(path.join(tmpdir(), 'icon-standard-'));
  const file = path.join(dir, name);
  writeFileSync(file, svgText);
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
