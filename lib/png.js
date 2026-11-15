/**
 * Dependency-free PNG decoder producing an RGBA8 pixel buffer.
 *
 * Only what a headless-Chrome icon pipeline emits is supported: bit depth 8,
 * non-interlaced, colour types 0/2/3/4/6. Anything else throws a readable
 * error instead of returning wrong pixels, because a silently wrong decode
 * would turn an icon audit into a false pass.
 */
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Read one PNG file into `{ width, height, colorType, hasAlphaChannel, rgba }`.
 * @param {Buffer} buffer - complete PNG file bytes.
 * @returns {{width:number,height:number,colorType:number,hasAlphaChannel:boolean,rgba:Uint8Array}}
 */
export function decodePng(buffer) {
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error('not a PNG file');
  }
  let offset = 8;
  let header;
  const idat = [];
  let palette;
  let transparency;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (offset + 12 + length > buffer.length) throw new Error(`truncated PNG chunk ${type}`);
    offset += 12 + length;
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
  }
  if (!header) throw new Error('PNG has no IHDR');
  const { width, height, bitDepth, colorType, interlace } = header;
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`);
  if (interlace !== 0) throw new Error('interlaced PNG is not supported');
  const channels = CHANNELS[colorType];
  if (channels === undefined) throw new Error(`unsupported PNG colour type ${colorType}`);

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const expected = height * (stride + 1);
  if (raw.length < expected) throw new Error(`PNG data is short: ${raw.length} < ${expected}`);
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const row = pos;
    pos += stride;
    const out = y * stride;
    const prev = y === 0 ? -1 : out - stride;
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[out + x - channels] : 0;
      const b = prev < 0 ? 0 : pixels[prev + x];
      const c = prev < 0 || x < channels ? 0 : pixels[prev + x - channels];
      let value = raw[row + x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      pixels[out + x] = value & 0xff;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1, p += channels) {
    let r;
    let g;
    let b;
    let a = 255;
    if (colorType === 0) {
      r = g = b = pixels[p];
    } else if (colorType === 4) {
      r = g = b = pixels[p];
      a = pixels[p + 1];
    } else if (colorType === 2) {
      r = pixels[p];
      g = pixels[p + 1];
      b = pixels[p + 2];
    } else if (colorType === 6) {
      r = pixels[p];
      g = pixels[p + 1];
      b = pixels[p + 2];
      a = pixels[p + 3];
    } else {
      const index = pixels[p];
      if (!palette || index * 3 + 2 >= palette.length) throw new Error('PNG palette index out of range');
      r = palette[index * 3];
      g = palette[index * 3 + 1];
      b = palette[index * 3 + 2];
      if (transparency && index < transparency.length) a = transparency[index];
    }
    const q = i * 4;
    rgba[q] = r;
    rgba[q + 1] = g;
    rgba[q + 2] = b;
    rgba[q + 3] = a;
  }

  return {
    width,
    height,
    colorType,
    /** Colour types 0/2/3 carry no per-pixel alpha channel, so the file cannot be transparent. */
    hasAlphaChannel: colorType === 4 || colorType === 6 || colorType === 3,
    rgba,
  };
}
