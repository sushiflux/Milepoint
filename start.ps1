<#
  Milepoint Dev-Stack - Start/Stopp/Status in einer Datei.

  .\start.ps1                  Startet den Stack (erstellt .env falls nötig, prüft Ports, wartet auf Healthchecks)
  .\start.ps1 -Action stop     Stoppt den Stack (Docker-Volumes/Daten bleiben erhalten)
  .\start.ps1 -Action restart  Stoppt und startet neu
  .\start.ps1 -Action status   Zeigt den Container-Status
  .\start.ps1 -Action logs     Folgt den Logs aller Services
  .\start.ps1 -Db mssql        Wechselt DB_PROVIDER und startet nur das Backend neu
#>

param(
    [ValidateSet('start', 'stop', 'restart', 'status', 'logs')]
    [string]$Action = 'start',

    [ValidateSet('postgres', 'mssql')]
    [string]$Db,

    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'
$ProjectName = 'milepoint'
$RootDir = $PSScriptRoot
Set-Location $RootDir

$EnvFile = Join-Path $RootDir '.env'
$EnvExampleFile = Join-Path $RootDir '.env.example'

function New-RandomToken([int]$Length = 48) {
    -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $Length | ForEach-Object { [char]$_ })
}

function New-StrongPassword {
    $lower = -join ((97..122) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    $upper = -join ((65..90) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
    $digits = -join ((48..57) | Get-Random -Count 4 | ForEach-Object { [char]$_ })
    # '#' bewusst ausgeschlossen: würde in .env als Kommentarstart missverstanden.
    $special = -join (@('!', '@', '%', '*', '-', '_') | Get-Random -Count 2)
    $chars = ($lower + $upper + $digits + $special).ToCharArray()
    -join ($chars | Sort-Object { Get-Random })
}

function Get-AppVersion {
    $versionFile = Join-Path $RootDir 'VERSION'
    $base = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { '0.0' }

    $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
    if (-not $gitExe) {
        $fallback = 'C:\Program Files\Git\cmd\git.exe'
        if (Test-Path $fallback) { $gitExe = $fallback }
    }

    $commitCount = $null
    if ($gitExe) {
        try { $commitCount = & $gitExe -C $RootDir rev-list --count HEAD 2>$null } catch { $commitCount = $null }
    }
    if (-not $commitCount) { $commitCount = '0' }

    return "v$base.$commitCount"
}

function Set-EnvValue([string]$Path, [string]$Key, [string]$Value) {
    $lines = Get-Content -Path $Path
    $pattern = "^\s*$Key\s*="
    $found = $false
    $updated = foreach ($line in $lines) {
        if ($line -match $pattern) {
            $found = $true
            "$Key=$Value"
        }
        else {
            $line
        }
    }
    if (-not $found) {
        $updated += "$Key=$Value"
    }
    Set-Content -Path $Path -Value $updated -Encoding utf8
}

function Get-EnvValue([string]$Path, [string]$Key) {
    $line = Get-Content -Path $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }
    return ($line -split '=', 2)[1].Trim()
}

function Initialize-EnvFile {
    if (-not (Test-Path $EnvFile)) {
        Write-Host "Keine .env gefunden - erstelle sie aus .env.example mit zufällig generierten Secrets." -ForegroundColor Yellow
        Copy-Item $EnvExampleFile $EnvFile
        Set-EnvValue -Path $EnvFile -Key 'POSTGRES_PASSWORD' -Value (New-RandomToken 24)
        Set-EnvValue -Path $EnvFile -Key 'MSSQL_SA_PASSWORD' -Value (New-StrongPassword)
        Set-EnvValue -Path $EnvFile -Key 'JWT_SIGNING_KEY' -Value (New-RandomToken 64)
        # ADMIN_INITIAL_PASSWORD bleibt bewusst der feste Wert aus .env.example (admin/admin für lokale Dev-Umgebung).
        return
    }

    # .env existiert schon (z.B. von vor einem Skript-Update) - Keys ergänzen, die .env.example
    # inzwischen kennt, .env aber noch nicht hat, statt sie leer zu lassen.
    $exampleKeys = Get-Content $EnvExampleFile |
        Where-Object { $_ -match '^\s*[A-Za-z_][A-Za-z0-9_]*\s*=' } |
        ForEach-Object { ($_ -split '=', 2)[0].Trim() }

    foreach ($key in $exampleKeys) {
        if ($null -ne (Get-EnvValue -Path $EnvFile -Key $key)) { continue }

        $value = switch ($key) {
            'JWT_SIGNING_KEY' { New-RandomToken 64 }
            'POSTGRES_PASSWORD' { New-RandomToken 24 }
            'MSSQL_SA_PASSWORD' { New-StrongPassword }
            default { Get-EnvValue -Path $EnvExampleFile -Key $key }
        }

        Write-Host "Ergänze fehlenden Key '$key' in .env." -ForegroundColor Yellow
        Set-EnvValue -Path $EnvFile -Key $key -Value $value
    }
}

function Test-TcpPortFree([int]$Port) {
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) { $listener.Stop() }
    }
}

function Find-FreePort([int]$StartPort) {
    $port = $StartPort
    while (-not (Test-TcpPortFree $port)) {
        $port++
    }
    return $port
}

function Resolve-Ports {
    $portKeys = @(
        'CADDY_PORT', 'FRONTEND_PORT', 'BACKEND_PORT', 'POSTGRES_PORT',
        'MSSQL_PORT', 'REDIS_PORT', 'MAILPIT_SMTP_PORT', 'MAILPIT_UI_PORT', 'ADMINER_PORT'
    )
    foreach ($key in $portKeys) {
        $current = [int](Get-EnvValue -Path $EnvFile -Key $key)
        if (-not (Test-TcpPortFree $current)) {
            $free = Find-FreePort ($current + 1)
            Write-Host "Port $current ($key) ist von einem fremden Prozess belegt - weiche auf $free aus." -ForegroundColor Yellow
            Set-EnvValue -Path $EnvFile -Key $key -Value $free
        }
    }
}

function Invoke-Compose([string[]]$ComposeArgs) {
    & docker compose -p $ProjectName --env-file $EnvFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') ist fehlgeschlagen (Exit Code $LASTEXITCODE)."
    }
}

function Get-ComposeContainers {
    try {
        $raw = (& docker compose -p $ProjectName ps --format json 2>$null) -join "`n"
        if (-not $raw.Trim()) { return @() }

        try {
            $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
            if ($parsed -is [System.Array]) { return $parsed }
            return @($parsed)
        }
        catch {
            $containers = @()
            foreach ($line in ($raw -split "`n")) {
                if ($line.Trim()) {
                    try { $containers += ($line | ConvertFrom-Json -ErrorAction Stop) } catch {}
                }
            }
            return $containers
        }
    }
    catch {
        return @()
    }
}

function Wait-ForHealth([int]$TimeoutSeconds = 240) {
    Write-Host "`nWarte auf Healthchecks..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $servicesWithHealthcheck = @('postgres', 'mssql', 'redis', 'backend', 'frontend')

    while ((Get-Date) -lt $deadline) {
        $containers = Get-ComposeContainers
        $pending = @()
        $unhealthy = @()

        foreach ($service in $servicesWithHealthcheck) {
            $c = $containers | Where-Object { $_.Service -eq $service } | Select-Object -First 1
            if (-not $c) { $pending += $service; continue }
            if ($c.Health -eq 'unhealthy') { $unhealthy += $service }
            elseif ($c.Health -and $c.Health -ne 'healthy') { $pending += $service }
            elseif (-not $c.Health -and $c.State -ne 'running') { $pending += $service }
        }

        if ($unhealthy.Count -gt 0) {
            throw "Diese Services sind unhealthy: $($unhealthy -join ', '). Prüfe: docker compose -p pm logs <service>"
        }

        if ($pending.Count -eq 0) {
            Write-Host "Alle Services sind healthy." -ForegroundColor Green
            return
        }

        Write-Host "  ...warte noch auf: $($pending -join ', ')"
        Start-Sleep -Seconds 4
    }

    throw "Timeout beim Warten auf Healthchecks nach $TimeoutSeconds Sekunden. Prüfe: docker compose -p pm logs"
}

function Test-HttpEndpoint([string]$Url, [int]$TimeoutSeconds = 30) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch {
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

if ($Action -eq 'restart') {
    Invoke-Compose @('down')
    $Action = 'start'
}

switch ($Action) {
    'stop' {
        Write-Host "Stoppe Milepoint-Stack..." -ForegroundColor Cyan
        Invoke-Compose @('down')
        Write-Host "Gestoppt. Datenbank-Volumes bleiben erhalten." -ForegroundColor Green
        exit 0
    }
    'status' {
        Invoke-Compose @('ps')
        exit 0
    }
    'logs' {
        Invoke-Compose @('logs', '-f', '--tail=100')
        exit 0
    }
}

Initialize-EnvFile

if ($Db) {
    Set-EnvValue -Path $EnvFile -Key 'DB_PROVIDER' -Value $Db
    Write-Host "DB_PROVIDER auf '$Db' gesetzt." -ForegroundColor Cyan

    $backendRunning = & docker compose -p $ProjectName ps -q backend
    if ($backendRunning) {
        Write-Host "Starte Backend neu, damit die neue Datenbank verwendet wird..." -ForegroundColor Cyan
        Invoke-Compose @('up', '-d', '--force-recreate', 'backend')
        Wait-ForHealth -TimeoutSeconds 120
        exit 0
    }
}

Write-Host "Beende evtl. laufende eigene PM-Container..." -ForegroundColor Cyan
Invoke-Compose @('down', '--remove-orphans')

Write-Host "Prüfe Ports..." -ForegroundColor Cyan
Resolve-Ports

$appVersion = Get-AppVersion
Set-EnvValue -Path $EnvFile -Key 'APP_VERSION' -Value $appVersion

$upArgs = @('up', '-d')
if (-not $NoBuild) { $upArgs += '--build' }

Write-Host "Starte Milepoint-Stack..." -ForegroundColor Cyan
Invoke-Compose $upArgs

Wait-ForHealth

$caddyPort = Get-EnvValue -Path $EnvFile -Key 'CADDY_PORT'
$adminerPort = Get-EnvValue -Path $EnvFile -Key 'ADMINER_PORT'
$mailpitPort = Get-EnvValue -Path $EnvFile -Key 'MAILPIT_UI_PORT'
$adminUsername = Get-EnvValue -Path $EnvFile -Key 'ADMIN_USERNAME'
$adminPassword = Get-EnvValue -Path $EnvFile -Key 'ADMIN_INITIAL_PASSWORD'

if (-not (Test-HttpEndpoint "http://localhost:$caddyPort")) {
    Write-Warning "http://localhost:$caddyPort antwortet noch nicht - Stack läuft, App ist evtl. noch am Hochfahren."
}

Write-Host "`nMilepoint-Stack läuft ($appVersion):" -ForegroundColor Green
Write-Host "  App:      http://localhost:$caddyPort"
Write-Host "  Adminer:  http://localhost:$adminerPort"
Write-Host "  Mailpit:  http://localhost:$mailpitPort"
Write-Host "`nLogin (nur beim allerersten Anlegen des Admin-Kontos gültig):"
Write-Host "  Benutzername: $adminUsername"
Write-Host "  Passwort:     $adminPassword"
Write-Host "`nStoppen mit:  .\start.ps1 -Action stop"
Write-Host "Status mit:   .\start.ps1 -Action status"
Write-Host "Logs mit:     .\start.ps1 -Action logs"
