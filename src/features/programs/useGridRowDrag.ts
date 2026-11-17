import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject } from 'react';
import type { GridDropTarget, GridDragSource } from '@/domain/programs/gridRowMoves';
import { gridPointAtCell } from './useGridDragSelection';

type Preview = { source: GridDragSource; target: GridDropTarget | null };
type Gesture = Preview & { pointerId: number; cell: HTMLElement; startX: number; startY: number; x: number; y: number; moved: boolean };
const targetKey = (target: GridDropTarget | null) => target ? target.kind === 'exercise' ? `${target.exerciseId}:${target.edge}` : target.kind === 'section' ? `${target.sectionId}:${target.edge ?? ''}` : target.kind === 'day' ? `${target.dayId}:${target.edge ?? ''}` : target.weekId : '';

/** Pointer capture moves exercises, sections and days across sheets; Shift selects ranges. */
export function useGridRowDrag(root: RefObject<HTMLDivElement | null>, onDrop: (source: GridDragSource, target: GridDropTarget) => void) {
  const gesture = useRef<Gesture | null>(null);
  const frame = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const callback = useRef(onDrop);
  callback.current = onDrop;
  const [preview, setPreview] = useState<Preview | null>(null);

  function release() {
    const current = gesture.current;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (current?.cell.hasPointerCapture(current.pointerId)) current.cell.releasePointerCapture(current.pointerId);
  }
  function stop() { release(); setPreview(null); }
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); stop(); } };
    window.addEventListener('blur', stop);
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('blur', stop); window.removeEventListener('keydown', escape, true); release(); };
  }, []);

  function locate(x: number, y: number): { target: GridDropTarget | null; hit: Element | null } {
    const hit = document.elementFromPoint(x, y);
    if (!hit || !root.current?.contains(hit)) return { target: null, hit };
    const source = gesture.current?.source;
    if (!source) return { target: null, hit };
    const edge = (element: Element | null): 'before' | 'after' => {
      const rect = element?.getBoundingClientRect();
      return rect && y < rect.top + rect.height / 2 ? 'before' : 'after';
    };
    const empty = hit.closest<HTMLElement>('[data-grid-drop-section], [data-grid-drop-day]');
    if (empty) {
      const dayId = empty.dataset.gridDropDay ?? empty.dataset.gridDropParentDay;
      if (source.kind === 'day') return { target: dayId ? { kind: 'day', dayId, edge: edge(empty) } : null, hit };
      if (empty.dataset.gridDropSection) return { target: { kind: 'section', sectionId: empty.dataset.gridDropSection, edge: edge(empty) }, hit };
      if (dayId) return { target: { kind: 'day', dayId }, hit };
    }
    const cell = hit.closest<HTMLTableCellElement>('td[data-grid-column]');
    const point = cell ? gridPointAtCell(cell, y) : null;
    if (!cell || !point) {
      const weekId = hit.closest<HTMLElement>('[data-week-sheet]')?.dataset.weekSheet;
      return { target: source.kind === 'day' && weekId ? { kind: 'week', weekId } : null, hit };
    }
    const table = cell.closest('table');
    const row = table?.querySelector<HTMLElement>(`[data-grid-exercise="${CSS.escape(point.exerciseId)}"]`);
    const dayId = row?.dataset.gridDayId;
    const sectionId = row?.dataset.gridSectionId;
    if (source.kind === 'day') {
      const dayCell = dayId ? table?.querySelector<HTMLElement>(`[data-grid-day="${CSS.escape(dayId)}"]`) : null;
      return { target: dayId ? { kind: 'day', dayId, edge: edge(dayCell ?? null) } : null, hit };
    }
    if (source.kind === 'section') {
      if (cell.dataset.gridColumn === 'day' && dayId) return { target: { kind: 'day', dayId }, hit };
      const sectionCell = sectionId ? table?.querySelector<HTMLElement>(`[data-grid-section="${CSS.escape(sectionId)}"]`) : null;
      return { target: sectionId ? { kind: 'section', sectionId, edge: edge(sectionCell ?? null) } : null, hit };
    }
    return { target: { kind: 'exercise', exerciseId: point.exerciseId, edge: edge(row ?? null) }, hit };
  }
  function tick() {
    const current = gesture.current;
    if (!current?.moved) return;
    const { target, hit } = locate(current.x, current.y);
    if (targetKey(target) !== targetKey(current.target)) {
      current.target = target;
      setPreview({ source: current.source, target });
    }
    const speed = (value: number, min: number, max: number) => value < min + 28 ? -14 : value > max - 28 ? 14 : 0;
    const viewport = hit?.closest<HTMLElement>('[data-grid-viewport]');
    if (viewport && root.current?.contains(viewport)) {
      const rect = viewport.getBoundingClientRect();
      viewport.scrollBy(speed(current.x, rect.left, rect.right), speed(current.y, rect.top, rect.bottom));
    }
    window.scrollBy(0, speed(current.y, 0, window.innerHeight));
    frame.current = requestAnimationFrame(tick);
  }
  return {
    preview,
    resetClick() { suppressClick.current = false; },
    start(event: PointerEvent<HTMLElement>, source: GridDragSource) {
      if (event.button !== 0 || event.shiftKey || event.pointerType === 'touch' || (event.target as Element).closest('input, textarea, select, button')) return false;
      event.preventDefault();
      release();
      gesture.current = { source, target: null, pointerId: event.pointerId, cell: event.currentTarget,
        startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus({ preventScroll: true });
      return true;
    },
    move(event: PointerEvent<HTMLDivElement>) {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      if (!(event.buttons & 1)) { stop(); return; }
      current.x = event.clientX; current.y = event.clientY;
      if (!current.moved && Math.hypot(current.x - current.startX, current.y - current.startY) >= 5) {
        current.moved = true;
        suppressClick.current = true;
        setPreview({ source: current.source, target: null });
        tick();
      }
    },
    finish(event: PointerEvent<HTMLDivElement>) {
      const current = gesture.current;
      if (!current || current.pointerId !== event.pointerId) return;
      const target = current.moved ? locate(event.clientX, event.clientY).target : null;
      stop();
      if (target) callback.current(current.source, target);
    },
    stop,
    click(event: MouseEvent<HTMLDivElement>) {
      if (suppressClick.current && event.detail > 0) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
    },
  };
}
export type GridRowDrag = ReturnType<typeof useGridRowDrag>;
