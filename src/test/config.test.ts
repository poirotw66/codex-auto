import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceConfiguration } from 'vscode';
import { DEFAULT_HOST_PROCESS_NAMES, formatActiveProviders, readBridgeConfig } from '../config';

function fakeConfig(values: Record<string, unknown>): WorkspaceConfiguration {
  return {
    get: <T>(key: string, fallback?: T) => (key in values ? values[key] : fallback) as T,
    has: (key: string) => key in values,
    inspect: () => undefined,
    update: async () => undefined
  } as WorkspaceConfiguration;
}

test('normalizes bridge configuration with both providers', () => {
  const result = readBridgeConfig(fakeConfig({
    eventDebounce: 500,
    idleScanInterval: 50,
    cooldown: 90000,
    approachLabels: [' User approach ', '', 'User approach'],
    approvalLabels: [],
    hostProcessNames: [' Cursor ', 'Code'],
    codexMarkers: [' Codex ']
  }), 4242);

  assert.equal(result.eventDebounce, 200);
  assert.equal(result.idleScanInterval, 250);
  assert.equal(result.cooldown, 30000);
  assert.equal(result.parentPid, 4242);
  assert.deepEqual(result.hostProcessNames, ['Cursor', 'Code']);
  assert.equal(result.providers.length, 2);

  const codex = result.providers.find((provider) => provider.id === 'codex');
  assert.ok(codex);
  assert.deepEqual(codex.approachLabels, ['User approach']);
  assert.ok(codex.approvalLabels.includes('Allow once'));
  assert.ok(codex.approvalLabels.includes('允許一次'));
  assert.ok(codex.highConfidenceLabels.includes('允許一次'));
  assert.deepEqual(codex.markers, ['Codex']);
  assert.equal(codex.requireContext, true);

  const copilot = result.providers.find((provider) => provider.id === 'copilot');
  assert.ok(copilot);
  assert.deepEqual(copilot.approachLabels, []);
  assert.ok(copilot.approvalLabels.includes('Allow in this session'));
  assert.ok(copilot.approvalLabels.includes('Allow Once'));
  assert.ok(copilot.approvalLabels.includes('允許一次'));
  assert.ok(copilot.approvalLabels.includes('Run command'));
  assert.ok(copilot.approvalLabels.includes('繼續'));
  assert.ok(copilot.highConfidenceLabels.includes('Allow Once'));
  assert.ok(copilot.markers.includes('GitHub Copilot'));
  assert.ok(copilot.markers.includes('browser state'));
  assert.ok(copilot.markers.includes('Cursor'));
  assert.equal(formatActiveProviders(result.providers), 'Codex+Copilot');
});

test('uses default host process names when unset', () => {
  const result = readBridgeConfig(fakeConfig({}));
  assert.deepEqual(result.hostProcessNames, [...DEFAULT_HOST_PROCESS_NAMES]);
  assert.equal(result.idleScanInterval, 1000);
  assert.equal(result.parentPid, process.pid);
});

test('filters disabled providers', () => {
  const onlyCopilot = readBridgeConfig(fakeConfig({
    'codex.enabled': false,
    'copilot.enabled': true
  }));
  assert.deepEqual(onlyCopilot.providers.map((provider) => provider.id), ['copilot']);
  assert.equal(formatActiveProviders(onlyCopilot.providers), 'Copilot');

  const none = readBridgeConfig(fakeConfig({
    'codex.enabled': false,
    'copilot.enabled': false
  }));
  assert.deepEqual(none.providers, []);
  assert.equal(formatActiveProviders(none.providers), 'none');
});

test('maps legacy Codex label settings onto the Codex provider', () => {
  const result = readBridgeConfig(fakeConfig({
    'copilot.enabled': false,
    approachLabels: ['Custom approach'],
    approvalLabels: ['Custom allow'],
    onlyWhenCodexVisible: false
  }));

  assert.equal(result.providers.length, 1);
  assert.equal(result.providers[0]?.id, 'codex');
  assert.deepEqual(result.providers[0]?.approachLabels, ['Custom approach']);
  assert.deepEqual(result.providers[0]?.approvalLabels, ['Custom allow']);
  assert.equal(result.providers[0]?.requireContext, false);
});
