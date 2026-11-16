export const GENERATION_LEVELS = ['instant', 'medium', 'high'] as const;
export type GenerationLevel = typeof GENERATION_LEVELS[number];

export type GenerationModel = Readonly<{
  id: string;
  level: GenerationLevel;
  name: string;
  params: string;
  use: string;
  checkpointUrl: string;
  patterns: readonly string[];
  steps: Readonly<{ min: number; max: number; initial: number }>;
  cfg: number | null;
  negative: boolean;
  sampler?: string;
  licensing: string;
}>;

// Model catalogue is separate from browser runtime availability. Unsupported entries
// remain discoverable but cannot be run until their local WebGPU engines are verified.
export const GENERATION_MODELS: readonly GenerationModel[] = [
  {
    id: 'sana-sprint-06b', level: 'instant', name: 'SANA-Sprint 0.6B',
    params: '0.6B', use: '빠른 이미지 생성', checkpointUrl: 'https://nvlabs.github.io/Sana/Sprint/',
    patterns: ['sana-sprint-0.6', 'sana_sprint_0.6', 'sana_sprint_06', 'sana_sprint_600m', 'sana-sprint-600m'],
    steps: { min: 1, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: '체크포인트 라이선스 확인',
  },
  {
    id: 'sana-sprint-16b', level: 'instant', name: 'SANA-Sprint 1.6B',
    params: '1.6B', use: '일반 이미지 생성', checkpointUrl: 'https://nvlabs.github.io/Sana/Sprint/',
    patterns: ['sana-sprint-1.6', 'sana_sprint_1.6', 'sana_sprint_16', 'sana_sprint_1600m'],
    steps: { min: 1, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: '체크포인트 라이선스 확인',
  },
  {
    id: 'iris-3b-turbo', level: 'instant', name: 'Iris-3B Turbo',
    params: '3B', use: '고속 이미지 생성', checkpointUrl: 'https://huggingface.co/speridlabs/iris-3b',
    patterns: ['iris-3b', 'iris_3b', 'iris3b'],
    steps: { min: 4, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: '모델·Turbo LoRA 별도 확인',
  },
  {
    id: 'anima-turbo-2b', level: 'medium', name: 'Anima-Turbo',
    params: '2B', use: '애니메이션·일러스트', checkpointUrl: 'https://huggingface.co/circlestone-labs/Anima',
    patterns: ['anima', 'anima-turbo', 'anima_turbo'],
    steps: { min: 8, max: 12, initial: 8 }, cfg: 1, negative: false,
    sampler: 'euler', licensing: 'CircleStone Labs Non-Commercial',
  },
  {
    id: 'flux2-klein-4b', level: 'medium', name: 'FLUX.2 Klein 4B',
    params: '4B', use: '범용·참조 이미지', checkpointUrl: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B',
    patterns: ['flux-2-klein-4b', 'flux_2_klein_4b', 'flux2-klein-4b', 'flux2_klein_4b', 'flux-2-klein-4b-fp8'],
    steps: { min: 4, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: 'Apache-2.0',
  },
  {
    id: 'z-image-turbo', level: 'high', name: 'Z-Image-Turbo',
    params: '6B', use: '실사·인물·풍경', checkpointUrl: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
    patterns: ['z-image-turbo', 'z_image_turbo', 'zimage_turbo', 'z-image-turbo-nvfp4'],
    steps: { min: 8, max: 9, initial: 9 }, cfg: null, negative: false,
    sampler: 'euler', licensing: 'Apache-2.0',
  },
  {
    id: 'qwen-image-21-turbo', level: 'high', name: 'Qwen-Image-2.1 Turbo',
    params: '7B', use: '텍스트·정교한 구도', checkpointUrl: 'https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo',
    patterns: ['qwen-image-2.1-turbo', 'qwen_image_2.1_turbo', 'qwen-image-21-turbo', 'qwen_image_21_turbo'],
    steps: { min: 8, max: 8, initial: 8 }, cfg: null, negative: false,
    licensing: 'Qwen Research License',
  },
];

export const DEFAULT_MODEL_BY_LEVEL: Record<GenerationLevel, string> = {
  instant: 'sana-sprint-06b',
  medium: 'flux2-klein-4b',
  high: 'z-image-turbo',
};

export function generationModel(id: string): GenerationModel {
  const found = GENERATION_MODELS.find(item => item.id === id);
  if (!found) throw new Error('등록되지 않은 이미지 생성 모델이야.');
  return found;
}

export type GenerationConfig = {
  prompt: string;
  negative: string;
  width: number;
  height: number;
  randomSeed: boolean;
  seed: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  denoise: number;
  batchCount: number;
  batchSize: number;
  outputFormat: 'png' | 'jpeg' | 'webp';
  quality: number;
  includeMetadata: boolean;
  style: string;
  composition: string;
  camera: string;
  lighting: string;
  palette: string;
  background: string;
  texture: string;
  loraStrength: number;
};

export function defaultGenerationConfig(model: GenerationModel = GENERATION_MODELS[0]): GenerationConfig {
  return {
    prompt: '', negative: '', width: 1024, height: 1024,
    randomSeed: true, seed: 42,
    steps: model.steps.initial, cfg: model.cfg ?? 1,
    sampler: model.sampler ?? 'euler', scheduler: 'normal', denoise: 1,
    batchCount: 1, batchSize: 1, outputFormat: 'png', quality: 92,
    includeMetadata: false, style: '', composition: '', camera: '',
    lighting: '', palette: '', background: '', texture: '',
    loraStrength: 1,
  };
}

export function composePrompt(config: GenerationConfig): string {
  return [config.prompt, config.style, config.composition, config.camera,
    config.lighting, config.palette, config.background, config.texture]
    .map(value => value.trim()).filter(Boolean).join(', ');
}
