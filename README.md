# Codex Auto Approve

Stop babysitting Codex approvals.

This Windows-first VS Code extension watches the local VS Code accessibility tree. When it finds a matching control inside a visible Codex context, it selects **User approach** and invokes the approval button. It does not edit Codex configuration, `approval_policy`, sandbox settings, or another extension's files.

> [!WARNING]
> Auto-approval removes an important safety checkpoint. Only use it in repositories and tasks you trust. The extension starts **on** by default and always shows a warning-colored status item while active. Click the status item at any time to turn it off or on.

## Features

- Explicit Enable, Disable, Toggle, and Show Logs commands
- Status bar state (`OFF`, starting, `ON`, failed, unsupported)
- Exact configurable accessibility labels
- Built-in English, Traditional Chinese, and Simplified Chinese approval labels
- Codex context check enabled by default
- Duplicate-click cooldown
- Event-driven Windows accessibility hooks with a short debounce
- A supervised PowerShell child process that stops cleanly after unexpected failure

## Requirements

- Windows 10 or 11
- VS Code 1.96 or newer
- The OpenAI Codex extension
- Windows accessibility access to the VS Code window

Version 0.1 does not automate macOS or Linux.

## Development

```powershell
npm install
npm test
```

Press `F5` in VS Code to launch an Extension Development Host. Run `Codex Auto Approve: Enable`, open Codex, and inspect the `Codex Auto Approve` output channel.

To create an installable package:

```powershell
npm run package
code --install-extension codex-auto-approve-0.2.4.vsix --force
```

## Settings

- `codexAutoApprove.enabled`: persisted global on/off switch (default `true`)
- `codexAutoApprove.eventDebounce`: delay used to combine bursts of UI events (default `10` ms)
- `codexAutoApprove.pollInterval`: deprecated and ignored by event-driven versions
- `codexAutoApprove.onlyWhenCodexVisible`: require a Codex accessibility marker (default `true`)
- `codexAutoApprove.approachLabels`: exact labels used to select User approach
- `codexAutoApprove.approvalLabels`: exact approval labels
- `codexAutoApprove.codexMarkers`: text fragments identifying the Codex UI
- `codexAutoApprove.cooldown`: duplicate action delay (default `1500` ms)

Accessibility labels may change between Codex releases or localized UI languages. Add the labels shown by your installed build to the arrays above; do not disable the Codex context check unless you accept the risk of matching unrelated VS Code controls.

## Design boundary

VS Code extensions cannot access another extension's webview DOM. This extension therefore uses the supported Windows UI Automation accessibility surface from a local PowerShell bridge. All scanning and clicking stays on the machine.
