/**
 * Reads a video's duration in the browser, so an uploader never has to type it.
 *
 * Done client-side deliberately: extracting it on the server would mean
 * ffprobe in the API image, and the file is already in the browser's hands
 * here. The element loads metadata only, not the media body, so this is cheap
 * even for a 200MB file.
 *
 * Resolves null rather than throwing when the browser cannot decode the
 * container: duration is useful, not essential, and a codec the browser will
 * not parse must not block the upload.
 */
export function readVideoDuration(file: File, timeoutMs = 10_000): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };

    // A stream with no known length reports Infinity; a failed parse reports
    // NaN. Neither is a duration, so both fall back to null.
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.onloadedmetadata = () =>
      finish(Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null);
    video.onerror = () => finish(null);

    video.preload = 'metadata';
    video.src = url;
  });
}

/** "4:05" from 245. Blank for null, so a table cell can render it directly. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
