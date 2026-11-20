import { useState } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { ArrowUpRightIcon, PlusIcon, ServicesIcon } from '@/components/icons';
import { Alert, Button, SectionTitle, TextAreaField } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { schedulingError } from '@/features/scheduling/api';
import { SERVICE_LABELS, SERVICES } from '@/lib/services';
import { useMyServiceRequests, useRequestService, useServiceLinks, useUpdateServiceRequest, type ServiceRequest } from './api';

/** How long a declined request stays on Home. */
const DECLINE_SHOWN_MS = 14 * 86_400_000;

/** Each service opens its current program; missing services can be requested (decision 0042). */
export function ServiceLinks({ services, className = '' }: { services: ServiceKind[]; className?: string }) {
  const links = useServiceLinks();
  const requests = useMyServiceRequests();
  const [requesting, setRequesting] = useState(false);
  const missing = SERVICES.filter((s) => !services.includes(s));
  const pendingRequests = missing.flatMap((s) => requests.data?.filter((r) => r.service === s && r.status === 'pending') ?? []);
  const pending = pendingRequests.map((r) => r.service);
  const [editing, setEditing] = useState<ServiceRequest | null>(null);
  // A recent decline shows (with the coach's reply) until the client asks again (decision 0044).
  const declined = missing.flatMap((s) => {
    const latest = requests.data?.find((r) => r.service === s);
    return latest?.status === 'declined' && latest.resolvedAt && Date.now() - Date.parse(latest.resolvedAt) < DECLINE_SHOWN_MS ? [latest] : [];
  });
  const requestable = missing.filter((s) => !pending.includes(s));

  return (
    <section aria-labelledby="home-services" className={`min-w-0 ${className}`}>
      <h2 id="home-services" className="mb-3 flex items-center gap-2 text-lg font-semibold"><SectionTitle icon={<ServicesIcon />}>Your services</SectionTitle></h2>
      {links.length === 0 ? <p className="mb-2 text-sm text-muted">No services are active yet.</p> : null}
      <ul className="grid gap-2">
        {links.map((link) => (
          <li key={link.service}>
            <Link to={link.to} className="btn-motion group flex min-h-12 min-w-0 items-center gap-3 rounded-card border border-line bg-surface-raised px-4 text-sm font-medium transition-colors hover:border-muted/70">
              <span className="min-w-0 flex-1 truncate">{SERVICE_LABELS[link.service]}</span>
              <span className="text-muted group-hover:text-text"><ArrowUpRightIcon /></span>
            </Link>
          </li>
        ))}
        {pendingRequests.map((request) => (
          <li key={request.service} className="flex min-h-12 min-w-0 items-center gap-3 rounded-card border border-dashed border-line py-1 pl-4 pr-1 text-sm text-muted">
            <span className="min-w-0 flex-1">
              <span className="block truncate">{SERVICE_LABELS[request.service]}</span>
              {request.message ? <span className="block truncate text-xs">“{request.message}”</span> : null}
            </span>
            <span className="shrink-0 text-xs">Requested</span>
            <Button variant="ghost" className="min-h-10 px-3 text-xs" aria-label={`${request.message ? 'Edit note on' : 'Add a note to'} your ${SERVICE_LABELS[request.service]} request`}
              onClick={() => setEditing(request)}>{request.message ? 'Edit' : 'Add note'}</Button>
          </li>
        ))}
        {declined.map((request) => (
          <li key={request.service} className="min-w-0 rounded-card border border-dashed border-line px-4 py-3 text-sm text-muted">
            <p className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate">{SERVICE_LABELS[request.service]}</span>
              <span className="shrink-0 text-xs">Declined</span>
            </p>
            {request.response ? <p className="mt-1 whitespace-pre-wrap break-words text-xs">“{request.response}”</p> : null}
          </li>
        ))}
      </ul>
      {requestable.length ? (
        <button type="button" onClick={() => setRequesting(true)}
          className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-card px-1 text-sm font-medium text-gold-fg hover:underline">
          <PlusIcon />Request a new service
        </button>
      ) : null}
      {requesting ? <RequestServiceDialog services={requestable} onClose={() => setRequesting(false)} /> : null}
      {editing ? <EditRequestDialog request={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}

function RequestServiceDialog({ services, onClose }: { services: ServiceKind[]; onClose: () => void }) {
  const [service, setService] = useState<ServiceKind>(services[0]!);
  const [message, setMessage] = useState('');
  // One id per service and message, kept across retries so a lost reply never sends twice.
  const [id, setId] = useState(() => crypto.randomUUID());
  const request = useRequestService();
  const change = (apply: () => void) => { apply(); setId(crypto.randomUUID()); request.reset(); };
  const sent = request.isSuccess;

  return (
    <Dialog title="Request a new service" description={sent ? undefined : 'Your coach will see your request and follow up with you.'} onClose={onClose}
      footer={sent ? <Button onClick={onClose}>Done</Button> : <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button busy={request.isPending} onClick={() => request.mutate({ id, service, message: message.trim() })}>Send request</Button>
      </>}>
      <div className="grid gap-4 p-4 sm:p-5">
        {sent ? <p className="text-sm">Request sent. Your coach will be in touch about {SERVICE_LABELS[service]}.</p> : <>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Service</legend>
            {services.map((s) => (
              <label key={s} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card border border-line px-3 text-sm has-[:checked]:border-gold">
                <input type="radio" name="service" value={s} checked={service === s} onChange={() => change(() => setService(s))} className="size-4 accent-gold" />
                {SERVICE_LABELS[s]}
              </label>
            ))}
          </fieldset>
          <TextAreaField label="Message (optional)" value={message} maxLength={1000} rows={3} onChange={(e) => change(() => setMessage(e.target.value))} />
          <Alert visible={request.isError} title="Could not send the request">{schedulingError(request.error)}</Alert>
        </>}
      </div>
    </Dialog>
  );
}

/** The client changes or adds the note on a pending request; the coach sees it again (decision 0044). */
function EditRequestDialog({ request, onClose }: { request: ServiceRequest; onClose: () => void }) {
  const [message, setMessage] = useState(request.message);
  const update = useUpdateServiceRequest();
  const label = SERVICE_LABELS[request.service];
  return (
    <Dialog title={request.message ? `Edit your ${label} request` : `Add a note to your ${label} request`}
      description="Your coach will see the updated note." onClose={() => { if (!update.isPending) onClose(); }}
      footer={<>
        <Button variant="ghost" disabled={update.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={update.isPending} disabled={message.trim() === request.message}
          onClick={() => update.mutate({ id: request.id, message: message.trim() }, { onSuccess: onClose })}>Save note</Button>
      </>}>
      <div className="grid gap-4 p-4 sm:p-5">
        <TextAreaField label="Message (optional)" value={message} maxLength={1000} rows={3} onChange={(e) => setMessage(e.target.value)} />
        <Alert visible={update.isError} title="Could not save the note">{schedulingError(update.error)}</Alert>
      </div>
    </Dialog>
  );
}
