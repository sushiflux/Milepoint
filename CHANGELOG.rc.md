# Release-Candidate-Changelog

**[English](#english) · [Deutsch](#deutsch)**

---

<a id="english"></a>
## English

_The German version follows below — [jump to it](#deutsch)._

What is new for you in the current **release candidate** — one consolidated summary of everything
that matters to you as a Milepoint user since the last entry in [CHANGELOG.md](CHANGELOG.md)
(v2026.8.66). A release candidate is a test build, not a final release: when it is released, this
summary moves into `CHANGELOG.md` under the release's version number.

## v2026.9.80-rc1 (Unraid)

✨ New

- **Notes as a network**: the Notes tab has a new Graph view that shows all your notes as dots
  with their titles, connected by lines wherever one note links to another with `[[Note title]]`.
  A note can link to as many others as you like. Drag dots to arrange them (positions are saved),
  right-click empty space to create a note right there or to connect two notes, and click a note
  to open it. The new "Farbschema" button colors all notes at once with one of six palettes.
- **"Anordnen" button**: one click arranges all notes into a tidy layout with as few crossing
  lines as possible. Where two lines still have to cross, the longer one is drawn dashed so you
  can see it passes behind the other instead of cutting straight through unrelated notes.
- **Voice dictation for notes**: speak instead of type. An admin picks the speech recognition in
  the settings — the browser's built-in recognition (free, nothing to set up), a self-hosted
  Whisper service (free and private, runs on your own server), OpenAI, or Google. You can switch
  microphones directly at the mic button, live level bars show that it is really listening, and
  the messages when the browser blocks the microphone now say what to do about it.
- **More accurate self-hosted speech recognition**: Whisper now runs on a faster engine with the
  large-v3-turbo model, which recognizes German considerably more reliably than the previous
  default.
- **Ready-made Unraid installation**: Milepoint now ships as a Docker image with a template for
  Unraid's Community Applications. A single container serves the whole app; you connect it to your
  own PostgreSQL and Redis and set the first admin login right in the template.

🔄 Change

- New projects no longer start with an automatically created note named after the project. Notes
  you already have are not touched.
- The extra "Vorschau" (preview) box below the note editor is gone — it only repeated the text
  right above it. To jump to a linked note, use the notes list or the Graph view.

🔧 Fix

- The Graph view no longer turns blank when notes were placed very far apart.
- After your session expired and you logged in again, a project page could stay stuck on
  "loading" forever. It now loads normally.
- Dictation recordings from some browsers were rejected with "Nicht unterstützter
  Audio-Dateityp". They are accepted now.
- The dictation error message and the microphone menu no longer run off the edge of the window.

---

<a id="deutsch"></a>
## Deutsch

_Die englische Version steht oben — [zum Anfang](#english)._

Was für dich im aktuellen **Release-Kandidaten** neu ist — eine zusammengefasste Übersicht über
alles, was für dich als Milepoint-Nutzer seit dem letzten Eintrag in
[CHANGELOG.md](CHANGELOG.md) (v2026.8.66) wichtig ist. Ein Release-Kandidat ist ein Testbuild,
kein fertiges Release: Beim Release wandert diese Übersicht unter der Versionsnummer des Releases
in die `CHANGELOG.md`.

## v2026.9.80-rc1 (Unraid)

✨ Neu

- **Notizen als Netzwerk**: Der Reiter „Notizen" hat eine neue Graph-Ansicht, die alle Notizen als
  Punkte mit ihrem Titel zeigt, verbunden durch Linien überall dort, wo eine Notiz mit
  `[[Notiztitel]]` auf eine andere verweist. Eine Notiz kann auf beliebig viele andere verweisen.
  Punkte lassen sich per Ziehen anordnen (die Positionen werden gespeichert), ein Rechtsklick auf
  freie Fläche legt direkt dort eine Notiz an oder verbindet zwei Notizen, ein Klick öffnet die
  Notiz. Der neue Button „Farbschema" färbt alle Notizen auf einmal mit einer von sechs Paletten.
- **Button „Anordnen"**: Ein Klick ordnet alle Notizen zu einem aufgeräumten Layout mit möglichst
  wenigen sich kreuzenden Linien. Wo sich zwei Linien trotzdem kreuzen müssen, wird die längere
  gestrichelt gezeichnet — so siehst du, dass sie hinter der anderen entlangläuft, statt einfach
  quer durch unbeteiligte Notizen zu schneiden.
- **Sprachdiktat für Notizen**: sprechen statt tippen. Ein Admin wählt die Spracherkennung in den
  Einstellungen — die eingebaute Erkennung des Browsers (kostenlos, nichts einzurichten), einen
  selbst betriebenen Whisper-Dienst (kostenlos und privat, läuft auf deinem eigenen Server),
  OpenAI oder Google. Das Mikrofon lässt sich direkt am Mikrofon-Button wechseln, Pegelbalken
  zeigen live, dass wirklich zugehört wird, und die Meldungen, wenn der Browser das Mikrofon
  blockiert, sagen jetzt, was zu tun ist.
- **Treffsicherere selbst betriebene Spracherkennung**: Whisper läuft jetzt auf einer schnelleren
  Engine mit dem Modell large-v3-turbo, das Deutsch deutlich zuverlässiger erkennt als die
  bisherige Voreinstellung.
- **Fertige Unraid-Installation**: Milepoint gibt es jetzt als Docker-Image mit einer Vorlage für
  die Community Applications von Unraid. Ein einziger Container liefert die ganze App aus; du
  verbindest ihn mit deiner eigenen PostgreSQL und deinem Redis und legst den ersten Admin-Login
  direkt in der Vorlage fest.

🔄 Geändert

- Neue Projekte starten nicht mehr mit einer automatisch angelegten Notiz, die wie das Projekt
  heißt. Bereits vorhandene Notizen bleiben unangetastet.
- Das zusätzliche Feld „Vorschau" unter dem Notiz-Editor ist entfallen — es wiederholte nur den
  Text direkt darüber. Um zu einer verlinkten Notiz zu springen, nutze die Notizenliste oder die
  Graph-Ansicht.

🔧 Behoben

- Die Graph-Ansicht wird nicht mehr leer, wenn Notizen sehr weit auseinander platziert wurden.
- Nachdem die Sitzung abgelaufen war und du dich neu angemeldet hattest, konnte eine Projektseite
  dauerhaft auf „Lädt" hängen bleiben. Sie lädt jetzt normal.
- Diktat-Aufnahmen aus manchen Browsern wurden mit „Nicht unterstützter Audio-Dateityp"
  abgelehnt. Sie werden jetzt akzeptiert.
- Die Diktat-Fehlermeldung und das Mikrofon-Menü laufen nicht mehr über den Fensterrand hinaus.
