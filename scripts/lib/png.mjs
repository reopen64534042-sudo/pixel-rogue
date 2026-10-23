/**
 * 零依赖 PNG 编解码（仅覆盖像素贴图产线需要的子集）。
 *
 * 支持解码：8-bit、非交错、colorType 2(RGB) / 3(索引) / 6(RGBA)。
 * 支持编码：8-bit RGBA，filter 0。
 * 不支持的格式一律显式报错，不做静默降级 —— 静默转换会污染像素网格。
 */
import { inflateSync, deflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * @param {Buffer} buf PNG 文件内容
 * @returns {{width:number,height:number,rgba:Buffer}}
 */
export function decodePng(buf) {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("不是 PNG 文件（签名不匹配）");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let paletteAlpha = null;
  const idat = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const data = buf.subarray(dataStart, dataStart + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0) throw new Error("不支持的压缩方法");
      if (data[11] !== 0) throw new Error("不支持的滤波方法");
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      paletteAlpha = data;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + length + 4;
  }

  if (bitDepth !== 8) throw new Error(`仅支持 8-bit PNG，当前 ${bitDepth}-bit`);
  if (interlace !== 0) throw new Error("不支持交错（Adam7）PNG，请先导出为普通 PNG");
  if (![2, 3, 6].includes(colorType)) {
    throw new Error(`不支持 colorType=${colorType}，仅支持 2/3/6`);
  }
  if (colorType === 3 && !palette) throw new Error("索引色 PNG 缺少 PLTE 块");

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error("IDAT 数据长度不足");

  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? out[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let value = src[i];
      switch (filter) {
        case 0:
          break;
        case 1:
          value += a;
          break;
        case 2:
          value += b;
          break;
        case 3:
          value += (a + b) >> 1;
          break;
        case 4:
          value += paeth(a, b, c);
          break;
        default:
          throw new Error(`未知滤波类型 ${filter}（第 ${y} 行）`);
      }
      out[i] = value & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    if (colorType === 6) {
      rgba[i * 4] = pixels[p];
      rgba[i * 4 + 1] = pixels[p + 1];
      rgba[i * 4 + 2] = pixels[p + 2];
      rgba[i * 4 + 3] = pixels[p + 3];
    } else if (colorType === 2) {
      rgba[i * 4] = pixels[p];
      rgba[i * 4 + 1] = pixels[p + 1];
      rgba[i * 4 + 2] = pixels[p + 2];
      rgba[i * 4 + 3] = 255;
    } else {
      const index = pixels[p];
      rgba[i * 4] = palette[index * 3] ?? 0;
      rgba[i * 4 + 1] = palette[index * 3 + 1] ?? 0;
      rgba[i * 4 + 2] = palette[index * 3 + 2] ?? 0;
      rgba[i * 4 + 3] = paletteAlpha && index < paletteAlpha.length ? paletteAlpha[index] : 255;
    }
  }
  return { width, height, rgba };
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba 长度必须为 width*height*4
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error("RGBA 缓冲长度与尺寸不符");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
