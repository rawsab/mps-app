import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useViewer, type Viewer } from '@/app/auth';
import { Avatar } from '@/components/Avatar';
import { ComboboxField } from '@/components/ComboboxField';
import { Alert, Button, Card, PageHeader, Spinner, TextField } from '@/components/ui';
import { saveEtransferEmail } from '@/features/billing/api';
import { AvailabilityCard } from '@/features/scheduling/AvailabilityCard';
import { deviceTimeZone, timeZoneOptions } from '@/lib/timeZones';
import { changePhoto, saveProfile, saveSchedulingSettings, saveTimeZone } from './api';
import { etransferSchema, localDate, profileSchema, schedulingSchema, validatePhoto } from './validation';

export function ProfileSettingsPage() {
  const viewer = useViewer();
  if (viewer.isPending) return <Spinner label="Loading profile" />;
  if (viewer.error) return <Alert>{viewer.error.message}</Alert>;
  return viewer.data ? <ProfileForm key={viewer.data.userId} viewer={viewer.data} /> : null;
}

function ProfileForm({ viewer }: { viewer: Viewer }) {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState(viewer.displayName);
  const [dateOfBirth, setDateOfBirth] = useState(viewer.dateOfBirth ?? '');
  const [phoneNumber, setPhoneNumber] = useState(viewer.phoneNumber ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<'profile' | 'photo' | 'timezone' | 'sessions' | 'payments' | null>(null);
  const [meetingUrl, setMeetingUrl] = useState(viewer.scheduling?.meetingUrl ?? '');
  const [lateCancelHours, setLateCancelHours] = useState(String(viewer.scheduling?.lateCancelHours ?? 24));
  const [etransferEmail, setEtransferEmail] = useState(viewer.etransferEmail ?? '');
  const device = deviceTimeZone();
  const input = useRef<HTMLInputElement>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['viewer', viewer.userId] });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = profileSchema.safeParse({ displayName, dateOfBirth, phoneNumber });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setBusy('profile');
    try {
      await saveProfile(viewer.userId, parsed.data);
      await refresh();
      setDisplayName(parsed.data.displayName);
      setPhoneNumber(parsed.data.phoneNumber);
      setMessage({ error: false, text: 'Profile saved.' });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not save your profile. Please try again.' });
    } finally { setBusy(null); }
  }

  async function updateTimeZone(timeZone: string) {
    setMessage(null);
    setBusy('timezone');
    try {
      await saveTimeZone(timeZone);
      await refresh();
      setMessage({ error: false, text: `Time zone set to ${timeZone.replaceAll('_', ' ')}.` });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not save your time zone. Please try again.' });
    } finally { setBusy(null); }
  }

  async function submitSessions(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = schedulingSchema.safeParse({ meetingUrl, lateCancelHours });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setBusy('sessions');
    try {
      await saveSchedulingSettings({ meetingUrl, lateCancelHours });
      await refresh();
      setMeetingUrl(parsed.data.meetingUrl);
      setLateCancelHours(String(parsed.data.lateCancelHours));
      setMessage({ error: false, text: 'Session settings saved.' });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not save your session settings. Please try again.' });
    } finally { setBusy(null); }
  }

  async function submitPayments(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = etransferSchema.safeParse({ etransferEmail: etransferEmail.trim() });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
      return;
    }
    setErrors({});
    setBusy('payments');
    try {
      const saved = await saveEtransferEmail(parsed.data.etransferEmail);
      await refresh();
      setEtransferEmail(saved.etransferEmail ?? '');
      setMessage({ error: false, text: saved.etransferEmail ? 'E-transfer email saved.' : 'E-transfer email removed.' });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not save your e-transfer email. Please try again.' });
    } finally { setBusy(null); }
  }

  async function updatePhoto(file: File | null) {
    setMessage(null);
    setBusy('photo');
    try {
      if (file) validatePhoto(file);
      const warning = await changePhoto(viewer.userId, viewer.avatarPath, file);
      await refresh();
      setMessage({ error: !!warning, text: warning ?? (file ? 'Profile picture updated.' : 'Profile picture removed.') });
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Could not update your picture. Please try again.' });
    } finally { setBusy(null); if (input.current) input.current.value = ''; }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile settings" subtitle="Manage your personal details, profile picture and time zone." />
      <div className="flex flex-col gap-5">
        <Alert visible={!!message} tone={message?.error ? 'error' : 'success'} onDismiss={() => setMessage(null)}>{message?.text}</Alert>
        <Card>
          <h2 className="mb-4 text-base font-semibold text-text">Profile picture</h2>
          <div className="flex flex-wrap items-center gap-5">
            <Avatar url={viewer.avatarUrl} name={viewer.displayName} className="size-24" />
            <div className="min-w-0 flex-1 space-y-3">
              <p id="photo-help" className="text-sm text-muted">JPEG, PNG, or WebP, up to 5 MB. Pictures are displayed in a circle.</p>
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile picture" aria-describedby="photo-help" className="sr-only" disabled={!!busy}
                onChange={(event) => { const file = event.target.files?.[0]; if (file) void updatePhoto(file); }} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" busy={busy === 'photo'} disabled={!!busy} onClick={() => input.current?.click()}>{viewer.avatarPath ? 'Change picture' : 'Upload picture'}</Button>
                {viewer.avatarPath ? <Button type="button" variant="ghost" disabled={!!busy} onClick={() => void updatePhoto(null)}>Remove picture</Button> : null}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold text-text">Personal details</h2>
          <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
            <fieldset disabled={!!busy} className="min-w-0 space-y-5">
              <TextField label="Preferred name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="nickname" maxLength={120} error={errors.displayName} hint="The name you’d like us to use." />
              <TextField label="Email" type="email" value={viewer.email} readOnly autoComplete="email" hint="Your sign-in email. Contact your administrator if it needs to change." />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Date of birth" type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} min="1900-01-01" max={localDate()} autoComplete="bday" error={errors.dateOfBirth} />
                <TextField label="Phone number" type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} maxLength={40} autoComplete="tel" error={errors.phoneNumber} />
              </div>
              <Button type="submit" busy={busy === 'profile'}>Save profile</Button>
            </fieldset>
          </form>
        </Card>
        <Card>
          <h2 id="profile-time-zone" className="mb-4 text-base font-semibold text-text">Time zone</h2>
          <form onSubmit={(event) => { event.preventDefault(); void updateTimeZone(String(new FormData(event.currentTarget).get('timezone'))); }} className="space-y-5" noValidate>
            <fieldset disabled={!!busy} className="min-w-0 space-y-5">
              {/* Remounts after a save so the field shows the stored zone. */}
              <ComboboxField key={viewer.timezone} label="Time zone" name="timezone" options={timeZoneOptions()} defaultValue={viewer.timezone}
                hint={viewer.staffRole ? 'Sessions you schedule use this time zone. Clients see them in their own.' : 'Session times and your daily logs use this time zone.'} />
              {device !== viewer.timezone ? (
                <p className="text-sm text-muted">
                  This device is set to {device.replaceAll('_', ' ')}.{' '}
                  <button type="button" className="font-medium text-gold-fg underline underline-offset-2" onClick={() => void updateTimeZone(device)}>Use it</button>
                </p>
              ) : null}
              <Button type="submit" busy={busy === 'timezone'}>Save time zone</Button>
            </fieldset>
          </form>
        </Card>
        {viewer.scheduling ? (
          <Card>
            <h2 id="profile-sessions" className="mb-4 text-base font-semibold text-text">Personal training sessions</h2>
            <form onSubmit={(event) => void submitSessions(event)} className="space-y-5" noValidate>
              <fieldset disabled={!!busy} className="min-w-0 space-y-5">
                <TextField label="Meeting link" type="url" inputMode="url" value={meetingUrl} onChange={(event) => setMeetingUrl(event.target.value)} maxLength={500}
                  placeholder="https://meet.google.com/abc-defg-hij" error={errors.meetingUrl} hint="Shown to your clients on every session. Leave blank if you don’t have one yet." />
                <TextField label="Late cancellation window (hours)" type="text" inputMode="numeric" value={lateCancelHours} onChange={(event) => setLateCancelHours(event.target.value)} maxLength={3}
                  className="sm:max-w-xs" error={errors.lateCancelHours} hint="Client cancellations sent with less notice than this are marked late." />
                <Button type="submit" busy={busy === 'sessions'}>Save session settings</Button>
              </fieldset>
            </form>
          </Card>
        ) : null}
        {viewer.scheduling ? <AvailabilityCard /> : null}
        {viewer.staffRole ? (
          <Card>
            <h2 id="profile-payments" className="mb-4 text-base font-semibold text-text">Payments</h2>
            <form onSubmit={(event) => void submitPayments(event)} className="space-y-5" noValidate>
              <fieldset disabled={!!busy} className="min-w-0 space-y-5">
                <TextField label="E-transfer email" type="email" inputMode="email" autoComplete="off" value={etransferEmail} onChange={(event) => setEtransferEmail(event.target.value)}
                  maxLength={254} placeholder={viewer.email} error={errors.etransferEmail}
                  hint="Clients you’re the primary coach for see this when they pay. It can differ from your sign-in email. Leave blank if you don’t take e-transfers." />
                <Button type="submit" busy={busy === 'payments'}>Save e-transfer email</Button>
              </fieldset>
            </form>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
