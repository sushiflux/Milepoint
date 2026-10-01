// Palette for work-item categories. The backend stores only a token (ProjectCategory.Color, the same
// list as ProjectCategory.Palette); the concrete classes live here. All class strings are written out
// in full (never built from the token) so Tailwind can see them, and every badge pair keeps readable
// contrast in both themes (700 text on a 50 background / 300 text on a tinted dark background).

export const CATEGORY_PALETTE = ['violet', 'rose', 'slate', 'sky', 'emerald', 'amber', 'orange', 'teal'] as const

export const CATEGORY_COLOR_LABELS: Record<string, string> = {
  violet: 'Violett',
  rose: 'Rot',
  slate: 'Grau',
  sky: 'Blau',
  emerald: 'Grün',
  amber: 'Gelb',
  orange: 'Orange',
  teal: 'Türkis',
}

const BADGE: Record<string, string> = {
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 font-semibold',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-semibold',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 font-semibold',
  sky: 'bg-sky-50 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300 font-semibold',
  emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-semibold',
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 font-semibold',
  orange: 'bg-orange-50 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300 font-semibold',
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300 font-semibold',
}

const SWATCH: Record<string, string> = {
  violet: 'bg-violet-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-500',
  sky: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  teal: 'bg-teal-500',
}

export const categoryBadgeClass = (color?: string) => BADGE[color ?? ''] ?? BADGE.slate
export const categorySwatchClass = (color?: string) => SWATCH[color ?? ''] ?? SWATCH.slate
