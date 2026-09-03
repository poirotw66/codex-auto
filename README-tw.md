# Codex Auto Approve

[English](README.md)

不用再一直手動點 Codex 的核准提示。

**版本 0.2.4** — 僅支援 Windows 的 VS Code 擴充功能。它會監看本機 VS Code 的輔助功能（accessibility）樹；當在可見的 Codex 介面中找到相符控制項時，會先選取 **User approach（使用者方案）**，再觸發核准按鈕。它不會修改 Codex 設定、`approval_policy`、沙箱設定，或其他擴充功能的檔案。

> [!WARNING]
> 自動核准會拿掉重要的安全檢查點。請只在你信任的儲存庫與任務上使用。擴充功能預設為**開啟**，啟用時狀態列會以警告色顯示。隨時可點狀態列項目開關。

## 安裝

1. 建置 VSIX（或直接使用本專案中的 `codex-auto-approve-0.2.4.vsix`）：

```powershell
npm install
npm run package
```

2. 安裝到 VS Code：

```powershell
code --install-extension codex-auto-approve-0.2.4.vsix --force
```

3. 在 Windows 上開啟 VS Code，並安裝 OpenAI Codex 擴充功能。啟動完成後，Auto Approve 預設會自動開啟。

## 系統需求

- Windows 10 或 11
- VS Code 1.96 或更新版本
- OpenAI Codex 擴充功能
- 可存取 VS Code 視窗的 Windows 輔助功能權限

此版本**不支援**自動化 macOS 或 Linux。在那些平台上，狀態列會顯示 `unsupported`。

## 指令

| 指令 | 作用 |
| --- | --- |
| `Codex Auto Approve: Enable` | 開啟 bridge |
| `Codex Auto Approve: Disable` | 關閉 bridge |
| `Codex Auto Approve: Toggle` | 切換開／關（也綁在狀態列項目上） |
| `Codex Auto Approve: Show Logs` | 開啟 `Codex Auto Approve` 輸出頻道 |

## 功能

- 明確的啟用、停用、切換與顯示日誌指令
- 狀態列狀態：`OFF`、啟動中、`ON`、失敗、不支援
- 可設定精確的輔助功能標籤
- 內建英文、繁體中文、簡體中文的方案／核准標籤
- 預設啟用 Codex 情境檢查（`onlyWhenCodexVisible`）
- 重複點擊冷卻時間
- 以事件驅動的 Windows 輔助功能 hook，並有短 debounce（自 0.2.0 起不再輪詢）
- 受監督的 PowerShell 子行程；意外結束後狀態會變成 failed（不會靜默自動重啟 — 請查看日誌後再切換開關）

## 設定

| 設定 | 預設值 | 說明 |
| --- | --- | --- |
| `codexAutoApprove.enabled` | `true` | 全域開／關（會持久化） |
| `codexAutoApprove.eventDebounce` | `10` | 合併連續 UI 事件後再掃描的毫秒數 |
| `codexAutoApprove.pollInterval` | `50` | 已棄用；事件驅動版本（0.2.0+）會忽略 |
| `codexAutoApprove.onlyWhenCodexVisible` | `true` | 核准前必須看到 Codex 輔助功能標記 |
| `codexAutoApprove.approachLabels` | 英／繁／簡標籤 | 用來選取 User approach 的精確標籤 |
| `codexAutoApprove.approvalLabels` | 英／繁／簡標籤 | 核准按鈕的精確標籤 |
| `codexAutoApprove.codexMarkers` | `Codex`、`OpenAI Codex` | 用來辨識 Codex UI 的文字片段（不分大小寫） |
| `codexAutoApprove.cooldown` | `1500` | 同一輔助功能元素再次觸發前的毫秒數 |

輔助功能標籤可能隨 Codex 版本或 UI 語言而變。請把你安裝版本實際顯示的標籤加進上述陣列。除非你願意承擔誤點到其他 VS Code 控制項的風險，否則不要關閉 Codex 情境檢查。

## 開發

```powershell
npm install
npm test
```

在 VS Code 按 `F5` 啟動 Extension Development Host。執行 `Codex Auto Approve: Enable`，開啟 Codex，並查看 `Codex Auto Approve` 輸出頻道。

常用腳本：

- `npm run compile` — 編譯 TypeScript 到 `dist/`
- `npm run watch` — 增量編譯
- `npm run package` — 透過 `@vscode/vsce` 產生 VSIX
- `npm test` — 編譯後執行 `dist/test/` 下的 Node 測試

## 運作方式

VS Code 擴充功能無法存取另一個擴充功能的 webview DOM。因此本專案透過本機 PowerShell bridge（`scripts/codex-auto-approve.ps1`）使用 Windows UI Automation 輔助功能介面，並由 TypeScript 擴充主機（`src/bridge.ts`）監督。所有掃描與點擊都只在本機進行。

流程：

1. 擴充功能啟動後，若已啟用，會帶著 base64 編碼的設定 payload 啟動 PowerShell bridge。
2. Bridge 監聽輔助功能事件、debounce，並掃描 VS Code 視窗樹。
3. 在有 Codex 標記時（若有要求），先選取相符的方案標籤，再觸發相符的核准控制項。
4. `ready`、`selected`、`approved` 等事件會寫入輸出頻道。
