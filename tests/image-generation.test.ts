import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERATION_MODELS, GENERATION_LEVELS, DEFAULT_MODEL_BY_LEVEL,
  generationModel, defaultGenerationConfig, composePrompt,
} from '../src/lib/imageGeneration/catalog';
import {
  BROWSER_MODEL_STATE, browserModelReady, browserModelStatus, runBrowserModel,
} from '../src/lib/imageGeneration/browser';

test('the 7 original image generation models and 3 levels remain in the catalogue', () => {
  assert.deepEqual(GENERATION_LEVELS, ['instant', 'medium', 'high']);
  assert.equal(GENERATION_MODELS.length, 7);
  assert.equal(new Set(GENERATION_MODELS.map(model => model.id)).size, 7);
  for (const level of GENERATION_LEVELS) {
    assert.ok(GENERATION_MODELS.some(model => model.level === level));
  }
  assert.equal(generationModel(DEFAULT_MODEL_BY_LEVEL.instant).id, 'sana-sprint-06b');
  assert.equal(generationModel('sana-sprint-06b').params, '0.6B');
});

test('SANA-Sprint 0.6B is not silently substituted with ordinary Sana 0.6B', () => {
  assert.equal(BROWSER_MODEL_STATE['sana-sprint-06b'].ready, false);
  assert.equal(browserModelReady('sana-sprint-06b'), false);
  assert.match(browserModelStatus('sana-sprint-06b'), /Sprint/);
  assert.equal(browserModelReady('flux2-klein-4b'), true);
  assert.equal(browserModelReady('sana-sprint-16b'), false);
  assert.equal(browserModelReady('z-image-turbo'), false);
});

test('browser router rejects unavailable models before any external request', () => {
  const config = defaultGenerationConfig(generationModel('sana-sprint-06b'));
  assert.throws(() => runBrowserModel({
    modelId: 'sana-sprint-06b', config, seed: 42,
    signal: new AbortController().signal, onState: () => {},
  }), /Sprint/);
});

test('generation prompt composes only user-selected options in order', () => {
  const config = {
    ...defaultGenerationConfig(generationModel('flux2-klein-4b')),
    prompt: 'a night observatory',
    style: 'watercolor',
    camera: 'wide-angle',
    lighting: 'soft light',
  };
  assert.equal(composePrompt(config),
    'a night observatory, watercolor, wide-angle, soft light');
  assert.equal(config.batchSize, 1);
  assert.equal(config.randomSeed, true);
});

test('unknown model identities never substitute a different model', () => {
  assert.throws(() => generationModel('fake-sprint'), /등록되지 않은/);
  assert.equal(browserModelReady('fake-sprint'), false);
});
