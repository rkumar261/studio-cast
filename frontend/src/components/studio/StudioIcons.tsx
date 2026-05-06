'use client';

type StudioControlIconKind =
  | 'mark'
  | 'mic'
  | 'cam'
  | 'speaker'
  | 'react'
  | 'raise'
  | 'layout'
  | 'script'
  | 'share'
  | 'leave';

type StudioSidebarIconKind = 'people' | 'chat' | 'brand' | 'text' | 'media';

export function StudioControlIcon({
  kind,
  off = false,
}: {
  kind: StudioControlIconKind;
  off?: boolean;
}) {
  const icon = (() => {
    switch (kind) {
      case 'mark':
        return <path d="M12 3 19 6v6c0 5-3.5 7.8-7 9-3.5-1.2-7-4-7-9V6l7-3z" />;
      case 'mic':
        return (
          <>
            <rect x="9" y="4" width="6" height="10" rx="3" />
            <path d="M6 11a6 6 0 0 0 12 0M12 17v3M9 20h6" />
          </>
        );
      case 'cam':
        return (
          <>
            <rect x="3" y="7" width="13" height="10" rx="2" />
            <path d="M16 10 21 7v10l-5-3z" />
          </>
        );
      case 'speaker':
        return (
          <>
            <path d="M4 13h4l5 4V7l-5 4H4z" />
            <path d="M16 10a4 4 0 0 1 0 4M18 8a7 7 0 0 1 0 8" />
          </>
        );
      case 'react':
        return (
          <>
            <circle cx="12" cy="12" r="8" />
            <circle cx="9" cy="10" r="1" />
            <circle cx="15" cy="10" r="1" />
            <path d="M8 14c1 2 3 3 4 3s3-1 4-3" />
            <path d="M18 4v4M16 6h4" />
          </>
        );
      case 'raise':
        return (
          <path d="M8 12V7.2a1.6 1.6 0 1 1 3.2 0V11M11.2 11V5.8a1.6 1.6 0 1 1 3.2 0V11M14.4 11V6.6a1.6 1.6 0 1 1 3.2 0v8.3A6.1 6.1 0 0 1 11.5 21h-.4A6.1 6.1 0 0 1 5 14.9v-2.3a1.6 1.6 0 1 1 3.2 0V12z" />
        );
      case 'layout':
        return (
          <>
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M12 5v14M4 12h16" />
          </>
        );
      case 'script':
        return (
          <>
            <rect x="5" y="4" width="14" height="16" rx="2" />
            <path d="M8 9h8M8 13h8M8 17h6" />
          </>
        );
      case 'share':
        return (
          <>
            <path d="M12 4v11M8 8l4-4 4 4" />
            <rect x="5" y="14" width="14" height="6" rx="2" />
          </>
        );
      case 'leave':
        return (
          <path d="M22 16.9v2.2a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 11.2 18a19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.2 1h2.2a2 2 0 0 1 2 1.7c.1 1 .4 1.9.8 2.8a2 2 0 0 1-.4 2.1l-.9.9a16 16 0 0 0 6 6l.9-.9a2 2 0 0 1 2.1-.4c.9.4 1.8.7 2.8.8a2 2 0 0 1 1.7 2z" />
        );
      default:
        return null;
    }
  })();

  return (
    <span className="relative inline-flex h-5 w-5 items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {icon}
      </svg>
      {off && (
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute inset-0 h-5 w-5 text-rose-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        >
          <line x1="4" y1="20" x2="20" y2="4" />
        </svg>
      )}
    </span>
  );
}

export function StudioSidebarIcon({ kind }: { kind: StudioSidebarIconKind }) {
  const icon = (() => {
    switch (kind) {
      case 'people':
        return (
          <>
            <circle cx="9" cy="9" r="2.5" />
            <circle cx="16" cy="10" r="2" />
            <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
            <path d="M13 18a3.5 3.5 0 0 1 7 0" />
          </>
        );
      case 'chat':
        return (
          <>
            <path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-5 4v-4H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" />
            <path d="M8 10h8M8 13h6" />
          </>
        );
      case 'brand':
        return (
          <>
            <rect x="4" y="6" width="16" height="12" rx="2" />
            <circle cx="9" cy="10" r="1.5" />
            <path d="m20 15-4.2-4.2L10 16" />
          </>
        );
      case 'text':
        return (
          <>
            <path d="M5 6h14M12 6v12" />
            <path d="M9 18h6" />
          </>
        );
      case 'media':
        return <path d="M15 5v10.7a2.7 2.7 0 1 1-2.2-2.6V8h6V5z" />;
      default:
        return null;
    }
  })();

  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
  );
}
