// Minimal PNG decoder for tests: 8-bit, non-interlaced, colour types 0,2,3,4,6. Returns {width,height,data: RGBA}.
import zlib from "node:zlib";
export function decodePng(buf) {
  let p = 8, w, h, ct, bd, il;
  const idat = []; let plte = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8), body = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); bd = body[8]; ct = body[9]; il = body[12]; }
    else if (type === "PLTE") plte = body;
    else if (type === "IDAT") idat.push(body);
    p += 12 + len;
  }
  if (bd !== 8 || il !== 0) throw new Error("unsupported PNG");
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0, b = y ? px[dst - stride + i] : 0, c = i >= bpp && y ? px[dst - stride + i - bpp] : 0;
      let v;
      if (f === 0) v = x; else if (f === 1) v = x + a; else if (f === 2) v = x + b; else if (f === 3) v = x + ((a + b) >> 1);
      else { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      px[dst + i] = v & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ct === 6) [r, g, b, a] = [px[i * 4], px[i * 4 + 1], px[i * 4 + 2], px[i * 4 + 3]];
    else if (ct === 2) [r, g, b] = [px[i * 3], px[i * 3 + 1], px[i * 3 + 2]];
    else if (ct === 3) { const k = px[i] * 3; [r, g, b] = [plte[k], plte[k + 1], plte[k + 2]]; }
    else if (ct === 0) r = g = b = px[i];
    else { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    data.set([r, g, b, a], i * 4);
  }
  return { width: w, height: h, data };
}
