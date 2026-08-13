# Architektur-Entscheidungen (aus dem Rückfrage-Katalog, Stand 2026-08-12)

## MVP-Scope
- **Fokus MVP:** Issue-Tracking & Kanban (Aufgaben, Boards, Backlog, Labels/Prioritäten) — Fundament für alles Weitere.
- **Nach dem MVP geplant:** Time Tracking, Wiki/Docs, Automationen/Workflows, CI/CD-Status-Dashboard.
- **Tenancy:** Single-Team (ein Workspace, keine Mandantentrennung). Keine Multi-Tenant-Architektur in Phase 1.

## Datenbanken
- Postgres UND MSSQL laufen **immer parallel** im Docker-Stack.
- Die App wählt die aktive Datenbank über eine ENV-Var (Connection-String-Switch), kein Neustart der Container nötig zum Wechseln.
- Beide laufen als Linux-Container (MSSQL braucht keinen Windows-Container-Modus, siehe [00-system-audit.md](00-system-audit.md)).

## Auth
- Echtes Auth-System von Anfang an: **ASP.NET Core Identity + JWT**, mit seedbaren Testusern für die Dev-Umgebung.
- Kein Dummy-Login — die Basis soll direkt später produktionstauglich sein.
- **Login läuft über Benutzername + Passwort, nicht über E-Mail** (E-Mail wird bei der Registrierung trotzdem
  erfasst, z.B. für spätere Passwort-Reset-Mails über Mailpit/einen echten SMTP-Relay).
- Beim ersten Start wird automatisch ein Admin-Konto angelegt: fest `admin`/`admin` für die lokale
  Dev-Umgebung (dafür Passwort-Policy bewusst gelockert, siehe [03-runbook.md](03-runbook.md) — vor
  öffentlicher Nutzung wieder verschärfen).

## Rollen, IDs & Ticket-Nummern
- **Rollen (überarbeitet, `SystemAdmin` wieder entfernt):** `Admin` (nur Systemeinstellungen, kein
  Projekt-Zugriff automatisch), `Projektleiter` (sieht systemweit **alle** Projekte, unabhängig von
  Ersteller/Zuweisung), `User` (Standard — wer ein Projekt erstellt, wird automatisch dessen Owner). Der
  geseedete Admin-Account bekommt sowohl `Admin` als auch `Projektleiter`, neue Registrierungen automatisch
  `User`.
- **Projekt-Sichtbarkeit** (`GET /api/projects`): `Projektleiter` sieht alles; alle anderen sehen ein
  Projekt nur, wenn sie es erstellt haben ODER explizites Mitglied sind (`ProjectMember`,
  `POST/DELETE /api/projects/{id}/members`, nur Owner/Projektleiter) ODER mindestens eine Aufgabe darin
  zugewiesen bekommen haben.
- **Board-Spalten haben einen Typ** (`Todo`/`InProgress`/`Done`), unabhängig vom freien Namen — Default-Spalten
  bekommen ihn fest zugeordnet, eigene Spaltennamen per Schlüsselwort-Heuristik. Grundlage für die
  Dashboard-Fortschrittsberechnung (`ProjectDto`: `myAssignedTaskCount`/`myCompletedTaskCount`,
  `openTicketCount`, `completionPercent` — projektweit für den Owner, sonst nur die eigenen Aufgaben).
- **Project/Board/WorkItem-IDs**: git-artige 40-stellige SHA-1-Hashes statt GUID (siehe `HashIdGenerator`),
  weil man über diese Dinge redet/sie referenziert — anders als BoardColumn/Label/User, die GUID/Identity-
  Standard behalten.
- **Projekt-Kategorien (Web/App/Game/...) wurden wieder entfernt** — kurzzeitig eingeführt, dann als
  unnötige Komplexität verworfen. Projekt-Erstellung braucht nur noch Name + optionale Beschreibung; auf der
  Projekt-Kachel wird die gekürzte Hash-ID angezeigt (`shortId()`), kein separates Key-Feld mehr.
- **WorkItems bekommen stattdessen eine feste Referenz-Nummer** bei Erstellung: `TCK#00001` für Bug/Epic,
  `TSK#00001` für Task/Feature — je ein **globaler** Zähler (projektübergreifend, kein Projekt-Präfix mehr),
  einmal vergeben und nie neu berechnet (bleibt stabil auch wenn der Type später geändert wird).

## Timeline, Unteraufgaben, Meilensteine, Abhängigkeiten
- **Beim Öffnen eines Projekts ist die Timeline die Standard-Ansicht, Kanban bleibt als zweiter Tab** erreichbar
  (nicht entfernt) — Route `/projects/{projectId}`, Tabs `Timeline`/`Kanban` in `ProjectPage.tsx`.
- **Unteraufgaben:** `WorkItem` bekommt ein selbstreferenzierendes `ParentWorkItemId` (nullable), beliebig tief
  verschachtelbar (kein Limit). Die Timeline rendert daraus einen eingerückten Baum; neue Unteraufgaben werden
  über ein Formular direkt unter der jeweiligen Zeile angelegt.
- **Meilensteine sind ein eigenes, einfaches Modell** (`Milestone`: Name + Datum + optionale Beschreibung),
  bewusst **kein** `WorkItem` — erscheinen deshalb nie auf dem Kanban-Board, nur auf der Timeline
  (`GET/POST/DELETE /api/projects/{id}/milestones`).
- **Start-/Enddatum an Aufgaben sind beide optional** (`WorkItem.StartDate`/`DueDate`, beide `DateTimeOffset?`).
  Ohne Datum erscheint eine Aufgabe in der Timeline nur als Zeile ohne Balken.
- **Abhängigkeiten (Finish-to-Start):** `WorkItemDependency` (zusammengesetzter Key aus abhängiger und
  blockierender Aufgabe) erzwingt serverseitig, dass eine Aufgabe erst in eine `Done`-Spalte verschoben werden
  kann, wenn alle blockierenden Aufgaben selbst bereits in einer `Done`-Spalte sind — sonst `409 Conflict` mit
  den Titeln der noch offenen Blocker (`WorkItemsController.Move`,
  `POST/DELETE .../workitems/{id}/dependencies[/{blockingId}]`).
- **`GET /api/projects/{id}/timeline`** liefert projektweit (über alle Boards hinweg) alle WorkItems + Milestones
  in einer Antwort — die Timeline-Ansicht muss dafür nicht mehrere Boards einzeln abfragen.
- Timeline-UI bewusst als **funktionale eingerückte Liste mit proportionalen Balken** umgesetzt, nicht als
  Drag&Drop-Gantt-Chart mit Verbindungslinien — visuelle Politur bleibt wie beim Rest des Frontends Gemini
  überlassen.

## Branding
- **App-/Produktname: "Milepoint"** — entschieden nach Recherche auf Namenskollisionen (siehe Chat-Verlauf
  vom 2026-08-12): keine existierende PM-/B2B-Software mit diesem Namen gefunden, `milepoint.io` war zum
  Zeitpunkt der Prüfung nicht registriert (`milepoint.com` gehört einer thematisch unabhängigen
  Vielflieger-Advice-Seite, kein Software-Konkurrent). Eindeutige Aussprache war das ausschlaggebende
  Kriterium gegenüber der lateinischen Alternative "Facienda".
- **Copyright: © 2026 SynShift Labs** (GitHub-Identität für Commits, siehe Git-Konfiguration dieses Repos).
- **Hinweis:** Diese Recherche ist keine rechtsverbindliche Markenprüfung. Vor einer öffentlichen Nutzung des
  Namens sollte eine echte Markenrecherche (DPMA/EUIPO TMview) sowie eine Registrar-Prüfung der Domain erfolgen.
- **Umbenennung von "PM" auf "Milepoint" durchgeführt** (2026-08-12): Ordnername, Docker-Compose-Projektname
  (`milepoint`), C#-Namespace (`Milepoint.Api`), npm-Paketname (`milepoint-frontend`), JWT-Issuer/Audience
  (`milepoint-api`/`milepoint-client`), DB-Namen (`milepoint`/`Milepoint`) — alles umgestellt. Ausnahme: interne
  EF-Core-Klassennamen (`PmDbContextBase`, `PostgresPmDbContext`, `SqlServerPmDbContext`) behalten das "Pm"-Kürzel,
  um die bestehenden Migrationen nicht neu generieren zu müssen — rein internes Implementierungsdetail, nirgends
  sichtbar außerhalb des Backend-Codes.

## Versionierung
- Schema: `vYear.Release.Commit` (z.B. `v2026.0.42`) — `Year.Release` steht manuell in der Datei `VERSION` am
  Repo-Root, `Commit` wird von `start.ps1` bei jedem Start aus der Git-Commit-Anzahl berechnet und in `.env`
  als `APP_VERSION` geschrieben. Das Backend liefert die aktuelle Version unter `GET /api/version`.
- Release startet bei `0` (`2026.0`) für die laufende Vorab-/Scaffold-Phase; `2026.1` wird erst gesetzt, sobald
  ein erster fester Release-Stand steht.
- Bewusst kein separates Major/Minor: Für ein internes Dev-Tool ohne externe API-Konsumenten bringt die
  SemVer-Unterscheidung aktuell keinen Mehrwert.

## Realtime
- Kanban-Board synchronisiert live zwischen mehreren offenen Tabs/Nutzern über **SignalR** (WebSocket) von Anfang an.

## Zusatz-Docker-Services
- **Mailpit** — fängt vom Backend versendete Mails ab, Web-UI statt echtem Mailversand.
- **Redis** — Caching, Sessions, SignalR-Backplane (relevant sobald >1 Backend-Instanz).
- **Reverse Proxy (Caddy)** — ein Einstiegspunkt statt vieler Ports für Frontend/API/Tools.
- **Adminer** — Web-GUI für Postgres & MSSQL, kein Desktop-Tool nötig.

## Tooling / Repo
- **IDE:** VS Code — `.vscode/`-Setup mit Debug-Configs geplant.
- **Skript-Typ Start/Stopp:** natives PowerShell-Skript (`.ps1`), eine Datei, nutzt `Get-NetTCPConnection` für Port-Checks.
- **Repo-Hosting:** GitHub (lokales Repo wird passend für ein späteres GitHub-Remote vorbereitet, `.gitignore` etc.).

## Design/CSS
- Übernimmt eine andere KI (Nutzer-Entscheidung: Gemini). Claude beschränkt sich auf Struktur/Logik/Backend/Infra,
  liefert aber sauberes, mit Tailwind stylebares Markup vor.
- Empfehlung dazu: Gemini ist eine gute Wahl; alternativ v0 von Vercel, falls stark auf fertige React/Tailwind-Komponenten
  aus Screenshots/Prompts gesetzt wird. React = Struktur/Logik-Layer, Tailwind = Utility-CSS-Layer für's Styling — beide
  ergänzen sich, sind keine Alternative zueinander.

## Offene / nächste Schritte
1. **Blocker:** WSL2-Backend für Docker Desktop muss vom Nutzer aktiviert werden (`wsl --install`, Reboot, dann in
   Docker Desktop Settings → General → "Use the WSL 2 based engine"). Erfordert Admin-Rechte + Neustart — kann nicht
   automatisiert werden.
2. Nach dem Reboot: Git for Windows installieren (Versuch über winget), danach lokales Repo initialisieren.
3. Danach: `docker-compose.yml` + Dockerfiles für Backend (ASP.NET Core), Frontend (Vite+React+TS), Postgres, MSSQL,
   Redis, Mailpit, Caddy, Adminer aufsetzen.
4. Start/Stopp-PowerShell-Skript mit Port-Check (eigene alte Instanzen beenden, fremde Belegung → Ausweichport) und
   Healthcheck bauen.
