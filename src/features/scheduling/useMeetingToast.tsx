import { useState, type ReactNode } from 'react';
import { Toast, toastMessage, ToastAction, type SavedOptions, type ToastMessage } from '@/components/Toast';
import { schedulingError, useUndoAttendance } from './api';

/**
 * The bottom-of-screen confirmation for a page that opens meeting dialogs. `saved` routes an
 * `onSaved(message, options)` call here when `options.toast` is set; `undoAttendance` adds Undo.
 */
export function useMeetingToast() {
  const [toast, setToast] = useState<(ToastMessage & { undoId?: string | undefined }) | null>(null);
  const undo = useUndoAttendance();
  const show = (message: ReactNode, options?: SavedOptions) => setToast({ ...toastMessage(message), undoId: options?.undoAttendance });
  const element = (
    <Toast onExpire={() => setToast(null)} toast={toast && {
      ...toast,
      action: toast.undoId ? (
        <ToastAction disabled={undo.isPending} onClick={() => undo.mutate(toast.undoId!, {
          onSuccess: () => setToast(null),
          onError: (error) => setToast(toastMessage(`Not undone. ${schedulingError(error)}`)),
        })}>Undo</ToastAction>
      ) : undefined,
    }} />
  );
  return { show, element };
}
