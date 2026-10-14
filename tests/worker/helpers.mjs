export const jpegB64 = (n = 200) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array.from({ length: n }, (_, i) => i % 251)]).toString("base64");
export const webpB64 = () => Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(40, 7)]).toString("base64");
export const FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
export const good = (o = {}) => ({ image: jpegB64(), source: "screenshot", orientation: "white", sideToMove: "b", predictedFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR", correctedFen: FEN, corners: null, appVersion: "0.1", ...o });
export function fakeKV() {
  const m = new Map();
  return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, String(v)); }, list: async ({ prefix }) => ({ keys: [...m.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) }) };
}
export function fakeR2() {
  const m = new Map();
  return { m, head: async (k) => (m.has(k) ? {} : null), put: async (k, v) => { m.set(k, v); } };
}
export const post = (body, headers = {}) => new Request("https://w.test/share", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
