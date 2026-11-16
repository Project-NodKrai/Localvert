import test from 'node:test';
import assert from 'node:assert/strict';
import { GENERATION_MODELS, GENERATION_LEVELS, generationModel,
  defaultGenerationConfig, composePrompt } from '../src/lib/imageGeneration/catalog';
import { parseComfyWorkflow, detectBindings, prepareComfyPrompt,
  validateWorkflowModel, normalizeComfyUrl, runComfyWorkflow,
} from '../src/lib/imageGeneration/comfy';

const demo = {
  '1': { class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: 'flux2-klein-4b-fp8.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: 'old prompt', clip: ['1', 1] } },
  '5': { class_type: 'CLIPTextEncode', inputs: { text: 'old negative', clip: ['1', 1] } },
  '3': { class_type: 'KSampler', inputs: {
    positive: ['2', 0], negative: ['5', 0], seed: 10, steps: 50,
    cfg: 7.5, sampler_name: 'dpmpp_2m', scheduler: 'normal',
  } },
  '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
  '6': { class_type: 'SaveImage', inputs: { images: ['3', 0], filename_prefix: 'Localvert' } },
};

test('Instant, Medium, High retain multiple genuine selectable model entries', () => {
  assert.deepEqual(GENERATION_LEVELS, ['instant', 'medium', 'high']);
  assert.ok(GENERATION_MODELS.length >= 5);
  for (const level of GENERATION_LEVELS) {
    assert.ok(GENERATION_MODELS.some(model => model.level === level));
  }
  const ids = GENERATION_MODELS.map(model => model.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('API workflow loader rejects invalid UI JSON or graphs without image output', () => {
  assert.throws(() => parseComfyWorkflow({ nodes: [] }), /Save \(API format\)/);
  assert.throws(() => parseComfyWorkflow({ '1': demo['1'] }), /이미지 출력 노드/);
  assert.deepEqual(Object.keys(parseComfyWorkflow({ prompt: demo })), Object.keys(demo));
});

test('identify actual checkpoint resource and reject different model', () => {
  const graph = parseComfyWorkflow(demo);
  assert.deepEqual(validateWorkflowModel(graph, generationModel('flux2-klein-4b')), ['flux2-klein-4b-fp8.safetensors']);
  assert.throws(() => validateWorkflowModel(graph, generationModel('z-image-turbo')), /일치하지 않아/);
});

test('apply only mapped fields and keep source graph immutable', () => {
  const graph = parseComfyWorkflow(demo);
  const bindings = detectBindings(graph);
  assert.deepEqual(bindings.prompt, { nodeId: '2', field: 'text' });
  assert.deepEqual(bindings.negative, { nodeId: '5', field: 'text' });
  const model = generationModel('flux2-klein-4b');
  const config = {
    ...defaultGenerationConfig(model), prompt: 'A city', style: 'watercolor',
    negative: 'bad', width: 768, height: 1344,
    sampler: 'euler', scheduler: 'karras', batchSize: 2,
  };
  const patched = prepareComfyPrompt(graph, bindings, model, config, 176);
  assert.equal(patched['2'].inputs.text, composePrompt(config));
  assert.equal(patched['5'].inputs.text, 'old negative');
  assert.equal(patched['3'].inputs.seed, 176);
  assert.equal(patched['3'].inputs.steps, 4);
  assert.equal(patched['3'].inputs.cfg, 1);
  assert.equal(patched['3'].inputs.sampler_name, 'euler');
  assert.equal(patched['3'].inputs.scheduler, 'karras');
  assert.equal(patched['4'].inputs.width, 768);
  assert.equal(patched['4'].inputs.height, 1344);
  assert.equal(patched['4'].inputs.batch_size, 2);
  assert.equal(graph['3'].inputs.steps, 50);
  assert.equal(graph['2'].inputs.text, 'old prompt');
});

test('reject invalid generation bindings before queue submission', () => {
  const graph = parseComfyWorkflow(demo);
  const config = defaultGenerationConfig(generationModel('flux2-klein-4b'));
  assert.throws(() => prepareComfyPrompt(graph, {}, generationModel('flux2-klein-4b'), config, 12), /프롬프트/);
  assert.throws(() => prepareComfyPrompt(graph, detectBindings(graph),
    generationModel('anima-turbo-2b'), config, 12), /체크포인트/);
});

test('only local ComfyUI origins are permitted', () => {
  assert.equal(normalizeComfyUrl('http://127.0.0.1:8188/'), 'http://127.0.0.1:8188');
  assert.equal(normalizeComfyUrl('http://localhost:8188/'), 'http://localhost:8188');
  for (const address of [
    'https://example.org', 'http://192.168.1.2:8188/', 'http://example.com:8188/',
    'http://127.0.0.1:8188/prompt', 'http://localhost:8188/?secret=1',
  ]) assert.throws(() => normalizeComfyUrl(address), /주소는/);
});

test('execute API workflow against mocked ComfyUI and bind output to prompt ID', async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  let submitted: Record<string, any> | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/prompt')) {
      submitted = JSON.parse(String(init?.body)) as Record<string, any>;
      return new Response(JSON.stringify({ prompt_id: 'prompt-unique' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.endsWith('/history/prompt-unique')) {
      return new Response(JSON.stringify({
        'prompt-unique': {
          status: { completed: true, status_str: 'success' },
          outputs: { '6': { images: [{ filename: 'generated.png', subfolder: '', type: 'output' }] } },
        },
      }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/view?')) return new Response(new Uint8Array([137,80,78,71,0]),
      { headers: { 'content-type': 'image/png' } });
    throw new Error('Unexpected fetch to ' + url);
  }) as typeof fetch;
  try {
    const graph = parseComfyWorkflow(demo);
    const model = generationModel('flux2-klein-4b');
    const output = await runComfyWorkflow({
      endpoint: 'http://127.0.0.1:8188/', workflow: graph,
      bindings: detectBindings(graph), model,
      config: { ...defaultGenerationConfig(model), prompt: 'an original test illustration' },
      seed: 999, jobId: 'our-job', signal: new AbortController().signal,
      onState: () => {},
    });
    assert.equal(output.jobId, 'our-job');
    assert.equal(output.promptId, 'prompt-unique');
    assert.equal(output.seed, 999);
    assert.equal(output.images.length, 1);
    assert.equal(output.images[0].filename, 'generated.png');
    assert.equal(output.images[0].blob.type, 'image/png');
    assert.equal(submitted?.prompt['3'].inputs.seed, 999);
    assert.equal(submitted?.prompt['2'].inputs.text, 'an original test illustration');
    assert.ok(calls.some(call => call.includes('filename=generated.png')));
  } finally {
    globalThis.fetch = previousFetch;
  }
});


test('reject hidden or incomplete seed / steps / resolution mappings', () => {
  const graph = parseComfyWorkflow(demo);
  const model = generationModel('flux2-klein-4b');
  const config = { ...defaultGenerationConfig(model), prompt: 'valid prompt' };
  const binding = detectBindings(graph);
  for (const missing of ['seed', 'steps', 'width', 'height'] as const) {
    const absent = { ...binding, [missing]: undefined };
    assert.throws(() => prepareComfyPrompt(graph, absent, model, config, 42),
      new RegExp(missing + ' 입력 필드'));
  }
});

test('supported CFG changes are applied to the generation workflow', () => {
  const input = structuredClone(demo);
  input['1'].inputs.ckpt_name = 'anima-turbo-2b.safetensors';
  const graph = parseComfyWorkflow(input);
  const model = generationModel('anima-turbo-2b');
  const config = { ...defaultGenerationConfig(model), prompt: 'sky', cfg: 2.5 };
  const patched = prepareComfyPrompt(graph, detectBindings(graph), model, config, 77);
  assert.equal(patched['3'].inputs.cfg, 2.5);
  assert.equal(patched['3'].inputs.steps, 8);
});
