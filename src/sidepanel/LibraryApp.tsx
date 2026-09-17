import { LegacyUpgrade } from './components/LegacyUpgrade';
import { LibraryCard } from './components/LibraryCard';
import { LibraryActions } from './components/LibraryActions';
import { CompanionSetup } from './components/CompanionSetup';
import { CompanionMigration } from './components/CompanionMigration';
import { openSource } from './open-source';
import { marked } from 'marked';
import { ReplyBody } from './components/ReplyBody';
import { useEffect, useRef, useState } from 'react';
import { ensureDirectoryPermission, loadDirectory, storeDirectory, type DirectoryPicker, type ExportDirectory } from '../export/directory';
import { LIBRARY_CHANGE, readIndex, write, type Entry, type RemovedEntry } from '../library/library';
import { directoryLibraryBackend, libraryBackend } from '../library/backend';
import { getLibraryBackendMode, type LibraryBackendMode } from '../library/backend';
import { COMPANION_CONNECTION_KEY, LIBRARY_BACKEND_KEY } from '../companion/client';
import { ChromeStorageRepository } from '../storage/storage';
import type { GuideRailStorage } from '../storage/schema';
import { useI18n } from '../i18n';

const THEMES = [
  { id: 'system', nameKey: 'themeSystem' as const, icon: '💻' },
  { id: 'red-dark', nameKey: 'themeRedDark' as const, icon: '🐻' },
  { id: 'red-light', nameKey: 'themeRedLight' as const, icon: '📄' },
  { id: 'nord', nameKey: 'themeNord' as const, icon: '❄️' },
  { id: 'solarized', nameKey: 'themeSolarized' as const, icon: '📜' },
] as const;

function areEntriesEqual(prev: Entry[], next: Entry[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) {
    const a = prev[i], b = next[i];
    if (a.id !== b.id || a.title !== b.title || a.notebook !== b.notebook || a.createdAt !== b.createdAt || a.filename !== b.filename || a.hidden !== b.hidden) return false;
    if (a.images.length !== b.images.length) return false;
    for (let j = 0; j < a.images.length; j++) if (a.images[j] !== b.images[j]) return false;
  }
  return true;
}

function areStringArraysEqual(prev: string[], next: string[]): boolean {
  if (prev === next) return true;
  if (prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i++) if (prev[i] !== next[i]) return false;
  return true;
}

export function LibraryApp() {
  const { setting, setLanguage, t } = useI18n();
  const [theme, setTheme] = useState<string>('system');
  const [root, setRoot] = useState<ExportDirectory | null>(null);
  const [backendMode, setBackendMode] = useState<LibraryBackendMode>('directory');
  const [backendName, setBackendName] = useState(''); const [backendError, setBackendError] = useState('');
  const [ready, setReady] = useState(false); const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folderFilter, setFolderFilter] = useState('');
  const folderFilterInitialized = useRef(false);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [removed, setRemoved] = useState<RemovedEntry | null>(null);
  const [body, setBody] = useState(''); const [images, setImages] = useState<string[]>([]);
  const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  const [legacy, setLegacy] = useState<GuideRailStorage | null>(null);
  const [savedNotebooks, setSavedNotebooks] = useState<string[]>([]);
  const [listError, setListError] = useState('');
  const [actionError, setActionError] = useState('');
  const [legacyError, setLegacyError] = useState('');
  const [readError, setReadError] = useState('');
  const [reading, setReading] = useState(false); const [readRevision, setReadRevision] = useState(0);
  const revision = useRef(0); const previousRoot = useRef<ExportDirectory | null>(null); const previousMode = useRef<LibraryBackendMode | null>(null);
  const actionLock = useRef(false);

  useEffect(() => {
    void chrome.storage?.local?.get(['guiderail-theme', 'guiderail-folder-filter']).then(res => {
      const val = (res?.['guiderail-theme'] as string) || 'system';
      setTheme(val);
      if (val && val !== 'system') {
        document.body.setAttribute('data-theme', val);
      } else {
        document.body.removeAttribute('data-theme');
      }
      const savedFilter = (res?.['guiderail-folder-filter'] as string) ?? '';
      setFolderFilter(savedFilter);
      folderFilterInitialized.current = true;
    }).catch(() => { folderFilterInitialized.current = true; });
  }, []);

  function handleSetTheme(next: string) {
    setTheme(next);
    if (next && next !== 'system') {
      document.body.setAttribute('data-theme', next);
    } else {
      document.body.removeAttribute('data-theme');
    }
    void chrome.storage?.local?.set({ 'guiderail-theme': next });
  }

  function cycleTheme() {
    const ids = THEMES.map(th => th.id);
    const nextIdx = (ids.indexOf(theme as (typeof ids)[number]) + 1) % ids.length;
    handleSetTheme(ids[nextIdx]);
  }
  function handleSetFolderFilter(next: string) {
    setFolderFilter(next);
    void chrome.storage?.local?.set({ 'guiderail-folder-filter': next });
  }
  async function refresh() {
    const request = ++revision.current;
    try {
      const mode = await getLibraryBackendMode(); const directory = mode === 'directory' ? await directoryLibraryBackend.rememberedDirectory() : null;
      const sameDirectory = directory === previousRoot.current || !!(directory && previousRoot.current && await directory.isSameEntry(previousRoot.current));
      const same = mode === previousMode.current && sameDirectory;
      const status = await libraryBackend.status();
      const granted = status.available;
      if (request !== revision.current) return;
      if (!same) { setSelected(null); setRemoved(null); setEntries([]); setSavedNotebooks([]); previousRoot.current = directory; previousMode.current = mode; setRoot(directory); }
      setBackendMode(mode); setBackendName(status.name ?? ''); setBackendError(status.error ?? '');
      setReady(granted);
      if (!granted || (mode === 'directory' && !directory)) { setEntries([]); setListError(''); return; }
      const index = await libraryBackend.list();
      if (request !== revision.current) return;
      setEntries(prev => areEntriesEqual(prev, index.entries) ? prev : index.entries);
      setSavedNotebooks(prev => areStringArraysEqual(prev, index.notebooks ?? []) ? prev : (index.notebooks ?? []));
      setListError('');
    } catch {
      if (request === revision.current) setListError(t('listLoadError'));
    } finally { if (request === revision.current) setLoading(false); }
  }
  async function refreshLegacy() {
    try { const data = await new ChromeStorageRepository().read(); setLegacy(Object.keys(data.sources).length || Object.keys(data.projects).length ? data : null); setLegacyError(''); }
    catch { setLegacyError(t('legacyReadError')); }
  }
  useEffect(() => {
    void refresh(); void refreshLegacy();
    const update = () => { if (!actionLock.current && document.visibilityState === 'visible') void refresh(); };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if (LIBRARY_CHANGE in changes && !actionLock.current) void refresh();
      if ('guiderail' in changes && !actionLock.current) void refreshLegacy();
    };
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update); document.addEventListener('visibilitychange', update);
    chrome.storage.onChanged.addListener(changed);
    return () => { revision.current++; clearInterval(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update); chrome.storage.onChanged.removeListener(changed); };
  }, []);
  useEffect(() => {
    let active = true; const urls: string[] = []; setBody(''); setImages([]); setReadError(''); setReading(!!selected && ready);
    if (selected && ready) void (async () => {
      const content = await libraryBackend.readEntry(selected);
      if (active) setBody(content.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim());
      for (const blob of content.images) { if (!active) return; urls.push(URL.createObjectURL(blob)); }
      if (active) setImages([...urls]);
    })().catch(() => { if (active) setReadError(t('readErrorDetail')); }).finally(() => { if (active) setReading(false); });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [selected, ready, readRevision]);
  async function action(task: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setNotice(''); setActionError('');
    try { await task(); } catch (error) { setActionError(error instanceof Error ? error.message : t('actionFailed')); }
    finally { actionLock.current = false; setBusy(false); await refresh(); }
  }
  async function choose() {
    const picker = (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
    let directory: ExportDirectory;
    try {
      if (!picker) throw new DOMException('Directory picker unavailable', 'SecurityError');
      directory = await picker({ mode: 'readwrite', id: 'guiderail-library' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') { setNotice(t('selectionCancelled')); return; }
      if (error instanceof DOMException && error.name === 'SecurityError' && new URLSearchParams(location.search).get('view') !== 'settings') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('src/sidepanel/index.html?view=settings') });
        setNotice(t('openSettingsNotice')); return;
      }
      throw new Error(t('folderPickerError'));
    }
    await navigator.locks.request('guiderail-library', async () => {
      await readIndex(directory);
      const meta = await directory.getDirectoryHandle('.guiderail', { create: true });
      const probe = `probe-${crypto.randomUUID()}`; await write(meta, probe, ''); await meta.removeEntry(probe);
      await directory.getDirectoryHandle('收件箱', { create: true });
      const previous = await loadDirectory('library-directory');
      await storeDirectory(directory, 'library-directory');
      try { await chrome.storage.local.set({ [LIBRARY_BACKEND_KEY]: 'directory', 'guiderail-library-target': crypto.randomUUID(), [LIBRARY_CHANGE]: crypto.randomUUID() }); }
      catch (error) { await storeDirectory(previous, 'library-directory'); throw error; }
    });
    setRemoved(null); setSelected(null); setFolderFilter(''); await refresh();
  }
  async function useDirectory() { await chrome.storage.local.set({ [LIBRARY_BACKEND_KEY]: 'directory', 'guiderail-library-target': crypto.randomUUID(), [LIBRARY_CHANGE]: crypto.randomUUID() }); await refresh(); }
  async function configureCompanion() { await chrome.storage.local.remove(COMPANION_CONNECTION_KEY); await chrome.storage.local.set({ [LIBRARY_BACKEND_KEY]: 'companion', 'guiderail-library-target': crypto.randomUUID(), [LIBRARY_CHANGE]: crypto.randomUUID() }); await refresh(); }
  const notebooks = Array.from(new Set(['收件箱', ...savedNotebooks, ...entries.map(e => e.notebook)]));
  return <main className="reader-app" data-theme={theme !== 'system' ? theme : undefined}><header className="app-header"><h1><span className="brand-mark">G</span>GuideRail</h1>{!selected && <div className="app-header-right"><span className="app-tagline">{t('tagline')}</span>{ready && <button type="button" className="theme-quick-btn" title={t('themeButtonTitle')} onClick={cycleTheme}>🎨 {THEMES.find(th => th.id === theme) ? t(THEMES.find(th => th.id === theme)!.nameKey) : t('themeButtonLabel')}</button>}</div>}</header>
    {loading ? <p>{t('loadingLibrary')}</p> : <>
      {!ready ? backendMode === 'companion' ? <CompanionSetup busy={busy} error={backendError} action={action} onConnected={async name => { await refresh(); setNotice(t('companionConnectedNotice', { name })); }} onUseDirectory={useDirectory} onRetry={refresh} configuredVault={backendName || undefined} /> : listError ? <div role="alert" className="library-feedback error">{listError}<button disabled={busy} onClick={() => void refresh()}>{t('retry')}</button></div> : <section className="library-setup">
        {root ? <><h2>{t('permissionPromptTitle')}</h2><p>{t('permissionPromptDesc')}</p>
          <button className="primary" autoFocus disabled={busy} onClick={() => void action(async () => { if (!await ensureDirectoryPermission(root)) throw new Error(t('permissionDeniedRetry')); await refresh(); })}>{t('allowAccess', { name: root.name })}</button>
          <button disabled={busy} onClick={() => void configureCompanion()}>{t('connectObsidianRecommended')}</button>
          <details><summary>{t('folderMovedQuestion')}</summary><button disabled={busy} onClick={() => void action(choose)}>{t('reselectFolder')}</button></details>
        </> : <><h2>{t('whereToSave')}</h2><p>{t('whereToSaveDesc')}</p>
          <button className="primary" disabled={busy} onClick={() => void configureCompanion()}>{t('connectObsidianRecommended')}</button>
          <button className="primary" disabled={busy} onClick={() => void action(choose)}>{t('selectFolderButton')}</button>
        </>}
      </section> : <>
        {!selected && <>
        <details className="data-settings bear-drawer"><summary className="bear-settings-btn"><span className="settings-summary-left"><span className="settings-icon" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg></span><span className="settings-title">{t('settings')}</span></span><span className="settings-summary-right"><span className="settings-summary-value">{backendMode === 'companion' ? backendName : root?.name}</span><span className="settings-chevron" aria-hidden="true"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg></span></span></summary>
          <div className="settings-body">
            <div className="bear-drawer-row">
              <div className="bear-drawer-info">
                <span className="bear-drawer-title">{t('appearance')}</span>
                <span className="bear-drawer-desc">{t('appearanceDesc')}</span>
              </div>
              <div className="theme-toggle-pills">
                {THEMES.map(th => (
                  <button
                    type="button"
                    key={th.id}
                    className={`theme-pill ${theme === th.id ? 'active' : ''}`}
                    onClick={() => handleSetTheme(th.id)}
                  >
                    {th.icon} {t(th.nameKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="bear-drawer-divider"></div>
            <div className="bear-drawer-row">
              <div className="bear-drawer-info">
                <span className="bear-drawer-title">{t('language')}</span>
                <span className="bear-drawer-desc">{t('languageDesc')}</span>
              </div>
              <div className="theme-toggle-pills">
                <button
                  type="button"
                  className={`theme-pill ${setting === 'auto' ? 'active' : ''}`}
                  onClick={() => setLanguage('auto')}
                >
                  {t('langAuto')}
                </button>
                <button
                  type="button"
                  className={`theme-pill ${setting === 'zh' ? 'active' : ''}`}
                  onClick={() => setLanguage('zh')}
                >
                  {t('langZh')}
                </button>
                <button
                  type="button"
                  className={`theme-pill ${setting === 'en' ? 'active' : ''}`}
                  onClick={() => setLanguage('en')}
                >
                  {t('langEn')}
                </button>
              </div>
            </div>
            {backendMode === 'companion' && <><div className="bear-drawer-divider"></div><CompanionMigration busy={busy} action={action} onComplete={async message => { setNotice(message); await refresh(); }} /></>}
            <div className="bear-drawer-divider"></div>
            <div className="bear-drawer-row">
              <div className="bear-drawer-info">
                <span className="bear-drawer-title">{backendMode === 'companion' ? t('obsidianVault') : t('localFolder')}</span>
                <span className="bear-drawer-val">{backendMode === 'companion' ? backendName : root?.name}</span>
                <span className="bear-drawer-desc">{backendMode === 'companion' ? t('obsidianDesc') : t('folderDesc')}</span>
              </div>
              {backendMode === 'companion' ? <><button className="bear-action-btn" disabled={busy} onClick={() => void configureCompanion()}>{t('rePair')}</button><button className="bear-action-btn" disabled={busy} onClick={() => void useDirectory()}>{t('useFolder')}</button></> : <><button className="bear-action-btn" disabled={busy} onClick={() => void action(choose)}>{t('changeFolder')}</button><button className="bear-action-btn" disabled={busy} onClick={() => void configureCompanion()}>{t('connectObsidian')}</button></>}
            </div>
            <div className="bear-drawer-divider"></div>
            <div className="bear-drawer-row">
              <div className="bear-drawer-info">
                <span className="bear-drawer-title">{t('maintenance')}</span>
                <span className="bear-drawer-desc">{t('maintenanceDesc')}</span>
              </div>
              <button className="bear-action-btn" disabled={busy} onClick={() => void action(async () => { const count = await libraryBackend.rebuildIndex(); await refresh(); setNotice(t('rebuildSuccess', { count })); })}>{t('rebuildIndex')}</button>
            </div>
            <p className="settings-footnote">{t('backupFootnote')}</p>
          </div>
        </details>
        {legacyError && <div className="library-feedback error" role="alert">{legacyError}<button disabled={busy} onClick={() => void refreshLegacy()}>{t('retryLegacy')}</button></div>}
        {legacy && backendMode === 'directory' && <LegacyUpgrade count={Object.keys(legacy.sources).length} busy={busy} action={action} onComplete={async () => { setLegacy(null); setNotice(t('legacyUpgradeComplete')); }} />}

        </>}
        {!selected && <div className="bear-filter-bar"><div className="section-heading"><h2>{t('bookmarks')}</h2></div>{notebooks.length > 1 && <div className="bear-filter-control"><div className="bear-tags"><button type="button" className={`bear-tag-pill ${folderFilter === '' ? 'active' : ''}`} onClick={() => handleSetFolderFilter('')}>{t('tagAll')}</button>{notebooks.map(name => <button type="button" key={name} className={`bear-tag-pill ${folderFilter === name ? 'active' : ''}`} onClick={() => handleSetFolderFilter(name)}>#{name}</button>)}</div><label className="library-location visually-hidden-select">{t('filterFolder')}<select aria-label={t('filterFolder')} value={folderFilter} onChange={e => handleSetFolderFilter(e.target.value)}><option value="">{t('allBookmarks')}</option>{notebooks.map(name => <option key={name}>{name}</option>)}</select></label></div>}</div>}
        {listError && <div className="library-feedback error" role="alert">{listError}<button disabled={busy} onClick={() => void refresh()}>{t('retry')}</button></div>}
        {removed && <div className="library-undo" role="status"><span>{t('undoRemoved')}</span><button disabled={busy} onClick={() => void action(async () => { await libraryBackend.restoreEntry(removed); setRemoved(null); await refresh(); })}>{t('undo')}</button></div>}
        {selected ? <><div className="reading-tools"><button type="button" className="back-button" onClick={() => setSelected(null)}>{t('back')}</button><button type="button" className="reading-origin-btn" disabled={busy} onClick={() => void action(async () => { setNotice(await openSource({ ...selected, role: 'assistant', text: body, updatedAt: selected.createdAt })); })}>{t('jumpToSource')}</button><LibraryActions key={selected.id} entry={selected} notebooks={notebooks} busy={busy} action={action} backend={libraryBackend}
          onRenamed={async title => { setSelected({ ...selected, title }); await refresh(); }}
          onMoved={async () => { setSelected(null); await refresh(); }}
          onRemoved={async removal => { setRemoved(removal); setSelected(null); await refresh(); }} /></div><h2 className="reading-title">{selected.title}</h2>{reading && <p role="status">{t('reading')}</p>}{readError && <div className="library-feedback error" role="alert">{readError}<button disabled={busy || reading} onClick={() => setReadRevision(value => value + 1)}>{t('retryRead')}</button></div>}<ReplyBody text={body} html={marked.parse(body, { async: false })} localImages={Object.fromEntries(images.map((url, i) => [`attachments/${selected.id}/${selected.images[i]}`, url]))} /></> : <>
          {!listError && !entries.some(e => !e.hidden && (!folderFilter || e.notebook === folderFilter)) && <p className="empty-state">{folderFilter ? t('emptyFolder') : t('emptyAll')}</p>}
          {!listError && entries.filter(e => !e.hidden && (!folderFilter || e.notebook === folderFilter)).slice().reverse().map(entry => <LibraryCard key={entry.id} entry={entry} backend={libraryBackend} onOpen={() => { setNotice(''); setActionError(''); setSelected(entry); }} />)}
        </>}
      </>}
    </>}{busy && <p role="status">{t('processing')}</p>}{notice && <p role="status" className="library-notice">{notice}</p>}{actionError && <p role="alert" className="error">{actionError}</p>}</main>;
}
