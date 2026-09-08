// Vordefinierte Farbschemata für Notiz-Knoten in den Graph-/Baum-Ansichten. Jedes Schema liefert
// 6-8 klar unterscheidbare Hex-Farben, die reihum an Notizen vergeben werden können (ähnlich einer
// "intelligenten Farbverteilung" bei Mindmap-Werkzeugen) - rein deskriptive, produktneutrale Namen,
// keine Übernahme von Marken-/Produktbezeichnungen Dritter.
//
// Alle Farben sind gegen einen typischen hellen Knoten-Hintergrund (Light Theme) UND einen
// typischen dunklen Knoten-Hintergrund (Dark Theme) mit ausreichendem Kontrast nutzbar, weil die
// tatsächliche Textfarbe pro Knoten zur Laufzeit aus der Knotenfarbe selbst berechnet wird (siehe
// getReadableTextColor unten) - die Palette muss also nicht "hell" oder "dunkel" vorsortiert sein,
// sie muss nur untereinander gut unterscheidbar sein.

export interface ColorScheme {
  id: string
  label: string
  colors: string[]
}

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'default',
    label: 'Standard',
    // Die bisherigen neutralen Grautöne als Fallback-Palette - identisch zur bisherigen
    // Knotenfarbe (fill-slate-500 / dark:fill-slate-400), damit "Standard" wirklich dem
    // bisherigen Erscheinungsbild entspricht.
    colors: ['#64748b', '#71717a', '#78716c', '#6b7280', '#57606f', '#6b6f76'],
  },
  {
    id: 'vivid',
    label: 'Lebendig',
    colors: ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#65a30d'],
  },
  {
    id: 'pastel',
    label: 'Pastell',
    colors: ['#f9a8b4', '#a5c8f0', '#a8d8b9', '#f6cf8e', '#c4b5e8', '#8fd4d0', '#f0b88a', '#b9c9a0'],
  },
  {
    id: 'ocean',
    label: 'Ozean',
    colors: ['#0e7490', '#0c6f9e', '#0d9488', '#155e75', '#0369a1', '#0f766e', '#1e6091', '#0d7d70'],
  },
  {
    id: 'sunset',
    label: 'Sonnenuntergang',
    colors: ['#ea580c', '#dc2626', '#f59e0b', '#e11d48', '#f97316', '#c2410c', '#eab308', '#be123c'],
  },
  {
    id: 'forest',
    label: 'Wald',
    colors: ['#166534', '#65a30d', '#15803d', '#4d7c0f', '#047857', '#3f6212', '#059669', '#365314'],
  },
]

export const DEFAULT_COLOR_SCHEME_ID = 'default'

export function getColorScheme(id: string): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === id) ?? COLOR_SCHEMES[0]
}

/** Reihum eine Farbe aus dem gewählten Schema für den index-ten Knoten (0-basiert) zurückgeben. */
export function colorForIndex(schemeId: string, index: number): string {
  const scheme = getColorScheme(schemeId)
  return scheme.colors[index % scheme.colors.length]
}

/**
 * Weist einer Liste von Notiz-IDs reihum Farben aus dem gewählten Schema zu - z.B. für "allen
 * Kindern einer Notiz automatisch unterscheidbare Farben geben" oder "beim Anlegen mehrerer
 * Notizen direkt einfärben". Reine Zuordnungsfunktion ohne API-Aufruf - der Aufrufer entscheidet,
 * wie/ob das Ergebnis gespeichert wird (z.B. über updateNote pro Notiz).
 */
export function assignSchemeColors(noteIds: string[], schemeId: string): Map<string, string> {
  const result = new Map<string, string>()
  noteIds.forEach((id, i) => result.set(id, colorForIndex(schemeId, i)))
  return result
}

// --- Kontrast-Hilfsfunktionen -------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!match) return null
  return { r: parseInt(match[1], 16), g: parseInt(match[2], 16), b: parseInt(match[3], 16) }
}

// Relative Luminanz nach WCAG (sRGB -> linear -> gewichtete Summe). Reicht für die einfache
// Hell/Dunkel-Textentscheidung unten aus, ohne eine vollständige Kontrast-Ratio-Berechnung zu
// benötigen.
function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0.5
  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// WCAG-Kontrast-Ratio zwischen zwei Farben (1 = kein Unterschied, 21 = maximal, Schwarz auf Weiß).
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1)
  const l2 = relativeLuminance(hex2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const TEXT_DARK = '#0f172a' // slate-900
const TEXT_LIGHT = '#ffffff'

/**
 * Liefert "#0f172a" (dunkler Text) oder "#ffffff" (heller Text) - je nachdem, was auf der
 * gegebenen Hintergrundfarbe den höheren WCAG-Kontrast liefert. Eine reine Luminanz-Schwelle
 * (">0.5 => dunkler Text") reicht für mittelhelle, stark gesättigte Farben (z.B. Grün-/Orange-/
 * Gelbtöne) nicht aus, um zuverlässig über die 4.5:1-Grenze für normalen Text zu kommen - deshalb
 * wird hier der tatsächliche Kontrast beider Kandidaten berechnet und die bessere Option gewählt.
 */
export function getReadableTextColor(backgroundHex: string): string {
  const contrastWithDark = contrastRatio(backgroundHex, TEXT_DARK)
  const contrastWithLight = contrastRatio(backgroundHex, TEXT_LIGHT)
  return contrastWithDark >= contrastWithLight ? TEXT_DARK : TEXT_LIGHT
}
