import { useState } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { ArrowUpRightIcon, PlusIcon, ServicesIcon } from '@/components/icons';
import { Alert, Button, SectionTitle, TextAreaField } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { schedulingError } from '@/features/scheduling/api';
import { SERVICE_LABELS, SERVICES } from '@/lib/services';
import { useMyServiceRequests, useRequestService, useServiceLinks } from './api';

/** Each service opens its current program; missing services can be requested (decision 0042). */
export function ServiceLinks({ services, className = '' }: { services: ServiceKind[]; className?: string }) {
  const links = useServiceLinks();
  const requests = useMyServiceRequests();
  const [requesting, setRequesting] = useState(false);
  const missing = SERVICES.filter((s) => !services.includes(s));
  const pending = missing.filter((s) => requests.data?.some((r) => r.service === s && r.status === 'pending'));
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
        {pending.map((service) => (
          <li key={service} className="flex min-h-12 min-w-0 items-center gap-3 rounded-card border border-dashed border-line px-4 text-sm text-muted">
            <span className="min-w-0 flex-1 truncate">{SERVICE_LABELS[service]}</span>
            <span className="shrink-0 text-xs">Requested</span>
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
