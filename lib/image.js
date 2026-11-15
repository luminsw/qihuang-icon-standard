/**
 * Pixel measurements used by the icon audit.
 *
 * Every measurement is reported as a ratio of the canvas so one rule set works
 * at 32 px and at 1024 px. The disc radius is measured with a ray scan and a
 * median, which stays correct when the seal, the mountains, or the sun cover
 * part of the disc: along a ray through the seal the farthest "paper" pixel is
 * the seal's light text, and a median over all directions ignores that.
 */

/** Brand palette classes. Thresholds are wide enough for antialiasing and gradients. */
export const PALETTE = {
  paper: (r, g, b) => r >= 0xd8 && g >= 0xc0 && b >= 0x98 && r - b >= 18 && r >= g && g >= b,
  red: (r, g, b) => r >= 0x6e && r <= 0xd8 && g <= 0x60 && b <= 0x58 && r - g >= 0x46,
  gold: (r, g, b) => r >= 0x96 && g >= 0x6e && b <= 0x82 && g - b >= 0x3c && r - g >= 0x19,
};

const RAY_COUNT = 360;
const ALPHA_CONTENT = 16;
/**
 * The seal sits in the bottom-right quadrant. Restricting to that region keeps the
 * cinnabar sun and the pulse line out of the seal measurement, so "no seal" cannot
 * be satisfied by other red artwork.
 */
const SEAL_REGION_START = 0.09;

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Measure one decoded image.
 * @param {{width:number,height:number,rgba:Uint8Array,hasAlphaChannel:boolean}} image - decoded PNG.
 * @returns {object} ratios, absolute pixel counts, and which families were measured.
 */
export function measure(image) {
  const { width, height, rgba } = image;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const half = Math.max(width, height) / 2;
  const at = (x, y) => {
    const q = (y * width + x) * 4;
    return { r: rgba[q], g: rgba[q + 1], b: rgba[q + 2], a: rgba[q + 3] };
  };

  let alphaMin = 255;
  let alphaMax = 0;
  let transparentPixels = 0;
  const counts = { paper: 0, red: 0, gold: 0, seal: 0 };
  const extreme = {
    paper: { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1 },
    seal: { maxX: -1, maxY: -1, maxRadius: -1 },
    gold: { maxRadius: -1 },
    content: { minX: Infinity, minY: Infinity, maxX: -1, maxY: -1, maxRadius: -1, count: 0 },
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const q = (y * width + x) * 4;
      const a = rgba[q + 3];
      if (a < alphaMin) alphaMin = a;
      if (a > alphaMax) alphaMax = a;
      if (a < ALPHA_CONTENT) {
        transparentPixels += 1;
        continue;
      }
      const r = rgba[q];
      const g = rgba[q + 1];
      const b = rgba[q + 2];
      const radius = Math.hypot(x - cx, y - cy);

      if (radius > extreme.content.maxRadius) extreme.content.maxRadius = radius;
      extreme.content.count += 1;
      if (x < extreme.content.minX) extreme.content.minX = x;
      if (y < extreme.content.minY) extreme.content.minY = y;
      if (x > extreme.content.maxX) extreme.content.maxX = x;
      if (y > extreme.content.maxY) extreme.content.maxY = y;

      if (PALETTE.paper(r, g, b)) {
        counts.paper += 1;
        if (x < extreme.paper.minX) extreme.paper.minX = x;
        if (y < extreme.paper.minY) extreme.paper.minY = y;
        if (x > extreme.paper.maxX) extreme.paper.maxX = x;
        if (y > extreme.paper.maxY) extreme.paper.maxY = y;
      }
      if (PALETTE.red(r, g, b)) {
        counts.red += 1;
        if (x > cx + width * SEAL_REGION_START && y > cy + height * SEAL_REGION_START) {
          counts.seal += 1;
          if (x > extreme.seal.maxX) extreme.seal.maxX = x;
          if (y > extreme.seal.maxY) extreme.seal.maxY = y;
          if (radius > extreme.seal.maxRadius) extreme.seal.maxRadius = radius;
        }
      }
      if (PALETTE.gold(r, g, b)) {
        counts.gold += 1;
        if (radius > extreme.gold.maxRadius) extreme.gold.maxRadius = radius;
      }
    }
  }

  const cornerAlpha = [
    at(0, 0).a,
    at(width - 1, 0).a,
    at(0, height - 1).a,
    at(width - 1, height - 1).a,
  ];

  return {
    width,
    height,
    hasAlphaChannel: image.hasAlphaChannel,
    alphaMin,
    alphaMax,
    transparentPixels,
    transparentRatio: transparentPixels / (width * height),
    cornerAlpha,
    /** Disc diameter as a fraction of the canvas, from a 360-ray median scan; null without paper pixels. */
    discRatio: counts.paper === 0 ? null : measureDiscRadius(width, height, image, half),
    counts,
    contentRadius: extreme.content.maxRadius < 0 ? null : extreme.content.maxRadius / half,
    contentInset:
      extreme.content.maxX < 0
        ? null
        : {
            left: extreme.content.minX / width,
            top: extreme.content.minY / height,
            right: 1 - (extreme.content.maxX + 1) / width,
            bottom: 1 - (extreme.content.maxY + 1) / height,
          },
    seal: {
      count: counts.seal,
      density: counts.seal / (width * height),
      maxRadius: extreme.seal.maxRadius < 0 ? null : extreme.seal.maxRadius / half,
      edge: extreme.seal.maxX < 0 ? null : Math.max(extreme.seal.maxX, extreme.seal.maxY) / width,
    },
    gold: { maxRadius: extreme.gold.maxRadius < 0 ? null : extreme.gold.maxRadius / half },
  };
}

/**
 * Radius of the paper disc, as a fraction of the canvas size.
 * @param {number} width - canvas width.
 * @param {number} height - canvas height.
 * @param {{rgba:Uint8Array}} image - decoded image.
 * @param {number} half - half the canvas size.
 * @returns {number|null} diameter-to-canvas ratio.
 */
function measureDiscRadius(width, height, image, half) {
  const { rgba } = image;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const step = 1;
  const maxima = [];
  for (let i = 0; i < RAY_COUNT; i += 1) {
    const angle = (i / RAY_COUNT) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let farthest = 0;
    for (let r = 0; r < half; r += step) {
      const x = Math.round(cx + dx * r);
      const y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= width || y >= height) break;
      const q = (y * width + x) * 4;
      if (rgba[q + 3] < ALPHA_CONTENT) break;
      const rr = rgba[q];
      const gg = rgba[q + 1];
      const bb = rgba[q + 2];
      if (PALETTE.paper(rr, gg, bb)) farthest = r;
    }
    if (farthest > 0) maxima.push(farthest);
  }
  const center = median(maxima);
  if (center === null) return null;
  return (center * 2) / (half * 2);
}
