/**
 * Canonical SVG generation for every target.
 *
 * One geometry recipe, applied at different scales: the 1024 master, the 108 dp
 * Android adaptive canvas whose visible area is 72 dp, and the 80% maskable
 * circle. Generating instead of pasting keeps the seal inside every safe zone
 * by construction, which is the mistake the standard keeps warning about.
 */
import { ANDROID, BRAND, HARMONY, MASTER, MASKABLE_SCALE } from './spec.js';

const CENTER = MASTER.center;
/** Right/bottom edge of the seal in master units. Scaling the seal keeps this edge fixed. */
const SEAL_OUTER_EDGE = MASTER.sealAt + MASTER.sealSize;

const DEFS_PAPER = `
    <radialGradient id="paper" cx=".5" cy=".38" r=".65">
      <stop offset="0" stop-color="#f6ead2"/>
      <stop offset=".72" stop-color="#efe1c7"/>
      <stop offset="1" stop-color="#e5d3b3"/>
    </radialGradient>
    <linearGradient id="mb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5d7664"/>
      <stop offset="1" stop-color="#3c5144"/>
    </linearGradient>
    <linearGradient id="mf" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f4a3b"/>
      <stop offset="1" stop-color="#1d3027"/>
    </linearGradient>`;

const DEFS_BG = `
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b4435"/>
      <stop offset=".55" stop-color="#1d2a24"/>
      <stop offset="1" stop-color="#131c17"/>
    </linearGradient>`;

/** The 1024-space landscape, pulse lines, and herb. Stroke widths are master units. */
const SCENE = `      <circle cx="512" cy="356" r="58" fill="#a8332a" opacity=".92"/>
      <path d="M 210 720 L 350 500 L 430 574 L 526 414 L 646 560 L 748 466 L 840 720 Z" fill="url(#mb)" opacity=".58"/>
      <path d="M 196 760 L 334 566 L 424 650 L 516 522 L 612 630 L 696 546 L 850 760 Z" fill="url(#mf)"/>
      <path d="M 376 806 C 436 736 476 704 512 646 C 548 588 584 558 654 520" fill="none" stroke="#d6aa52" stroke-width="9" stroke-linecap="round" opacity=".9"/>
      <path d="M 286 700 L 380 700 L 410 660 L 438 734 L 474 682 L 512 700 L 738 700" fill="none" stroke="#a8332a" stroke-width="5" stroke-linecap="round" opacity=".85"/>
      <path d="M 512 792 C 512 742 512 704 512 660" fill="none" stroke="#6f8f61" stroke-width="7" stroke-linecap="round"/>
      <path d="M 512 724 C 478 716 460 690 466 662 C 498 666 512 690 512 712 Z" fill="#7d9b6a"/>
      <path d="M 512 704 C 544 694 562 668 556 640 C 524 646 510 670 512 692 Z" fill="#8faa78"/>`;

/**
 * The cinnabar seal, in canvas units.
 * @param {number} x - left edge of the 150 unit seal.
 * @param {number} scale - seal scale; 1 keeps the master 150 unit size.
 * @returns {string} SVG markup.
 */
function seal(x, scale) {
  const transform = scale === 1 ? `translate(${x} ${x})` : `translate(${x} ${x}) scale(${scale})`;
  return `  <g transform="${transform}">
    <rect width="150" height="150" rx="9" fill="#a8332a"/>
    <rect x="7" y="7" width="136" height="136" rx="5" fill="none" stroke="#f6ead2" stroke-width="2" opacity=".55"/>
    <text x="75" y="112" text-anchor="middle" font-family="KaiTi, STKaiti, 'Noto Serif CJK SC', serif" font-size="104" font-weight="600" fill="#f6ead2">岐</text>
  </g>`;
}

/**
 * The gold ring and its twelve star dots.
 * @param {{center:number, radius:number, starRadius:number, dotR:number, stroke:number}} unit - geometry in canvas units.
 * @returns {string} SVG markup.
 */
function ringAndStars({ center, radius, starRadius, dotR, stroke }) {
  const dots = [];
  for (let i = 0; i < MASTER.starCount; i += 1) {
    const angle = (-90 + i * 30) * (Math.PI / 180);
    const x = center + starRadius * Math.cos(angle);
    const y = center + starRadius * Math.sin(angle);
    dots.push(`    <circle cx="${+x.toFixed(3)}" cy="${+y.toFixed(3)}" r="${dotR}"/>`);
  }
  return `  <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#c99a3a" stroke-width="${stroke}" opacity=".5"/>
  <g fill="#c99a3a" opacity=".55">
${dots.join('\n')}
  </g>`;
}

/**
 * Disc plus clipped landscape in master units, optionally scaled about the canvas centre.
 * @param {number} scale - uniform scale about the canvas centre.
 * @param {number} discR - disc radius in output canvas units.
 * @param {number} center - canvas centre in output units.
 * @param {number} [stroke] - disc outline stroke width in output units.
 * @returns {string} SVG markup.
 */
function discAndScene(scale, discR, center, stroke = 3) {
  const clip = `<clipPath id="disc"><circle cx="${center}" cy="${center}" r="${discR}"/></clipPath>`;
  const opened = scale === 1
    ? `  <g clip-path="url(#disc)">`
    : `  <g clip-path="url(#disc)">
    <g transform="translate(${center} ${center}) scale(${scale}) translate(${-CENTER} ${-CENTER})">`;
  const closed = scale === 1 ? '  </g>' : '    </g>\n  </g>';
  return `  <defs>\n    ${clip}\n  </defs>
  <circle cx="${center}" cy="${center}" r="${discR}" fill="url(#paper)"/>
  <circle cx="${center}" cy="${center}" r="${discR}" fill="none" stroke="#c99a3a" stroke-width="${stroke}" opacity=".7"/>
${opened}
${SCENE}
${closed}`;
}

/**
 * Build the complete, standard-compliant SVG for one target.
 * @param {'web-any'|'web-maskable'|'web-favicon'|'android-foreground'|'harmony-foreground'|'harmony-background'|'harmony-start'} kind - target kind.
 * @returns {string} standalone SVG document.
 */
export function buildSvg(kind) {
  if (kind === 'web-favicon') return FAVICON;
  if (kind === 'harmony-background') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${DEFS_BG}
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
</svg>
`;
  }
  if (kind === 'harmony-foreground') {
    const k = HARMONY.subjectScale;
    const discR = MASTER.discR * k;
    const ringR = MASTER.ringR * k;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${DEFS_PAPER}
  </defs>

${ringAndStars({ center: CENTER, radius: ringR, starRadius: 350 * k, dotR: +(3.2 * k).toFixed(3), stroke: +(2 / k).toFixed(3) })}

${discAndScene(k, discR, CENTER, +(3 * k).toFixed(3))}

${seal(SEAL_OUTER_EDGE - MASTER.sealSize * k, +k.toFixed(6))}
</svg>
`;
  }
  if (kind === 'harmony-start') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${DEFS_PAPER}
  </defs>

  <rect width="1024" height="1024" fill="${BRAND.ink}"/>
${ringAndStars({ center: CENTER, radius: MASTER.ringR, starRadius: 350, dotR: 3.2, stroke: 2 })}

${discAndScene(1, MASTER.discR, CENTER, 3)}

${seal(MASTER.sealAt, 1)}
</svg>
`;
  }
  if (kind === 'web-any' || kind === 'harmony-app-icon') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${DEFS_BG}${DEFS_PAPER}
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect x="36" y="36" width="952" height="952" rx="200" fill="none" stroke="#c99a3a" stroke-width="2" opacity=".3"/>
${ringAndStars({ center: CENTER, radius: MASTER.ringR, starRadius: 350, dotR: 3.2, stroke: 2 })}

${discAndScene(1, MASTER.discR, CENTER, 3)}

${seal(MASTER.sealAt, 1)}
</svg>
`;
  }
  if (kind === 'web-maskable') {
    const k = MASKABLE_SCALE;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>${DEFS_BG}${DEFS_PAPER}
  </defs>

  <rect width="1024" height="1024" fill="url(#bg)"/>

  <g transform="translate(${CENTER} ${CENTER}) scale(${k}) translate(${-CENTER} ${-CENTER})">
${ringAndStars({ center: CENTER, radius: MASTER.ringR, starRadius: 350, dotR: 3.2, stroke: 2 })}

${discAndScene(1, MASTER.discR, CENTER, 3)}

${seal(MASTER.sealAt, 1)}
  </g>
</svg>
`;
  }
  if (kind === 'android-foreground') {
    const c = ANDROID.canvas / 2;
    const sceneScale = ANDROID.discDiameter / 2 / MASTER.discR;
    const discR = ANDROID.discDiameter / 2;
    const ringR = ANDROID.ringDiameter / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
  <defs>${DEFS_PAPER}
  </defs>

${ringAndStars({ center: c, radius: ringR, starRadius: ANDROID.ringDiameter * 0.4954, dotR: 0.34, stroke: 0.21 })}

${discAndScene(sceneScale, discR, c, 0.32)}

${seal(ANDROID.sealAt, ANDROID.sealScale)}
</svg>
`;
  }
  throw new Error(`unknown icon kind ${kind}`);
}

/** The 64 unit simplified mark: no seal, readable down to 16 px. */
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1d2a24"/>
  <circle cx="32" cy="32" r="23" fill="#f3e8d2"/>
  <circle cx="32" cy="22" r="5.2" fill="#a8332a"/>
  <path d="M12 47 L22 31 L27 36 L33 26 L40 35 L45 30 L52 47 Z" fill="#2f4a3b"/>
  <path d="M22 50 C27 44 29 41 32 37" fill="none" stroke="#c99a3a" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M14 43 L22 43 L24 40 L26 46 L28 42 L32 43 L48 43" fill="none" stroke="#a8332a" stroke-width="1.2" opacity=".8"/>
</svg>
`;

/** Geometry report for the blueprint tool: the numbers behind each rule. */
export function geometryReport() {
  const masterSealEdge = MASTER.sealAt + MASTER.sealSize;
  const masterSealRadius = Math.hypot(masterSealEdge - CENTER, masterSealEdge - CENTER);
  return [
    {
      scope: 'master',
      lines: [
        `画布 ${MASTER.canvas}，中心 ${CENTER}`,
        `圆盘直径 ${MASTER.discR * 2} = ${((MASTER.discR * 2) / MASTER.canvas * 100).toFixed(2)}%`,
        `金环直径 ${MASTER.ringR * 2} = ${((MASTER.ringR * 2) / MASTER.canvas * 100).toFixed(2)}%`,
        `星点半径 350（${(350 / MASTER.ringR * 100).toFixed(1)}% 环半径）× ${MASTER.starCount} 个`,
        `朱印原点 (${MASTER.sealAt},${MASTER.sealAt})，边长 ${MASTER.sealSize}，外沿 ${masterSealEdge} = ${(masterSealEdge / MASTER.canvas * 100).toFixed(1)}%（要求 ≤90%）`,
        `朱印对角半径 ${masterSealRadius.toFixed(1)} = ${(masterSealRadius / (MASTER.canvas / 2) * 100).toFixed(1)}% 半画布`,
      ],
    },
    {
      scope: 'android',
      lines: [
        `画布 ${ANDROID.canvas}dp，可见区 ${ANDROID.visible}dp，安全圆半径 ${ANDROID.safeRadius}dp`,
        `圆盘直径 ${ANDROID.discDiameter}dp = 可见区 ${(ANDROID.discDiameter / ANDROID.visible * 100).toFixed(1)}%、画布 ${(ANDROID.discDiameter / ANDROID.canvas * 100).toFixed(1)}%`,
        `金环直径 ${ANDROID.ringDiameter}dp = 可见区 ${(ANDROID.ringDiameter / ANDROID.visible * 100).toFixed(1)}%`,
        `朱印 ${(MASTER.sealSize * ANDROID.sealScale).toFixed(1)}dp，对角半径 ${(masterSealRadius * ANDROID.sealScale).toFixed(1)}dp ≤ ${ANDROID.safeRadius}dp`,
        `场景组缩放 ${(ANDROID.discDiameter / 2 / MASTER.discR).toFixed(6)}`,
      ],
    },
    {
      scope: 'harmony',
      lines: [
        `画布 ${HARMONY.canvas}，主视觉缩放 ${HARMONY.subjectScale.toFixed(5)}（圆盘 ${(MASTER.discR * HARMONY.subjectScale).toFixed(1)}，即 ${(MASTER.discR * HARMONY.subjectScale * 2 / HARMONY.canvas * 100).toFixed(2)}%）`,
        `金环 ${(MASTER.ringR * HARMONY.subjectScale * 2 / HARMONY.canvas * 100).toFixed(1)}%，须 ≤90%`,
        `朱印外沿 ${((MASTER.sealAt * HARMONY.subjectScale + (1 - HARMONY.subjectScale) * CENTER + MASTER.sealSize * HARMONY.subjectScale) / HARMONY.canvas * 100).toFixed(1)}%，须 ≤90%（距边 ≥10%）`,
        '前景层透明；背景层与 startIcon 底板必须满版不透明',
      ],
    },
    {
      scope: 'web',
      lines: [
        `favicon 64 单位栅格，圆盘 46/64 = 71.9%，无朱印，允许透明四角`,
        `maskable 组缩放 ${MASKABLE_SCALE}：圆盘 ${(0.5977 * MASKABLE_SCALE * 100).toFixed(1)}%，朱印最远点 ${(masterSealRadius * MASKABLE_SCALE / (MASTER.canvas / 2) * 100).toFixed(1)}%（要求 ≤80%）`,
        `any 图标满版不透明：朱印外沿 ${(masterSealEdge / MASTER.canvas * 100).toFixed(1)}%（要求 ≤90%），不得带圆角`,
        `apple-touch-icon 180×180 单独出图，不透明，iOS 自动加圆角`,
      ],
    },
  ];
}
