import test from 'node:test';
import assert from 'node:assert/strict';
import { makeUpscaleJobSnapshot, UpscaleExecutionTrace } from '../src/lib/upscalers/executionTrace';
import { snapshotQueueTask, assertJobResultAssociation } from '../src/lib/queueIdentity';

function imageTask(model = 'esrgan-slim-2x') {
  return {
    id: 'job-1', file: { name: 'source.png' }, type: 'image', mode: 'upscale',
    model, upscaleTier: 'standard', upscalePurpose: '실사', videoMethod: 'ai',
  } as any;
}
function videoTask(method: 'ai' | 'filter') {
  return {
    id: 'job-2', file: { name: 'sample.mp4' }, type: 'video', mode: 'upscale',
    model: 'quicksrnet-small-4x', upscaleTier: 'nano',
    upscalePurpose: '동영상', videoMethod: method,
  } as any;
}

test('immutable job snapshot survives changed UI task object', () => {
  const task = imageTask();
  const snapshot = makeUpscaleJobSnapshot(task);
  task.model = 'purephoto-span-4x';
  task.upscaleTier = 'standard';
  assert.equal(snapshot.requestedModelId, 'esrgan-slim-2x');
  assert.ok(Object.isFrozen(snapshot));
});

test('engine identity mismatch never silently falls back', () => {
  const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(imageTask()));
  assert.throws(() => trace.recordInference('purephoto-span-4x', 'onnx-wasm', '/models/purephoto.onnx'), /실제 실행한 모델/);
});

test('AI job without model inference cannot be published as complete', async () => {
  const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(imageTask()));
  await assert.rejects(trace.finish(new Blob(['input']), new Blob(['output'])), /추론 수행 기록/);
});

test('video AI must encode every inferred frame', async () => {
  const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(videoTask('ai')));
  trace.recordInference('quicksrnet-small-4x', 'onnx-wasm', '/models/q.onnx');
  trace.recordInferredFrame();
  trace.recordEncodedFrames(2);
  await assert.rejects(trace.finish(new Blob(['in']), new Blob(['out'])), /프레임 수/);
});

test('video filter evidence explicitly states no model was used', async () => {
  const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(videoTask('filter')));
  trace.recordFilter();
  const evidence = await trace.finish(new Blob(['in']), new Blob(['out']));
  assert.equal(evidence.effectiveModelId, null);
  assert.equal(evidence.inferenceCalls, 0);
  assert.equal(evidence.engine, 'ffmpeg-filter');
  assert.equal(evidence.jobId, 'job-2');
});

test('successful image evidence comes from the actual executed backend', async () => {
  const trace = new UpscaleExecutionTrace(makeUpscaleJobSnapshot(imageTask()));
  trace.recordInference('esrgan-slim-2x', 'tfjs-webgl', '@upscalerjs/esrgan-slim');
  const evidence = await trace.finish(new Blob(['in']), new Blob(['out']));
  assert.equal(evidence.effectiveModelId, 'esrgan-slim-2x');
  assert.equal(evidence.inferenceCalls, 1);
  assert.equal(evidence.cacheHit, false);
});


test('pending queue task object remains stable when UI updates the original', () => {
  const task = imageTask();
  const queued = snapshotQueueTask(task);
  task.model = 'purephoto-span-4x';
  assert.equal(queued.model, 'esrgan-slim-2x');
  assert.ok(Object.isFrozen(queued));
});

test('download evidence cannot be associated with another job ID', () => {
  assert.doesNotThrow(() => assertJobResultAssociation('job-one', undefined));
  assert.doesNotThrow(() => assertJobResultAssociation('job-one',
    { jobId: 'job-one' } as any));
  assert.throws(() => assertJobResultAssociation('job-two',
    { jobId: 'job-one' } as any), /작업 ID/);
});
