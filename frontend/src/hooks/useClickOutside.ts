import { useEffect, type RefObject } from 'react'

// Calls `onOutside` whenever a pointerdown OR the Escape key lands outside the referenced element,
// but only while `active` is true (typically the menu's own open state). Use this instead of a
// full-viewport `<div className="fixed inset-0">` click-catcher overlay: the overlay approach
// silently fails whenever another fixed/higher-z-index element sits on top of it, or when a click
// target between the overlay and the menu calls stopPropagation() - both of which left various
// dropdowns in this app stuck open. A document-level pointerdown listener has neither problem.
//
// pointerdown (not click) so the menu closes on the press, before any click handler on the thing
// the user pressed runs - matches native <select>/OS menu behavior and avoids a one-frame flash
// where the menu is still open over the newly-focused element.
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  onOutside: () => void,
): void {
  useEffect(() => {
    if (!active) return

    function handlePointerDown(event: PointerEvent) {
      const el = ref.current
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        onOutside()
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOutside()
    }

    // Capture phase so this runs before a stopPropagation() inside the menu's own subtree could
    // swallow it - contains() already excludes in-menu targets, so capturing is safe here.
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [ref, active, onOutside])
}
