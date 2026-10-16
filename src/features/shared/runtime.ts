import { env } from '@huggingface/transformers'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import factoryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
// Serve the matching installed runtime with the app, avoiding a third-party CDN
// dependency during inference. Model weights still download from Hugging Face.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = { wasm: wasmUrl, mjs: factoryUrl }
}
