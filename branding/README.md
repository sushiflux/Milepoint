# Milepoint Branding Assets

Quelle der Wahrheit für alle Logo-/Markenassets. Die Prompts, mit denen diese Dateien erzeugt wurden, stehen
in [`docs/04-branding-logo-brief.md`](../docs/04-branding-logo-brief.md).

## Status

| Datei | Status | Verwendung |
|---|---|---|
| `logo_light_mode.svg` / `.png` | ✅ freigegeben | MP-Monogramm, für hellen Hintergrund — Favicon, App-Icon, Profilbild |
| `wirtmark_light_mode.svg` / `wortmark_light_mode.png` | ✅ freigegeben | "Milepoint"-Wortmarke, für hellen Hintergrund |
| `logo_dark_mode.svg` | ✅ freigegeben | Wie oben, Buchstaben in Weiß statt Indigo — für dunklen Hintergrund |
| `wortmark_dark_mode.svg` | ✅ freigegeben | Wie oben, für dunklen Hintergrund |
| `logo_dark_mode.png` / `wortmark_darke_mode.png` | ⚠️ ignorieren | PNG-Export wurde fälschlich auf weißem statt dunklem Canvas gerendert — dadurch sind die weißen Buchstaben unsichtbar, nur der orangene Punkt bleibt sichtbar. Die zugehörigen **SVGs sind aber korrekt** (transparenter Hintergrund, weiße Buchstaben) — diese PNGs können gelöscht werden, sobald ein sauberer PNG-Export existiert. |

**Zwei Dateinamen haben Tippfehler** (aus dem Upload übernommen, nicht umbenannt um nichts zu verlieren):
`wirtmark_light_mode.svg` (statt wortmark) und `wortmark_darke_mode.png` (statt wortmark_dark_mode). Bei
Gelegenheit vereinheitlichen.

Noch nicht erstellt: kombinierter Lockup (Icon + Wortmarke nebeneinander), gestapelte Variante, einfarbige
Version.

## Bevorzugtes Format

**SVG ist die Referenz** (verlustfrei skalierbar, kleinere Dateigröße, und wie oben gesehen zuverlässiger als
PNG-Export bei transparenten/dunklen Hintergründen). PNG nur als Zusatz für Tools, die kein SVG einlesen.

## Verwendung im Produkt

- Favicon/App-Icon-Ableitungen liegen in `frontend/public/`.
- Die im UI angezeigte Version (Header, Login-Seite) liegt in `frontend/src/assets/logo.svg` — für Light/Dark
  Mode wird je nach Theme zwischen `logo_light_mode.svg` und `logo_dark_mode.svg` (bzw. den Wortmark-Pendants)
  umgeschaltet.
- Diese Kopien werden aus den Dateien hier abgeleitet — Änderungen am Markendesign zuerst hier aktualisieren,
  dann in `frontend/` nachziehen.

## Mindestgrößen / Schutzraum

Noch offen — sobald der finale Lockup vorliegt, hier Mindestgröße (px) und Schutzraum um das Logo
dokumentieren, damit es später nicht gestaucht/zu klein eingesetzt wird.
