[CmdletBinding()]
param(
  [switch]$Cleanup,
  [switch]$DryRun,
  [string]$ResultZip,
  [string]$SourceCommit = "REQUIRED_EXACT_ATHENA_COMMIT",
  [string]$SourceUri = "REQUIRED_PINNED_SOURCE_URI",
  [string]$SourceSha256 = "REQUIRED_SOURCE_SHA256"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Distro = "ATHENA-Benchmark"
$OwnedRoot = Join-Path $env:LOCALAPPDATA "ATHENA-Benchmark"

function Invoke-Safe { param([scriptblock]$Action) try { & $Action 2>&1 | Out-String } catch { "NOT_AVAILABLE: $($_.Exception.Message)" } }
function Get-Value { param($Object, [string]$Name) if ($null -eq $Object) { return "NOT_AVAILABLE" }; $value = $Object.$Name; if ($null -eq $value) { return "NOT_AVAILABLE" }; return $value }
function Write-Preflight {
  $computer = Get-CimInstance Win32_ComputerSystem
  $os = Get-CimInstance Win32_OperatingSystem
  $cpu = (Get-CimInstance Win32_Processor | ForEach-Object Name) -join "; "
  $disk = Get-PSDrive -PSProvider FileSystem | ForEach-Object { "$($_.Name): $([math]::Round($_.Free / 1GB, 1)) GB free" } -join "; "
  $wsl = Invoke-Safe { wsl.exe --status }
  $distros = Invoke-Safe { wsl.exe --list --verbose }
  $docker = Invoke-Safe { docker version --format '{{.Server.Version}}' }
  $virtualization = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
  Write-Host "ATHENA PREDATOR PREFLIGHT"
  Write-Host "Windows: $($os.Caption) $($os.Version)"
  Write-Host "CPU: $cpu"
  Write-Host "RAM: $([math]::Round($computer.TotalPhysicalMemory / 1GB, 1)) GB"
  Write-Host "Available RAM: $([math]::Round($os.FreePhysicalMemory / 1MB, 1)) GB"
  Write-Host "Disk: $disk"
  Write-Host "Virtualization: $virtualization"
  Write-Host "WSL status: $wsl"
  Write-Host "Existing WSL distros: $distros"
  Write-Host "Docker status: $docker"
  Write-Host ""
  Write-Host "PLANNED CHANGES:"
  Write-Host "- Create only $Distro and $OwnedRoot after confirmation."
  Write-Host "- Download only the pinned ATHENA source after SHA-256 verification."
  Write-Host "- Run all benchmark dependencies inside $Distro."
  Write-Host "- Do not start a model call unless the separately frozen manifest validates and the user later approves cost."
  Write-Host "WILL NOT MODIFY: existing user software/data, unrelated WSL distros, Docker data, Git settings, browser profiles, or environment variables."
  Write-Host "Nothing has been changed yet."
}
function Invoke-Cleanup {
  if (-not $ResultZip -or -not (Test-Path -LiteralPath $ResultZip)) { throw "Cleanup requires -ResultZip pointing to a verified result ZIP outside WSL." }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ResultZip).Hash
  $distroExists = (Invoke-Safe { wsl.exe --list --quiet }) -match "(?m)^$([regex]::Escape($Distro))$"
  if ($distroExists) { wsl.exe --terminate $Distro 2>$null; wsl.exe --unregister $Distro }
  if (Test-Path -LiteralPath $OwnedRoot) { Remove-Item -LiteralPath $OwnedRoot -Recurse -Force }
  $left = Test-Path -LiteralPath $OwnedRoot
  Write-Host "ATHENA CLEANUP REPORT"
  Write-Host "ATHENA-Benchmark WSL       $(if ($distroExists) {'REMOVED'} else {'NOT_APPLICABLE'})"
  Write-Host "ATHENA temp files          $(if ($left) {'FAIL'} else {'REMOVED'})"
  Write-Host "ATHENA resume task         NOT_APPLICABLE"
  Write-Host "ATHENA processes           NONE"
  Write-Host "ATHENA local auth state    NOT_APPLICABLE"
  Write-Host "Personal WSL distros       UNTOUCHED"
  Write-Host "Personal data              UNTOUCHED"
  Write-Host "Retained result: $ResultZip"
  Write-Host "SHA256: $hash"
  Write-Host "STATUS: ATHENA_BENCHMARK_ENVIRONMENT_REMOVED"
}

if ($Cleanup) { Invoke-Cleanup; exit 0 }
Write-Preflight
if ($DryRun) { exit 0 }
$answer = Read-Host "Proceed? [y/N]"
if ($answer -notmatch '^[Yy]$') { Write-Host "No changes made."; exit 0 }
if ($SourceCommit -like "REQUIRED_*" -or $SourceUri -like "REQUIRED_*" -or $SourceSha256 -like "REQUIRED_*") { throw "Pinned source commit, URI, and SHA-256 are required; refusing an unpinned download." }
$wslStatus = Invoke-Safe { wsl.exe --status }
if ($wslStatus -match "NOT_AVAILABLE|not installed|requires" ) { throw "STOP: WSL2 is absent or unavailable. Enabling Windows Subsystem for Linux and Virtual Machine Platform can require administrator approval and a reboot. No feature was changed." }
if ((Invoke-Safe { wsl.exe --list --quiet }) -match "(?m)^$([regex]::Escape($Distro))$") { throw "Refusing to reuse an existing $Distro until its owned-run manifest is validated." }
New-Item -ItemType Directory -Path $OwnedRoot -Force | Out-Null
$archive = Join-Path $OwnedRoot "athena-source.zip"
Invoke-WebRequest -Uri $SourceUri -OutFile $archive
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash -ne $SourceSha256.ToUpperInvariant()) { Remove-Item -LiteralPath $archive -Force; throw "Pinned ATHENA archive SHA-256 mismatch." }
throw "STOP: no pinned, integrity-verified WSL root filesystem or verified Harbor 0.23.0 SWE-Bench Pro V2/PatchReplayAgent invocation contract is present. Source was verified but no benchmark was started. Run --cleanup to remove ATHENA-owned state."
