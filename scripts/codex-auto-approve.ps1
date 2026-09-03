param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigBase64
)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$OutputEncoding = [Console]::OutputEncoding
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$eventBridgeSource = @'
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

public static class CodexUiSignal
{
    private const uint EventObjectCreate = 0x8000;
    private const uint EventObjectNameChange = 0x800C;
    private const uint WineventOutOfContext = 0x0000;
    private const uint WineventSkipOwnProcess = 0x0002;
    private const uint WmQuit = 0x0012;

    private delegate void WinEventDelegate(
        IntPtr hook,
        uint eventType,
        IntPtr window,
        int objectId,
        int childId,
        uint eventThread,
        uint eventTime
    );

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        public IntPtr Window;
        public uint Id;
        public UIntPtr WParam;
        public IntPtr LParam;
        public uint Time;
        public Point Cursor;
        public uint Private;
    }

    private static readonly AutoResetEvent Changed = new AutoResetEvent(false);
    private static readonly Timer DebounceTimer = new Timer(OnTimer, null, Timeout.Infinite, Timeout.Infinite);
    private static readonly WinEventDelegate Callback = OnWinEvent;
    private static readonly ManualResetEvent HookReady = new ManualResetEvent(false);
    private static readonly ConcurrentDictionary<uint, string> ProcessNameCache =
        new ConcurrentDictionary<uint, string>();
    private static HashSet<string> allowedProcessNames = DefaultProcessNames();
    private static IntPtr eventHook = IntPtr.Zero;
    private static Thread hookThread;
    private static uint hookThreadId;
    private static int hookError;
    private static int debounceMilliseconds = 10;
    private static int pending;
    private static int started;
    private static int lastCacheClearTicks = Environment.TickCount;

    private static HashSet<string> DefaultProcessNames()
    {
        return new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "Code",
            "Code - Insiders",
            "VSCodium",
            "Cursor",
            "Cursor Helper",
            "Windsurf",
            "code-oss"
        };
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWinEventHook(
        uint eventMin,
        uint eventMax,
        IntPtr eventHookModule,
        WinEventDelegate callback,
        uint processId,
        uint threadId,
        uint flags
    );

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWinEvent(IntPtr hook);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    private static extern int GetMessage(out Message message, IntPtr window, uint filterMin, uint filterMax);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TranslateMessage(ref Message message);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref Message message);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PostThreadMessage(uint threadId, uint message, UIntPtr wParam, IntPtr lParam);

    public static void SetProcessNames(string[] names)
    {
        if (names == null || names.Length == 0) return;
        allowedProcessNames = new HashSet<string>(names, StringComparer.OrdinalIgnoreCase);
        ProcessNameCache.Clear();
    }

    public static void Start(int debounce)
    {
        if (Interlocked.Exchange(ref started, 1) == 1) return;
        debounceMilliseconds = Math.Max(0, Math.Min(200, debounce));
        hookError = 0;
        HookReady.Reset();
        hookThread = new Thread(HookThreadMain);
        hookThread.IsBackground = true;
        hookThread.Name = "Codex Auto Approve WinEvent";
        hookThread.SetApartmentState(ApartmentState.STA);
        hookThread.Start();
        if (!HookReady.WaitOne(3000))
        {
            Interlocked.Exchange(ref started, 0);
            throw new TimeoutException("WinEvent hook thread did not start within 3 seconds");
        }
        if (hookError != 0)
        {
            Interlocked.Exchange(ref started, 0);
            throw new Win32Exception(hookError, "SetWinEventHook failed");
        }
        Changed.Set();
    }

    public static bool Wait(int timeoutMilliseconds)
    {
        return Changed.WaitOne(timeoutMilliseconds);
    }

    public static void Stop()
    {
        if (Interlocked.Exchange(ref started, 0) == 0) return;
        if (hookThreadId != 0)
        {
            PostThreadMessage(hookThreadId, WmQuit, UIntPtr.Zero, IntPtr.Zero);
        }
        if (hookThread != null) hookThread.Join(2000);
        hookThread = null;
        hookThreadId = 0;
        DebounceTimer.Change(Timeout.Infinite, Timeout.Infinite);
        Interlocked.Exchange(ref pending, 0);
        ProcessNameCache.Clear();
    }

    private static void HookThreadMain()
    {
        hookThreadId = GetCurrentThreadId();
        eventHook = SetWinEventHook(
            EventObjectCreate,
            EventObjectNameChange,
            IntPtr.Zero,
            Callback,
            0,
            0,
            WineventOutOfContext | WineventSkipOwnProcess
        );
        if (eventHook == IntPtr.Zero) hookError = Marshal.GetLastWin32Error();
        HookReady.Set();
        if (eventHook == IntPtr.Zero) return;

        Message message;
        while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0)
        {
            TranslateMessage(ref message);
            DispatchMessage(ref message);
        }
        UnhookWinEvent(eventHook);
        eventHook = IntPtr.Zero;
    }

    private static void MaybeClearProcessNameCache()
    {
        int now = Environment.TickCount;
        if (unchecked(now - lastCacheClearTicks) < 60000) return;
        lastCacheClearTicks = now;
        ProcessNameCache.Clear();
    }

    private static bool IsAllowedHostProcess(uint processId)
    {
        MaybeClearProcessNameCache();

        string processName;
        if (!ProcessNameCache.TryGetValue(processId, out processName))
        {
            try
            {
                processName = Process.GetProcessById((int)processId).ProcessName;
            }
            catch
            {
                return false;
            }
            ProcessNameCache[processId] = processName;
        }

        return allowedProcessNames.Contains(processName);
    }

    private static void OnWinEvent(
        IntPtr hook,
        uint eventType,
        IntPtr window,
        int objectId,
        int childId,
        uint eventThread,
        uint eventTime
    )
    {
        if (window == IntPtr.Zero) return;
        uint processId;
        GetWindowThreadProcessId(window, out processId);
        if (processId == 0) return;
        if (!IsAllowedHostProcess(processId)) return;
        QueueSignal();
    }

    private static void QueueSignal()
    {
        if (Volatile.Read(ref started) == 0) return;
        Interlocked.Exchange(ref pending, 1);
        DebounceTimer.Change(debounceMilliseconds, Timeout.Infinite);
    }

    private static void OnTimer(object state)
    {
        Interlocked.Exchange(ref pending, 0);
        Changed.Set();
    }
}
'@

function Initialize-CodexUiSignal {
    if ('CodexUiSignal' -as [type]) { return }

    $assemblyPath = $env:CODEX_AUTO_APPROVE_ASSEMBLY
    if ($assemblyPath -and (Test-Path -LiteralPath $assemblyPath)) {
        Add-Type -Path $assemblyPath
        return
    }

    if ($assemblyPath) {
        $assemblyDir = Split-Path -Parent $assemblyPath
        if ($assemblyDir -and -not (Test-Path -LiteralPath $assemblyDir)) {
            New-Item -ItemType Directory -Path $assemblyDir -Force | Out-Null
        }
        try {
            # OutputAssembly writes the DLL but does not load it; load it explicitly.
            Add-Type -TypeDefinition $eventBridgeSource -OutputAssembly $assemblyPath -OutputType Library
            Add-Type -Path $assemblyPath
            return
        } catch {
            # Fall through to in-memory compile when the cache path is not writable.
        }
    }

    Add-Type -TypeDefinition $eventBridgeSource
}

Initialize-CodexUiSignal

$configJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($ConfigBase64))
$config = $configJson | ConvertFrom-Json
$desktop = [Windows.Automation.AutomationElement]::RootElement
$treeWalker = [Windows.Automation.TreeWalker]::ControlViewWalker
$lastInvoked = @{}
$lastWarnings = @{}
$processNameByPid = @{}

$defaultHostProcessNames = @(
    'Code',
    'Code - Insiders',
    'VSCodium',
    'Cursor',
    'Cursor Helper',
    'Windsurf',
    'code-oss'
)
$hostProcessNames = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($name in @($config.hostProcessNames)) {
    $trimmed = ([string]$name).Trim()
    if ($trimmed) { [void]$hostProcessNames.Add($trimmed) }
}
if ($hostProcessNames.Count -eq 0) {
    foreach ($name in $defaultHostProcessNames) { [void]$hostProcessNames.Add($name) }
}

$approachLabels = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($labelValue in @($config.approachLabels)) {
    $label = ([string]$labelValue).Trim()
    if ($label) { [void]$approachLabels.Add($label) }
}
$approvalLabels = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($labelValue in @($config.approvalLabels)) {
    $label = ([string]$labelValue).Trim()
    if ($label) { [void]$approvalLabels.Add($label) }
}
$highConfidenceLabels = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($labelValue in @($config.highConfidenceLabels)) {
    $label = ([string]$labelValue).Trim()
    if ($label) { [void]$highConfidenceLabels.Add($label) }
}

$uniqueLabels = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$nameConditions = [Collections.Generic.List[Windows.Automation.Condition]]::new()
foreach ($label in @($approachLabels) + @($approvalLabels)) {
    if ($uniqueLabels.Add($label)) {
        $nameConditions.Add([Windows.Automation.PropertyCondition]::new(
            [Windows.Automation.AutomationElement]::NameProperty,
            $label,
            [Windows.Automation.PropertyConditionFlags]::IgnoreCase
        ))
    }
}
if ($nameConditions.Count -eq 0) {
    throw 'No approach or approval labels configured.'
}
$targetNameCondition = if ($nameConditions.Count -eq 1) {
    $nameConditions[0]
} else {
    [Windows.Automation.OrCondition]::new($nameConditions.ToArray())
}
$matchCondition = [Windows.Automation.AndCondition]::new(
    $targetNameCondition,
    [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::IsEnabledProperty, $true),
    [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::IsOffscreenProperty, $false)
)

$idleScanInterval = 1000
if ($null -ne $config.idleScanInterval) {
    $idleScanInterval = [Math]::Max(250, [Math]::Min(5000, [int]$config.idleScanInterval))
}
$parentPid = 0
if ($null -ne $config.parentPid) {
    $parentPid = [int]$config.parentPid
}

function Write-Event([hashtable]$Event) {
    [Console]::Out.WriteLine(($Event | ConvertTo-Json -Compress))
    [Console]::Out.Flush()
}

function Write-ThrottledWarning([string]$Key, [string]$Message) {
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if (-not $lastWarnings.ContainsKey($Key) -or ($now - [long]$lastWarnings[$Key]) -ge 10000) {
        $lastWarnings[$Key] = $now
        Write-Event @{ type = 'warning'; message = $Message }
    }
}

function Test-ParentAlive {
    if ($parentPid -le 0) { return $true }
    try {
        $parent = Get-Process -Id $parentPid -ErrorAction Stop
        return -not $parent.HasExited
    } catch {
        return $false
    }
}

function Get-Identity([Windows.Automation.AutomationElement]$Element) {
    try {
        $runtimeId = $Element.GetRuntimeId()
        if ($runtimeId) { return ($runtimeId -join '.') }
    } catch {}
    try { return "$($Element.Current.ProcessId):$($Element.Current.AutomationId):$($Element.Current.Name)" } catch { return [guid]::NewGuid().ToString() }
}

function Test-CodexContext([Windows.Automation.AutomationElement]$Element) {
    if (-not $config.onlyWhenCodexVisible) { return $true }

    # Distinctive approval labels are safe enough when they are enabled and
    # visible inside a supported host process. Avoid another Chromium tree traversal.
    try {
        $candidateName = [string]$Element.Current.Name
        if ($highConfidenceLabels.Contains($candidateName)) { return $true }
    } catch {}

    $cursor = $Element
    for ($depth = 0; $depth -lt 12 -and $null -ne $cursor; $depth++) {
        try {
            $haystack = "$($cursor.Current.Name) $($cursor.Current.AutomationId) $($cursor.Current.ClassName)"
            foreach ($marker in $config.codexMarkers) {
                if ($haystack.IndexOf([string]$marker, [StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
            }
            $cursor = $treeWalker.GetParent($cursor)
        } catch { break }
    }

    return $false
}

function Invoke-Control([Windows.Automation.AutomationElement]$Element, [string]$Kind) {
    $originalLabel = [string]$Element.Current.Name
    $target = $Element
    for ($depth = 0; $depth -lt 5 -and $null -ne $target; $depth++) {
        try {
            if ($target.Current.ControlType -eq [Windows.Automation.ControlType]::Window) { break }
            $identity = Get-Identity $target
            $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            if ($lastInvoked.ContainsKey($identity) -and ($now - [long]$lastInvoked[$identity]) -lt [long]$config.cooldown) { return $false }

            $pattern = $null
            if ($target.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern, [ref]$pattern)) {
                ([Windows.Automation.SelectionItemPattern]$pattern).Select()
            } elseif ($target.TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
                ([Windows.Automation.InvokePattern]$pattern).Invoke()
            } else {
                $target = $treeWalker.GetParent($target)
                continue
            }
            $lastInvoked[$identity] = $now
            Write-Event @{ type = $Kind; label = $originalLabel }
            return $true
        } catch {
            Write-ThrottledWarning "invoke:$originalLabel" "Could not invoke '$originalLabel': $($_.Exception.Message)"
            return $false
        }
    }
    Write-ThrottledWarning "pattern:$originalLabel" "Matched '$originalLabel', but neither it nor its nearby parents exposed a clickable UI Automation pattern."
    return $false
}

function Find-MatchingControls([Windows.Automation.AutomationElement]$Root) {
    $approach = [Collections.Generic.List[Windows.Automation.AutomationElement]]::new()
    $approval = [Collections.Generic.List[Windows.Automation.AutomationElement]]::new()
    $all = $Root.FindAll([Windows.Automation.TreeScope]::Descendants, $matchCondition)
    foreach ($item in $all) {
        $name = [string]$item.Current.Name
        if (-not $name) { continue }
        if ($approachLabels.Contains($name) -and $item.Current.ControlType -ne [Windows.Automation.ControlType]::Text) {
            $approach.Add($item)
        }
        if ($approvalLabels.Contains($name)) { $approval.Add($item) }
    }
    return @{ approach = $approach; approval = $approval }
}

function Get-WindowProcessName([Windows.Automation.AutomationElement]$Window) {
    $processId = 0
    try { $processId = [int]$Window.Current.ProcessId } catch { return $null }
    if ($processId -le 0) { return $null }
    if ($processNameByPid.ContainsKey($processId)) { return [string]$processNameByPid[$processId] }
    try {
        $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName
        $processNameByPid[$processId] = $processName
        return $processName
    } catch {
        return $null
    }
}

function Invoke-Scan {
    try {
        $windows = $desktop.FindAll(
            [Windows.Automation.TreeScope]::Children,
            [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::ControlTypeProperty, [Windows.Automation.ControlType]::Window)
        )
        foreach ($window in $windows) {
            $processName = Get-WindowProcessName $window
            if (-not $processName -or -not $hostProcessNames.Contains($processName)) { continue }

            $controls = Find-MatchingControls $window
            foreach ($control in $controls.approach) {
                if (Test-CodexContext $control) {
                    if (Invoke-Control $control 'selected') { break }
                } else {
                    Write-ThrottledWarning "context:$($control.Current.Name)" "Matched '$($control.Current.Name)', but rejected it because no nearby Codex context was exposed."
                }
            }
            foreach ($control in $controls.approval) {
                if (Test-CodexContext $control) {
                    if (Invoke-Control $control 'approved') { break }
                } else {
                    Write-ThrottledWarning "context:$($control.Current.Name)" "Matched '$($control.Current.Name)', but rejected it because no nearby Codex context was exposed."
                }
            }
        }

        $cutoff = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - ([long]$config.cooldown * 4)
        foreach ($key in @($lastInvoked.Keys)) {
            if ([long]$lastInvoked[$key] -lt $cutoff) { $lastInvoked.Remove($key) }
        }
        foreach ($key in @($processNameByPid.Keys)) {
            try {
                $null = Get-Process -Id $key -ErrorAction Stop
            } catch {
                $processNameByPid.Remove($key)
            }
        }
    } catch {
        Write-Event @{ type = 'warning'; message = $_.Exception.Message }
    }
}

[CodexUiSignal]::SetProcessNames(@($hostProcessNames))
[CodexUiSignal]::Start([int]$config.eventDebounce)
Write-Event @{
    type = 'ready'
    pid = $PID
    mode = 'event-driven'
    idleScanInterval = $idleScanInterval
    hostProcessCount = $hostProcessNames.Count
}

try {
    while ($true) {
        if (-not (Test-ParentAlive)) { break }

        Invoke-Scan

        # Accessibility events wake this immediately. The timeout is a
        # low-frequency safety scan for Chromium builds that occasionally drop events.
        [void][CodexUiSignal]::Wait($idleScanInterval)
    }
} finally {
    [CodexUiSignal]::Stop()
}
