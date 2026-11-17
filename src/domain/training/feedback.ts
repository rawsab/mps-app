import type { ProgramDraft } from '../programs/contract';
import { dayMuscleChanges, type MuscleFeedback, type TrainingSession } from './volume';

/**
 * Stimulus & Fatigue Tracking (FR-08, decision 0021). The scale wording and grading come from the
 * MPS mesocycle template's "Additional Resources" sheet, confirmed by the owner, and are fixed here
 * for every program. Every answer is optional; null means unanswered and 0 is an answer. Grading is
 * a suggestion for the coach and never changes a prescription.
 */

export type Score = 0 | 1 | 2 | 3;
export type StimulusQuestion = 'challenge' | 'pump' | 'disruption';
export type ProgressionQuestion = 'soreness' | 'performance';
export type FeedbackQuestion = StimulusQuestion | ProgressionQuestion;
export type FeedbackAnswers = Record<FeedbackQuestion, number | null>;

export type QuestionText = { key: FeedbackQuestion; label: string; prompt: string; scale: [string, string, string, string] };

export const STIMULUS_QUESTIONS: readonly QuestionText[] = [
  { key: 'challenge', label: 'Challenge', prompt: 'How much did the session challenge your target muscles?',
    scale: ['Barely aware of the target muscles', 'They worked, but mildly', 'A good amount of tension or burn', 'Tension and burn close to the limit'] },
  { key: 'pump', label: 'Pump', prompt: 'How much pump did you get in the target muscles?',
    scale: ['None', 'Very mild', 'Decent', 'Close to maximal'] },
  { key: 'disruption', label: 'Disruption', prompt: 'How much did the session disrupt your target muscles?',
    scale: ['No fatigue or soreness', 'Weak and stiff after, recovered by the next day', 'Weak and stiff after, some soreness the next day', 'Much weaker right after, sore for a few days or more'] },
];

export const PROGRESSION_QUESTIONS: readonly QuestionText[] = [
  { key: 'soreness', label: 'Soreness', prompt: 'How sore did you get in the target muscles after last time?',
    scale: ['Not sore', 'Stiff for a few hours, resolved by the next session for that muscle', 'DOMS that recovered just in time for the next session', 'DOMS still there at the next session'] },
  { key: 'performance', label: 'Performance', prompt: 'How was your performance?',
    scale: ['Hit target reps with 2+ reps to spare', 'Hit target reps with 0–1 reps to spare', 'Hit target reps only after target RIR', 'Could not match last week’s reps at any RIR'] },
];

export const EMPTY_ANSWERS: FeedbackAnswers = { challenge: null, pump: null, disruption: null, soreness: null, performance: null };

/** Challenge + pump + disruption (0–9), or null until all three are answered. */
export function stimulusScore(answers: FeedbackAnswers): number | null {
  const { challenge, pump, disruption } = answers;
  return challenge === null || pump === null || disruption === null ? null : challenge + pump + disruption;
}

/** Stimulus Score Grading: next week's volume for a 0–9 stimulus score. */
export function stimulusGuidance(score: number | null): string | null {
  if (score === null) return null;
  return score <= 3 ? 'Increase volume by two to four sets' : score <= 6 ? 'Increase volume normally' : 'Drop volume';
}

/** Performance Score matrix: rows are soreness, columns performance. */
const PROGRESSION_MATRIX: readonly (readonly string[])[] = [
  ['Add 1–3 sets', 'Add 0–2 sets', 'Do not add sets', 'Recovery'],
  ['Add 1–2 sets', 'Add 0–1 sets', 'Do not add sets', 'Recovery'],
  ['Do not add sets', 'Do not add sets', 'Do not add sets', 'Recovery'],
  ['Do not add sets', 'Do not add sets', 'Do not add sets', 'Recovery'],
];

/** Next week's sets from soreness × performance, or null until both are answered. */
export function progressionGuidance(answers: FeedbackAnswers): string | null {
  const { soreness, performance } = answers;
  if (soreness === null || performance === null) return null;
  return PROGRESSION_MATRIX[soreness]?.[performance] ?? null;
}

export type MuscleQuestions = {
  key: string;
  name: string;
  answers: FeedbackAnswers;
  /**
   * Set Progression is asked only when an earlier day (in program order, across weeks) trained
   * the muscle. The progression answers refer to that day.
   */
  progression: { label: string; sessionId: string | null } | null;
  saved: MuscleFeedback | null;
};

/** The muscles asked about on a day, in the order the day trains them, with saved answers. */
export function dayFeedback(program: ProgramDraft, sessions: readonly TrainingSession[], dayId: string): MuscleQuestions[] {
  const result = dayMuscleChanges(program, sessions, dayId);
  if (!result) return [];
  const session = sessions.find((s) => s.dayId === dayId) ?? null;
  return result.muscles.map((muscle) => {
    const saved = session?.feedback.find((f) => f.muscleKey === muscle.key) ?? null;
    const answers: FeedbackAnswers = saved
      ? { challenge: saved.challenge, pump: saved.pump, disruption: saved.disruption, soreness: saved.soreness, performance: saved.performance }
      : EMPTY_ANSWERS;
    const progression = muscle.comparedTo ? { label: muscle.comparedTo.label, sessionId: muscle.comparedTo.sessionId } : null;
    return { key: muscle.key, name: muscle.name, answers, progression, saved };
  });
}
