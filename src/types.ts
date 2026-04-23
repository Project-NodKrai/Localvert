export type FileType = 'video' | 'audio' | 'image' | 'document' | 'archive' | 'unknown';
export type AppMode = 'convert' | 'compress' | 'upscale';

export interface BaseTask {
  id: string;
  file: File;
  type: FileType;
  status: 'idle' | 'storing' | 'processing' | 'done' | 'error';
  progress: number;
  stored: boolean;
  resultBlob?: Blob;
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
  quality: number; // 0 to 100
  settings: {
    // Image specific
    maxWidth?: number;
    keepMetadata?: boolean;
    // Video specific
    resolution?: 'original' | '1080p' | '720p' | '480p';
    mute?: boolean;
  };
}

export interface UpscaleTask extends BaseTask {
  mode: 'upscale';
  model: 'standard' | 'ultra';
  videoMethod: 'filter' | 'ai';
  limitSeconds?: number;
  width?: number;
  height?: number;
}

export type Task = ConvertTask | CompressTask | UpscaleTask;

export const FORMATS: Record<FileType, string[]> = {
  video: ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v', 'ogv', '3gp', 'hevc', 'gif', 'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'jpg', 'png', 'webp'],
  audio: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma', 'opus', 'amr', 'alac', 'aiff', 'mka', 'mp4', 'webm', 'mkv', 'mov'],
  image: ['png', 'jpg', 'webp', 'gif', 'bmp', 'tiff', 'ico', 'avif', 'heic', 'svg', 'mp4', 'webm'],
  document: ['csv', 'xlsx', 'json', 'ods', 'html', 'txt', 'rtf', 'pdf', 'docx'],
  archive: ['zip'],
  unknown: ['mp4', 'mp3', 'wav', 'zip', 'png', 'jpg', 'pdf', 'docx'],
};
