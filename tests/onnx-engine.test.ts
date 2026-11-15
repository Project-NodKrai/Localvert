import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbaToNchw } from '../src/lib/upscalers/onnx';
import { tilePlan } from '../src/lib/upscalers/onnxProfiles';

test('preprocessing yields unit RGB NCHW with edge padding and alpha blending', () => {
  const source = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
  const tile = tilePlan(2, 1, 'realesr-general-x4v3')[0];
  const tensor = rgbaToNchw(source, 2, 1, tile, 12);
  const plane = tile.inputWidth * tile.inputHeight;
  assert.equal(tensor.length, plane * 3);
  assert.equal(tensor[0], 1);
  assert.equal(tensor[plane], 0);
  assert.equal(tensor[2 * plane], 0);
  // The second input pixel was fully transparent and is treated as white for RGB inference.
  assert.equal(tensor[13], 1);
  assert.equal(tensor[plane + 13], 1);
});

test('input sizes are bounded for both fixed 128x128 and dynamic models', () => {
  for (const id of ['quicksrnet-small-3x', 'realesr-general-x4v3'] as const) {
    const tiles = tilePlan(230, 80, id);
    assert.ok(tiles.length);
    assert.ok(tiles.every(t => t.inputWidth > t.coreWidth));
    assert.ok(tiles.every(t => t.inputHeight > t.coreHeight));
  }
});
