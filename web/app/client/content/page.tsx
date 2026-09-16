'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { Guard, useActingTenant } from '@/components/guard';
import { Badge, Button, Card, EmptyState, Field, Notice, Table, inputClass } from '@/components/ui';
import { VideoPreviewButton } from '@/components/video-preview';
import { Icon } from '@/components/icons';

interface TrainingModule {
  id: string;
  title: string;
  description: string | null;
  videoUrl: string;
  videoSource: 'upload' | 'link';
  durationSeconds: number | null;
  sharedModuleId?: string | null;
  createdAt: string;
}

interface SharedModule {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  videoUrl: string;
  videoSource: 'upload' | 'link';
  durationSeconds: number | null;
}

export default function ContentPage() {
  return (
    <Guard allow={['client_admin']}>
      <Content />
    </Guard>
  );
}

function Content() {
  const tenantId = useActingTenant();
  const [list, setList] = useState<TrainingModule[]>([]);
  const [libraryItems, setLibraryItems] = useState<SharedModule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const [mine, library] = await Promise.all([
        api.get<TrainingModule[]>(`/tenants/${tenantId}/training-modules`),
        api.get<SharedModule[]>(`/shared-training-modules`),
      ]);
      setList(mine);
      setLibraryItems(library);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setTitle('');
    setDescription('');
    setVideoUrl('');
    setDuration('');
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (mode === 'link') {
        await api.post(`/tenants/${tenantId}/training-modules/link`, {
          title,
          description: description || undefined,
          videoUrl,
          durationSeconds: duration ? Number(duration) : undefined,
        });
      } else {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError('Choose a video file to upload.');
          setBusy(false);
          return;
        }
        const form = new FormData();
        form.append('video', file);
        form.append('title', title);
        if (description) form.append('description', description);
        if (duration) form.append('durationSeconds', duration);
        await api.upload(`/tenants/${tenantId}/training-modules/upload`, form);
      }
      setOk('Awareness module saved. Map it to a scenario under Training routing.');
      reset();
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addFromLibrary(sharedId: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await api.post(`/tenants/${tenantId}/training-modules/from-shared/${sharedId}`);
      setOk('Added to your library. Map it to a scenario under Training routing.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/tenants/${tenantId}/training-modules/${id}`);
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
        <h1 className="text-lg font-semibold text-slate-900">Awareness content</h1>
        <p className="mt-1 text-xs text-slate-500">
          Your own training videos. Upload a file, or link one already hosted on your LMS. Map a
          module to a scenario under Training routing so a click assigns it automatically.
        </p>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {ok && <Notice kind="ok">{ok}</Notice>}

      <Card title="Add a module">
        <div className="mb-4 flex gap-2">
          <Button variant={mode === 'upload' ? 'primary' : 'ghost'} onClick={() => setMode('upload')}>
            Upload a video
          </Button>
          <Button variant={mode === 'link' ? 'primary' : 'ghost'} onClick={() => setMode('link')}>
            Link a hosted video
          </Button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title">
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} />
            </Field>
            <Field label="Duration (seconds, optional)">
              <input className={inputClass} type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <input className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          {mode === 'upload' ? (
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
          ) : (
            <Field label="Hosted video URL" hint="An https link to the video on your LMS, Vimeo, etc.">
              <input className={inputClass} type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…" required />
              {/^https?:\/\//i.test(videoUrl) && (
                <div className="mt-2">
                  <VideoPreviewButton url={videoUrl} label="Preview this link" title="Link preview" />
                </div>
              )}
            </Field>
          )}

          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : mode === 'upload' ? 'Upload module' : 'Add linked module'}
          </Button>
        </form>
      </Card>

      <Card
        title="Vlumetech shared library"
        subtitle="Curated awareness videos. Add any to your library, then map it under Training routing."
      >
        <Table head={['Title', 'Category', 'Duration', '']}>
          {libraryItems.map((m) => {
            const added = list.some((x) => x.sharedModuleId === m.id);
            return (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="px-2 py-2">
                  {m.title}
                  {m.description && <div className="text-[11px] text-slate-500">{m.description}</div>}
                </td>
                <td className="px-2 py-2 text-slate-500">{m.category ?? '—'}</td>
                <td className="px-2 py-2">{m.durationSeconds ? `${m.durationSeconds}s` : '—'}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <VideoPreviewButton url={m.videoUrl} title={m.title} />
                    {added ? (
                      <span className="text-[11px] font-medium text-brand-700">added</span>
                    ) : (
                      <Button onClick={() => addFromLibrary(m.id)} disabled={busy}>
                        Add to my library
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!libraryItems.length && (
            <tr>
              <td colSpan={4} className="px-2 py-4 text-center text-slate-500">
                No shared modules published yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>

      <Card title="Your modules">
        <Table head={['Title', 'Source', 'Duration', 'Added', '']}>
          {list.map((m) => (
            <tr key={m.id} className="border-b border-slate-100">
              <td className="px-2 py-2">
                <div>{m.title}</div>
                {m.description && <div className="text-[11px] text-slate-500">{m.description}</div>}
              </td>
              <td className="px-2 py-2">
                <Badge>{m.videoSource}</Badge>
              </td>
              <td className="px-2 py-2">{m.durationSeconds ? `${m.durationSeconds}s` : '—'}</td>
              <td className="px-2 py-2">{new Date(m.createdAt).toLocaleDateString()}</td>
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
              <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                No modules yet.
              </td>
            </tr>
          )}
        </Table>
      </Card>
    </div>
  );
}
