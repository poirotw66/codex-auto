import * as vscode from 'vscode';
import { ApprovalBridge, BridgeState } from './bridge';
import { readBridgeConfig } from './config';

const section = 'codexAutoApprove';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Codex Auto Approve', { log: true });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = 'codexAutoApprove.toggle';
  status.name = 'Codex Auto Approve';
  status.show();

  let state: BridgeState = 'stopped';
  const updateStatus = (next: BridgeState): void => {
    state = next;
    const enabled = vscode.workspace.getConfiguration(section).get<boolean>('enabled', true);
    const labels: Record<BridgeState, [string, string]> = {
      stopped: ['$(circle-slash) Auto Approve: OFF', 'Click to enable Codex Auto Approve'],
      starting: ['$(sync~spin) Auto Approve', 'Starting the Windows automation bridge…'],
      running: ['$(flame) Auto Approve: ON', 'Matching Codex prompts are approved automatically. Click to disable.'],
      failed: ['$(error) Auto Approve', 'The bridge failed. Automatic restart is disabled; check the log, then toggle to retry.'],
      unsupported: ['$(warning) Auto Approve', 'Codex Auto Approve supports Windows only.']
    };
    const [text, tooltip] = labels[next];
    status.text = text;
    status.tooltip = enabled ? tooltip : labels.stopped[1];
    status.backgroundColor = next === 'running' ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
  };

  const bridge = new ApprovalBridge(context, output, updateStatus);
  const setEnabled = async (enabled: boolean): Promise<void> => {
    await vscode.workspace.getConfiguration(section).update('enabled', enabled, vscode.ConfigurationTarget.Global);
  };
  const sync = (): void => {
    const config = vscode.workspace.getConfiguration(section);
    if (config.get<boolean>('enabled', true)) bridge.start(readBridgeConfig(config));
    else bridge.stop();
  };

  context.subscriptions.push(
    output,
    status,
    bridge,
    vscode.commands.registerCommand('codexAutoApprove.enable', () => setEnabled(true)),
    vscode.commands.registerCommand('codexAutoApprove.disable', () => setEnabled(false)),
    vscode.commands.registerCommand('codexAutoApprove.toggle', () => {
      const enabled = vscode.workspace.getConfiguration(section).get<boolean>('enabled', true);
      return setEnabled(!enabled);
    }),
    vscode.commands.registerCommand('codexAutoApprove.showLogs', () => output.show(true)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(section)) sync();
    })
  );

  sync();
}

export function deactivate(): void {}
