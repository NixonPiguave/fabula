$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = Join-Path $projectRoot '.tools\installer-check'
$installRoot = [IO.Path]::GetFullPath((Join-Path $testRoot 'application'))
if (-not $installRoot.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Test installation must stay inside the project.' }
if (Test-Path -LiteralPath $installRoot) { throw 'A previous test folder exists. Inspect it before running again.' }
if (Get-Process -Name Fabula -ErrorAction SilentlyContinue) { throw 'Close Fábula before testing its installer.' }
$registryPaths = @('Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'Registry::HKEY_LOCAL_MACHINE\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'Registry::HKEY_LOCAL_MACHINE\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
function Find-FabulaInstallation {
  foreach ($registryPath in $registryPaths) {
    Get-ChildItem -LiteralPath $registryPath -ErrorAction SilentlyContinue | Where-Object { $_.GetValue('DisplayName') -match '^F[aá]bula(?:$| \d)' }
  }
}
if (Find-FabulaInstallation) { throw 'An existing installation was found. Use a clean virtual machine for this test.' }
$desktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Fabula.lnk'
$menuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Fabula.lnk'
if ((Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $menuLink)) { throw 'Existing shortcuts found. Use a clean virtual machine for this test.' }
function Get-LibraryDigest {
  $libraryPath = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Fábula'
  $entries = if (Test-Path -LiteralPath $libraryPath) {
    Get-ChildItem -LiteralPath $libraryPath -File -Recurse | Sort-Object FullName | ForEach-Object {
      $_.FullName + '|' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }
  } else { @('absent') }
  [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes(($entries -join "`n"))))
}
$before = Get-LibraryDigest
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$installer = Join-Path $projectRoot 'Fabula-Instalador.exe'
$installed = $false
try {
  $process = Start-Process -FilePath $installer -ArgumentList @('/S', '/currentuser', '--no-desktop-shortcut', "/D=$installRoot") -WindowStyle Hidden -PassThru
  if (-not $process.WaitForExit(60000)) { throw 'Installer did not finish within 60 seconds.' }
  if ($process.ExitCode -ne 0) { throw "Installer exit code: $($process.ExitCode)" }
  $installed = $true
  $executable = Join-Path $installRoot 'Fabula.exe'
  if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed executable missing.' }
  if ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Unexpected installation reparse point.' }
  $entries = @(Find-FabulaInstallation)
  $expectedUninstaller = '"' + (Join-Path $installRoot 'Uninstall Fabula.exe') + '"'
  if ($entries.Count -ne 1 -or -not ([string]$entries[0].GetValue('UninstallString')).StartsWith($expectedUninstaller, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected installation registry location.' }
  if ($entries[0].GetValue('DisplayVersion') -ne '0.5.0') { throw 'Incorrect installed version.' }
  $env:FABULA_EXECUTABLE = $executable
  $env:FABULA_PORTABLE_CHECK_ROOT = Join-Path $testRoot 'runtime'
  Push-Location $projectRoot
  try { node tools/portable-check.mjs; if ($LASTEXITCODE -ne 0) { throw 'Installed runtime check failed.' } } finally { Pop-Location }
  Write-Output 'PASS: installer registers version 0.5.0 in the selected folder; installed app starts with an isolated profile'
} finally {
  Remove-Item Env:FABULA_EXECUTABLE -ErrorAction SilentlyContinue
  Remove-Item Env:FABULA_PORTABLE_CHECK_ROOT -ErrorAction SilentlyContinue
  $uninstaller = Join-Path $installRoot 'Uninstall Fabula.exe'
  if ($installed -and (Test-Path -LiteralPath $uninstaller)) {
    $resolvedTarget = (Resolve-Path -LiteralPath $installRoot).Path
    if ($resolvedTarget -ne $installRoot -or -not $resolvedTarget.StartsWith($projectRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or ((Get-Item -LiteralPath $installRoot).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing an unexpected uninstall target.' }
    $process = Start-Process -FilePath $uninstaller -ArgumentList @('/S', '/currentuser', "_?=$installRoot") -WindowStyle Hidden -PassThru
    if (-not $process.WaitForExit(60000)) { throw 'Uninstaller did not finish within 60 seconds.' }
    if ($process.ExitCode -ne 0) { throw "Uninstaller exit code: $($process.ExitCode)" }
  }
}
if (Test-Path -LiteralPath (Join-Path $installRoot 'Fabula.exe')) { throw 'Uninstaller left the application installed.' }
if (Find-FabulaInstallation) { throw 'Uninstaller left its registry entry.' }
$after = Get-LibraryDigest
if ($before -ne $after) { throw 'The personal library changed during the installer test.' }
@{ ok = $true; installedVersion = '0.5.0'; uninstalled = $true; personalLibraryUnchanged = $true } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $testRoot 'result.json') -Encoding utf8
Write-Output 'PASS: uninstall removes the test installation and preserves the personal library unchanged'
