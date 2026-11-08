import { useState } from 'react';

/** Panel plegable que recuerda si estaba abierto (en este navegador; si no hay almacenamiento, vale `initial`). */
export function usePanelOpen(key: string, initial: boolean): [boolean, (open: boolean) => void] {
  const storageKey = `worldopen.panel.${key}`;
  const [open, setOpenState] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved === null ? initial : saved === '1';
    } catch {
      return initial;
    }
  });
  const setOpen = (next: boolean) => {
    setOpenState(next);
    try {
      localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // Sin almacenamiento: solo dura esta sesión.
    }
  };
  return [open, setOpen];
}
