import React, { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string | React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  isDanger?: boolean
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  onConfirm,
  onCancel,
  isDanger = false,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel, onConfirm])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onCancel()
    }
  }

  return createPortal(
    <div
      ref={overlayRef}
      onPointerDown={handleBackdropClick}
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm transition-all"
    >
      <div className="w-full max-w-sm scale-100 rounded-2xl border border-slate-200/50 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/95 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="mb-2 text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{message}</p>
        
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:-translate-y-0.5 ${
              isDanger
                ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-500/20'
                : 'bg-brand-primary hover:bg-brand-primary-light shadow-brand-primary/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
