# Runbook: Dev-Stack starten/stoppen

## Alltag
```powershell
.\start.ps1                  # Start (baut bei Bedarf, prüft Ports, wartet auf Healthchecks)
.\start.ps1 -Action stop     # Stoppt den Stack, Datenbank-Volumes bleiben erhalten
.\start.ps1 -Action restart
.\start.ps1 -Action status
.\start.ps1 -Action logs
.\start.ps1 -Db mssql        # Backend auf MSSQL umschalten (Postgres/MSSQL laufen immer beide)
.\start.ps1 -Db postgres     # zurück auf Postgres
```

Beim ersten Start wird `.env` automatisch aus `.env.example` erzeugt (inkl. zufällig generierter
Passwörter/JWT-Secret). Sind konfigurierte Ports belegt (z.B. Port 80 durch IIS o.ä.), weicht das Skript
automatisch auf den nächsten freien Port aus und schreibt ihn in `.env` zurück — die tatsächlich verwendeten
Ports stehen am Ende der Ausgabe.

## URLs (Ports können je nach `.env` abweichen)
- App: `https://localhost:<CADDY_HTTPS_PORT>` (Default 443, bei Belegung automatisch höher). `http://localhost:<CADDY_PORT>` (Default 80) leitet automatisch dorthin um.
- Adminer (DB-GUI für Postgres & MSSQL): `http://localhost:<ADMINER_PORT>`
- Mailpit (abgefangene Mails): `http://localhost:<MAILPIT_UI_PORT>`
- Backend direkt (ohne Proxy): `http://localhost:<BACKEND_PORT>`
- Frontend direkt (ohne Proxy): `http://localhost:<FRONTEND_PORT>`

## HTTPS lokal vertrauen
Caddy terminiert TLS mit `tls internal` — da es keine echte öffentliche Domain gibt, kann kein Let's-Encrypt-
Zertifikat ausgestellt werden. Stattdessen erzeugt Caddy beim ersten Start eine eigene lokale CA und signiert
das Zertifikat für `localhost` selbst damit. Der Browser warnt deswegen beim ersten Aufruf ("Verbindung ist
nicht privat" o.ä.), bis diese CA einmalig als vertrauenswürdig importiert wird:

```powershell
docker compose -p milepoint cp caddy:/data/caddy/pki/authorities/local/root.crt .\caddy-local-root.crt

# Nur für den aktuellen Windows-Benutzer, keine Admin-Rechte nötig:
certutil -user -addstore -f "ROOT" .\caddy-local-root.crt

# Alternative für alle Benutzer auf diesem Rechner (PowerShell als Administrator):
certutil -addstore -f "ROOT" .\caddy-local-root.crt

Remove-Item .\caddy-local-root.crt
```

Die CA liegt im `caddy_data`-Docker-Volume und bleibt über Neustarts hinweg stabil (kein erneuter Import
nötig), außer nach `docker compose -p milepoint down -v`, was auch dieses Volume löscht.

## Wichtige Falle beim Arbeiten an Backend-Migrationen (EF Core)

`docker-compose.yml` mountet `./backend` (inkl. `obj/`) in den Backend-Container, in dem `dotnet watch`
dauerhaft läuft. Führt man **gleichzeitig** auf dem Host `dotnet build`/`dotnet ef ...` aus, schreiben Host und
Container abwechselnd in dieselbe `obj/project.assets.json` — der Container trägt dort Linux-Pfade
(`/root/.nuget/packages/...`) ein, wodurch host-seitige `dotnet ef migrations add` mit
`NETSDK1064: Paket ... wurde nicht gefunden` fehlschlägt (sieht nach einem Pfadlängen-Problem aus, ist aber
dieser Host/Container-Wettlauf).

**Vorgehen für neue Migrationen:**
```powershell
docker compose -p milepoint stop backend # Container-seitiges dotnet watch anhalten
cd backend\src\Milepoint.Api
Remove-Item -Recurse -Force bin, obj     # sauberer Host-Build
cd ..\..
dotnet restore; dotnet build
cd src\Milepoint.Api
dotnet ef migrations add <Name> --context PostgresPmDbContext -o Data/Migrations/Postgres
dotnet ef migrations add <Name> --context SqlServerPmDbContext -o Data/Migrations/SqlServer
cd ..\..\..
.\start.ps1                              # Backend-Container wieder hochfahren
```

Falls sich dabei das Datenbankschema ändert und alte Test-Volumes noch den vorherigen Migrationsstand
enthalten (Konflikt "relation already exists"), einmalig mit frischen Volumes neu starten:
```powershell
docker compose -p milepoint down -v
.\start.ps1
```
(`-v` löscht die Datenbank-Inhalte — nur für Dev-Daten unbedenklich, nicht für "echte" Daten verwenden.)

## Login / Admin-Zugang
Login läuft über **Benutzername + Passwort** (nicht E-Mail). Beim allerersten Start legt das Backend automatisch
ein Admin-Konto an: fest `admin` / `admin` (`ADMIN_USERNAME` / `ADMIN_INITIAL_PASSWORD` in `.env`, dort auch
änderbar). Bewusst simples Passwort für die lokale Dev-Umgebung — dafür wurde Identity's Passwort-Policy
gelockert (min. 5 Zeichen, keine Pflicht für Ziffer/Großbuchstabe/Sonderzeichen, siehe `Program.cs`). **Vor
jeder öffentlichen/produktiven Nutzung unbedingt wieder verschärfen.** Das Konto wird nur angelegt, wenn der
Username noch nicht existiert — ein späteres Ändern des Passworts in `.env` legt also kein zweites Konto an.

Weitere Testuser jederzeit über `POST /api/auth/register` (Username, E-Mail, Passwort ≥ 5 Zeichen, Anzeigename),
z.B. direkt über die Login-Seite im Frontend.

## Versionierung
Format `vYear.Release.Commit` (`VERSION`-Datei = Year.Release, manuell gepflegt, + aktuelle Git-Commit-Anzahl).
Wird nicht mehr nur bei `start.ps1`-Läufen aktualisiert, sondern live: `GET /api/version` liest
`backend/src/Milepoint.Api/version.txt` bei jedem Aufruf frisch (kein Neustart nötig). Ein getrackter Git-Hook
(`scripts/git-hooks/post-commit`, von `start.ps1` automatisch über `core.hooksPath` aktiviert) schreibt diese
Datei nach jedem Commit neu. `start.ps1` schreibt sie zusätzlich einmal selbst bei jedem Start, damit ein
frischer Klon auch vor dem ersten eigenen Commit eine korrekte Version zeigt.
