'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadWithProgress } from '@/lib/api';
import { Guard } from '@/components/guard';
import { Badge, Button, Card, EmptyState, Field, Notice, Table, inputClass } from '@/components/ui';
import { VideoPreviewButton } from '@/components/video-preview';
import { Icon } from '@/components/icons';

interface SharedModule {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  videoUrl: string;
  videoSource: 'upload' | 'link';
  durationSeconds: number | null;
  createdAt: string;
}

interface QueuedUpload {
  name: string;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  pct?: number;
  error?: string;
}

/** "How_MFA_Stops_Stolen_Passwords.mp4" -> "How_MFA_Stops_Stolen_Passwords". */
function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, '').trim() || name;
}

export default function LibraryPage() {
  return (
    <Guard allow={['vlumetech_superadmin']}>
      <Library />
    </Guard>
  );
}

function Library() {
  const [list, setList] = useState<SharedModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [mode, setMode] = useState<'upload' | 'link'>('link');

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [queue, setQueue] = useState<QueuedUpload[]>([]);

  const load = useCallback(async () => {
    try {
      setList(await api.get<SharedModule[]>('/shared-training-modules'));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function clearForm() {
    setTitle('');
    setCategory('');
    setDescription('');
    setVideoUrl('');
    setDuration('');
    setFilePreview(null);
    setFileCount(0);
    setQueue([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (mode === 'link') {
        await api.post('/shared-training-modules/link', {
          title,
          category: category || undefined,
          description: description || undefined,
          videoUrl,
          durationSeconds: duration ? Number(duration) : undefined,
        });
      } else {
        const files = Array.from(fileRef.current?.files ?? []);
        if (!files.length) {
          setError('Choose at least one video file.');
          setBusy(false);
          return;
        }

        // One request per file. The upload endpoint accepts a single file by
        // design — the multer limits are a DoS control — and per-file requests
        // mean one rejected video fails on its own instead of taking the whole
        // batch with it.
        const failures: string[] = [];
        setQueue(files.map((f) => ({ name: f.name, status: 'pending' })));

        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const form = new FormData();
          form.append('video', file);
          // With several files the typed title cannot apply to all of them, so
          // each is named after its file.
          form.append('title', files.length > 1 ? titleFromFilename(file.name) : title);
          if (category) form.append('category', category);
          if (description) form.append('description', description);
          if (duration) form.append('durationSeconds', duration);

          const single = files.length === 1;
          const mark = (patch: Partial<QueuedUpload>) =>
            setQueue((q) => q.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

          mark({ status: 'uploading', pct: 0 });
          if (single) setUploadPct(0);
          try {
            await uploadWithProgress('/shared-training-modules/upload', form, (pct) => {
              mark({ pct });
              // A lone file keeps the original single progress bar; a batch
              // shows per-file rows instead.
              if (single) setUploadPct(pct);
            });
            mark({ status: 'done', pct: 100 });
          } catch (err) {
            const message = (err as Error).message;
            failures.push(`${file.name} — ${message}`);
            mark({ status: 'failed', error: message });
          }
        }

        const published = files.length - failures.length;
        if (failures.length) {
          // Keep the selection so a retry does not mean re-picking everything.
          setError(`Published ${published} of ${files.length}. Failed: ${failures.join('; ')}`);
          await load();
          setBusy(false);
          return;
        }
        setOk(
          `${published} module${published === 1 ? '' : 's'} published to the shared library. Every client can now add ${published === 1 ? 'it' : 'them'}.`,
        );
        clearForm();
        await load();
        return;
      }
      setOk('Published to the shared library. Every client can now add it.');
      clearForm();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.del(`/shared-training-modules/${id}`);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Shared awareness library</h1>
        <p className="mt-1 text-xs text-slate-500">
          Content you publish here is available to every client. A client admin adds it to their own
          library from the Awareness content page — their own uploads stay private to them.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Publish a module">
        <div className="mb-4 flex gap-2">
          <Button variant={mode === 'link' ? 'primary' : 'ghost'} onClick={() => setMode('link')}>
            Link a hosted video
          </Button>
          <Button variant={mode === 'upload' ? 'primary' : 'ghost'} onClick={() => setMode('upload')}>
            Upload a video
          </Button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Title"
              hint={fileCount > 1 ? `Ignored — ${fileCount} files will be named after themselves.` : undefined}
            >
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required={mode === 'link' || fileCount < 2}
                disabled={fileCount > 1}
                minLength={2}
              />
            </Field>
            <Field label="Category (optional)">
              <input className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Phishing" />
            </Field>
            <Field label="Duration (seconds, optional)">
              <input className={inputClass} type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {mode === 'link' ? (
            <Field label="Hosted video URL">
              <input className={inputClass} type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" required />
              {/^https?:\/\//i.test(videoUrl) && (
                <div className="mt-2">
                  <VideoPreviewButton url={videoUrl} label="Preview this link" title="Link preview" />
                </div>
              )}
            </Field>
          ) : (
            <Field
              label="Video file(s)"
              hint="MP4, WebM, OGG, MOV or AVI — up to 200 MB each. Select several to publish a batch."
            >
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                multiple
                className="text-xs text-slate-600"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setFileCount(files.length);
                  setQueue([]);
                  // Previewing only makes sense for a single pick.
                  setFilePreview(files.length === 1 ? URL.createObjectURL(files[0]) : null);
                }}
              />
              {fileCount > 1 && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {fileCount} files selected. Each is published as its own module, uploaded one at a
                  time; any that fail are listed and the rest still go through.
                </p>
              )}
              {filePreview && (
                <div className="mt-2">
                  <VideoPreviewButton url={filePreview} label="Preview this file" title="Upload preview" />
                </div>
              )}
            </Field>
          )}
          {queue.length > 1 && (
            <ul className="space-y-1 rounded-lg border border-slate-200 p-2">
              {queue.map((item) => (
                <li key={item.name} className="flex items-center gap-2 text-[11px]">
                  <span className="w-4 shrink-0 text-center">
                    {item.status === 'done' ? '✓' : item.status === 'failed' ? '✕' : '·'}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{item.name}</span>
                  <span
                    className={
                      item.status === 'failed'
                        ? 'shrink-0 text-red-600'
                        : item.status === 'done'
                          ? 'shrink-0 text-brand-700'
                          : 'shrink-0 text-slate-500'
                    }
                  >
                    {item.status === 'uploading'
                      ? `${item.pct ?? 0}%`
                      : item.status === 'failed'
                        ? item.error
                        : item.status === 'done'
                          ? 'published'
                          : 'waiting'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {queue.length <= 1 && uploadPct !== null && (
            <div>
              <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                <span>{uploadPct < 100 ? 'Uploading video…' : 'Processing…'}</span>
                <span>{uploadPct}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Publishing…'
              : fileCount > 1
                ? `Publish ${fileCount} modules to shared library`
                : 'Publish to shared library'}
          </Button>
        </form>
      </Card>

      <Card title={`Shared modules (${list.length})`}>
        <Table head={['Title', 'Category', 'Source', 'Duration', '']}>
          {list.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="px-2 py-2">
                {m.title}
                {m.description && <div className="text-[11px] text-slate-500">{m.description}</div>}
              </td>
              <td className="px-2 py-2 text-slate-500">{m.category ?? '—'}</td>
              <td className="px-2 py-2"><Badge>{m.videoSource}</Badge></td>
              <td className="px-2 py-2">{m.durationSeconds ? `${m.durationSeconds}s` : '—'}</td>
              <td className="px-2 py-2">
                <div className="flex items-center justify-end gap-2">
                  <VideoPreviewButton url={m.videoUrl} title={m.title} />
                  <Button variant="ghost" onClick={() => remove(m.id)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={5} className="px-2 py-8">
                <EmptyState
                  icon={<Icon name="film" />}
                  title="No shared modules yet"
                  hint="Publish a hosted link or upload a video above. Every client will be able to add it to their own awareness library."
                />
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
