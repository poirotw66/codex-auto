# Auto Approve（Codex & Copilot）

[English](README.md)

不用再一直手動點 Codex 與 GitHub Copilot 的核准提示。

**版本 0.3.0** — 僅支援 Windows 的 VS Code 擴充功能。它會監看本機 VS Code 的輔助功能（accessibility）樹；當在可見的 Codex 或 Copilot 介面中找到相符控制項時會自動核准（Codex 會先選 **User approach／使用者方案**）。它不會修改 Codex／Copilot 設定、沙箱設定，或其他擴充功能的檔案。

> [!WARNING]
> 自動核准會拿掉重要的安全檢查點。請只在你信任的儲存庫與任務上使用。擴充功能預設為**開啟**，啟用時狀態列會以警告色顯示。隨時可點狀態列項目開關。

## 安裝

1. 建置 VSIX（或直接使用本專案中的 `codex-auto-approve-0.3.0.vsix`）：

```powershell
npm install
npm run package
```

2. 安裝到 VS Code：

```powershell
code --install-extension codex-auto-approve-0.3.0.vsix --force
```

3. 在 Windows 上開啟 VS Code，並安裝 OpenAI Codex 與／或 GitHub Copilot。啟動完成後，Auto Approve 預設會自動開啟。

## 系統需求

- Windows 10 或 11
- VS Code 1.96 或更新版本
- OpenAI Codex 與／或 GitHub Copilot（Chat／Agent）
- 可存取 VS Code 視窗的 Windows 輔助功能權限

此版本**不支援**自動化 macOS 或 Linux。在那些平台上，狀態列會顯示 `unsupported`。

## 指令

| 指令 | 作用 |
| --- | --- |
| `Auto Approve: Enable` | 開啟總開關 |
| `Auto Approve: Disable` | 關閉總開關 |
| `Auto Approve: Toggle` | 切換總開關（也綁在狀態列項目上） |
| `Auto Approve: Show Logs` | 開啟 `Auto Approve` 輸出頻道 |

## 功能

- 總開關 + 可分別啟用 `codex.enabled`／`copilot.enabled`
- 狀態列顯示作用中目標（`Codex`、`Copilot` 或 `Codex+Copilot`）
- Copilot 涵蓋：Chat／Agent 工具核准 **與** 終端機指令核准
- 可設定精確的輔助功能標籤（內建英／繁／簡）
- 各 provider 獨立情境檢查（`onlyWhenCodexVisible`、`copilot.onlyWhenVisible`）
- 重複點擊冷卻時間
- 事件驅動的 Windows 輔助功能 hook，並有 debounce 與低頻保底掃描
- 受監督的 PowerShell 子行程；意外結束後狀態會變成 failed（不會靜默自動重啟）

## 設定

| 設定 | 預設值 | 說明 |
| --- | --- | --- |
| `codexAutoApprove.enabled` | `true` | 總開關 |
| `codexAutoApprove.codex.enabled` | `true` | 是否處理 Codex |
| `codexAutoApprove.copilot.enabled` | `true` | 是否處理 Copilot 工具＋終端 |
| `codexAutoApprove.eventDebounce` | `10` | 合併連續 UI 事件後再掃描的毫秒數 |
| `codexAutoApprove.idleScanInterval` | `1000` | 低頻保底掃描間隔 |
| `codexAutoApprove.pollInterval` | `50` | 已棄用；事件驅動版本（0.2.0+）會忽略 |
| `codexAutoApprove.onlyWhenCodexVisible` | `true` | Codex 核准前須有情境標記 |
| `codexAutoApprove.copilot.onlyWhenVisible` | `true` | Copilot 核准前須有情境標記 |
| `codexAutoApprove.hostProcessNames` | Code／Cursor／… | 要監看的主機行程 |
| `codexAutoApprove.approachLabels` | 英／繁／簡 | Codex：User approach 標籤 |
| `codexAutoApprove.approvalLabels` | 英／繁／簡 | Codex：核准按鈕標籤 |
| `codexAutoApprove.codexMarkers` | `Codex`、`OpenAI Codex` | Codex UI 標記 |
| `codexAutoApprove.copilot.approvalLabels` | 英／繁／簡 | Copilot Chat／Agent 核准標籤 |
| `codexAutoApprove.copilot.terminalLabels` | 英／繁／簡 | Copilot 終端執行標籤 |
| `codexAutoApprove.copilot.markers` | `Copilot`、`GitHub Copilot`、`Copilot Chat` | Copilot UI 標記 |
| `codexAutoApprove.cooldown` | `1500` | 同一元素再次觸發前的毫秒數 |

輔助功能標籤可能隨 Codex／Copilot 版本或 UI 語言而變。請把你安裝版本實際顯示的標籤加進上述陣列。除非你願意承擔誤點到其他 VS Code 控制項的風險，否則不要關閉 provider 情境檢查。

## 開發

```powershell
npm install
npm test
```

在 VS Code 按 `F5` 啟動 Extension Development Host。執行 `Auto Approve: Enable`，開啟 Codex 或 Copilot，並查看 `Auto Approve` 輸出頻道。

常用腳本：

- `npm run compile` — 編譯 TypeScript 到 `dist/`
- `npm run watch` — 增量編譯
- `npm run package` — 透過 `@vscode/vsce` 產生 VSIX
- `npm test` — 編譯後執行 `dist/test/` 下的 Node 測試

## 運作方式

VS Code 擴充功能無法存取另一個擴充功能的 webview DOM。因此本專案透過本機 PowerShell bridge（`scripts/codex-auto-approve.ps1`）使用 Windows UI Automation 輔助功能介面，並由 TypeScript 擴充主機（`src/bridge.ts`）監督。所有掃描與點擊都只在本機進行。

流程：

1. 擴充功能啟動後，若總開關開啟且至少一個 provider 啟用，會帶著 base64 編碼的設定 payload 啟動 PowerShell bridge。
2. Bridge 監聽輔助功能事件、debounce，並掃描支援的主機視窗。
3. 相符控制項會依 provider 分類；通過該 provider 的情境標記後，Codex 可能先選方案再核准，Copilot 則直接觸發工具／終端核准標籤。
4. `ready`、`selected`、`approved`（含 `provider`）等事件會寫入輸出頻道。
