export type FileType = 'video' | 'audio' | 'image' | 'document' | 'archive' | 'unknown';
import type { CompressionSettings } from './lib/compressors/settings';
import type { UpscaleModelSelection, UpscaleTier, UpscaleUse } from './lib/upscalers/catalog';
import type { UpscaleExecutionEvidence } from './lib/upscalers/executionTrace';

export type AppMode = 'convert' | 'compress' | 'upscale';

export interface BaseTask {
  id: string;
  file: File;
  type: FileType;
  status: 'idle' | 'storing' | 'queued' | 'processing' | 'done' | 'error';
  progress: number;
  stored: boolean;
  resultBlob?: Blob;
  resultEvidence?: UpscaleExecutionEvidence;
  resultUrl?: string;
  resultName?: string;
  resultSize?: number;
  errorMsg?: string;
}

export interface ConvertTask extends BaseTask {
  mode: 'convert';
  targetFormat: string;
}

export interface CompressTask extends BaseTask {
  mode: 'compress';
  /** 0 = mild, 100 = strongest compression. */
  quality: number;
  settings: CompressionSettings;
}

export interface UpscaleTask extends BaseTask {
  mode: 'upscale';
  model: UpscaleModelSelection;
  /** Preferred tier and purpose can be previewed before a compatible model is available. */
  upscaleTier?: UpscaleTier;
  upscalePurpose?: UpscaleUse;
  videoMethod: 'filter' | 'ai';
  limitSeconds?: number;
  width?: number;
  height?: number;
}

export type Task = ConvertTask | CompressTask | UpscaleTask;

// Output choices only. HEIC, AMR and ALAC are accepted as input formats but
// are deliberately not advertised as output: no valid encoder is bundled.
export const FORMATS: Record<FileType, string[]> = {
  video: [
    'mp4','webm','avi','mov','mkv','flv','wmv','m4v','ogv','3gp','hevc',
    'gif','mp3','wav','ogg','aac','flac','m4a','wma','opus','aiff','mka',
    'jpg','png','webp',
  ],
  audio: ['mp3','wav','ogg','aac','flac','m4a','wma','opus','aiff','mka'],
  image: ['png','jpg','webp','gif','bmp','tiff','ico','avif','svg','mp4','webm'],
  document: ['csv','xlsx','xls','json','ods','html','txt','rtf','pdf'],
  archive: ['zip'],
  unknown: ['mp4','mp3','wav','ogg','flac','m4a','png','jpg','webp'],
};
