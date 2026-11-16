# Browser WebGPU Image Generation — Phase 1

LocalVert's image generator is transitioning from a local ComfyUI HTTP API to **client-side GPU execution**. This experimental branch adds a browser mode alongside the existing ComfyUI option. The original seven catalog entries and three Instant / Medium / High levels remain unchanged.

## First native model

- **FLUX.2 Klein 4B**, experimental ONNX Runtime WebGPU pipeline.
- Source: https://huggingface.co/cgb/flux2-klein-4b-onnx-webgpu (model conversion license: Apache-2.0).
- Inference is local: three dedicated browser Workers run text encoding, four diffusion steps, then the VAE decoder.
- Model shards and tokenizer resources are downloaded from Hugging Face; ONNX Runtime / Transformers.js libraries are fetched from jsDelivr. Prompt text is not submitted to an inference API. The text prompt only enters the local tokenizer.
- The data path does **not** invoke ComfyUI. It is isolated from the original backend. Upstream weights are not checked into the Git repository.
- The user must explicitly opt in to the approximately **6.5 GB** first download.
- WebGPU support and \`shader-f16\` are checked before execution.
- First stage uses a 512×512 preset. Max 1024px per dimension, multiples of 64. Batch Size = 1; Batch Count is sequential.
- Stage Workers are terminated after each stage, including cancellation, to release GPU buffers. Jobs retain unique IDs / Blob URLs.

## Not verified yet

This phase is an **experimental implementation**, not a proven 7-model browser runtime. Full model-weights execution on an actual GPU, downloaded file layout, tokenizer compatibility, CDN CORS, browser memory, Safari and mobile behavior still require verification. The other six catalog models are not browser executable here yet. Selecting any of them in browser mode displays the limitation and disables generation, rather than falsely claiming inference.

The ONNX graph contract used is:

| Stage | Input | Output |
|---|---|---|
| encoder | Qwen3 chat prompt, int64 tokens/mask [1,512] | float16 embeds [1,512,7680] |
| transformer | float16 [1,N,128] + embeds + sigma + position IDs | float16 [1,N,128] velocity |
| decoder | float32 [1,32,H/8,W/8] | float32 [1,3,H,W] RGB |

### Browser and cache considerations

The first download can exceed the browser's available storage and system memory. Model resources currently rely on the browser's HTTP cache; an explicit OPFS cache manager, resumable downloads, cache-size display and eviction controls are not implemented in Phase 1. Do not report them as implemented. The existing \`LocalFileConverter\` IndexedDB store is not used for model files; its startup cleanup does not delete the model HTTP cache.

## Regression and acceptance

- \`npm test\`: existing ComfyUI API tests plus browser math tests (noise, scheduler, latent reshape).
- \`npm run lint\`: TypeScript static checks.
- \`node --check public/workers/flux2-stage.js\`: Worker syntax check.
- \`npm run build\`: Vite production bundle.
- \`node scripts/smoke-image-generation.mjs\`: old ComfyUI test remains available after choosing ComfyUI mode.
- Required for graduation: a **real** 512×512 WebGPU generation using actual model weights and a recorded SHA-256 for the output, an altered prompt and seed proving independent model-driven results, cancellation during a stage, reload/cache persistence, then each supported platform. Mocks are not evidence of actual image quality.

Only merge when the actual runtime path is tested and the user-facing availability is accurate. Keep the experimental branch/PR isolated from deployed \`main\` until then.
