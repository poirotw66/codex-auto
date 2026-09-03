import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceConfiguration } from 'vscode';
import { readBridgeConfig } from '../config';

function fakeConfig(values: Record<string, unknown>): WorkspaceConfiguration {
  return {
    get: <T>(key: string, fallback?: T) => (key in values ? values[key] : fallback) as T,
    has: (key: string) => key in values,
    inspect: () => undefined,
    update: async () => undefined
  } as WorkspaceConfiguration;
}

test('normalizes bridge configuration', () => {
  const result = readBridgeConfig(fakeConfig({
    eventDebounce: 500,
    cooldown: 90000,
    approachLabels: [' User approach ', '', 'User approach'],
    approvalLabels: [],
    codexMarkers: [' Codex ']
  }));

  assert.equal(result.eventDebounce, 200);
  assert.equal(result.cooldown, 30000);
  assert.deepEqual(result.approachLabels, ['User approach']);
  assert.ok(result.approvalLabels.includes('Allow once'));
  assert.ok(result.approvalLabels.includes('允許一次'));
  assert.ok(result.approvalLabels.includes('允许一次'));
  assert.ok(result.highConfidenceLabels.includes('允許一次'));
  assert.deepEqual(result.codexMarkers, ['Codex']);
});
