// minimal JPEG: SOI, APP0 padding, SOF0 with the given size, then filler (the Worker only reads the header)
export const jpegB64 = (n = 200, w = 512, h = w) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x0b, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, ...Array.from({ length: n }, (_, i) => i % 251)]).toString("base64");
export const webpB64 = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(40, 7)]).toString("base64");
export const FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
export const good = (o = {}) => ({ image: jpegB64(), source: "screenshot", orientation: "white", sideToMove: "b", predictedFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", correctedFen: FEN, appVersion: "0.1", ...o });
export function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) };
}
export function fakeShares() {
  const m = new Map();
  return { m, getWithMetadata: async (k) => ({ value: m.get(k)?.v ?? null, metadata: m.get(k)?.metadata ?? null }), put: async (k, v, o = {}) => { m.set(k, { v, metadata: o.metadata ?? null }); } };
}
export const post = (body, headers = {}) => new Request("https://w.test/share", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
