import test from 'node:test';
import assert from 'node:assert/strict';
import { isWorkspaceRoute } from '../src/lib/workspaceRoutes';

test('workspace routing recognizes all three persistent tools', () => {
  assert.equal(isWorkspaceRoute('/'), true);
  assert.equal(isWorkspaceRoute('/compress'), true);
  assert.equal(isWorkspaceRoute('/upscale'), true);
  assert.equal(isWorkspaceRoute('/details'), false);
});
