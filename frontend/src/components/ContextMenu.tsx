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
        className="fixed z-50 min-w-[11rem] rounded border border-slate-300 bg-white py-1 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900"
        style={{ left: x, top: y }}
      >
        {items.map((item, i) =>
          item === 'divider' ? (
            <div key={i} className="my-1 border-t border-slate-200 dark:border-slate-800" />
          ) : (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                item.onClick()
                onClose()
              }}
              className={`block w-full px-3 py-1.5 text-left hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 ${
                item.danger ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
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
