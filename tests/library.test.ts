import { beforeEach, expect, it, vi } from 'vitest';
import type { Capture } from '../src/storage/schema';
const state = vi.hoisted(() => ({ root: null as unknown, sets: [] as unknown[], target: 'target' }));
vi.mock('../src/export/directory', async original => ({ ...await original<typeof import('../src/export/directory')>(), loadDirectory: async () => state.root }));
import { createNotebook, hideEntry, imageBlob, moveEntry, notebookName, readIndex, rebuildIndex, saveCapture } from '../src/library/library';
import { DirectoryLibraryBackend } from '../src/library/backend';
class Dir {
  kind = 'directory'; files = new Map<string, Blob>(); dirs = new Map<string, Dir>(); denied = false; fail = '';
  constructor(public name = '库') {}
  async isSameEntry(other: unknown) { return this === other; }
  async queryPermission() { return this.denied ? 'denied' : 'granted'; }
  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<Dir> {
    if (!this.dirs.has(name)) { if (!options?.create) throw new DOMException('missing', 'NotFoundError'); this.dirs.set(name, new Dir(name)); }
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    if (!this.files.has(name)) { if (!options?.create) throw new DOMException('missing', 'NotFoundError'); this.files.set(name, new Blob()); }
    return { kind: 'file', name, getFile: async () => this.files.get(name)!, createWritable: async () => {
      let content = this.files.get(name)!;
      return { write: async (data: string | Blob) => { if (this.fail === name) throw new Error('disk full'); content = new Blob([data]); }, close: async () => { this.files.set(name, content); }, abort: async () => {} };
    } };
  }
  async removeEntry(name: string) { this.files.delete(name); if (this.dirs.has(name)) { if (this.dirs.get(name)!.files.size) throw new Error('not empty'); this.dirs.delete(name); } }
  async *values() { for (const name of this.files.keys()) yield { name, kind: 'file' }; for (const dir of this.dirs.values()) yield dir; }
}
let root: Dir;
const capture: Capture = { conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', role: 'assistant', text: '正文', markdown: '# 正文' };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=';
beforeEach(() => {
  root = new Dir(); state.root = root; state.sets = []; state.target = 'target';
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => unknown) => callback() } });
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'guiderail-library-target': state.target }), set: async (data: unknown) => { state.sets.push(data); } } } });
});
it('requires a configured, authorized directory and never falls back to browser storage', async () => {
  state.root = null; await expect(saveCapture(capture, '收件箱')).rejects.toThrow('设置');
  state.root = root; root.denied = true; await expect(saveCapture(capture, '收件箱')).rejects.toThrow('授权'); expect(state.sets).toEqual([]);
});
it('writes Markdown and only a small change notification to Chrome', async () => {
  const entry = await saveCapture(capture, '收件箱');
  expect(await root.dirs.get('收件箱')!.files.get(entry.filename)!.text()).toContain('# 正文');
  expect((await readIndex(root as unknown as FileSystemDirectoryHandle)).entries).toHaveLength(1);
  expect(JSON.stringify(state.sets)).not.toContain('正文');
});
it('exposes directory storage through the library backend contract', async () => {
  const backend = new DirectoryLibraryBackend();
  expect(await backend.status()).toEqual({ configured: true, available: true, name: '库' });
  const entry = await backend.saveCapture(capture, '收件箱');
  expect((await backend.list()).entries).toContainEqual(entry);
  const content = await backend.readEntry(entry);
  expect(content.markdown).toContain('# 正文'); expect(content.images).toEqual([]);
});
it('keeps text previews bounded inside the directory backend', async () => {
  const backend = new DirectoryLibraryBackend(); const entry = await backend.saveCapture(capture, '收件箱');
  root.dirs.get('收件箱')!.files.set(entry.filename, new Blob(['x'.repeat(12000)]));
  expect((await backend.readPreview(entry)).markdown).toHaveLength(8192);
});
it('does not overwrite external edits on a duplicate capture', async () => {
  const entry = await saveCapture(capture, '收件箱'); const folder = root.dirs.get('收件箱')!;
  folder.files.set(entry.filename, new Blob(['my edited note']));
  await saveCapture({ ...capture, text: 'new text' }, '另一个笔记本');
  expect(await folder.files.get(entry.filename)!.text()).toBe('my edited note');
});
it('writes image-only notes and replaces image markers in their original position', async () => {
  const entry = await saveCapture({ ...capture, text: '', markdown: '前\nGUIDERAILIMAGE0PLACEHOLDER\n后', images: [{ data: png }] }, '图片');
  const folder = root.dirs.get('图片')!;
  expect(await folder.files.get(entry.filename)!.text()).toContain(`前\n![图片 1](attachments/${entry.id}/0.png)\n后`);
  expect(folder.dirs.get('attachments')!.dirs.get(entry.id)!.files.get('0.png')!.size).toBeGreaterThan(0);
});
it('rejects malformed images and changed targets before committing a note', async () => {
  expect(() => imageBlob('data:image/png;base64,SGVsbG8=')).toThrow();
  await expect(saveCapture({ ...capture, images: [{ data: 'https://example.com/img.png' }] }, '收件箱')).rejects.toThrow();
  await expect(saveCapture(capture, '收件箱', undefined, 'old-target')).rejects.toThrow('切换');
  expect(root.dirs.size).toBe(0);
});
it('recovers after a failed index commit without rewriting the saved note', async () => {
  const meta = await root.getDirectoryHandle('.guiderail', { create: true }); meta.fail = 'index.json';
  await expect(saveCapture(capture, '收件箱')).rejects.toThrow('disk full'); meta.fail = '';
  const entry = await saveCapture(capture, '收件箱');
  expect((await readIndex(root as unknown as FileSystemDirectoryHandle)).entries).toHaveLength(1);
  expect(meta.files.has(`pending-${entry.id}.json`)).toBe(false);
});
it('does not claim success for an externally modified pending note', async () => {
  const meta = await root.getDirectoryHandle('.guiderail', { create: true }); meta.fail = 'index.json';
  await expect(saveCapture(capture, '收件箱')).rejects.toThrow(); meta.fail = '';
  const folder = root.dirs.get('收件箱')!; folder.files.set([...folder.files.keys()][0], new Blob(['edited']));
  await expect(saveCapture(capture, '收件箱')).rejects.toThrow('修改');
});
it('rebuilds a corrupted index from durable Markdown without touching notes', async () => {
  const entry = await saveCapture(capture, '收件箱'); const meta = root.dirs.get('.guiderail')!;
  meta.files.set('index.json', new Blob(['broken']));
  expect(await rebuildIndex()).toBe(1);
  expect((await readIndex(root as unknown as FileSystemDirectoryHandle)).entries[0].id).toBe(entry.id);
  expect([...meta.files.keys()].some(name => name.startsWith('index-backup-'))).toBe(true);
});
it('moves note and attachments together, and hiding preserves both', async () => {
  const entry = await saveCapture({ ...capture, images: [{ data: png }] }, '收件箱');
  await moveEntry(entry.id, '参考');
  expect(root.dirs.get('收件箱')!.files.has(entry.filename)).toBe(false);
  expect(root.dirs.get('参考')!.dirs.get('attachments')!.dirs.get(entry.id)!.files.has('0.png')).toBe(true);
  await hideEntry(entry.id);
  expect(root.dirs.get('参考')!.files.has(entry.filename)).toBe(true);
  expect((await readIndex(root as unknown as FileSystemDirectoryHandle)).entries[0].hidden).toBe(true);
  await saveCapture(capture, '收件箱');
  expect((await readIndex(root as unknown as FileSystemDirectoryHandle)).entries[0].hidden).toBeUndefined();
});
it('keeps empty notebooks and rejects unsafe folder names', async () => {
  expect(await createNotebook('设计参考')).toBe('设计参考');
  expect(JSON.stringify(state.sets)).not.toContain('guiderail-notebook');
  expect(JSON.stringify(state.sets)).not.toContain('guiderail-library-target');
  expect((await readIndex(root as unknown as FileSystemDirectoryHandle)).notebooks).toContain('设计参考');
  for (const name of ['../notes', '..', '', 'a/b', 'a\\b']) expect(() => notebookName(name)).toThrow();
});

it('keeps Chrome legacy data when archival backup cannot be committed', async () => {
  const { emptyStorage } = await import('../src/storage/schema'); const { archiveLegacy } = await import('../src/library/migration');
  const legacy = emptyStorage();
  const remove = vi.fn(async () => {});
  chrome.storage.local.get = vi.fn(async () => ({ guiderail: legacy })) as typeof chrome.storage.local.get;
  chrome.storage.local.remove = remove;
  const meta = await root.getDirectoryHandle('.guiderail', { create: true });
  const original = meta.getFileHandle.bind(meta);
  meta.getFileHandle = async (name, options) => { if (name.startsWith('legacy-backup-') && options?.create) throw new Error('disk full'); return original(name, options); };
  await expect(archiveLegacy(legacy)).rejects.toThrow('disk full'); expect(remove).not.toHaveBeenCalled();
});
it('only releases legacy browser data after preserving a complete disk backup', async () => {
  const { emptyStorage } = await import('../src/storage/schema'); const { archiveLegacy } = await import('../src/library/migration');
  const legacy = emptyStorage(); const remove = vi.fn(async () => {});
  chrome.storage.local.get = vi.fn(async () => ({ guiderail: legacy })) as typeof chrome.storage.local.get; chrome.storage.local.remove = remove;
  await archiveLegacy(legacy);
  const meta = root.dirs.get('.guiderail')!; const backup = [...meta.files.entries()].find(([name]) => name.startsWith('legacy-backup-'))![1];
  expect(await backup.text()).toBe(JSON.stringify(legacy)); expect(remove).toHaveBeenCalledWith('guiderail');
});

it('undo restores just the removed index entry and preserves externally edited files', async () => {
  const { restoreEntry } = await import('../src/library/library');
  const first = await saveCapture(capture, '收件箱');
  const second = await saveCapture({ ...capture, messageId: 'second' }, '收件箱');
  const removal = await hideEntry(first.id); await hideEntry(second.id);
  root.dirs.get('收件箱')!.files.set(first.filename, new Blob(['external edit']));
  await restoreEntry(removal);
  const index = await readIndex(root as unknown as FileSystemDirectoryHandle);
  expect(index.entries.find(e => e.id === first.id)?.hidden).toBeUndefined();
  expect(index.entries.find(e => e.id === second.id)?.hidden).toBe(true);
  expect(await root.dirs.get('收件箱')!.files.get(first.filename)!.text()).toBe('external edit');
});
it('rejects stale undo after a newer removal of the same entry', async () => {
  const { restoreEntry } = await import('../src/library/library');
  const entry = await saveCapture(capture, '收件箱'); const old = await hideEntry(entry.id); await hideEntry(entry.id);
  await expect(restoreEntry(old)).rejects.toThrow('再次移出');
});
it('cannot undo a removal in a different library', async () => {
  const { restoreEntry } = await import('../src/library/library');
  const entry = await saveCapture(capture, '收件箱'); const removal = await hideEntry(entry.id);
  state.root = new Dir('其他库');
  await expect(restoreEntry(removal)).rejects.toThrow('原保存文件夹');
});
