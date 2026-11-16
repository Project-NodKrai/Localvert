/* FLUX.2 Klein 4B, cgb ONNX WebGPU graph driver.
 * Model: https://huggingface.co/cgb/flux2-klein-4b-onnx-webgpu (Apache-2.0).
 * Remote requests are exclusively weights, tokenizer and ONNX Runtime assets.
 * This is an experimental client-side implementation, not a hosted inference API.
 */
const MODEL = 'https://huggingface.co/cgb/flux2-klein-4b-onnx-webgpu/resolve/main/';
const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0/dist/';
let ortPromise;
function progress(requestId, message) {
  self.postMessage({ requestId, type: 'progress', message });
}
function toHalf(value) {
  const f = new Float32Array(1), b = new Uint32Array(f.buffer);
  f[0] = value;
  const x = b[0], s = (x >>> 16) & 0x8000, e = (x >>> 23) & 255, m = x & 0x7fffff;
  if (e === 255) return s | (m ? 0x7e00 : 0x7c00);
  const he = e - 112;
  if (he >= 31) return s | 0x7c00;
  if (he <= 0) return he < -10 ? s : s | (((m | 0x800000) >>> (1 - he)) + 0x1000 >>> 13);
  return s | (he << 10) | ((m + 0x1000) >>> 13);
}
function fromHalf(bits) {
  const s = bits & 32768 ? -1 : 1, e = bits >>> 10 & 31, m = bits & 1023;
  if (!e) return s * m / 1024 * 2 ** -14;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + m / 1024);
}
function asF32(tensor) {
  if (tensor.type === 'float32') return Float32Array.from(tensor.data);
  if (tensor.type !== 'float16') throw Error('예상과 다른 텐서 타입: ' + tensor.type);
  const half = new Uint16Array(tensor.data.buffer, tensor.data.byteOffset, tensor.data.byteLength / 2);
  return Float32Array.from(half, fromHalf);
}
function f16Tensor(ort, numbers, shape) {
  const src = numbers instanceof Float32Array ? numbers : Float32Array.from(numbers);
  const half = Uint16Array.from(src, toHalf);
  return new ort.Tensor('float16', half, shape);
}
async function ortRuntime() {
  return ortPromise ??= import(ORT_BASE + 'ort.all.mjs').then(mod => {
    mod.env.wasm.wasmPaths = ORT_BASE;
    mod.env.wasm.numThreads = 1;
    mod.env.wasm.simd = true;
    mod.env.webgpu.powerPreference = 'high-performance';
    return mod;
  });
}
async function loadGraph(ort, modelFile, requestId, manifestFile = modelFile.replace(/\.onnx$/, '.manifest.json')) {
  progress(requestId, '모델 다운로드 및 GPU 로딩 · ' + modelFile);
  const manifestResponse = await fetch(MODEL + manifestFile);
  if (!manifestResponse.ok) {
    throw Error(modelFile + ' 모델 샤드 목록을 가져오지 못했어 (HTTP ' + manifestResponse.status + ').');
  }
  const manifest = await manifestResponse.json();
  if (!Array.isArray(manifest.shards) || !manifest.shards.length ||
      !manifest.shards.every(item => typeof item.path === 'string' && !item.path.includes('..'))) {
    throw Error(modelFile + ' 모델 샤드 목록이 올바르지 않아.');
  }
  return ort.InferenceSession.create(MODEL + modelFile, {
    executionProviders: ['webgpu'],
    externalData: manifest.shards.map(shard => ({ path: shard.path, data: MODEL + shard.path })),
    graphOptimizationLevel: 'all',
  });
}
async function getTokenizer() {
  // Transformers.js tokenizes locally. This downloads only the tokenizer, not model weights.
  const { AutoTokenizer, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
  env.allowLocalModels = false;
  return AutoTokenizer.from_pretrained('Qwen/Qwen3-4B');
}
function longTensor(ort, input, shape) {
  return new ort.Tensor('int64', BigInt64Array.from(input, x => BigInt(x)), shape);
}
async function encode(ort, payload, requestId) {
  progress(requestId, 'Qwen3 텍스트 토크나이저 준비');
  const tokenizer = await getTokenizer();
  const prompt = String(payload.prompt || '').trim();
  const formatted = tokenizer.apply_chat_template(
    [{ role: 'user', content: prompt }],
    { tokenize: false, add_generation_prompt: true, enable_thinking: false },
  );
  const encoded = await tokenizer(formatted, {
    padding: 'max_length', truncation: true, max_length: 512,
    return_attention_mask: true,
  });
  const ids = Array.from(encoded.input_ids.data, Number);
  const mask = Array.from(encoded.attention_mask.data, Number);
  if (ids.length !== 512 || mask.length !== 512) throw Error('토크나이저 512토큰 패딩에 실패했어.');
  const session = await loadGraph(ort, 'text_encoder_q4.onnx', requestId);
  try {
    const res = await session.run({
      input_ids: longTensor(ort, ids, [1, 512]),
      attention_mask: longTensor(ort, mask, [1, 512]),
    });
    const embeddings = asF32(res.prompt_embeds);
    if (embeddings.length !== 512 * 7680) throw Error('텍스트 임베딩의 크기가 예상과 달라.');
    // Send float32 context; denoise worker packs to the model's float16 tensor.
    return { data: embeddings.buffer, shape: [1, 512, 7680] };
  } finally { await session.release(); }
}
function positionIds(width, height, textLength) {
  const rows = height / 16, cols = width / 16;
  const img = new BigInt64Array(rows * cols * 4);
  const txt = new BigInt64Array(textLength * 4);
  for (let i = 0; i < rows * cols; i++) {
    const o = i * 4;
    img[o + 1] = BigInt(Math.floor(i / cols));
    img[o + 2] = BigInt(i % cols);
  }
  for (let i = 0; i < textLength; i++) txt[i * 4 + 3] = BigInt(i);
  return { img, txt };
}
async function denoise(ort, payload, requestId) {
  const { width, height, sigmas } = payload;
  const steps = Number(payload.steps);
  if (steps !== 4 || !Array.isArray(sigmas) || sigmas.length !== steps + 1) {
    throw Error('FLUX.2 Klein은 4스텝 스케줄이 필요해.');
  }
  const seq = width / 16 * (height / 16);
  const latent = new Float32Array(payload.latent);
  const embeds = new Float32Array(payload.embeds);
  if (latent.length !== seq * 128 || embeds.length !== 512 * 7680) throw Error('입력 텐서 크기가 맞지 않아.');
  const { img, txt } = positionIds(width, height, 512);
  const session = await loadGraph(ort, 'transformer_q8.onnx', requestId);
  try {
    const context = f16Tensor(ort, embeds, [1, 512, 7680]);
    const imgIds = new ort.Tensor('int64', img, [1, seq, 4]);
    const txtIds = new ort.Tensor('int64', txt, [1, 512, 4]);
    for (let step = 0; step < steps; step++) {
      progress(requestId, '디노이징 ' + (step + 1) + '/' + steps);
      const run = await session.run({
        hidden_states: f16Tensor(ort, latent, [1, seq, 128]),
        encoder_hidden_states: context,
        timestep: f16Tensor(ort, [sigmas[step]], [1]),
        img_ids: imgIds, txt_ids: txtIds,
      });
      const velocity = asF32(run.noise_pred);
      if (velocity.length !== latent.length) throw Error('Transformer 출력 크기가 맞지 않아.');
      const delta = sigmas[step + 1] - sigmas[step];
      for (let i = 0; i < latent.length; i++) latent[i] += delta * velocity[i];
      if (!Number.isFinite(latent[0])) throw Error('모델 추론에 NaN/Inf가 발생했어.');
    }
    return { data: latent.buffer };
  } finally { await session.release(); }
}
async function decode(ort, payload, requestId) {
  const { width, height } = payload;
  const latent = new Float32Array(payload.latent);
  if (latent.length !== 32 * width / 8 * (height / 8)) throw Error('VAE latent 형태가 올바르지 않아.');
  progress(requestId, 'VAE 디코더로 이미지 생성 중');
  const session = await ort.InferenceSession.create(MODEL + 'vae_decoder.onnx', {
    executionProviders: ['webgpu'],
  });
  try {
    const res = await session.run({
      latent: new ort.Tensor('float32', latent, [1, 32, height / 8, width / 8]),
    });
    const img = asF32(res.sample);
    const plane = width * height;
    if (img.length !== plane * 3) throw Error('VAE 출력 이미지 크기가 올바르지 않아.');
    const pixels = new Uint8ClampedArray(plane * 4);
    for (let i = 0; i < plane; i++) {
      pixels[4 * i] = Math.max(0, Math.min(255, Math.round(img[i] * 255)));
      pixels[4 * i + 1] = Math.max(0, Math.min(255, Math.round(img[plane + i] * 255)));
      pixels[4 * i + 2] = Math.max(0, Math.min(255, Math.round(img[2 * plane + i] * 255)));
      pixels[4 * i + 3] = 255;
    }
    return { data: pixels.buffer, width, height };
  } finally { await session.release(); }
}
self.onmessage = async event => {
  const { requestId, stage, payload } = event.data || {};
  if (!requestId || !['encode', 'denoise', 'decode'].includes(stage)) return;
  try {
    const ort = await ortRuntime();
    const result = stage === 'encode' ? await encode(ort, payload, requestId)
      : stage === 'denoise' ? await denoise(ort, payload, requestId)
      : await decode(ort, payload, requestId);
    self.postMessage({ requestId, type: 'result', ...result }, [result.data]);
  } catch (error) {
    self.postMessage({
      requestId, type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
