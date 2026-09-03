import type { WorkspaceConfiguration } from 'vscode';

export const DEFAULT_HOST_PROCESS_NAMES = [
  'Code',
  'Code - Insiders',
  'VSCodium',
  'Cursor',
  'Cursor Helper',
  'Windsurf',
  'code-oss'
] as const;

export type ProviderId = 'codex' | 'copilot';

export interface ApprovalProvider {
  id: ProviderId;
  requireContext: boolean;
  approachLabels: string[];
  approvalLabels: string[];
  highConfidenceLabels: string[];
  markers: string[];
}

export interface BridgeConfig {
  eventDebounce: number;
  idleScanInterval: number;
  hostProcessNames: string[];
  cooldown: number;
  parentPid: number;
  providers: ApprovalProvider[];
}

const DEFAULT_CODEX_APPROACH_LABELS = [
  'User approach',
  'Use user approach',
  '使用者方案',
  '使用者方法',
  '使用者做法',
  '用户方案',
  '用户方法',
  '用户做法'
] as const;

const DEFAULT_CODEX_APPROVAL_LABELS = [
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
] as const;

const DEFAULT_CODEX_HIGH_CONFIDENCE_LABELS = [
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
] as const;

const DEFAULT_COPILOT_APPROVAL_LABELS = [
  'Allow',
  'Allow in this session',
  'Continue',
  'Confirm',
  'Accept',
  'Approve',
  '允許',
  '允許在此工作階段',
  '允許在此工作階段中',
  '繼續',
  '確認',
  '接受',
  '核准',
  '允许',
  '允许在此会话',
  '允许在此会话中',
  '继续',
  '确认',
  '接受',
  '批准'
] as const;

const DEFAULT_COPILOT_TERMINAL_LABELS = [
  'Run',
  'Run command',
  'Run in terminal',
  '執行',
  '執行命令',
  '在終端機中執行',
  '运行',
  '运行命令',
  '在终端中运行'
] as const;

const DEFAULT_COPILOT_HIGH_CONFIDENCE_LABELS = [
  'Allow in this session',
  'Continue',
  'Run command',
  'Run in terminal',
  '允許在此工作階段',
  '允許在此工作階段中',
  '繼續',
  '執行命令',
  '在終端機中執行',
  '允许在此会话',
  '允许在此会话中',
  '继续',
  '运行命令',
  '在终端中运行'
] as const;

function cleanLabels(value: readonly string[], fallback: readonly string[]): string[] {
  const labels = value.map((item) => item.trim()).filter(Boolean);
  return labels.length > 0 ? [...new Set(labels)] : [...fallback];
}

function mergeUnique(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flatMap((group) => group.map((item) => item.trim()).filter(Boolean)))];
}

export function formatActiveProviders(providers: readonly ApprovalProvider[]): string {
  if (providers.length === 0) return 'none';
  return providers.map((provider) => (provider.id === 'codex' ? 'Codex' : 'Copilot')).join('+');
}

export function readBridgeConfig(
  config: WorkspaceConfiguration,
  parentPid: number = process.pid
): BridgeConfig {
  const providers: ApprovalProvider[] = [];

  if (config.get<boolean>('codex.enabled', true)) {
    providers.push({
      id: 'codex',
      requireContext: config.get<boolean>('onlyWhenCodexVisible', true),
      approachLabels: cleanLabels(config.get<string[]>('approachLabels', []), DEFAULT_CODEX_APPROACH_LABELS),
      approvalLabels: cleanLabels(config.get<string[]>('approvalLabels', []), DEFAULT_CODEX_APPROVAL_LABELS),
      highConfidenceLabels: [...DEFAULT_CODEX_HIGH_CONFIDENCE_LABELS],
      markers: cleanLabels(config.get<string[]>('codexMarkers', []), ['Codex', 'OpenAI Codex'])
    });
  }

  if (config.get<boolean>('copilot.enabled', true)) {
    const approvalLabels = cleanLabels(
      config.get<string[]>('copilot.approvalLabels', []),
      DEFAULT_COPILOT_APPROVAL_LABELS
    );
    const terminalLabels = cleanLabels(
      config.get<string[]>('copilot.terminalLabels', []),
      DEFAULT_COPILOT_TERMINAL_LABELS
    );
    providers.push({
      id: 'copilot',
      requireContext: config.get<boolean>('copilot.onlyWhenVisible', true),
      approachLabels: [],
      approvalLabels: mergeUnique(approvalLabels, terminalLabels),
      highConfidenceLabels: [...DEFAULT_COPILOT_HIGH_CONFIDENCE_LABELS],
      markers: cleanLabels(config.get<string[]>('copilot.markers', []), [
        'Copilot',
        'GitHub Copilot',
        'Copilot Chat'
      ])
    });
  }

  return {
    eventDebounce: Math.max(0, Math.min(200, config.get<number>('eventDebounce', 10))),
    idleScanInterval: Math.max(250, Math.min(5000, config.get<number>('idleScanInterval', 1000))),
    hostProcessNames: cleanLabels(
      config.get<string[]>('hostProcessNames', []),
      DEFAULT_HOST_PROCESS_NAMES
    ),
    cooldown: Math.max(250, Math.min(30000, config.get<number>('cooldown', 1500))),
    parentPid,
    providers
  };
}
