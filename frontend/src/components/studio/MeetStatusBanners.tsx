'use client';

type MeetStatusBannersProps = {
  fallbackNotice: string | null;
  activeError: string | null;
};

export function MeetStatusBanners(props: MeetStatusBannersProps) {
  return (
    <>
      {props.fallbackNotice && (
        <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          {props.fallbackNotice}
        </p>
      )}

      {props.activeError && (
        <p className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {props.activeError}
        </p>
      )}
    </>
  );
}
