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

## v2026.9.76 - 2026-09-17 21:18

🗑️ Removed

- **Notes hierarchy (parent/child tree) and all four tree-layout graph views removed entirely** -
  explicit user request to go "back to the roots": a plain notes app with cross-linked notes, not
  a mind-mapping tool. Removed:
  - **Backend**: `Note.ParentNoteId`/`ParentNote`/`ChildNotes`, the FK/index/`OnDelete(Restrict)`
    config in `PmDbContextBase`, `NotesController.WouldCreateCycleAsync` and every
    `ParentNoteId`-touching code path (create/update/delete re-parenting,
    `ProjectsController`'s bulk-clear-on-project-delete step), `UpdateNoteRequest.ParentNoteId`/
    `SetParentNoteId`, `NoteDto.ParentNoteId`/`ChildNoteIds`. New EF Core migration
    `RemoveNoteHierarchy` for **both** providers (Postgres + SqlServer) drops the `ParentNoteId`
    column/FK/index.
  - **Frontend**: `notesGraph/TreeGraphView.tsx`, `notesGraph/treeLayouts.ts` (all four layouts -
    `layoutMindMap`/`layoutTree`/`layoutFishbone` - plus `LayoutGuide`/`GraphLayoutId`/
    `TreeLayoutId`), `notesGraph/LayoutPickerPanel.tsx` deleted outright. `NotesView.tsx`'s
    three-button Layout/Farbschema/Form segmented control is now a two-button
    Farbschema/Form control - no layout concept left to pick between, `NoteGraphView.tsx` (the
    free/physics graph) is the only graph view now, rendered unconditionally in graph mode
    instead of behind a `graphLayout === 'free'` branch. `GraphSidePanel.tsx`'s `kind: 'root'`
    branch (the virtual tree-view center node's own appearance panel, plus its
    `rootAppearance`/`onChangeRootAppearance`/`onDetachParent`/`showDetachParent` props) is gone -
    `SelectedNodeInfo` is now just `{ note: Note }`, always a real note. `api/notes.ts`'s
    `createNote`/`updateNote` lost their `parentNoteId`/`setParentNoteId` parameters;
    `api/types.ts`'s `Note` lost `parentNoteId`/`childNoteIds`.
  - `Note.EdgeStyle`/`EdgeArrow`/`EdgeWidth`/`EdgeColor`/`NoteEdgeOverride` and the free
    `[[Title]]` cross-link graph (`NoteGraphView.tsx`, `NoteLink`, `NoteLinkParser`) are
    UNCHANGED - those were never part of the hierarchy, they style/drive the free graph view,
    which stays exactly as it was.

✨ New

- **MSSQL is no longer part of the everyday dev stack.** `docker-compose.yml`'s `mssql` service now
  sits behind a new `mssql-check` Compose profile (analog to the existing `whisper` profile) -
  Postgres alone is the dev default. `start.ps1` gained `-MssqlCheck` (starts `mssql` alongside the
  current provider) and requires it together with `-Db mssql` (`-Db mssql -MssqlCheck`) - using
  `-Db mssql` alone now fails fast with a clear message instead of silently pointing the backend at
  a DB that isn't running. `backend`'s hard `depends_on: mssql` (and `adminer`'s) were removed since
  a `depends_on` on a profile-gated service that isn't started would otherwise block the whole stack
  from coming up at all. Dev container count: 9 → 8 by default. Rationale: keeping two full DB
  servers resident for a provider (`SqlServerPmDbContext`) only occasionally exercised was wasted
  resources for no daily benefit - MSSQL compatibility now gets verified deliberately (manually via
  `-MssqlCheck` today, intended to become an automated RC/V-Commit CI gate later - see "Customer
  distribution concept" in CLAUDE.md) rather than by coincidence of the container always being up.
  Like `-NoWhisper`, `stop`/`restart` without `-MssqlCheck` leaves an already-running `mssql`
  container alone rather than tearing it down - documented in `start.ps1`'s header comment since
  MSSQL is notably more RAM-hungry than whisper and isn't meant to just idle in the background.
- **In-app microphone picker for dictation** (`DictationButton.tsx`) - per explicit user feedback
  that switching microphones meant going into the browser's own site settings and revoking/
  re-granting the mic permission every time. A small chevron next to the mic button opens a
  dropdown listing every Windows audio-input device (`navigator.mediaDevices.enumerateDevices`,
  filtered to `kind === 'audioinput'`, refreshed live on the `devicechange` event so a
  plugged-in USB headset shows up without reopening the app). The chosen device is remembered as
  a DB-backed preference (`dictation.micDeviceId`, via `usePreferences` - never localStorage, per
  project convention) and requested via `getUserMedia({ audio: { deviceId: { ideal } } })` on the
  next recording. Only shown for the MediaRecorder-based providers (Whisper/OpenAI/Google) - the
  Browser provider's Web Speech API has no deviceId concept, it always uses the OS/browser
  default input, so a picker there would be misleading. The one-time browser permission prompt
  itself can't be skipped (a Web Platform security boundary, not an app limitation) but switching
  the requested deviceId once permission is granted does NOT re-trigger it, which is what
  actually eliminates the revoke/re-grant round-trip.
- **Live equalizer bars next to the mic button while recording** (`DictationButton.tsx`,
  `hooks/useMicLevels.ts`) - per explicit user feedback that the existing `animate-ping` red ring
  alone wasn't enough feedback that the mic is actually listening and reacting to voice ("man
  sieht immer nur diesen Button, aber man weiß nicht, ob er einen hört"). New `useMicLevels(stream:
  MediaStream | null)` hook owns a Web Audio API `AudioContext`/`AnalyserNode` (`fftSize = 128`,
  `smoothingTimeConstant = 0.6`) whose 64 frequency bins get grouped into 9 bars (averaged per
  group), each further eased frame-to-frame (`EASING = 0.35`, exponential) so the bars glide
  rather than snap on raw FFT noise - deliberately never connected to `audioContext.destination`,
  so nothing is ever audibly played back, purely an analysis tap. Rendered as a new
  `EqualizerBars` component: 9 rounded-cap bars (`rounded-full`, 3px wide) in the same `red-500`/
  `red-400` (dark) accent already used for the recording state, inside a small bordered pill next
  to the mic button that animates its own width/opacity in on `state === 'recording'` rather than
  causing a layout jump.
  - The two recording paths acquire their `MediaStream` differently, so `useMicLevels` takes an
    already-acquired stream rather than requesting one itself: the MediaRecorder path (Whisper/
    OpenAI/Google, `startMediaRecording()`) already holds one in `streamRef` and just mirrors it
    into a second `visualizerStream` state var for the hook to consume, with no extra
    `getUserMedia` call. The Web Speech API path (Browser provider, `startBrowserRecognition()`)
    has no stream of its own at all (`SpeechRecognition` is an opaque browser-internal service) -
    it fires a second, independent `getUserMedia` call purely for the visualization, best-effort
    (a failure there doesn't affect recognition itself, which is already running by that point).
    Both requests honor the same `preferredDeviceId`/`MIC_DEVICE_PREFERENCE_KEY` device choice as
    the recording stream itself, so the bars reflect whichever mic was actually selected.
  - `AudioContext`/`AnalyserNode`/`requestAnimationFrame` loop are torn down in the effect's
    cleanup (`cancelAnimationFrame`, `source.disconnect()`, `analyser.disconnect()`,
    `audioContext.close()`) whenever the stream changes or recording stops, avoiding a
    hung/leaked audio context - verified live via Playwright (bar height reads at three points in
    time while a fake sine-wave test microphone was recording, confirming the rendered heights
    actually change frame to frame, then confirming zero bar elements remain in the DOM after
    stopping).
  - `lib/speechRecognition.d.ts` (the project's existing ambient-typings file for Web Speech API
    globals TypeScript's own `lib.dom.d.ts` doesn't cover) gained `Window.webkitAudioContext?:
    typeof AudioContext` for Safari's vendor-prefixed `AudioContext` fallback.

🔧 Fix

- **Dictation error/device popups no longer run off the viewport.** Both now measure the mic
  button's actual position (`getBoundingClientRect`) before opening and flip to a left- or
  right-anchored alignment when the default placement would clip against the window edge -
  previously both were unconditionally centered/left-anchored under the button, which cut the
  error text off entirely in a narrow toolbar near the window edge (the user's exact complaint:
  the message ran outside the window and couldn't be read in full).
- **More specific dictation error messages** distinguishing `NotAllowedError`/`SecurityError`
  (permission blocked - now tells the user to use the address-bar lock icon to re-allow and
  reload, instead of a generic "check permission"), `NotFoundError`/`OverconstrainedError` (no
  mic found), and `NotReadableError` (device already in use by another app) - previously one
  generic "Mikrofonzugriff nicht möglich" for every `getUserMedia` failure.

🔄 Change

- **Picking a color scheme / shape now closes its popover** in `NotesView.tsx` - each is a
  one-shot action and the open menu was covering the graph the user wants to see.
- **`ThemeContext.tsx`'s `toggleTheme` no longer calls `setPreference()` (a different component's
  state) inside the `setTheme` updater callback** - same "Cannot update a component while
  rendering a different component" bug already fixed once for `NotesView.tsx`'s
  `setRootAppearance`, caught live here via a React console warning during this session's
  end-to-end verification. `theme` is already the current value at the call site, so the next
  value is computed directly instead of through the updater form.

Note: this version also briefly rewrote the Mind Map and Fishbone tree layouts (radial-sunburst
overlap fix, a real Ishikawa spine) earlier in the same working session - that work, and the tree
layouts it improved, were removed again by the "Notes hierarchy removed entirely" entry above
before this version was ever committed, per a later explicit user request to drop the whole
tree-layout concept. Not worth its own entry since it never shipped as a committed version.

## v2026.9.75

🔄 Change

- **Center-node click no longer opens the project-wide layout/preset options** - per explicit user
  feedback. `GraphSidePanel`'s `kind: 'root'` branch now renders only `NoteAppearanceMenu` (the
  center node's own color/shape/edge style/arrowheads - no width/color, it has no backing `Note`),
  identical in shape to what a regular note click opens. The `currentLayout`/`onChangeLayout`/
  `onApplyPreset`/`applyingPreset` props are gone from `GraphSidePanel` and from
  `TreeGraphView`/`NoteGraphView`.
- **"Layout & Stil" split into THREE separate, fully independent axes** in one segmented control
  (same glass-panel treatment as the List/Graph toggle), `openMenu: 'layout' | 'scheme' | 'shape'
  | null` in `NotesView.tsx`, one popover at a time:
  - `LayoutPickerPanel.tsx` (new): the 5 layouts, each with a small hand-drawn SVG topology
    thumbnail (radial / left-right / top-down / herringbone / loose). Handwritten SVGs, no icon
    library - same convention as `NoteAppearanceMenu`'s shape/edge preview icons.
  - `ColorSchemePanel.tsx` (new): **pure palette** - the 6 `COLOR_SCHEMES` from `colorSchemes.ts`,
    each previewed as its own swatches. Applying one only distributes that palette round-robin
    across every note (`assignSchemeColors`, center gets the first color) - nothing else.
  - `ShapePickerPanel.tsx` (new): the 5 `NoteShape` values applied project-wide - nothing else
    changes. `SHAPE_OPTIONS` extracted to `shapeOptions.ts` and `ShapePreviewIcon` to
    `shapePreview.tsx` (two files so each stays a single-export module for Fast Refresh); both
    shared with `NoteAppearanceMenu`.
  - `stylePresets.ts` + `GraphSettingsPanel.tsx` deleted. `GraphLayoutId` moved to
    `treeLayouts.ts`.
- **No confirm dialog on any of the three** - previously a `window.confirm("… anwenden? Dies
  überschreibt …")` gated the preset apply; removed per explicit user feedback, all three apply
  immediately.
- **The three axes no longer interfere with each other**: `handleApplyPreset` split into
  `handleApplyScheme` (only `color`, via `appearanceOf(note)` for everything else) and
  `handleApplyShape` (only `shape`); neither touches layout, and applying one leaves the other
  two untouched. Last-applied scheme/shape remembered only as a preference
  (`notesGraphScheme`/`notesGraphShape`) for the active-item highlight - the real per-note values
  can't be reverse-derived.
- **Every dropdown menu now closes on an outside click or Escape** - per explicit user feedback
  that menus stayed stuck open after clicking away. New `useClickOutside(ref, active, onOutside)`
  hook (`hooks/useClickOutside.ts`): a document-level capture-phase `pointerdown` listener plus an
  Escape handler, active only while the menu is open. Replaces the `<div className="fixed inset-0">`
  click-catcher overlays, which silently failed whenever a higher-`z-index`/`position: fixed`
  element painted over them or a `stopPropagation()` sat in the click path. Applied to the header
  user menu (`Header.tsx`), the project switcher (`ProjectSwitcher.tsx`), the shared
  `ContextMenu.tsx`, both graph views' right-click menus (`NoteGraphView.tsx`,
  `notesGraph/TreeGraphView.tsx`) and the Layout/Farbschema/Form popovers (`NotesView.tsx`).
  `TimelineView.tsx`/`KanbanBoard.tsx` already had their own outside-click effects (multi-menu,
  conditional refs - left as-is) and only gained the matching Escape-to-close.

## v2026.9.74

✨ New

- **Per-note edge width/color, plus per-connection style overrides** - after direct live user
  feedback on v2026.9.73's Glow edge style ("thick and blurry, not elegant"):
  - **Removed the Glow edge style entirely** (backend enum value retired, not reused; frontend
    option, rendering, and defs removed) rather than kept around disabled - the user rejected the
    visual outright, not just declined to use it.
  - Backend: `Note` gains `EdgeWidth` (double?, clamped 0.5-12px server-side) and `EdgeColor`
    (hex string, same validation as `Color`) - note-wide stroke width/color for every edge drawn
    FROM that note, independent of the node's own fill `Color` (explicit user request: line color
    separately choosable from the node it originates at).
  - New `NoteEdgeOverride` model/table (composite key `SourceNoteId`+`TargetNoteId`, scoped to
    `ProjectId`) - a style override for ONE specific connection's width/color only, on top of
    (not instead of) the note-wide fields above. Covers both a tree edge to a `ChildNote` and a
    free-view `NoteLink` uniformly, since both are just a (source, target) note pair. New endpoint
    `PUT /api/projects/{projectId}/notes/{noteId}/edge-overrides/{targetNoteId}`
    (`UpdateNoteEdgeOverrideRequest`) - both fields null deletes the row instead of storing a
    no-op override. `NotesController.Delete` explicitly clears rows where the deleted note is
    either the source or target (NoAction FKs on both sides, same reasoning as `NoteLink`).
    Migration `AddNoteEdgeWidthColorAndOverrides` for both providers, verified live.
  - Every edge in both graph views is now individually clickable (a wide invisible hit-area
    path/line sits under each rendered edge, root-level tree edges excluded since the virtual
    center has no backing Note) - opens the new `EdgeOverridePanel.tsx` instead of the usual node
    panel, restyling just that one connection. `NoteAppearanceMenu.tsx` gets matching "Liniendicke"
    (range slider, 0.5-12px)/"Linienfarbe" (palette picker, reused from the node-color section)
    controls for the note-wide fields - both made optional props so the root/center node (which
    has no backing Note and therefore no edgeWidth/edgeColor concept) can omit them entirely
    rather than showing controls against a value that doesn't exist.
  - `edgeStyles.tsx`: new `resolveEdgeWidth`/`resolveEdgeColor` (override beats note-wide beats
    view default) and `EDGE_COLOR_NORMAL`/`EDGE_COLOR_HIGHLIGHT` (exported, replacing the former
    internal-only marker fill constants). `edgeGradientId`/`edgeGradientStroke`/
    `edgeGradientDefFor` now key on the edge's actually-resolved color, not just a highlighted
    boolean, so two edges with identical geometry but different colors (via edgeColor/override)
    get distinct gradient defs instead of colliding on one.
  - Found and fixed a real React bug while wiring this up: `setRootAppearance` called
    `setPreference()` (updates a different component, `PreferencesStateProvider`) from inside its
    own `setRootAppearanceState` updater callback - React logs "Cannot update a component while
    rendering a different component" for that, since updater functions must be pure and React can
    invoke them during a render pass. Fixed by computing the merged value directly instead of
    relying on the updater form.
  - Fixed the Gradient preview icon in `NoteAppearanceMenu.tsx`, reported as rendering completely
    blank - a chain of three SVG masking issues, each confirmed live before being fully fixed: (1)
    `stopColor="currentColor"` doesn't work on `<stop>` (it isn't a painted element, so it never
    inherits an ancestor's `color`); (2) switching to a fixed `stopColor="black"` with varying
    `stopOpacity` still rendered blank, since an SVG `<mask>` defaults to *luminance* masking
    (white = visible, black = invisible) and a black stop contributes ~0 luminance regardless of
    its own opacity; (3) even after switching to `stopColor="white"`, the `<mask>`'s own region
    (default `maskUnits="objectBoundingBox"`) degenerates to zero on a perfectly horizontal
    `<line>`'s zero-height bounding box, clipping the line out entirely - fixed with an explicit
    `maskUnits="userSpaceOnUse"` region matching the icon's own viewBox.

## v2026.9.73

✨ New

- **Note hierarchy tree layouts (mind map/tree/org chart/fishbone), a permanent right-side
  settings panel, gradient/glow edge styles, and a long tail of graph-view bugfixes** - the bulk
  of this entry is fixes found and verified via live Playwright testing against the running dev
  stack, not just code review:
  - `notesGraph/GraphSidePanel.tsx`/`GraphSettingsPanel.tsx` (new): the project-wide layout picker
    + style presets + root-node appearance block, previously reachable only by clicking
    `TreeGraphView`'s center node, is extracted into its own component and now ALSO reachable from
    a standalone "Layout & Stil" button next to the List/Graph toggle in `NotesView.tsx` - working
    in both the free and tree views (the free view has no center-node concept, so a note click
    there could never reach it). Both entry points are kept side by side, not one replacing the
    other. Fixed two real bugs surfaced by testing this live: a `position: fixed` click-outside
    overlay was painting over the button itself (a fixed/positioned sibling always outranks a
    `position: static` one regardless of a parent's z-index), silently swallowing the second click
    meant to close the menu; and `GraphSidePanel` still carried a leftover `position: absolute`
    from its pre-refactor popup days, making it render outside its intended flex-layout slot.
  - `edgeStyles.tsx`'s `clipPointToBoxEdge` had its anchor-facing direction inverted since the
    function was first written - it picked the box anchor whose direction MATCHED the incoming
    line instead of the one FACING it, i.e. the far side of the box instead of the near side. This
    was the actual root cause behind three previously-attempted "fixes" that didn't hold
    (verified live: arrowheads now correctly point at the side of the box the line actually
    approaches from, on both curved tree edges and straight free-view edges).
  - `TreeGraphView.tsx`'s edge-anchor box size for the root/center node was still a hardcoded
    `CENTER_RADIUS*2` (68×68) circle assumption left over from when the root always rendered as a
    plain `<circle>` - once the root could render as a full `NoteNodeVisual` box (any shape, sized
    to fit `projectName`, often 130px+ wide), anchors were computed against a box far smaller than
    what's actually on screen, placing them inside the real rendered edge instead of outside it
    (the "no gap on the root's anchors" symptom, most visible on its left/right sides). Now uses
    `measureNodeBox(projectName, rootAppearance.shape)` when the root has an explicit
    color/shape, matching what it actually renders as.
  - The root/center node in `TreeGraphView.tsx` had an inconsistent bubble-phase `onPointerDown` +
    separate `onClick` (no pointer capture taken) for opening the side panel, while
    `handleBackgroundPointerDown` on the enclosing `<svg>` unconditionally takes pointer capture
    on every pointerdown - since capture is a native browser routing decision a synthetic
    `stopPropagation()` call cannot undo, a click on the root could silently be routed to the
    background pan handler instead, never reaching the panel. Switched to `onPointerDownCapture` +
    the same click-vs-drag path (`draggingRef`/`handleSvgPointerUp`) every other node already
    uses, which resolves the race unconditionally rather than relying on handler-ordering luck.
  - `NoteGraphView.tsx`'s manually-dragged free-view position was only ever persisted once the
    physics simulation fully settled below `ALPHA_MIN` - dragging several notes in a row (each new
    drag's `wake(0.4)` keeps alpha above that threshold) could silently drop every save but the
    last one, and a page reload/navigation before the simulation ever settled dropped it entirely.
    Confirmed live via a DB query: several notes had `FreeViewX`/`FreeViewY` still `NULL` despite
    being visibly repositioned, and one had reached a wildly out-of-view coordinate (thousands of
    px) - traced to a second bug in the same area: the note-add/remove effect was re-fitting the
    camera transform unconditionally, even while a drag was in progress, so a small mouse movement
    divided by a suddenly-much-smaller zoom factor translated into a huge world-coordinate jump
    for that one frame. Positions now save immediately on pointerup (plus an unmount safety net),
    and the camera re-fit is skipped entirely while `draggingRef.current` is set.
  - `NotesView.tsx`'s `viewMode`/`graphLayout`/`rootAppearance` were only ever read from
    `usePreferences()` once, in each `useState` initializer - since `PreferencesContext` loads the
    real DB values asynchronously, a mount that raced ahead of that fetch froze in the hardcoded
    fallback forever (React never re-runs a `useState` initializer), which is what caused the
    reported "view mode randomly flips between list/graph on repeated reloads" and a matching
    graph-layout version of the same symptom. Fixed with the same `prevLoaded`-comparison-during-
    render pattern already used in `ThemeContext.tsx`, syncing the real DB values in once `loaded`
    flips true.
  - Found and fixed one new bug introduced by the above: `setRootAppearance` called
    `setPreference()` (which updates a sibling component, `PreferencesStateProvider`) from inside
    its own `setRootAppearanceState` updater callback - React logs "Cannot update a component
    while rendering a different component" for that, since an updater function must be a pure
    `prev -> next` computation and React may invoke it during a render pass, not only after
    commit. Fixed by computing the merged value directly (the current state is already in scope)
    instead of relying on the updater form.
  - Backend: `NoteEdgeStyle` gains two more values, `Gradient` and `Glow` - two alternative,
    user-selectable ways to make an edge line read as more polished than a flat stroke, offered as
    siblings rather than picking one for the user (matching the existing per-note edge-styling
    convention, applied to the LINE only, never the arrowhead marker). No migration needed (the
    column is a plain nullable `int`), but adding an enum VALUE (not a new property) can't be
    hot-reloaded by `dotnet watch` - confirmed live, it requires an actual container restart
    (`ENC0021: Adding enum value requires restarting the application`).
  - `edgeStyles.tsx`: `Gradient` renders via a per-edge `<linearGradient gradientUnits=
    "userSpaceOnUse">` using the edge's own real endpoint coordinates - the default
    `objectBoundingBox` gradient space maps a fixed left-to-right angle onto the referencing
    element's bounding box, which is only correct for a perfectly horizontal line; any angled edge
    (most of them, in both layouts) would have its fade-to-transparent points skewed off the
    line's actual start/end. `Glow` renders as a second, wider, blurred duplicate of the line
    UNDERNEATH the normal sharp one (its own `<path>`/`<line>`, no markers on it), not a blur
    filter applied to the real line directly - the first version did exactly that and, confirmed
    live via screenshot, produced a thick, uniformly-blurred haze with no crisp line surviving at
    all (`feGaussianBlur` has no "sharp core, blurred edges only" mode - it blurs the whole
    rendered shape). `NoteAppearanceMenu.tsx` gets matching hand-drawn preview icons for both
    (each with its own `useId()`-scoped gradient/filter def, distinct from the small fixed set the
    real edge rendering uses, since a menu preview needs to follow the button's own
    currentColor/theme rather than the two fixed edge colors).
  - `edgeStyles.tsx`'s `EDGE_GAP` (line-to-box clearance) raised from 4px to 10px per user
    feedback that the previous gap read as too tight, especially once arrowhead markers sit right
    at the line's tip.

## v2026.9.72

✨ New

- **Click-to-open appearance menu, plus per-note edge line styling (dash pattern + arrowheads)**:
  - Clicking a node (no drag) in both graph views now opens the same menu the right-click context
    menu already showed, instead of jumping straight into the note editor - "Notiz öffnen" is
    still the menu's first entry, so opening the note is one click away, not the only thing a
    click does. Right-click still works identically as an alternative entry point.
  - Backend: `Note` gains `EdgeStyle` (new `NoteEdgeStyle` enum: `Solid`/`Dashed`/`Dotted`) and
    `EdgeArrow` (new `NoteEdgeArrow` enum: `None`/`End`/`Start`/`Both`) - same "no tri-state flag"
    convention as `Color`/`Shape` (every `PUT` applies them as given, `null` = default). These
    settings live on the note whose outgoing edges they affect - a note's `EdgeStyle`/`EdgeArrow`
    style *every* line drawn from it, both to its `ChildNotes` in the tree layouts and along its
    `OutgoingLinks` in the free-layout view. Migrations `AddNoteEdgeStyle` for both providers,
    verified live.
  - `notesGraph/edgeStyles.tsx`: shared `edgeStrokeDasharray()`, `edgeMarkerRefs()`, and an
    `EdgeMarkerDefs` component (four `<marker>` defs - normal/highlighted × start/end) used by
    both `TreeGraphView.tsx` and `NoteGraphView.tsx`'s edge rendering. Deliberately **not** using
    SVG's `context-stroke` for marker color (unsupported in Firefox) - fixed fill colors matching
    the existing `slate-400`/`brand-primary` stroke classes instead. In the tree layouts, an edge
    is styled by its *parent* (source) note; root-level edges from the virtual project center have
    no source note and always render as the plain default.
  - `NoteAppearanceMenu.tsx` gains two new sections ("Linienstil"/"Pfeilspitzen") with hand-drawn
    SVG preview icons, matching the existing color/shape sections' layout.

## v2026.9.71

✨ New

- **Per-note color and shape, plus color palettes, across all tree/graph views**:
  - Backend: `Note` gains `Color` (hex string, validated `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`,
    400 with a specific message on an invalid value) and `Shape` (new `NoteShape` enum:
    `Rounded`/`Rectangle`/`Diamond`/`Underline`/`Ellipse`). Deliberately **no**
    `SetParentNoteId`-style tri-state flag for these two - unlike the parent hierarchy, the note
    editor always has both values in hand whenever it saves at all, so every `PUT` just applies
    them as given (`null` = revert to default); every `updateNote()` caller on the frontend must
    pass the note's current `color`/`shape` through even on a plain title/content save, or they'd
    be silently reset. Migrations `AddNoteColorShape` for both providers, verified live.
  - `notesGraph/colorSchemes.ts`: 6 predefined palettes (Standard/Lebendig/Pastell/Ozean/
    Sonnenuntergang/Wald), all 44 colors WCAG-checked (≥4.5:1 against whichever of white/dark text
    reads better) - two initial candidates were swapped for darker variants after failing the
    check. `getReadableTextColor()` picks the in-node text color per note automatically.
  - `notesGraph/NoteNodeShape.tsx`: shared `NoteNodeVisual` renders all five shapes as SVG, sized
    to the title's length, with the title inside the shape (Underline: text + line, no
    background/border) - replaces the previous fixed-size `<circle>` in both graph views. Default
    fill for notes without a custom color moved to a fixed `#475569` (theme-independent) - the
    prior theme-conditional slate tone would have read at only 2.56:1 against white inner text in
    dark mode.
  - `notesGraph/NoteAppearanceMenu.tsx`: the color/shape picker appended to each node's context
    menu (all palettes as clickable swatches, a "Zurücksetzen" per property, five shape-preview
    buttons) - newly added to `NoteGraphView.tsx`'s free-layout view too, which had no per-node
    context menu at all before this.
  - `treeLayouts.ts`'s spacing constants (e.g. `SIBLING_SPACING` 56→88, `DEPTH_SPACING` 220→260)
    and `NoteGraphView.tsx`'s force-simulation constants (`REPULSION` 2000→5500, `LINK_DISTANCE`
    90→160) increased so the now text-sized node boxes don't overlap.
  - `assignSchemeColors()`/`colorForIndex()` (bulk-assign a palette across several notes at once)
    exist but aren't wired to a UI trigger yet - no concrete "apply to these notes" action was
    specified; add one when there's a specific place for it.

📝 Other

- Created `CLAUDE.md` at the repo root (via `/init`) - commands, and the architectural points that
  need reading multiple files to piece together (dual EF Core provider setup, the two independent
  note relationship graphs, the two different "leave this field alone" update conventions, etc.).

## v2026.9.70

✨ New

- **Note hierarchy (parent/child), separate from the existing free cross-links**, plus four tree
  views to browse it:
  - `Note` gains `ParentNoteId`/`ChildNotes`; `NotesController` enforces same-project and
    cycle-detection (`WouldCreateCycleAsync`) on reassignment, and promotes children to root notes
    on delete instead of cascading. `UpdateNoteRequest` gained a `SetParentNoteId` bool - a plain
    title/content save must never implicitly touch the hierarchy, since `ParentNoteId` alone can't
    distinguish "leave unchanged" from "clear it" (both deserialize to `null` when omitted).
  - Migrations for both providers (`AddNoteParent`), verified live on Postgres and SqlServer.
  - `notesGraph/treeLayouts.ts` computes four tree layouts (mind map, left-to-right tree,
    top-to-bottom org chart, fishbone) from one shared parent/child traversal;
    `notesGraph/TreeGraphView.tsx` is the shared canvas (zoom/pan, drag-to-reparent, create/
    context menus) all four share, replacing the earlier single-layout `NoteRadialView.tsx`. Fixes
    a bug where root notes never got a connector line to the center - `buildEdges` now always
    routes an edge from the virtual center for every depth-1 node.
  - `NotesView.tsx` now has a single "Graph" tab with a layout picker instead of separate tabs per
    layout (`notesGraphLayout` preference).

🔧 Fix

- **Session-expiry left the page stuck loading forever after a re-login**: `ProjectPage`'s
  `Promise.all` had no `.catch()`, so a 401 (session expired mid-load) rejected silently
  (`Uncaught (in promise) ApiError` in the console) and `loading` never left `true`. Now shows a
  retry button for real errors and waits out a 401 specifically. `AuthContext` gains
  `authVersion`, bumped on every successful (re-)login, so `ProjectPage`/`ProjectsPage`'s load
  effects re-run automatically once the user logs back in via `SessionExpiredModal` instead of
  requiring a manual page reload.
- **Dictation upload rejected with "Nicht unterstützter Audio-Dateityp." / 500**: browsers report a
  `MediaRecorder` blob's type with codec parameters attached (e.g. `audio/webm;codecs=opus`),
  which both the backend's content-type allowlist check and `MediaTypeHeaderValue`'s constructor
  rejected outright (the latter throwing `FormatException`, surfacing as a 500 in
  `WhisperTranscriptionService`/`OpenAiTranscriptionService`). Fixed by comparing only the base
  MIME type (before the first `;`) against the allowlist and using `MediaTypeHeaderValue.Parse()`
  instead of the constructor.
- **"Unable to preventDefault inside passive event listener invocation" on every scroll tick** in
  both graph views: React's `onWheel` prop is always registered passive; the zoom handler needs a
  manually-attached `addEventListener('wheel', ..., { passive: false })` instead.

📝 Other

- App version (already computed by the backend) is now actually shown somewhere in the UI - the
  header's profile dropdown - fetched once via a new `api/version.ts` on mount.

## v2026.9.69

✨ New

- **Voice dictation for Notes, admin-configurable across four providers** (Browser/Whisper/
  OpenAI/Google), via a new reusable `DictationButton`:
  - **Backend**: `TranscriptionSettings` (singleton row, `Models/TranscriptionSettings.cs`) holds
    the active provider, Whisper endpoint URL, language, an `AutoSummarize` flag, and the OpenAI/
    Google API keys encrypted at rest via ASP.NET Core Data Protection
    (`TranscriptionSettingsService`). Data Protection's key ring is now persisted to the database
    (`PersistKeysToDbContext<PmDbContextBase>`) instead of ephemeral local storage, so encrypted
    keys survive container restarts.
  - `TranscriptionController`: `GET`/`PUT /api/transcription-settings` (Admin-only, tri-state key
    semantics - omit to keep, empty string to clear, non-empty to replace) and
    `POST /api/transcribe` (any authenticated user), dispatching to one of three
    `ITranscriptionProvider` implementations (`Whisper`/`OpenAi`/`GoogleTranscriptionService`) over
    named `HttpClient`s. 25MB request size limit; provider errors return a generic 502 with
    details only logged (API keys redacted from logged error text), never leaked to the client.
  - Migrations for both providers: `AddTranscriptionSettings` and `AddTranscriptionAutoSummarize`.
  - **Frontend**: `DictationButton` has idle/recording/processing/error states, `MediaRecorder`-
    based capture for the three server-side providers, native `SpeechRecognition` for Browser
    (disabled with a tooltip where the API is unavailable, e.g. Firefox). Wired into
    `NotesView.tsx`, inserting the transcribed text at the cursor position.
  - `TranscriptionSettingsSection` in `SettingsPage.tsx` (admin-only): provider picker with a
    short explanation per option, Whisper endpoint field, API key fields (show only whether a key
    is set, never the value), language picker, and an auto-summarize toggle (enabled only for
    OpenAI/Google).
  - New `ToggleSwitch` component (red/off - green/on) - the project's first toggle switch,
    contrast-checked in both themes; establishes the pattern for future toggles.

📦 Dependencies

- **Added an optional, profile-gated Whisper speech-to-text service** for the voice-dictation
  feature above:
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

## v2026.9.68

📝 Other

- **Versioning scheme changed again: `Year.Month.Day.CommitOfTheDay` → `Year.Month.CommitOfTheYear`**:
  dropped the day segment and the daily reset - this user mostly commits in small end-of-session
  batches rather than evenly through the day, so a per-day counter mostly just read `.1`/`.2` and
  added little information. A per-year counter gives a more meaningful at-a-glance sense of
  overall commit volume instead. `scripts/git-hooks/post-commit` and `start.ps1`'s `Get-AppVersion`
  now compute the count via `git rev-list --count HEAD --since="$(date +%Y)-01-01T00:00:00"`
  instead of `--since=midnight`. Existing `CHANGELOG.dev.md`/`CHANGELOG.md` version headings
  recomputed to the new 3-segment scheme (all commits so far are within 2026, so the yearly count
  equals the previous total count - only the day segment actually disappears).
- **Copyright holder renamed: SynShift Labs → SushiFlux Develop** (company rename) in `NOTICE` and
  `docs/02-decisions.md`.

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

## v2026.9.76 - 2026-09-17 21:18

🗑️ Entfernt

- **Notizen-Hierarchie (Eltern/Kind-Baum) und alle vier Baum-Layout-Graph-Ansichten komplett
  entfernt** - auf ausdrücklichen Nutzerwunsch, zurück zu den Wurzeln: eine reine Notizen-App mit
  querverlinkten Notizen, kein Mindmapping-Tool. Entfernt:
  - **Backend**: `Note.ParentNoteId`/`ParentNote`/`ChildNotes`, die FK-/Index-/
    `OnDelete(Restrict)`-Konfiguration in `PmDbContextBase`,
    `NotesController.WouldCreateCycleAsync` und jeder `ParentNoteId`-berührende Codepfad
    (Erstellen/Ändern/Löschen-Umhängen, `ProjectsController`s Massen-Zurücksetzen beim
    Projekt-Löschen), `UpdateNoteRequest.ParentNoteId`/`SetParentNoteId`,
    `NoteDto.ParentNoteId`/`ChildNoteIds`. Neue EF-Core-Migration `RemoveNoteHierarchy` für
    **beide** Provider (Postgres + SqlServer) entfernt Spalte/FK/Index von `ParentNoteId`.
  - **Frontend**: `notesGraph/TreeGraphView.tsx`, `notesGraph/treeLayouts.ts` (alle vier Layouts -
    `layoutMindMap`/`layoutTree`/`layoutFishbone` - plus `LayoutGuide`/`GraphLayoutId`/
    `TreeLayoutId`), `notesGraph/LayoutPickerPanel.tsx` komplett gelöscht. Der
    Dreier-Container Layout/Farbschema/Form in `NotesView.tsx` ist jetzt ein Zweier-Container
    Farbschema/Form - kein Layout-Konzept mehr zum Auswählen, `NoteGraphView.tsx` (der freie/
    physikbasierte Graph) ist jetzt die einzige Graph-Ansicht, bedingungslos im Graph-Modus
    gerendert statt hinter einer `graphLayout === 'free'`-Verzweigung. `GraphSidePanel.tsx`s
    `kind: 'root'`-Zweig (das eigene Aussehen-Panel des virtuellen Baum-Mittelpunkts, plus dessen
    `rootAppearance`/`onChangeRootAppearance`/`onDetachParent`/`showDetachParent`-Props) ist weg -
    `SelectedNodeInfo` ist jetzt nur noch `{ note: Note }`, immer eine echte Notiz. `api/notes.ts`s
    `createNote`/`updateNote` verloren ihre `parentNoteId`/`setParentNoteId`-Parameter;
    `api/types.ts`s `Note` verlor `parentNoteId`/`childNoteIds`.
  - `Note.EdgeStyle`/`EdgeArrow`/`EdgeWidth`/`EdgeColor`/`NoteEdgeOverride` und der freie
    `[[Titel]]`-Querlink-Graph (`NoteGraphView.tsx`, `NoteLink`, `NoteLinkParser`) sind
    UNVERÄNDERT - die waren nie Teil der Hierarchie, sie stylen/treiben die freie Graph-Ansicht,
    die exakt so bleibt wie sie war.

✨ Neu

- **MSSQL ist nicht mehr Teil des täglichen Dev-Stacks.** Der `mssql`-Service in
  `docker-compose.yml` sitzt jetzt hinter einem neuen `mssql-check`-Compose-Profil (analog zum
  bestehenden `whisper`-Profil) - Postgres allein ist der Dev-Default. `start.ps1` bekam
  `-MssqlCheck` (startet `mssql` zusätzlich zum aktuellen Provider) und verlangt es zusammen mit
  `-Db mssql` (`-Db mssql -MssqlCheck`) - `-Db mssql` allein schlägt jetzt sofort mit einer klaren
  Meldung fehl statt das Backend still auf eine nicht laufende DB zeigen zu lassen. Das harte
  `depends_on: mssql` von `backend` (und `adminer`) wurde entfernt, da ein `depends_on` auf einen
  profil-gebundenen, nicht gestarteten Service sonst den kompletten Stack-Start blockiert hätte.
  Dev-Container-Zahl: 9 → 8 im Standardfall. Grund: zwei volle DB-Server dauerhaft laufen zu lassen
  für einen Provider (`SqlServerPmDbContext`), der nur gelegentlich geprüft wird, war verschwendete
  Ressourcen ohne täglichen Nutzen - die MSSQL-Kompatibilität wird jetzt bewusst geprüft (aktuell
  manuell über `-MssqlCheck`, später als automatisiertes RC-/V-Commit-CI-Gate gedacht - siehe
  "Customer distribution concept" in CLAUDE.md) statt zufällig, weil der Container ohnehin lief.
  Wie bei `-NoWhisper` lässt `stop`/`restart` ohne `-MssqlCheck` einen bereits laufenden
  `mssql`-Container unberührt statt ihn zu stoppen - im Kopfkommentar von `start.ps1` dokumentiert,
  da MSSQL spürbar RAM-hungriger als whisper ist und nicht einfach im Hintergrund weiterlaufen soll.
- **Mikrofon-Auswahl direkt in der App für das Diktieren** (`DictationButton.tsx`) - auf
  ausdrücklichen Nutzerwunsch, weil das Mikrofonwechseln bisher bedeutete, in die
  Browser-Website-Einstellungen zu gehen und die Mikrofonberechtigung jedes Mal zu entziehen und
  neu zu erteilen. Ein kleiner Pfeil neben dem Mikro-Button öffnet ein Dropdown mit allen
  erkannten Windows-Audio-Eingabegeräten (`navigator.mediaDevices.enumerateDevices`, gefiltert auf
  `kind === 'audioinput'`, live aktualisiert über das `devicechange`-Event, sodass ein neu
  angeschlossenes USB-Headset auch ohne App-Neustart erscheint). Das gewählte Gerät wird als
  DB-gestützte Preference gemerkt (`dictation.micDeviceId`, über `usePreferences` - nie
  localStorage, gemäß Projektkonvention) und beim nächsten Aufnahmestart über
  `getUserMedia({ audio: { deviceId: { ideal } } })` angefordert. Nur bei den
  MediaRecorder-basierten Anbietern (Whisper/OpenAI/Google) sichtbar - die Web Speech API des
  Browser-Anbieters kennt kein deviceId-Konzept, sie nutzt immer das OS-/Browser-Standardgerät,
  eine Auswahl dort wäre irreführend. Die einmalige Browser-Berechtigungsabfrage selbst lässt sich
  nicht überspringen (eine Web-Plattform-Sicherheitsgrenze, keine App-Einschränkung), aber das
  interne Wechseln der angeforderten deviceId löst sie NICHT erneut aus, sobald die Berechtigung
  einmal erteilt ist - genau das erspart den Entzugs-/Neuerteilungs-Umweg.
- **Live-Equalizer-Balken neben dem Mikro-Button während der Aufnahme** (`DictationButton.tsx`,
  `hooks/useMicLevels.ts`) - auf ausdrücklichen Nutzerwunsch, weil der bisherige rote
  `animate-ping`-Ring allein nicht genug Feedback gab, dass das Mikrofon wirklich zuhört und auf
  die Stimme reagiert ("man sieht immer nur diesen Button, aber man weiß nicht, ob er einen
  hört"). Der neue Hook `useMicLevels(stream: MediaStream | null)` hält einen Web-Audio-API-
  `AudioContext`/`AnalyserNode` (`fftSize = 128`, `smoothingTimeConstant = 0.6`), dessen 64
  Frequenz-Bins zu 9 Balken gruppiert werden (Mittelwert je Gruppe), zusätzlich Frame für Frame
  geglättet (`EASING = 0.35`, exponentiell), damit die Balken gleiten statt auf FFT-Rauschen hart
  zu springen - bewusst nie mit `audioContext.destination` verbunden, sodass nie tatsächlich Audio
  hörbar abgespielt wird, rein zur Analyse. Gerendert als neue `EqualizerBars`-Komponente: 9
  Balken mit abgerundeten Enden (`rounded-full`, 3px breit) im selben `red-500`/`red-400`
  (Dark-Mode)-Akzent, der schon für den Recording-Zustand verwendet wird, in einer kleinen
  umrandeten Pille neben dem Mikro-Button, die ihre eigene Breite/Deckkraft bei
  `state === 'recording'` einblendet statt einen Layout-Sprung zu verursachen.
  - Die beiden Aufnahme-Pfade beschaffen ihren `MediaStream` unterschiedlich, daher nimmt
    `useMicLevels` einen bereits vorhandenen Stream entgegen statt selbst einen anzufordern: Der
    MediaRecorder-Pfad (Whisper/OpenAI/Google, `startMediaRecording()`) hält bereits einen in
    `streamRef` und spiegelt ihn nur zusätzlich in eine zweite `visualizerStream`-State-Variable
    für den Hook - ohne weiteren `getUserMedia`-Aufruf. Der Web-Speech-API-Pfad
    (Browser-Anbieter, `startBrowserRecognition()`) hat gar keinen eigenen Stream
    (`SpeechRecognition` ist ein intransparenter browserinterner Dienst) - er stößt einen
    zweiten, unabhängigen `getUserMedia`-Aufruf rein für die Visualisierung an, nach bestem
    Bemühen (ein Fehlschlag dort beeinträchtigt die eigentliche Spracherkennung nicht, die zu dem
    Zeitpunkt bereits läuft). Beide Anfragen respektieren dieselbe
    `preferredDeviceId`/`MIC_DEVICE_PREFERENCE_KEY`-Geräteauswahl wie der Aufnahme-Stream selbst,
    sodass die Balken das tatsächlich gewählte Mikrofon widerspiegeln.
  - `AudioContext`/`AnalyserNode`/die `requestAnimationFrame`-Schleife werden im Cleanup des
    Effects abgebaut (`cancelAnimationFrame`, `source.disconnect()`, `analyser.disconnect()`,
    `audioContext.close()`), sobald sich der Stream ändert oder die Aufnahme stoppt - so wird ein
    hängender/leckender Audio-Context vermieden. Live über Playwright verifiziert (Balkenhöhen zu
    drei Zeitpunkten ausgelesen, während ein simuliertes Sinus-Testmikrofon aufnahm, bestätigt,
    dass sich die gerenderten Höhen tatsächlich von Frame zu Frame ändern; anschließend bestätigt,
    dass nach dem Stoppen keine Balken-Elemente mehr im DOM verbleiben).
  - `lib/speechRecognition.d.ts` (die bestehende Ambient-Typings-Datei des Projekts für
    Web-Speech-API-Globals, die TypeScripts eigenes `lib.dom.d.ts` nicht abdeckt) bekam
    `Window.webkitAudioContext?: typeof AudioContext` für Safaris vendor-präfixten
    `AudioContext`-Fallback.

🔧 Behoben

- **Diktier-Fehler-/Geräte-Popups laufen nicht mehr aus dem sichtbaren Bereich.** Beide messen
  jetzt vor dem Öffnen die tatsächliche Position des Mikro-Buttons (`getBoundingClientRect`) und
  wechseln auf links- oder rechtsbündige Ausrichtung, wenn die Standardposition am Fensterrand
  abgeschnitten würde - vorher waren beide fest zentriert bzw. linksbündig unter dem Button, was
  den Fehlertext in einer schmalen Toolbar nahe am Fensterrand komplett abschnitt (die genaue
  Nutzerbeschwerde: die Meldung lief aus dem Fenster und konnte nicht vollständig gelesen werden).
- **Konkretere Diktier-Fehlermeldungen**, die zwischen `NotAllowedError`/`SecurityError`
  (Berechtigung blockiert - verweist jetzt auf das Schloss-Symbol in der Adressleiste zum erneuten
  Erlauben und Neuladen statt eines generischen "Berechtigung prüfen"), `NotFoundError`/
  `OverconstrainedError` (kein Mikrofon gefunden) und `NotReadableError` (Gerät wird bereits von
  einer anderen Anwendung verwendet) unterscheiden - vorher eine generische Meldung
  "Mikrofonzugriff nicht möglich" für jeden `getUserMedia`-Fehler.

🔄 Geändert

- **Ein Farbschema / eine Form auszuwählen schließt jetzt das Popover** in `NotesView.tsx` - jede
  Aktion ist einmalig, und das offene Menü verdeckte den Graph, den der Nutzer sehen will.
- **`ThemeContext.tsx`s `toggleTheme` ruft `setPreference()` (Zustand einer anderen Komponente)
  nicht mehr innerhalb des `setTheme`-Updater-Callbacks auf** - derselbe „Cannot update a
  component while rendering a different component"-Bug, der schon einmal für
  `NotesView.tsx`s `setRootAppearance` behoben wurde, hier live über eine React-Konsolenwarnung
  während der Ende-zu-Ende-Verifikation dieser Session entdeckt. `theme` ist am Aufrufort bereits
  der aktuelle Wert, daher wird der nächste Wert direkt berechnet statt über die Updater-Form.

Hinweis: Diese Version hatte innerhalb derselben Arbeitssitzung zwischenzeitlich auch die
Mind-Map- und Fischgräten-Baum-Layouts neu geschrieben (Überlapp-Fix beim radialen Sunburst, eine
echte Ishikawa-Wirbelsäule) - diese Arbeit, und die Baum-Layouts, die sie verbesserte, wurden
durch den obigen Eintrag „Notizen-Hierarchie komplett entfernt" wieder rückgängig gemacht, bevor
diese Version je committet wurde, auf einen späteren ausdrücklichen Nutzerwunsch hin, das ganze
Baum-Layout-Konzept fallen zu lassen. Kein eigener Eintrag wert, da es nie als committete Version
ausgeliefert wurde.

## v2026.9.75

🔄 Geändert

- **Klick auf den Mittelpunkt-Knoten öffnet nicht mehr die projektweiten Layout-/Vorlagen-
  Optionen** - auf ausdrücklichen Nutzerwunsch. Der `kind: 'root'`-Zweig von `GraphSidePanel`
  rendert jetzt nur noch `NoteAppearanceMenu` (das eigene Aussehen des Mittelpunkts -
  Farbe/Form/Linienstil/Pfeilspitzen, keine Dicke/Farbe, da er keine echte `Note` hat), formgleich
  zu dem, was ein Klick auf eine normale Notiz öffnet. Die Props `currentLayout`/`onChangeLayout`/
  `onApplyPreset`/`applyingPreset` sind aus `GraphSidePanel` sowie aus
  `TreeGraphView`/`NoteGraphView` entfernt.
- **„Layout & Stil" in DREI getrennte, vollständig unabhängige Achsen aufgeteilt** in einem
  segmentierten Container (gleiches glass-panel-Aussehen wie der Liste/Graph-Umschalter),
  `openMenu: 'layout' | 'scheme' | 'shape' | null` in `NotesView.tsx`, immer nur ein Popover offen:
  - `LayoutPickerPanel.tsx` (neu): die 5 Layouts, jeweils mit einem kleinen handgezeichneten
    SVG-Topologie-Vorschaubild (radial / links-rechts / oben-unten / Fischgräten / lose).
    Handgezeichnete SVGs, keine Icon-Bibliothek - gleiche Konvention wie die Form-/Linien-Vorschau-
    Icons in `NoteAppearanceMenu`.
  - `ColorSchemePanel.tsx` (neu): **reine Palette** - die 6 `COLOR_SCHEMES` aus `colorSchemes.ts`,
    jeweils als eigene Farbfelder vorgeschaut. Ein Klick verteilt nur diese Palette reihum auf alle
    Notizen (`assignSchemeColors`, der Mittelpunkt bekommt die erste Farbe) - sonst nichts.
  - `ShapePickerPanel.tsx` (neu): die 5 `NoteShape`-Werte projektweit angewendet - sonst ändert
    sich nichts. `SHAPE_OPTIONS` nach `shapeOptions.ts` und `ShapePreviewIcon` nach
    `shapePreview.tsx` ausgelagert (zwei Dateien, damit jede ein Single-Export-Modul für Fast
    Refresh bleibt); beide mit `NoteAppearanceMenu` geteilt.
  - `stylePresets.ts` + `GraphSettingsPanel.tsx` gelöscht. `GraphLayoutId` nach `treeLayouts.ts`
    verschoben.
- **Keine Rückfrage-Dialoge mehr bei allen dreien** - vorher gate ein `window.confirm("…
  anwenden? Dies überschreibt …")` das Anwenden einer Vorlage; auf ausdrücklichen Nutzerwunsch
  entfernt, alle drei wirken sofort.
- **Die drei Achsen beeinflussen sich nicht mehr gegenseitig**: `handleApplyPreset` aufgeteilt in
  `handleApplyScheme` (nur `color`, alles andere über `appearanceOf(note)`) und `handleApplyShape`
  (nur `shape`); keine der beiden fasst das Layout an, und eine anzuwenden lässt die anderen beiden
  unangetastet. Das zuletzt angewendete Schema/die zuletzt angewendete Form wird nur als Preference
  (`notesGraphScheme`/`notesGraphShape`) für die Aktiv-Markierung gemerkt - die echten Pro-Notiz-
  Werte lassen sich nicht zurückrechnen.
- **Jedes Dropdown-Menü schließt jetzt bei Klick daneben oder Escape** - auf ausdrücklichen
  Nutzerwunsch, weil Menüs nach dem Wegklicken offen stehen blieben. Neuer Hook
  `useClickOutside(ref, active, onOutside)` (`hooks/useClickOutside.ts`): ein `pointerdown`-Listener
  auf Dokumentebene in der Capture-Phase plus ein Escape-Handler, nur aktiv solange das Menü offen
  ist. Ersetzt die `<div className="fixed inset-0">`-Fangschicht-Overlays, die stillschweigend
  versagten, sobald ein Element mit höherem `z-index`/`position: fixed` darüber lag oder ein
  `stopPropagation()` im Klickpfad saß. Angewendet auf das Header-Benutzermenü (`Header.tsx`), den
  Projektwechsler (`ProjectSwitcher.tsx`), das geteilte `ContextMenu.tsx`, die Rechtsklick-Menüs
  beider Graph-Ansichten (`NoteGraphView.tsx`, `notesGraph/TreeGraphView.tsx`) und die
  Layout-/Farbschema-/Form-Popover (`NotesView.tsx`). `TimelineView.tsx`/`KanbanBoard.tsx` hatten
  bereits eigene Außenklick-Effekte (mehrere Menüs, bedingte Refs - unverändert gelassen) und
  bekamen nur das passende Escape-zum-Schließen dazu.

## v2026.9.74

✨ Neu

- **Liniendicke/-farbe pro Notiz, plus individuelle Pro-Kante-Überschreibungen** - nach direktem
  Live-Nutzer-Feedback zum Glow-Linienstil aus v2026.9.73 ("dick und verschwommen, nicht schick"):
  - **Glow-Linienstil komplett entfernt** (Backend-Enum-Wert stillgelegt, nicht wiederverwendet;
    Frontend-Option, Rendering und Defs entfernt), statt ihn deaktiviert liegen zu lassen - der
    Nutzer hat den Look grundsätzlich abgelehnt, nicht nur nicht genutzt.
  - Backend: `Note` erhält `EdgeWidth` (double?, serverseitig auf 0,5-12px begrenzt) und
    `EdgeColor` (Hex-String, gleiche Validierung wie `Color`) - Notiz-weite Linienstärke/-farbe für
    jede von dieser Notiz ausgehende Kante, unabhängig von der eigenen Füllfarbe `Color` (expliziter
    Nutzerwunsch: Linienfarbe getrennt vom Ursprungsknoten wählbar).
  - Neues Modell/Tabelle `NoteEdgeOverride` (zusammengesetzter Schlüssel `SourceNoteId`+
    `TargetNoteId`, an `ProjectId` gebunden) - ein Stil-Override nur für Dicke/Farbe EINER
    bestimmten Verbindung, zusätzlich zu (nicht anstelle von) den Notiz-weiten Feldern oben. Deckt
    sowohl eine Baum-Kante zu einer `ChildNote` als auch eine freie `NoteLink`-Verknüpfung
    einheitlich ab, da beide einfach ein (Quelle, Ziel)-Notiz-Paar sind. Neuer Endpunkt
    `PUT /api/projects/{projectId}/notes/{noteId}/edge-overrides/{targetNoteId}`
    (`UpdateNoteEdgeOverrideRequest`) - beide Felder `null` löscht die Zeile, statt einen
    wirkungslosen Override zu speichern. `NotesController.Delete` räumt explizit Zeilen auf, in
    denen die gelöschte Notiz Quelle oder Ziel ist (NoAction-FKs auf beiden Seiten, gleiche
    Begründung wie bei `NoteLink`). Migration `AddNoteEdgeWidthColorAndOverrides` für beide
    Provider, live verifiziert.
  - Jede Kante in beiden Graph-Ansichten ist jetzt einzeln anklickbar (eine breite, unsichtbare
    Trefferfläche liegt unter jeder gerenderten Kante, Root-Baum-Kanten ausgenommen, da der
    virtuelle Mittelpunkt keine echte Notiz ist) - öffnet das neue `EdgeOverridePanel.tsx` statt
    des üblichen Knoten-Panels, stylt nur diese eine Verbindung. `NoteAppearanceMenu.tsx` erhält
    passende „Liniendicke" (Schieberegler, 0,5-12px)/„Linienfarbe" (Palette, wiederverwendet aus
    dem Knotenfarbe-Bereich) Controls für die Notiz-weiten Felder - beide als optionale Props, damit
    der Root-/Mittelpunkt-Knoten (ohne echte Notiz, also ohne edgeWidth/edgeColor-Konzept) sie
    komplett auslassen kann, statt Controls gegen einen nicht existierenden Wert anzuzeigen.
  - `edgeStyles.tsx`: neue `resolveEdgeWidth`/`resolveEdgeColor` (Override schlägt Notiz-weit
    schlägt Ansichts-Standard) und `EDGE_COLOR_NORMAL`/`EDGE_COLOR_HIGHLIGHT` (jetzt exportiert,
    ersetzen die vorherigen internen Marker-Füllfarben-Konstanten). `edgeGradientId`/
    `edgeGradientStroke`/`edgeGradientDefFor` schlüsseln jetzt auf die tatsächlich aufgelöste Farbe
    der Kante, nicht nur ein Highlighted-Boolean, damit zwei Kanten mit identischer Geometrie aber
    unterschiedlicher Farbe (via edgeColor/Override) getrennte Gradient-Defs bekommen statt zu
    kollidieren.
  - Dabei einen echten React-Bug gefunden und behoben: `setRootAppearance` rief `setPreference()`
    (aktualisiert eine andere Komponente, `PreferencesStateProvider`) innerhalb seines eigenen
    `setRootAppearanceState`-Updater-Callbacks auf - React meldet dafür „Cannot update a component
    while rendering a different component", da Updater-Funktionen rein sein müssen und React sie
    während eines Render-Durchlaufs aufrufen kann. Behoben, indem der zusammengeführte Wert direkt
    berechnet wird, statt die Updater-Form zu nutzen.
  - Das Verlauf-Vorschau-Icon in `NoteAppearanceMenu.tsx` repariert, das als komplett leer gemeldet
    wurde - eine Kette aus drei SVG-Maskierungsproblemen, jedes live bestätigt bevor es vollständig
    behoben war: (1) `stopColor="currentColor"` funktioniert bei `<stop>` nicht (kein gemaltes
    Element, erbt daher nie die `color` eines Vorfahren); (2) Umstellung auf ein festes
    `stopColor="black"` mit variabler `stopOpacity` blieb weiterhin leer, da eine SVG-`<mask>`
    standardmäßig Luminanz-Maskierung nutzt (weiß = sichtbar, schwarz = unsichtbar) und ein
    schwarzer Stop unabhängig von seiner Opacity ~0 Luminanz beiträgt; (3) selbst nach Umstellung
    auf `stopColor="white"` degeneriert die eigene Region der `<mask>` (Standard
    `maskUnits="objectBoundingBox"`) bei einer exakt horizontalen `<line>` mit Bounding-Box-Höhe
    null zu einer Nullfläche, wodurch die Linie komplett ausgeblendet wird - behoben mit einer
    expliziten `maskUnits="userSpaceOnUse"`-Region passend zum eigenen viewBox des Icons.

## v2026.9.73

✨ Neu

- **Baum-Layouts für die Notiz-Hierarchie (Mindmap/Baum/Organigramm/Fischgräten), ein dauerhaftes
  rechtes Einstellungs-Panel, Verlauf/Leuchten als Linienstile, sowie eine lange Reihe von
  Bugfixes in den Graph-Ansichten** - der Großteil dieses Eintrags sind Fehler, die durch echtes,
  live durchgeführtes Playwright-Testen gegen den laufenden Dev-Stack gefunden und verifiziert
  wurden, nicht nur durch Code-Review:
  - `notesGraph/GraphSidePanel.tsx`/`GraphSettingsPanel.tsx` (neu): Der projektweite
    Layout-Auswähler + Stil-Vorlagen + Mittelpunkt-Aussehen-Bereich, bisher nur über einen Klick
    auf `TreeGraphView`s Mittelpunkt erreichbar, ist in eine eigene Komponente ausgelagert und
    jetzt ZUSÄTZLICH über einen eigenständigen „Layout & Stil"-Button neben dem Liste/Graph-
    Umschalter in `NotesView.tsx` erreichbar - funktioniert in beiden Ansichten (die freie Ansicht
    hat kein Mittelpunkt-Konzept, ein Notiz-Klick konnte diesen Bereich dort also nie erreichen).
    Beide Zugänge bleiben nebeneinander bestehen, keiner ersetzt den anderen. Dabei zwei echte,
    live entdeckte Bugs behoben: Ein `position: fixed`-Overlay zum Schließen bei Außenklick legte
    sich über den Button selbst (ein fixed/positioniertes Geschwisterelement liegt immer über
    einem `position: static`-Element, unabhängig vom `z-index` des Elternteils), wodurch der
    zweite Klick zum Schließen des Menüs verschluckt wurde; zudem trug `GraphSidePanel` noch ein
    übriggebliebenes `position: absolute` aus der Zeit vor dem Umbau zum Popup, wodurch es
    außerhalb seines vorgesehenen Flex-Layout-Slots rendern konnte.
  - `edgeStyles.tsx`s `clipPointToBoxEdge` hatte die Anker-Richtung seit der ursprünglichen
    Implementierung verkehrt herum - es wählte den Box-Anker, dessen Richtung mit der ankommenden
    Linie ÜBEREINSTIMMTE, statt den, der ihr ZUGEWANDT ist, also die ferne statt die nahe Seite der
    Box. Das war die eigentliche Ursache hinter drei zuvor versuchten „Fixes", die nicht hielten
    (live verifiziert: Pfeilspitzen zeigen jetzt korrekt auf die Seite der Box, aus deren Richtung
    die Linie tatsächlich ankommt, sowohl bei gekrümmten Baum-Kanten als auch bei geraden Kanten
    in der freien Ansicht).
  - `TreeGraphView.tsx`s Anker-Boxgröße für den Mittelpunkt-Knoten war noch eine feste
    `CENTER_RADIUS*2`-(68×68)-Kreis-Annahme aus der Zeit, als der Mittelpunkt immer ein einfacher
    `<circle>` war - seit der Mittelpunkt als vollständige `NoteNodeVisual`-Box rendern kann (jede
    Form, passend zu `projectName` skaliert, oft 130px+ breit), wurden Anker gegen eine viel
    kleinere Box berechnet als tatsächlich sichtbar war, wodurch sie innerhalb statt außerhalb des
    echten Rands lagen (das „kein Abstand bei den Mittelpunkt-Ankern"-Symptom, am deutlichsten auf
    der linken/rechten Seite). Nutzt jetzt `measureNodeBox(projectName, rootAppearance.shape)`,
    sobald der Mittelpunkt eine explizite Farbe/Form hat - passend zu dem, was tatsächlich
    gerendert wird.
  - Der Mittelpunkt-Knoten in `TreeGraphView.tsx` hatte einen inkonsistenten Bubble-Phase-
    `onPointerDown` + separaten `onClick` (ohne Pointer-Capture) zum Öffnen des Seitenpanels,
    während `handleBackgroundPointerDown` auf dem umschließenden `<svg>` bei jedem Pointerdown
    bedingungslos die Pointer-Capture übernimmt - da Capture eine native Browser-Routing-
    Entscheidung ist, die ein synthetisches `stopPropagation()` nicht rückgängig machen kann,
    konnte ein Klick auf den Mittelpunkt stillschweigend zum Hintergrund-Pan-Handler umgeleitet
    werden, statt das Panel zu öffnen. Umgestellt auf `onPointerDownCapture` + denselben
    Klick-vs-Zieh-Pfad (`draggingRef`/`handleSvgPointerUp`), den jede andere Notiz bereits nutzt -
    das löst das Rennen unbedingt, statt sich auf zufällige Handler-Reihenfolge zu verlassen.
  - `NoteGraphView.tsx`s manuell gezogene Position in der freien Ansicht wurde erst gespeichert,
    wenn die Physik-Simulation vollständig unter `ALPHA_MIN` zur Ruhe kam - mehrere Notizen
    hintereinander zu ziehen (jedes neue `wake(0.4)` hält Alpha über dieser Schwelle) konnte
    stillschweigend jede Speicherung bis auf die letzte verwerfen, und ein Neuladen/Navigieren vor
    dem Zur-Ruhe-Kommen verwarf sie komplett. Live per DB-Abfrage bestätigt: mehrere Notizen hatten
    weiterhin `FreeViewX`/`FreeViewY` als `NULL`, obwohl sie sichtbar verschoben wurden, eine hatte
    eine völlig aus dem Sichtbereich liegende Koordinate (mehrere Tausend px) erreicht -
    zurückgeführt auf einen zweiten Bug im selben Bereich: Der Notiz-Hinzufügen/Entfernen-Effekt
    hat die Kamera-Transformation bedingungslos neu gefittet, auch während ein Zieh-Vorgang aktiv
    war, wodurch eine kleine Mausbewegung geteilt durch einen plötzlich viel kleineren Zoomfaktor
    für diesen einen Frame zu einem riesigen Weltkoordinaten-Sprung wurde. Positionen werden jetzt
    sofort bei Loslassen gespeichert (plus ein Sicherheitsnetz beim Unmount), und das Kamera-Refit
    wird komplett übersprungen, solange `draggingRef.current` gesetzt ist.
  - `NotesView.tsx`s `viewMode`/`graphLayout`/`rootAppearance` wurden nur einmalig aus
    `usePreferences()` gelesen, jeweils im `useState`-Initializer - da `PreferencesContext` die
    echten DB-Werte asynchron nachlädt, blieb ein Mount, der schneller war als dieser Abruf, für
    immer beim hartcodierten Fallback hängen (React führt einen `useState`-Initializer nie erneut
    aus), was genau das gemeldete „Ansicht springt bei wiederholtem Neuladen zwischen Liste/Graph
    hin und her" sowie ein entsprechendes Pendant beim Graph-Layout verursachte. Behoben mit
    demselben `prevLoaded`-Vergleich-während-des-Renderns-Muster, das bereits in
    `ThemeContext.tsx` verwendet wird - synchronisiert die echten DB-Werte, sobald `loaded` auf
    `true` wechselt.
  - Dabei einen neuen, durch die obige Änderung eingeführten Bug gefunden und behoben:
    `setRootAppearance` rief `setPreference()` (das eine andere Komponente, `PreferencesStateProvider`,
    aktualisiert) innerhalb seines eigenen `setRootAppearanceState`-Updater-Callbacks auf - React
    meldet dafür „Cannot update a component while rendering a different component", da eine
    Updater-Funktion eine reine `prev -> next`-Berechnung sein muss und React sie während eines
    Render-Durchlaufs aufrufen kann, nicht nur nach dem Commit. Behoben, indem der zusammengeführte
    Wert direkt berechnet wird (der aktuelle State liegt bereits im Scope), statt die
    Updater-Form zu nutzen.
  - Backend: `NoteEdgeStyle` erhält zwei weitere Werte, `Gradient` und `Glow` - zwei alternative,
    vom Nutzer wählbare Wege, eine Kantenlinie eleganter als einen flachen Strich wirken zu lassen,
    als gleichwertige Optionen angeboten statt eine Vorauswahl zu treffen (passend zur bestehenden
    Pro-Notiz-Linienstil-Konvention, wirkt nur auf die LINIE, nie auf die Pfeilspitze). Keine
    Migration nötig (die Spalte ist ein einfacher nullable `int`), aber das Hinzufügen eines
    Enum-WERTS (keine neue Property) kann von `dotnet watch` nicht per Hot-Reload eingespielt
    werden - live bestätigt, es braucht einen echten Container-Neustart
    (`ENC0021: Adding enum value requires restarting the application`).
  - `edgeStyles.tsx`: `Verlauf` (Gradient) rendert über ein Pro-Kante-`<linearGradient
    gradientUnits="userSpaceOnUse">` mit den echten Endpunkt-Koordinaten der jeweiligen Kante - der
    Standard-`objectBoundingBox`-Gradient-Raum bildet einen festen Links-nach-rechts-Winkel auf die
    Bounding-Box des referenzierenden Elements ab, was nur bei einer exakt horizontalen Linie
    korrekt ist; jede schräge Kante (die meisten, in beiden Layouts) hätte ihre
    Transparenz-Übergänge sonst versetzt zu den tatsächlichen Linien-Endpunkten. „Leuchten" (Glow)
    rendert als eine zweite, breitere, weichgezeichnete Kopie der Linie UNTER der normalen scharfen
    Linie (eigenes `<path>`/`<line>`, ohne Pfeilspitzen darauf), nicht als Blur-Filter direkt auf
    der echten Linie - die erste Version machte genau das und erzeugte, per Screenshot live
    bestätigt, einen dicken, gleichmäßig verwaschenen Fleck ohne übrig gebliebene scharfe Linie
    (`feGaussianBlur` kennt keinen „scharfer Kern, nur die Ränder weich"-Modus - es verwischt die
    gesamte gerenderte Form). `NoteAppearanceMenu.tsx` erhält passende handgezeichnete
    Vorschau-Icons für beide (jeweils mit eigenem `useId()`-skopiertem Gradient-/Filter-Def, anders
    als das kleine feste Set, das die echte Kanten-Darstellung nutzt, da eine Menü-Vorschau der
    eigenen currentColor/dem Theme des Buttons folgen muss statt der zwei festen Kantenfarben).
  - `edgeStyles.tsx`s `EDGE_GAP` (Abstand Linie-zu-Box) von 4px auf 10px erhöht, nach Nutzer-
    Feedback, dass der vorherige Abstand zu knapp wirkte, besonders sobald Pfeilspitzen direkt an
    der Linienspitze sitzen.

## v2026.9.72

✨ Neu

- **Klick öffnet direkt das Aussehen-Menü, plus Linien-Styling pro Notiz (Strichmuster +
  Pfeilspitzen)**:
  - Ein Klick auf einen Knoten (ohne Ziehen) öffnet in beiden Graph-Ansichten jetzt dasselbe Menü,
    das bisher nur per Rechtsklick erschien, statt direkt in den Notiz-Editor zu springen -
    „Notiz öffnen" ist weiterhin der erste Menüpunkt, also nur einen Klick entfernt, nicht mehr
    das Einzige, was ein Klick tut. Rechtsklick funktioniert weiterhin identisch als Alternative.
  - Backend: `Note` erhält `EdgeStyle` (neues Enum `NoteEdgeStyle`: `Solid`/`Dashed`/`Dotted`) und
    `EdgeArrow` (neues Enum `NoteEdgeArrow`: `None`/`End`/`Start`/`Both`) - gleiche
    „kein Tri-State-Flag"-Konvention wie bei `Color`/`Shape` (jedes `PUT` wendet sie wie
    angegeben an, `null` = Standard). Diese Einstellungen liegen an der Notiz, deren ausgehende
    Linien sie betreffen - `EdgeStyle`/`EdgeArrow` einer Notiz stylen *jede* von ihr ausgehende
    Linie, sowohl zu ihren `ChildNotes` in den Baum-Layouts als auch entlang ihrer
    `OutgoingLinks` in der freien Ansicht. Migrationen `AddNoteEdgeStyle` für beide Provider,
    live verifiziert.
  - `notesGraph/edgeStyles.tsx`: gemeinsame `edgeStrokeDasharray()`, `edgeMarkerRefs()` und eine
    `EdgeMarkerDefs`-Komponente (vier `<marker>`-Definitionen - normal/hervorgehoben ×
    Anfang/Ende), genutzt von `TreeGraphView.tsx`s und `NoteGraphView.tsx`s Kanten-Rendering.
    Bewusst **kein** `context-stroke` für die Marker-Farbe (in Firefox nicht unterstützt) -
    stattdessen feste Füllfarben passend zu den bestehenden `slate-400`/`brand-primary`-
    Strich-Klassen. In den Baum-Layouts wird eine Kante nach ihrer *übergeordneten* (Quell-)
    Notiz gestylt; Wurzel-Kanten vom virtuellen Projekt-Zentrum haben keine Quell-Notiz und
    rendern immer im schlichten Standard.
  - `NoteAppearanceMenu.tsx` erhält zwei neue Abschnitte („Linienstil"/„Pfeilspitzen") mit
    handgezeichneten SVG-Vorschau-Icons, im gleichen Layout wie die bestehenden Farbe/Form-
    Abschnitte.

## v2026.9.71

✨ Neu

- **Individuelle Notiz-Farbe und -Form, plus Farbpaletten, in allen Baum-/Graph-Ansichten**:
  - Backend: `Note` erhält `Color` (Hex-String, validiert über
    `^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$`, bei ungültigem Wert 400 mit konkreter Fehlermeldung) und
    `Shape` (neues `NoteShape`-Enum: `Rounded`/`Rectangle`/`Diamond`/`Underline`/`Ellipse`).
    Bewusst **kein** `SetParentNoteId`-artiges Tri-State-Flag für diese beiden - anders als bei
    der Eltern-Hierarchie hat der Notiz-Editor beide Werte beim Speichern immer zur Hand, jedes
    `PUT` wendet sie also einfach wie angegeben an (`null` = auf Standard zurücksetzen); jeder
    `updateNote()`-Aufrufer im Frontend muss `color`/`shape` der Notiz auch bei einem reinen
    Titel/Inhalt-Speichern mitschicken, sonst würden sie stillschweigend zurückgesetzt.
    Migrationen `AddNoteColorShape` für beide Provider, live verifiziert.
  - `notesGraph/colorSchemes.ts`: 6 vordefinierte Paletten (Standard/Lebendig/Pastell/Ozean/
    Sonnenuntergang/Wald), alle 44 Farben WCAG-geprüft (≥4.5:1 gegen die jeweils besser lesbare
    Variante von Weiß/Dunkel-Text) - zwei ursprüngliche Kandidatenfarben wurden nach
    fehlgeschlagener Prüfung durch dunklere Varianten ersetzt. `getReadableTextColor()` wählt die
    Textfarbe im Knoten automatisch passend zur Hintergrundfarbe.
  - `notesGraph/NoteNodeShape.tsx`: die gemeinsame `NoteNodeVisual`-Komponente rendert alle fünf
    Formen als SVG, zur Titellänge passend dimensioniert, mit dem Titeltext innerhalb der Form
    (bei Underline: Text + Linie, kein Hintergrund/Rahmen) - ersetzt den bisherigen festen
    `<circle>` in beiden Graph-Ansichten. Die Standard-Füllfarbe für Notizen ohne eigene Farbe
    wurde auf einen festen Ton (`#475569`, theme-unabhängig) umgestellt - der bisherige
    theme-abhängige Grauton hätte im Dark Theme mit weißem Innentext nur 2.56:1 Kontrast erreicht.
  - `notesGraph/NoteAppearanceMenu.tsx`: das Farbe/Form-Panel im Kontextmenü jedes Knotens (alle
    Paletten als anklickbare Farbkreise, ein "Zurücksetzen" pro Eigenschaft, fünf
    Form-Vorschau-Buttons) - neu auch in `NoteGraphView.tsx`s freier Ansicht ergänzt, die zuvor
    gar kein Pro-Knoten-Kontextmenü hatte.
  - Abstandskonstanten in `treeLayouts.ts` (z. B. `SIBLING_SPACING` 56→88, `DEPTH_SPACING`
    220→260) und die Physiksimulation-Konstanten in `NoteGraphView.tsx` (`REPULSION` 2000→5500,
    `LINK_DISTANCE` 90→160) vergrößert, damit sich die jetzt textgroßen Knoten-Boxen nicht
    überlappen.
  - `assignSchemeColors()`/`colorForIndex()` (mehrere Notizen auf einmal aus einer Palette
    einfärben) existieren als Funktion, sind aber noch an keine UI-Aktion angebunden - der Auftrag
    nannte keinen konkreten Auslöse-Ort; bei Bedarf einen ergänzen, sobald klar ist, wo das
    hingehört.

📝 Sonstiges

- `CLAUDE.md` im Repo-Root angelegt (über `/init`) - Befehle sowie die Architektur-Zusammenhänge,
  die sich erst durch mehrere Dateien erschließen (duale EF-Core-Provider-Konfiguration, die zwei
  unabhängigen Notiz-Beziehungsgraphen, die zwei unterschiedlichen „Feld unangetastet lassen"-
  Update-Konventionen, usw.).

## v2026.9.70

✨ Neu

- **Notiz-Hierarchie (Eltern/Kind), getrennt von der bestehenden freien Querverknüpfung**, plus
  vier Baumansichten zum Durchsuchen:
  - `Note` erhält `ParentNoteId`/`ChildNotes`; `NotesController` erzwingt bei einer Umzuordnung
    Zugehörigkeit zum selben Projekt und prüft auf Zyklen (`WouldCreateCycleAsync`), Kinder werden
    beim Löschen zu Wurzel-Notizen hochgestuft statt kaskadierend gelöscht zu werden.
    `UpdateNoteRequest` hat jetzt ein `SetParentNoteId`-Bool - ein reines Titel/Inhalt-Speichern
    darf die Hierarchie nie unbeabsichtigt anfassen, da `ParentNoteId` allein nicht zwischen
    „unverändert lassen" und „auf null setzen" unterscheiden kann (beides deserialisiert bei
    fehlendem Feld gleichermaßen zu `null`).
  - Migrationen für beide Provider (`AddNoteParent`), live auf Postgres und SqlServer verifiziert.
  - `notesGraph/treeLayouts.ts` berechnet vier Baumlayouts (Mind Map, Baum links→rechts,
    Organigramm oben→unten, Fischgräten) aus einem gemeinsamen Eltern/Kind-Durchlauf;
    `notesGraph/TreeGraphView.tsx` ist die gemeinsame Zeichenfläche (Zoom/Pan, Umhängen per Drag,
    Erstellen-/Kontextmenüs), die sich alle vier teilen - ersetzt die bisherige,
    einzel-Layout-Ansicht `NoteRadialView.tsx`. Behebt einen Bug, bei dem Wurzel-Notizen nie eine
    Verbindungslinie zum Zentrum bekamen - `buildEdges` routet jetzt für jeden Knoten der Tiefe 1
    immer eine Kante vom virtuellen Zentrum.
  - `NotesView.tsx` hat jetzt einen einzigen "Graph"-Tab mit Layout-Auswahl statt separater Tabs
    pro Layout (`notesGraphLayout`-Präferenz).

🔧 Behoben

- **Nach Sitzungsablauf blieb die Seite nach erneuter Anmeldung dauerhaft im Ladezustand hängen**:
  `ProjectPage`s `Promise.all` hatte kein `.catch()`, wodurch ein 401 (Sitzung während des Ladens
  abgelaufen) stillschweigend abgelehnt wurde (`Uncaught (in promise) ApiError` in der Konsole)
  und `loading` nie wieder auf `false` gesetzt wurde. Zeigt jetzt bei echten Fehlern einen
  „Erneut versuchen"-Button und wartet bei einem 401 gezielt ab. `AuthContext` erhält jetzt
  `authVersion`, das bei jeder erfolgreichen (Neu-)Anmeldung erhöht wird, sodass die
  Lade-Effekte von `ProjectPage`/`ProjectsPage` automatisch neu laufen, sobald sich der Nutzer
  über `SessionExpiredModal` erneut anmeldet - kein manuelles Neuladen der Seite mehr nötig.
- **Diktier-Upload scheiterte mit "Nicht unterstützter Audio-Dateityp." bzw. 500**: Browser melden
  den Content-Type eines `MediaRecorder`-Blobs mit angehängten Codec-Parametern (z. B.
  `audio/webm;codecs=opus`), was sowohl die Content-Type-Allowlist-Prüfung im Backend als auch der
  Konstruktor von `MediaTypeHeaderValue` rundweg ablehnten (letzterer warf eine `FormatException`,
  die als 500 in `WhisperTranscriptionService`/`OpenAiTranscriptionService` durchschlug). Behoben,
  indem nur der Basis-MIME-Typ (vor dem ersten `;`) gegen die Allowlist geprüft wird und
  `MediaTypeHeaderValue.Parse()` statt des Konstruktors verwendet wird.
- **"Unable to preventDefault inside passive event listener invocation" bei jedem Scroll-Tick** in
  beiden Graph-Ansichten: Reacts `onWheel`-Prop wird immer passiv registriert; der Zoom-Handler
  braucht stattdessen ein manuell angehängtes
  `addEventListener('wheel', ..., { passive: false })`.

📝 Sonstiges

- Die App-Version (vom Backend bereits berechnet) wird jetzt tatsächlich irgendwo in der
  Oberfläche angezeigt - im Profil-Dropdown des Headers, per neuem `api/version.ts` einmalig beim
  Laden abgerufen.

## v2026.9.69

✨ Neu

- **Sprachdiktat für Notizen, administrierbar über vier Provider** (Browser/Whisper/OpenAI/
  Google), über einen neuen wiederverwendbaren `DictationButton`:
  - **Backend**: `TranscriptionSettings` (Singleton-Zeile, `Models/TranscriptionSettings.cs`)
    hält den aktiven Provider, die Whisper-Endpoint-URL, Sprache, ein `AutoSummarize`-Flag und die
    OpenAI-/Google-API-Keys verschlüsselt-at-rest über ASP.NET Core Data Protection
    (`TranscriptionSettingsService`). Der Data-Protection-Schlüsselbund wird jetzt in der
    Datenbank persistiert (`PersistKeysToDbContext<PmDbContextBase>`) statt flüchtig lokal
    gespeichert, damit verschlüsselte Keys Container-Neustarts überstehen.
  - `TranscriptionController`: `GET`/`PUT /api/transcription-settings` (nur Admin, Tri-State-
    Semantik für die Keys - weglassen = unverändert, leer = löschen, nicht-leer = ersetzen) und
    `POST /api/transcribe` (jeder eingeloggte Nutzer), leitet an eine von drei
    `ITranscriptionProvider`-Implementierungen weiter (`Whisper`-/`OpenAi`-/
    `GoogleTranscriptionService`) über benannte `HttpClient`s. 25-MB-Anfragelimit;
    Provider-Fehler liefern einen generischen 502, Details landen nur im Log (API-Keys werden aus
    geloggtem Fehlertext entfernt), nie an den Client durchgereicht.
  - Migrationen für beide Provider: `AddTranscriptionSettings` und `AddTranscriptionAutoSummarize`.
  - **Frontend**: `DictationButton` hat die Zustände idle/aufnehmend/verarbeitend/Fehler,
    `MediaRecorder`-basierte Aufnahme für die drei serverseitigen Provider, native
    `SpeechRecognition` für Browser (deaktiviert mit Tooltip, wo die API fehlt, z. B. Firefox).
    Eingebunden in `NotesView.tsx`, fügt den transkribierten Text an der Cursor-Position ein.
  - `TranscriptionSettingsSection` in `SettingsPage.tsx` (nur Admin): Provider-Auswahl mit kurzer
    Erklärung pro Option, Whisper-Endpoint-Feld, API-Key-Felder (zeigen nur, ob ein Key gesetzt
    ist, nie den Wert), Sprachauswahl, und ein Zusammenfassen-Umschalter (nur bei OpenAI/Google
    aktivierbar).
  - Neue `ToggleSwitch`-Komponente (rot/aus - grün/an) - der erste Toggle-Switch des Projekts,
    kontrastgeprüft in beiden Themes; legt das Muster für künftige Toggles fest.

📦 Abhängigkeiten

- **Optionalen, profilgesteuerten Whisper-Speech-to-Text-Dienst hinzugefügt** für die
  Voice-Dictation-Funktion oben:
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

## v2026.9.68

📝 Sonstiges

- **Versionsschema erneut geändert: `Year.Month.Day.CommitOfTheDay` → `Year.Month.CommitOfTheYear`**:
  Tages-Segment und täglicher Reset entfallen - dieser Nutzer committet meist in kleinen
  Feierabend-Blöcken statt gleichmäßig über den Tag verteilt, weshalb ein Tages-Zähler meist nur
  „.1"/„.2" zeigte und wenig Information brachte. Ein Jahres-Zähler gibt stattdessen auf einen
  Blick ein aussagekräftigeres Bild des gesamten Commit-Volumens. `scripts/git-hooks/post-commit`
  und `start.ps1`s `Get-AppVersion` berechnen die Zahl jetzt über
  `git rev-list --count HEAD --since="$(date +%Y)-01-01T00:00:00"` statt `--since=midnight`.
  Bestehende Versions-Überschriften in `CHANGELOG.dev.md`/`CHANGELOG.md` auf das neue
  3-Segment-Schema umgerechnet (alle bisherigen Commits liegen in 2026, die Jahreszahl entspricht
  also der vorherigen Gesamt-Commit-Zahl - nur das Tages-Segment fällt tatsächlich weg).
- **Copyright-Inhaber umbenannt: SynShift Labs → SushiFlux Develop** (Firmenumbenennung) in
  `NOTICE` und `docs/02-decisions.md`.

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
