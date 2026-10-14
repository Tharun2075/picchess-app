// Lazy loader for the square classifier. onnxruntime-web (WASM, one thread: no COOP/COEP headers needed) and the
// model (~1.3 MB) are only fetched the first time a scan needs them; after that the session is reused.
const ORT_URL = new URL("../vendor/onnxruntime-web/ort.wasm.min.mjs", import.meta.url);
const WASM_DIR = new URL("../vendor/onnxruntime-web/", import.meta.url);
const MODEL_URL = new URL("../models/squares-screen.onnx", import.meta.url);

let loading = null;

/** -> Promise<(input Float32Array 64*1024) => Promise<Float32Array 64*13>>. Same promise on every call. */
export function loadModel() {
  if (!loading) {
    loading = (async () => {
      const ort = await import(ORT_URL.href);
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = WASM_DIR.href;
      const session = await ort.InferenceSession.create(MODEL_URL.href, { executionProviders: ["wasm"] });
      return async (input) => (await session.run({ tiles: new ort.Tensor("float32", input, [64, 1024]) })).probs.data;
    })();
    loading.catch(() => { loading = null; }); // allow a retry after a failed fetch
  }
  return loading;
}
