import Upscaler from 'upscaler';
import * as tf from '@tensorflow/tfjs';
import { setWasmPaths } from '@tensorflow/tfjs-backend-wasm';
import { acquireFFmpeg, releaseFFmpeg } from '../converters/media';

// Explicitly set WASM paths from CDN for reliability in sandboxed environment
setWasmPaths('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm/dist/');

let upscalerInstance: any = null;
let tfInitialized = false;

async function initTfjs() {
  if (tfInitialized) return;

  const tryBackend = async (name: string) => {
    try {
      await tf.setBackend(name);
      await tf.ready();
      
      // Smoke test: Perform a tiny operation to trigger shader compilation
      // 'Failed to compile fragment shader' often happens during the first actual op.
      const testTensor = tf.tensor1d([1, 2, 3]);
      testTensor.square().dataSync();
      testTensor.dispose();
      
      console.log(`TFJS initialized with ${name} backend successfully.`);
      return true;
    } catch (e) {
      console.warn(`${name} backend failed or has shader issues:`, e);
      return false;
    }
  };

  // 1. Try WebGL (Fastest)
  if (await tryBackend('webgl')) {
    tfInitialized = true;
    return;
  }

  // 2. Try WASM (Stable & reasonably fast)
  if (await tryBackend('wasm')) {
    tfInitialized = true;
    return;
  }

  // 3. Fallback to CPU (Safest, but slow)
  console.log('Falling back to CPU backend.');
  await tf.setBackend('cpu');
  await tf.ready();
  tfInitialized = true;
}

export async function getUpscaler() {
  await initTfjs();
  if (!upscalerInstance) {
    upscalerInstance = new Upscaler();
  }
  return upscalerInstance;
}

export async function upscaleImage(file: File, model: 'standard' | 'ultra', onProgress?: (p: number) => void): Promise<Blob> {
  try {
    return await upscaleImageInternal(file, model, onProgress);
  } catch (e: any) {
    if (e?.message?.includes('shader') || e?.message?.includes('fragment') || e?.message?.includes('WebGL')) {
      console.warn('Shader error detected during image upscale. Retrying with WASM backend...');
      await tf.setBackend('wasm');
      await tf.ready();
      return await upscaleImageInternal(file, model, onProgress);
    }
    throw e;
  }
}

async function upscaleImageInternal(file: File, model: 'standard' | 'ultra', onProgress?: (p: number) => void): Promise<Blob> {
  const upscaler = await getUpscaler();
  
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise((resolve) => (img.onload = resolve));
  
  try {
    // Strategy 1: Forced Tiling to avoid GPU Memory Limit (16384^2)
    const result = await upscaler.upscale(img, {
      patchSize: 512,
      padding: 10,
      progress: (progress: number) => {
        if (onProgress) onProgress(Math.round(progress * 100));
      },
    });
    
    const response = await fetch(result);
    return await response.blob();
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

export async function upscaleVideo(
  id: string, 
  file: File, 
  method: 'filter' | 'ai', 
  limitSeconds: number | undefined, 
  onProgress?: (p: number) => void
): Promise<Blob> {
  if (method === 'filter') {
    return await upscaleVideoFilter(id, file, onProgress);
  } else {
    return await upscaleVideoAI(id, file, limitSeconds, onProgress);
  }
}

async function upscaleVideoFilter(id: string, file: File, onProgress?: (p: number) => void): Promise<Blob> {
  const instance = await acquireFFmpeg();
  const inputName = `input_${id}_${file.name}`;
  const outputName = `upscaled_${id}_${file.name}`;
  
  try {
    const uint8 = new Uint8Array(await file.arrayBuffer());
    await instance.writeFile(inputName, uint8);
    
    const progressHandler = ({ progress }: { progress: number }) => {
      if (onProgress) onProgress(Math.round(progress * 100));
    };
    instance.on('progress', progressHandler);

    // Using unsharp filter for fast sharpening (simulated upscaling effect)
    await instance.exec([
      '-i', inputName,
      '-vf', 'unsharp=5:5:1.0:5:5:0.0,scale=iw*1.5:ih*1.5:flags=lanczos',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-c:a', 'copy',
      outputName
    ]);
    
    const data = await instance.readFile(outputName);
    return new Blob([data], { type: 'video/mp4' });
  } finally {
    releaseFFmpeg();
  }
}

async function upscaleVideoAI(
  id: string, 
  file: File, 
  limitSeconds: number | undefined, 
  onProgress?: (p: number) => void
): Promise<Blob> {
  const instance = await acquireFFmpeg();
  const inputName = `input_${id}_${file.name}`;
  
  try {
    const uint8 = new Uint8Array(await file.arrayBuffer());
    await instance.writeFile(inputName, uint8);
    
    // 1. Extract frames
    const frameDir = `frames_${id}`;
    // In ffmpeg.wasm we can't create directories easily, so we just prefix filenames
    const framePrefix = `frame_${id}_`;
    
    const extractArgs = ['-i', inputName];
    if (limitSeconds) {
       extractArgs.push('-t', limitSeconds.toString());
    }
    extractArgs.push(`${framePrefix}%04d.png`);
    
    await instance.exec(extractArgs);
    
    const files = await instance.listDir('.');
    const frameFiles = files
      .filter(f => f.name.startsWith(framePrefix) && !f.isDir)
      .map(f => f.name)
      .sort();
      
    const upscaler = await getUpscaler();
    const upscaledFrames: string[] = [];
    
    // 2. Process frames one by one
    for (let i = 0; i < frameFiles.length; i++) {
       const frameName = frameFiles[i];
       const frameData = await instance.readFile(frameName);
       const frameBlob = new Blob([frameData], { type: 'image/png' });
       
       const img = new Image();
       img.src = URL.createObjectURL(frameBlob);
       await new Promise((resolve) => (img.onload = resolve));
       
       let upscaledB64: string;
       try {
         upscaledB64 = await upscaler.upscale(img, {
           patchSize: 512,
           padding: 10
         });
       } catch (e: any) {
         if (e?.message?.includes('shader') || e?.message?.includes('fragment') || e?.message?.includes('WebGL')) {
           console.warn('Shader error detected during video frame upscale. Switching to WASM...');
           await tf.setBackend('wasm');
           await tf.ready();
           upscaledB64 = await upscaler.upscale(img, {
             patchSize: 512,
             padding: 10
           });
         } else {
           throw e;
         }
       }
       
       const upscaledRes = await fetch(upscaledB64);
       const upscaledBlob = await upscaledRes.blob();
       const upscaledUint8 = new Uint8Array(await upscaledBlob.arrayBuffer());
       
       const upscaledName = `upscaled_${frameName}`;
       await instance.writeFile(upscaledName, upscaledUint8);
       upscaledFrames.push(upscaledName);
       
       URL.revokeObjectURL(img.src);
       await instance.deleteFile(frameName);

       if (onProgress) onProgress(Math.round(((i + 1) / frameFiles.length) * 100));
    }
    
    // 3. Merge frames back into video
    const outputName = `ai_upscaled_${id}.mp4`;
    await instance.exec([
      '-framerate', '30', // Assume 30fps for simplicity, ideally we detect this
      '-i', `upscaled_${framePrefix}%04d.png`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      outputName
    ]);
    
    const finalData = await instance.readFile(outputName);
    
    // Cleanup upscaled frames
    for(const f of upscaledFrames) {
        await instance.deleteFile(f);
    }
    await instance.deleteFile(outputName);

    return new Blob([finalData], { type: 'video/mp4' });
  } finally {
    releaseFFmpeg();
  }
}
