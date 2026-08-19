// Shared between TimelineView (which reads this to color bars) and SettingsPage (which lets the
// user change it) - a single source of truth so both stay in sync on the same preference key.
export type BarColorMode = 'default' | 'status' | 'priority'

export const BAR_COLOR_MODE_PREFERENCE_KEY = 'timelineBarColorMode'

export const BAR_COLOR_MODE_OPTIONS: { value: BarColorMode; label: string; description: string }[] = [
  { value: 'default', label: 'Standard', description: 'Phasen orange, Aufgaben mit Unteraufgaben grau, sonst nach Status/Spalte eingefärbt.' },
  { value: 'status', label: 'Nach Status', description: 'Alle Aufgaben-Balken durchgehend nach Status eingefärbt (Neu, In Arbeit, Fertig, Pausiert, ...).' },
  { value: 'priority', label: 'Nach Priorität', description: 'Balken nach Priorität eingefärbt (Niedrig, Mittel, Hoch, Dringend).' },
]

export const DEFAULT_BAR_COLOR_MODE: BarColorMode = 'default'

export function resolveBarColorMode(stored: string): BarColorMode {
  return stored === 'status' || stored === 'priority' ? stored : DEFAULT_BAR_COLOR_MODE
}
