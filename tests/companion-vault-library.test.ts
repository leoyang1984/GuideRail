import { beforeEach, expect, it } from 'vitest';
import { CompanionVaultLibrary, type VaultStorage } from '../packages/obsidian-plugin/src/vault-library';

class MemoryVault implements VaultStorage {
  files = new Map<string, string | ArrayBuffer>(); folders = new Set<string>();
  failIndexOnce = false;
  async exists(path: string) { return this.files.has(path) || this.folders.has(path); }
  async read(path: string) { const value = this.files.get(path); if (typeof value !== 'string') throw new Error('Missing text'); return value; }
  async write(path: string, data: string) { if (this.failIndexOnce && path.endsWith('/index.json')) { this.failIndexOnce = false; throw new Error('disk full'); } this.files.set(path, data); }
  async readBinary(path: string) { const value = this.files.get(path); if (!(value instanceof ArrayBuffer)) throw new Error('Missing binary'); return value; }
  async writeBinary(path: string, data: ArrayBuffer) { this.files.set(path, data); }
  async mkdir(path: string) { this.folders.add(path); }
  async remove(path: string) { this.files.delete(path); this.folders.delete(path); }
  async rename(from: string, to: string) {
    if (this.files.has(from)) { this.files.set(to, this.files.get(from)!); this.files.delete(from); return; }
    const children = [...this.files.entries()].filter(([path]) => path.startsWith(`${from}/`)); for (const [path, value] of children) { this.files.set(`${to}${path.slice(from.length)}`, value); this.files.delete(path); }
    this.folders.delete(from); this.folders.add(to);
  }
  async list(path: string) {
    const prefix = path ? `${path}/` : ''; const files = [...this.files.keys()].filter(item => item.startsWith(prefix) && !item.slice(prefix.length).includes('/'));
    const folders = [...this.folders].filter(item => item.startsWith(prefix) && !item.slice(prefix.length).includes('/'));
    return { files, folders };
  }
}
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=';
const request = { capture: { conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', role: 'assistant', text: '标题\n正文', markdown: '# 标题\n正文', images: [{ data: png }] }, notebook: '收件箱' };
let vault: MemoryVault; let library: CompanionVaultLibrary;
beforeEach(() => { vault = new MemoryVault(); library = new CompanionVaultLibrary(vault, 'GuideRail'); });

it('saves an idempotent Markdown capture and local image without overwriting it', async () => {
  const entry = await library.saveCapture(request); const duplicate = await library.saveCapture({ ...request, capture: { ...request.capture, text: 'changed' } });
  expect(duplicate.id).toBe(entry.id); expect((await library.list()).entries).toHaveLength(1);
  const content = await library.readEntry(entry.id); expect(content.markdown).toContain('# 标题'); expect(content.images).toEqual([{ name: '0.png', data: png }]);
});
it('renames, moves, hides and restores through domain operations', async () => {
  const entry = await library.saveCapture(request); await library.renameEntry(entry.id, '新标题'); await library.moveEntry(entry.id, '参考');
  expect((await library.list()).entries[0]).toMatchObject({ title: '新标题', notebook: '参考' });
  const token = await library.hideEntry(entry.id); expect((await library.list()).entries[0].hidden).toBe(true);
  await expect(library.restoreEntry(entry.id, 'wrong')).rejects.toThrow(); await library.restoreEntry(entry.id, token);
  expect((await library.list()).entries[0].hidden).toBeUndefined();
});
it('rejects unsafe vault and notebook paths', async () => {
  expect(() => new CompanionVaultLibrary(vault, '../Vault')).toThrow();
  await expect(library.createNotebook('../private')).rejects.toThrow();
  await expect(library.saveCapture({ ...request, notebook: 'a/b' })).rejects.toThrow();
});
it('rebuilds its index from owned Markdown notes', async () => {
  const entry = await library.saveCapture(request); vault.files.delete('GuideRail/.guiderail/index.json');
  expect(await library.rebuildIndex()).toBe(1); expect((await library.list()).entries[0].id).toBe(entry.id);
});
it('recovers a committed note after an interrupted index update', async () => {
  vault.failIndexOnce = true; await expect(library.saveCapture(request)).rejects.toThrow('index update failed');
  const entry = await library.saveCapture(request); expect((await library.list()).entries).toHaveLength(1);
  expect(vault.files.has(`GuideRail/.guiderail/pending-${entry.id}.json`)).toBe(false);
});
it('rejects an externally corrupted index before following its paths', async () => {
  vault.folders.add('GuideRail'); vault.folders.add('GuideRail/.guiderail');
  vault.files.set('GuideRail/.guiderail/index.json', JSON.stringify({ version: 1, entries: [{ id: 'a'.repeat(64), title: 'bad', notebook: '../private', filename: `${'a'.repeat(64)}.md`, createdAt: '2026-09-16T00:00:00Z', conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', images: [] }] }));
  await expect(library.list()).rejects.toThrow();
});
it('imports exact existing Markdown idempotently and refuses divergent content', async () => {
  const importedEntry = { id: 'b'.repeat(64), title: '旧收藏', notebook: '资料', filename: `${'b'.repeat(64)}.md`, createdAt: '2026-09-01T00:00:00Z', conversationId: 'old-chat', messageId: 'old-message', pageUrl: 'https://chatgpt.com/c/old-chat', images: [] };
  const payload = { entry: importedEntry, markdown: '---\ntitle: "旧收藏"\n---\n\n原始正文\n', images: [] };
  expect(await library.importEntry(payload)).toEqual(importedEntry); expect(await library.importEntry(payload)).toEqual(importedEntry);
  await expect(library.importEntry({ ...payload, markdown: `${payload.markdown}changed` })).rejects.toThrow('conflicts');
  expect(await vault.files.get(`GuideRail/资料/${importedEntry.filename}`)).toBe(payload.markdown);
});
it('resumes an import after its index commit was interrupted', async () => {
  const importedEntry = { id: 'c'.repeat(64), title: '恢复', notebook: '收件箱', filename: `${'c'.repeat(64)}.md`, createdAt: '2026-09-01T00:00:00Z', conversationId: 'recover', messageId: 'message', pageUrl: 'https://chatgpt.com/c/recover', images: [] };
  const payload = { entry: importedEntry, markdown: '# 恢复', images: [] }; vault.failIndexOnce = true;
  await expect(library.importEntry(payload)).rejects.toThrow('disk full'); expect(await library.importEntry(payload)).toEqual(importedEntry);
  expect(vault.files.has(`GuideRail/.guiderail/import-${importedEntry.id}.json`)).toBe(false);
});
it('supports using the vault root directly when rootFolder is blank', async () => {
  const rootLibrary = new CompanionVaultLibrary(vault, '');
  const entry = await rootLibrary.saveCapture(request);
  expect(vault.files.has(`.guiderail/index.json`)).toBe(true);
  expect(vault.files.has(`收件箱/${entry.filename}`)).toBe(true);
  expect((await rootLibrary.list()).entries).toHaveLength(1);
});
