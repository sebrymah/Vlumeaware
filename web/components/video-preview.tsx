'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

/** A small "Preview" button + modal player for an awareness video URL. */
export function VideoPreviewButton({
  url,
  label = 'Preview',
  title,
}: {
  url: string;
  label?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const playable = /^https?:\/\//i.test(url) || url.startsWith('blob:');
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <Icon name="play" className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <VideoModal url={url} title={title} playable={playable} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function VideoModal({
  url,
  title,
  playable,
  onClose,
}: {
  url: string;
  title?: string;
  playable: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-900">{title ?? 'Video preview'}</p>
          <button
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="bg-black">
          {playable ? (
            <video src={url} controls autoPlay preload="metadata" className="max-h-[70vh] w-full">
              <a href={url} className="text-white">
                Open the video
              </a>
            </video>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <Icon name="video" className="h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-200">
                This file plays once published. It&rsquo;s stored in your library and served to
                employees on the teachable-moment page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
