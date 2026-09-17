import { useEffect, useRef, useState } from 'react';
import type { Entry, RemovedEntry } from '../../library/library';
import type { LibraryBackend } from '../../library/backend';
import { useI18n } from '../../i18n';

type Panel = 'rename' | 'move' | 'details' | null;
export function LibraryActions({ entry, notebooks, busy, action, backend, onRenamed, onMoved, onRemoved }: {
  entry: Entry; notebooks: string[]; busy: boolean;
  backend: LibraryBackend;
  action(task: () => Promise<void>): Promise<void>;
  onRenamed(title: string): Promise<void>; onMoved(): Promise<void>; onRemoved(removed: RemovedEntry): Promise<void>;
}) {
  const { t } = useI18n();
  const menu = useRef<HTMLDetailsElement>(null); const form = useRef<HTMLDivElement>(null);
  const [panel, setPanel] = useState<Panel>(null); const [title, setTitle] = useState(entry.title);
  const [target, setTarget] = useState(entry.notebook); const [newFolder, setNewFolder] = useState('');
  const close = () => { setPanel(null); if (menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } };
  useEffect(() => { if (panel) form.current?.querySelector<HTMLElement>('input,select,button')?.focus(); }, [panel]);
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menu.current?.open && !menu.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, []);
  return <details className="reply-more library-actions" ref={menu} onToggle={event => { if (!event.currentTarget.open) setPanel(null); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <summary aria-label={t('moreActions')} title={t('moreActions')}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></summary>
    {!panel ? <div className="library-menu">
      <button type="button" disabled={busy} onClick={() => { setTitle(entry.title); setPanel('rename'); }}>{t('rename')}</button>
      <button type="button" disabled={busy} onClick={() => { setTarget(entry.notebook); setNewFolder(''); setPanel('move'); }}>{t('move')}</button>
      <button type="button" className="danger-action" disabled={busy} onClick={() => void action(async () => { const removed = await backend.hideEntry(entry.id); await onRemoved(removed); })}>{t('remove')}</button>
      <button type="button" onClick={() => setPanel('details')}>{t('details')}</button>
    </div> : <div className="library-action-panel" ref={form}>
      {panel === 'rename' && <form onSubmit={event => { event.preventDefault(); void action(async () => { await backend.renameEntry(entry.id, title); await onRenamed(title.trim()); close(); }); }}>
        <label>{t('titleLabel')}<input maxLength={240} value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>
        <div className="panel-actions">
          <button type="button" disabled={busy} onClick={close}>{t('close')}</button>
          <button type="submit" className="primary" disabled={busy || !title.trim()}>{t('save')}</button>
        </div>
      </form>}
      {panel === 'move' && <form onSubmit={event => { event.preventDefault(); void action(async () => { const destination = target || await backend.createNotebook(newFolder); await backend.moveEntry(entry.id, destination); await onMoved(); }); }}>
        <label>{t('folderLabel')}<select value={target} disabled={busy} onChange={event => setTarget(event.target.value)}>{notebooks.map(name => <option key={name}>{name}</option>)}<option value="">{t('newFolder')}</option></select></label>
        {!target && <label>{t('newFolderName')}<input maxLength={80} value={newFolder} disabled={busy} onChange={event => setNewFolder(event.target.value)} /></label>}
        <div className="panel-actions">
          <button type="button" disabled={busy} onClick={close}>{t('close')}</button>
          <button type="submit" className="primary" disabled={busy || target === entry.notebook || (!target && !newFolder.trim())}>{t('move')}</button>
        </div>
      </form>}
      {panel === 'details' && <div className="details-info">
        <p className="muted">{t('detailsLocation', { notebook: entry.notebook })}</p>
        <p className="muted">{t('detailsFile', { filename: entry.filename })}</p>
        <div className="panel-actions">
          <button type="button" disabled={busy} onClick={close}>{t('close')}</button>
        </div>
      </div>}
    </div>}
  </details>;
}
