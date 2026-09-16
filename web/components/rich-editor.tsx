'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A small self-contained WYSIWYG editor for phishing email bodies. It edits a
 * contentEditable surface and emits HTML, so a client admin can compose without
 * writing markup. Two placeholder buttons insert the tokens the send pipeline
 * substitutes ({{TRACKING_URL}} as a link, {{EMPLOYEE_NAME}}). A raw-HTML toggle
 * stays available for power users.
 */
export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'visual' | 'html'>('visual');

  // Load incoming value into the surface only when switching to visual or on
  // first mount, so typing does not fight the controlled value.
  useEffect(() => {
    if (mode === 'visual' && ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function exec(command: string, arg?: string) {
    document.execCommand(command, false, arg);
    emit();
  }

  function emit() {
    if (ref.current) onChange(ref.current.innerHTML);
  }

  function insertTrackingLink() {
    // The href must survive as the literal placeholder the pipeline replaces.
    const html = '<a href="{{TRACKING_URL}}">Click here</a>&nbsp;';
    document.execCommand('insertHTML', false, html);
    emit();
  }

  function insertName() {
    document.execCommand('insertHTML', false, '{{EMPLOYEE_NAME}}');
    emit();
  }

  const btn =
    'rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:border-slate-400';

  return (
    <div className="rounded border border-slate-300">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-white p-2">
        <button type="button" className={btn} onClick={() => exec('bold')}><b>B</b></button>
        <button type="button" className={btn} onClick={() => exec('italic')}><i>I</i></button>
        <button type="button" className={btn} onClick={() => exec('underline')}><u>U</u></button>
        <button type="button" className={btn} onClick={() => exec('insertUnorderedList')}>• List</button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            const url = prompt('Link URL');
            if (url) exec('createLink', url);
          }}
        >
          Link
        </button>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <button type="button" className={btn} onClick={insertTrackingLink}>
          + Tracking link
        </button>
        <button type="button" className={btn} onClick={insertName}>
          + Employee name
        </button>
        <span className="ml-auto" />
        <button
          type="button"
          className={btn}
          onClick={() => {
            if (mode === 'html' && ref.current) onChange(ref.current.innerHTML);
            setMode(mode === 'visual' ? 'html' : 'visual');
          }}
        >
          {mode === 'visual' ? '</> HTML' : 'Visual'}
        </button>
      </div>

      {mode === 'visual' ? (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          className="min-h-[220px] bg-white p-3 text-sm text-black outline-none"
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[220px] w-full bg-white p-3 font-mono text-xs text-slate-700 outline-none"
        />
      )}

      {!value.includes('{{TRACKING_URL}}') && (
        <p className="border-t border-slate-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
          Add a tracking link — the body must contain {'{{TRACKING_URL}}'} so clicks are measured.
        </p>
      )}
    </div>
  );
}
