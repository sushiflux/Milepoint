# Changelog

**[English](#english) · [Deutsch](#deutsch)**

---

<a id="english"></a>
## English

_The German version follows below — [jump to it](#deutsch)._

What changes for you as a Milepoint user, grouped per release: ✨ New · 🔄 Change · 🔧 Fix ·
🔒 Security · 🗑️ Removed · ⚠️ Deprecated (only the categories that actually apply to a
release are shown).

## v2026.8.66

🔄 Change

- Updated the underlying platform (database engines, JavaScript runtime, and several build/tooling
  dependencies) to their current versions - no visible change in behavior, but keeps things secure
  and performant going forward.

## v2026.8.64

🔧 Fix

- Fixed the app logging you out and discarding anything you hadn't saved yet (e.g. a half-typed
  Kanban card) whenever your session had quietly expired in the background. You're now asked to
  log back in without losing your work.

## v2026.8.63

✨ New

- **Dependency lines in the Timeline**: a task with subtasks now shows a connector running from
  its end date to each subtask's start, with a small marker on every subtask's bar. Each phase
  gets its own connector color, so dependencies are easy to tell apart at a glance.
- **WBS numbering** in the Timeline: phases and tasks get an outline number (1, 1.1, 1.2, ...) in
  a new "#" column, updating automatically as you reorder or nest items.
- **New Settings page** (via the account menu, top right) with a Timeline bar-color option:
  color bars by status, by priority, or keep the current look.
- **Row density option** for the Timeline (Klein / Mittel / Groß), also in Settings.
- **Dashboard project tiles** now show how much of a project's work is actually scheduled in the
  Timeline versus still sitting in Kanban without a date, both on the progress bar and the ticket
  badges.

🔄 Change

- Status colors are now consistent between Kanban and Timeline: Neu = yellow, In Arbeit = blue,
  Fertig = green, Pausiert = red. Priority colors were adjusted so they're never confused with a
  status color.
- A subtask's start date must now be at least one day after its parent task's end date. Dragging a
  parent task's end date now carries its subtasks along with it, keeping whatever gap they
  already had to it.
- Widened the ID column so a task's reference code isn't cut off, and gave the Timeline's last
  label column breathing room from the chart edge.

🔧 Fix

- Fixed dragging a Timeline bar occasionally jittering on release, or staying "grabbed" even after
  releasing the mouse button.
- Fixed clicking a bar's resize handle sometimes moving the whole bar instead of resizing it.

## v2026.8.56

✨ New

- **Search, sort, and filter** for the Kanban board — filter by status, priority, or assignee, and
  search cards by name, matching the Timeline's toolbar.
- **Kanban cards can now be edited and deleted** directly: via a right-click menu, hover icons on
  the card, or by dragging a card onto a trash zone that appears while dragging.
- **Dedicated "Phase" button** next to "Aufgabe anlegen", so creating a phase no longer needs a
  type dropdown.
- A notes field when creating a Kanban card.

🔄 Change

- Kanban columns now use the full width of the board and adapt responsively to your screen size.
- The dashboard now shows a combined "total" badge across all columns, not just per-column counts.
- User interface preferences (sidebar state, theme, dashboard view) are now stored on your account
  instead of only in the browser, so they follow you between devices.
- Priority and category can now be set right when creating a Kanban card.
- The "übergeordnete Aufgabe" picker (when creating a subtask) now only lists tasks that are
  actually open and visible in the Timeline, instead of every card including finished ones.

🔧 Fix

- Fixed the Timeline briefly showing a task's old status after moving its card on the Kanban
  board.
- Fixed select dropdowns being unreadable in dark mode.

---

<a id="deutsch"></a>
## Deutsch

Was sich für dich als Milepoint-Nutzer:in ändert, gruppiert pro Release: ✨ Neu · 🔄 Geändert ·
🔧 Behoben · 🔒 Sicherheit · 🗑️ Entfernt · ⚠️ Veraltet (nur die Kategorien, die für ein Release
tatsächlich zutreffen, werden gezeigt).

## v2026.8.66

🔄 Geändert

- Die zugrunde liegende Plattform (Datenbank-Engines, JavaScript-Laufzeit und mehrere Build-/
  Tooling-Abhängigkeiten) auf aktuelle Versionen gebracht - kein sichtbares Verhaltensänderung,
  aber sicherheitstechnisch und performancetechnisch auf dem neuesten Stand.

## v2026.8.64

🔧 Behoben

- Behoben, dass die App dich abgemeldet und alles noch nicht Gespeicherte verworfen hat (z. B.
  eine halb ausgefüllte Kanban-Karte), sobald deine Sitzung im Hintergrund unbemerkt abgelaufen
  war. Du wirst jetzt gebeten, dich erneut anzumelden, ohne dass etwas verloren geht.

## v2026.8.63

✨ Neu

- **Abhängigkeitslinien in der Timeline**: Eine Aufgabe mit Unteraufgaben zeigt jetzt eine
  Verbindungslinie vom eigenen Enddatum zum Start jeder Unteraufgabe, mit einer kleinen Markierung
  auf jedem Unteraufgaben-Balken. Jede Phase bekommt ihre eigene Linienfarbe, damit Abhängigkeiten
  auf einen Blick unterscheidbar sind.
- **WBS-Nummerierung** in der Timeline: Phasen und Aufgaben bekommen eine fortlaufende Nummer
  (1, 1.1, 1.2, ...) in einer neuen „#"-Spalte, die sich automatisch anpasst, wenn du Elemente
  verschachtelst oder umsortierst.
- **Neue Einstellungen-Seite** (über das Benutzermenü oben rechts) mit einer Option für die
  Timeline-Balkenfarbe: Balken nach Status, nach Priorität, oder wie bisher einfärben.
- **Zeilendichte-Option** für die Timeline (Klein / Mittel / Groß), ebenfalls in den
  Einstellungen.
- **Dashboard-Projektkacheln** zeigen jetzt, wie viel eines Projekts tatsächlich in der Timeline
  terminiert ist gegenüber nur im Kanban ohne Termin - sowohl im Fortschrittsbalken als auch bei
  den Ticket-Badges.

🔄 Geändert

- Status-Farben sind jetzt zwischen Kanban und Timeline einheitlich: Neu = Gelb, In Arbeit = Blau,
  Fertig = Grün, Pausiert = Rot. Prioritäts-Farben wurden angepasst, damit sie nie mit einer
  Status-Farbe verwechselt werden.
- Das Startdatum einer Unteraufgabe muss jetzt mindestens einen Tag nach dem Enddatum der
  übergeordneten Aufgabe liegen. Ziehst du das Enddatum einer Aufgabe, wandern ihre Unteraufgaben
  jetzt mit und behalten dabei den Abstand, den sie bereits hatten.
- ID-Spalte verbreitert, damit der Referenzcode einer Aufgabe nicht abgeschnitten wird, und der
  letzten Label-Spalte der Timeline mehr Abstand zum Diagrammrand gegeben.

🔧 Behoben

- Behoben, dass das Ziehen eines Timeline-Balkens beim Loslassen gelegentlich zuckte oder auch
  nach dem Loslassen der Maustaste weiter „gegriffen" blieb.
- Behoben, dass ein Klick auf den Anfasser eines Balkens manchmal den ganzen Balken verschoben hat
  statt ihn in der Größe zu ändern.

## v2026.8.56

✨ Neu

- **Suchen, Sortieren und Filtern** im Kanban-Board - nach Status, Priorität oder Zuständigem
  filtern und Karten nach Namen suchen, analog zur Timeline-Toolbar.
- **Kanban-Karten lassen sich jetzt direkt bearbeiten und löschen**: über ein Rechtsklick-Menü,
  Icons beim Hovern über der Karte, oder per Ziehen auf eine Papierkorb-Zone, die während des
  Ziehens erscheint.
- **Eigener „Phase"-Button** neben „Aufgabe anlegen" - eine Phase anzulegen braucht dadurch kein
  Typ-Dropdown mehr.
- Ein Notizfeld beim Anlegen einer Kanban-Karte.

🔄 Geändert

- Kanban-Spalten nutzen jetzt die volle Board-Breite und passen sich responsiv an die
  Bildschirmgröße an.
- Das Dashboard zeigt jetzt ein zusammengefasstes „Gesamt"-Badge über alle Spalten hinweg, nicht
  nur pro Spalte.
- Oberflächen-Einstellungen (Sidebar-Zustand, Theme, Dashboard-Ansicht) werden jetzt an deinem
  Konto gespeichert statt nur im Browser, und folgen dir damit zwischen Geräten.
- Priorität und Kategorie lassen sich jetzt direkt beim Anlegen einer Kanban-Karte setzen.
- Die Auswahl „übergeordnete Aufgabe" (beim Anlegen einer Unteraufgabe) zeigt jetzt nur noch
  Aufgaben, die tatsächlich offen und in der Timeline sichtbar sind, statt aller Karten
  einschließlich bereits erledigter.

🔧 Behoben

- Behoben, dass die Timeline nach dem Verschieben einer Karte im Kanban-Board kurzzeitig den alten
  Status anzeigte.
- Behoben, dass Auswahlfelder im Dark Mode unleserlich waren.
