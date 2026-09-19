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
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError('Choose a video file.');
          setBusy(false);
          return;
        }
        const form = new FormData();
        form.append('video', file);
        form.append('title', title);
        if (category) form.append('category', category);
        if (description) form.append('description', description);
        if (duration) form.append('durationSeconds', duration);
        setUploadPct(0);
        await uploadWithProgress('/shared-training-modules/upload', form, setUploadPct);
      }
      setOk('Published to the shared library. Every client can now add it.');
      setTitle('');
      setCategory('');
      setDescription('');
      setVideoUrl('');
      setDuration('');
      if (fileRef.current) fileRef.current.value = '';
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
            <Field label="Title">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
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
            <Field label="Video file" hint="MP4, WebM, OGG, MOV or AVI — up to 200 MB.">
              <input
                ref={fileRef}
                type="file"
                accept="video/*"
                className="text-xs text-slate-600"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFilePreview(f ? URL.createObjectURL(f) : null);
                }}
              />
              {filePreview && (
                <div className="mt-2">
                  <VideoPreviewButton url={filePreview} label="Preview this file" title="Upload preview" />
                </div>
              )}
            </Field>
          )}
          {uploadPct !== null && (
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
            {busy ? 'Publishing…' : 'Publish to shared library'}
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
