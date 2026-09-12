# taskbar.ps1
# Hides or restores the Windows taskbar (primary + secondary monitors + Start button).
# Usage:
#   powershell -ExecutionPolicy Bypass -File taskbar.ps1 hide
#   powershell -ExecutionPolicy Bypass -File taskbar.ps1 show
#
# This is called SYNCHRONOUSLY (execFileSync) from main.js so the Electron
# process cannot exit before the "show" call has actually completed --
# that was the root cause of the taskbar getting stuck hidden after quit.

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("hide", "show")]
    [string]$Action
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class TaskbarHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    public static extern int ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern IntPtr FindWindowEx(IntPtr hwndParent, IntPtr hwndChildAfter, string lpszClass, string lpszWindow);

    public const int SW_HIDE = 0;
    public const int SW_SHOW = 9;
}
"@

function Set-Taskbar {
    param([int]$mode)

    # Primary taskbar
    $taskbar = [TaskbarHelper]::FindWindow("Shell_TrayWnd", $null)
    if ($taskbar -ne [IntPtr]::Zero) {
        [TaskbarHelper]::ShowWindow($taskbar, $mode) | Out-Null
    }

    # Start button (Windows 10 style; harmless no-op on 11)
    $startButton = [TaskbarHelper]::FindWindow("Button", "Start")
    if ($startButton -ne [IntPtr]::Zero) {
        [TaskbarHelper]::ShowWindow($startButton, $mode) | Out-Null
    }

    # Secondary taskbars (multi-monitor setups)
    $secondary = [TaskbarHelper]::FindWindow("Shell_SecondaryTrayWnd", $null)
    while ($secondary -ne [IntPtr]::Zero) {
        [TaskbarHelper]::ShowWindow($secondary, $mode) | Out-Null
        $secondary = [TaskbarHelper]::FindWindowEx([IntPtr]::Zero, $secondary, "Shell_SecondaryTrayWnd", $null)
    }
}

if ($Action -eq "hide") {
    Set-Taskbar -mode ([TaskbarHelper]::SW_HIDE)
} else {
    Set-Taskbar -mode ([TaskbarHelper]::SW_SHOW)
}
