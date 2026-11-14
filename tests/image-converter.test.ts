import test from 'node:test';
import assert from 'node:assert/strict';
import { File as NodeFile } from 'node:buffer';
import { convertImage } from '../src/lib/converters/image';

// Node 20 exposes File via node:buffer; the browser converter uses the DOM global.
if (typeof globalThis.File === 'undefined') {
  Object.defineProperty(globalThis, 'File', { value: NodeFile, configurable: true });
}

function sampleFile(name: string, type: string): File {
  return new NodeFile([new Uint8Array([1, 2, 3])], name, { type }) as unknown as File;
}

const neverCompress = async (): Promise<Blob> => {
  throw new Error('Format conversion unexpectedly invoked the image compressor');
};

test('HEIC -> PNG returns the decoded PNG blob without recompressing it', async () => {
  const source = sampleFile('large-photo.HEIC', 'image/heic');
  const decodedPng = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
  let decodeCalls = 0;

  const result = await convertImage(source, 'png', {
    decodeHeic: async (input) => {
      assert.equal(input, source);
      decodeCalls++;
      return decodedPng;
    },
    compressImage: neverCompress,
  });

  assert.equal(decodeCalls, 1);
  assert.equal(result.ext, 'png');
  assert.equal(result.blob, decodedPng);
});

test('PNG -> PNG passes the original file through untouched', async () => {
  const source = sampleFile('existing.png', 'image/png');
  const result = await convertImage(source, 'png', {
    decodeHeic: async () => { throw new Error('PNG should not enter the HEIC decoder'); },
    compressImage: neverCompress,
  });

  assert.equal(result.ext, 'png');
  assert.equal(result.blob, source);
});

test('HEIC -> JPEG still follows the existing JPEG encoding route', async () => {
  const source = sampleFile('photo.heif', 'image/heif');
  const decodedPng = new Blob(['decoded'], { type: 'image/png' });
  const jpeg = new Blob(['jpeg'], { type: 'image/jpeg' });
  let received: { name: string; fileType: string } | undefined;

  const result = await convertImage(source, 'jpeg', {
    decodeHeic: async () => [decodedPng],
    compressImage: async (input, options) => {
      received = { name: input.name, fileType: options.fileType };
      return jpeg;
    },
  });

  assert.deepEqual(received, { name: 'photo.png', fileType: 'image/jpeg' });
  assert.equal(result.blob, jpeg);
  assert.equal(result.ext, 'jpeg');
});
