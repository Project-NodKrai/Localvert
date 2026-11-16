import {
  activeModel, isRunnableSelection, modelsForTierPurpose,
  runnableModelForTierPurpose,
} from './catalog';
import type { UpscaleModelSelection, UpscaleTier, UpscaleUse } from './catalog';

export type StudioMedia = 'image' | 'video';
export type StudioViewMode = StudioMedia | 'mixed';
export type StudioProfile = {
  model: UpscaleModelSelection;
  upscaleTier: UpscaleTier;
  upscalePurpose: UpscaleUse;
  videoMethod: 'filter' | 'ai';
  limitSeconds?: number;
};

export const DEFAULT_STUDIO_PROFILES: Record<StudioMedia, StudioProfile> = {
  image: {
    model: 'esrgan-slim-2x',
    upscaleTier: 'standard',
    upscalePurpose: '실사',
    videoMethod: 'ai',
  },
  video: {
    model: 'quicksrnet-small-4x',
    upscaleTier: 'nano',
    upscalePurpose: '동영상',
    videoMethod: 'filter',
    limitSeconds: 10,
  },
};

export function updateStudioProfile(
  current: StudioProfile,
  updates: Partial<StudioProfile>,
): StudioProfile {
  const next = { ...current, ...updates };
  // Do not reuse a model from a different tier as a silent fallback.
  if ((updates.upscaleTier || updates.upscalePurpose) && !updates.model) {
    const alreadySelected = modelsForTierPurpose(next.upscaleTier, next.upscalePurpose)
      .some(model => model.available && model.id === activeModel(current.model).id);
    if (!alreadySelected) {
      const fallback = runnableModelForTierPurpose(next.upscaleTier, next.upscalePurpose);
      if (fallback) next.model = fallback;
    }
  }
  return next;
}

export function isStudioProfileRunnable(profile: StudioProfile, media: StudioMedia): boolean {
  if (media === 'video' && profile.videoMethod === 'filter') return true;
  return isRunnableSelection(profile.model, profile.upscaleTier, profile.upscalePurpose);
}


/** Filter a drop by its visible workspace. Mixed accepts both media types. */
export function canAcceptStudioFile(media: StudioViewMode, file: Pick<File, 'type' | 'name'>): boolean {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  const image = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|tiff?|avif|heic|heif|ico)$/i.test(name);
  const video = mime.startsWith('video/') || /\.(mp4|m4v|mov|webm|mkv|avi|ogv|wmv|flv|3gp)$/i.test(name);
  if (media === 'mixed') return image || video;
  return media === 'image' ? image : video;
}
