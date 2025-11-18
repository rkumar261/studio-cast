'use client';
import { useState } from 'react';
import { TracksAPI } from '@/lib/api';

export function TrackRow({ track }: { track: { id: string; kind: string; state: string } }) {
    const [downloading, setDownloading] = useState(false);
    const canDownload = track.state === 'processed';

    async function onDownload() {
        try {
            setDownloading(true);
            const { url } = await TracksAPI.finalUrl(track.id);
            window.location.href = url;
        } finally {
            setDownloading(false);
        }
    }

    return (
        <div className="flex items-center gap-3 py-2">
            <span className="min-w-20 capitalize">{track.kind}</span>
            <span className="text-sm text-gray-600">{track.state}</span>
            {canDownload && (
                <button
                    onClick={onDownload}
                    className="ml-auto px-3 py-1.5 rounded bg-indigo-600 text-white disabled:opacity-50"
                    disabled={downloading}
                    title="Download the processed file"
                >
                    {downloading ? 'Preparing…' : 'Download'}
                </button>
            )}
        </div>
    );
}
