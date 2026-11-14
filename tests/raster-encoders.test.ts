import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeBmp, encodeIco, encodeTiff } from '../src/lib/converters/rasterEncoders';

const buffer = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) };

test('BMP emits a valid bottom-up 24-bit bitmap with accurate dimensions and colors', async () => {
  const blob = encodeBmp(buffer);
  const b = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(b.buffer);
  assert.equal(String.fromCharCode(b[0], b[1]), 'BM');
  assert.equal(view.getUint32(2, true), b.byteLength);
  assert.equal(view.getInt32(18, true), 2);
  assert.equal(view.getInt32(22, true), 1);
  assert.equal(view.getUint16(28, true), 24);
  assert.deepEqual([...b.slice(54, 60)], [0, 0, 255, 255, 0, 0]);
});

test('TIFF emits a little-endian baseline RGB image', async () => {
  const blob = encodeTiff(buffer);
  const b = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(b.buffer);
  assert.equal(b[0], 0x49);
  assert.equal(b[1], 0x49);
  assert.equal(view.getUint16(2, true), 42);
  assert.equal(view.getUint16(8, true), 10);
  assert.deepEqual([...b.slice(-6)], [255, 0, 0, 0, 0, 255]);
});

test('ICO embeds PNG data in the Windows icon directory', async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: 'image/png' });
  const icon = await encodeIco(png, 32, 32);
  const bytes = new Uint8Array(await icon.arrayBuffer());
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(2, true), 1);
  assert.equal(view.getUint16(4, true), 1);
  assert.equal(bytes[6], 32);
  assert.equal(view.getUint32(18, true), 22);
  assert.equal(bytes[22], 137);
});

test('ICO rejects unencoded or oversized payloads', async () => {
  const bogus = new Blob(['not png'], { type: 'image/png' });
  await assert.rejects(encodeIco(bogus, 32, 32), /PNG/);
  await assert.rejects(encodeIco(bogus, 512, 512), /256/);
});
