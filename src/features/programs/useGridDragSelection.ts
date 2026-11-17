import { useEffect, useRef, type MouseEvent, type PointerEvent, type RefObject } from 'react';

export type GridPoint = { exerciseId: string; column: number };
type Drag = { pointerId: number; capture: HTMLTableCellElement; x: number; y: number; startX: number; startY: number; anchor: GridPoint; end: GridPoint; moved: boolean };

/** Hit-testing a merged cell still identifies the exercise row beneath the pointer. */
export function gridPointAtCell(cell: HTMLTableCellElement, y?: number): GridPoint | null {
  let row = cell.parentElement as HTMLTableRowElement | null;
  const table = cell.closest('table');
  if (row && table && y !== undefined && cell.rowSpan > 1) {
    const first = row.rowIndex;
    for (let index = first; index < first + cell.rowSpan; index++) {
      const candidate = table.rows[index];
      if (!candidate) break;
      const rect = candidate.getBoundingClientRect();
      if (y >= rect.top && y < rect.bottom) { row = candidate; break; }
    }
  }
  const exerciseId = row?.dataset.gridExercise;
  const column = Number(cell.dataset.gridColumnIndex);
  return exerciseId && Number.isInteger(column) ? { exerciseId, column } : null;
}

/** Pointer capture keeps selection inside one sheet, with scrolling at its viewport edges. */
export function useGridDragSelection(table: RefObject<HTMLTableElement | null>, onSelect: (anchor: GridPoint, end: GridPoint) => void, beforeStart: () => void) {
  const drag = useRef<Drag | null>(null);
  const frame = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const callbacks = useRef({ onSelect, beforeStart });
  callbacks.current = { onSelect, beforeStart };

  function stop() {
    const gesture = drag.current;
    drag.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (gesture?.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
  }
  useEffect(() => {
    const cancel = () => {
      const gesture = drag.current;
      drag.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      if (gesture?.capture.hasPointerCapture(gesture.pointerId)) gesture.capture.releasePointerCapture(gesture.pointerId);
    };
    window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('blur', cancel); cancel(); };
  }, []);

  function extend() {
    const gesture = drag.current;
    const root = table.current;
    if (!gesture?.moved || !root) return;
    const viewport = root.closest<HTMLElement>('[data-grid-viewport]');
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const speed = (position: number, min: number, max: number) => position < min + 24 ? -16 : position > max - 24 ? 16 : 0;
    viewport.scrollBy(speed(gesture.x, rect.left, rect.right), speed(gesture.y, rect.top, rect.bottom));
    const x = Math.max(rect.left + 1, Math.min(rect.right - 1, gesture.x));
    const y = Math.max(rect.top + 1, Math.min(rect.bottom - 1, gesture.y));
    const cell = document.elementFromPoint(x, y)?.closest<HTMLTableCellElement>('td[data-grid-column]');
    const end = cell && root.contains(cell) ? gridPointAtCell(cell, y) : null;
    if (cell && end) {
      if (end.exerciseId !== gesture.end.exerciseId || end.column !== gesture.end.column) {
        gesture.end = end;
        callbacks.current.onSelect(gesture.anchor, end);
        cell.focus({ preventScroll: true });
      }
    }
    frame.current = requestAnimationFrame(extend);
  }

  return {
    resetClick() { suppressClick.current = false; },
    start(event: PointerEvent<HTMLTableCellElement>, point: GridPoint, anchor: GridPoint) {
      suppressClick.current = false;
      // Touch retains native scrolling; an open cell editor retains text selection and its picker.
      if (event.button !== 0 || event.pointerType === 'touch' || (event.target as Element).closest('input, textarea, select, button')) return;
      event.preventDefault();
      callbacks.current.beforeStart();
      point = gridPointAtCell(event.currentTarget, event.clientY) ?? point;
      if (!event.shiftKey) anchor = point;
      drag.current = { pointerId: event.pointerId, capture: event.currentTarget, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, anchor, end: point, moved: false };
      callbacks.current.onSelect(anchor, point);
      event.currentTarget.focus({ preventScroll: true });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    move(event: PointerEvent<HTMLTableElement>) {
      const gesture = drag.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) { stop(); return; }
      gesture.x = event.clientX;
      gesture.y = event.clientY;
      if (!gesture.moved && Math.hypot(gesture.x - gesture.startX, gesture.y - gesture.startY) >= 4) {
        gesture.moved = true;
        suppressClick.current = true;
        extend();
      }
    },
    finish(event: PointerEvent<HTMLTableElement>) {
      const gesture = drag.current;
      if (gesture?.pointerId === event.pointerId && gesture.moved) {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        gesture.x = event.clientX;
        gesture.y = event.clientY;
        extend();
      }
      stop();
    },
    stop,
    click(event: MouseEvent<HTMLTableElement>) {
      if (suppressClick.current && event.detail > 0) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
