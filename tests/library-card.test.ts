// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryCard, noteExcerpt, shortTitle } from '../src/sidepanel/components/LibraryCard';
import type { Entry } from '../src/library/library';
import type { LibraryBackend, LibraryPreview } from '../src/library/backend';
let host: HTMLDivElement; let reactRoot: Root; let observe: (items: { isIntersecting: boolean }[]) => void;
const entry: Entry = { id: 'a'.repeat(64), filename: `${'a'.repeat(64)}.md`, title: '原始标题', notebook: '收件箱', conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', createdAt: '2026-09-09T00:00:00Z', images: ['0.png'] };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('IntersectionObserver', class { constructor(fn: typeof observe) { observe = fn; } observe() {} disconnect() {} });
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:local-preview'), revokeObjectURL: vi.fn() });
  host = document.createElement('div'); document.body.append(host); reactRoot = createRoot(host);
});
afterEach(async () => { await act(async () => reactRoot.unmount()); host.remove(); vi.unstubAllGlobals(); });
function backend(readPreview: (entry: Entry) => Promise<LibraryPreview>) {
  return { readPreview } as unknown as LibraryBackend;
}
it('reads only visible local previews and releases their URLs when leaving view', async () => {
  const readPreview = vi.fn(async () => ({ image: new Blob(['image']) }));
  await act(async () => reactRoot.render(createElement(LibraryCard, { entry, backend: backend(readPreview), onOpen: () => {} })));
  expect(readPreview).not.toHaveBeenCalled();
  await act(async () => observe([{ isIntersecting: true }]));
  expect(readPreview).toHaveBeenCalledWith(entry); expect(host.querySelector('img')?.getAttribute('src')).toBe('blob:local-preview');
  await act(async () => observe([{ isIntersecting: false }]));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview'); expect(host.querySelector('img')).toBeNull();
});
it('does not create an object URL if an image finishes loading after unmount', async () => {
  let resolve!: (file: Blob) => void;
  const pending = new Promise<Blob>(done => { resolve = done; });
  const readPreview = async () => ({ image: await pending });
  await act(async () => reactRoot.render(createElement(LibraryCard, { entry, backend: backend(readPreview), onOpen: () => {} })));
  await act(async () => observe([{ isIntersecting: true }]));
  await act(async () => reactRoot.render(null));
  await act(async () => resolve(new Blob(['image'])));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('reads a bounded text sample and leaves the actual title unchanged', async () => {
  const readPreview = vi.fn(async () => ({ markdown: '---\ntitle: "原始标题"\n---\n\n原始标题\n\n**一段摘要** [来源](https://example.com)' }));
  const textEntry = { ...entry, images: [] };
  await act(async () => reactRoot.render(createElement(LibraryCard, { entry: textEntry, backend: backend(readPreview), onOpen: () => {} })));
  await act(async () => observe([{ isIntersecting: true }]));
  expect(readPreview).toHaveBeenCalledWith(textEntry); expect(host.querySelector('.bookmark-excerpt')?.textContent).toBe('一段摘要 来源');
  expect(entry.title).toBe('原始标题');
  expect(shortTitle('长'.repeat(80))).toBe('长'.repeat(42) + '…');
  expect(noteExcerpt('![图片](attachments/a/0.png)\n正文', '')).toBe('正文');
});

it('preserves existing preview without layout shift when re-rendered with equivalent entry reference', async () => {
  const readPreview = vi.fn(async () => ({ markdown: '正文摘要内容' }));
  const be = backend(readPreview);
  const textEntry = { ...entry, images: [] };
  await act(async () => reactRoot.render(createElement(LibraryCard, { entry: textEntry, backend: be, onOpen: () => {} })));
  await act(async () => observe([{ isIntersecting: true }]));
  expect(readPreview).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.bookmark-excerpt')?.textContent).toBe('正文摘要内容');

  // Re-render with new entry object reference having identical content
  const cloneEntry = { ...textEntry };
  await act(async () => reactRoot.render(createElement(LibraryCard, { entry: cloneEntry, backend: be, onOpen: () => {} })));
  // Should NOT re-fetch or clear excerpt
  expect(readPreview).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.bookmark-excerpt')?.textContent).toBe('正文摘要内容');
});

