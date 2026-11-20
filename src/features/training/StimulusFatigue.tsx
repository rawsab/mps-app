import { useEffect, useState } from 'react';
import { AnimatedDisclosure } from '@/components/AnimatedDisclosure';
import { DisclosureSummary } from '@/components/DisclosureSummary';
import { ProgressionIcon, StimulusIcon } from '@/components/icons';
import { SaveStatus } from '@/components/SaveStatus';
import type { ProgramDraft } from '@/domain/programs/contract';
import {
  dayFeedback, PROGRESSION_QUESTIONS, progressionGuidance, STIMULUS_QUESTIONS, stimulusGuidance, stimulusScore,
  type FeedbackAnswers, type MuscleQuestions, type QuestionText,
} from '@/domain/training/feedback';
import type { TrainingSession } from '@/domain/training/volume';
import { logErrorMessage, useSaveFeedback } from './api';

/**
 * Optional Stimulus & Fatigue Tracking (FR-08, decision 0021): 0–3 answers per muscle trained that
 * day, saved on change. Nothing here is required to complete a workout. Staff see the template's
 * grading as a suggestion only; it never changes the program.
 */
export function StimulusFatigue({ programId, program, sessions, session, staff }: {
  programId: string; program: ProgramDraft; sessions: TrainingSession[]; session: TrainingSession; staff: boolean;
}) {
  const muscles = dayFeedback(program, sessions, session.dayId);
  if (!muscles.length) return null;
  const rated = muscles.filter((m) => Object.values(m.answers).some((v) => v !== null)).length;
  return (
    <AnimatedDisclosure heading="h3" size="md" className="mb-6 rounded-card border border-line px-3"
      label={<>Stimulus &amp; Fatigue <span className="text-sm font-normal text-muted">(optional)</span></>}
      meta={<span className="text-xs font-normal tabular-nums text-muted">{rated} of {muscles.length} rated</span>}>
      <p className="mb-3 text-xs text-muted">
        Rate each muscle from 0 to 3. Skip anything you’re unsure of. Tap a selected score again to clear it.
      </p>
      <ScaleGuide />
      <ul className="divide-y divide-line">
        {muscles.map((muscle) => <MuscleCard key={muscle.key} programId={programId} session={session} muscle={muscle} staff={staff} />)}
      </ul>
    </AnimatedDisclosure>
  );
}

function ScaleGuide() {
  return (
    <details className="mb-3 text-sm">
      <DisclosureSummary className="text-sm font-medium">What the scores mean</DisclosureSummary>
      <div className="mt-2 grid gap-4">
        <ScaleGroup title="Acute muscle stimulus" questions={STIMULUS_QUESTIONS} />
        <ScaleGroup title="Set progression" note="Asked for muscles you trained on an earlier day. Your answers refer to that day." questions={PROGRESSION_QUESTIONS} />
      </div>
    </details>
  );
}

function ScaleGroup({ title, note, questions }: { title: string; note?: string; questions: readonly QuestionText[] }) {
  return (
    <div className="grid gap-3">
      <div>
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h4>
        {note ? <p className="mt-0.5 text-xs text-muted">{note}</p> : null}
      </div>
      {questions.map((q) => (
        <table key={q.key} className="w-full text-xs">
          <caption className="mb-1 text-left text-sm"><span className="font-medium">{q.label}:</span> <span className="text-muted">{q.prompt}</span></caption>
          <thead className="sr-only"><tr><th scope="col">Score</th><th scope="col">Meaning</th></tr></thead>
          <tbody className="divide-y divide-line border-y border-line">
            {q.scale.map((text, score) => (
              <tr key={score}>
                <th scope="row" className="w-8 py-1.5 pr-2 text-left align-top font-semibold tabular-nums">{score}</th>
                <td className="py-1.5">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

const legendClass = 'mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted [&>svg]:text-gold-fg';

type SaveState = { kind: 'idle' | 'saving' } | { kind: 'error'; message: string };

function MuscleCard({ programId, session, muscle, staff }: { programId: string; session: TrainingSession; muscle: MuscleQuestions; staff: boolean }) {
  const saveFeedback = useSaveFeedback(programId);
  const [answers, setAnswers] = useState<FeedbackAnswers>(muscle.answers);
  const [state, setState] = useState<SaveState>({ kind: 'idle' });
  const savedAt = muscle.saved?.updatedAt;
  // Take the server's answers when they change underneath (another device or a coach edit), but
  // never while a save is in flight, so quick taps aren't undone by an earlier save's reply.
  useEffect(() => { if (!saveFeedback.isPending) setAnswers(muscle.answers); }, [savedAt]);

  const save = (next: FeedbackAnswers) => {
    setAnswers(next);
    setState({ kind: 'saving' });
    saveFeedback.mutate(
      { sessionId: session.id, muscleName: muscle.name, answers: next, comparedSessionId: muscle.progression?.sessionId ?? null },
      { onSuccess: () => setState({ kind: 'idle' }), onError: (err) => setState({ kind: 'error', message: logErrorMessage(err) }) },
    );
  };
  const set = (key: keyof FeedbackAnswers, value: number) => save({ ...answers, [key]: answers[key] === value ? null : value });

  const stimulus = stimulusScore(answers);
  const answeredStimulus = STIMULUS_QUESTIONS.some((q) => answers[q.key] !== null);
  const progression = progressionGuidance(answers);

  return (
    <li className="grid gap-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-lg font-semibold">{muscle.name}</h4>
        <p className="text-xs text-muted tabular-nums">
          Stimulus {stimulus === null ? (answeredStimulus ? 'incomplete' : 'not rated') : `${stimulus} / 9`}
        </p>
      </div>

      <fieldset className="grid gap-2">
        <legend className={legendClass}><StimulusIcon />Acute muscle stimulus</legend>
        {STIMULUS_QUESTIONS.map((q) => <ScoreQuestion key={q.key} id={`${session.id}-${muscle.key}-${q.key}`} question={q} value={answers[q.key]} onPick={(v) => set(q.key, v)} />)}
      </fieldset>

      {muscle.progression ? (
        <fieldset className="grid gap-2 border-t border-line/30 pt-4">
          <legend className={`${legendClass} float-left w-full`}>
            <ProgressionIcon />
            <span>Set progression <span className="font-normal normal-case tracking-normal text-muted/70">· since {muscle.progression.label}</span></span>
          </legend>
          {PROGRESSION_QUESTIONS.map((q) => <ScoreQuestion key={q.key} id={`${session.id}-${muscle.key}-${q.key}`} question={q} value={answers[q.key]} onPick={(v) => set(q.key, v)} />)}
        </fieldset>
      ) : null}

      {staff && (stimulus !== null || progression) ? (
        <p className="rounded-card bg-surface-raised px-2 py-1.5 text-xs">
          <span className="font-medium">Suggestion (not applied):</span>{' '}
          {[stimulus !== null ? `stimulus ${stimulus}/9 → ${stimulusGuidance(stimulus)}` : null, progression ? `soreness × performance → ${progression}` : null].filter(Boolean).join('; ')}
        </p>
      ) : null}

      <SaveStatus saving={state.kind === 'saving'} gap="1.25rem" className="text-xs text-muted">
          {state.kind === 'error' ? <span className="text-danger">{state.message} · <button type="button" className="underline" onClick={() => save(answers)}>Retry</button></span>
            : muscle.saved?.updatedByStaff ? 'Edited by your coach' : ''}
      </SaveStatus>
    </li>
  );
}

function ScoreQuestion({ id, question, value, onPick }: { id: string; question: QuestionText; value: number | null; onPick: (value: number) => void }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_auto_1fr] sm:items-center sm:gap-3">
      <span id={`${id}-label`} className="text-sm" title={question.prompt}>{question.label}</span>
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="flex gap-1">
        {[0, 1, 2, 3].map((score) => {
          const active = value === score;
          return (
            <button key={score} type="button" aria-pressed={active} aria-label={`${question.label} ${score}: ${question.scale[score]}`} onClick={() => onPick(score)}
              className={`min-h-11 min-w-11 rounded-card border text-sm tabular-nums ${active ? 'border-gold bg-gold font-semibold text-on-gold' : 'border-line hover:bg-surface-raised'}`}>
              {score}
            </button>
          );
        })}
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted">{value === null ? question.prompt : question.scale[value]}</p>
    </div>
  );
}
