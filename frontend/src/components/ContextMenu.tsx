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
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className="fixed z-50 min-w-[12rem] rounded-xl border border-slate-200/80 bg-white/95 p-1.5 text-xs shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95"
        style={{ left: x, top: y }}
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
    </>
  )
}
