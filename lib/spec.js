/**
 * The icon design standard as data: brand palette, master geometry, per-platform
 * targets with their pass bands, project layout, and the pitfall catalogue.
 *
 * Everything the tools report is derived from this file, so a brand or geometry
 * change made here reaches blueprint, render, and audit at once.
 */

/** Brand palette and gradients shared by all three platforms. */
export const BRAND = {
  ink: '#1d2a24',
  forest: '#2f4a3b',
  paper: '#f3e8d2',
  cinnabar: '#a8332a',
  ochre: '#c99a3a',
  bgGradient: [
    ['0', '#2b4435'],
    ['.55', '#1d2a24'],
    ['1', '#131c17'],
  ],
  paperGradient: [
    ['0', '#f6ead2'],
    ['.72', '#efe1c7'],
    ['1', '#e5d3b3'],
  ],
};

/** The 1024 unit master every platform asset is derived from. */
export const MASTER = {
  canvas: 1024,
  center: 512,
  discR: 306,
  ringR: 368,
  starCount: 12,
  sealAt: 688,
  sealSize: 150,
};

/** Android adaptive-icon geometry: a 108 dp canvas whose visible area is 72 dp and safe circle 33 dp. */
export const ANDROID = {
  canvas: 108,
  visible: 72,
  safeRadius: 33,
  discDiameter: 46.4,
  ringDiameter: 55.8,
  sealScale: 0.076,
  sealAt: 65.5,
};

/** HarmonyOS layered-icon geometry: 1024 canvas, subject inside a 90% box. */
export const HARMONY = {
  canvas: 1024,
  safeInset: 0.1,
  subjectScale: 330 / MASTER.discR,
};

/** PWA maskable safe circle: the subject must fit in the centre 80% diameter. */
export const MASKABLE_SCALE = 0.88;

/**
 * Minimum share of the canvas that the seal must cover in the bottom-right region.
 * The seal occupies about 2.1%; the cinnabar sun and pulse line alone stay near
 * 0.06%, so this separates "seal present" from "only other red artwork".
 */
export const SEAL_MIN_DENSITY = 0.005;

const DEFAULT_DISC_HALF_WIDTH = 0.03;

/**
 * @typedef {object} Target
 * @property {string} file canvas-relative PNG path.
 * @property {string} svg canvas-relative source SVG this PNG is rendered from.
 * @property {string} kind generator kind that produces the canonical SVG.
 * @property {number} size exact pixel size of both sides.
 * @property {'opaque'|'transparent'|'any'} alpha transparency contract of the layer.
 * @property {'favicon'|'any'|'maskable'|'foreground'|'background'} role design role, for messages.
 * @property {[number,number]|null} disc allowed disc diameter ÷ canvas.
 * @property {'edge'|'radius'|null} seal how the seal position is bounded.
 * @property {number|null} sealLimit the bound for {@link seal}.
 * @property {number|null} ringNominal expected gold-ring diameter ÷ canvas.
 * @property {number|null} ringLimit maximum gold-ring diameter ÷ canvas, or null when unbounded.
 * @property {number|null} contentRadiusLimit maximum visible radius ÷ half canvas.
 * @property {number|null} contentInsetMin minimum content margin on every side.
 * @property {boolean} requireSeal whether the cinnabar seal must be present.
 * @property {string|null} flatBg an exact background colour the corners must show, or null.
 */

/** @type {Record<string, {sources: string[], targets: Target[]}>} */
export const PLATFORMS = {
  web: {
    sources: ['assets/logo-favicon.svg', 'assets/logo-app-icon.svg', 'assets/logo-maskable.svg'],
    targets: [
      {
        file: 'public/favicon-32.png',
        svg: 'assets/logo-favicon.svg',
        kind: 'web-favicon',
        size: 32,
        alpha: 'any',
        role: 'favicon',
        disc: [0.68, 0.76],
        seal: null,
        sealLimit: null,
        ringNominal: null,
        ringLimit: null,
        contentRadiusLimit: null,
        contentInsetMin: null,
        requireSeal: false,
        flatBg: null,
      },
      ...['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].map((name) => ({
        file: `public/${name}`,
        svg: 'assets/logo-app-icon.svg',
        kind: 'web-any',
        size: name === 'apple-touch-icon.png' ? 180 : name === 'icon-192.png' ? 192 : 512,
        alpha: 'opaque',
        role: 'any',
        disc: [0.5977 - DEFAULT_DISC_HALF_WIDTH, 0.5977 + DEFAULT_DISC_HALF_WIDTH],
        seal: 'edge',
        sealLimit: 0.9,
        ringNominal: null,
        ringLimit: null,
        contentRadiusLimit: null,
        contentInsetMin: null,
        requireSeal: true,
        flatBg: null,
      })),
      {
        file: 'public/maskable-512.png',
        svg: 'assets/logo-maskable.svg',
        kind: 'web-maskable',
        size: 512,
        alpha: 'opaque',
        role: 'maskable',
        disc: [0.526 - 0.03, 0.526 + 0.03],
        seal: 'radius',
        sealLimit: 0.8,
        ringNominal: 0.6325,
        ringLimit: 0.8,
        contentRadiusLimit: null,
        contentInsetMin: null,
        requireSeal: true,
        flatBg: null,
      },
    ],
  },
  android: {
    sources: ['design/icon/ic-launcher-foreground.svg'],
    targets: [
      ['mdpi', 108],
      ['hdpi', 162],
      ['xhdpi', 216],
      ['xxhdpi', 324],
      ['xxxhdpi', 432],
    ].map(([density, size]) => ({
      file: `app/src/main/res/mipmap-${density}/ic_launcher_foreground.png`,
      svg: 'design/icon/ic-launcher-foreground.svg',
      kind: 'android-foreground',
      size,
      alpha: 'transparent',
      role: 'foreground',
      disc: [(ANDROID.discDiameter / ANDROID.canvas) - 0.03, (ANDROID.discDiameter / ANDROID.canvas) + 0.03],
      seal: null,
      sealLimit: null,
      ringNominal: ANDROID.ringDiameter / ANDROID.canvas,
      ringLimit: ANDROID.safeRadius / (ANDROID.canvas / 2),
      contentRadiusLimit: ANDROID.safeRadius / (ANDROID.canvas / 2),
      contentInsetMin: null,
      requireSeal: true,
      flatBg: null,
    })),
  },
  harmony: {
    sources: ['design/icon/foreground.svg', 'design/icon/background.svg', 'design/icon/start-icon.svg', 'design/icon/app-icon.svg'],
    targets: [
      {
        file: 'entry/src/main/resources/base/media/foreground.png',
        svg: 'design/icon/foreground.svg',
        kind: 'harmony-foreground',
        size: 1024,
        alpha: 'transparent',
        role: 'foreground',
        disc: [0.6445 - 0.03, 0.6445 + 0.03],
        seal: null,
        sealLimit: null,
        ringNominal: 0.7751,
        ringLimit: 0.9,
        contentRadiusLimit: null,
        contentInsetMin: HARMONY.safeInset,
        requireSeal: true,
        flatBg: null,
      },
      {
        file: 'entry/src/main/resources/base/media/background.png',
        svg: 'design/icon/background.svg',
        kind: 'harmony-background',
        size: 1024,
        alpha: 'opaque',
        role: 'background',
        disc: null,
        seal: null,
        sealLimit: null,
        ringNominal: null,
        ringLimit: null,
        contentRadiusLimit: null,
        contentInsetMin: null,
        requireSeal: false,
        flatBg: null,
      },
      {
        file: 'entry/src/main/resources/base/media/startIcon.png',
        svg: 'design/icon/start-icon.svg',
        kind: 'harmony-start',
        size: 1024,
        alpha: 'opaque',
        role: 'any',
        disc: [0.5977 - DEFAULT_DISC_HALF_WIDTH, 0.5977 + DEFAULT_DISC_HALF_WIDTH],
        seal: 'edge',
        sealLimit: 0.9,
        ringNominal: null,
        ringLimit: null,
        contentRadiusLimit: null,
        contentInsetMin: null,
        requireSeal: true,
        flatBg: BRAND.ink,
      },
      {
        file: 'AppScope/resources/base/media/app_icon.png',
        svg: 'design/icon/app-icon.svg',
        kind: 'web-any',
        size: 1024,
        alpha: 'opaque',
        role: 'any',
        disc: [0.5977 - DEFAULT_DISC_HALF_WIDTH, 0.5977 + DEFAULT_DISC_HALF_WIDTH],
        seal: 'edge',
        sealLimit: 0.9,
        ringNominal: null,
        ringLimit: null,
        contentRadiusLimit: null,
        contentInsetMin: null,
        requireSeal: true,
        flatBg: null,
      },
    ],
  },
};

/** Files the standard requires a project to keep, independent of pixel checks. */
export const LAYOUT = {
  web: {
    renderScript: 'tools/render-web-icons.mjs',
    manifest: 'public/site.webmanifest',
    indexHtml: 'index.html',
    gitignore: '.gitignore',
    publicDir: 'public',
  },
  android: {
    renderScript: 'design/icon/render.mjs',
    sourceSvg: 'design/icon/ic-launcher-foreground.svg',
    adaptiveIcon: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml',
    adaptiveIconRound: 'app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml',
    colors: 'app/src/main/res/values/colors.xml',
    manifest: 'app/src/main/AndroidManifest.xml',
    themes: 'app/src/main/res/values/themes.xml',
  },
  harmony: {
    renderScript: 'design/icon/render.mjs',
    moduleJson: 'entry/src/main/module.json5',
    appJson: 'AppScope/app.json5',
    colorJson: 'entry/src/main/resources/base/element/color.json',
    layeredImage: 'entry/src/main/resources/base/media/layered_image.json',
    startWindowColorToken: 'start_window_background',
  },
};

/**
 * Known failure modes, as `id -> {symptom, fix}`. Audit messages quote these so a
 * failure names the mistake it is about to cause instead of only a number.
 */
export const PITFALLS = {
  'dimension': {
    symptom: '尺寸不合规：上架被拒，或高分屏发虚',
    fix: '按目标表重出该尺寸，不要用 CSS/图片查看器缩放凑数',
  },
  'rounded-corners': {
    symptom: '资源自带圆角，系统二次遮罩后出现黑角/缝隙',
    fix: '满版直角、背景不透明，圆角与遮罩交给系统生成',
  },
  'transparent-corner': {
    symptom: '透明四角在 iOS/Android 主屏被填成黑色，或启动页露出色块',
    fix: '该层必须满版不透明，导出时不要保留 alpha',
  },
  'opaque-foreground': {
    symptom: '前景层带底色，遮罩后与背景层叠成两层山',
    fix: '前景层只放徽记且透明，底色放背景层',
  },
  'seal-outside-safe': {
    symptom: '朱印贴近边缘，圆形遮罩下被裁掉',
    fix: '收进安全区：Android 半径 33dp、Harmony 距边 ≥10%、maskable 80% 圆',
  },
  'seal-missing': {
    symptom: '品牌落款丢失，图标认不出是岐黄万里',
    fix: '朱砂「岐」印必须存在且完整（favicon 除外）',
  },
  'ring-overflow': {
    symptom: '金环/星点越界，遮罩下残缺',
    fix: '按安全半径重算环半径，不要按画布满铺',
  },
  'disc-size': {
    symptom: '主体过大或过小，桌面图标显得与其他应用不齐',
    fix: '按可见区比例换算主体直径，不要按 108/1024 画布占比设计',
  },
  'missing-source': {
    symptom: '只提交 PNG 不留源文件，日后无法复现与批量改尺寸',
    fix: 'SVG 源 + 渲染脚本一起入库，PNG 一律由脚本生成',
  },
  'stale-png': {
    symptom: 'SVG 改了但 PNG 没重出，产物与源不一致',
    fix: '改完 SVG 立即重跑渲染脚本',
  },
  'favicon-residue': {
    symptom: 'favicon 标签后残留 SVG 片段，页面顶部多出一个「岐」字',
    fix: '标签单行完整闭合；data URI 用 base64 或百分号编码，不留裸 < > " #',
  },
  'vite-assets': {
    symptom: '把 assets/ 当静态目录引用，构建后图标 404',
    fix: '图标放 public/，由 Vite 原样复制进 dist/',
  },
  'manifest': {
    symptom: 'PWA 安装后图标错、状态栏配色不一致',
    fix: 'manifest 声明 192/512/maskable，theme_color 与页面一致，background_color 用墨绿',
  },
  'adaptive-icon': {
    symptom: '自适应图标未生效，桌面显示成旧版单层图',
    fix: 'mipmap-anydpi-v26 声明 background+foreground，颜色走 @color/ic_launcher_background',
  },
  'splash-color': {
    symptom: '启动瞬间出现明显色块边界',
    fix: '启动窗口底色与图标底色统一 #1d2a24',
  },
  'harmony-layered': {
    symptom: '鸿蒙分层图标未接线，桌面显示单层锯齿图',
    fix: 'icon=$media:layered_image，startWindowIcon=$media:startIcon，startWindowBackground=$color:start_window_background',
  },
  'background-solid': {
    symptom: '背景层半透明或过浅，图标显得脏',
    fix: '背景层满版不透明，墨绿渐变 #2b4435→#1d2a24→#131c17',
  },
};

/** Human-readable pass bands, for the blueprint tool's report. */
export function describeTarget(target) {
  const parts = [`${target.size}×${target.size}`];
  if (target.alpha === 'opaque') parts.push('满版不透明');
  else if (target.alpha === 'transparent') parts.push('透明前景');
  else parts.push('允许透明');
  if (target.disc) parts.push(`圆盘 ${(target.disc[0] * 100).toFixed(1)}–${(target.disc[1] * 100).toFixed(1)}%`);
  if (target.seal === 'edge') parts.push(`朱印外沿 ≤${(target.sealLimit * 100).toFixed(1)}%`);
  if (target.seal === 'radius') parts.push(`朱印最远点 ≤${(target.sealLimit * 100).toFixed(0)}% 半径`);
  if (target.contentRadiusLimit) parts.push(`内容半径 ≤${(target.contentRadiusLimit * 100).toFixed(1)}% 半画布`);
  if (target.contentInsetMin) parts.push(`内容距边 ≥${(target.contentInsetMin * 100).toFixed(0)}%`);
  if (target.ringLimit) parts.push(`金环 ≤${(target.ringLimit * 100).toFixed(1)}%`);
  return parts.join('；');
}
