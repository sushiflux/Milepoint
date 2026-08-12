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
- App: `http://localhost:<CADDY_PORT>` (Default 80, bei Belegung automatisch höher, z.B. 81)
- Adminer (DB-GUI für Postgres & MSSQL): `http://localhost:<ADMINER_PORT>`
- Mailpit (abgefangene Mails): `http://localhost:<MAILPIT_UI_PORT>`
- Backend direkt (ohne Proxy): `http://localhost:<BACKEND_PORT>`
- Frontend direkt (ohne Proxy): `http://localhost:<FRONTEND_PORT>`

## Wichtige Falle beim Arbeiten an Backend-Migrationen (EF Core)

`docker-compose.yml` mountet `./backend` (inkl. `obj/`) in den Backend-Container, in dem `dotnet watch`
dauerhaft läuft. Führt man **gleichzeitig** auf dem Host `dotnet build`/`dotnet ef ...` aus, schreiben Host und
Container abwechselnd in dieselbe `obj/project.assets.json` — der Container trägt dort Linux-Pfade
(`/root/.nuget/packages/...`) ein, wodurch host-seitige `dotnet ef migrations add` mit
`NETSDK1064: Paket ... wurde nicht gefunden` fehlschlägt (sieht nach einem Pfadlängen-Problem aus, ist aber
dieser Host/Container-Wettlauf).

**Vorgehen für neue Migrationen:**
```powershell
docker compose -p pm stop backend        # Container-seitiges dotnet watch anhalten
cd backend\src\PM.Api
Remove-Item -Recurse -Force bin, obj     # sauberer Host-Build
cd ..\..
dotnet restore; dotnet build
cd src\PM.Api
dotnet ef migrations add <Name> --context PostgresPmDbContext -o Data/Migrations/Postgres
dotnet ef migrations add <Name> --context SqlServerPmDbContext -o Data/Migrations/SqlServer
cd ..\..\..
.\start.ps1                              # Backend-Container wieder hochfahren
```

Falls sich dabei das Datenbankschema ändert und alte Test-Volumes noch den vorherigen Migrationsstand
enthalten (Konflikt "relation already exists"), einmalig mit frischen Volumes neu starten:
```powershell
docker compose -p pm down -v
.\start.ps1
```
(`-v` löscht die Datenbank-Inhalte — nur für Dev-Daten unbedenklich, nicht für "echte" Daten verwenden.)

## Login / Admin-Zugang
Login läuft über **Benutzername + Passwort** (nicht E-Mail). Beim allerersten Start legt das Backend automatisch
ein Admin-Konto an (`ADMIN_USERNAME` aus `.env`, Standard `admin`) mit einem zufällig generierten Passwort, das
`start.ps1` am Ende jedes Starts anzeigt (`ADMIN_INITIAL_PASSWORD` in `.env`, dort auch jederzeit nachschaubar).
Das Konto wird nur angelegt, wenn der Username noch nicht existiert — ein späteres Ändern des Passworts in
`.env` legt also kein zweites Konto an.

Weitere Testuser jederzeit über `POST /api/auth/register` (Username, E-Mail, Passwort ≥ 8 Zeichen, Anzeigename),
z.B. direkt über die Login-Seite im Frontend.

## Versionierung
`start.ps1` berechnet bei jedem Start `vYear.Release.Commit` aus der Datei `VERSION` (Year.Release, manuell
gepflegt) + der aktuellen Git-Commit-Anzahl, schreibt es als `APP_VERSION` in `.env` und zeigt es in der
Start-Ausgabe. Abrufbar auch über `GET /api/version`.
