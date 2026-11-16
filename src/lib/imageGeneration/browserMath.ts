/** FLUX.2 Klein flow-matching math. Independent from browser APIs for regression tests. */
export function fluxSigmas(steps: number, imageSequence: number): number[] {
  if (!Number.isInteger(steps) || steps < 1 || steps > 50) throw new Error('Invalid step count');
  if (!Number.isInteger(imageSequence) || imageSequence < 1) throw new Error('Invalid image sequence');
  const mu = 0.5 + (1.15 - 0.5) * (imageSequence - 256) / (4096 - 256);
  const multiplier = Math.exp(mu);
  const result: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (steps - i) / steps;
    result.push(t === 0 ? 0 : t === 1 ? 1 : multiplier * t / (multiplier * t + 1 - t));
  }
  return result;
}

export function unpackFluxLatent(
  packed: Float32Array, width: number, height: number,
): Float32Array {
  if (width % 16 || height % 16 || width < 16 || height < 16) {
    throw new Error('FLUX dimensions must be positive multiples of 16');
  }
  const w = width / 16, h = height / 16;
  if (packed.length !== h * w * 128) throw new Error('FLUX latent dimensions mismatch');
  const outW = width / 8, outH = height / 8;
  const result = new Float32Array(32 * outH * outW);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = (y * w + x) * 128;
      for (let c = 0; c < 32; c++) {
        const channel = c * outH * outW;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            result[channel + (y * 2 + dy) * outW + (x * 2 + dx)] =
              packed[src + c * 4 + dy * 2 + dx];
          }
        }
      }
    }
  }
  return result;
}

export function seededGaussian(count: number, seed: number): Float32Array {
  const result = new Float32Array(count);
  let state = seed >>> 0;
  function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = 0; i < count; i += 2) {
    const u = Math.max(next(), 1e-9);
    const angle = next() * Math.PI * 2;
    const radius = Math.sqrt(-2 * Math.log(u));
    result[i] = Math.cos(angle) * radius;
    if (i + 1 < count) result[i + 1] = Math.sin(angle) * radius;
  }
  return result;
}

export function float32ToHalf(value: number): number {
  const f = new Float32Array(1);
  const bits = new Uint32Array(f.buffer);
  f[0] = value;
  const x = bits[0], sign = (x >>> 16) & 0x8000;
  const e = (x >>> 23) & 255;
  const mantissa = x & 0x7fffff;
  if (e === 255) return sign | (mantissa ? 0x7e00 : 0x7c00);
  const halfE = e - 127 + 15;
  if (halfE >= 31) return sign | 0x7c00;
  if (halfE <= 0) {
    if (halfE < -10) return sign;
    const m = (mantissa | 0x800000) >>> (1 - halfE);
    return sign | ((m + 0x1000) >>> 13);
  }
  return sign | (halfE << 10) | ((mantissa + 0x1000) >>> 13);
}

export function halfToFloat32(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const e = (bits >>> 10) & 31, m = bits & 1023;
  if (e === 0) return sign * (m ? Math.pow(2, -14) * m / 1024 : 0);
  if (e === 31) return m ? NaN : sign * Infinity;
  return sign * Math.pow(2, e - 15) * (1 + m / 1024);
}
