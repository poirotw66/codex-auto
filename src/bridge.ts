import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionContext, OutputChannel } from 'vscode';
import type { BridgeConfig } from './config';

export type BridgeState = 'stopped' | 'starting' | 'running' | 'failed' | 'unsupported';

interface BridgeEvent {
  type?: string;
  message?: string;
  label?: string;
  pid?: number;
}

export class ApprovalBridge {
  private child: ChildProcessWithoutNullStreams | undefined;
  private stopping = false;
  private stdoutBuffer = '';

  constructor(
    private readonly context: ExtensionContext,
    private readonly output: OutputChannel,
    private readonly onState: (state: BridgeState) => void
  ) {}

  start(config: BridgeConfig): void {
    this.stop();

    if (process.platform !== 'win32') {
      this.output.appendLine('[bridge] Windows is required for v0.1.');
      this.onState('unsupported');
      return;
    }

    const script = join(this.context.extensionPath, 'scripts', 'codex-auto-approve.ps1');
    if (!existsSync(script)) {
      this.output.appendLine(`[bridge] Missing automation script: ${script}`);
      this.onState('failed');
      return;
    }

    this.stopping = false;
    this.stdoutBuffer = '';
    this.onState('starting');
    const payload = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ConfigBase64', payload],
      { windowsHide: true }
    );
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consumeStdout(chunk));
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) this.output.appendLine(`[bridge stderr] ${line}`);
    });
    child.once('spawn', () => {
      if (this.child === child) this.onState('running');
    });
    child.once('error', (error) => {
      if (this.child !== child) return;
      this.output.appendLine(`[bridge] Could not start: ${error.message}`);
      this.onState('failed');
    });
    child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = undefined;
      if (this.stopping) {
        this.onState('stopped');
        return;
      }
      this.output.appendLine(`[bridge] Exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Automatic restart is disabled; toggle the extension after checking the log.`);
      this.onState('failed');
    });
  }

  stop(): void {
    this.stopping = true;
    const child = this.child;
    this.child = undefined;
    if (child && !child.killed) child.kill();
    this.onState('stopped');
  }

  dispose(): void {
    this.stop();
  }

  private consumeStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) this.handleLine(line);
  }

  private handleLine(line: string): void {
    if (!line.trim()) return;
    try {
      const event = JSON.parse(line) as BridgeEvent;
      const timestamp = new Date().toLocaleTimeString();
      if (event.type === 'approved') {
        this.output.appendLine(`${timestamp} Approved: ${event.label ?? 'unknown control'}`);
      } else if (event.type === 'selected') {
        this.output.appendLine(`${timestamp} Selected: ${event.label ?? 'User approach'}`);
      } else if (event.type === 'ready') {
        this.output.appendLine(`[bridge] Ready (PID ${event.pid ?? '?'})`);
      } else {
        this.output.appendLine(`[bridge] ${event.message ?? line}`);
      }
    } catch {
      this.output.appendLine(`[bridge] ${line}`);
    }
  }
}
