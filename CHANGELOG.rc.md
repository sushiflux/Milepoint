# Release-Candidate-Changelog

**[English](#english) · [Deutsch](#deutsch)**

---

<a id="english"></a>
## English

_The German version follows below — [jump to it](#deutsch)._

What Milepoint offers you in the current **release candidate** — one consolidated summary of
everything that matters to you as a Milepoint user. As this is the first release candidate, it
lists only what is new; "changed" and "fixed" entries only make sense once there is an earlier
version to compare with. A release candidate is a test build, not a final release: when it is
released, this summary moves into `CHANGELOG.md` under the release's version number.

## v2026.10.83-rc (Unraid)

Milepoint is a self-hosted project-management tool for software teams: plan work on a Kanban
board and a Gantt-style Timeline, keep your notes as a linked network, dictate by voice, and run
everything on your own server.

✨ New

- **Notes as a network**: the Notes tab has a Graph view that shows all your notes as dots with
  their titles, connected by lines wherever one note links to another with `[[Note title]]`. A
  note can link to as many others as you like. Drag dots to arrange them (positions are saved),
  right-click empty space to create a note right there or to connect two notes, and click a note
  to open it. The "Farbschema" button colors all notes at once with one of six palettes and
  closes right after you pick one.
- **"Anordnen" button**: one click arranges all notes into a tidy layout with as few crossing
  lines as possible. Where two lines still have to cross, the longer one is drawn dashed so you
  can see it passes behind the other instead of cutting straight through unrelated notes.
- **Voice dictation for notes**: speak instead of type. An admin picks the speech recognition on
  the settings page — the browser's built-in recognition (free, nothing to set up; not available
  in every browser, for example Firefox), a self-hosted Whisper service (free and private, runs
  on your own server, with the accurate large-v3-turbo model), OpenAI, or Google. API keys are
  stored encrypted and never shown again, only whether one is set; with OpenAI or Google the
  dictated text can optionally be summarized automatically. The recognized text is inserted right
  where your cursor is. You can switch microphones directly at the mic button, live level bars
  show that it is really listening, and if the microphone does not work you are told exactly why
  (access blocked and how to allow it again, no microphone found, or in use by another app).
- **Kanban board**: search, sort and filter cards by status, priority or assignee. Edit and
  delete cards directly — via a right-click menu, icons when you hover over a card, or by
  dragging a card onto a trash zone that appears while dragging. When you create a card you can
  add notes, a priority and a category right away. Columns use the full width of the board, and
  the dashboard shows a combined "total" badge.
- **Your own columns and types per project**: in a project's "Einstellungen" tab, project leaders
  and administrators can add their own Kanban columns (for example "Zur Überprüfung") and their
  own types (for example "Design", with a color of your choice). The four standard columns (Neu,
  In Arbeit, Fertig, Pausiert) and the types Feature, Bug and Chore are never deleted - they can
  only be hidden and shown again. A column can be hidden or deleted only while it is empty, and
  there always stays at least one open and one finished column. Everything is per project.
- **Timeline**: a task with subtasks shows dependency lines from its end date to each subtask's
  start, in a separate color per phase. Phases and tasks get an outline number (1, 1.1, 1.2, ...)
  that updates as you reorder or nest items. A subtask must start at least one day after its
  parent ends; when you drag a task's end date, its subtasks move along and keep their gap. A
  dedicated "Phase" button sits next to "Aufgabe anlegen", and the "parent task" picker only
  lists tasks that are open and visible in the Timeline.
- **Consistent colors**: status colors are the same in Kanban and Timeline (Neu = yellow,
  In Arbeit = blue, Fertig = green, Pausiert = red), and priority colors are never mistaken for a
  status color. Timeline bars can be colored by status or by priority.
- **Settings page** (account menu, top right), in tabs: "Darstellung" for the Timeline bar coloring
  and row density (Klein / Mittel / Groß), "Sicherheit" for changing your own password (current
  password once, the new one twice). Your interface settings — sidebar, theme, dashboard view — are
  stored on your account, so they are the same on every device. Switches are clearly red (off) and
  green (on) in both the light and the dark theme.
- **App administration for administrators** (profile menu): create local users, give them a role
  (user, project leader or administrator) in a clear role matrix, set passwords and delete users.
  Your own account and other administrators are protected. A project leader sees all projects; an
  administrator can do everything a project leader can. The speech recognition setup lives here too.
- **Dashboard tiles show what is scheduled**: a project's progress bar and ticket badges show how
  much of its work is planned in the Timeline versus still sitting in Kanban without a date.
- **Everything is saved on its own**: Kanban and Timeline save every action, and notes are saved
  automatically while you type (no Save button, even closing the browser right away is safe). As
  long as you work, your login renews itself; if you were away for a long time, you land on the
  normal login page and come back to the page you were on - with nothing lost. A browser that
  restores your tabs after a restart always shows the current state, never an old one.
- **Version number in the app**: the running Milepoint version is shown in the profile menu in the
  header.
- **Ready-made Unraid installation**: Milepoint ships as a Docker image with a template for
  Unraid's Community Applications. A single container serves the whole app; you connect it to your
  own PostgreSQL and Redis and set the first admin login right in the template. The key that signs
  logins is generated automatically on first start and is different for every installation (it is
  kept in the data folder you choose, so logins survive restarts). No extra access address has to
  be entered.

---

<a id="deutsch"></a>
## Deutsch

_Die englische Version steht oben — [zum Anfang](#english)._

Was Milepoint dir im aktuellen **Release-Kandidaten** bietet — eine zusammengefasste Übersicht
über alles, was für dich als Milepoint-Nutzer wichtig ist. Da dies der erste Release-Kandidat
ist, steht hier nur, was neu ist; „Geändert" und „Behoben" ergeben erst Sinn, wenn es eine frühere
Version zum Vergleichen gibt. Ein Release-Kandidat ist ein Testbuild, kein fertiges Release: Beim
Release wandert diese Übersicht unter der Versionsnummer des Releases in die `CHANGELOG.md`.

## v2026.10.83-rc (Unraid)

Milepoint ist ein selbst gehostetes Projektmanagement-Tool für Softwareteams: Arbeit auf einem
Kanban-Board und einer Gantt-artigen Timeline planen, Notizen als verknüpftes Netzwerk führen,
per Sprache diktieren und alles auf dem eigenen Server betreiben.

✨ Neu

- **Notizen als Netzwerk**: Der Reiter „Notizen" hat eine Graph-Ansicht, die alle Notizen als
  Punkte mit ihrem Titel zeigt, verbunden durch Linien überall dort, wo eine Notiz mit
  `[[Notiztitel]]` auf eine andere verweist. Eine Notiz kann auf beliebig viele andere verweisen.
  Punkte lassen sich per Ziehen anordnen (die Positionen werden gespeichert), ein Rechtsklick auf
  freie Fläche legt direkt dort eine Notiz an oder verbindet zwei Notizen, ein Klick öffnet die
  Notiz. Der Button „Farbschema" färbt alle Notizen auf einmal mit einer von sechs Paletten und
  schließt sich direkt nach der Auswahl.
- **Button „Anordnen"**: Ein Klick ordnet alle Notizen zu einem aufgeräumten Layout mit möglichst
  wenigen sich kreuzenden Linien. Wo sich zwei Linien trotzdem kreuzen müssen, wird die längere
  gestrichelt gezeichnet — so siehst du, dass sie hinter der anderen entlangläuft, statt einfach
  quer durch unbeteiligte Notizen zu schneiden.
- **Sprachdiktat für Notizen**: sprechen statt tippen. Ein Admin wählt die Spracherkennung auf der
  Einstellungsseite — die eingebaute Erkennung des Browsers (kostenlos, nichts einzurichten; nicht
  in jedem Browser verfügbar, zum Beispiel nicht in Firefox), einen selbst betriebenen
  Whisper-Dienst (kostenlos und privat, läuft auf deinem eigenen Server, mit dem treffsicheren
  Modell large-v3-turbo), OpenAI oder Google. API-Schlüssel werden verschlüsselt gespeichert und
  nie wieder angezeigt, nur ob einer gesetzt ist; bei OpenAI oder Google kann der diktierte Text
  optional automatisch zusammengefasst werden. Der erkannte Text landet genau dort, wo dein Cursor
  steht. Das Mikrofon lässt sich direkt am Mikrofon-Button wechseln, Pegelbalken zeigen live, dass
  wirklich zugehört wird, und wenn das Mikrofon nicht funktioniert, erfährst du genau warum (Zugriff
  blockiert und wie du ihn wieder erlaubst, kein Mikrofon gefunden oder von einer anderen App
  belegt).
- **Kanban-Board**: Karten nach Status, Priorität oder Zuständigem suchen, sortieren und filtern.
  Karten direkt bearbeiten und löschen — über ein Rechtsklick-Menü, Icons beim Hovern über der
  Karte oder per Ziehen auf eine Papierkorb-Zone, die während des Ziehens erscheint. Beim Anlegen
  einer Karte lassen sich gleich Notizen, Priorität und Kategorie setzen. Die Spalten nutzen die
  volle Board-Breite, und das Dashboard zeigt ein zusammengefasstes „Gesamt"-Badge.
- **Eigene Spalten und Typen pro Projekt**: Im Reiter „Einstellungen" eines Projekts können
  Projektleiter und Administratoren eigene Kanban-Spalten (zum Beispiel „Zur Überprüfung") und
  eigene Typen (zum Beispiel „Design", mit einer Farbe deiner Wahl) anlegen. Die vier
  Standard-Spalten (Neu, In Arbeit, Fertig, Pausiert) und die Typen Feature, Bug und Chore werden
  nie gelöscht - sie lassen sich nur aus- und wieder einblenden. Eine Spalte lässt sich nur
  ausblenden oder löschen, solange sie leer ist, und es bleibt immer mindestens eine offene und
  eine fertige Spalte sichtbar. Alles gilt pro Projekt.
- **Timeline**: Eine Aufgabe mit Unteraufgaben zeigt Abhängigkeitslinien von ihrem Enddatum zum
  Start jeder Unteraufgabe, pro Phase in eigener Farbe. Phasen und Aufgaben bekommen eine
  fortlaufende Nummer (1, 1.1, 1.2, ...), die sich beim Umsortieren und Verschachteln anpasst. Eine
  Unteraufgabe muss mindestens einen Tag nach dem Ende der übergeordneten Aufgabe beginnen; ziehst
  du das Enddatum einer Aufgabe, wandern ihre Unteraufgaben mit und behalten ihren Abstand. Neben
  „Aufgabe anlegen" gibt es einen eigenen „Phase"-Button, und die Auswahl „übergeordnete Aufgabe"
  zeigt nur Aufgaben, die offen und in der Timeline sichtbar sind.
- **Einheitliche Farben**: Status-Farben sind in Kanban und Timeline gleich (Neu = Gelb,
  In Arbeit = Blau, Fertig = Grün, Pausiert = Rot), Prioritäts-Farben werden nie mit einer
  Status-Farbe verwechselt. Timeline-Balken lassen sich nach Status oder nach Priorität färben.
- **Einstellungen-Seite** (Benutzermenü oben rechts), in Reitern: „Darstellung" für die
  Timeline-Balkenfarbe und die Zeilendichte (Klein / Mittel / Groß), „Sicherheit" zum Ändern deines
  eigenen Passworts (aktuelles Passwort einmal, das neue zweimal). Deine Oberflächen-Einstellungen —
  Sidebar, Theme, Dashboard-Ansicht — werden an deinem Konto gespeichert und sind deshalb auf jedem
  Gerät gleich. Schalter sind im hellen wie im dunklen Design klar rot (aus) und grün (an).
- **App-Administration für Administratoren** (Profilmenü): lokale Benutzer anlegen, ihnen in einer
  übersichtlichen Rollen-Matrix eine Rolle geben (Benutzer, Projektleiter oder Administrator),
  Passwörter setzen und Benutzer löschen. Dein eigenes Konto und andere Administratoren sind
  geschützt. Ein Projektleiter sieht alle Projekte; ein Administrator darf alles, was ein
  Projektleiter darf. Auch die Einrichtung der Spracherkennung liegt hier.
- **Dashboard-Kacheln zeigen, was terminiert ist**: Fortschrittsbalken und Ticket-Badges eines
  Projekts zeigen, wie viel der Arbeit in der Timeline geplant ist und wie viel noch ohne Termin im
  Kanban liegt.
- **Alles wird von selbst gespeichert**: Kanban und Timeline speichern jede Aktion, und Notizen
  werden beim Tippen automatisch gespeichert (kein „Speichern"-Knopf, auch sofortiges Schließen des
  Browsers ist sicher). Solange du arbeitest, erneuert sich dein Login von selbst; warst du lange
  weg, landest du auf der normalen Anmeldeseite und kommst danach auf die Seite zurück, auf der du
  warst - ohne dass etwas verloren geht. Ein Browser, der nach einem Neustart deine Tabs
  wiederherstellt, zeigt immer den aktuellen Stand, nie einen alten.
- **Versionsnummer in der App**: Die laufende Milepoint-Version steht im Profilmenü in der
  Kopfzeile.
- **Fertige Unraid-Installation**: Milepoint gibt es als Docker-Image mit einer Vorlage für die
  Community Applications von Unraid. Ein einziger Container liefert die ganze App aus; du
  verbindest ihn mit deiner eigenen PostgreSQL und deinem Redis und legst den ersten Admin-Login
  direkt in der Vorlage fest. Der Schlüssel zum Signieren der Logins wird beim ersten Start
  automatisch erzeugt und ist für jede Installation anders (er liegt im Datenordner, den du
  wählst, sodass Logins Neustarts überstehen). Eine zusätzliche Zugriffsadresse muss nicht
  eingetragen werden.
