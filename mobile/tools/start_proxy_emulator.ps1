# Launch Android emulator (Proxy_IN_Haryana) via local auth-forwarding proxy.
# Usage:
#   .\start_proxy_emulator.ps1
#   .\start_proxy_emulator.ps1 -Upstream "http://user:pass@gate.ipdeep.com:8082"

param(
  # Leave empty to auto-generate a fresh Haryana sticky session (sessiontime=10 min)
  [string]$Upstream = "",
  [string]$Avd = "Proxy_IN_Haryana",
  [int]$LocalPort = 8888,
  [string]$ProxyPassword = "ih1A9xQh",
  [string]$ProxyUserPrefix = "d4455577000-res-country-in-state-haryana"
)

$ErrorActionPreference = "Stop"
$sdk = $env:ANDROID_SDK_ROOT
if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"
$emulator = Join-Path $sdk "emulator\emulator.exe"
$forwarder = Join-Path $PSScriptRoot "proxy_forwarder.py"

# Stop old forwarder on this port if present
Get-NetTCPConnection -LocalPort $LocalPort -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Starting local proxy forwarder on 127.0.0.1:$LocalPort ..."
$fwd = Start-Process -FilePath "python" -ArgumentList @(
  $forwarder,
  "--listen", "127.0.0.1:$LocalPort",
  "--upstream", $Upstream
) -PassThru -WindowStyle Minimized

Start-Sleep -Seconds 1
if ($fwd.HasExited) {
  throw "Proxy forwarder failed to start"
}

Write-Host "Starting emulator $Avd with -http-proxy http://10.0.2.2:$LocalPort ..."
Start-Process -FilePath $emulator -ArgumentList @(
  "-avd", $Avd,
  "-http-proxy", "http://10.0.2.2:$LocalPort",
  "-no-snapshot-save",
  "-netdelay", "none",
  "-netspeed", "full"
)

Write-Host "Waiting for boot..."
$deadline = (Get-Date).AddMinutes(4)
do {
  Start-Sleep -Seconds 4
  $booted = & $adb shell getprop sys.boot_completed 2>$null
} while (($booted -ne "1") -and ((Get-Date) -lt $deadline))

if ($booted -ne "1") {
  throw "Emulator did not finish booting"
}

Write-Host "Booted. Forwarder PID=$($fwd.Id)"
Write-Host "Tip: open https://api.ipify.org in Chrome on the emulator to confirm India IP."
