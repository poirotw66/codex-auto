import type { WorkspaceConfiguration } from 'vscode';

export interface BridgeConfig {
  eventDebounce: number;
  onlyWhenCodexVisible: boolean;
  approachLabels: string[];
  approvalLabels: string[];
  highConfidenceLabels: string[];
  codexMarkers: string[];
  cooldown: number;
}

function cleanLabels(value: readonly string[], fallback: readonly string[]): string[] {
  const labels = value.map((item) => item.trim()).filter(Boolean);
  return labels.length > 0 ? [...new Set(labels)] : [...fallback];
}

export function readBridgeConfig(config: WorkspaceConfiguration): BridgeConfig {
  return {
    eventDebounce: Math.max(0, Math.min(200, config.get<number>('eventDebounce', 10))),
    onlyWhenCodexVisible: config.get<boolean>('onlyWhenCodexVisible', true),
    approachLabels: cleanLabels(config.get<string[]>('approachLabels', []), [
      'User approach',
      'Use user approach',
      '使用者方案',
      '使用者方法',
      '使用者做法',
      '用户方案',
      '用户方法',
      '用户做法'
    ]),
    approvalLabels: cleanLabels(config.get<string[]>('approvalLabels', []), [
      'Allow once',
      'Allow',
      'Approve',
      'Agree',
      'Confirm',
      'Yes, proceed',
      'Use this approach',
      '允許一次',
      '允許',
      '核准',
      '同意',
      '確認',
      '是，繼續',
      '使用此方案',
      '使用這個方案',
      '允许一次',
      '允许',
      '批准',
      '同意',
      '确认',
      '是，继续',
      '使用此方案',
      '使用这个方案'
    ]),
    highConfidenceLabels: [
      'Allow once',
      'Yes, proceed',
      'Use this approach',
      '允許一次',
      '是，繼續',
      '使用此方案',
      '使用這個方案',
      '允许一次',
      '是，继续',
      '使用此方案',
      '使用这个方案'
    ],
    codexMarkers: cleanLabels(config.get<string[]>('codexMarkers', []), ['Codex', 'OpenAI Codex']),
    cooldown: Math.max(250, Math.min(30000, config.get<number>('cooldown', 1500)))
  };
}
