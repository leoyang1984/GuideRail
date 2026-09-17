import { useEffect, useRef, useState } from 'react';
import type { Entry } from '../../library/library';
import type { LibraryBackend } from '../../library/backend';
import { useI18n } from '../../i18n';

export function shortTitle(title: string, limit = 42) {
  const value = title.replace(/\s+/g, ' ').trim();
  return Array.from(value).length > limit ? Array.from(value).slice(0, limit).join('') + '…' : value;
}

export function noteExcerpt(markdown: string, title: string) {
  const text = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '').replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+)/gm, '').replace(/[`*_~]/g, '').trim();
  const body = text.startsWith(title.trim()) ? text.slice(title.trim().length).trim() : text;
  return shortTitle(body, 100);
}

export function LibraryCard({ entry, backend, onOpen }: { entry: Entry; backend: LibraryBackend; onOpen(): void }) {
  const { locale, t } = useI18n();
  const anchor = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [preview, setPreview] = useState(''); const [excerpt, setExcerpt] = useState(''); const [failed, setFailed] = useState(false);
  const firstImage = entry.images[0];
  useEffect(() => {
    if (!anchor.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([item]) => setVisible(item.isIntersecting), { rootMargin: '160px' });
    observer.observe(anchor.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true; let url: string | undefined;
    if (!visible) {
      setPreview('');
      setExcerpt('');
      setFailed(false);
      return;
    }
    void (async () => {
      try {
        const result = await backend.readPreview(entry);
        if (!active) return;
        if (result.image) {
          url = URL.createObjectURL(result.image);
          setPreview(url);
          setFailed(false);
        } else if (result.markdown !== undefined) {
          setExcerpt(noteExcerpt(result.markdown, entry.title));
          setFailed(false);
        }
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [visible, backend, entry.id, entry.title, entry.filename, entry.notebook, firstImage]);
  return <div className="bookmark-row" ref={anchor}><button className="bookmark-open library-card" onClick={onOpen} title={entry.title}>
    {firstImage && <span className="library-thumbnail" aria-hidden="true">{preview && !failed ? <img src={preview} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span>{failed ? t('previewUnavailable') : t('image')}</span>}</span>}
    <span className="library-card-text"><strong>{shortTitle(entry.title)}</strong>{excerpt && <span className="bookmark-excerpt">{excerpt}</span>}
      {failed && !firstImage && <span className="bookmark-excerpt">{t('excerptUnavailable')}</span>}
      <small>{entry.notebook} · {new Date(entry.createdAt).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US')}{entry.images.length ? ` · ${t('imagesCount', { count: entry.images.length })}` : ''}</small>
    </span></button></div>;
}
