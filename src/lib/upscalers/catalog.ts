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
] as const;

export type ActiveUpscaleModelId = (typeof ACTIVE_MODEL_IDS)[number];
/** Old saved tasks can still refer to the names that were used before tiering. */
export type UpscaleModelSelection = ActiveUpscaleModelId | 'standard' | 'ultra';
export type UpscaleUse = '실사' | '일러스트' | '애니메이션' | '동영상';
export type ModelRecord = {
  id: string;
  name: string;
  tier: UpscaleTier;
  uses: readonly UpscaleUse[];
  scale: 2 | 3 | 4 | null;
  available: boolean;
  note: string;
};

export const UPSCALE_CATALOG: readonly ModelRecord[] = [
  { id: 'quicksrnet-small-3x', name: 'QuickSRNet Small', tier: 'nano', uses: ['실사', '동영상'], scale: 3, available: false, note: 'ONNX 가중치 확인 · 브라우저 추론 엔진 이식 대기' },
  { id: 'esrgan-slim-2x', name: 'ESRGAN Slim', tier: 'standard', uses: ['실사', '일러스트'], scale: 2, available: true, note: '기존 Standard · 처리 부담이 커 Standard 이상으로 임시 재분류 · 실측 필요' },
  { id: 'span-f', name: 'SPAN-F', tier: 'lite', uses: ['실사', '일러스트'], scale: null, available: false, note: '브라우저 실행 및 가중치 검증 대기' },
  { id: 'esrgan-medium-2x', name: 'ESRGAN Medium', tier: 'plus', uses: ['실사', '일러스트'], scale: 2, available: true, note: '기존 Ultra · 모델 연산량 실측 전 Plus 임시 배치' },
  { id: 'esrgan-medium-4x', name: 'ESRGAN Medium 4×', tier: 'max', uses: ['실사', '일러스트'], scale: 4, available: true, note: '공식 4배 가중치 · 출력 픽셀 수 16배 · Max 임시 배치' },
  { id: 'realplksr-2x', name: 'RealPLKSR', tier: 'plus', uses: ['실사', '일러스트'], scale: 2, available: false, note: 'ONNX 변환 및 성능 검증 대기' },
  { id: 'drct', name: 'DRCT', tier: 'pro', uses: ['실사', '일러스트'], scale: null, available: false, note: '브라우저 가중치 이식 대기' },
  { id: 'adcsr', name: 'AdcSR', tier: 'pro', uses: ['실사'], scale: null, available: false, note: '브라우저 이식 대기' },
  { id: 'osediff', name: 'OSEDiff', tier: 'max', uses: ['실사'], scale: null, available: false, note: '고연산 모델 · 실행기 별도 검토' },
  { id: 'flashvsr', name: 'FlashVSR', tier: 'max', uses: ['동영상'], scale: null, available: false, note: '영상 전용 실행기 필요' },
  { id: 'pisa-sr', name: 'PiSA-SR', tier: 'ultra', uses: ['실사', '일러스트'], scale: null, available: false, note: '생성형 추론 실행기 필요' },
  { id: 'hypir', name: 'HYPIR', tier: 'ultra', uses: ['실사'], scale: null, available: false, note: '생성형 추론 실행기 필요' },
  { id: 'vosr-05b', name: 'VOSR 0.5B', tier: 'ultra-plus', uses: ['실사'], scale: null, available: false, note: '고성능 별도 실행기 필요' },
  { id: 'seedvr2-3b', name: 'SeedVR2 3B', tier: 'ultra-plus', uses: ['동영상'], scale: null, available: false, note: '대형 영상 모델 · 브라우저 미지원' },
  { id: 'vosr-20-14b', name: 'VOSR 2.0 1.4B', tier: 'reference', uses: ['실사'], scale: null, available: false, note: '연구·비교 후보 · 실행 미구현' },
  { id: 'seedvr2-7b', name: 'SeedVR2 7B', tier: 'reference', uses: ['동영상'], scale: null, available: false, note: '대형 영상 모델 · 실행 미구현' },
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
