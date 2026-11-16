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
