/**
 * LocalVert image super-resolution catalog.
 *
 * A tier is a product resource/performance target, NOT a PSNR or fidelity score.
 * "planned" entries are discovery candidates, not installed models or executables.
 */
export const UPSCALE_TIERS = [
  'nano', 'lite', 'standard', 'plus', 'pro', 'max',
  'ultra', 'ultra-plus', 'reference',
] as const;

export type UpscaleTier = (typeof UPSCALE_TIERS)[number];

export const TIER_LABELS: Record<UpscaleTier, string> = {
  nano: 'Nano',
  lite: 'Lite',
  standard: 'Standard',
  plus: 'Plus',
  pro: 'Pro',
  max: 'Max',
  ultra: 'Ultra',
  'ultra-plus': 'Ultra Plus',
  reference: 'Reference',
};

export const ACTIVE_MODEL_IDS = [
  'esrgan-slim-2x',
  'esrgan-medium-2x',
  'esrgan-medium-4x',
  'anime4k-v4-s-2x',
  'anime4k-v4-m-2x',
  'anime4k-v4-l-2x',
  'quicksrnet-small-4x',
  'quicksrnet-medium-4x',
  'realesr-general-x4v3',
  'realesr-animevideov3',
  'realesrgan-x4plus-anime',
  'realesrgan-x4plus',
  'realesrgan-anime-4b32f',
  'swin2sr-lightweight-2x',
  'swin2sr-classical-4x',
  'swin2sr-realworld-4x',
  'swin2sr-compressed-4x',
  'realcugan-hfa2k-2x',
  'xlsr-4x',
  'quicksrnet-large-4x',
  'realplksr-2x',
  'realplksr-4x',
  'nomosuni-span-2x',
  'modernspanimation-2x',
] as const;

export type ActiveUpscaleModelId = (typeof ACTIVE_MODEL_IDS)[number];
/** Old saved tasks can still refer to the names that were used before tiering. */
export type UpscaleModelSelection = ActiveUpscaleModelId | 'standard' | 'ultra';
export type UpscaleUse = '실사' | '일러스트' | '애니메이션' | '동영상';
export const UPSCALE_PURPOSES: readonly UpscaleUse[] = ['실사', '일러스트', '애니메이션', '동영상'];
export type ModelRecord = {
  id: string;
  name: string;
  tier: UpscaleTier;
  uses: readonly UpscaleUse[];
  scale: 2 | 3 | 4 | null;
  available: boolean;
};

export const UPSCALE_CATALOG: readonly ModelRecord[] = [
  { id: 'anime4k-v4-s-2x', name: 'Anime4K v4 S', tier: 'nano', uses: ['일러스트', '애니메이션', '동영상'], scale: 2, available: true },
  { id: 'anime4k-v4-m-2x', name: 'Anime4K v4 M', tier: 'lite', uses: ['일러스트', '애니메이션', '동영상'], scale: 2, available: true },
  { id: 'anime4k-v4-l-2x', name: 'Anime4K v4 L', tier: 'standard', uses: ['일러스트', '애니메이션', '동영상'], scale: 2, available: true },
  { id: 'quicksrnet-small-4x', name: 'QuickSRNet Small', tier: 'nano', uses: ['실사', '동영상'], scale: 4, available: true },
  { id: 'quicksrnet-medium-4x', name: 'QuickSRNet Medium', tier: 'lite', uses: ['실사', '동영상'], scale: 4, available: true },
  { id: 'nomosuni-span-2x', name: 'NomosUni SPAN 2×', tier: 'lite', uses: ['실사', '동영상'], scale: 2, available: true },
  { id: 'modernspanimation-2x', name: 'ModernSpanimation SPAN 2×', tier: 'lite', uses: ['일러스트', '애니메이션', '동영상'], scale: 2, available: true },
  { id: 'realesr-general-x4v3', name: 'Real-ESRGAN General x4v3', tier: 'lite', uses: ['실사', '동영상'], scale: 4, available: true },
  { id: 'realesr-animevideov3', name: 'Real-ESRGAN AnimeVideo v3', tier: 'lite', uses: ['일러스트', '애니메이션', '동영상'], scale: 4, available: true },
  { id: 'realesrgan-x4plus-anime', name: 'Real-ESRGAN Anime 6B', tier: 'pro', uses: ['일러스트', '애니메이션'], scale: 4, available: true },
  { id: 'realesrgan-x4plus', name: 'Real-ESRGAN x4plus', tier: 'pro', uses: ['실사', '동영상'], scale: 4, available: true },
  { id: 'realesrgan-anime-4b32f', name: 'Real-ESRGAN Anime 4B32F', tier: 'plus', uses: ['일러스트', '애니메이션'], scale: 4, available: true },
  { id: 'swin2sr-lightweight-2x', name: 'Swin2SR Lightweight', tier: 'standard', uses: ['실사', '일러스트'], scale: 2, available: true },
  { id: 'swin2sr-classical-4x', name: 'Swin2SR Classical', tier: 'pro', uses: ['실사', '일러스트'], scale: 4, available: true },
  { id: 'swin2sr-realworld-4x', name: 'Swin2SR RealWorld', tier: 'pro', uses: ['실사'], scale: 4, available: true },
  { id: 'swin2sr-compressed-4x', name: 'Swin2SR Compressed', tier: 'pro', uses: ['실사'], scale: 4, available: true },
  { id: 'realcugan-hfa2k-2x', name: 'Real-CUGAN HFA2k', tier: 'plus', uses: ['일러스트', '애니메이션'], scale: 2, available: true },
  { id: 'xlsr-4x', name: 'XLSR', tier: 'nano', uses: ['실사', '동영상'], scale: 4, available: true },
  { id: 'quicksrnet-large-4x', name: 'QuickSRNet Large', tier: 'standard', uses: ['실사', '동영상'], scale: 4, available: true },
  { id: 'realplksr-4x', name: 'RealPLKSR 4×', tier: 'plus', uses: ['실사', '일러스트'], scale: 4, available: true },
  { id: 'esrgan-slim-2x', name: 'ESRGAN Slim', tier: 'standard', uses: ['실사', '일러스트'], scale: 2, available: true },
  { id: 'span-f', name: 'SPAN-F', tier: 'lite', uses: ['실사', '일러스트'], scale: null, available: false },
  { id: 'esrgan-medium-2x', name: 'ESRGAN Medium', tier: 'plus', uses: ['실사', '일러스트'], scale: 2, available: true },
  { id: 'esrgan-medium-4x', name: 'ESRGAN Medium 4×', tier: 'max', uses: ['실사', '일러스트'], scale: 4, available: true },
  { id: 'realplksr-2x', name: 'RealPLKSR 2×', tier: 'plus', uses: ['실사', '일러스트'], scale: 2, available: true },
  { id: 'drct', name: 'DRCT', tier: 'pro', uses: ['실사', '일러스트'], scale: null, available: false },
  { id: 'adcsr', name: 'AdcSR', tier: 'pro', uses: ['실사'], scale: null, available: false },
  { id: 'osediff', name: 'OSEDiff', tier: 'max', uses: ['실사'], scale: null, available: false },
  { id: 'flashvsr', name: 'FlashVSR', tier: 'max', uses: ['동영상'], scale: null, available: false },
  { id: 'pisa-sr', name: 'PiSA-SR', tier: 'ultra', uses: ['실사', '일러스트'], scale: null, available: false },
  { id: 'hypir', name: 'HYPIR', tier: 'ultra', uses: ['실사'], scale: null, available: false },
  { id: 'vosr-05b', name: 'VOSR 0.5B', tier: 'ultra-plus', uses: ['실사'], scale: null, available: false },
  { id: 'seedvr2-3b', name: 'SeedVR2 3B', tier: 'ultra-plus', uses: ['동영상'], scale: null, available: false },
  { id: 'vosr-20-14b', name: 'VOSR 2.0 1.4B', tier: 'reference', uses: ['실사'], scale: null, available: false },
  { id: 'seedvr2-7b', name: 'SeedVR2 7B', tier: 'reference', uses: ['동영상'], scale: null, available: false },
] as const;

export function normalizeModelId(selected: UpscaleModelSelection): ActiveUpscaleModelId {
  if (selected === 'standard') return 'esrgan-slim-2x';
  if (selected === 'ultra') return 'esrgan-medium-2x';
  if (ACTIVE_MODEL_IDS.includes(selected as ActiveUpscaleModelId)) {
    return selected as ActiveUpscaleModelId;
  }
  throw new Error('아직 실행할 수 없는 복원 모델이야.');
}

export function activeModel(selected: UpscaleModelSelection): ModelRecord {
  const id = normalizeModelId(selected);
  const entry = UPSCALE_CATALOG.find(model => model.id === id);
  if (!entry?.available || !entry.scale) throw new Error('복원 모델이 설치되지 않았어.');
  return entry;
}

export function modelDisplayName(selected: UpscaleModelSelection): string {
  const model = activeModel(selected);
  return TIER_LABELS[model.tier] + ' · ' + model.name + ' ' + model.scale + '×';
}

/** Only models already wired into an executable browser backend can be selected. */
export function modelsForTierPurpose(tier: UpscaleTier, purpose: UpscaleUse): ModelRecord[] {
  return UPSCALE_CATALOG.filter(model => model.tier === tier && model.uses.includes(purpose));
}

export function runnableModelForTierPurpose(tier: UpscaleTier, purpose: UpscaleUse): ActiveUpscaleModelId | null {
  const model = modelsForTierPurpose(tier, purpose).find(entry => entry.available);
  return model && ACTIVE_MODEL_IDS.includes(model.id as ActiveUpscaleModelId)
    ? model.id as ActiveUpscaleModelId : null;
}

export function isRunnableSelection(
  selection: UpscaleModelSelection, tier: UpscaleTier, purpose: UpscaleUse
): boolean {
  const modelId = normalizeModelId(selection);
  return modelsForTierPurpose(tier, purpose).some(entry => entry.available && entry.id === modelId);
}

export function tierPurposeLabel(tier: UpscaleTier, purpose: UpscaleUse): string {
  return TIER_LABELS[tier] + ' (' + purpose + ')';
}
