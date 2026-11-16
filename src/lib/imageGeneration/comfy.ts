import type { GenerationConfig, GenerationModel } from './catalog';
import { composePrompt } from './catalog';

export type ComfyInput = string | number | boolean | null | readonly unknown[] | Record<string, unknown>;
export type ComfyNode = { class_type: string; inputs: Record<string, ComfyInput>; _meta?: { title?: string } };
export type ComfyWorkflow = Record<string, ComfyNode>;
export type FieldRef = { nodeId: string; field: string };
export type WorkflowBindings = Partial<Record<
  'prompt' | 'negative' | 'seed' | 'steps' | 'cfg' | 'sampler' | 'scheduler' |
  'width' | 'height' | 'batch' | 'lora' | 'loraStrength', FieldRef
>>;
export type OutputItem = {
  filename: string;
  subfolder: string;
  type: string;
};
export type GenerationResult = {
  jobId: string;
  promptId: string;
  seed: number;
  images: { blob: Blob; filename: string }[];
};

export function parseComfyWorkflow(raw: unknown): ComfyWorkflow {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('ComfyUI API 형식의 JSON 워크플로가 필요해.');
  }
  const top = raw as Record<string, unknown>;
  const candidate = ('prompt' in top && top.prompt && typeof top.prompt === 'object') ? top.prompt : top;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('워크플로의 prompt 구조를 읽을 수 없어.');
  }
  const graph = candidate as Record<string, unknown>;
  if (!Object.keys(graph).length) throw new Error('워크플로에 실행 노드가 없어.');
  const result: ComfyWorkflow = {};
  for (const [id, node] of Object.entries(graph)) {
    if (!/^\d+$/.test(id) || !node || typeof node !== 'object' || Array.isArray(node)) {
      throw new Error('ComfyUI에서 Save (API format)으로 내보낸 JSON을 사용해.');
    }
    const value = node as Record<string, unknown>;
    if (typeof value.class_type !== 'string' || !value.inputs ||
        typeof value.inputs !== 'object' || Array.isArray(value.inputs)) {
      throw new Error('ComfyUI API 노드의 class_type 또는 inputs가 없어.');
    }
    result[id] = node as ComfyNode;
  }
  if (!Object.values(result).some(node => /SaveImage|SaveImageWebsocket|PreviewImage/.test(node.class_type))) {
    throw new Error('이미지 출력 노드(SaveImage 또는 PreviewImage)가 있는 워크플로를 가져와.');
  }
  return result;
}

export function listFields(graph: ComfyWorkflow): Array<{ ref: FieldRef; label: string; value: ComfyInput }> {
  const result: Array<{ ref: FieldRef; label: string; value: ComfyInput }> = [];
  for (const [nodeId, node] of Object.entries(graph)) {
    for (const [field, value] of Object.entries(node.inputs)) {
      if (typeof value !== 'string' && typeof value !== 'number') continue;
      result.push({
        ref: { nodeId, field },
        value,
        label: '#' + nodeId + ' · ' + (node._meta?.title || node.class_type) + ' / ' + field,
      });
    }
  }
  return result;
}

function samplerLinks(graph: ComfyWorkflow, key: 'positive' | 'negative'): string | undefined {
  for (const node of Object.values(graph)) {
    if (!/Sampler|KSampler/.test(node.class_type)) continue;
    const connection = node.inputs[key];
    if (Array.isArray(connection) && typeof connection[0] === 'string') return connection[0];
    if (Array.isArray(connection) && typeof connection[0] === 'number') return String(connection[0]);
  }
  return undefined;
}

export function detectBindings(graph: ComfyWorkflow): WorkflowBindings {
  const fields = listFields(graph);
  const pick = (names: string[], classes?: RegExp): FieldRef | undefined =>
    fields.find(item =>
      names.includes(item.ref.field.toLowerCase()) &&
      (!classes || classes.test(graph[item.ref.nodeId].class_type)))?.ref;
  const stringFields = fields.filter(item => typeof item.value === 'string' &&
    ['text', 'prompt', 'positive_prompt', 'negative_prompt'].includes(item.ref.field));
  const positiveId = samplerLinks(graph, 'positive');
  const negativeId = samplerLinks(graph, 'negative');
  const positive = stringFields.find(item => item.ref.nodeId === positiveId)
    || stringFields.find(item => !/negative/.test(item.ref.field.toLowerCase()));
  const negative = stringFields.find(item => item.ref.nodeId === negativeId &&
    item.ref.nodeId !== positive?.ref.nodeId)
    || stringFields.find(item => /negative/.test(item.ref.field.toLowerCase()) &&
      item.ref.nodeId !== positive?.ref.nodeId);
  return {
    prompt: positive?.ref,
    negative: negative?.ref,
    seed: pick(['seed', 'noise_seed']),
    steps: pick(['steps']),
    cfg: pick(['cfg', 'guidance', 'guidance_scale']),
    sampler: pick(['sampler_name']),
    scheduler: pick(['scheduler']),
    width: pick(['width']),
    height: pick(['height']),
    batch: pick(['batch_size', 'batch']),
    lora: pick(['lora_name'], /LoraLoader/i),
    loraStrength: pick(['strength_model', 'strength'], /LoraLoader/i),
  };
}

function modelResources(graph: ComfyWorkflow): string[] {
  const result: string[] = [];
  for (const node of Object.values(graph)) {
    if (!/CheckpointLoader|UNETLoader|UnetLoader|DiffusionModelLoader|ModelLoader/i.test(node.class_type)) continue;
    for (const [key, value] of Object.entries(node.inputs)) {
      if (typeof value === 'string' && /^(ckpt_name|unet_name|model_name|diffusion_model)$/i.test(key)) {
        result.push(value);
      }
    }
  }
  return result;
}

function compact(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, ''); }

export function validateWorkflowModel(graph: ComfyWorkflow, model: GenerationModel): string[] {
  const resources = modelResources(graph);
  if (!resources.length) {
    throw new Error('모델 로더에 체크포인트 파일명이 없어. 지원하는 로더가 포함된 API 워크플로를 가져와.');
  }
  if (!resources.some(resource => model.patterns.some(pattern =>
    compact(resource).includes(compact(pattern))))) {
    throw new Error(model.name + ' 모델과 워크플로 체크포인트가 일치하지 않아: ' + resources.join(', '));
  }
  return resources;
}

export function fieldExists(graph: ComfyWorkflow, ref?: FieldRef): boolean {
  if (!ref) return false;
  const v = graph[ref.nodeId]?.inputs[ref.field];
  return typeof v === 'number' || typeof v === 'string';
}

export function prepareComfyPrompt(
  workflow: ComfyWorkflow,
  bindings: WorkflowBindings,
  model: GenerationModel,
  config: GenerationConfig,
  seed: number,
): ComfyWorkflow {
  validateWorkflowModel(workflow, model);
  if (!fieldExists(workflow, bindings.prompt)) {
    throw new Error('프롬프트를 입력할 노드와 필드를 연결해야 해.');
  }
  const snapshot = structuredClone(workflow);
  const write = (key: keyof WorkflowBindings, value: string | number, required = false) => {
    const ref = bindings[key];
    if (!fieldExists(workflow, ref)) {
      if (required) throw new Error(key + ' 입력 필드가 연결되지 않았어.');
      return;
    }
    snapshot[ref!.nodeId].inputs[ref!.field] = value;
  };
  write('prompt', composePrompt(config), true);
  if (model.negative && bindings.negative) write('negative', config.negative);
  write('seed', seed);
  if (fieldExists(workflow, bindings.steps)) {
    write('steps', Math.max(model.steps.min, Math.min(model.steps.max, Math.round(config.steps))));
  }
  if (model.cfg !== null) write('cfg', model.cfg);
  if (bindings.sampler && config.sampler) write('sampler', config.sampler);
  if (bindings.scheduler && config.scheduler) write('scheduler', config.scheduler);
  write('width', config.width);
  write('height', config.height);
  write('batch', config.batchSize);
  // LoRA weights must only be used if the workflow explicitly includes a
  // matching LoRA loader with a chosen installed LoRA name.
  if (fieldExists(workflow, bindings.loraStrength)) write('loraStrength', config.loraStrength);
  return snapshot;
}

export function normalizeComfyUrl(value: string): string {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '::1'].includes(hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('ComfyUI 주소는 http://127.0.0.1:8188/ 또는 http://localhost:8188/만 사용할 수 있어.');
  }
  return url.origin;
}

export async function fetchComfyStatus(endpoint: string, signal?: AbortSignal): Promise<void> {
  const origin = normalizeComfyUrl(endpoint);
  const response = await fetch(origin + '/system_stats', { signal });
  if (!response.ok) throw new Error('ComfyUI 연결 확인 실패: HTTP ' + response.status);
  const stats = await response.json();
  if (!stats || typeof stats !== 'object') throw new Error('ComfyUI 응답을 확인할 수 없어.');
}

function collectImages(historyItem: unknown): OutputItem[] {
  const found: OutputItem[] = [];
  if (!historyItem || typeof historyItem !== 'object') return found;
  const outputs = (historyItem as Record<string, unknown>).outputs;
  if (!outputs || typeof outputs !== 'object') return found;
  for (const output of Object.values(outputs)) {
    if (!output || typeof output !== 'object') continue;
    const images = (output as Record<string, unknown>).images;
    if (!Array.isArray(images)) continue;
    for (const image of images) {
      if (!image || typeof image !== 'object') continue;
      const x = image as Record<string, unknown>;
      if (typeof x.filename === 'string' && x.filename &&
          typeof x.subfolder === 'string' && typeof x.type === 'string') {
        found.push({ filename: x.filename, subfolder: x.subfolder, type: x.type });
      }
    }
  }
  return found;
}

async function request(endpoint: string, resource: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(endpoint + resource, init);
  if (!response.ok) throw new Error('ComfyUI HTTP ' + response.status + ' (' + resource.split('?')[0] + ')');
  return response;
}

export async function runComfyWorkflow(args: {
  endpoint: string;
  workflow: ComfyWorkflow;
  bindings: WorkflowBindings;
  model: GenerationModel;
  config: GenerationConfig;
  seed: number;
  jobId: string;
  signal: AbortSignal;
  onState: (value: string) => void;
}): Promise<GenerationResult> {
  const { workflow, bindings, model, config, seed, jobId, signal, onState } = args;
  const endpoint = normalizeComfyUrl(args.endpoint);
  const prompt = prepareComfyPrompt(workflow, bindings, model, config, seed);
  const requestId = crypto.randomUUID();
  onState('ComfyUI 작업 등록 중');
  const submitted = await request(endpoint, '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, client_id: requestId }),
    signal,
  });
  const body: unknown = await submitted.json();
  const promptId = typeof body === 'object' && body && typeof (body as Record<string, unknown>).prompt_id === 'string'
    ? (body as { prompt_id: string }).prompt_id : undefined;
  if (!promptId) throw new Error('ComfyUI가 작업 ID를 반환하지 않았어.');
  const startedAt = Date.now();
  let images: OutputItem[] = [];
  while (Date.now() - startedAt < 20 * 60 * 1000) {
    if (signal.aborted) throw new DOMException('작업 결과 받기가 중단됐어.', 'AbortError');
    onState('이미지 생성 중 · ' + model.name);
    const historyResponse = await request(endpoint, '/history/' + encodeURIComponent(promptId), { signal });
    const history: unknown = await historyResponse.json();
    const item = (history && typeof history === 'object') ?
      (history as Record<string, unknown>)[promptId] : undefined;
    if (item && typeof item === 'object') {
      const status = (item as Record<string, unknown>).status;
      if (status && typeof status === 'object') {
        const s = status as Record<string, unknown>;
        if (s.status_str === 'error' || s.completed === false && Array.isArray(s.messages) &&
          s.messages.some(message => Array.isArray(message) && message[0] === 'execution_error')) {
          throw new Error('ComfyUI에서 생성이 실패했어. ComfyUI 실행 로그를 확인해.');
        }
      }
      images = collectImages(item);
      if (images.length) break;
      if (status && typeof status === 'object' && (status as Record<string, unknown>).completed === true) {
        throw new Error('완료된 작업에 이미지 출력이 없어. SaveImage 노드를 확인해.');
      }
    }
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        signal.removeEventListener('abort', aborted);
        resolve();
      }, 1100);
      const aborted = () => {
        window.clearTimeout(timer);
        reject(new DOMException('작업 결과 받기가 중단됐어.', 'AbortError'));
      };
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }
  if (!images.length) throw new Error('ComfyUI 작업 확인이 제한 시간을 초과했어.');
  onState('이미지 다운로드 중');
  const results: GenerationResult['images'] = [];
  for (const image of images) {
    const query = new URLSearchParams({
      filename: image.filename, subfolder: image.subfolder, type: image.type,
    });
    const response = await request(endpoint, '/view?' + query.toString(), { signal });
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || !blob.size) {
      throw new Error('ComfyUI 결과가 이미지 데이터가 아니야.');
    }
    results.push({ blob, filename: image.filename });
  }
  return { jobId, promptId, seed, images: results };
}
