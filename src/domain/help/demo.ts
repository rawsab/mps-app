/**
 * Animated Help demos (decision 0057, phase 2): a looping script of frames. Each frame holds the
 * picture's state, where the pointer is, any keys being pressed and a caption. DOM-free so the
 * scripts are checked in Node tests.
 */
export type DemoPointer = {
  /** A `data-demo-target` inside the demo's stage. */
  target: string;
  /** Shown pressed (a click or a held drag). */
  press?: boolean;
};

export type DemoFrame<S> = {
  state: S;
  /** How long the frame shows, in ms. */
  ms: number;
  /** What's happening, in plain words. Frames that carry on a step repeat its caption. */
  caption: string;
  pointer?: DemoPointer | null;
  /** Keys shown as pressed ("Shift", "Delete"). */
  keys?: string[];
};

export type DemoScript<S> = {
  id: string;
  /** Read by screen readers in place of the animation. */
  description: string;
  frames: DemoFrame<S>[];
};

const MIN_FRAME_MS = 60;
const MAX_LOOP_MS = 30_000;

/** Problems with a script, empty when it's fine. The last frame doubles as the reduced-motion picture. */
export function demoProblems<S>(script: DemoScript<S>): string[] {
  const problems: string[] = [];
  if (!script.frames.length) problems.push('no frames');
  if (!script.description.trim()) problems.push('no description');
  script.frames.forEach((frame, i) => {
    if (!Number.isFinite(frame.ms) || frame.ms < MIN_FRAME_MS) problems.push(`frame ${i}: shows for under ${MIN_FRAME_MS} ms`);
    if (!frame.caption.trim()) problems.push(`frame ${i}: no caption`);
  });
  const total = script.frames.reduce((sum, frame) => sum + frame.ms, 0);
  if (total > MAX_LOOP_MS) problems.push(`loop runs ${total} ms, over ${MAX_LOOP_MS}`);
  for (const text of [script.description, ...script.frames.map((f) => f.caption)]) {
    if (/[—–]/.test(text)) problems.push(`dash in "${text}"`);
  }
  return problems;
}

/** The distinct captions in order, for the screen-reader list of steps. */
export function demoSteps<S>(script: DemoScript<S>): string[] {
  const steps: string[] = [];
  for (const frame of script.frames) if (steps.at(-1) !== frame.caption) steps.push(frame.caption);
  return steps;
}

/** Frames that type `text` one character at a time, `stepMs` apart. */
export function typing<S>(text: string, stepMs: number, frame: (typed: string) => Omit<DemoFrame<S>, 'ms'>): DemoFrame<S>[] {
  return Array.from({ length: text.length }, (_, i) => ({ ...frame(text.slice(0, i + 1)), ms: stepMs }));
}
