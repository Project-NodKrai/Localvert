import test from 'node:test';
import assert from 'node:assert/strict';
import { ONNX_MODEL_PROFILES, tilePlan, validateTensorShape, isOnnxModelId } from '../src/lib/upscalers/onnxProfiles';

test('new ONNX models have distinct pinned sources and explicit contracts', () => {
  const models = Object.values(ONNX_MODEL_PROFILES);
  assert.equal(models.length, 20);
  assert.equal(new Set(models.map(m => m.source)).size, models.length);
  for (const model of models) {
    assert.ok(model.scale === 2 || model.scale === 4);
    assert.ok(model.core >= 32);
    assert.ok(model.pad >= 8);
    assert.ok(model.source.startsWith('/models/'));
    assert.ok(['BSD-3-Clause', 'Apache-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'MIT'].includes(model.license));
    if (model.externalData) assert.ok(model.externalData.endsWith('.data'));
  }
  assert.equal(isOnnxModelId('esrgan-slim-2x'), false);
  assert.equal(isOnnxModelId('quicksrnet-small-4x'), true);
});

test('fixed-size mobile models generate 128x128 inputs including final partial tiles', () => {
  const tiles = tilePlan(257, 129, 'quicksrnet-small-4x');
  assert.equal(tiles.length, 6);
  assert.equal(tiles[0].inputWidth, 128);
  assert.equal(tiles[0].inputHeight, 128);
  assert.equal(tiles.at(-1)?.coreWidth, 49);
  assert.equal(tiles.at(-1)?.coreHeight, 25);
});

test('dynamic-shape ONNX models process short edges at their actual dimensions', () => {
  const tiles = tilePlan(70, 55, 'realesr-animevideov3');
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].inputWidth, 88);
  assert.equal(tiles[0].inputHeight, 79);
  assert.equal(tiles[1].inputWidth, 30);
  assert.equal(tiles[1].coreWidth, 6);
});

test('output tensor layout is validated before any canvas output is reported', () => {
  const tile = tilePlan(48, 48, 'realesr-animevideov3')[0];
  const h = tile.inputHeight * 4;
  const w = tile.inputWidth * 4;
  assert.equal(validateTensorShape([1,3,h,w], tile, 4), 'chw');
  assert.equal(validateTensorShape([1,h,w,3], tile, 4), 'hwc');
  assert.throws(() => validateTensorShape([1,1,h,w], tile, 4), /출력 텐서/);
});

test('Real-CUGAN x2 includes one extra output border pixel on each side', () => {
  const tile = tilePlan(5, 3, 'realcugan-hfa2k-2x')[0];
  const width = tile.inputWidth * 2 + 2;
  const height = tile.inputHeight * 2 + 2;
  assert.equal(validateTensorShape([1, 3, height, width], tile, 2, 1), 'chw');
  assert.throws(() => validateTensorShape([1, 3, height, width], tile, 2), /dims=/);
});

test('lightweight SPAN photo and animation profiles have actual ONNX output contracts', () => {
  for (const id of ['nomosuni-span-2x', 'modernspanimation-2x'] as const) {
    const plan = tilePlan(35, 19, id);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].inputWidth, 51);
    assert.equal(plan[0].inputHeight, 35);
    assert.equal(validateTensorShape([1, 3, 70, 102], plan[0], 2), 'chw');
  }
});

test('SPAN/MoSR 4x profiles use separate RGB input/output contracts', () => {
  for (const id of ['purephoto-span-4x', 'nomos2-hq-mosr-4x'] as const) {
    const [tile] = tilePlan(5, 3, id);
    assert.ok(tile.inputWidth >= 24);
    assert.equal(validateTensorShape([1, 3, tile.inputHeight * 4, tile.inputWidth * 4], tile, 4), 'chw');
  }
});
