/**
 * The audit: does this project's icon set actually satisfy the standard?
 *
 * Each failing check names the mistake it corresponds to (from `PITFALLS`) and
 * prints measured against expected, so a fix is a number change rather than a
 * guessing game. Pixel checks run on the real bytes; wiring checks read the
 * manifest, XML, JSON, and HTML that connect those bytes to a platform.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { decodePng } from './png.js';
import { measure } from './image.js';
import { BRAND, LAYOUT, PITFALLS, PLATFORMS, SEAL_MIN_DENSITY, describeTarget } from './spec.js';

const join = (...parts) => path.join(...parts);
const pct = (value, digits = 1) => `${(value * 100).toFixed(digits)}%`;

/**
 * @typedef {object} Check
 * @property {string} id stable identifier for the rule.
 * @property {'fail'|'warn'|'pass'|'skip'} level outcome.
 * @property {string} title short human label.
 * @property {string} [detail] measured against expected, plus the fix.
 */

function check(id, level, title, detail) {
  return detail === undefined ? { id, level, title } : { id, level, title, detail };
}

function fail(id, title, detail) {
  return check(id, 'fail', title, detail);
}

/** Attach the pitfall symptom/fix to a failing detail line. */
function pitfall(id) {
  const entry = PITFALLS[id];
  return entry === undefined ? '' : `　症状：${entry.symptom}。做法：${entry.fix}。`;
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson(file) {
  const text = readText(file);
  if (text === null) return { ok: false, error: 'file not found' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: String(error.message ?? error) };
  }
}

/** Strip // and block comments so a json5 resource can be read with JSON.parse. */
function stripJsonComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * Check that SVG markup is a complete document: one root, every element closed,
 * nothing after the closing root tag.
 * @param {string} text - SVG source.
 * @returns {string[]} problems, empty when well formed.
 */
export function svgProblems(text) {
  const problems = [];
  const trimmed = text.trim();
  if (!trimmed.startsWith('<svg')) problems.push('不是以 <svg 开头');
  if (!trimmed.endsWith('</svg>')) problems.push('没有以 </svg> 结尾，片段可能外泄到页面');
  const stack = [];
  const tagPattern = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  for (const match of trimmed.matchAll(tagPattern)) {
    const [, closing, name, , selfClosing] = match;
    if (closing === '/') {
      const open = stack.pop();
      if (open !== name) problems.push(`</${name}> 与 <${open ?? '?'}> 不配对`);
    } else if (selfClosing !== '/') {
      stack.push(name);
    }
  }
  if (stack.length > 0) problems.push(`未闭合元素：${stack.join('、')}`);
  return problems;
}

/**
 * Find HTML parser damage from a raw SVG data URI: an un-encoded `<` or `>`
 * inside an href ends the tag early and spills the rest of the SVG into <head>.
 * @param {string} html - document source.
 * @returns {string[]} problems.
 */
export function faviconProblems(html) {
  const problems = [];
  for (const match of html.matchAll(/<link\b[^>]*>/g)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']?[^"'>]*icon/i.test(tag)) continue;
    const href = /href\s*=\s*"([^"]*)"/.exec(tag)?.[1] ?? /href\s*=\s*'([^']*)'/.exec(tag)?.[1];
    if (href === undefined) continue;
    if (!href.startsWith('data:image/svg+xml')) continue;
    if (/[<>#]/.test(href.replace(/^data:image\/svg\+xml(;base64|;charset=[^,]*)?,/, ''))) {
      const payload = href.replace(/^data:image\/svg\+xml(;base64)?,/, '');
      if (!href.startsWith('data:image/svg+xml;base64') && /[<>]/.test(payload)) {
        problems.push('href 里有未编码的 < 或 >：浏览器会提前结束标签，SVG 剩余部分漏进 head');
        continue;
      }
    }
    let svgText = null;
    if (href.startsWith('data:image/svg+xml;base64,')) {
      try {
        svgText = Buffer.from(href.slice('data:image/svg+xml;base64,'.length), 'base64').toString('utf8');
      } catch {
        problems.push('base64 payload 无法解码');
      }
    } else {
      const payload = href.slice(href.indexOf(',') + 1);
      try {
        svgText = decodeURIComponent(payload);
      } catch {
        problems.push('百分号编码的 payload 无法解码');
      }
    }
    if (typeof svgText === 'string') {
      for (const problem of svgProblems(svgText)) problems.push(`内嵌 favicon SVG：${problem}`);
    }
  }
  const head = html.slice(0, html.search(/<\/head>/i) < 0 ? html.length : html.search(/<\/head>/i));
  const stray = /<(rect|circle|path|text|g)\b/.exec(head);
  if (stray !== null) {
    problems.push(`head 里出现游离的 <${stray[1]}>：favicon 标签后有残留片段，页面顶部会多出一个「岐」字`);
  }
  return problems;
}

/**
 * Audit one platform.
 * @param {string} root - project root.
 * @param {'web'|'android'|'harmony'} platform - platform key.
 * @returns {{platform:string, ok:boolean, checks:Check[], notes:string[]}} result.
 */
export function auditPlatform(root, platform) {
  const spec = PLATFORMS[platform];
  const checks = [];
  const notes = [];
  for (const target of spec.targets) {
    checks.push(...auditTarget(root, target));
  }
  const sources = new Set(spec.targets.map((target) => target.svg));
  for (const source of sources) {
    const file = join(root, source);
    checks.push(
      existsSync(file)
        ? check(`source:${source}`, 'pass', `SVG 源在库：${source}`)
        : fail(`source:${source}`, `缺少 SVG 源：${source}`, `PNG 无法复现或批量改尺寸。${pitfall('missing-source')}`),
    );
  }
  for (const target of spec.targets) {
    const png = join(root, target.file);
    const svg = join(root, target.svg);
    if (!existsSync(png) || !existsSync(svg)) continue;
    // Advisory only: a git checkout sets mtimes by checkout order, so this cannot fail a build.
    if (statSync(png).mtimeMs < statSync(svg).mtimeMs) {
      notes.push(`${target.file} 的 mtime 早于 ${target.svg}，若非刚 checkout 请重跑渲染脚本`);
    }
  }
  checks.push(...wiringChecks(root, platform, notes));
  const ok = checks.every((entry) => entry.level !== 'fail');
  return { platform, ok, checks, notes };
}

/**
 * Pixel checks for one target file.
 * @param {string} root - project root.
 * @param {import('./spec.js').Target} target - target spec.
 * @returns {Check[]} failures, warnings, and passing confirmations.
 */
function auditTarget(root, target) {
  const checks = [];
  const file = join(root, target.file);
  const label = target.file;
  if (!existsSync(file)) {
    return [
      fail(`missing:${label}`, `缺文件：${label}`, `该端应存在 ${describeTarget(target)}。${pitfall('missing-source')}`),
    ];
  }
  let image;
  try {
    image = decodePng(readFileSync(file));
  } catch (error) {
    return [fail(`decode:${label}`, `PNG 无法解码：${label}`, String(error.message ?? error))];
  }
  if (image.width !== target.size || image.height !== target.size) {
    checks.push(
      fail(
        `size:${label}`,
        `尺寸错误：${label} 是 ${image.width}×${image.height}`,
        `应为 ${target.size}×${target.size}。${pitfall('dimension')}`,
      ),
    );
  } else {
    checks.push(check(`size:${label}`, 'pass', `尺寸 ${target.size}×${target.size}：${label}`));
  }

  const stats = measure(image);

  if (target.alpha === 'opaque') {
    const corners = stats.cornerAlpha;
    if (image.hasAlphaChannel && stats.alphaMin === 0 && corners.every((alpha) => alpha === 0)) {
      checks.push(
        fail(
          `alpha:${label}`,
          `四角透明（自带圆角）：${label}`,
          `四角 alpha=${corners.join('/')}。系统还会再加一层遮罩，黑角与缝隙就是这样来的。${pitfall('rounded-corners')}`,
        ),
      );
    } else if (image.hasAlphaChannel && stats.alphaMin < 255) {
      checks.push(
        fail(
          `alpha:${label}`,
          `存在半透明像素：${label}`,
          `最小 alpha=${stats.alphaMin}（要求 255）。${pitfall('transparent-corner')}`,
        ),
      );
    } else {
      checks.push(check(`alpha:${label}`, 'pass', `满版不透明：${label}`));
    }
  } else if (target.alpha === 'transparent') {
    const corners = stats.cornerAlpha;
    if (corners.some((alpha) => alpha !== 0)) {
      checks.push(
        fail(
          `alpha:${label}`,
          `前景层四角不透明：${label}`,
          `四角 alpha=${corners.join('/')}（要求 0）。${pitfall('opaque-foreground')}`,
        ),
      );
    } else {
      checks.push(check(`alpha:${label}`, 'pass', `透明前景：${label}`));
    }
  }

  if (target.flatBg !== null) {
    const corner = pixelAt(image, 0, 0);
    const expected = parseHex(target.flatBg);
    if (corner.a !== 255 || Math.abs(corner.r - expected[0]) + Math.abs(corner.g - expected[1]) + Math.abs(corner.b - expected[2]) > 6) {
      checks.push(
        fail(
          `flatbg:${label}`,
          `启动图底板颜色不符：${label}`,
          `左上角 rgb(${corner.r},${corner.g},${corner.b})，应为 ${target.flatBg}。${pitfall('splash-color')}`,
        ),
      );
    } else {
      checks.push(check(`flatbg:${label}`, 'pass', `底板 ${target.flatBg}：${label}`));
    }
  }

  if (target.role === 'background') {
    const corners = [[0, 0], [image.width - 1, 0], [0, image.height - 1], [image.width - 1, image.height - 1]].map(([x, y]) => pixelAt(image, x, y));
    const dark = corners.every((pixel) => pixel.r < 0x60 && pixel.g < 0x70 && pixel.b < 0x60 && pixel.g >= pixel.r);
    checks.push(
      dark
        ? check(`bg:${label}`, 'pass', `背景层墨绿系满版：${label}`)
        : fail(`bg:${label}`, `背景层四角不是墨绿：${label}`, `四角 rgb=${corners.map((p) => `${p.r},${p.g},${p.b}`).join(' / ')}。${pitfall('background-solid')}`),
    );
    return checks;
  }

  if (target.disc !== null) {
    if (stats.discRatio === null) {
      checks.push(fail(`disc:${label}`, `找不到宣纸圆盘：${label}`, `图标主体必须有一块 ${BRAND.paper} 宣纸圆盘。`));
    } else if (stats.discRatio < target.disc[0] || stats.discRatio > target.disc[1]) {
      checks.push(
        fail(
          `disc:${label}`,
          `圆盘直径 ${pct(stats.discRatio, 2)} 超出 ${pct(target.disc[0])}–${pct(target.disc[1])}：${label}`,
          `主体过大或过小，桌面上会与其它应用不齐。${pitfall('disc-size')}`,
        ),
      );
    } else {
      checks.push(check(`disc:${label}`, 'pass', `圆盘 ${pct(stats.discRatio, 2)}：${label}`));
    }
  }

  if (target.requireSeal) {
    const seal = stats.seal;
    if (seal.count === 0 || seal.density < SEAL_MIN_DENSITY) {
      checks.push(
        fail(
          `seal:${label}`,
          `缺少朱砂「岐」印：${label}`,
          `右下安全区里的朱砂像素只有 ${pct(seal.density, 2)}（应 ≥${pct(SEAL_MIN_DENSITY)}）。${pitfall('seal-missing')}`,
        ),
      );
    } else if (target.seal === 'edge' && seal.edge !== null && seal.edge > target.sealLimit) {
      checks.push(
        fail(
          `seal:${label}`,
          `朱印越界：外沿 ${pct(seal.edge)} > ${pct(target.sealLimit)}（${label}）`,
          `圆形桌面遮罩会把越界部分裁掉。${pitfall('seal-outside-safe')}`,
        ),
      );
    } else if (target.seal === 'radius' && seal.maxRadius > target.sealLimit) {
      checks.push(
        fail(
          `seal:${label}`,
          `朱印超出安全圆：最远点 ${pct(seal.maxRadius)} > ${pct(target.sealLimit)}（${label}）`,
          `maskable 只保证中心 80% 圆可见。${pitfall('seal-outside-safe')}`,
        ),
      );
    } else {
      const shown = target.seal === 'edge' ? `外沿 ${pct(seal.edge)}` : `最远点 ${pct(seal.maxRadius)}`;
      const title = target.seal === null ? `朱印存在（${shown}）：${label}` : `朱印在安全区内（${shown}）：${label}`;
      checks.push(check(`seal:${label}`, 'pass', title));
    }
  }

  if (target.ringLimit !== null && stats.gold.maxRadius !== null) {
    if (stats.gold.maxRadius > target.ringLimit) {
      checks.push(
        fail(
          `ring:${label}`,
          `金环/星点越界：${pct(stats.gold.maxRadius)} > ${pct(target.ringLimit)}（${label}）`,
          `${pitfall('ring-overflow')}`,
        ),
      );
    } else {
      checks.push(check(`ring:${label}`, 'pass', `金环 ${pct(stats.gold.maxRadius)}：${label}`));
    }
  }

  if (target.contentRadiusLimit !== null && stats.contentRadius !== null) {
    if (stats.contentRadius > target.contentRadiusLimit) {
      checks.push(
        fail(
          `content:${label}`,
          `内容超出安全圆：半径 ${pct(stats.contentRadius)} > ${pct(target.contentRadiusLimit)}（${label}）`,
          `所有可见内容（含朱印）必须落在安全圆内。${pitfall('seal-outside-safe')}`,
        ),
      );
    } else {
      checks.push(check(`content:${label}`, 'pass', `内容半径 ${pct(stats.contentRadius)}：${label}`));
    }
  }

  if (target.contentInsetMin !== null && stats.contentInset !== null) {
    const { left, top, right, bottom } = stats.contentInset;
    const worst = Math.min(left, top, right, bottom);
    if (worst < target.contentInsetMin) {
      checks.push(
        fail(
          `inset:${label}`,
          `内容距边仅 ${pct(worst)} < ${pct(target.contentInsetMin)}（${label}）`,
          `左右上下：${pct(left)}/${pct(top)}/${pct(right)}/${pct(bottom)}。${pitfall('seal-outside-safe')}`,
        ),
      );
    } else {
      checks.push(check(`inset:${label}`, 'pass', `内容距边最小 ${pct(worst)}：${label}`));
    }
  }

  return checks;
}

function pixelAt(image, x, y) {
  const q = (y * image.width + x) * 4;
  return { r: image.rgba[q], g: image.rgba[q + 1], b: image.rgba[q + 2], a: image.rgba[q + 3] };
}

function parseHex(hex) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

/**
 * Wiring checks: the files that connect the pixels to each platform.
 * @param {string} root - project root.
 * @param {'web'|'android'|'harmony'} platform - platform key.
 * @param {string[]} notes - collected advisory notes.
 * @returns {Check[]} checks.
 */
function wiringChecks(root, platform, notes) {
  if (platform === 'web') return webWiring(root, notes);
  if (platform === 'android') return androidWiring(root, notes);
  return harmonyWiring(root, notes);
}

function webWiring(root, notes) {
  const layout = LAYOUT.web;
  const checks = [];
  const htmlPath = join(root, layout.indexHtml);
  const html = readText(htmlPath);
  if (html === null) {
    checks.push(fail('web:index', `缺少 ${layout.indexHtml}`, 'Web 端图标入口文件不存在。'));
  } else {
    const problems = faviconProblems(html);
    checks.push(
      problems.length === 0
        ? check('web:favicon', 'pass', 'favicon 标签完整、无残留片段')
        : fail('web:favicon', 'favicon 标签有问题', `${problems.join('；')}。${pitfall('favicon-residue')}`),
    );
    const themeColor = /<meta\s+name=["']theme-color["']\s+content=["']([^"']+)["']/i.exec(html)?.[1];
    const manifestPath = join(root, layout.manifest);
    const manifest = readJson(manifestPath);
    if (!manifest.ok) {
      checks.push(
        fail('web:manifest', `manifest 缺失或不是合法 JSON：${layout.manifest}`, String(manifest.error)),
      );
    } else {
      const value = manifest.value;
      const icons = Array.isArray(value.icons) ? value.icons : [];
      const sizes = icons.map((icon) => String(icon.sizes ?? ''));
      const missing = ['192x192', '512x512'].filter((want) => !sizes.includes(want));
      const maskable = icons.some((icon) => String(icon.purpose ?? '').includes('maskable'));
      const problems = [];
      if (missing.length > 0) problems.push(`缺图标尺寸 ${missing.join('/')}`);
      if (!maskable) problems.push('缺 purpose=maskable 的 512 图');
      if (themeColor && value.theme_color !== themeColor) {
        problems.push(`theme_color ${value.theme_color} 与页面 theme-color ${themeColor} 不一致`);
      }
      if (String(value.background_color ?? '').toLowerCase() !== BRAND.ink) {
        problems.push(`background_color 应为 ${BRAND.ink}`);
      }
      if (problems.length > 0) {
        checks.push(fail('web:manifest', 'manifest 声明不完整', `${problems.join('；')}。${pitfall('manifest')}`));
      } else {
        checks.push(check('web:manifest', 'pass', 'manifest 声明 192/512/maskable 且配色一致'));
      }
      for (const icon of icons) {
        const src = String(icon.src ?? '');
        if (src.startsWith('assets/') || src.startsWith('/assets/')) {
          checks.push(
            fail('web:vite', `manifest 引用了 assets/：${src}`, `Vite 只复制 public/。${pitfall('vite-assets')}`),
          );
        }
      }
    }
    const assetRefs = [...html.matchAll(/(?:href|src)=["']([^"']*\.(?:png|svg|ico|webmanifest))["']/gi)].map((m) => m[1]);
    for (const ref of assetRefs) {
      if (/^\.?\/?assets\//.test(ref)) {
        checks.push(fail('web:vite', `页面引用了 assets/：${ref}`, `构建后 404。${pitfall('vite-assets')}`));
      }
    }
  }
  const gitignore = readText(join(root, layout.gitignore));
  if (gitignore !== null && !/^dist\/?$/m.test(gitignore)) {
    notes.push(`${layout.gitignore} 未忽略 dist/，构建产物会被提交`);
  }
  if (!existsSync(join(root, layout.renderScript))) {
    notes.push(`建议保留 ${layout.renderScript}，让 PNG 永远由脚本生成`);
  }
  return checks;
}

function androidWiring(root, notes) {
  const layout = LAYOUT.android;
  const checks = [];
  for (const file of [layout.adaptiveIcon, layout.adaptiveIconRound]) {
    const text = readText(join(root, file));
    if (text === null) {
      checks.push(
        fail('android:adaptive', `缺少自适应图标声明：${file}`, `minSdk 26 起应只保留 anydpi-v26 分层图标。${pitfall('adaptive-icon')}`),
      );
      continue;
    }
    const problems = [];
    if (!text.includes('<adaptive-icon')) problems.push('不是 <adaptive-icon>');
    if (!text.includes('@color/ic_launcher_background')) problems.push('背景未指向 @color/ic_launcher_background');
    if (!text.includes('ic_launcher_foreground')) problems.push('前景未指向 @mipmap/ic_launcher_foreground');
    checks.push(
      problems.length === 0
        ? check('android:adaptive', 'pass', `自适应图标声明正确：${file}`)
        : fail('android:adaptive', `自适应图标声明有问题：${file}`, `${problems.join('；')}。${pitfall('adaptive-icon')}`),
    );
  }
  const colors = readText(join(root, layout.colors));
  const colorValue = colors === null ? null : /name=["']ic_launcher_background["'][^>]*>([^<]+)</.exec(colors)?.[1]?.trim();
  if (colorValue === null) {
    checks.push(fail('android:colors', 'colors.xml 缺少 ic_launcher_background', `${pitfall('adaptive-icon')}`));
  } else if (colorValue.toLowerCase() !== BRAND.ink) {
    checks.push(
      fail(
        'android:colors',
        `ic_launcher_background 应为 ${BRAND.ink}`,
        `当前 ${colorValue}，与图标底板不一致会出现色块边界。${pitfall('splash-color')}`,
      ),
    );
  } else {
    checks.push(check('android:colors', 'pass', `ic_launcher_background ${colorValue}`));
  }
  const manifest = readText(join(root, layout.manifest));
  if (manifest !== null) {
    const problems = [];
    if (!/@mipmap\/ic_launcher\b/.test(manifest)) problems.push('android:icon 未指向 @mipmap/ic_launcher');
    if (!/@mipmap\/ic_launcher_round\b/.test(manifest)) problems.push('android:roundIcon 缺失');
    checks.push(
      problems.length === 0
        ? check('android:manifest', 'pass', 'Manifest 引用自适应图标与圆形图标')
        : fail('android:manifest', 'Manifest 图标引用不完整', problems.join('；')),
    );
  }
  const themes = readText(join(root, layout.themes));
  if (themes !== null) {
    const windowBackground = /android:windowBackground["']?\s*>\s*([^<]+)</.exec(themes)?.[1]?.trim();
    if (windowBackground !== undefined && windowBackground !== '@color/bg' && windowBackground.toLowerCase() !== BRAND.ink) {
      notes.push(`themes.xml 的 windowBackground 是 ${windowBackground}，与图标底色 ${BRAND.ink} 不同，启动瞬间会出现色块边界`);
    }
  }
  if (!existsSync(join(root, layout.renderScript))) {
    notes.push(`建议保留 ${layout.renderScript}，五档密度由脚本一次生成`);
  }
  return checks;
}

function harmonyWiring(root, notes) {
  const layout = LAYOUT.harmony;
  const checks = [];
  const moduleText = readText(join(root, layout.moduleJson));
  if (moduleText === null) {
    checks.push(fail('harmony:module', `缺少 ${layout.moduleJson}`, '无法确认分层图标接线。'));
  } else {
    const json = stripJsonComments(moduleText);
    const icon = /"icon"\s*:\s*"([^"]+)"/.exec(json)?.[1];
    const startWindowIcon = /"startWindowIcon"\s*:\s*"([^"]+)"/.exec(json)?.[1];
    const startWindowBackground = /"startWindowBackground"\s*:\s*"([^"]+)"/.exec(json)?.[1];
    const problems = [];
    if (icon !== '$media:layered_image') problems.push(`icon 应为 $media:layered_image，当前 ${icon ?? '缺失'}`);
    if (startWindowIcon !== '$media:startIcon') problems.push(`startWindowIcon 应为 $media:startIcon，当前 ${startWindowIcon ?? '缺失'}`);
    if (startWindowBackground !== '$color:start_window_background') {
      problems.push(`startWindowBackground 应为 $color:start_window_background，当前 ${startWindowBackground ?? '缺失'}`);
    }
    checks.push(
      problems.length === 0
        ? check('harmony:module', 'pass', 'module.json5 分层图标与启动窗口接线正确')
        : fail('harmony:module', 'module.json5 图标接线不完整', `${problems.join('；')}。${pitfall('harmony-layered')}`),
    );
  }
  const appJson = readText(join(root, layout.appJson));
  if (appJson !== null) {
    const appIcon = /"icon"\s*:\s*"([^"]+)"/.exec(stripJsonComments(appJson))?.[1];
    checks.push(
      appIcon === '$media:app_icon'
        ? check('harmony:app', 'pass', 'app.json5 使用 $media:app_icon')
        : fail('harmony:app', 'app.json5 图标不符', `当前 ${appIcon ?? '缺失'}，应为 $media:app_icon。${pitfall('harmony-layered')}`),
    );
  }
  const layered = readJson(join(root, layout.layeredImage));
  if (layered.ok) {
    const value = layered.value['layered-image'] ?? {};
    const problems = [];
    if (value.background !== '$media:background') problems.push('background 应为 $media:background');
    if (value.foreground !== '$media:foreground') problems.push('foreground 应为 $media:foreground');
    checks.push(
      problems.length === 0
        ? check('harmony:layered', 'pass', 'layered_image.json 指向 foreground/background')
        : fail('harmony:layered', 'layered_image.json 内容不符', problems.join('；')),
    );
  } else {
    checks.push(fail('harmony:layered', 'layered_image.json 缺失或非法', String(layered.error)));
  }
  const colorJson = readText(join(root, layout.colorJson));
  const token = colorJson === null
    ? null
    : new RegExp(`"name"\\s*:\\s*"${layout.startWindowColorToken}"[^}]*"value"\\s*:\\s*"([^"]+)"`).exec(colorJson)?.[1];
  if (token === null) {
    checks.push(
      fail('harmony:color', `color.json 缺少 ${layout.startWindowColorToken}`, `${pitfall('splash-color')}`),
    );
  } else if (token.toLowerCase() !== BRAND.ink) {
    checks.push(
      fail(
        'harmony:color',
        `${layout.startWindowColorToken} 应为 ${BRAND.ink}`,
        `当前 ${token}，与 startIcon 底板不一致会出现色块边界。${pitfall('splash-color')}`,
      ),
    );
  } else {
    checks.push(check('harmony:color', 'pass', `${layout.startWindowColorToken} ${token}`));
  }
  if (!existsSync(join(root, layout.renderScript))) {
    notes.push(`建议保留 ${layout.renderScript}，1024 四张图由脚本一次生成`);
  }
  return checks;
}

/**
 * Detect which platforms a project contains.
 * @param {string} root - project root.
 * @returns {Array<'web'|'android'|'harmony'>} detected platforms.
 */
export function detectPlatforms(root) {
  const found = [];
  if (existsSync(join(root, 'index.html')) && existsSync(join(root, 'public'))) found.push('web');
  if (existsSync(join(root, 'app', 'src', 'main', 'res'))) found.push('android');
  if (existsSync(join(root, 'AppScope'))) found.push('harmony');
  return found;
}
