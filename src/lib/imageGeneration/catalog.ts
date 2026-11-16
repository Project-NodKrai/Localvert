import { TIER_LABELS, UPSCALE_TIERS } from '../upscalers/catalog';
import type { UpscaleTier } from '../upscalers/catalog';

export { TIER_LABELS, UPSCALE_TIERS };
export type GenerationTier = UpscaleTier;

export type GenerationModel = Readonly<{
  id: string;
  tier: GenerationTier;
  name: string;
  params: string;
  use: string;
  checkpointUrl: string;
  steps: Readonly<{ min: number; max: number; initial: number }>;
  cfg: number | null;
  negative: boolean;
  sampler?: string;
  requiresPromptUpsampler?: boolean;
  licensing: string;
}>;

// Model identities and distilled/default sampling constraints are intentionally
// independent of ComfyUI execution support. A model is only runnable after its
// *own* API-format workflow has been imported and validated.
export const GENERATION_MODELS: readonly GenerationModel[] = [
  {
    id: 'dreamlite-mobile', tier: 'nano', name: 'DreamLite Mobile',
    params: '0.39B', use: '초경량 생성',
    checkpointUrl: 'https://github.com/ByteVisionLab/DreamLite',
    steps: { min: 4, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: '비상업적 연구용',
  },
  {
    id: 'sana-sprint-06b', tier: 'lite', name: 'SANA-Sprint 0.6B',
    params: '0.6B', use: '빠른 이미지 생성',
    checkpointUrl: 'https://nvlabs.github.io/Sana/Sprint/',
    steps: { min: 1, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: '체크포인트 라이선스 확인',
  },
  {
    id: 'sana-sprint-16b', tier: 'standard', name: 'SANA-Sprint 1.6B',
    params: '1.6B', use: '일반 이미지 생성',
    checkpointUrl: 'https://nvlabs.github.io/Sana/Sprint/',
    steps: { min: 1, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: '체크포인트 라이선스 확인',
  },
  {
    id: 'anima-turbo-2b', tier: 'plus', name: 'Anima-Turbo',
    params: '2B', use: '애니메이션·일러스트',
    checkpointUrl: 'https://huggingface.co/circlestone-labs/Anima',
    steps: { min: 8, max: 12, initial: 8 }, cfg: 1, negative: false,
    sampler: 'euler', licensing: 'CircleStone Labs Non-Commercial',
  },
  {
    id: 'iris-3b-turbo', tier: 'pro', name: 'Iris-3B Turbo',
    params: '3B', use: '범용·고속 생성',
    checkpointUrl: 'https://huggingface.co/speridlabs/iris-3b',
    steps: { min: 4, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: 'Apache-2.0',
  },
  {
    id: 'flux2-klein-4b', tier: 'max', name: 'FLUX.2 Klein 4B',
    params: '4B', use: '범용·참조 이미지 생성',
    checkpointUrl: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4B',
    steps: { min: 4, max: 4, initial: 4 }, cfg: null, negative: false,
    licensing: 'Apache-2.0',
  },
  {
    id: 'flux3-image-klein', tier: 'ultra', name: 'FLUX 3 Image Klein',
    params: '5.6B', use: '고품질·정교한 구도',
    checkpointUrl: 'https://huggingface.co/black-forest-labs/flux-3-image-klein',
    steps: { min: 16, max: 16, initial: 16 }, cfg: null, negative: false,
    requiresPromptUpsampler: true, licensing: 'FLUX Kommunity License',
  },
  {
    id: 'z-image-turbo', tier: 'ultra-plus', name: 'Z-Image-Turbo',
    params: '6B', use: '실사·인물·풍경',
    checkpointUrl: 'https://huggingface.co/Tongyi-MAI/Z-Image-Turbo',
    steps: { min: 8, max: 9, initial: 9 }, cfg: null, negative: false,
    sampler: 'euler', licensing: 'Apache-2.0',
  },
  {
    id: 'qwen-image-21-turbo', tier: 'reference', name: 'Qwen-Image-2.1 Turbo',
    params: '7B', use: '텍스트·복잡한 장면',
    checkpointUrl: 'https://huggingface.co/Qwen/Qwen-Image-2.1-Turbo',
    steps: { min: 8, max: 8, initial: 8 }, cfg: null, negative: false,
    licensing: 'Qwen Research License',
  },
] as const;

export function modelForTier(tier: GenerationTier): GenerationModel {
  const model = GENERATION_MODELS.find(item => item.tier === tier);
  if (!model) throw new Error('등록되지 않은 이미지 생성 등급이야.');
  return model;
}

export type GenerationConfig = {
  modelId: string;
  prompt: string;
  negative: string;
  width: number;
  height: number;
  seed: number;
  randomSeed: boolean;
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
  environment: string;
  texture: string;
  styleStrength: number;
  promptWeight: number;
  generationPriority: 'balanced' | 'memory';
  loraName: string;
  loraStrength: number;
  vae: string;
  refiner: string;
  highResFactor: number;
  guidanceRescale: number;
  seedVariation: number;
  variationStrength: number;
  promptSchedule: string;
  regionalPrompt: string;
};

export function defaultGenerationConfig(model: GenerationModel = GENERATION_MODELS[0]): GenerationConfig {
  return {
    modelId: model.id, prompt: '', negative: '',
    width: 1024, height: 1024, seed: 42, randomSeed: true,
    steps: model.steps.initial, cfg: model.cfg ?? 1,
    sampler: model.sampler || 'euler', scheduler: 'normal', denoise: 1,
    batchCount: 1, batchSize: 1, outputFormat: 'png', quality: 92,
    includeMetadata: true, style: '', composition: '', camera: '',
    lighting: '', palette: '', environment: '', texture: '',
    styleStrength: 1, promptWeight: 1, generationPriority: 'balanced',
    loraName: '', loraStrength: 1, vae: '', refiner: '',
    highResFactor: 1, guidanceRescale: 0,
    seedVariation: 0, variationStrength: 0, promptSchedule: '', regionalPrompt: '',
  };
}

export function composePrompt(config: GenerationConfig): string {
  const parts = [config.prompt.trim()];
  for (const value of [config.style, config.composition, config.camera,
    config.lighting, config.palette, config.environment, config.texture]) {
    if (value.trim()) parts.push(value.trim());
  }
  return parts.filter(Boolean).join(', ');
}
