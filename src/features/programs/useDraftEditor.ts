import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import { applyCommands, type CommandError, type DraftCommand } from '@/domain/programs/commands';
import { PROGRAM_DRAFT_SCHEMA_VERSION, type ProgramDraft, type PublishProblem, type ServiceKind } from '@/domain/programs/contract';
import {
  fetchProgramDraft,
  NotReadyError,
  programErrorMessage,
  publishProgram,
  saveProgramDraft,
  StaleDraftError,
  type DraftSnapshot,
} from './api';

/**
 * One editor state shared by the Program and Grid views (FR-05, FR-06). Both views change the draft
 * only through `dispatch(commands)`; saving sends the whole document with the version it was based on
 * (decision 0005). Nothing the coach typed is dropped: failed saves keep the edits, a stale version
 * becomes a conflict to resolve, invalid field text is kept as a rejected edit, and unsaved work is
 * mirrored to this device so a reload can restore it.
 */

export type SaveState = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error' | 'conflict';
/** Text a field or grid cell refused, kept with its message until fixed or discarded. */
export type RejectedEdit = { text: string; message: string };
type Recovery = { draft: ProgramDraft; pending: DraftCommand[]; lockVersion: number | null; at: string };

type State = {
  saveState: SaveState;
  draft: ProgramDraft | null;
  /** The last document the server confirmed (or loaded). */
  saved: ProgramDraft | null;
  /** Commands applied since `saved`, replayable onto a newer server draft. */
  pending: DraftCommand[];
  lockVersion: number | null;
  revisionNumber: number | null;
  baseStatus: DraftSnapshot['status'];
  error: string | null;
  conflictVersion: number | null;
  rejected: Record<string, RejectedEdit>;
  recovery: Recovery | null;
  publishProblems: PublishProblem[] | null;
  publishing: boolean;
  publishedNotice: string | null;
};

type Action =
  | { type: 'loaded'; snapshot: DraftSnapshot; draft: ProgramDraft; recovery: Recovery | null }
  | { type: 'loadFailed'; error: string }
  | { type: 'apply'; draft: ProgramDraft; commands: DraftCommand[] }
  | { type: 'saving' }
  | { type: 'saved'; doc: ProgramDraft; count: number; lockVersion: number; revisionNumber: number }
  | { type: 'saveFailed'; error: string }
  | { type: 'conflict'; currentVersion: number | null; error?: string }
  | { type: 'rebased'; snapshot: DraftSnapshot; draft: ProgramDraft; pending: DraftCommand[] }
  | { type: 'reject'; key: string; edit: RejectedEdit | null }
  | { type: 'dismissRecovery' }
  | { type: 'publishing' }
  | { type: 'publishDone'; notice: string | null; problems: PublishProblem[] | null; error: string | null };

const initial: State = {
  saveState: 'loading',
  draft: null,
  saved: null,
  pending: [],
  lockVersion: null,
  revisionNumber: null,
  baseStatus: null,
  error: null,
  conflictVersion: null,
  rejected: {},
  recovery: null,
  publishProblems: null,
  publishing: false,
  publishedNotice: null,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return {
        ...initial,
        saveState: 'saved',
        draft: action.draft,
        saved: action.draft,
        lockVersion: action.snapshot.lockVersion,
        revisionNumber: action.snapshot.revisionNumber,
        baseStatus: action.snapshot.status,
        recovery: action.recovery,
        publishedNotice: state.publishedNotice,
      };
    case 'loadFailed':
      return { ...state, saveState: 'error', error: action.error };
    case 'apply':
      return {
        ...state,
        draft: action.draft,
        pending: [...state.pending, ...action.commands],
        // A conflict stays a conflict until it is resolved; otherwise the next save picks this up.
        saveState: state.saveState === 'conflict' || state.saveState === 'saving' ? state.saveState : 'unsaved',
        publishProblems: null,
        publishedNotice: null,
      };
    case 'saving':
      return { ...state, saveState: 'saving', error: null };
    case 'saved': {
      const caughtUp = state.draft === action.doc;
      return {
        ...state,
        saved: action.doc,
        pending: state.pending.slice(action.count),
        lockVersion: action.lockVersion,
        revisionNumber: action.revisionNumber,
        baseStatus: 'draft',
        saveState: caughtUp ? 'saved' : 'unsaved',
        error: null,
        conflictVersion: null,
      };
    }
    case 'saveFailed':
      return { ...state, saveState: 'error', error: action.error };
    case 'conflict':
      return { ...state, saveState: 'conflict', conflictVersion: action.currentVersion, error: action.error ?? null };
    case 'rebased':
      return {
        ...state,
        draft: action.draft,
        saved: action.snapshot.draft,
        pending: action.pending,
        lockVersion: action.snapshot.lockVersion,
        revisionNumber: action.snapshot.revisionNumber,
        baseStatus: action.snapshot.status,
        saveState: action.draft === action.snapshot.draft ? 'saved' : 'unsaved',
        conflictVersion: null,
        error: null,
      };
    case 'reject': {
      const rejected = { ...state.rejected };
      if (action.edit) rejected[action.key] = action.edit;
      else delete rejected[action.key];
      return { ...state, rejected };
    }
    case 'dismissRecovery':
      return { ...state, recovery: null };
    case 'publishing':
      return { ...state, publishing: true, publishProblems: null, publishedNotice: null, error: null };
    case 'publishDone':
      return { ...state, publishing: false, publishedNotice: action.notice, publishProblems: action.problems, error: action.error ?? state.error };
  }
}

const AUTOSAVE_DELAY_MS = 1000;
const recoveryKey = (programId: string) => `mps.draft-recovery.${programId}`;

function readRecovery(programId: string): Recovery | null {
  try {
    const raw = localStorage.getItem(recoveryKey(programId));
    return raw ? (JSON.parse(raw) as Recovery) : null;
  } catch {
    return null;
  }
}

function writeRecovery(programId: string, recovery: Recovery | null) {
  try {
    if (recovery) localStorage.setItem(recoveryKey(programId), JSON.stringify(recovery));
    else localStorage.removeItem(recoveryKey(programId));
  } catch {
    // Storage can be unavailable (private mode, quota); the in-memory draft still holds the edits.
  }
}

function emptyDraft(service: ServiceKind): ProgramDraft {
  return { schemaVersion: PROGRAM_DRAFT_SCHEMA_VERSION, service, title: '', sharedSections: [], weeks: [], resources: [], coachNotes: '' };
}

const sameDoc = (a: ProgramDraft | null, b: ProgramDraft | null) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function useDraftEditor(program: { id: string; service: ServiceKind }) {
  const [state, send] = useReducer(reducer, initial);
  const stateRef = useRef(state);
  stateRef.current = state;
  const saving = useRef<Promise<void> | null>(null);

  const load = useCallback(async () => {
    try {
      const snapshot = await fetchProgramDraft(program.id);
      const draft = snapshot.draft ?? emptyDraft(program.service);
      const stored = readRecovery(program.id);
      const recovery = stored && !sameDoc(stored.draft, draft) ? stored : null;
      if (!recovery) writeRecovery(program.id, null);
      send({ type: 'loaded', snapshot, draft, recovery });
    } catch (err) {
      send({ type: 'loadFailed', error: programErrorMessage(err) });
    }
  }, [program.id, program.service]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async (overrideVersion?: number | null) => {
    if (saving.current) await saving.current;
    const s = stateRef.current;
    if (!s.draft || (s.saveState !== 'unsaved' && s.saveState !== 'error' && overrideVersion === undefined)) return;
    const doc = s.draft;
    const count = s.pending.length;
    const expected = overrideVersion === undefined ? s.lockVersion : overrideVersion;
    send({ type: 'saving' });
    const run = (async () => {
      try {
        const result = await saveProgramDraft(program.id, expected, doc);
        send({ type: 'saved', doc, count, lockVersion: result.lockVersion, revisionNumber: result.revisionNumber });
      } catch (err) {
        if (err instanceof StaleDraftError) send({ type: 'conflict', currentVersion: err.currentVersion });
        else send({ type: 'saveFailed', error: programErrorMessage(err) });
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
  }, [program.id]);

  // Autosave shortly after the last change; a save in flight picks up later edits when it finishes.
  useEffect(() => {
    if (state.saveState !== 'unsaved') return;
    const timer = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [state.saveState, state.draft, save]);

  // Mirror unsaved work to this device so a reload or a crash can restore it.
  useEffect(() => {
    // An offered recovery is kept until the coach restores or discards it.
    if (!state.draft || state.saveState === 'loading' || state.recovery) return;
    if (state.saveState === 'saved' && state.pending.length === 0) {
      writeRecovery(program.id, null);
      return;
    }
    writeRecovery(program.id, { draft: state.draft, pending: state.pending, lockVersion: state.lockVersion, at: new Date().toISOString() });
  }, [program.id, state.draft, state.pending, state.saveState, state.lockVersion, state.recovery]);

  const dispatch = useCallback((commands: DraftCommand[]): CommandError | null => {
    const s = stateRef.current;
    if (!s.draft || commands.length === 0) return null;
    const result = applyCommands(s.draft, commands);
    if (!result.ok) return result.error;
    if (result.draft !== s.draft) {
      send({ type: 'apply', draft: result.draft, commands });
      stateRef.current = { ...stateRef.current, draft: result.draft };
    }
    return null;
  }, []);

  /** Replays pending edits onto `snapshot`; returns an error message if they no longer apply. */
  const rebaseOnto = useCallback((snapshot: DraftSnapshot, pending: DraftCommand[]): string | null => {
    const base = snapshot.draft ?? emptyDraft(program.service);
    const replay = applyCommands(base, pending);
    if (!replay.ok) return `Your change #${replay.commandIndex + 1} no longer fits the latest version: ${replay.error.message}`;
    send({ type: 'rebased', snapshot: { ...snapshot, draft: base }, draft: replay.draft, pending });
    return null;
  }, [program.service]);

  const resolveConflict = useCallback(
    async (choice: 'rebase' | 'overwrite' | 'discard') => {
      const s = stateRef.current;
      if (choice === 'overwrite') return save(s.conflictVersion);
      if (choice === 'discard') {
        writeRecovery(program.id, null);
        return load();
      }
      try {
        const latest = await fetchProgramDraft(program.id);
        const problem = rebaseOnto(latest, s.pending);
        // Leaves the conflict banner up with the reason; the coach can still overwrite or discard.
        if (problem) send({ type: 'conflict', currentVersion: latest.lockVersion, error: problem });
      } catch (err) {
        send({ type: 'saveFailed', error: programErrorMessage(err) });
      }
    },
    [load, program.id, rebaseOnto, save],
  );

  const restoreRecovery = useCallback(async () => {
    const s = stateRef.current;
    if (!s.recovery || !s.draft) return;
    const recovery = s.recovery;
    send({ type: 'dismissRecovery' });
    if (recovery.lockVersion === s.lockVersion) {
      // Same base: the stored document is exactly what was being edited.
      send({ type: 'apply', draft: recovery.draft, commands: recovery.pending });
      return;
    }
    const problem = rebaseOnto({ revisionNumber: s.revisionNumber, status: s.baseStatus, lockVersion: s.lockVersion, draft: s.saved }, recovery.pending);
    if (problem) {
      send({ type: 'saveFailed', error: `${problem} The recovered edits were not applied.` });
      writeRecovery(program.id, recovery);
    }
  }, [program.id, rebaseOnto]);

  const discardRecovery = useCallback(() => {
    writeRecovery(program.id, null);
    send({ type: 'dismissRecovery' });
  }, [program.id]);

  const publish = useCallback(async () => {
    send({ type: 'publishing' });
    // Publish what is on screen: flush any pending save first.
    if (stateRef.current.saveState === 'unsaved' || stateRef.current.saveState === 'error') await save();
    if (saving.current) await saving.current;
    const s = stateRef.current;
    if (s.saveState !== 'saved' || s.lockVersion === null) {
      const reason = s.lockVersion === null && s.saveState === 'saved' ? 'Make a change to start a new draft before publishing.' : null;
      send({ type: 'publishDone', notice: null, problems: null, error: reason ?? s.error ?? 'Save the draft before publishing.' });
      return;
    }
    try {
      const result = await publishProgram(program.id, s.lockVersion);
      send({ type: 'publishDone', notice: `Revision ${result.revisionNumber} is published. The client sees it now.`, problems: null, error: null });
      await load();
    } catch (err) {
      if (err instanceof NotReadyError) send({ type: 'publishDone', notice: null, problems: err.problems, error: null });
      else if (err instanceof StaleDraftError) {
        send({ type: 'publishDone', notice: null, problems: null, error: null });
        send({ type: 'conflict', currentVersion: err.currentVersion });
      } else send({ type: 'publishDone', notice: null, problems: null, error: programErrorMessage(err) });
    }
  }, [load, program.id, save]);

  const setRejected = useCallback((key: string, edit: RejectedEdit | null) => {
    if (edit || stateRef.current.rejected[key]) send({ type: 'reject', key, edit });
  }, []);

  const hasUnsavedWork =
    state.saveState === 'unsaved' || state.saveState === 'saving' || state.saveState === 'error' || state.saveState === 'conflict' || Object.keys(state.rejected).length > 0;

  return useMemo(
    () => ({ state, dispatch, save, resolveConflict, restoreRecovery, discardRecovery, publish, setRejected, hasUnsavedWork }),
    [state, dispatch, save, resolveConflict, restoreRecovery, discardRecovery, publish, setRejected, hasUnsavedWork],
  );
}

export type DraftEditor = ReturnType<typeof useDraftEditor>;

export const DraftEditorContext = createContext<DraftEditor | null>(null);

export function useEditor(): DraftEditor & { draft: ProgramDraft } {
  const editor = useContext(DraftEditorContext);
  if (!editor?.state.draft) throw new Error('useEditor needs a loaded DraftEditorContext');
  return { ...editor, draft: editor.state.draft };
}
