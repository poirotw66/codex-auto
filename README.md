# Codex Auto Approve

[繁體中文](README-tw.md)

Stop babysitting Codex approvals.

**Version 0.2.4** — a Windows-only VS Code extension that watches the local VS Code accessibility tree. When it finds a matching control inside a visible Codex context, it selects **User approach** and invokes the approval button. It does not edit Codex configuration, `approval_policy`, sandbox settings, or another extension's files.

> [!WARNING]
> Auto-approval removes an important safety checkpoint. Only use it in repositories and tasks you trust. The extension starts **on** by default and shows a warning-colored status item while active. Click the status item at any time to turn it off or on.

## Install

1. Build a VSIX (or use the packaged `codex-auto-approve-0.2.4.vsix` in this repo):

```powershell
npm install
npm run package
```

2. Install into VS Code:

```powershell
code --install-extension codex-auto-approve-0.2.4.vsix --force
```

3. Open VS Code on Windows with the OpenAI Codex extension installed. Auto Approve starts on by default after startup.

## Requirements

- Windows 10 or 11
- VS Code 1.96 or newer
- The OpenAI Codex extension
- Windows accessibility access to the VS Code window

This version does **not** automate macOS or Linux. On those platforms the status bar shows `unsupported`.

## Commands

| Command | Action |
| --- | --- |
| `Codex Auto Approve: Enable` | Turn the bridge on |
| `Codex Auto Approve: Disable` | Turn the bridge off |
| `Codex Auto Approve: Toggle` | Flip on/off (also bound to the status bar item) |
| `Codex Auto Approve: Show Logs` | Open the `Codex Auto Approve` output channel |

## Features

- Explicit Enable, Disable, Toggle, and Show Logs commands
- Status bar states: `OFF`, starting, `ON`, failed, unsupported
- Exact configurable accessibility labels
- Built-in English, Traditional Chinese, and Simplified Chinese approach/approval labels
- Codex context check enabled by default (`onlyWhenCodexVisible`)
- Duplicate-click cooldown
- Event-driven Windows accessibility hooks with a short debounce (no polling since 0.2.0)
- Supervised PowerShell child process; unexpected exits leave the status as failed (no silent auto-restart — toggle after checking the log)

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codexAutoApprove.enabled` | `true` | Persisted global on/off switch |
| `codexAutoApprove.eventDebounce` | `10` | Milliseconds used to combine bursts of UI events before scanning |
| `codexAutoApprove.pollInterval` | `50` | Deprecated; ignored by event-driven versions (0.2.0+) |
| `codexAutoApprove.onlyWhenCodexVisible` | `true` | Require a Codex accessibility marker before approving |
| `codexAutoApprove.approachLabels` | EN / 繁中 / 简中 labels | Exact labels used to select User approach |
| `codexAutoApprove.approvalLabels` | EN / 繁中 / 简中 labels | Exact approval button labels |
| `codexAutoApprove.codexMarkers` | `Codex`, `OpenAI Codex` | Case-insensitive text fragments identifying the Codex UI |
| `codexAutoApprove.cooldown` | `1500` | Milliseconds before the same accessibility element may be triggered again |

Accessibility labels may change between Codex releases or localized UI languages. Add the labels shown by your installed build to the arrays above. Do not disable the Codex context check unless you accept the risk of matching unrelated VS Code controls.

## Development

```powershell
npm install
npm test
```

Press `F5` in VS Code to launch an Extension Development Host. Run `Codex Auto Approve: Enable`, open Codex, and inspect the `Codex Auto Approve` output channel.

Useful scripts:

- `npm run compile` — TypeScript build to `dist/`
- `npm run watch` — incremental compile
- `npm run package` — produce a VSIX via `@vscode/vsce`
- `npm test` — compile, then run Node tests under `dist/test/`

## How it works

VS Code extensions cannot access another extension's webview DOM. This project therefore uses the Windows UI Automation accessibility surface from a local PowerShell bridge (`scripts/codex-auto-approve.ps1`), supervised by the TypeScript extension host (`src/bridge.ts`). All scanning and clicking stays on the machine.

Flow:

1. Extension activates and, if enabled, spawns the PowerShell bridge with a base64-encoded config payload.
2. The bridge listens for accessibility events, debounces them, and scans the VS Code window tree.
3. When a Codex marker is present (if required), it selects a matching approach label, then invokes a matching approval control.
4. Events such as `ready`, `selected`, and `approved` are logged to the output channel.
