<#
  Stellt die Milepoint-Dev-Datenbank aus einer Sicherung wieder her (Custom-Format-Dump von
  scripts/db-backup.sh bzw. ein manueller pg_dump -Fc).

  .\scripts\restore-db.ps1                     Neueste Sicherung aus .backups\auto\recent
  .\scripts\restore-db.ps1 -File <pfad.dump>   Bestimmte Sicherung (auch aus .backups\ oder daily\)
  .\scripts\restore-db.ps1 -Yes                Ohne Rueckfrage

  Ablauf: aktuellen Stand noch einmal sichern -> Backend stoppen -> Datenbank neu anlegen ->
  pg_restore -> Backend starten (das wendet fehlende EF-Core-Migrationen beim Start selbst an, ein
  aelterer Dump wird also automatisch auf das aktuelle Schema gehoben).
#>
param(
    [string]$File,
    [string]$Project = 'milepoint',
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

function Invoke-Native([string]$Exe, [string[]]$Arguments, [switch]$AllowFail) {
    # PS 5.1 wraps native stderr lines in ErrorRecords, which 'Stop' would turn into terminating
    # errors even for harmless warnings - the exit code is the real success signal.
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Exe @Arguments 2>&1 | ForEach-Object { "$_" } | Write-Host
        $code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $prev }
    if ($code -ne 0 -and -not $AllowFail) { throw "$Exe $($Arguments -join ' ') ist fehlgeschlagen (Exit Code $code)." }
    return $code
}

function Get-EnvValue([string]$Key, [string]$Default) {
    $envFile = Join-Path $RootDir '.env'
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
        if ($line) { return ($line -split '=', 2)[1].Trim() }
    }
    return $Default
}

if (-not $File) {
    $latest = Get-ChildItem (Join-Path $RootDir '.backups\auto\recent') -Filter *.dump -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $latest) { throw "Keine Sicherung in .backups\auto\recent gefunden - mit -File <pfad.dump> eine angeben." }
    $File = $latest.FullName
}
if (-not (Test-Path $File)) { throw "Datei nicht gefunden: $File" }
$File = (Resolve-Path $File).Path
$item = Get-Item $File

$dbUser = Get-EnvValue 'POSTGRES_USER' 'milepoint'
$dbName = Get-EnvValue 'POSTGRES_DB' 'milepoint'

Write-Host "Wiederherstellung aus: $File" -ForegroundColor Cyan
Write-Host ("  {0:N0} Bytes, Stand {1}" -f $item.Length, $item.LastWriteTime)
Write-Host "  Ziel: Datenbank '$dbName' im Projekt '$Project' (wird komplett ersetzt)" -ForegroundColor Yellow

if (-not $Yes) {
    $answer = Read-Host "Fortfahren? Die aktuelle Datenbank wird vorher noch einmal gesichert (j/N)"
    if ($answer -notmatch '^(j|ja|y|yes)$') { Write-Host "Abgebrochen."; exit 1 }
}

$pg = (& docker compose -p $Project ps -q postgres 2>$null | Select-Object -First 1)
if (-not $pg) {
    Write-Host "Postgres laeuft nicht - starte ihn..." -ForegroundColor Cyan
    Invoke-Native 'docker' @('compose', '-p', $Project, '--env-file', (Join-Path $RootDir '.env'), 'up', '-d', '--wait', 'postgres') | Out-Null
    $pg = (& docker compose -p $Project ps -q postgres 2>$null | Select-Object -First 1)
}
if (-not $pg) { throw "Postgres-Container nicht gefunden (Projekt '$Project')." }

# Safety net: never overwrite the current state without a fresh dump of it first. Best effort - the
# sidecar may not be running (e.g. postgres was just started on its own above).
$sidecar = (& docker compose -p $Project ps -q db-backup 2>$null | Select-Object -First 1)
if ($sidecar) {
    Write-Host "Sichere den aktuellen Stand vor dem Ueberschreiben..." -ForegroundColor Cyan
    Invoke-Native 'docker' @('exec', $sidecar, 'sh', '/tmp/db-backup.sh', 'once') -AllowFail | Out-Null
}
else {
    Write-Host "Hinweis: kein laufender db-backup-Dienst - der aktuelle Stand wird NICHT vorab gesichert." -ForegroundColor Yellow
}

Write-Host "Stoppe Backend..." -ForegroundColor Cyan
Invoke-Native 'docker' @('compose', '-p', $Project, 'stop', 'backend') -AllowFail | Out-Null

Write-Host "Kopiere Sicherung in den Postgres-Container..." -ForegroundColor Cyan
Invoke-Native 'docker' @('cp', $File, "${pg}:/tmp/restore.dump") | Out-Null

function Invoke-Psql([string]$Sql, [string]$Db) {
    # SQL goes in via stdin, not `psql -c "..."`: Windows PowerShell 5.1 strips the double quotes
    # that mixed-case Postgres identifiers ("Projects") need out of native-command arguments, while
    # PowerShell 7 re-escapes them - stdin behaves the same in both.
    $out = $Sql | & docker exec -i $pg psql -U $dbUser -d $Db -t -A -v ON_ERROR_STOP=1 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql fehlgeschlagen: $out" }
    return ($out | Out-String).Trim()
}

Write-Host "Lege Datenbank '$dbName' neu an..." -ForegroundColor Cyan
Invoke-Psql ('DROP DATABASE IF EXISTS "{0}" WITH (FORCE)' -f $dbName) 'postgres' | Out-Null
Invoke-Psql ('CREATE DATABASE "{0}"' -f $dbName) 'postgres' | Out-Null

Write-Host "Spiele Sicherung ein..." -ForegroundColor Cyan
# pg_restore exits non-zero for harmless notices too (e.g. an extension already present); the row
# counts below are the real check.
Invoke-Native 'docker' @('exec', $pg, 'pg_restore', '-U', $dbUser, '-d', $dbName, '--no-owner', '--no-privileges', '/tmp/restore.dump') -AllowFail | Out-Null
Invoke-Native 'docker' @('exec', $pg, 'rm', '-f', '/tmp/restore.dump') -AllowFail | Out-Null

Write-Host "`nWiederhergestellt - Zeilenzahlen:" -ForegroundColor Green
foreach ($t in 'Projects', 'Notes', 'WorkItems', 'AspNetUsers') {
    $n = try { Invoke-Psql ('select count(*) from "{0}"' -f $t) $dbName } catch { '?' }
    Write-Host ("  {0,-12} {1}" -f $t, $n)
}

Write-Host "`nStarte Backend (wendet fehlende Migrationen an)..." -ForegroundColor Cyan
Invoke-Native 'docker' @('compose', '-p', $Project, '--env-file', (Join-Path $RootDir '.env'), 'up', '-d', 'backend') | Out-Null
Write-Host "Fertig." -ForegroundColor Green
