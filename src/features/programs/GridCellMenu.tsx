import { PopupMenu } from '@/components/PopupMenu';
import { ArrowUpIcon, ArrowDownIcon, CopyIcon, MoveIcon, TrashIcon } from '@/components/icons';

export type GridCellAction = 'insertAbove' | 'insertBelow' | 'removeExercise' | 'moveExercise' | 'duplicateDay' | 'duplicateWeek' | 'removeDay' | 'removeWeek';
export function GridCellMenu({ x, y, label, hasDay, hasWeek, canInsert, onAction, onClose }: {
  x: number; y: number; label: string; hasDay: boolean; hasWeek: boolean; canInsert: boolean;
  onAction: (action: GridCellAction) => void; onClose: (restoreFocus: boolean) => void;
}) {
  return <PopupMenu x={x} y={y} label={label} onAction={onAction} onClose={onClose} items={[
    { action: 'insertAbove', label: 'Insert row above', icon: <ArrowUpIcon />, disabled: !canInsert },
    { action: 'insertBelow', label: 'Insert row below', icon: <ArrowDownIcon />, disabled: !canInsert },
    { action: 'removeExercise', label: 'Delete row', icon: <TrashIcon />, danger: true },
    { action: 'moveExercise', label: 'Move exercise…', icon: <MoveIcon />, separator: true },
    { action: 'duplicateDay', label: 'Duplicate day', icon: <CopyIcon />, disabled: !hasDay },
    { action: 'duplicateWeek', label: 'Duplicate week', icon: <CopyIcon />, disabled: !hasWeek },
    { action: 'removeDay', label: 'Delete day', icon: <TrashIcon />, disabled: !hasDay, danger: true, separator: true },
    { action: 'removeWeek', label: 'Delete week', icon: <TrashIcon />, disabled: !hasWeek, danger: true },
  ]} />;
}
