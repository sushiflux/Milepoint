# Developer-Changelog

**[English](#english) · [Deutsch](#deutsch)**

---

<a id="english"></a>
## English

_The German version follows below — [jump to it](#deutsch)._

Technical change log for Milepoint — every notable change, including internal refactors,
bugfixes with no user-facing effect, cleanup, and infrastructure updates. For the customer-facing
summary see [CHANGELOG.md](CHANGELOG.md). Version headers are `Year.Month.CommitOfTheYear`
(`CommitOfTheYear` = count of commits since Jan 1 of that year, resetting to 1 each new year) -
see the "Versioning scheme changed" entry below for how that's computed. The topmost section's
version is always computable (today's year/month plus the current year's commit count) even
before that commit actually exists yet, so it's headed with its real number rather than a
placeholder.

## v2026.9.68

📦 Dependencies

- **Added an optional, profile-gated Whisper speech-to-text service** for the upcoming
  voice-dictation feature:
  - `docker-compose.yml` gets a new `whisper` service
    (`onerahmet/openai-whisper-asr-webservice:v1.10.0`, confirmed the current latest stable tag
    on Docker Hub as of this check), gated behind `profiles: ["whisper"]` so it never starts on a
    plain `docker compose up` - most users stick with the browser-based (client-side)
    transcription provider and need no server-side ASR at all.
  - Configurable via `WHISPER_ASR_ENGINE` (default `openai_whisper`), `WHISPER_ASR_MODEL`
    (default `base`), `WHISPER_ASR_DEVICE` (default `cpu`, GPU path documented inline for later),
    and `WHISPER_PORT` (default `9000`); downloaded model weights persist across restarts via a
    new `whisper_models` volume.
  - Healthcheck hits `/docs` (the image has no dedicated `/health` endpoint, but `/docs` responds
    without needing a file upload, making it a reliable liveness probe).
  - `start.ps1` gets a `-WithWhisper` switch that adds `--profile whisper` to every
    `docker compose` invocation in `Invoke-Compose` (used by all of
    start/stop/restart/status/logs), so the whisper container starts/stops together with the
    rest of the stack only when explicitly requested - a plain `start.ps1 stop` never touches a
    separately-running whisper container. `Wait-ForHealth` also waits on `whisper`'s healthcheck
    when the switch is set.
  - **Verified end-to-end**, not just "container starts":
    - Pulled the image, waited for `docker inspect --format='{{.State.Health.Status}}'` to report
      `healthy`.
    - POSTed a synthetic 1-second 440Hz WAV to `POST /asr?task=transcribe&language=de&output=json`
      (also tested with `language=en`) as `multipart/form-data` with the file under field name
      `audio_file` - got back `200 OK` with `{"text": "", "segments": [], "language": "de"}`
      (empty text expected, it's a tone, not speech) and no errors in the container logs.
    - Confirmed via `GET /openapi.json` that the request field name (`audio_file`), and query
      params (`task`: transcribe/translate, `language`: full ISO-code enum including `de`,
      `output`: txt/vtt/srt/tsv/json, `initial_prompt`, `encode`) match what was used.
    - A `/detect-language` endpoint also exists for language-only detection without a full
      transcription.
    - Stopped and removed the container again afterward
      (`docker compose --profile whisper stop/rm whisper`) - it's optional infrastructure and
      wasn't left running after this verification pass; the `whisper_models` volume was left in
      place for a future start to reuse (nothing was downloaded into it during this CPU-based
      verification run since only the `/asr` route was hit, not a full model-loading
      transcription path, but the volume itself is a no-op to keep around empty).
  - `VERSIONS.md` gets a new row for the Whisper ASR Webservice image, linking to its Docker Hub
    tags page for future update checks.

## v2026.8.67

📝 Other

- **Re-investigated TypeScript 7.0, decided to keep waiting** (see `VERSIONS.md`):
  - Confirmed `typescript-eslint`'s canary build (`8.68.1-alpha.6`) still caps `typescript` at
    `<6.1.0`, no TS 7 work visible yet.
  - Root cause is deeper than a conservative peer range - TS 7.0 doesn't expose a stable
    programmatic API for tools to hook into.
  - Microsoft has said that lands in 7.1, which is itself still nightly-only (`7.1.0-dev.*`).
  - Documented in `VERSIONS.md` so the next check has the full context instead of re-deriving it.

## v2026.8.66

📦 Dependencies

- **Database engines upgraded, with backup/restore (not a wipe)**: PostgreSQL 17→18.6, SQL Server
  2022→2025.
  - Both engines' data volumes use a version-specific on-disk format, so the existing volumes
    (`postgres_data`, `mssql_data`, live data) couldn't just be pointed at the new images.
  - Each was backed up first (`pg_dump --format=custom` for Postgres, `BACKUP DATABASE` to a
    `.bak` for SQL Server, both copied out to `.backups/` on the host, gitignored), the volume
    recreated fresh, schema rebuilt via the app's own `Database.MigrateAsync()` startup call,
    then the backup restored into the new engine (`pg_restore --clean --if-exists`; `RESTORE
    DATABASE ... WITH REPLACE` for SQL Server, which also transparently upgrades the row-version
    format in place).
  - Row counts verified to match pre/post on both.
  - Postgres 18's official image changed its expected volume layout: it now wants a single mount
    at `/var/lib/postgresql` (not `.../data`) so it can manage a major-version-specific
    subdirectory itself (supports `pg_upgrade --link` without a mount-boundary in the way) -
    `docker-compose.yml`'s `postgres` volume mount updated accordingly, or the container refuses
    to start ("there appears to be PostgreSQL data in /var/lib/postgresql/data (unused
    mount/volume)").
  - Migrating the SQL Server side needed `dotnet ef database update --context
    SqlServerPmDbContext` run manually (temporarily overriding
    `DB_PROVIDER`/`ConnectionStrings__Mssql` via `docker exec -e`), since the app's own
    auto-migrate only runs for whichever provider `DB_PROVIDER` is actually set to (Postgres,
    normally) - `Program.cs` never touches the other context.
  - The globally-installed `dotnet-ef` CLI tool couldn't open a connection at all against the new
    SQL Server 2025 container (`SocketException (0x80004005): Success`, TCP error 35, despite the
    port being reachable and DNS resolving fine) - root cause not fully pinned down, but the
    actual running app (using the project's own referenced
    `Microsoft.EntityFrameworkCore.SqlServer 10.0.11`, not the separately-installed global tool)
    connected and migrated without issue when `DB_PROVIDER` was pointed at `mssql` for a normal
    `docker compose up` restart - so the schema was built that way instead, then the backup
    restored via `sqlcmd` directly.
- **Redis 7→8-alpine**: no code changes needed - Redis is only used for a health-check ping
  (`healthChecks.AddRedis`, `Program.cs`) here, no persisted data or cache correctness to worry
  about.
- **Node.js 22→24-alpine** (`frontend/Dockerfile.dev`) - Node 24 is the current Active LTS (22
  moved to Maintenance LTS).
- **Frontend toolchain bumped to latest across the board**:
  - React 19.0→19.2.8
  - Vite 6.0→8.2.2
  - Tailwind CSS 4.0→4.3.3
  - `@microsoft/signalr` 8→10
  - `react-router-dom` 7.1→7.18
  - ESLint 9→10
  - `eslint-plugin-react-hooks` 5→7
  - `globals` 15→17
  - `@types/*` to their matching latest
  - **TypeScript stayed at 6.0.3, not the latest 7.0.2**: TypeScript 7 is a from-scratch native
    (Go-based) compiler rewrite; `typescript-eslint`'s current peer range is `typescript:
    '>=4.8.4 <6.1.0'` (confirmed via `npm view typescript-eslint peerDependencies`), so 7.0
    would break linting outright (`npm install` fails ERESOLVE). 6.0.3 is the newest release
    still inside that supported range (the last classic-compiler release before 7.0) - a real
    major-version bump over the previously-installed 5.9.3, just not the very latest.
  - `eslint-plugin-react-hooks` 5→7 brought new stricter rules
    (`react-hooks/set-state-in-effect`, `react-hooks/static-components`,
    `react-hooks/immutability`, `react-hooks/refs`) that flag 14 pre-existing patterns across
    `NoteGraphView.tsx`, `NotesView.tsx`, `ProjectsPage.tsx`, and `TimelineView.tsx` (e.g.
    `TimelineView.tsx`'s `LabelRow` being declared as a component inside another component's
    render body) that passed under the old rule set. Left unfixed for now - flagged to the user
    as a separate follow-up rather than bundled into a version-bump change; `npm run build`
    (which only runs `tsc -b && vite build`, not lint) is unaffected.

## v2026.8.65

📝 Other

- **Versioning scheme changed: manually-bumped `VERSION` base → `Year.Month.CommitOfTheYear`**,
  mirroring Fluxo.
  - `VERSION` (repo root, previously a hand-maintained `major.minor`-ish string read by both
    `scripts/git-hooks/post-commit` and `start.ps1`'s `Get-AppVersion`) removed entirely - the
    version is now computed purely from the current year/month plus the count of commits since
    Jan 1 of that year, no manual bump ever needed.
  - Multiple commits within the same year just increment the last segment (e.g. `.19` → `.37`);
    the first commit of a new calendar year resets it back to `.1`.
  - `backend/.../Program.cs`'s `/api/version` fallback stays `v0.0.0`, matching the 3-segment
    scheme.
- **Introduced this file and `CHANGELOG.md`**, structured like Fluxo's (bilingual EN/DE via
  `#english`/`#deutsch` anchors, one section per version with a fixed category set, "Current" for
  not-yet-committed work). Backfilled with the last few days of actual commit history, using each
  entry's real `git rev-list --count` at the time to assign it to the version it actually shipped
  under, rather than lumping everything under one undated bucket.
- **Introduced `VERSIONS.md`**: a live, always-current snapshot table (not history) of every major
  runtime/framework/tool version in use, with a link to check for updates per row.

## v2026.8.64

🔧 Fix

- **Session-expiry data loss** (commit `53f37fb`):
  - `api/client.ts`'s `apiFetch` used to hard-navigate (`window.location.href = '/login'`) on any
    401, instantly unmounting the whole React tree and discarding unsaved component state.
  - Replaced with `window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))`; `AuthContext` listens
    and exposes `sessionExpired`, and a new `SessionExpiredModal` (mounted outside `<Routes>` in
    `App.tsx` so nothing underneath it unmounts) prompts for the password in place.
  - `KanbanBoard.tsx`'s `handleMove` call site gained a `.catch(() => undefined)` since it
    previously relied on the hard-navigation to mask an unhandled promise rejection on failure.

## v2026.8.63

✨ New

- **WBS numbering and parent/child connectors** (`c3559b2`, `d38ae7b`, `c5a4238`):
  - `buildRows` in `TimelineView.tsx` now assigns an outline number (`1`, `1.1`, `1.2`, ...) to
    each Task/Phase row in the same recursive pass that builds the row list, purely from
    render-time tree order (not persisted).
  - A `parentChildConnectors` `useMemo` draws an SVG polyline from a Task's end date through a
    half-circle marker on each Task-type subtask's bar, in row order; routing went through
    several iterations (direct diagonal → right-angled trunk → late-kink-per-child → dashed
    pass-through segments for the 2nd+ subtask → a short elbow stub for a visible 90° corner).
  - Connector color is assigned per-Phase via `phaseColorClassById`, cycling through a palette
    deliberately disjoint from the status/priority color sets (see below).
- **Cascading subtask date rules**:
  - `minStartForParent` now adds one day to the parent's end date instead of using the same day.
  - `commitDateChange` computes a `deltaFinish` (how far the dragged parent's end date moved) and
    walks `itemsByParent` to shift every Task descendant's start/finish by the same delta,
    preserving whatever day-gap they already had - independent of, and layered on top of, the
    existing `computeCascadeShifts` blocking-dependency cascade.
  - Live preview during the drag itself (not just after drop) is handled by `liveFinishDelta`,
    which `effectiveRange` now consults for any item that isn't the one directly being dragged but
    is a descendant of it.
  - A live "invisible wall" clamp was added to `effectiveRange` too, so dragging a subtask can't
    pull its start before the parent's end+1 while the drag is in progress, not just on drop.
- **Row density** (`c5a4238`): `ROW_HEIGHT`/bar-height literals replaced with
  `ROW_HEIGHT_BY_DENSITY`/`BAR_HEIGHT_BY_DENSITY` lookups keyed by a `Density` preference
  (`small`/`medium`/`large`, `small` = the original fixed 32/20 size so existing users see no
  change).
- **Settings page** (`1fcc917`):
  - New route `/settings` (`SettingsPage.tsx`), linked from `Header.tsx`'s user-menu dropdown.
  - The Timeline bar-color mode preference (`timelineBarColorMode`) moved here from a Timeline
    action-bar toggle; its type/options/default live in `lib/timelinePreferences.ts` as a shared
    source of truth between the two.
- **Dashboard Timeline/Kanban composition split** (`ee59787`):
  - `ProjectsController.ToDto` now computes `TimelineItemCount`/`KanbanOnlyItemCount` (same
    population as `CompletionPercent` - all items if owner, else just the caller's tasks) plus
    per-column `OpenTimelineCount`/`OpenKanbanOnlyCount` and their `My...` equivalents, via a
    shared `SplitTimelineVsKanban` helper (`w.StartDate is not null || w.DueDate is not null`).
  - `ColumnTicketCountDto` gained `TimelineCount`/`KanbanOnlyCount` fields alongside the existing
    `Count`.
  - Frontend: the dashboard progress bar's filled width stayed tied to `completionPercent`, but
    the fill itself is now two-toned by composition instead of one flat color; went through a
    color pass (brand-primary/brand-accent read as too high-contrast → settled on a monochromatic
    indigo pair, light/dark of the same hue).

🔄 Change

- **Status/priority color unification** (`0f0571f`):
  - `STATUS_DOT`/`STATUS_BAR_COLOR` (Timeline) and `COLUMN_BORDER_COLORS` (Kanban) both switched
    to yellow/blue/green (Todo/InProgress/Done) plus red for `pausiert`/`blockiert` name-matches.
  - `PRIORITY_DOT`/`PRIORITY_COLORS` reworked (Medium: sky→violet, High: amber→orange, Urgent:
    red→rose in Timeline to match Kanban's existing rose) so no priority color collides with a
    status color.
  - Tried moving status/priority onto the bar itself (a stripe + dot) but the bar's left edge was
    already crowded (resize handle, blocked-dependency border, connector half-dot on subtasks);
    reverted to compact label columns (dot only, no text, tooltip) instead.
- Widened `COL_ID` (64→88px) so `TSK#00042`-style reference codes don't truncate; gave the last
  label column (`COL_PRIORITY`) extra right padding so it doesn't sit flush against the chart
  edge.

🔧 Fix

- **Timeline drag-handle mis-detection**: `handlePointerDown` checked
  `event.target.dataset.handle` directly - clicking the visible grab-indicator line (a child
  `<div>` of the actual handle, with no `data-handle` of its own) fell through to `'move'` mode
  instead of `'resize-start'`/`'resize-end'`. Fixed via `event.target.closest('[data-handle]')`.
- **Timeline drag jitter/stuck-grab** (`b35465a`):
  - `handlePointerUp` used to call `setDrag(null)` synchronously before `commitDateChange`'s
    network round-trip resolved, so the bar rendered its old (pre-drag) position for one frame -
    based on stale `workItems` - before jumping again once `onWorkItemsChange` landed.
  - `drag` now stays set until the commit's promise settles (`.finally(() => setDrag(null))`).
  - Added a `handlePointerCancel`, mirroring `handlePointerUp` but without committing, since a
    lost/aborted pointer capture (browser-triggered `pointercancel`, no matching `pointerup`)
    previously left `drag` stuck indefinitely.

## v2026.8.56

✨ New

- **Kanban search/sort/filter toolbar** (`d4bcb5e`): reused the Timeline's action-bar pattern -
  live text search plus a filter popover (status/priority/assignee) with active-filter chips.
- **Kanban card edit/delete, three ways** (`b95007778`): a right-click context menu, hover-reveal
  icon buttons on the card, and drag-to-a-trash-zone that appears while a card is being dragged.
- Notes field on Kanban card creation; priority and category can now be set at creation time too
  (`9ea182f`).

🔄 Change

- **Full-width, responsive Kanban columns** (`b95007778`): fixed-width columns replaced with
  `flex-1 min-w-0`, so the board fills whatever width is available instead of clipping the last
  column on wide monitors.
- **DB-backed `UserPreference` system** (`60a6b88`) replacing scattered `localStorage` reads:
  - New `UserPreference` entity + `PreferencesController` (`GET`/`PUT /api/preferences`),
    Postgres/SqlServer migrations, and a `PreferencesContext` (`getPreference`/`setPreference`)
    wired into `main.tsx`.
  - `localStorage` is kept only as a synchronous pre-React mirror for the theme (to avoid a
    flash-of-wrong-theme before the DB value loads) - DB stays authoritative everywhere else.
- `eligibleParentItems` (`TimelineView.tsx`, `3765dce`): the "übergeordnete Aufgabe"/
  "übergeordnetes Element" pickers now filter to items that actually render a Timeline row (has a
  date, or is a Phase) and, for Tasks, aren't already in a Done column - previously listed every
  `workItems` entry unfiltered, including finished tasks and dateless Kanban-only cards.
- Dashboard total badge (`b95007778`): `TicketBadgeRow` sums `openTicketsByColumn` into one
  "Gesamt" pill shown alongside the per-column ones.

🔧 Fix

- **Timeline showing stale status after a Kanban move** (`41b3ffc`): `handleMove` in
  `KanbanBoard.tsx` updated `columnId` but left `columnName`/`columnType` (denormalized copies the
  Timeline reads directly, since it looks up by those rather than re-resolving `columnId` against
  `board.columns`) pointing at the old column until a full reload.
- Dark-mode `<select>` styling (`9ea182f`): native option popups ignored the app's dark theme
  (`color-scheme` doesn't reach OS-rendered dropdown chrome) - added explicit
  `option`/`.dark option` background/text rules in `index.css`.
- SignalR enum serialization: `AddSignalR().AddJsonProtocol` needed its own
  `JsonStringEnumConverter`, separate from the one already registered on
  `AddControllers().AddJsonOptions` - SignalR doesn't share that pipeline.

---

<a id="deutsch"></a>
## Deutsch

Technisches Änderungsprotokoll für Milepoint — jede nennenswerte Änderung, inklusive interner
Refactorings, Bugfixes ohne Nutzer-Auswirkung, Aufräumarbeiten und Infrastruktur-Updates. Für die
kundenseitige Zusammenfassung siehe [CHANGELOG.md](CHANGELOG.md). Versions-Überschriften folgen
`Year.Month.CommitOfTheYear` (`CommitOfTheYear` = Anzahl der Commits seit dem 1. Januar des
jeweiligen Jahres, startet bei jedem neuen Jahr wieder bei 1) - siehe den Eintrag
„Versionsschema geändert" unten für die genaue Berechnung. Die Version des obersten Abschnitts
lässt sich immer berechnen (aktuelles Jahr/Monat plus die Commit-Anzahl dieses Jahres), auch
bevor dieser Commit tatsächlich existiert - deshalb steht dort die echte Nummer statt eines
Platzhalters.

## v2026.9.68

📦 Abhängigkeiten

- **Optionalen, profilgesteuerten Whisper-Speech-to-Text-Dienst hinzugefügt** für die geplante
  Voice-Dictation-Funktion:
  - `docker-compose.yml` erhält einen neuen `whisper`-Service
    (`onerahmet/openai-whisper-asr-webservice:v1.10.0`, geprüft und bestätigt als aktuell
    neuester stabiler Tag auf Docker Hub zum Zeitpunkt dieser Prüfung), abgesichert über
    `profiles: ["whisper"]`, sodass er bei einem normalen `docker compose up` nie startet - die
    meisten Nutzer verwenden den Browser-basierten (clientseitigen) Transkriptions-Provider und
    brauchen gar keine serverseitige ASR.
  - Konfigurierbar über `WHISPER_ASR_ENGINE` (Standard `openai_whisper`), `WHISPER_ASR_MODEL`
    (Standard `base`), `WHISPER_ASR_DEVICE` (Standard `cpu`, GPU-Pfad für später inline
    dokumentiert) sowie `WHISPER_PORT` (Standard `9000`); heruntergeladene Modellgewichte bleiben
    über Neustarts hinweg in einem neuen `whisper_models`-Volume erhalten.
  - Der Healthcheck prüft `/docs` (das Image hat keinen eigenen `/health`-Endpunkt, aber `/docs`
    antwortet ohne Datei-Upload, was es zu einer zuverlässigen Liveness-Prüfung macht).
  - `start.ps1` erhält einen `-WithWhisper`-Schalter, der `--profile whisper` zu jedem
    `docker compose`-Aufruf in `Invoke-Compose` hinzufügt (verwendet von allen
    start/stop/restart/status/logs-Pfaden), sodass der Whisper-Container nur bei explizitem
    Wunsch zusammen mit dem restlichen Stack startet/stoppt - ein normales `start.ps1 stop` rührt
    einen separat laufenden Whisper-Container nie an. `Wait-ForHealth` wartet bei gesetztem
    Schalter zusätzlich auf den Healthcheck von `whisper`.
  - **End-to-End verifiziert**, nicht nur "Container startet":
    - Image gepullt, gewartet, bis `docker inspect --format='{{.State.Health.Status}}'` `healthy`
      meldet.
    - Eine synthetische 1-Sekunden-440Hz-WAV per
      `POST /asr?task=transcribe&language=de&output=json` (auch mit `language=en` getestet) als
      `multipart/form-data` mit der Datei im Feld `audio_file` gesendet - Antwort `200 OK` mit
      `{"text": "", "segments": [], "language": "de"}` (leerer Text erwartet, da Ton statt
      Sprache) und keine Fehler in den Container-Logs.
    - Über `GET /openapi.json` bestätigt, dass Feldname (`audio_file`) und Query-Parameter
      (`task`: transcribe/translate, `language`: vollständiges ISO-Code-Enum inkl. `de`,
      `output`: txt/vtt/srt/tsv/json, `initial_prompt`, `encode`) mit dem Verwendeten
      übereinstimmen.
    - Zusätzlich existiert ein `/detect-language`-Endpunkt für reine Spracherkennung ohne volle
      Transkription.
    - Danach Container wieder gestoppt und entfernt
      (`docker compose --profile whisper stop/rm whisper`) - optionale Infrastruktur, blieb nach
      dieser Verifikation nicht laufen; das `whisper_models`-Volume wurde für einen künftigen
      Start belassen (in diesem CPU-basierten Verifikationslauf wurde nichts hineingeladen, da
      nur die `/asr`-Route getroffen wurde, kein vollständiger Modell-Ladepfad einer echten
      Transkription - das leere Volume selbst zu behalten ist aber ein No-Op).
  - `VERSIONS.md` erhält eine neue Zeile für das Whisper-ASR-Webservice-Image mit Link zur
    Docker-Hub-Tags-Seite für künftige Update-Prüfungen.

## v2026.8.67

📝 Sonstiges

- **TypeScript 7.0 erneut geprüft, Entscheidung bleibt: abwarten** (siehe `VERSIONS.md`):
  - Bestätigt, dass `typescript-eslint`s Canary-Build (`8.68.1-alpha.6`) `typescript` weiterhin
    auf `<6.1.0` deckelt, keine sichtbare Vorarbeit für TS 7.
  - Der eigentliche Grund liegt tiefer als nur ein konservativer Peer-Bereich - TS 7.0 bietet
    noch keine stabile programmatische API, über die Tools reinhaken könnten.
  - Laut Microsoft kommt die mit 7.1, die selbst noch nur als Nightly existiert (`7.1.0-dev.*`).
  - In `VERSIONS.md` dokumentiert, damit die nächste Prüfung den vollen Kontext hat statt ihn neu
    herzuleiten.

## v2026.8.66

📦 Abhängigkeiten

- **Datenbank-Engines aktualisiert, mit Backup/Restore (kein Wipe)**: PostgreSQL 17→18.6, SQL
  Server 2022→2025.
  - Beide Engines nutzen ein versionsspezifisches Datenformat auf der Platte, die bestehenden
    Volumes (`postgres_data`, `mssql_data`, Live-Daten) konnten also nicht einfach auf die neuen
    Images gezeigt werden.
  - Zuerst gesichert (`pg_dump --format=custom` für Postgres, `BACKUP DATABASE` in eine
    `.bak`-Datei für SQL Server, beide auf den Host nach `.backups/` kopiert, gitignored), das
    Volume frisch neu angelegt, Schema über den eigenen `Database.MigrateAsync()`-Aufruf der App
    beim Start wieder aufgebaut, dann das Backup in die neue Engine zurückgespielt
    (`pg_restore --clean --if-exists`; `RESTORE DATABASE ... WITH REPLACE` bei SQL Server, was
    dabei auch transparent das Zeilenversions-Format upgraded).
  - Datensätze vor/nach Abgleich geprüft, stimmen überein.
  - Postgres 18s offizielles Image hat das erwartete Volume-Layout geändert: erwartet jetzt einen
    einzelnen Mount unter `/var/lib/postgresql` (nicht `.../data`), damit es selbst ein
    major-versionsspezifisches Unterverzeichnis verwalten kann (ermöglicht `pg_upgrade --link`
    ohne Mount-Grenze im Weg) - `docker-compose.yml`s `postgres`-Volume-Mount entsprechend
    angepasst, sonst verweigert der Container den Start ("there appears to be PostgreSQL data in
    /var/lib/postgresql/data (unused mount/volume)").
  - Die Migration der SQL-Server-Seite brauchte ein manuelles `dotnet ef database update --context
    SqlServerPmDbContext` (mit temporär überschriebenem
    `DB_PROVIDER`/`ConnectionStrings__Mssql` via `docker exec -e`), da die eigene Auto-Migration
    der App nur für den gerade aktiven `DB_PROVIDER` läuft (normalerweise Postgres) -
    `Program.cs` fasst den anderen Kontext nie an.
  - Das global installierte `dotnet-ef`-CLI-Tool konnte gar keine Verbindung zum neuen
    SQL-Server-2025-Container aufbauen (`SocketException (0x80004005): Success`, TCP-Fehler 35,
    obwohl der Port erreichbar war und DNS sauber auflöste) - Ursache nicht abschließend geklärt,
    aber die tatsächlich laufende App (nutzt das eigene referenzierte
    `Microsoft.EntityFrameworkCore.SqlServer 10.0.11`, nicht das separat installierte globale
    Tool) verband und migrierte problemlos, als `DB_PROVIDER` bei einem normalen
    `docker compose up`-Neustart auf `mssql` zeigte - das Schema wurde also so aufgebaut, danach
    das Backup direkt per `sqlcmd` zurückgespielt.
- **Redis 7→8-alpine**: keine Code-Änderung nötig - Redis wird hier nur für einen
  Health-Check-Ping genutzt (`healthChecks.AddRedis`, `Program.cs`), keine persistierten Daten
  oder Cache-Korrektheit zu beachten.
- **Node.js 22→24-alpine** (`frontend/Dockerfile.dev`) - Node 24 ist die aktuelle Active LTS (22
  ist auf Maintenance LTS gewechselt).
- **Frontend-Toolchain komplett auf den neuesten Stand gebracht**:
  - React 19.0→19.2.8
  - Vite 6.0→8.2.2
  - Tailwind CSS 4.0→4.3.3
  - `@microsoft/signalr` 8→10
  - `react-router-dom` 7.1→7.18
  - ESLint 9→10
  - `eslint-plugin-react-hooks` 5→7
  - `globals` 15→17
  - `@types/*` auf die jeweils passende neueste Version
  - **TypeScript blieb bei 6.0.3, nicht beim neuesten 7.0.2**: TypeScript 7 ist ein von Grund auf
    neuer nativer (Go-basierter) Compiler; `typescript-eslint`s aktueller Peer-Bereich ist
    `typescript: '>=4.8.4 <6.1.0'` (bestätigt über `npm view typescript-eslint
    peerDependencies`), 7.0 würde das Linting also komplett kaputt machen (`npm install`
    schlägt mit ERESOLVE fehl). 6.0.3 ist die neueste Version noch innerhalb dieses
    unterstützten Bereichs (die letzte Release mit dem klassischen Compiler vor 7.0) - ein
    echter Major-Sprung gegenüber dem vorher installierten 5.9.3, nur nicht das allerneueste.
  - `eslint-plugin-react-hooks` 5→7 brachte neue, strengere Regeln
    (`react-hooks/set-state-in-effect`, `react-hooks/static-components`,
    `react-hooks/immutability`, `react-hooks/refs`), die 14 bestehende Muster über
    `NoteGraphView.tsx`, `NotesView.tsx`, `ProjectsPage.tsx` und `TimelineView.tsx` hinweg
    markieren (z. B. `TimelineView.tsx`s `LabelRow`, die als Komponente innerhalb des
    Render-Bodys einer anderen Komponente deklariert ist), die unter dem alten Regelwerk
    durchgingen. Vorerst unbehoben gelassen - dem Nutzer als separates Follow-up gemeldet statt
    in eine Versions-Update-Änderung gebündelt; `npm run build` (läuft nur `tsc -b && vite
    build`, kein Lint) ist davon nicht betroffen.

## v2026.8.65

📝 Sonstiges

- **Versionsschema geändert: manuell gepflegte `VERSION`-Basis → `Year.Month.CommitOfTheYear`**,
  analog zu Fluxo.
  - `VERSION` (Repo-Root, bisher ein von Hand gepflegter „major.minor"-artiger String, gelesen von
    `scripts/git-hooks/post-commit` und `start.ps1`s `Get-AppVersion`) vollständig entfernt - die
    Version wird jetzt rein aus dem aktuellen Jahr/Monat plus der Commit-Anzahl seit dem 1. Januar
    dieses Jahres berechnet, kein manuelles Hochzählen mehr nötig.
  - Mehrere Commits innerhalb desselben Jahres erhöhen einfach das letzte Segment (z. B. `.19` →
    `.37`); der erste Commit eines neuen Kalenderjahres setzt es wieder auf `.1` zurück.
  - Der `/api/version`-Fallback in `backend/.../Program.cs` bleibt bei `v0.0.0`, passend zum
    3-Segment-Schema.
- **Diese Datei und `CHANGELOG.md` eingeführt**, aufgebaut wie bei Fluxo (zweisprachig EN/DE über
  `#english`/`#deutsch`-Anker, ein Abschnitt pro Version mit festem Kategorien-Set). Rückwirkend
  mit den letzten Tagen echter Commit-Historie befüllt, wobei jeder Eintrag über sein
  tatsächliches `git rev-list --count` der Version zugeordnet wurde, unter der er wirklich
  ausgeliefert wurde, statt alles in einem undatierten Topf zu sammeln.
- **`VERSIONS.md` eingeführt**: eine live, immer aktuelle Übersichtstabelle (keine Historie) jeder
  wichtigen Runtime-/Framework-/Tool-Version im Einsatz, mit Link zum Prüfen auf Updates pro
  Zeile.

## v2026.8.64

🔧 Behoben

- **Datenverlust bei Sitzungsablauf** (Commit `53f37fb`):
  - `api/client.ts`s `apiFetch` hat bei jedem 401 hart navigiert
    (`window.location.href = '/login'`), was den gesamten React-Baum sofort ausgehängt und
    ungespeicherten Komponentenzustand verworfen hat.
  - Ersetzt durch `window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))`; `AuthContext` hört
    darauf und stellt `sessionExpired` bereit, ein neues `SessionExpiredModal` (außerhalb von
    `<Routes>` in `App.tsx` eingehängt, damit darunter nichts aushängt) fragt das Passwort direkt
    vor Ort ab.
  - `KanbanBoard.tsx`s `handleMove`-Aufrufstelle hat jetzt ein `.catch(() => undefined)`, da sie
    sich zuvor auf die harte Navigation verlassen hat, um eine unbehandelte Promise-Ablehnung bei
    Fehlern zu verdecken.

## v2026.8.63

✨ Neu

- **WBS-Nummerierung und Eltern/Kind-Connectors** (`c3559b2`, `d38ae7b`, `c5a4238`):
  - `buildRows` in `TimelineView.tsx` vergibt jetzt in demselben rekursiven Durchlauf, der die
    Zeilenliste aufbaut, eine fortlaufende Nummer (`1`, `1.1`, `1.2`, ...) an jede
    Task-/Phase-Zeile - rein aus der Baumreihenfolge zur Render-Zeit, nicht persistiert.
  - Ein `parentChildConnectors`-`useMemo` zeichnet eine SVG-Polylinie vom Enddatum einer Aufgabe
    durch einen Halbkreis-Marker auf jedem Task-Unteraufgaben-Balken, in Zeilenreihenfolge; das
    Routing durchlief mehrere Iterationen (direkte Diagonale → rechtwinkliger Trunk → später Knick
    pro Kind → gestrichelte Durchgangs-Segmente ab der 2. Unteraufgabe → ein kurzer Ellbogen-Stub
    für einen sichtbaren 90°-Winkel).
  - Die Connector-Farbe wird pro Phase über `phaseColorClassById` vergeben, aus einer Palette, die
    bewusst getrennt von den Status-/Prioritäts-Farbsets gehalten wird (siehe unten).
- **Kaskadierende Datumsregeln für Unteraufgaben**:
  - `minStartForParent` addiert jetzt einen Tag zum Enddatum der übergeordneten Aufgabe, statt
    denselben Tag zu verwenden.
  - `commitDateChange` berechnet ein `deltaFinish` (wie weit sich das Enddatum der gezogenen
    Aufgabe verschoben hat) und läuft über `itemsByParent`, um jede Task-Unteraufgabe um denselben
    Delta zu verschieben - unabhängig von und zusätzlich zur bestehenden
    `computeCascadeShifts`-Kaskade für Blocker-Abhängigkeiten.
  - Die Live-Vorschau während des Drags selbst (nicht erst nach dem Loslassen) übernimmt
    `liveFinishDelta`, das `effectiveRange` jetzt auch für Elemente konsultiert, die nicht selbst
    gezogen werden, aber ein Nachfahre des gezogenen Elements sind.
  - Zusätzlich eine live „unsichtbare Wand" in `effectiveRange` ergänzt, damit eine Unteraufgabe
    schon während des Ziehens nicht vor Elternende+1 gezogen werden kann, nicht erst beim
    Loslassen.
- **Zeilendichte** (`c5a4238`): `ROW_HEIGHT`/Balkenhöhen-Literale durch
  `ROW_HEIGHT_BY_DENSITY`/`BAR_HEIGHT_BY_DENSITY`-Lookups ersetzt, gesteuert über eine
  `Density`-Präferenz (`small`/`medium`/`large`, `small` = die ursprüngliche feste 32/20-Größe,
  damit bestehende Nutzer:innen keine Änderung sehen).
- **Einstellungen-Seite** (`1fcc917`):
  - Neue Route `/settings` (`SettingsPage.tsx`), verlinkt aus `Header.tsx`s Benutzermenü.
  - Die Präferenz für den Timeline-Balkenfarbmodus (`timelineBarColorMode`) ist von einem
    Action-Bar-Toggle hierher umgezogen; Typ/Optionen/Default liegen in
    `lib/timelinePreferences.ts` als gemeinsame Quelle für beide.
- **Dashboard Timeline/Kanban-Zusammensetzung** (`ee59787`):
  - `ProjectsController.ToDto` berechnet jetzt `TimelineItemCount`/`KanbanOnlyItemCount` (gleiche
    Grundgesamtheit wie `CompletionPercent` - alle Items falls Owner, sonst nur die eigenen
    Aufgaben) sowie pro Spalte `OpenTimelineCount`/`OpenKanbanOnlyCount` und deren
    `My...`-Pendants, über einen gemeinsamen `SplitTimelineVsKanban`-Helper
    (`w.StartDate is not null || w.DueDate is not null`).
  - `ColumnTicketCountDto` hat jetzt zusätzlich `TimelineCount`/`KanbanOnlyCount` neben dem
    bestehenden `Count`.
  - Frontend: Die Füllbreite des Dashboard-Fortschrittsbalkens blieb an `completionPercent`
    gekoppelt, die Füllung selbst ist jetzt aber zweifarbig nach Zusammensetzung statt einer
    Flat-Farbe; durchlief eine Farbrunde (Brand-Primary/Brand-Accent wirkte zu kontrastreich →
    einfarbiges Indigo-Paar, hell/dunkel desselben Farbtons).

🔄 Geändert

- **Vereinheitlichung Status-/Prioritätsfarben** (`0f0571f`):
  - `STATUS_DOT`/`STATUS_BAR_COLOR` (Timeline) und `COLUMN_BORDER_COLORS` (Kanban) wechselten
    beide zu Gelb/Blau/Grün (Todo/InProgress/Done) plus Rot für `pausiert`/`blockiert`-Namenstreffer.
  - `PRIORITY_DOT`/`PRIORITY_COLORS` überarbeitet (Mittel: Sky→Violett, Hoch: Amber→Orange,
    Dringend: Rot→Rosé in der Timeline, passend zum bereits bestehenden Rosé im Kanban), damit
    keine Prio-Farbe mit einer Status-Farbe kollidiert.
  - Versucht, Status/Prio auf den Balken selbst zu legen (Streifen + Punkt), aber der linke
    Balkenrand war bereits belegt (Resize-Handle, Blocked-Dependency-Rahmen,
    Connector-Halbdot bei Unteraufgaben); zurückgerollt zu kompakten Label-Spalten (nur Punkt,
    kein Text, Tooltip).
- `COL_ID` verbreitert (64→88px), damit Referenzcodes im Stil `TSK#00042` nicht abgeschnitten
  werden; letzter Label-Spalte (`COL_PRIORITY`) mehr rechten Abstand gegeben, damit sie nicht
  direkt an der Diagrammkante klebt.

🔧 Behoben

- **Fehlerkennung des Timeline-Drag-Handles**: `handlePointerDown` prüfte
  `event.target.dataset.handle` direkt - ein Klick auf den sichtbaren Griff-Strich (ein
  Kind-`<div>` des eigentlichen Handles, ohne eigenes `data-handle`) fiel auf `'move'` zurück
  statt auf `'resize-start'`/`'resize-end'`. Behoben über `event.target.closest('[data-handle]')`.
- **Timeline-Drag-Zucken/hängenbleibendes Greifen** (`b35465a`):
  - `handlePointerUp` rief `setDrag(null)` bisher synchron auf, bevor die Netzwerk-Antwort von
    `commitDateChange` da war, wodurch der Balken für einen Frame seine alte (Vor-Drag-)Position
    zeigte - basierend auf veraltetem `workItems` - bevor er erneut sprang, sobald
    `onWorkItemsChange` ankam.
  - `drag` bleibt jetzt gesetzt, bis das Promise des Commits abgeschlossen ist
    (`.finally(() => setDrag(null))`).
  - Zusätzlich ein `handlePointerCancel` ergänzt, analog zu `handlePointerUp`, aber ohne zu
    speichern, da eine verlorene/abgebrochene Pointer-Erfassung (browser-ausgelöstes
    `pointercancel`, ohne passendes `pointerup`) `drag` zuvor dauerhaft hängen ließ.

## v2026.8.56

✨ Neu

- **Kanban Suchen/Sortieren/Filtern-Toolbar** (`d4bcb5e`): das Action-Bar-Muster der Timeline
  wiederverwendet - Live-Textsuche plus ein Filter-Popover (Status/Priorität/Zuständige:r) mit
  Chips für aktive Filter.
- **Kanban-Karten bearbeiten/löschen, auf drei Wegen** (`b95007778`): ein Rechtsklick-Kontextmenü,
  beim Hovern erscheinende Icon-Buttons auf der Karte, und Ziehen auf eine Papierkorb-Zone, die
  während des Ziehens einer Karte erscheint.
- Notizfeld beim Anlegen einer Kanban-Karte; Priorität und Kategorie lassen sich jetzt ebenfalls
  schon beim Anlegen setzen (`9ea182f`).

🔄 Geändert

- **Kanban-Spalten volle Breite, responsiv** (`b95007778`): feste Spaltenbreiten durch
  `flex-1 min-w-0` ersetzt, damit das Board die verfügbare Breite ausfüllt statt die letzte Spalte
  auf breiten Monitoren abzuschneiden.
- **DB-gestütztes `UserPreference`-System** (`60a6b88`) als Ersatz für verstreute
  `localStorage`-Zugriffe:
  - Neue `UserPreference`-Entität + `PreferencesController` (`GET`/`PUT /api/preferences`),
    Postgres-/SqlServer-Migrationen, und ein `PreferencesContext`
    (`getPreference`/`setPreference`), eingehängt in `main.tsx`.
  - `localStorage` bleibt nur noch als synchroner Vor-React-Spiegel für das Theme (um einen Flash
    des falschen Themes vor dem Laden des DB-Werts zu vermeiden) - überall sonst ist die DB
    maßgeblich.
- `eligibleParentItems` (`TimelineView.tsx`, `3765dce`): Die Auswahlfelder „übergeordnete
  Aufgabe"/„übergeordnetes Element" filtern jetzt auf Elemente, die tatsächlich eine
  Timeline-Zeile rendern (haben ein Datum, oder sind eine Phase), und bei Aufgaben zusätzlich
  darauf, dass sie nicht schon in einer Erledigt-Spalte sind - zuvor wurden alle `workItems`
  ungefiltert gelistet, inklusive erledigter Aufgaben und datumsloser Kanban-only-Karten.
- Dashboard-Gesamt-Badge (`b95007778`): `TicketBadgeRow` summiert `openTicketsByColumn` zu einem
  „Gesamt"-Pill, das neben den Spalten-Badges angezeigt wird.

🔧 Behoben

- **Timeline zeigte veralteten Status nach einer Kanban-Verschiebung** (`41b3ffc`): `handleMove`
  in `KanbanBoard.tsx` aktualisierte `columnId`, ließ aber `columnName`/`columnType`
  (denormalisierte Kopien, die die Timeline direkt liest, da sie über diese statt über eine
  Neuauflösung von `columnId` gegen `board.columns` nachschlägt) bis zu einem vollständigen Reload
  auf der alten Spalte stehen.
- Dark-Mode-`<select>`-Styling (`9ea182f`): native Options-Popups ignorierten das dunkle Theme der
  App (`color-scheme` erreicht vom Betriebssystem gerenderte Dropdown-Elemente nicht) - explizite
  `option`/`.dark option`-Hintergrund-/Textregeln in `index.css` ergänzt.
- SignalR-Enum-Serialisierung: `AddSignalR().AddJsonProtocol` brauchte einen eigenen
  `JsonStringEnumConverter`, getrennt von dem bereits auf `AddControllers().AddJsonOptions`
  registrierten - SignalR teilt sich diese Pipeline nicht.
