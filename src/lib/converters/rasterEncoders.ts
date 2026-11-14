/** Browser-independent encoders for formats Canvas.toBlob is not required to support. */
export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

function verifyBuffer({ width, height, data }: PixelBuffer) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > 65535 || height > 65535 || width * height > 150_000_000 ||
      data.length !== width * height * 4) {
    throw new Error('이미지 크기나 RGBA 픽셀 데이터가 올바르지 않아.');
  }
}

function blendWhite(channel: number, alpha: number): number {
  return Math.round((channel * alpha + 255 * (255 - alpha)) / 255);
}

export function encodeBmp(pixels: PixelBuffer): Blob {
  verifyBuffer(pixels);
  const { width, height, data } = pixels;
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bytes = new Uint8Array(54 + stride * height);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x42; bytes[1] = 0x4d; // BM
  view.setUint32(2, bytes.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // bottom-up bitmap
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, stride * height, true);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * stride;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      const j = row + x * 3;
      bytes[j] = blendWhite(data[i + 2], alpha);
      bytes[j + 1] = blendWhite(data[i + 1], alpha);
      bytes[j + 2] = blendWhite(data[i], alpha);
    }
  }
  return new Blob([bytes], { type: 'image/bmp' });
}

export function encodeTiff(pixels: PixelBuffer): Blob {
  verifyBuffer(pixels);
  const { width, height, data } = pixels;
  const tagCount = 10;
  const ifdOffset = 8;
  const bitsOffset = ifdOffset + 2 + tagCount * 12 + 4;
  const dataOffset = bitsOffset + 6;
  const rawBytes = width * height * 3;
  const bytes = new Uint8Array(dataOffset + rawBytes);
  const view = new DataView(bytes.buffer);
  bytes[0] = 0x49; bytes[1] = 0x49; // little-endian TIFF
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, tagCount, true);
  let next = ifdOffset + 2;
  function tag(id: number, type: number, count: number, value: number) {
    view.setUint16(next, id, true);
    view.setUint16(next + 2, type, true);
    view.setUint32(next + 4, count, true);
    if (type === 3 && count === 1) view.setUint16(next + 8, value, true);
    else view.setUint32(next + 8, value, true);
    next += 12;
  }
  tag(256, 4, 1, width);           // ImageWidth
  tag(257, 4, 1, height);          // ImageLength
  tag(258, 3, 3, bitsOffset);      // BitsPerSample
  tag(259, 3, 1, 1);               // Compression: none
  tag(262, 3, 1, 2);               // RGB photometric
  tag(273, 4, 1, dataOffset);      // StripOffsets
  tag(277, 3, 1, 3);               // SamplesPerPixel
  tag(278, 4, 1, height);          // RowsPerStrip
  tag(279, 4, 1, rawBytes);        // StripByteCounts
  tag(284, 3, 1, 1);               // PlanarConfiguration: chunky
  view.setUint32(next, 0, true);  // next IFD
  view.setUint16(bitsOffset, 8, true);
  view.setUint16(bitsOffset + 2, 8, true);
  view.setUint16(bitsOffset + 4, 8, true);
  for (let i = 0, j = dataOffset; i < data.length; i += 4, j += 3) {
    const alpha = data[i + 3];
    bytes[j] = blendWhite(data[i], alpha);
    bytes[j + 1] = blendWhite(data[i + 1], alpha);
    bytes[j + 2] = blendWhite(data[i + 2], alpha);
  }
  return new Blob([bytes], { type: 'image/tiff' });
}

/** Windows Vista+ ICO supports a PNG payload; PNG retains alpha. */
export async function encodeIco(png: Blob, width: number, height: number): Promise<Blob> {
  if (!Number.isInteger(width) || !Number.isInteger(height) ||
      width < 1 || height < 1 || width > 256 || height > 256) {
    throw new Error('ICO는 가로·세로가 각각 1~256px인 PNG 이미지가 필요해.');
  }
  const pngData = new Uint8Array(await png.arrayBuffer());
  if (pngData.length < 8 || ![137,80,78,71,13,10,26,10].every((v, i) => pngData[i] === v)) {
    throw new Error('ICO에 담을 이미지가 실제 PNG 형식이 아니야.');
  }
  const bytes = new Uint8Array(22 + pngData.length);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // icon, not cursor
  view.setUint16(4, 1, true); // one image
  bytes[6] = width === 256 ? 0 : width;
  bytes[7] = height === 256 ? 0 : height;
  view.setUint16(10, 1, true);  // color planes
  view.setUint16(12, 32, true); // bpp
  view.setUint32(14, pngData.length, true);
  view.setUint32(18, 22, true);
  bytes.set(pngData, 22);
  return new Blob([bytes], { type: 'image/x-icon' });
}
