# Auto Approve (Codex & Copilot)

[繁體中文](README-tw.md)

Stop babysitting Codex and GitHub Copilot approvals.

**Version 0.3.3** — a Windows-only VS Code extension that watches the local VS Code accessibility tree. When it finds a matching control inside a visible Codex or Copilot context, it approves the prompt (and for Codex, selects **User approach** first). It does not edit Codex/Copilot configuration, sandbox settings, or another extension's files.

Prebuilt package in this repo: [`codex-auto-approve-0.3.3.vsix`](codex-auto-approve-0.3.3.vsix)

> [!WARNING]
> Auto-approval removes an important safety checkpoint. Only use it in repositories and tasks you trust. The extension starts **on** by default and shows a warning-colored status item while active. Click the status item at any time to turn it off or on.

## Install

1. Use the prebuilt VSIX above, or build one yourself:

```powershell
npm install
npm run package
```

2. Install into VS Code:

```powershell
code --install-extension codex-auto-approve-0.3.3.vsix --force
```

3. Open VS Code on Windows with OpenAI Codex and/or GitHub Copilot installed. Auto Approve starts on by default after startup.

## Requirements

- Windows 10 or 11
- VS Code 1.96 or newer
- OpenAI Codex and/or GitHub Copilot (Chat/Agent)
- Windows accessibility access to the VS Code window

This version does **not** automate macOS or Linux. On those platforms the status bar shows `unsupported`.

## Commands

| Command | Action |
| --- | --- |
| `Auto Approve: Enable` | Turn the master switch on |
| `Auto Approve: Disable` | Turn the master switch off |
| `Auto Approve: Toggle` | Flip the master switch (also bound to the status bar item) |
| `Auto Approve: Show Logs` | Open the `Auto Approve` output channel |

## Features

- Master switch plus independent `codex.enabled` / `copilot.enabled` toggles
- Status bar shows active targets (`Codex`, `Copilot`, or `Codex+Copilot`)
- Copilot coverage: Chat/Agent tool approvals **and** terminal command approvals
- Exact configurable accessibility labels (EN / 繁中 / 简中 defaults)
- Per-provider context checks (`onlyWhenCodexVisible`, `copilot.onlyWhenVisible`)
- Duplicate-click cooldown
- Event-driven Windows accessibility hooks with debounce and a low-frequency safety scan
- Supervised PowerShell child process; unexpected exits leave the status as failed (no silent auto-restart)

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `codexAutoApprove.enabled` | `true` | Master on/off switch |
| `codexAutoApprove.codex.enabled` | `true` | Handle Codex prompts |
| `codexAutoApprove.copilot.enabled` | `true` | Handle Copilot tool + terminal prompts |
| `codexAutoApprove.eventDebounce` | `10` | Milliseconds used to combine bursts of UI events before scanning |
| `codexAutoApprove.idleScanInterval` | `1000` | Low-frequency safety scan interval |
| `codexAutoApprove.pollInterval` | `50` | Deprecated; ignored by event-driven versions (0.2.0+) |
| `codexAutoApprove.onlyWhenCodexVisible` | `true` | Require a Codex accessibility marker |
| `codexAutoApprove.copilot.onlyWhenVisible` | `true` | Require a Copilot accessibility marker |
| `codexAutoApprove.hostProcessNames` | Code / Cursor / … | Host processes to watch |
| `codexAutoApprove.approachLabels` | EN / 繁中 / 简中 | Codex: User approach labels |
| `codexAutoApprove.approvalLabels` | EN / 繁中 / 简中 | Codex: approval button labels |
| `codexAutoApprove.codexMarkers` | `Codex`, `OpenAI Codex` | Codex UI markers |
| `codexAutoApprove.copilot.approvalLabels` | EN / 繁中 / 简中 | Copilot/Cursor Chat, Agent, and permission approval labels (includes `Allow Once`) |
| `codexAutoApprove.copilot.terminalLabels` | EN / 繁中 / 简中 | Copilot/Cursor terminal run labels |
| `codexAutoApprove.copilot.markers` | `Copilot`, `Cursor`, `browser state`, … | Copilot/Cursor permission UI markers |
| `codexAutoApprove.cooldown` | `1500` | Duplicate-action delay |

Accessibility labels may change between Codex/Copilot releases or localized UI languages. Add the labels shown by your installed build to the arrays above. Do not disable provider context checks unless you accept the risk of matching unrelated VS Code controls.

## Development

```powershell
npm install
npm test
```

Press `F5` in VS Code to launch an Extension Development Host. Run `Auto Approve: Enable`, open Codex or Copilot, and inspect the `Auto Approve` output channel.

Useful scripts:

- `npm run compile` — TypeScript build to `dist/`
- `npm run watch` — incremental compile
- `npm run package` — produce a VSIX via `@vscode/vsce`
- `npm test` — compile, then run Node tests under `dist/test/`

## How it works

VS Code extensions cannot access another extension's webview DOM. This project therefore uses the Windows UI Automation accessibility surface from a local PowerShell bridge (`scripts/codex-auto-approve.ps1`), supervised by the TypeScript extension host (`src/bridge.ts`). All scanning and clicking stays on the machine.

Flow:

1. Extension activates and, if the master switch is on and at least one provider is enabled, spawns the PowerShell bridge with a base64-encoded config payload.
2. The bridge listens for accessibility events, debounces them, and scans supported host windows.
3. Matching controls are classified per provider. After the provider's context markers pass, Codex may select an approach label, then approval; Copilot invokes tool/terminal approval labels directly.
4. Events such as `ready`, `selected`, and `approved` (with `provider`) are logged to the output channel.
