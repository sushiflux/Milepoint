# Logo-Briefing für Milepoint

Zum Copy-Pasten in ein Bild-/Logo-KI-Tool (z.B. Gemini). Prompt bewusst auf Englisch, weil Bild-KIs damit
erfahrungsgemäß zuverlässiger arbeiten als mit deutschen Prompts.

---

**Prompt:**

Design a logo for "Milepoint", a B2B project management SaaS platform built specifically for software,
app, and game development teams. It combines the strengths of tools like Plane, OpenProject, and Vikunja,
focused on developer workflows: issue tracking, Kanban boards, sprints, and (later) Git integration, time
tracking, and team wikis.

**Name meaning to reflect:** "Milepoint" blends "milestone" (a marked point of progress toward a goal) and
"point" (precision, a specific point on a path/roadmap). The logo should evoke forward momentum, precise
progress-tracking, and hitting goals — think checkpoints along a route, not a static flag-in-the-ground.

**Brand personality:** young, fresh, and dynamic, but still credible and trustworthy for a B2B/enterprise
buyer — NOT playful/childish, NOT generic corporate-blue-boring, NOT an overly literal illustration (no
realistic road signs, no literal flags-on-a-mountain clipart).

**Style direction:**
- Abstract/geometric mark, not a literal pictogram — e.g. a stylized point/node/checkpoint on an implied
  path or ascending line, or a minimal waypoint-dot motif.
- Should work as a small square app icon (Kanban board favicon size) as well as a wide logotype next to
  the wordmark "Milepoint".
- Color palette: modern SaaS energy without looking generic — lean toward an indigo/violet primary with
  one vibrant accent color (e.g. a warm coral or electric cyan) rather than default corporate blue or a
  full rainbow.
- Clean sans-serif wordmark, geometric, slightly rounded terminals for approachability, but tight
  letter-spacing and confident weight for B2B credibility.
- Must work in both light and dark UI themes (the product itself will support both).

Deliver: a primary full-color version, a monochrome/single-color version, and a standalone icon/mark
without the wordmark (for favicon/app-icon use).

---

Falls die Bild-KI mehrere Varianten anbietet: auf Eindeutigkeit bei kleiner Größe (Favicon/App-Icon) und auf
Kontrast in beiden Farbschemata (hell/dunkel) achten — das UI wird beide unterstützen (siehe
[02-decisions.md](02-decisions.md)).

---

## Variante A: MP-Monogramm (Icon/Mark allein)

**Prompt:**

Design a standalone monogram/lettermark icon combining the letters "M" and "P" (from "MilePoint" — Mile +
Point), for the B2B SaaS brand "Milepoint" (see brief above for product context and personality: young,
fresh, dynamic, but still B2B-credible).

Fuse the M and P into a single ligature-style mark rather than two separate letterforms placed side by
side — e.g. share a common vertical stroke between the M's right leg and the P's stem, or let the P's bowl
open directly out of the M's final upstroke. Optionally integrate a small dot/waypoint node at one terminal
or apex of the letterform to reinforce the "point on a path" meaning, but keep it subtle — the letters
should read clearly as "MP" at a glance, not become an abstract blob.

Must remain crisp and legible at favicon size (16–32px) and work as a single-color mark (for dark and light
UI backgrounds) as well as full color. Deliver: full-color version, single-color/monochrome version.

---

## Variante B: Wortmarke "Milepoint"

**Prompt:**

Design a wordmark logotype for the B2B SaaS brand "Milepoint" (one word, capital M, rest lowercase — see
brief above for product context and personality: young, fresh, dynamic, but still B2B-credible).

Custom-lettered or a carefully chosen/modified geometric sans-serif — not a default system font. Consider a
subtle custom treatment on the "M" and "P" (the two letters that also form the standalone MP monogram in
Variant A) so the two lockups feel like one family, e.g. a matching terminal shape, shared stroke weight, or
a small waypoint-dot accent tied to the "i" dot or the P's counter. Tight, confident letter-spacing; rounded
terminals for approachability without looking soft or playful.

Deliver: the wordmark alone (no icon), in full color and in a single-color/monochrome version, plus one
combined lockup showing the Variant A monogram icon placed to the left of this wordmark.

---

## Variante B2: Wortmarke, nur der Punkt auf dem "i" ersetzt

(Nachschärfung, nachdem die "l"-Ersetzung den Schwung des Icons verloren hat und zu dominant wirkte.)

**Prompt:**

Take the wordmark "Milepoint" with completely normal, unmodified geometric sans-serif letterforms
throughout — including a normal straight-stroke lowercase "l". The only change: replace the dot of the
lowercase "i" in "Mile" (the second letter) with the bright accent-colored circular dot used in the
standalone icon mark. Keep that substitution small and contained exactly within the "i"'s normal dot
position and proportions — do not enlarge it, do not add any trail/path/curve, do not modify any other
letter. The word must read instantly and unambiguously as "Milepoint" at a glance.

Deliver: full-color version, single-color/monochrome version.

---

## Dark-Mode-Variante

(Das Produkt-UI unterstützt hell UND dunkel, siehe [02-decisions.md](02-decisions.md) — das Logo muss auf
einem dunklen Hintergrund (ca. `#0f172a`, Tailwind slate-950, wie in der Login-Seite) genauso gut lesbar
bleiben wie auf Weiß.)

**Prompt:**

Create a dark-mode version of this exact approved logo (same icon shape, same "Milepoint" wordmark, same
composition and lockup — do not redesign anything) for use on dark UI backgrounds (dark slate, roughly
#0f172a, near-black).

Adjust only the colors for sufficient contrast and legibility against that dark background: brighten/lighten
the primary indigo/violet shade so it doesn't look muddy or low-contrast on dark slate (a lighter indigo or
periwinkle tone rather than the deep indigo used on the white/light version). Keep the coral/orange accent
dot essentially unchanged — it already contrasts well on dark backgrounds. Preserve exact shapes, proportions,
and letterforms from the light-mode version; this is a color-only adaptation, not a redesign.

Show the result on a dark slate background (#0f172a) so contrast is testable, but deliver the asset itself
with a transparent background. Provide this dark variant for: the standalone icon, the wordmark, and the
horizontal lockup.
