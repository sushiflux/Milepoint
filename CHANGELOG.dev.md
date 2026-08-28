# Developer-Changelog

**[English](#english) · [Deutsch](#deutsch)**

---

<a id="english"></a>
## English

_The German version follows below — [jump to it](#deutsch)._

Technical change log for Milepoint — every notable change, including internal refactors,
bugfixes with no user-facing effect, cleanup, and infrastructure updates. For the customer-facing
summary see [CHANGELOG.md](CHANGELOG.md). Version headers are `Year.Month.Day.Commit`
(`Commit` = `git rev-list --count HEAD` at that commit) - see the "Versioning scheme changed"
entry below for how that's computed. Entries not yet under a version number are uncommitted at
time of writing.

## Current

📝 Other

- **Versioning scheme changed: manually-bumped `VERSION` base → `Year.Month.Day.Commit`**,
  mirroring Fluxo. `VERSION` (repo root, previously a hand-maintained `major.minor`-ish string
  read by both `scripts/git-hooks/post-commit` and `start.ps1`'s `Get-AppVersion`) removed
  entirely - the version is now computed purely from today's date plus
  `git rev-list --count HEAD`, no manual bump ever needed. Multiple commits on the same day just
  increment the last segment (e.g. `.19` → `.37`), no per-day reset. `backend/.../Program.cs`'s
  `/api/version` fallback updated from `v0.0.0` to `v0.0.0.0` to match the new segment count.
- **Introduced this file and `CHANGELOG.md`**, structured like Fluxo's (bilingual EN/DE via
  `#english`/`#deutsch` anchors, one section per version with a fixed category set, "Current" for
  not-yet-committed work). Backfilled with the last few days of actual commit history, using each
  entry's real `git rev-list --count` at the time to assign it to the version it actually shipped
  under, rather than lumping everything under one undated bucket.

## v2026.8.20.64 — since v2026.8.19.63

🔧 Fix

- **Session-expiry data loss** (commit `53f37fb`): `api/client.ts`'s `apiFetch` used to
  hard-navigate (`window.location.href = '/login'`) on any 401, instantly unmounting the whole
  React tree and discarding unsaved component state. Replaced with
  `window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))`; `AuthContext` listens and exposes
  `sessionExpired`, and a new `SessionExpiredModal` (mounted outside `<Routes>` in `App.tsx` so
  nothing underneath it unmounts) prompts for the password in place. `KanbanBoard.tsx`'s
  `handleMove` call site gained a `.catch(() => undefined)` since it previously relied on the
  hard-navigation to mask an unhandled promise rejection on failure.

## v2026.8.19.63 — since v2026.8.18.56

✨ New

- **WBS numbering and parent/child connectors** (`c3559b2`, `d38ae7b`, `c5a4238`): `buildRows` in
  `TimelineView.tsx` now assigns an outline number (`1`, `1.1`, `1.2`, ...) to each Task/Phase row
  in the same recursive pass that builds the row list, purely from render-time tree order (not
  persisted). A `parentChildConnectors` `useMemo` draws an SVG polyline from a Task's end date
  through a half-circle marker on each Task-type subtask's bar, in row order; routing went through
  several iterations (direct diagonal → right-angled trunk → late-kink-per-child →
  dashed pass-through segments for the 2nd+ subtask → a short elbow stub for a visible 90°
  corner). Connector color is assigned per-Phase via `phaseColorClassById`, cycling through a
  palette deliberately disjoint from the status/priority color sets (see below).
- **Cascading subtask date rules**: `minStartForParent` now adds one day to the parent's end date
  instead of using the same day. `commitDateChange` computes a `deltaFinish` (how far the dragged
  parent's end date moved) and walks `itemsByParent` to shift every Task descendant's start/finish
  by the same delta, preserving whatever day-gap they already had - independent of, and layered on
  top of, the existing `computeCascadeShifts` blocking-dependency cascade. Live preview during the
  drag itself (not just after drop) is handled by `liveFinishDelta`, which `effectiveRange` now
  consults for any item that isn't the one directly being dragged but is a descendant of it. A
  live "invisible wall" clamp was added to `effectiveRange` too, so dragging a subtask can't pull
  its start before the parent's end+1 while the drag is in progress, not just on drop.
- **Row density** (`c5a4238`): `ROW_HEIGHT`/bar-height literals replaced with
  `ROW_HEIGHT_BY_DENSITY`/`BAR_HEIGHT_BY_DENSITY` lookups keyed by a `Density` preference
  (`small`/`medium`/`large`, `small` = the original fixed 32/20 size so existing users see no
  change).
- **Settings page** (`1fcc917`): new route `/settings` (`SettingsPage.tsx`), linked from
  `Header.tsx`'s user-menu dropdown. The Timeline bar-color mode preference
  (`timelineBarColorMode`) moved here from a Timeline action-bar toggle; its type/options/default
  live in `lib/timelinePreferences.ts` as a shared source of truth between the two.
- **Dashboard Timeline/Kanban composition split** (`ee59787`): `ProjectsController.ToDto` now
  computes `TimelineItemCount`/`KanbanOnlyItemCount` (same population as `CompletionPercent` - all
  items if owner, else just the caller's tasks) plus per-column
  `OpenTimelineCount`/`OpenKanbanOnlyCount` and their `My...` equivalents, via a shared
  `SplitTimelineVsKanban` helper (`w.StartDate is not null || w.DueDate is not null`).
  `ColumnTicketCountDto` gained `TimelineCount`/`KanbanOnlyCount` fields alongside the existing
  `Count`. Frontend: the dashboard progress bar's filled width stayed tied to
  `completionPercent`, but the fill itself is now two-toned by composition instead of one flat
  color; went through a color pass (brand-primary/brand-accent read as too high-contrast → settled
  on a monochromatic indigo pair, light/dark of the same hue).

🔄 Change

- **Status/priority color unification** (`0f0571f`): `STATUS_DOT`/`STATUS_BAR_COLOR` (Timeline)
  and `COLUMN_BORDER_COLORS` (Kanban) both switched to yellow/blue/green (Todo/InProgress/Done)
  plus red for `pausiert`/`blockiert` name-matches. `PRIORITY_DOT`/`PRIORITY_COLORS` reworked
  (Medium: sky→violet, High: amber→orange, Urgent: red→rose in Timeline to match Kanban's existing
  rose) so no priority color collides with a status color. Tried moving status/priority onto the
  bar itself (a stripe + dot) but the bar's left edge was already crowded (resize handle,
  blocked-dependency border, connector half-dot on subtasks); reverted to compact label columns
  (dot only, no text, tooltip) instead.
- Widened `COL_ID` (64→88px) so `TSK#00042`-style reference codes don't truncate; gave the last
  label column (`COL_PRIORITY`) extra right padding so it doesn't sit flush against the chart
  edge.

🔧 Fix

- **Timeline drag-handle mis-detection**: `handlePointerDown` checked `event.target.dataset.handle`
  directly - clicking the visible grab-indicator line (a child `<div>` of the actual handle, with
  no `data-handle` of its own) fell through to `'move'` mode instead of `'resize-start'`/
  `'resize-end'`. Fixed via `event.target.closest('[data-handle]')`.
- **Timeline drag jitter/stuck-grab** (`b35465a`): `handlePointerUp` used to call `setDrag(null)`
  synchronously before `commitDateChange`'s network round-trip resolved, so the bar rendered its
  old (pre-drag) position for one frame - based on stale `workItems` - before jumping again once
  `onWorkItemsChange` landed. `drag` now stays set until the commit's promise settles
  (`.finally(() => setDrag(null))`). Added a `handlePointerCancel`, mirroring `handlePointerUp` but
  without committing, since a lost/aborted pointer capture (browser-triggered `pointercancel`, no
  matching `pointerup`) previously left `drag` stuck indefinitely.

## v2026.8.18.56 — since v2026.8.18.49

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
- **DB-backed `UserPreference` system** (`60a6b88`) replacing scattered `localStorage` reads: new
  `UserPreference` entity + `PreferencesController` (`GET`/`PUT /api/preferences`), Postgres/
  SqlServer migrations, and a `PreferencesContext` (`getPreference`/`setPreference`) wired into
  `main.tsx`. `localStorage` is kept only as a synchronous pre-React mirror for the theme (to
  avoid a flash-of-wrong-theme before the DB value loads) - DB stays authoritative everywhere
  else.
- `eligibleParentItems` (`TimelineView.tsx`, `3765dce`): the "übergeordnete Aufgabe"/"übergeordnetes
  Element" pickers now filter to items that actually render a Timeline row (has a date, or is a
  Phase) and, for Tasks, aren't already in a Done column - previously listed every `workItems`
  entry unfiltered, including finished tasks and dateless Kanban-only cards.
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
`Year.Month.Day.Commit` (`Commit` = `git rev-list --count HEAD` bei diesem Commit) - siehe den
Eintrag „Versionsschema geändert" unten für die genaue Berechnung. Einträge ohne Versionsnummer
sind zum Zeitpunkt des Schreibens noch nicht committed.

## Aktuell

📝 Sonstiges

- **Versionsschema geändert: manuell gepflegte `VERSION`-Basis → `Year.Month.Day.Commit`**,
  analog zu Fluxo. `VERSION` (Repo-Root, bisher ein von Hand gepflegter „major.minor"-artiger
  String, gelesen von `scripts/git-hooks/post-commit` und `start.ps1`s `Get-AppVersion`)
  vollständig entfernt - die Version wird jetzt rein aus dem heutigen Datum plus
  `git rev-list --count HEAD` berechnet, kein manuelles Hochzählen mehr nötig. Mehrere Commits am
  selben Tag erhöhen einfach das letzte Segment (z. B. `.19` → `.37`), kein täglicher Reset.
  Der `/api/version`-Fallback in `backend/.../Program.cs` von `v0.0.0` auf `v0.0.0.0` angepasst,
  passend zur neuen Segmentanzahl.
- **Diese Datei und `CHANGELOG.md` eingeführt**, aufgebaut wie bei Fluxo (zweisprachig EN/DE über
  `#english`/`#deutsch`-Anker, ein Abschnitt pro Version mit festem Kategorien-Set, „Aktuell" für
  noch nicht committete Arbeit). Rückwirkend mit den letzten Tagen echter Commit-Historie befüllt,
  wobei jeder Eintrag über sein tatsächliches `git rev-list --count` der Version zugeordnet wurde,
  unter der er wirklich ausgeliefert wurde, statt alles in einem undatierten Topf zu sammeln.

## v2026.8.20.64 — seit v2026.8.19.63

🔧 Behoben

- **Datenverlust bei Sitzungsablauf** (Commit `53f37fb`): `api/client.ts`s `apiFetch` hat bei
  jedem 401 hart navigiert (`window.location.href = '/login'`), was den gesamten React-Baum
  sofort ausgehängt und ungespeicherten Komponentenzustand verworfen hat. Ersetzt durch
  `window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))`; `AuthContext` hört darauf und stellt
  `sessionExpired` bereit, ein neues `SessionExpiredModal` (außerhalb von `<Routes>` in `App.tsx`
  eingehängt, damit darunter nichts aushängt) fragt das Passwort direkt vor Ort ab.
  `KanbanBoard.tsx`s `handleMove`-Aufrufstelle hat jetzt ein `.catch(() => undefined)`, da sie
  sich zuvor auf die harte Navigation verlassen hat, um eine unbehandelte Promise-Ablehnung bei
  Fehlern zu verdecken.

## v2026.8.19.63 — seit v2026.8.18.56

✨ Neu

- **WBS-Nummerierung und Eltern/Kind-Connectors** (`c3559b2`, `d38ae7b`, `c5a4238`): `buildRows`
  in `TimelineView.tsx` vergibt jetzt in demselben rekursiven Durchlauf, der die Zeilenliste
  aufbaut, eine fortlaufende Nummer (`1`, `1.1`, `1.2`, ...) an jede Task-/Phase-Zeile - rein aus
  der Baumreihenfolge zur Render-Zeit, nicht persistiert. Ein `parentChildConnectors`-`useMemo`
  zeichnet eine SVG-Polylinie vom Enddatum einer Aufgabe durch einen Halbkreis-Marker auf jedem
  Task-Unteraufgaben-Balken, in Zeilenreihenfolge; das Routing durchlief mehrere Iterationen
  (direkte Diagonale → rechtwinkliger Trunk → später Knick pro Kind → gestrichelte
  Durchgangs-Segmente ab der 2. Unteraufgabe → ein kurzer Ellbogen-Stub für einen sichtbaren
  90°-Winkel). Die Connector-Farbe wird pro Phase über `phaseColorClassById` vergeben, aus einer
  Palette, die bewusst getrennt von den Status-/Prioritäts-Farbsets gehalten wird (siehe unten).
- **Kaskadierende Datumsregeln für Unteraufgaben**: `minStartForParent` addiert jetzt einen Tag
  zum Enddatum der übergeordneten Aufgabe, statt denselben Tag zu verwenden. `commitDateChange`
  berechnet ein `deltaFinish` (wie weit sich das Enddatum der gezogenen Aufgabe verschoben hat)
  und läuft über `itemsByParent`, um jede Task-Unteraufgabe um denselben Delta zu verschieben -
  unabhängig von und zusätzlich zur bestehenden `computeCascadeShifts`-Kaskade für
  Blocker-Abhängigkeiten. Die Live-Vorschau während des Drags selbst (nicht erst nach dem
  Loslassen) übernimmt `liveFinishDelta`, das `effectiveRange` jetzt auch für Elemente
  konsultiert, die nicht selbst gezogen werden, aber ein Nachfahre des gezogenen Elements sind.
  Zusätzlich eine live „unsichtbare Wand" in `effectiveRange` ergänzt, damit eine Unteraufgabe
  schon während des Ziehens nicht vor Elternende+1 gezogen werden kann, nicht erst beim Loslassen.
- **Zeilendichte** (`c5a4238`): `ROW_HEIGHT`/Balkenhöhen-Literale durch
  `ROW_HEIGHT_BY_DENSITY`/`BAR_HEIGHT_BY_DENSITY`-Lookups ersetzt, gesteuert über eine
  `Density`-Präferenz (`small`/`medium`/`large`, `small` = die ursprüngliche feste 32/20-Größe,
  damit bestehende Nutzer:innen keine Änderung sehen).
- **Einstellungen-Seite** (`1fcc917`): neue Route `/settings` (`SettingsPage.tsx`), verlinkt aus
  `Header.tsx`s Benutzermenü. Die Präferenz für den Timeline-Balkenfarbmodus
  (`timelineBarColorMode`) ist von einem Action-Bar-Toggle hierher umgezogen; Typ/Optionen/Default
  liegen in `lib/timelinePreferences.ts` als gemeinsame Quelle für beide.
- **Dashboard Timeline/Kanban-Zusammensetzung** (`ee59787`): `ProjectsController.ToDto` berechnet
  jetzt `TimelineItemCount`/`KanbanOnlyItemCount` (gleiche Grundgesamtheit wie `CompletionPercent`
  - alle Items falls Owner, sonst nur die eigenen Aufgaben) sowie pro Spalte
  `OpenTimelineCount`/`OpenKanbanOnlyCount` und deren `My...`-Pendants, über einen gemeinsamen
  `SplitTimelineVsKanban`-Helper (`w.StartDate is not null || w.DueDate is not null`).
  `ColumnTicketCountDto` hat jetzt zusätzlich `TimelineCount`/`KanbanOnlyCount` neben dem
  bestehenden `Count`. Frontend: Die Füllbreite des Dashboard-Fortschrittsbalkens blieb an
  `completionPercent` gekoppelt, die Füllung selbst ist jetzt aber zweifarbig nach Zusammensetzung
  statt einer Flat-Farbe; durchlief eine Farbrunde (Brand-Primary/Brand-Accent wirkte zu
  kontrastreich → einfarbiges Indigo-Paar, hell/dunkel desselben Farbtons).

🔄 Geändert

- **Vereinheitlichung Status-/Prioritätsfarben** (`0f0571f`):
  `STATUS_DOT`/`STATUS_BAR_COLOR` (Timeline) und `COLUMN_BORDER_COLORS` (Kanban) wechselten
  beide zu Gelb/Blau/Grün (Todo/InProgress/Done) plus Rot für `pausiert`/`blockiert`-Namenstreffer.
  `PRIORITY_DOT`/`PRIORITY_COLORS` überarbeitet (Mittel: Sky→Violett, Hoch: Amber→Orange,
  Dringend: Rot→Rosé in der Timeline, passend zum bereits bestehenden Rosé im Kanban), damit keine
  Prio-Farbe mit einer Status-Farbe kollidiert. Versucht, Status/Prio auf den Balken selbst zu
  legen (Streifen + Punkt), aber der linke Balkenrand war bereits belegt (Resize-Handle,
  Blocked-Dependency-Rahmen, Connector-Halbdot bei Unteraufgaben); zurückgerollt zu kompakten
  Label-Spalten (nur Punkt, kein Text, Tooltip).
- `COL_ID` verbreitert (64→88px), damit Referenzcodes im Stil `TSK#00042` nicht abgeschnitten
  werden; letzter Label-Spalte (`COL_PRIORITY`) mehr rechten Abstand gegeben, damit sie nicht
  direkt an der Diagrammkante klebt.

🔧 Behoben

- **Fehlerkennung des Timeline-Drag-Handles**: `handlePointerDown` prüfte
  `event.target.dataset.handle` direkt - ein Klick auf den sichtbaren Griff-Strich (ein
  Kind-`<div>` des eigentlichen Handles, ohne eigenes `data-handle`) fiel auf `'move'` zurück
  statt auf `'resize-start'`/`'resize-end'`. Behoben über `event.target.closest('[data-handle]')`.
- **Timeline-Drag-Zucken/hängenbleibendes Greifen** (`b35465a`): `handlePointerUp` rief
  `setDrag(null)` bisher synchron auf, bevor die Netzwerk-Antwort von `commitDateChange` da war,
  wodurch der Balken für einen Frame seine alte (Vor-Drag-)Position zeigte - basierend auf
  veraltetem `workItems` - bevor er erneut sprang, sobald `onWorkItemsChange` ankam. `drag` bleibt
  jetzt gesetzt, bis das Promise des Commits abgeschlossen ist (`.finally(() => setDrag(null))`).
  Zusätzlich ein `handlePointerCancel` ergänzt, analog zu `handlePointerUp`, aber ohne zu
  speichern, da eine verlorene/abgebrochene Pointer-Erfassung (browser-ausgelöstes
  `pointercancel`, ohne passendes `pointerup`) `drag` zuvor dauerhaft hängen ließ.

## v2026.8.18.56 — seit v2026.8.18.49

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
  `localStorage`-Zugriffe: neue `UserPreference`-Entität + `PreferencesController`
  (`GET`/`PUT /api/preferences`), Postgres-/SqlServer-Migrationen, und ein `PreferencesContext`
  (`getPreference`/`setPreference`), eingehängt in `main.tsx`. `localStorage` bleibt nur noch als
  synchroner Vor-React-Spiegel für das Theme (um einen Flash des falschen Themes vor dem Laden
  des DB-Werts zu vermeiden) - überall sonst ist die DB maßgeblich.
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
