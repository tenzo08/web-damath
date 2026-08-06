import { useEffect } from 'react';

/**
 * Closes an open dropdown/menu on Escape — `Modal.tsx` already does this for real
 * modals; dropdown menus (GameMenu, Rail's variant picker) need the same behavior, or
 * their invisible full-viewport "click outside to close" backdrop is left stuck in
 * place after Escape, silently blocking every click underneath it. Found by actually
 * pressing Escape against a live page, not by any unit test.
 */
export function useEscapeToClose(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
}
