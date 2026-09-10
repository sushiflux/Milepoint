import { useCallback, useRef } from 'react'
import { useClickOutside } from '../hooks/useClickOutside'

export interface ContextMenuAction {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

export type ContextMenuEntry = ContextMenuAction | 'divider'

interface Props {
  x: number
  y: number
  items: ContextMenuEntry[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  // A pointerdown or Escape anywhere outside the menu closes it - same hook every other dropdown
  // in the app uses now, instead of a `fixed inset-0` catcher overlay that a higher-z element
  // could paint over. The menu itself is `position: fixed` with no wrapping container, so the
  // ref goes straight on the menu <div>.
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => onClose(), [onClose])
  useClickOutside(menuRef, true, close)

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[12rem] rounded-xl border border-slate-200/80 bg-white/95 p-1.5 text-xs shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95"
      style={{ left: x, top: y }}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={i} className="my-1 border-t border-slate-100 dark:border-slate-800" />
        ) : (
          <button
            key={item.label}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={`block w-full rounded-lg px-3 py-1.5 text-left font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              item.danger
                ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10'
                : 'text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800/80'
            }`}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  )
}
