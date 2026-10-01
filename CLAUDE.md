# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Milepoint is a self-hosted project-management tool focused on software development workflows
(issue tracking, Kanban, Gantt-style timeline, wiki-style notes) — combining the strengths of
Plane/OpenProject/Vikunja rather than generic business PM. Single-team/single-tenant, no
multi-tenancy. Backend: ASP.NET Core (.NET 10, C#). Frontend: React 19 + Vite + TypeScript +
Tailwind CSS. Entire stack runs in Docker Compose on Windows via `start.ps1`.

See `docs/01-vision.md` and `docs/02-decisions.md` for the fuller product/architecture rationale
(some of it predates later revisions noted below — those two files are historical decision logs,
not always fully up to date with the current state).

## Commands

```powershell
.\start.ps1                    # Start (builds if needed, checks ports, waits for healthchecks)
.\start.ps1 -Action stop       # Stop the stack (DB volumes persist)
.\start.ps1 -Action restart
.\start.ps1 -Action status
.\start.ps1 -Action logs
.\start.ps1 -Db mssql -MssqlCheck  # Switch DB_PROVIDER to mssql AND start the mssql service (not part of the default dev stack anymore)
.\start.ps1 -Db postgres           # Switch back (postgres is the dev default, mssql keeps running until stopped manually)
.\start.ps1 -MssqlCheck            # Start mssql alongside the current provider, without switching DB_PROVIDER
.\start.ps1 -NoWhisper             # Start WITHOUT the self-hosted Whisper speech-to-text service (runs by default)
```

`.env` is auto-generated from `.env.example` on first run (random passwords/JWT secret). Ports are
**fixed**, read from the global registry `C:\Users\Flux\.claude\ports.json` (project key
`milepoint`) and written into `.env` on every start — no more silent fallback to the next free
port. If a registered port is genuinely occupied by something else, `start.ps1` stops with a
message naming the conflict instead of moving to another port (bookmarked URLs stay valid).
Reachable at `https://localhost:<CADDY_HTTPS_PORT>`, `https://milepoint.localhost:<port>`, and
`https://milepoint.sushifluxdevelop:<port>` (the last needs the Pi-hole wildcard entry described in
the global CLAUDE.md, and both extra names must stay listed in `Caddyfile` and
`frontend/vite.config.ts`'s `server.allowedHosts`).

Frontend (run inside the container, which has the actual `node_modules` — see the EF Core gotcha
below for why running host-side tooling in parallel with the container is risky):
```powershell
docker exec milepoint-frontend-1 sh -c "cd /app && npx tsc -b"     # Typecheck
docker exec milepoint-frontend-1 sh -c "cd /app && npm run lint"   # ESLint
docker exec milepoint-frontend-1 sh -c "cd /app && npm run build"  # tsc -b && vite build
```

Backend:
```powershell
docker exec milepoint-backend-1 dotnet build --no-restore
```

**Database backups are automatic.** The `db-backup` service in `docker-compose.yml`
(`scripts/db-backup.sh`) dumps Postgres right after every stack start, then every 6 h while it
runs; `start.ps1` triggers one more before every stop/restart/re-start (`Invoke-DbBackupNow`).
Dumps go to `.backups/auto/recent` (newest 20) and `.backups/auto/daily` (first of each day, 60
days) **on the host, outside the Docker volumes**, and only when the data actually changed. Restore
with `.\scripts\restore-db.ps1` (newest by default, or `-File <dump>`; it takes a safety dump of the
current state first, and the backend applies any missing migrations on start). Background: on
2026-09-30 the dev DB volume was deleted by a `down -v` from a prod smoke test that shared this
stack's Compose project name — `docker-compose.prod.yml` is now `milepoint-prod`. See the global
CLAUDE.md, "Database backups for local Docker Compose stacks".

No test suite exists yet in either project (the Playwright E2E suite in `frontend/e2e/`, run with
`npm run test:e2e`, is the only automated check).

### EF Core migrations — must be added carefully

`docker-compose.yml` bind-mounts `./backend` (including `obj/`) into the backend container, which
runs `dotnet watch` continuously. Running `dotnet build`/`dotnet ef` on the host **at the same
time** causes the host and container to fight over `obj/project.assets.json` (the container writes
Linux paths into it), producing a misleading `NETSDK1064` error on the host. Every schema change
needs a migration generated **separately for both providers** — the app only auto-migrates
whichever one `DB_PROVIDER` currently points at (`Program.cs`'s startup `db.Database.MigrateAsync()`
runs against `PmDbContextBase`, resolved to whichever concrete context was registered for the
active provider — it never touches the other one).

```powershell
docker compose -p milepoint stop backend
cd backend\src\Milepoint.Api
Remove-Item -Recurse -Force bin, obj
cd ..\..
dotnet restore; dotnet build
cd src\Milepoint.Api
dotnet ef migrations add <Name> --context PostgresPmDbContext -o Data/Migrations/Postgres
dotnet ef migrations add <Name> --context SqlServerPmDbContext -o Data/Migrations/SqlServer
cd ..\..\..
.\start.ps1
```

If host-side `dotnet-ef` can't connect to the SqlServer container at all (`SocketException
0x80004005`, TCP error 35, despite the port being reachable) — this is a known SNI/TLS
compatibility issue between `Microsoft.Data.SqlClient` and .NET 10 under Linux against this image;
`docker-compose.yml`'s Mssql connection string already carries `Encrypt=False` as the fix. If a
migration needs to be *applied* (not just generated) against SqlServer specifically, temporarily
set `DB_PROVIDER=mssql` in `.env` and let the running app's own startup migration apply it (it uses
the project's referenced `Microsoft.EntityFrameworkCore.SqlServer` package, not the separately
installed global `dotnet-ef` tool) — then switch back.

If test volumes hold an older schema and a fresh migration conflicts ("relation already exists"),
`docker compose -p milepoint down -v && .\start.ps1` wipes and recreates (dev data only — never do
this against real data without a backup first).

**Adding a new *value* to an existing enum needs a real backend container restart, not just
`dotnet watch`'s hot reload.** Confirmed live: `dotnet watch` throws `ENC0021: Adding enum value
requires restarting the application` and keeps serving the old assembly, so a request using the new
value 400s with a JSON-deserialization error until the container is actually restarted
(`docker restart milepoint-backend-1` is enough — no migration needed if the backing column is
already a plain nullable `int`, as every enum column in this project is).

## Architecture

### Dual EF Core provider setup

`PmDbContextBase` (abstract, implements `IdentityDbContext<ApplicationUser>` and
`IDataProtectionKeyContext`) is subclassed by `PostgresPmDbContext` and `SqlServerPmDbContext`.
`Program.cs` registers only one concrete context based on `DB_PROVIDER` (`postgres` default or
`mssql`), and injects it as `PmDbContextBase` everywhere else in the app — controllers/services
never reference the provider-specific subclasses directly. Switching is just an env var + backend
restart, no data migration between them. (The `Pm` prefix on these context classes is a leftover
from the pre-rename working title "PM" — kept only to avoid regenerating every migration; it's not
user-facing anywhere.)

**Postgres is the only DB that runs by default in the dev stack** — `mssql` sits behind the
`mssql-check` Compose profile (`start.ps1 -MssqlCheck`, or `-Db mssql -MssqlCheck` to also switch
the provider), started deliberately rather than staying resident for the whole session. See
"Customer distribution concept" below for why (RC/V-Commit is where MSSQL compatibility actually
needs to be re-verified, not every dev session) and note `stop`/`restart` without `-MssqlCheck`
leaves an already-running `mssql` container alone (same pattern as `whisper`/`-NoWhisper`) — stop
it manually (`docker stop milepoint-mssql-1`) when done checking, since it's noticeably more
RAM-hungry than whisper and isn't meant to just keep running in the background.

### IDs

`Project`/`Board`/`WorkItem` use git-style 40-char SHA-1 hex IDs (`HashIdGenerator`) since these
are the entities users actually reference/discuss; `BoardColumn`/`Label`/`Note`/`User` use
standard GUID/Identity IDs. `WorkItem` additionally gets a permanent, human-facing reference number
at creation (`TCK#00001` for Bug/Epic, `TSK#00001` for Task/Feature) from a single global counter
(not per-project) — assigned once, never recalculated even if the item's type later changes.

### Roles and project visibility

Three roles with a rank: `Admin` > `Projektleiter` > `User`. An account holds exactly one of them (the
seeded admin only `Admin`); a higher rank inherits the lower ones' rights - `ProjectsController`
treats `Admin` like `Projektleiter`, the frontend's `isProjectLeader` includes admins. `User` is the
default (creating a project makes you its owner). `GET /api/projects` visibility: `Projektleiter` and
`Admin` see everything; everyone else sees a project only if they created it, are an explicit
`ProjectMember`, or are assigned at least one work item in it.

User management lives on the admin-only **App-Administration** page (`/admin`, tabs Benutzer / Rollen /
Spracherkennung; `AdminUsersController`, `/api/admin/users`): create users, set the role (a role
matrix), set a password, delete. An admin can never change/delete their own account or another
admin - same or higher rank is locked, enforced server-side. The personal **Einstellungen** page
(tabs Darstellung / Sicherheit) holds only the user's own options incl. changing their own password
(`POST /api/auth/change-password`, current password once, new one twice).

### Per-project Kanban columns and work-item categories

Both are configurable per project in the project's own **Einstellungen** tab (`ProjectSettingsView`,
sub-tabs Spalten / Kategorien; sidebar entry only for Projektleiter/Admin). **Only Projektleiter and
Admin may add, rename, hide, show or delete** (explicit user rule, not the plain project owner),
enforced server-side with `[Authorize(Roles = "Projektleiter,Admin")]`; everyone in the project can read.

- **Columns** (`BoardColumnsController`, `/api/projects/{p}/boards/{b}/columns`): the four built-in
  ones (`Neu`, `In Arbeit`, `Fertig`, `Pausiert`, `BoardColumn.IsDefault`) can only be hidden/shown
  (`IsHidden`); custom ones can be added (name + `BoardColumnType`), renamed, retyped, reordered
  (`PUT .../order`) and deleted. Rules: hide/delete only when the column is empty (409 with the card
  count), and at least one visible `Todo` and one visible `Done` column must remain. Hidden columns are
  not rendered on the board, no card can be created in or moved into them, the Timeline's "new item"
  goes to the first visible Todo column. A custom column keeps the status colour of its type.
- **Categories ("Typ")** (`ProjectCategoriesController`, `ProjectCategory` table, per project):
  `Feature`, `Bug`, `Chore` (= routine/maintenance work without a new feature or bug fix) exist per
  project as `IsDefault` rows and can only be hidden/shown; custom ones (name + a palette colour token,
  see `lib/categoryColors.ts`) can be added, renamed (cards follow), recoloured and deleted (409 while a
  card uses them). Defaults are created lazily (`ProjectCategoryService.EnsureDefaultsAsync`), so old
  projects need no data migration. `WorkItem.Category` is now the category's **name** (a string, was the
  `WorkItemCategory` enum); the migration `ProjectCategoriesAndColumnVisibility` (both providers)
  converts the old int values (0/1/2 = Feature/Bug/Chore) in place. A hidden category can't be newly
  assigned but stays on cards that already carry it.

### Timeline / Kanban / Notes are three views over the same project data

`ProjectPage.tsx` (route `/projects/{projectId}/{tab}`) is the shell; `GET
/api/projects/{id}/timeline` returns every `WorkItem` + `Milestone` across all of a project's
boards in one call, so the timeline never queries boards individually. Key relationships:
- `WorkItem.ParentWorkItemId` (self-referencing, nullable, unlimited depth) drives Kanban subtasks
  and the Timeline's indented tree.
- `Milestone` is a deliberately separate, simple model (name + date + description) — not a
  `WorkItem`, so it never appears on Kanban, only on the Timeline.
- `WorkItemDependency` (finish-to-start) blocks moving a work item into a `Done`-typed column until
  every blocking item is itself in a `Done`-typed column (`WorkItemsController.Move` → `409` with
  the blocking titles). Board columns carry a `Todo`/`InProgress`/`Done` type independent of their
  free-text name.
- `TimelineView.tsx` is a real drag/resize Gantt view (day grid, sticky title column, "today" line,
  blocker dependency lines as right-angled SVG paths, milestones as diamond markers interleaved
  chronologically into the same row tree) — commits to the backend on `pointerup`, not during drag.

### Notes: a plain notes app with free cross-links, two ways to view them

`Note` (title + Markdown content, unique per-project title) has exactly **one** relationship
structure: **free cross-links** (`[[Title]]` syntax, parsed server-side by `NoteLinkParser` on
every save into `NoteLink` rows) — Obsidian-style backlinking. Renaming a note doesn't
retroactively fix other notes' raw `[[OldTitle]]` text; that only re-resolves once those notes are
saved again. There used to also be a separate parent/child hierarchy driving four tree-layout
graph views (Mind Map/Baum/Organigramm/Fischgräten, a whole `notesGraph/treeLayouts.ts` module) —
removed entirely per explicit user request to go "back to the roots": a plain notes app, not a
mind-mapping tool. `ParentNoteId`/`ChildNotes` are gone from `Note` and `NoteDto`
(migration `RemoveNoteHierarchy`, both providers), along with `TreeGraphView.tsx`,
`treeLayouts.ts`, `LayoutPickerPanel.tsx`, and the "Layout" button/menu in `NotesView.tsx`. Don't
reintroduce a hierarchy/tree-layout concept without being asked again.

`NotesView.tsx` has two tabs: **List** (the traditional editor) and **Graph** — the latter is
`NoteGraphView.tsx`, a physics-simulated force layout over the free cross-links (a hand-rolled
simulation, not d3-force, to keep the bundle small). There is no layout picker — the free graph is
the only graph view. Each note renders as a small fixed-radius circle ("Punkt", `NODE_RADIUS` in
`notesGraph/NoteNodeShape.tsx`) with its title as a label underneath, the classic network-graph
look — **no per-note shape choice, no per-note/per-connection edge styling, no side panel**, all
removed entirely per explicit user request ("Formen wieder nur als Punkt machen", "das komische
Seitenmenü kann komplett rausgelöscht werden"). A single **"Farbschema"** button next to the
List/Graph toggle (`ColorSchemePanel.tsx`, `useClickOutside`-closed popover) is the only visual
customization left — **pure palette**, the 6 `COLOR_SCHEMES` from `colorSchemes.ts`, each
previewed as its own swatches. Applying one distributes that palette round-robin across every note
(`assignSchemeColors`), changes only `color`, applies **immediately with no confirm dialog**, and
closes its own popover afterward (one-shot action). The last-applied scheme is remembered only as
a preference (`notesGraphScheme`) for the active-item highlight — the real per-note colors can't
be reverse-derived since notes can hold different values.

**Clicking a note in the graph opens it directly in the List editor** (`onSelectNote`, same as
clicking it in the list itself) — there is no intermediate panel/menu anymore. Dragging still
free-positions and persists a note's spot (`FreeViewX`/`FreeViewY`, unchanged), and right-click
still offers "Neue Notiz erstellen"/"Notizen verbinden". A note can freely have **any number of
outgoing `[[Title]]` links to different notes** (not limited to one) — that's what makes the graph
read as a real network once several notes cross-link each other, not a one-off feature to build.

**"Anordnen" button** (top-right of the graph canvas, next to "Ansicht anpassen") re-derives a
clean, low-crossing layout from scratch on demand — `handleArrange()` in `NoteGraphView.tsx`
discards every node's current position, reseeds them all on the golden-angle spiral (same helper
new notes without a saved position use), then re-runs the physics simulation. A from-scratch
reflow needs a different force balance than the everyday drag/new-note case: `tick()` takes an
optional `centerScale` (only `handleArrange()` passes `1.6`, everything else stays at the default
`1`) since the everyday repulsion/center-force balance otherwise flings loosely-connected nodes
off-screen before the center force can pull them back in when starting from a tight spiral. New
positions persist to the backend once the simulation actually settles (`step()`'s `rafRef.current
= null` branch), not at the initial spiral spawn point.

**Crossing edges render dashed.** `computeCrossedEdges()` in `NoteGraphView.tsx` runs a standard
segment-intersection test (orientation/cross-product, ignoring pairs that merely share an
endpoint) over every pair of edges each render, using the live `positionsRef` coordinates; for
each actual crossing, the geometrically *longer* of the two edges gets `stroke-dasharray` — the
shorter, more local connection stays solid so a note's immediate neighborhood stays easy to read.
Explicit user request: the physics layout can't always reach zero crossings (especially in a dense
graph), and an unavoidable crossing should read as "this connection passes behind another" rather
than looking like a clean, uninterrupted line cutting through unrelated nodes.

**`tick()`'s per-frame velocity is hard-capped (`MAX_VELOCITY = 40`).** Found while building the
above: notes loaded with unusually large initial distances between them (e.g. several notes
freshly positioned far apart, or conflicting link-force pulls) could make the simulation
numerically explode — each tick's overshoot compounds into the next tick's already-larger
distance, positions reach astronomical values within a few frames, and the graph silently renders
empty (everything transformed far outside the viewBox). Clamping velocity keeps every tick's
movement bounded regardless of how extreme the input distances are.

**No more auto-created "root note" per project.** `ProjectsController.Create` used to add a note
named after the project itself as a "natural center" to link everything else from — removed per
explicit user request: inside a project's own Notes graph, a node named after the project is
redundant (the whole graph already *is* that project), so it was just noise, not a genuinely
useful hub. Existing auto-created root notes (title == project name) were deleted from every
project's data as part of this change. Don't reintroduce this without being asked again.

Removed entirely, backend and frontend, per this request (do not reintroduce without being asked
again): `Note.Shape`/`NoteShape` enum, `Note.EdgeStyle`/`EdgeArrow`/`EdgeWidth`/`EdgeColor` and
their enums, the `NoteEdgeOverride` table/endpoint (per-connection style overrides, reachable by
clicking a line), `notesGraph/GraphSidePanel.tsx`, `NoteAppearanceMenu.tsx`,
`EdgeOverridePanel.tsx`, `ShapePickerPanel.tsx`, `shapeOptions.ts`/`shapePreview.tsx`,
`edgeStyles.tsx` (the shared anchor-clipping/marker/gradient rendering logic those needed). New EF
Core migration `RemoveNoteAppearanceExtras` (both providers) drops the `NoteEdgeOverrides` table
and the `Shape`/`EdgeStyle`/`EdgeArrow`/`EdgeWidth`/`EdgeColor` columns. The "Gradient" edge style
and the "Glow" style it replaced (see prior CLAUDE.md history if this ever needs archaeology) are
both gone along with the rest of per-note edge styling — lines in the graph are a single plain,
uniform gray/highlighted stroke, no arrowheads, no per-note or per-connection override of any
kind. The one exception: a dashed stroke on edges that geometrically cross another edge (see
"Crossing edges render dashed" above) — that's computed automatically from live layout geometry,
not a stored per-note/per-connection style choice, so it doesn't reintroduce the removed concept.

### `UpdateNoteRequest`/`CreateNoteRequest`: only `Color` remains, no tri-state flag

`Color` has no tri-state flag — every `PUT`/`POST` applies it exactly as given (`null` = revert to
default). This means every caller of `updateNote()`/`createNote()` on the frontend, including
plain title/content-only saves, must always pass the note's *current* color through (see
`NoteAppearanceFields`/`appearanceOf()` in `NotesView.tsx`), or it gets silently reset.

### Voice dictation: three transcription providers behind one interface

Admin-configurable (`TranscriptionSettings`, a singleton DB row, not env/config — see "database vs.
config" note below) choice of `Browser` (Web Speech API, fully client-side, never reaches the
backend), `Whisper` (self-hosted `onerahmet/openai-whisper-asr-webservice`, an optional Compose
profile — `docker-compose.yml`'s `whisper` service, only reachable from other containers, proxied
by the backend), `OpenAI`, or `Google` (Gemini). All three server-side providers implement
`ITranscriptionProvider` (`Services/Transcription/`) and are dispatched to from
`TranscriptionController`'s `POST /api/transcribe`. API keys are encrypted at rest via ASP.NET Core
Data Protection, whose key ring is persisted to the database (`PersistKeysToDbContext`) so it
survives container restarts — this is also why `PmDbContextBase` implements
`IDataProtectionKeyContext`. `DictationButton.tsx` is the single reusable UI entry point used
wherever dictation appears (currently the Notes editor).

`DictationButton.tsx` also has an in-app microphone device picker (a chevron next to the mic
button, `navigator.mediaDevices.enumerateDevices()` filtered to `audioinput`, refreshed on the
`devicechange` event) — added per explicit user feedback that switching microphones used to mean
going into the browser's own site permission settings. Only shown for the MediaRecorder-based
providers (Whisper/OpenAI/Google, which explicitly request a `deviceId`); never for `Browser`
(the Web Speech API has no deviceId concept, always uses the OS/browser default input). The
chosen device is a DB-backed preference (`dictation.micDeviceId`), requested via
`getUserMedia({ audio: { deviceId: { ideal } } })` so an unplugged/stale device falls back to the
default instead of throwing. The one-time browser permission prompt itself is a Web Platform
security boundary and can't be skipped from app code — but switching the requested `deviceId`
after permission is already granted does NOT re-trigger that prompt, which is what actually
removes the revoke/re-grant round-trip the user was hitting. Both the error popup and the device
menu compute their own left/right alignment from the button's `getBoundingClientRect()` before
opening (see `computeEdgeAlign`) so neither clips off the visible window near a screen edge — a
fixed `left-1/2`/`-translate-x-1/2`/`left-0` previously did, cutting the error text off entirely.
Note: Chromium's `--use-fake-device-for-media-stream` test flag regenerates random `deviceId`
values on every page load, so a Playwright test using it will never see the picker's highlighted
selection survive a reload — that's a fake-device testing artifact, not an app bug (confirmed by
enumerating devices before/after a reload with `--use-fake-device-for-media-stream` and observing
different IDs both times); a real browser/mic keeps a stable `deviceId` per origin+hardware.

While recording, `DictationButton.tsx` also shows live mixer-style equalizer bars next to the mic
button (`EqualizerBars`, driven by the new `hooks/useMicLevels.ts`) — added per explicit user
feedback that the existing `animate-ping` red ring alone wasn't enough feedback that the mic is
actually listening and reacting to voice. `useMicLevels(stream: MediaStream | null)` owns a Web
Audio API `AudioContext`/`AnalyserNode` (`fftSize = 128`, grouping the 64 frequency bins into 9
bars, each eased frame-to-frame rather than snapped to the raw FFT read) — deliberately never
connected to `audioContext.destination`, so nothing is ever audibly played back, purely an
analysis tap. The two recording paths acquire their stream differently, so the hook takes an
already-acquired `MediaStream` rather than requesting its own: the MediaRecorder path
(Whisper/OpenAI/Google) already holds one in `streamRef` and just mirrors it into a second
`visualizerStream` state var; the Web Speech API path (`Browser` provider) has no stream of its
own at all, so `startBrowserRecognition()` fires a second, independent, best-effort `getUserMedia`
call purely for the visualization (a failure there doesn't affect recognition itself) — both honor
the same `preferredDeviceId` device choice as the recording stream. `AudioContext`/`AnalyserNode`/
the animation loop are torn down in the effect's cleanup whenever the stream changes or recording
stops, avoiding a hung/leaked audio context.

### Autosave and sessions

Nothing waits for a Save button. Kanban and Timeline persist every action on its own (create, move,
edit, drag); the **Notes editor autosaves** (debounced ~0.9 s after the last keystroke, serialized
through one promise chain, flushed immediately on tab hide / pagehide / unmount with `keepalive`, and
before a tab is closed) and shows "Speichert… / Gespeichert / Nicht gespeichert" instead of a button.

API responses carry `Cache-Control: no-store` (`Program.cs`) - otherwise a restored browser tab could
show a stale state without asking the server. The session is **sliding**: once less than half of
`JWT_EXPIRY_MINUTES` is left, a response carries a fresh token in `X-Refreshed-Token` and
`api/client.ts` swaps it in, so only an idle session expires. When a protected request still comes back
401, `AuthContext` clears the login and `RequireAuth` redirects to the normal **login page** with a
hint and returns to the same page after logging in (the former overlay modal is gone - with autosave
there is nothing unsaved to protect).

### Realtime

Kanban board state syncs live across open tabs/users via SignalR (`Hubs/`), not polling.

### Dropdown menus close via `useClickOutside`, not an overlay

Every popover/dropdown/context menu in the frontend closes on an outside `pointerdown` (capture
phase) or `Escape` through the shared `hooks/useClickOutside.ts` hook — `useClickOutside(ref,
menuIsOpen, closeCallback)`, with `ref` on the menu's own container (or the segmented control
wrapping several sibling popovers that share one `openMenu` state). Do **not** reach for a
`<div className="fixed inset-0" onClick={close}>` click-catcher overlay: it silently fails
whenever a higher-`z-index`/`position: fixed` element paints over it or a `stopPropagation()`
sits in the click path — this bit the header menu, project switcher, both graph views'
right-click menus and the Notes Layout/Farbschema/Form popovers before they were converted.
`TimelineView.tsx`/`KanbanBoard.tsx` keep their own hand-rolled multi-menu outside-click effects
(conditional refs the single-ref hook can't express cleanly) but still handle Escape the same way.

### Versioning

`Year.Month.CommitOfTheYear` (e.g. `v2026.9.73`), computed fresh on every request by `GET
/api/version` reading `backend/src/Milepoint.Api/version.txt` — never cached, no restart needed to
pick up a new value. A tracked `post-commit` git hook (`scripts/git-hooks/post-commit`, wired up
automatically by `start.ps1` via `core.hooksPath`) rewrites that file after every commit:
`git rev-list --count HEAD --since="<this year>-01-01T00:00:00"`, resetting to 1 on the year's
first commit rather than growing unbounded or reflecting same-day-only volume. (`docs/03-runbook.md`
and `docs/02-decisions.md` describe an earlier `Year.Release.Commit` scheme with a manually
maintained `VERSION` file — that scheme was replaced; the git hook is the current source of truth.)

### Changelogs

Two files at the repo root: `CHANGELOG.dev.md` (technical, bilingual EN/DE, every commit that
bumps the version gets its own heading) and `CHANGELOG.md` (user-facing, bilingual, grouped by
tagged release, plain outcome-oriented language). Update `CHANGELOG.dev.md` as part of the same
change that causes it — it's easy to forget when a session produces several commits in a row.

### Local HTTPS

Caddy terminates TLS using its own locally-generated CA (`tls internal` — no public domain exists
for a real ACME cert). The browser needs that CA imported once (`docs/03-runbook.md` has the exact
`certutil` commands); it persists across restarts in the `caddy_data` volume, lost only on
`docker compose down -v`.

### Admin settings live in the database, not config files

Runtime-adjustable behavior an admin might want to change without a redeploy (currently:
transcription provider/keys/settings) is a DB-backed singleton row behind an admin API, not an env
var — see `TranscriptionSettings` as the reference pattern. Secrets, connection strings, and
anything needed before the DB connection exists still belong in `.env`/Compose config.

### Customer distribution concept (Unraid/Docker path implemented, Windows installer still planned)

**Implemented (Unraid/Docker):** `backend/Dockerfile.prod` (multi-stage: builds the frontend to
static files and embeds them into the backend image as `wwwroot`, served by `Program.cs`'s
`UseStaticFiles()`/`MapFallbackToFile("index.html")` — a no-op in dev, where `wwwroot` doesn't
exist), `docker-compose.prod.yml` (generic self-host path with a bundled Postgres; Caddy as an
opt-in `caddy` profile, `Caddyfile.prod`), `.env.prod.example`, `unraid/milepoint.xml.template`
(the actual Unraid Community Applications template — see the Unraid bullet below for why it's a
single-container XML with an external DB, not a Compose stack) and `.github/workflows/release.yml`
(tag-triggered: builds/pushes `ghcr.io/sushiflux-develop/milepoint`, renders the XML, publishes a
draft GitHub Release for `-rc` tags and a public one for plain tags; tag names are always the
plain version, the platform scope ("RC Unraid"/"RC Windows") is a `platform: unraid` line in the
annotated tag's message, see the global CLAUDE.md's "Platform-scoped RC"). The repo lives at `github.com/SushiFlux-Develop/Milepoint` (moved from the old
`SynShiftLabs` org). **Not yet exercised live:** the workflow has only been YAML-validated and its
pieces (image build, XML render, `Program.cs` behaviour against an external Postgres) run locally —
the first real `-rc` tag push is its first actual GitHub Actions run.

**Still only a plan:** the WiX installer project below. Captured here so the plan survives across
sessions once that build-out starts:

- **MSSQL is no longer part of the everyday dev stack.** It sits behind the `mssql-check` Compose
  profile (`docker compose --profile mssql-check up -d mssql`, or `start.ps1 -MssqlCheck` — same
  on/off-by-default pattern as `whisper`/`-NoWhisper`). Postgres alone is the dev default
  (`DB_PROVIDER=postgres`). The dual-provider architecture (see "Dual EF Core provider setup"
  above) still needs the MSSQL side actually exercised before it ships — that check is meant to
  move into the RC/V-Commit build pipeline itself once one exists (an automated CI gate: spin up
  `mssql`, apply `SqlServerPmDbContext` migrations, run the critical Playwright journeys against
  it, fail the build on error) — `-MssqlCheck` is the same manual mechanism a human runs locally
  in the meantime, not a separate concept.
- **Container minimum for a customer deployment**: 3–5 instead of today's 7–9 — drop the dev-only
  services (`mailpit`, `adminer`), pick one DB instead of running both in parallel, merge
  frontend into the backend image (serve the built Vite assets as static files from Kestrel via
  `UseStaticFiles` + an SPA fallback instead of a separate `frontend` container/Caddy hop for it).
- **Windows**: no Docker at all. IIS **in-process hosting via the ASP.NET Core Module (ANCM)** —
  not a standalone Windows Service — is the target (Microsoft's own best-documented pattern;
  avoids needing the separate ARR module a standalone-service-behind-IIS setup would need for
  reverse proxying). Installer needs the official ASP.NET Core Hosting Bundle, not a bespoke
  service wrapper. **Installer: WiX Toolset (Burn/Bootstrapper) for the actual install mechanics,
  with a custom WPF Managed Bootstrapper Application (MBA) for the UI instead of WiX's stock
  wizard look** — see the global CLAUDE.md's "Windows installer UI" note under Visual design
  defaults for why (explicit user preference, applies to every project, not just Milepoint). WiX
  still does the real work through its built-in extensions (IIS site creation via
  `WixIisExtension`, certificate import, Windows Feature activation via `WixUtilExtension`) — the
  WPF layer only replaces what the installer *looks like*, not how it actually installs.
  Self-hosted Whisper is **not available on
  Windows** (its Python/PyTorch runtime isn't worth natively re-packaging, and running it via a
  single Docker container would undercut the whole "no Docker on Windows" point) — Windows
  installs are limited to the Browser (Web Speech API) and cloud (OpenAI/Google) transcription
  providers. DB installs natively (Postgres or MSSQL, one choice, no parallel instances). The
  Docker-Desktop licensing caveat that used to apply to an earlier "bundle Docker Desktop on
  Windows" idea is moot — neither platform touches Docker Desktop (Windows is IIS-native, Unraid
  uses the Docker Engine directly).
- **Unraid** (implemented — the original plan here was a Docker Compose plugin stack shown as one
  app, but research found Unraid's Compose Manager plugin has **no standardized Community
  Applications manifest format for multi-container stacks**, so that isn't a real one-click path).
  What shipped instead follows Fluxo's proven pattern: **one single-container CA XML**
  (`unraid/milepoint.xml.template`) for the backend container (which already serves the frontend
  itself), expecting an **external Postgres** and **external Redis** the user runs separately
  (e.g. the official CA containers). The Postgres connection is exposed as five separate labeled
  fields (`ConnectionStrings__Postgres_Host/_Port/_Database/_Username/_Password`) that
  `Program.cs` assembles into one connection string when `ConnectionStrings__Postgres` itself is
  absent (Compose keeps setting that directly and wins if present). MSSQL is not offered on
  Unraid — Postgres only. Whisper/OpenAI/Google transcription is **not** a container setting: the
  provider and its URL/keys are DB-backed admin settings configured in the running app (see
  "Voice dictation"), so the template has no field for it. TLS default is **no bundled Caddy** —
  Unraid users commonly already run a shared reverse proxy (SWAG or Nginx Proxy Manager); the
  bundled Caddy only exists as the opt-in `caddy` profile in `docker-compose.prod.yml` (the
  generic bundled-DB self-host path, e.g. via Compose Manager or any other Docker host).
- **RC Unraid = update in place.** `release.yml` pushes every RC image as `<version>-rc` AND the
  moving tag `rc`, and renders the RC template with `<Repository>...milepoint:rc`. After the first
  install (template filled in once), every later `RC Unraid` just runs Unraid's `update_container
  Milepoint` over SSH - all saved settings stay. The container saved from `rc1`/`rc2` still points
  at a fixed tag, so it needs one manual Edit to `:rc`.
- **Milepoint's own Unraid names** (what the global "Release Unraid" cleanup and the "RC Unraid"
  template copy act on, and nothing else): container `Milepoint`, template file
  `my-Milepoint.xml` (plus the hand-copied `manual-templates/Milepoint-rc2.xml`-style copies and
  `templates-user/Milepoint.xml` if present), image `ghcr.io/sushiflux-develop/milepoint`, appdata
  `/mnt/cache/appdata/milepoint` (holds only the generated `jwt-signing.key`), cached icon
  `Milepoint-icon.png`. The database `milepoint_db` on the user's Postgres is never touched. A
  Release does not copy anything to the user's Unraid - the template goes to the public
  `SushiFlux-Develop/Milepoint_Unraid` repo (Community Applications route, like Fluxo).
- **RC-Commit must also produce an Unraid XML template** (explicit user request) — the user copies
  it by hand onto their own Unraid box to test it there before anything goes out to the public
  Community Applications feed. A V-Commit/V-Tag is the point that template actually gets pushed to
  the public CA repo/feed (see "Test depth by commit word" in the global CLAUDE.md for how this
  fits the three commit words generally — this is the Unraid-specific artifact for that pipeline).
