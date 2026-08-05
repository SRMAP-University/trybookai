# Sign Google accounts into the running Android emulator via UI automation.
param(
  [string]$Password = "adarsh@8",
  [string[]]$Emails = @(
    "complete@norep.sylica.app",
    "appoint@norep.sylica.app",
    "dominait@norep.sylica.app",
    "compita@norep.sylica.app"
  )
)

$ErrorActionPreference = "Stop"
$sdk = $env:ANDROID_SDK_ROOT
if (-not $sdk) { $sdk = "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $sdk "platform-tools\adb.exe"

function Dump-Ui {
  & $adb shell "uiautomator dump /sdcard/ui.xml" | Out-Null
  return [string](& $adb shell "cat /sdcard/ui.xml")
}

function Tap-Bounds([string]$bounds) {
  if ($bounds -match '\[(\d+),(\d+)\]\[(\d+),(\d+)\]') {
    $x = [int](([int]$Matches[1] + [int]$Matches[3]) / 2)
    $y = [int](([int]$Matches[2] + [int]$Matches[4]) / 2)
    Write-Host "  tap $x,$y"
    & $adb shell "input tap $x $y"
    return $true
  }
  return $false
}

function Find-BoundsByText([string]$ui, [string]$text, [switch]$ClickableParent) {
  if ($ClickableParent) {
    $pattern = 'clickable="true"[^>]*bounds="(\[[^\]]+\]\[[^\]]+\])"[^>]*>[\s\S]{0,1200}?text="' + [regex]::Escape($text) + '"'
    $m = [regex]::Match($ui, $pattern)
    if ($m.Success) { return $m.Groups[1].Value }
  }
  $m2 = [regex]::Match($ui, 'text="' + [regex]::Escape($text) + '"[^>]*bounds="(\[[^\]]+\]\[[^\]]+\])"')
  if ($m2.Success) { return $m2.Groups[1].Value }
  $m3 = [regex]::Match($ui, 'content-desc="' + [regex]::Escape($text) + '"[^>]*bounds="(\[[^\]]+\]\[[^\]]+\])"')
  if ($m3.Success) { return $m3.Groups[1].Value }
  return $null
}

function Tap-Text([string]$text, [switch]$ClickableParent) {
  $ui = Dump-Ui
  $b = Find-BoundsByText $ui $text -ClickableParent:$ClickableParent
  if (-not $b) {
    Write-Host "  miss text=$text"
    return $false
  }
  return Tap-Bounds $b
}

function Wait-AnyText([string[]]$texts, [int]$seconds = 30) {
  for ($i = 0; $i -lt $seconds; $i++) {
    $ui = Dump-Ui
    foreach ($t in $texts) {
      if ($ui -match [regex]::Escape($t)) { return $t }
    }
    Start-Sleep -Seconds 1
  }
  return $null
}

function Type-Raw([string]$value) {
  # Escape for `adb shell input text`
  $escaped = $value.Replace("\", "\\").Replace(" ", "%s").Replace("'", "\'").Replace("&", "\&").Replace("<", "\<").Replace(">", "\>").Replace("|", "\|").Replace(";", "\;").Replace("(", "\(").Replace(")", "\)").Replace("@", "\@")
  & $adb shell "input text `"$escaped`""
}

function Clear-Field {
  & $adb shell "input keyevent KEYCODE_MOVE_END"
  1..80 | ForEach-Object { & $adb shell "input keyevent KEYCODE_DEL" | Out-Null }
}

function Shot([string]$name) {
  $path = Join-Path $PSScriptRoot $name
  cmd /c "`"$adb`" exec-out screencap -p > `"$path`""
  Write-Host "  shot $path"
}

function Sign-InOne([string]$email, [string]$password) {
  Write-Host "`n==== Signing in $email ===="
  & $adb shell "am start -a android.settings.ADD_ACCOUNT_SETTINGS" | Out-Null
  Start-Sleep -Seconds 2

  if (-not (Tap-Text "Google" -ClickableParent)) {
    # tap known Google row area fallback
    & $adb shell "input tap 540 834"
  }

  $seen = Wait-AnyText @(
    "Sign in",
    "Email or phone",
    "Forgot email",
    "Use another account",
    "Sign in with ease",
    "Checking info",
    "Something went wrong",
    "Couldn't sign in"
  ) 45

  Write-Host "  screen=$seen"
  Shot ("login_" + ($email.Split("@")[0]) + "_1.png")

  # Dismiss phone-number convenience interstitial if present
  foreach ($label in @("Skip", "No thanks", "Don't allow", "Not now", "Use another account", "More options")) {
    if (Tap-Text $label) { Start-Sleep -Seconds 2; break }
  }

  $seen = Wait-AnyText @("Email or phone", "Forgot email", "Sign in", "identifierId") 30
  Write-Host "  after interstitial=$seen"
  Shot ("login_" + ($email.Split("@")[0]) + "_2.png")

  # Focus email field: tap common edittext or "Email or phone"
  $ui = Dump-Ui
  $edit = [regex]::Match($ui, 'class="android.widget.EditText"[^>]*bounds="(\[[^\]]+\]\[[^\]]+\])"')
  if ($edit.Success) {
    Tap-Bounds $edit.Groups[1].Value | Out-Null
  } else {
    Tap-Text "Email or phone" | Out-Null
  }
  Start-Sleep -Seconds 1
  Clear-Field
  Type-Raw $email
  Start-Sleep -Seconds 1

  foreach ($label in @("Next", "NEXT", "Continue")) {
    if (Tap-Text $label -ClickableParent) { break }
    if (Tap-Text $label) { break }
  }

  $seen = Wait-AnyText @("Enter your password", "Show password", "Welcome", "Wrong password", "Couldn't find", "Couldn\u2019t find", "password") 40
  Write-Host "  password screen=$seen"
  Shot ("login_" + ($email.Split("@")[0]) + "_3.png")

  if ($seen -match "Couldn|Wrong|find your Google Account") {
    Write-Host "  FAILED at email step for $email"
    return $false
  }

  $ui = Dump-Ui
  $edit = [regex]::Match($ui, 'class="android.widget.EditText"[^>]*bounds="(\[[^\]]+\]\[[^\]]+\])"')
  if ($edit.Success) { Tap-Bounds $edit.Groups[1].Value | Out-Null }
  Start-Sleep -Seconds 1
  Clear-Field
  Type-Raw $password
  Start-Sleep -Seconds 1

  foreach ($label in @("Next", "NEXT", "Continue")) {
    if (Tap-Text $label -ClickableParent) { break }
    if (Tap-Text $label) { break }
  }

  # Accept common post-login screens
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Seconds 2
    $ui = Dump-Ui
    $progress = $false
    foreach ($label in @(
        "I agree", "Accept", "More", "Accept & continue",
        "Don't turn on", "Not now", "Skip", "No thanks",
        "Continue", "NEXT", "Next", "Got it", "Yes, I'm in"
      )) {
      $b = Find-BoundsByText $ui $label -ClickableParent
      if (-not $b) { $b = Find-BoundsByText $ui $label }
      if ($b) {
        Write-Host "  post-login tap $label"
        Tap-Bounds $b | Out-Null
        $progress = $true
        break
      }
    }
    if (-not $progress) {
      # finished or unknown screen
      if ($ui -match [regex]::Escape($email) -or $ui -match "Google Account") { break }
    }
  }

  Shot ("login_" + ($email.Split("@")[0]) + "_done.png")

  $accounts = & $adb shell "dumpsys account"
  if ($accounts -match [regex]::Escape($email)) {
    Write-Host "  OK: $email present in account manager"
    return $true
  }
  Write-Host "  WARN: $email not confirmed in dumpsys yet"
  return $false
}

& $adb shell "settings put secure show_ime_with_hard_keyboard 1" | Out-Null
& $adb shell "settings put global http_proxy 10.0.2.2:8888" | Out-Null

$results = @()
foreach ($email in $Emails) {
  try {
    $ok = Sign-InOne $email $Password
    $results += [pscustomobject]@{ Email = $email; Ok = $ok }
  } catch {
    Write-Host "  ERROR: $_"
    $results += [pscustomobject]@{ Email = $email; Ok = $false }
  }
  # back out to launcher between accounts
  & $adb shell "input keyevent KEYCODE_HOME" | Out-Null
  Start-Sleep -Seconds 2
}

Write-Host "`n==== RESULTS ===="
$results | Format-Table -AutoSize
& $adb shell "dumpsys account" | Select-String -Pattern "Account \{"
