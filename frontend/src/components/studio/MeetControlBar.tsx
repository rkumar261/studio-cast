'use client';

type MeetControlBarProps = {
  isConnected: boolean;
  isJoining: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onJoinLeave: () => void | Promise<unknown>;
};

export function MeetControlBar(props: MeetControlBarProps) {
  return (
    <footer className="mt-4 flex justify-center pb-2">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-slate-800/90 bg-[#141821]/95 px-3 py-2">
        <button
          type="button"
          onClick={props.onToggleMic}
          disabled={!props.isConnected}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            props.micEnabled ? 'bg-slate-800 text-slate-100' : 'bg-rose-500/20 text-rose-200'
          } disabled:opacity-50`}
        >
          {props.micEnabled ? 'Mic on' : 'Mic off'}
        </button>

        <button
          type="button"
          onClick={props.onToggleCamera}
          disabled={!props.isConnected}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            props.cameraEnabled ? 'bg-slate-800 text-slate-100' : 'bg-rose-500/20 text-rose-200'
          } disabled:opacity-50`}
        >
          {props.cameraEnabled ? 'Camera on' : 'Camera off'}
        </button>

        <button
          type="button"
          onClick={props.onToggleScreen}
          disabled={!props.isConnected}
          className={`rounded-full px-4 py-2 text-sm font-medium ${
            props.screenSharing ? 'bg-cyan-500/20 text-cyan-200' : 'bg-slate-800 text-slate-100'
          } disabled:opacity-50`}
        >
          {props.screenSharing ? 'Stop sharing' : 'Share screen'}
        </button>

        <button
          type="button"
          onClick={() => void props.onJoinLeave()}
          disabled={!props.isConnected && props.isJoining}
          className={`rounded-full px-5 py-2 text-sm font-semibold ${
            props.isConnected
              ? 'bg-rose-500 text-white hover:bg-rose-400'
              : 'bg-emerald-500 text-white hover:bg-emerald-400'
          } disabled:opacity-60`}
        >
          {props.isConnected ? 'Leave' : props.isJoining ? 'Joining...' : 'Join'}
        </button>
      </div>
    </footer>
  );
}
