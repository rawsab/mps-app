import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import { useAuth } from '@/app/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert, Button, Spinner, TextField } from '@/components/ui';
import { requireSupabase } from '@/lib/supabase';
import { DevQuickLogin } from './DevQuickLogin';

/*
 * STAND-IN photograph (Wikimedia Commons, CC BY 2.0, cropped to remove a third-party logo).
 * Replace with an MPS photograph from Matt; update the credit line below or remove it.
 */
const PHOTO = {
  src: '/images/signin-standin.jpg',
  credit: 'Nenad Stojkovic',
  source: 'https://commons.wikimedia.org/wiki/File:Close-up_Hand_holding_dumbbell_in_gym.jpg',
  license: 'https://creativecommons.org/licenses/by/2.0/',
};

function AuthFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <div className="relative h-44 overflow-hidden bg-surface sm:h-56 lg:sticky lg:top-0 lg:h-dvh">
        <img
          src={PHOTO.src}
          alt="A hand gripping a dumbbell in a gym"
          className="photo-enter size-full object-cover object-[50%_45%]"
          width={1100}
          height={1333}
          fetchPriority="high"
        />
        {/* Brand tint: a gold wash warms the grey frame, then a near-black fade grounds it. */}
        <div aria-hidden className="absolute inset-0 bg-gold opacity-55 mix-blend-multiply" />
        <div aria-hidden className="absolute inset-0 bg-gold opacity-15 mix-blend-screen" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      </div>

      <main className="relative flex flex-col px-4 py-6 sm:px-10 lg:px-16 lg:py-10">
        <div className="flex items-center justify-between">
          <img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo h-9 w-auto" />
          <ThemeToggle />
        </div>

        <div className="page-enter my-auto w-full max-w-sm py-10 lg:py-16">
          <h1 className="text-[2rem] font-medium leading-tight tracking-[-0.03em] sm:text-[2.5rem]">{title}</h1>
          {lead ? <p className="mt-2 text-base text-muted">{lead}</p> : null}
          <div className="mt-8">{children}</div>
        </div>

        {/* Licence credit (CC BY 2.0 requires it): kept small and quiet, still readable on hover/focus. */}
        <p className="text-[10px] leading-relaxed text-muted opacity-40 transition-opacity duration-150 focus-within:opacity-90 hover:opacity-90">
          Photograph:{' '}
          <a className="link link--bare" href={PHOTO.source} target="_blank" rel="noreferrer">
            {PHOTO.credit}, Wikimedia Commons
          </a>{' '}
          (
          <a className="link link--bare" href={PHOTO.license} target="_blank" rel="noreferrer">
            CC BY 2.0
          </a>
          , cropped)
        </p>
      </main>
    </div>
  );
}

const SignInInput = z.object({ email: z.email('Enter your email address'), password: z.string().min(1, 'Enter your password') });

export function SignInPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === 'signed_in') return <Navigate to="/" replace />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = SignInInput.safeParse({ email: form.get('email'), password: form.get('password') });
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    await signIn(parsed.data);
  }

  async function signIn(credentials: { email: string; password: string }) {
    setBusy(true);
    setError(null);
    const { error: signInError } = await requireSupabase().auth.signInWithPassword(credentials);
    setBusy(false);
    // Same message for unknown email and wrong password.
    if (signInError) return setError(signInError.status === 400 ? 'Email or password is incorrect.' : 'Sign-in is unavailable right now. Try again shortly.');
    navigate('/', { replace: true });
  }

  return (
    <AuthFrame title="Sign in" lead="Your training, nutrition and progress with Modern Physique Systems.">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <TextField label="Email" name="email" type="email" autoComplete="email" required />
        <TextField label="Password" name="password" type="password" autoComplete="current-password" required />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" busy={busy}>
          Sign in
        </Button>
        <Link to="/forgot-password" className="inline-flex min-h-11 items-center justify-self-start text-sm text-muted hover:text-text">
          <span className="link">Forgot your password?</span>
        </Link>
        <p className="text-xs text-muted">Accounts are created by invitation from your coach.</p>
        {import.meta.env.DEV ? <DevQuickLogin busy={busy} onSignIn={signIn} /> : null}
      </form>
    </AuthFrame>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = z.email().safeParse(new FormData(e.currentTarget).get('email'));
    if (!email.success) return setError('Enter your email address.');
    setBusy(true);
    setError(null);
    const { error: resetError } = await requireSupabase().auth.resetPasswordForEmail(email.data, {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setBusy(false);
    if (resetError && resetError.status !== 400) return setError('We could not send the email right now. Try again shortly.');
    setSent(true);
  }

  return (
    <AuthFrame title="Reset your password" lead="We’ll email you a link to choose a new one.">
      {sent ? (
        <Alert tone="success">If that address has an account, a reset link is on its way.</Alert>
      ) : (
        <form onSubmit={submit} noValidate className="grid gap-4">
          <TextField label="Email" name="email" type="email" autoComplete="email" />
          {error ? <Alert>{error}</Alert> : null}
          <Button type="submit" busy={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <Link to="/sign-in" className="mt-4 inline-flex min-h-11 items-center text-sm text-muted hover:text-text">
        <span className="link">Back to sign in</span>
      </Link>
    </AuthFrame>
  );
}

/** Landing page for invitation and recovery links: the session comes from the link; the user sets a password. */
export function AuthCallbackPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const linkError = new URLSearchParams(window.location.hash.slice(1)).get('error_description');

  if (auth.status === 'loading') {
    return (
      <AuthFrame title="Checking your link">
        <Spinner label="One moment" />
      </AuthFrame>
    );
  }
  if (auth.status === 'signed_out') {
    return (
      <AuthFrame title="Link expired">
        <Alert>{linkError ?? 'This invitation or reset link is invalid or has expired.'}</Alert>
        <Link to="/forgot-password" className="mt-3 inline-flex min-h-11 items-center text-sm text-gold-fg">
          <span className="link">Request a new link</span>
        </Link>
      </AuthFrame>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password.length < 10) return setError('Use at least 10 characters.');
    if (password !== form.get('confirm')) return setError('The passwords do not match.');
    setBusy(true);
    const { error: updateError } = await requireSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) return setError(updateError.message);
    navigate('/', { replace: true });
  }

  return (
    <AuthFrame title="Set your password" lead="Choose a password to finish setting up your account.">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <TextField label="New password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters." />
        <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" />
        {error ? <Alert>{error}</Alert> : null}
        <Button type="submit" busy={busy}>
          Save password
        </Button>
      </form>
    </AuthFrame>
  );
}
