import { useState } from 'react';
import { Link } from 'react-router';
import { Dialog, DialogBody } from '@/components/Dialog';
import { STRIP_ITEM, ScrollStripList, type ScrollStrip } from '@/components/ScrollStrip';
import { CheckIcon } from '@/components/icons';
import { Avatar } from '@/components/Avatar';
import { Alert, Button, TextAreaField } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { SERVICE_LABELS } from '@/lib/services';
import { friendlyError, useAnswerServiceRequest, useClient, useClientPhoto, useMarkServiceRequestSeen, type PendingServiceRequest } from './api';
import { statusBadge } from './ClientsTable';

/**
 * Pending service requests (decision 0044), on the client page and the Clients page. Each card
 * opens the request, where the coach accepts or rejects it; the cards themselves hold no buttons.
 */
export function ServiceRequestRows({ requests, showClient = false, strip }: {
  requests: PendingServiceRequest[];
  showClient?: boolean;
  /** One sideways-scrolling row of fixed-width cards (the Clients page), from `useScrollStrip`. */
  strip?: ScrollStrip;
}) {
  const [open, setOpen] = useState<PendingServiceRequest | null>(null);
  const markSeen = useMarkServiceRequestSeen();
  const openRequest = (request: PendingServiceRequest) => {
    setOpen(request);
    markSeen.mutate(request.id);
  };
  const cards = requests.map((request) => (
    <li key={request.id} className={strip ? STRIP_ITEM : 'flex'}>
      <button type="button" aria-haspopup="dialog" onClick={() => openRequest(request)}
        className="row-link group flex w-full min-w-0 items-start gap-3 rounded-card border border-line px-4 py-3.5 text-left transition-colors hover:bg-surface-raised">
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-medium text-text">
            {showClient ? <>{request.clientName}<span className="font-normal text-muted"> · </span></> : null}
            {SERVICE_LABELS[request.service]}
          </span>
          <span className="mt-1 block text-xs text-muted">Requested {formatDate(request.createdAt)}</span>
          {request.message ? <span className="mt-2.5 line-clamp-2 break-words text-xs leading-relaxed text-muted">“{request.message}”</span> : null}
        </span>
        <span aria-hidden className="pt-0.5 text-xs text-muted group-hover:text-text">→</span>
      </button>
    </li>
  ));
  return (
    <>
      {strip ? <ScrollStripList strip={strip}>{cards}</ScrollStripList> : <ul className="grid gap-3">{cards}</ul>}
      {open ? <ServiceRequestDialog request={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** The whole request: who asked, for what, their note, then Accept or Reject (with an optional reply). */
function ServiceRequestDialog({ request, onClose }: { request: PendingServiceRequest; onClose: () => void }) {
  const answer = useAnswerServiceRequest();
  const client = useClient(request.clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
  const [rejecting, setRejecting] = useState(false);
  const [reply, setReply] = useState('');
  const label = SERVICE_LABELS[request.service];
  const current = client.data?.service_enrollments.filter((e) => e.status !== 'ended' && !e.archived_at) ?? [];
  const close = () => { if (!answer.isPending) onClose(); };

  return (
    <Dialog
      title={rejecting ? `Reject ${label} request?` : `${label} request`}
      description={rejecting ? `${request.clientName} sees that the request was declined and can ask again later.` : undefined}
      onClose={close}
      footer={rejecting ? <>
        <Button variant="secondary" disabled={answer.isPending} onClick={() => { answer.reset(); setRejecting(false); }}>Back</Button>
        <Button variant="danger" busy={answer.isPending} onClick={() => answer.mutate({ id: request.id, accept: false, reply: reply.trim() }, { onSuccess: onClose })}>Reject request</Button>
      </> : <>
        <Button variant="secondary" disabled={answer.isPending} onClick={() => { answer.reset(); setRejecting(true); }}>Reject</Button>
        <Button busy={answer.isPending} onClick={() => answer.mutate({ id: request.id, accept: true }, { onSuccess: onClose })}><CheckIcon />Accept</Button>
      </>}
    >
      <DialogBody className="grid gap-5">
        <div className="flex items-center gap-3">
          <Avatar url={photo.data} name={request.clientName} className="size-11" />
          <div className="min-w-0 flex-1">
            <Link to={`/coach/clients/${request.clientId}`} className="font-medium text-text"><span className="link link--bare">{request.clientName}</span></Link>
            {client.data ? <p className="truncate text-sm text-muted">{client.data.email}</p> : null}
          </div>
          {client.data ? statusBadge(client.data.status) : null}
        </div>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr] sm:gap-y-3 [&>dd]:mb-2 sm:[&>dd]:mb-0">
          <dt className="text-muted">Requested service</dt>
          <dd className="font-medium">{label}</dd>
          <dt className="text-muted">Requested</dt>
          <dd>{formatDate(request.createdAt)}</dd>
          <dt className="text-muted">Current services</dt>
          <dd>{client.data ? current.length ? current.map((e) => SERVICE_LABELS[e.service]).join(', ') : 'None' : '…'}</dd>
          <dt className="text-muted">Note</dt>
          <dd className="whitespace-pre-wrap break-words leading-relaxed">{request.message ? request.message : <span className="text-muted">No note</span>}</dd>
        </dl>
        {rejecting
          ? <TextAreaField label="Reply (optional)" rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} hint="Shown to the client." />
          : <p className="text-xs text-muted">Accepting adds {label} from today as an active service.</p>}
        <Alert visible={answer.isError} title={rejecting ? 'Request not rejected' : 'Service not added'}>{friendlyError(answer.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}
