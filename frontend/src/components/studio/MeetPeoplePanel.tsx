'use client';

type MeetPerson = {
  id: string;
  label: string;
  role: string;
  tileKey: string | null;
};

type MeetPeoplePanelProps = {
  open: boolean;
  people: MeetPerson[];
  onClose: () => void;
  onPin: (tileKey: string) => void;
};

export function MeetPeoplePanel(props: MeetPeoplePanelProps) {
  if (!props.open) {
    return null;
  }

  return (
    <aside className="hidden h-full min-h-0 rounded-[22px] border border-slate-800 bg-[#181b22] p-4 lg:block">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-semibold text-slate-100">People</h2>
        <button
          type="button"
          onClick={props.onClose}
          className="rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-300"
        >
          ×
        </button>
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="w-full rounded-full bg-sky-600/80 px-4 py-2 text-left text-sm font-semibold text-sky-100 hover:bg-sky-500/80"
        >
          + Add people
        </button>
      </div>

      <div className="mt-3">
        <input
          type="text"
          placeholder="Search for people"
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
        />
      </div>

      <div className="mt-4 rounded-xl border border-slate-700 bg-slate-900/70">
        <div className="border-b border-slate-700 px-3 py-2 text-xs uppercase tracking-wide text-slate-400">
          In the meeting
        </div>
        <ul className="max-h-[50vh] overflow-y-auto">
          {props.people.map((person) => (
            <li
              key={person.id}
              className="flex items-center justify-between border-b border-slate-800 px-3 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200">
                  {person.label.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-100">{person.label}</p>
                  <p className="text-xs text-slate-400">{person.role}</p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-cyan-300/50"
                onClick={() => {
                  if (!person.tileKey) return;
                  props.onPin(person.tileKey);
                }}
                disabled={!person.tileKey}
              >
                Pin
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
