import { loadDirectory, type ExportDirectory } from '../export/directory';
import type { Capture } from '../storage/schema';
import { CompanionClient, LIBRARY_BACKEND_KEY, loadCompanionConnection } from '../companion/client';
import {
  createNotebook,
  hideEntry,
  moveEntry,
  readIndex,
  rebuildIndex,
  renameEntry,
  restoreEntry,
  rootDirectory,
  saveCapture,
  type Entry,
  type DirectoryRemovedEntry,
  type LibraryIndex,
  type RemovedEntry,
  LIBRARY_CHANGE,
} from './library';

export interface LibraryStatus {
  configured: boolean;
  available: boolean;
  name?: string;
  error?: string;
}

export interface LibraryEntryContent {
  markdown: string;
  images: Blob[];
}

export interface LibraryPreview {
  markdown?: string;
  image?: Blob;
}

export interface LibraryBackend {
  status(): Promise<LibraryStatus>;
  list(): Promise<LibraryIndex>;
  saveCapture(capture: Capture, notebook: string, preferredTitle?: string, expectedTarget?: string): Promise<Entry>;
  readEntry(entry: Entry): Promise<LibraryEntryContent>;
  readPreview(entry: Entry): Promise<LibraryPreview>;
  createNotebook(name: string): Promise<string>;
  renameEntry(id: string, title: string): Promise<void>;
  moveEntry(id: string, notebook: string): Promise<void>;
  hideEntry(id: string): Promise<RemovedEntry>;
  restoreEntry(removed: RemovedEntry): Promise<void>;
  rebuildIndex(): Promise<number>;
}

export class DirectoryLibraryBackend implements LibraryBackend {
  rememberedDirectory(): Promise<ExportDirectory | null> {
    return loadDirectory('library-directory');
  }

  async status(): Promise<LibraryStatus> {
    const directory = await this.rememberedDirectory();
    return {
      configured: !!directory,
      available: !!directory && await directory.queryPermission({ mode: 'readwrite' }) === 'granted',
      name: directory?.name,
    };
  }

  async list(): Promise<LibraryIndex> {
    return readIndex(await rootDirectory());
  }

  saveCapture(capture: Capture, notebook: string, preferredTitle?: string, expectedTarget?: string): Promise<Entry> {
    return saveCapture(capture, notebook, preferredTitle, expectedTarget);
  }

  async readEntry(entry: Entry): Promise<LibraryEntryContent> {
    const folder = await (await rootDirectory()).getDirectoryHandle(entry.notebook);
    const markdown = await (await (await folder.getFileHandle(entry.filename)).getFile()).text();
    const images: Blob[] = [];
    if (entry.images.length) {
      const directory = await (await folder.getDirectoryHandle('attachments')).getDirectoryHandle(entry.id);
      for (const name of entry.images) images.push(await (await directory.getFileHandle(name)).getFile());
    }
    return { markdown, images };
  }

  async readPreview(entry: Entry): Promise<LibraryPreview> {
    const folder = await (await rootDirectory()).getDirectoryHandle(entry.notebook);
    if (entry.images[0]) {
      const directory = await (await folder.getDirectoryHandle('attachments')).getDirectoryHandle(entry.id);
      return { image: await (await directory.getFileHandle(entry.images[0])).getFile() };
    }
    const file = await (await folder.getFileHandle(entry.filename)).getFile();
    return { markdown: await file.slice(0, 8192).text() };
  }

  createNotebook(name: string): Promise<string> { return createNotebook(name); }
  renameEntry(id: string, title: string): Promise<void> { return renameEntry(id, title); }
  moveEntry(id: string, notebook: string): Promise<void> { return moveEntry(id, notebook); }
  hideEntry(id: string): Promise<DirectoryRemovedEntry> { return hideEntry(id); }
  restoreEntry(removed: RemovedEntry): Promise<void> {
    if (removed.backend !== 'directory') return Promise.reject(new Error('撤销记录不属于当前文件夹'));
    return restoreEntry(removed);
  }
  rebuildIndex(): Promise<number> { return rebuildIndex(); }
}

export class ObsidianLibraryBackend implements LibraryBackend {
  private async client() { const connection = await loadCompanionConnection(); if (!connection) throw new Error('请先连接 Obsidian Companion'); return new CompanionClient(connection); }
  async status(): Promise<LibraryStatus> {
    const connection = await loadCompanionConnection(); if (!connection) return { configured: false, available: false };
    try { const status = await new CompanionClient(connection).status(); return { configured: true, available: true, name: status.vaultName }; }
    catch (error) { return { configured: true, available: false, name: connection.vaultName, error: error instanceof Error ? error.message : '无法连接 Obsidian' }; }
  }
  list() { return this.client().then(client => client.list()); }
  async saveCapture(capture: Capture, notebook: string, preferredTitle?: string, expectedTarget?: string) {
    if (expectedTarget && (await chrome.storage.local.get('guiderail-library-target'))['guiderail-library-target'] !== expectedTarget) throw new Error('保存位置已切换，请重新收藏');
    const entry = await (await this.client()).saveCapture(capture, notebook, preferredTitle);
    await chrome.storage.local.set({ [LIBRARY_CHANGE]: crypto.randomUUID() }).catch(() => {}); return entry;
  }
  async readEntry(entry: Entry): Promise<LibraryEntryContent> { const content = await (await this.client()).readEntry(entry.id); return { markdown: content.markdown, images: content.images.map(image => dataBlob(image.data)) }; }
  async readPreview(entry: Entry): Promise<LibraryPreview> { const content = await (await this.client()).readEntry(entry.id); return entry.images[0] ? { image: dataBlob(content.images[0].data) } : { markdown: content.markdown.slice(0, 8192) }; }
  async createNotebook(name: string) { return (await this.client()).createNotebook(name); }
  async renameEntry(id: string, title: string) { await (await this.client()).renameEntry(id, title); }
  async moveEntry(id: string, notebook: string) { await (await this.client()).moveEntry(id, notebook); }
  async hideEntry(id: string): Promise<RemovedEntry> { return { backend: 'companion', id, token: await (await this.client()).hideEntry(id) }; }
  async restoreEntry(removed: RemovedEntry) { if (removed.backend !== 'companion') throw new Error('撤销记录不属于 Obsidian'); await (await this.client()).restoreEntry(removed.id, removed.token); }
  async rebuildIndex() { return (await this.client()).rebuildIndex(); }
}
function dataBlob(data: string) { const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(data); if (!match) throw new Error('Companion 图片格式无效'); return new Blob([Uint8Array.from(atob(match[2]), character => character.charCodeAt(0))], { type: match[1] }); }
export type LibraryBackendMode = 'directory' | 'companion';
export async function getLibraryBackendMode(): Promise<LibraryBackendMode> { return (await chrome.storage.local.get(LIBRARY_BACKEND_KEY))[LIBRARY_BACKEND_KEY] === 'companion' ? 'companion' : 'directory'; }
export const directoryLibraryBackend = new DirectoryLibraryBackend();
export const obsidianLibraryBackend = new ObsidianLibraryBackend();
async function selectedBackend() { return await getLibraryBackendMode() === 'companion' ? obsidianLibraryBackend : directoryLibraryBackend; }
export const libraryBackend: LibraryBackend = {
  status: async () => (await selectedBackend()).status(), list: async () => (await selectedBackend()).list(),
  saveCapture: async (...args) => (await selectedBackend()).saveCapture(...args), readEntry: async entry => (await selectedBackend()).readEntry(entry), readPreview: async entry => (await selectedBackend()).readPreview(entry),
  createNotebook: async name => (await selectedBackend()).createNotebook(name), renameEntry: async (id, title) => (await selectedBackend()).renameEntry(id, title), moveEntry: async (id, notebook) => (await selectedBackend()).moveEntry(id, notebook),
  hideEntry: async id => (await selectedBackend()).hideEntry(id), restoreEntry: async removed => removed.backend === 'companion' ? obsidianLibraryBackend.restoreEntry(removed) : directoryLibraryBackend.restoreEntry(removed), rebuildIndex: async () => (await selectedBackend()).rebuildIndex(),
};
