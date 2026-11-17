import type { SVGProps } from 'react';

/** Navigation glyphs drawn for this app on a 24px grid; stroke follows currentColor. */
function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" />
  </Icon>
);

export const TrainingIcon = () => (
  <Icon>
    <path d="M6.5 6v12M3.5 8.5v7M17.5 6v12M20.5 8.5v7M6.5 12h11" />
  </Icon>
);

export const NutritionIcon = () => (
  <Icon>
    <path d="M12 7c-1.2-1.4-3.3-1.9-5-.9-2.4 1.4-2.6 5-1.2 8.3C7 17.2 9 20 10.6 20c.6 0 .9-.3 1.4-.3s.8.3 1.4.3c1.6 0 3.6-2.8 4.8-5.6 1.4-3.3 1.2-6.9-1.2-8.3-1.7-1-3.8-.5-5 .9z" />
    <path d="M12 7c0-1.6.8-3 2.5-3.5" />
  </Icon>
);

export const ProgressIcon = () => (
  <Icon>
    <path d="M4 20h16M4.5 16l5-5 3.5 3.5L19.5 8" />
    <path d="M15 7.5h4.5V12" />
  </Icon>
);

export const ClientsIcon = () => (
  <Icon>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" />
    <path d="M15.5 6a3 3 0 0 1 0 5.5M17.5 14.8c1.6.6 2.6 2 3 4.2" />
  </Icon>
);

export const TemplatesIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M4 9.5h16M10 9.5V20" />
  </Icon>
);

export const ReviewsIcon = () => (
  <Icon>
    <path d="M4 13.5 6.5 5h11l2.5 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    <path d="M4 13.5h4.5l1 2h5l1-2H20" />
  </Icon>
);

/** Inline action glyphs, sized to sit beside button text. */
export const CopyIcon = () => (
  <Icon className="size-4 shrink-0">
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon className="size-4 shrink-0" strokeWidth={2.2}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const CheckCircleIcon = () => (
  <Icon className="size-5 shrink-0" strokeWidth={2}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.75 2.75L16 10" />
  </Icon>
);

export const SendIcon = () => (
  <Icon className="size-4 shrink-0">
    <path d="M20.5 3.5 10 14M20.5 3.5 14 20.5l-4-6.5-6.5-4z" />
  </Icon>
);

export const PlusIcon = () => <Icon className="size-4 shrink-0"><path d="M12 5v14M5 12h14" /></Icon>;
export const TrashIcon = () => <Icon className="size-4 shrink-0"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></Icon>;
export const ArchiveIcon = () => <Icon className="size-4 shrink-0"><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M10 12h4" /></Icon>;
export const ArrowUpIcon = () => <Icon className="size-4 shrink-0"><path d="M12 20V4m-6 6 6-6 6 6" /></Icon>;
export const ArrowDownIcon = () => <Icon className="size-4 shrink-0"><path d="M12 4v16m-6-6 6 6 6-6" /></Icon>;
export const MoveIcon = () => <Icon className="size-4 shrink-0"><path d="M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4" /></Icon>;
export const CautionIcon = () => <Icon className="size-4 shrink-0"><path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01" /></Icon>;
export const PauseIcon = () => <Icon className="size-4 shrink-0"><path d="M8 5v14M16 5v14" /></Icon>;
export const StopIcon = () => <Icon className="size-4 shrink-0"><rect x="5" y="5" width="14" height="14" rx="2" /></Icon>;
export const PlayIcon = () => <Icon className="size-4 shrink-0"><path d="m8 4 12 8-12 8V4Z" /></Icon>;
export const PencilIcon = () => <Icon className="size-4 shrink-0"><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14z" /></Icon>;
export const DayIcon = () => <Icon><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v4M16 3v4M4 11h16" /></Icon>;
export const SectionIcon = () => <Icon><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></Icon>;
/** Two headed groups of indented rows: exercises grouped into sections. */
export const SectionsIcon = () => <Icon className="size-4 shrink-0"><path d="M4 5h9M8 9h12M4 14h9M8 18h12" /></Icon>;
export const SpreadsheetIcon = () => <Icon><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 4v16M15 9v11" /></Icon>;
export const ChevronIcon = ({ open }: { open: boolean }) => <Icon className={`size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}><path d="m9 5 7 7-7 7" /></Icon>;
