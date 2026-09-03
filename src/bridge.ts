import { ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { ExtensionContext, OutputChannel } from 'vscode';
import type { BridgeConfig } from './config';

const execFileAsync = promisify(execFile);

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
  private runId = 0;

  constructor(
    private readonly context: ExtensionContext,
    private readonly output: OutputChannel,
    private readonly onState: (state: BridgeState) => void
  ) {}

  start(config: BridgeConfig): void {
    void this.startAsync(config);
  }

  stop(): void {
    void this.stopAsync();
  }

  dispose(): void {
    void this.stopAsync();
  }

  private async startAsync(config: BridgeConfig): Promise<void> {
    const runId = ++this.runId;
    this.stopping = false;
    await this.terminateCurrentChild();
    if (runId !== this.runId || this.stopping) return;

    if (process.platform !== 'win32') {
      this.output.appendLine('[bridge] Windows is required for this release.');
      this.onState('unsupported');
      return;
    }

    const script = join(this.context.extensionPath, 'scripts', 'codex-auto-approve.ps1');
    if (!existsSync(script)) {
      this.output.appendLine(`[bridge] Missing automation script: ${script}`);
      this.onState('failed');
      return;
    }

    this.stdoutBuffer = '';
    this.onState('starting');

    const storageRoot = this.context.globalStorageUri.fsPath;
    mkdirSync(storageRoot, { recursive: true });
    const assemblyPath = join(storageRoot, 'CodexUiSignal.dll');

    const payload = Buffer.from(JSON.stringify(config), 'utf8').toString('base64');
    const child = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ConfigBase64', payload],
      {
        windowsHide: true,
        env: {
          ...process.env,
          CODEX_AUTO_APPROVE_ASSEMBLY: assemblyPath
        }
      }
    );
    if (runId !== this.runId || this.stopping) {
      await this.terminateProcess(child);
      return;
    }
    this.child = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.consumeStdout(chunk));
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) this.output.appendLine(`[bridge stderr] ${line}`);
    });
    child.once('spawn', () => {
      if (this.child === child && runId === this.runId) this.onState('running');
    });
    child.once('error', (error) => {
      if (this.child !== child || runId !== this.runId) return;
      this.output.appendLine(`[bridge] Could not start: ${error.message}`);
      this.onState('failed');
    });
    child.once('exit', (code, signal) => {
      if (this.child !== child) return;
      this.child = undefined;
      if (this.stopping || runId !== this.runId) {
        this.onState('stopped');
        return;
      }
      this.output.appendLine(`[bridge] Exited unexpectedly (code=${code ?? 'null'}, signal=${signal ?? 'null'}). Automatic restart is disabled; toggle the extension after checking the log.`);
      this.onState('failed');
    });
  }

  private async stopAsync(): Promise<void> {
    this.runId += 1;
    this.stopping = true;
    await this.terminateCurrentChild();
    this.onState('stopped');
  }

  private async terminateCurrentChild(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (!child) return;
    await this.terminateProcess(child);
  }

  private async terminateProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
    if (!child.pid) {
      if (!child.killed) child.kill();
      return;
    }

    const exited = new Promise<void>((resolve) => {
      if (child.exitCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
    });

    try {
      await execFileAsync('taskkill', ['/PID', String(child.pid), '/T'], { windowsHide: true });
    } catch {
      // Process may already be gone.
    }

    const finishedGracefully = await Promise.race([
      exited.then(() => true),
      sleep(2000).then(() => false)
    ]);
    if (finishedGracefully) return;

    try {
      await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } catch {
      if (!child.killed) child.kill();
    }

    await Promise.race([exited, sleep(1000)]);
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

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
