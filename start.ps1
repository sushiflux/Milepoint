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

    $gitExe = Resolve-GitExe
    $commitCount = $null
    if ($gitExe) {
        try { $commitCount = & $gitExe -C $RootDir rev-list --count HEAD 2>$null } catch { $commitCount = $null }
    }
    if (-not $commitCount) { $commitCount = '0' }

    return "v$base.$commitCount"
}

function Resolve-GitExe {
    $gitExe = (Get-Command git -ErrorAction SilentlyContinue).Source
    if (-not $gitExe) {
        $fallback = 'C:\Program Files\Git\cmd\git.exe'
        if (Test-Path $fallback) { $gitExe = $fallback }
    }
    return $gitExe
}

function Set-GitHooksPath {
    # Wires up scripts/git-hooks (tracked in the repo) so post-commit keeps
    # backend/src/Milepoint.Api/version.txt current after every commit, not just at
    # start.ps1 time. Idempotent - safe to run on every start.
    $gitExe = Resolve-GitExe
    if (-not $gitExe) { return }
    try { & $gitExe -C $RootDir config core.hooksPath 'scripts/git-hooks' 2>$null } catch {}
}

function Write-VersionFile([string]$Version) {
    $versionTarget = Join-Path $RootDir 'backend\src\Milepoint.Api\version.txt'
    Set-Content -Path $versionTarget -Value $Version -NoNewline -Encoding utf8
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
    # Ein TcpListener-Bind auf IPAddress.Any reicht nicht: Windows lässt einen Any-Bind
    # teils zu, obwohl ein anderer Prozess (z.B. ein fremder Docker-Container über
    # com.docker.backend.exe) den Port bereits konkret auf 127.0.0.1 belegt - der
    # eigentliche "docker compose up" schlägt dann trotzdem mit "port is already
    # allocated" fehl. Get-NetTCPConnection spiegelt die tatsächliche
    # Listening-Socket-Tabelle des Systems wider (wie netstat) und erkennt jede
    # Belegung, unabhängig davon, welcher Prozess oder Container sie hält.
    return -not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

function Find-FreePort([int]$StartPort, [System.Collections.Generic.HashSet[int]]$ReservedPorts) {
    $port = $StartPort
    while ((-not (Test-TcpPortFree $port)) -or $ReservedPorts.Contains($port)) {
        $port++
    }
    return $port
}

function Resolve-Ports {
    $portKeys = @(
        'CADDY_PORT', 'CADDY_HTTPS_PORT', 'FRONTEND_PORT', 'BACKEND_PORT', 'POSTGRES_PORT',
        'MSSQL_PORT', 'REDIS_PORT', 'MAILPIT_SMTP_PORT', 'MAILPIT_UI_PORT', 'ADMINER_PORT'
    )
    # Belegte Ports auch untereinander erkennen: ein Port, der bei OS-Check gerade frei
    # aussieht (weil der eigene Container mit diesem Port noch nicht läuft), darf trotzdem
    # nicht zweimal an verschiedene Milepoint-Dienste im selben Lauf vergeben werden.
    $reservedPorts = [System.Collections.Generic.HashSet[int]]::new()
    foreach ($key in $portKeys) {
        $current = [int](Get-EnvValue -Path $EnvFile -Key $key)
        if ((Test-TcpPortFree $current) -and -not $reservedPorts.Contains($current)) {
            [void]$reservedPorts.Add($current)
            continue
        }
        $free = Find-FreePort ($current + 1) $reservedPorts
        Write-Host "Port $current ($key) ist belegt (fremder Prozess oder anderer Milepoint-Dienst) - weiche auf $free aus." -ForegroundColor Yellow
        Set-EnvValue -Path $EnvFile -Key $key -Value $free
        [void]$reservedPorts.Add($free)
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
            throw "Diese Services sind unhealthy: $($unhealthy -join ', '). Prüfe: docker compose -p milepoint logs <service>"
        }

        if ($pending.Count -eq 0) {
            Write-Host "Alle Services sind healthy." -ForegroundColor Green
            return
        }

        Write-Host "  ...warte noch auf: $($pending -join ', ')"
        Start-Sleep -Seconds 4
    }

    throw "Timeout beim Warten auf Healthchecks nach $TimeoutSeconds Sekunden. Prüfe: docker compose -p milepoint logs"
}

function Test-HttpEndpoint([string]$Url, [int]$TimeoutSeconds = 30, [switch]$IgnoreCertificateErrors) {
    # Windows PowerShell 5.1 has no -SkipCertificateCheck on Invoke-WebRequest (PS7+ only),
    # so trust-everything is done the old way via ServicePointManager - only while this
    # specific check runs, and only for our own known-self-signed local Caddy endpoint.
    $previousCallback = $null
    if ($IgnoreCertificateErrors) {
        $previousCallback = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    }

    try {
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
    finally {
        if ($IgnoreCertificateErrors) {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $previousCallback
        }
    }
}

function Test-CertificateTrusted([System.Security.Cryptography.X509Certificates.X509Certificate2]$Cert) {
    return [bool](Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $Cert.Thumbprint })
}

function Install-CaddyRootCertificate {
    # Caddy signs its "tls internal" certs with a self-generated local CA (siehe Caddyfile).
    # Ohne einmaligen Trust-Import warnt jeder Browser bei https://localhost - das hier holt
    # das nach, idempotent und ohne Admin-Rechte (nur aktueller Windows-Benutzer).
    #
    # $ErrorActionPreference lokal auf 'Continue': docker/certutil schreiben normale
    # Fortschrittsmeldungen auf stderr - unter PS 5.1 wird jede umgeleitete (2>) stderr-Zeile
    # eines nativen Programms in einen ErrorRecord verpackt, der bei 'Stop' (Skript-Default)
    # sofort einen NativeCommandError auslöst, obwohl der Exit-Code 0 ist. 'Continue' lässt
    # $LASTEXITCODE die eigentliche Erfolgsprüfung übernehmen. Gilt nur innerhalb dieser
    # Funktion (Function-Scope), das Skript-weite 'Stop' bleibt für alles andere unverändert.
    $ErrorActionPreference = 'Continue'
    $tempCert = Join-Path $env:TEMP "milepoint-caddy-root-$PID.crt"
    try {
        & docker compose -p $ProjectName --env-file $EnvFile cp "caddy:/data/caddy/pki/authorities/local/root.crt" $tempCert 2>$null
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tempCert)) {
            Write-Warning "Caddy-Root-Zertifikat konnte noch nicht gelesen werden - HTTPS-Warnung im Browser ggf. manuell beheben (docs/03-runbook.md, Abschnitt 'HTTPS lokal vertrauen')."
            return
        }

        $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($tempCert)
        if (Test-CertificateTrusted $cert) { return }

        Write-Host "`nImportiere lokales Caddy-HTTPS-Zertifikat in den Windows-Zertifikatspeicher (nur aktueller Benutzer)..." -ForegroundColor Yellow
        & certutil -user -addstore -f "ROOT" $tempCert | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Zertifikat importiert - Browser sollte https://localhost jetzt ohne Warnung akzeptieren (ggf. Browser neu starten)." -ForegroundColor Green
        }
        else {
            Write-Warning "certutil-Import fehlgeschlagen (Exit Code $LASTEXITCODE) - siehe docs/03-runbook.md, Abschnitt 'HTTPS lokal vertrauen'."
        }
    }
    finally {
        Remove-Item $tempCert -ErrorAction SilentlyContinue
    }
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

Set-GitHooksPath

$appVersion = Get-AppVersion
Write-VersionFile -Version $appVersion

$upArgs = @('up', '-d')
if (-not $NoBuild) { $upArgs += '--build' }

Write-Host "Starte Milepoint-Stack..." -ForegroundColor Cyan
Invoke-Compose $upArgs

Wait-ForHealth

$caddyPort = Get-EnvValue -Path $EnvFile -Key 'CADDY_PORT'
$caddyHttpsPort = Get-EnvValue -Path $EnvFile -Key 'CADDY_HTTPS_PORT'
$adminerPort = Get-EnvValue -Path $EnvFile -Key 'ADMINER_PORT'
$mailpitPort = Get-EnvValue -Path $EnvFile -Key 'MAILPIT_UI_PORT'
$adminUsername = Get-EnvValue -Path $EnvFile -Key 'ADMIN_USERNAME'
$adminPassword = Get-EnvValue -Path $EnvFile -Key 'ADMIN_INITIAL_PASSWORD'

$appUrl = "https://localhost:$caddyHttpsPort"
if (-not (Test-HttpEndpoint $appUrl -IgnoreCertificateErrors)) {
    Write-Warning "$appUrl antwortet noch nicht - Stack läuft, App ist evtl. noch am Hochfahren (Browser öffnet automatisch, sobald erreichbar)."
}

Install-CaddyRootCertificate

# Docker Desktops eigener Port-Link öffnet auch bei 443/8443 immer http:// statt https://
# (bekannter, seit Jahren offener Bug: github.com/docker/for-win/issues/13200) - hier wird
# deshalb direkt mit der richtigen URL im Standardbrowser geöffnet statt sich darauf zu verlassen.
# Als Background-Job, weil frisch neu gebundene Docker-Desktop-Portweiterleitungen unter Windows
# nach einem Container-Neustart teils erst nach 1-2 Minuten vom Host aus erreichbar sind, obwohl
# Caddy selbst längst antwortet - ein synchrones Warten würde das Skript entsprechend blockieren.
Start-Job -ScriptBlock {
    param($Url, $TimeoutSeconds)
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Start-Process $Url
                return
            }
        }
        catch {
            Start-Sleep -Seconds 3
        }
    }
} -ArgumentList $appUrl, 180 | Out-Null

Write-Host "`nMilepoint-Stack läuft ($appVersion):" -ForegroundColor Green
Write-Host "  App:      https://localhost:$caddyHttpsPort  (http://localhost:$caddyPort leitet automatisch um)"
Write-Host "  Adminer:  http://localhost:$adminerPort"
Write-Host "  Mailpit:  http://localhost:$mailpitPort"
Write-Host "`nBeim ersten Aufruf warnt der Browser vor dem Zertifikat (selbst ausgestellte, lokale CA von Caddy)."
Write-Host "Einmalig als vertrauenswürdig einrichten: siehe docs/03-runbook.md Abschnitt 'HTTPS lokal vertrauen'."
Write-Host "`nLogin (nur beim allerersten Anlegen des Admin-Kontos gültig):"
Write-Host "  Benutzername: $adminUsername"
Write-Host "  Passwort:     $adminPassword"
Write-Host "`nStoppen mit:  .\start.ps1 -Action stop"
Write-Host "Status mit:   .\start.ps1 -Action status"
Write-Host "Logs mit:     .\start.ps1 -Action logs"
