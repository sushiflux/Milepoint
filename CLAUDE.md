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
.\start.ps1 -Db mssql          # Switch DB_PROVIDER and restart only the backend (Postgres/MSSQL always run in parallel)
.\start.ps1 -Db postgres
.\start.ps1 -WithWhisper       # Also start the optional self-hosted Whisper speech-to-text service
```

`.env` is auto-generated from `.env.example` on first run (random passwords/JWT secret). Occupied
ports get an automatic fallback, written back into `.env`; actual ports used are printed at the
end of the run.

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

No test suite exists yet in either project.

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

## Architecture

### Dual EF Core provider setup

`PmDbContextBase` (abstract, implements `IdentityDbContext<ApplicationUser>` and
`IDataProtectionKeyContext`) is subclassed by `PostgresPmDbContext` and `SqlServerPmDbContext`.
`Program.cs` registers only one concrete context based on `DB_PROVIDER` (`postgres` default or
`mssql`), and injects it as `PmDbContextBase` everywhere else in the app — controllers/services
never reference the provider-specific subclasses directly. Both databases always run in the
Compose stack simultaneously; switching is just an env var + backend restart, no data migration
between them. (The `Pm` prefix on these context classes is a leftover from the pre-rename working
title "PM" — kept only to avoid regenerating every migration; it's not user-facing anywhere.)

### IDs

`Project`/`Board`/`WorkItem` use git-style 40-char SHA-1 hex IDs (`HashIdGenerator`) since these
are the entities users actually reference/discuss; `BoardColumn`/`Label`/`Note`/`User` use
standard GUID/Identity IDs. `WorkItem` additionally gets a permanent, human-facing reference number
at creation (`TCK#00001` for Bug/Epic, `TSK#00001` for Task/Feature) from a single global counter
(not per-project) — assigned once, never recalculated even if the item's type later changes.

### Roles and project visibility

Three roles: `Admin` (system settings only, no automatic project access), `Projektleiter` (sees
every project system-wide regardless of ownership), `User` (default — creating a project makes you
its owner). The seeded dev account gets both `Admin` and `Projektleiter`. `GET /api/projects`
visibility: `Projektleiter` sees everything; everyone else sees a project only if they created it,
are an explicit `ProjectMember`, or are assigned at least one work item in it.

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

### Notes: two independent relationship graphs, four+ ways to view them

`Note` (title + Markdown content, unique per-project title) has **two separate, non-overlapping**
relationship structures that must not be conflated when working on either:
1. **Free cross-links** (`[[Title]]` syntax, parsed server-side by `NoteLinkParser` on every save
   into `NoteLink` rows) — Obsidian-style backlinking. Renaming a note doesn't retroactively fix
   other notes' raw `[[OldTitle]]` text; that only re-resolves once those notes are saved again.
2. **Parent/child hierarchy** (`ParentNoteId`/`ChildNotes`, unlimited depth, cycle-checked
   server-side via `NotesController.WouldCreateCycleAsync`) — a Mindmap-style outline, entirely
   independent of the links above. Deleting a note promotes its children to root notes rather than
   cascading the delete (a note's content is independently authored, unlike a Kanban subtask).

`NotesView.tsx` has two tabs: **List** (the traditional editor) and **Graph**, the latter with a
layout picker switching between `NoteGraphView.tsx` (physics-simulated force layout over the free
cross-links — a hand-rolled simulation, not d3-force, to keep the bundle small) and
`notesGraph/TreeGraphView.tsx` (a shared canvas for four static tree layouts computed by
`notesGraph/treeLayouts.ts` from the parent/child hierarchy: mind map/radial, left-to-right tree,
top-to-bottom org chart, fishbone — one shared node-position algorithm module, one shared
zoom/pan/drag-to-reparent canvas). `Note.Color`/`Note.Shape` (hex color, `NoteShape` enum) control
per-node appearance across both graph views; color palettes/schemes are frontend-only concept, the
backend only ever stores a resolved hex value.

### Update requests use two different "don't touch this field" conventions — know which applies

- `UpdateNoteRequest.ParentNoteId` needs an explicit `SetParentNoteId: true` to be applied at all
  (default `false` = hierarchy untouched) — because `null` is *also* the field's valid "no parent"
  value, so a request that simply omits the field can't otherwise be told apart from one explicitly
  clearing it.
- `Color`/`Shape` on the same request have **no** such flag — every `PUT` applies them exactly as
  given (`null` = revert to default). This means every caller of `updateNote()` on the frontend,
  including plain title/content-only saves, must always pass the note's *current* color/shape
  through, or it gets silently reset. This asymmetry is intentional (see the doc comments on
  `UpdateNoteRequest`/`NoteDtos.cs`) — the parent hierarchy is often edited in isolation (e.g.
  drag-and-drop in the tree view) while color/shape are always in hand whenever a note is saved at
  all, the same way `Title`/`Content` already are.

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

### Realtime

Kanban board state syncs live across open tabs/users via SignalR (`Hubs/`), not polling.

### Versioning

`Year.Month.CommitOfTheYear` (e.g. `v2026.9.70`), computed fresh on every request by `GET
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
