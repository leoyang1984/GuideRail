import { createHash, randomUUID } from 'node:crypto';
import { parseEntryContent, parseLibraryIndex, validateCaptureRequest } from '../../../src/companion/protocol';
import type { Entry, LibraryIndex } from '../../../src/library/library';

export interface VaultStorage {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, data: string): Promise<void>;
  readBinary(path: string): Promise<ArrayBuffer>;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  list(path: string): Promise<{ files: string[]; folders: string[] }>;
}

type InternalEntry = Entry & { hiddenToken?: string };
interface InternalIndex extends Omit<LibraryIndex, 'entries'> { entries: InternalEntry[] }
interface PendingCapture { entry: InternalEntry; captureHash: string; noteHash: string }
export interface EntryContent { entry: Entry; markdown: string; images: { name: string; data: string }[] }

const imageTypes: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
function notebookName(value: string) {
  const name = value.trim();
  if (!name || name.length > 80 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || name.startsWith('.') || /[. ]$/.test(name)) throw new Error('Invalid notebook');
  return name;
}
function safeRoot(value: string) {
  const path = value.trim().replace(/^\/+|\/+$/g, '');
  if (!path || path === '.') return '';
  if (path.split('/').some(part => !part || part === '.' || part === '..' || /[\\:*?"<>|\x00-\x1f]/.test(part))) throw new Error('Invalid library folder');
  return path;
}
function join(...parts: string[]) { return parts.filter(Boolean).join('/'); }
function cleanEntry(entry: InternalEntry): Entry {
  const { hiddenToken: _hiddenToken, ...clean } = entry; return clean;
}
async function ensureFolder(storage: VaultStorage, path: string) {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) { current = join(current, part); if (!await storage.exists(current)) await storage.mkdir(current); }
}
function sha256(value: string) { return createHash('sha256').update(value).digest('hex'); }

export class CompanionVaultLibrary {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private storage: VaultStorage, private rootFolder: string) { this.rootFolder = safeRoot(rootFolder); }
  private metaPath(name: string) { return join(this.rootFolder, '.guiderail', name); }
  private notePath(entry: Pick<Entry, 'notebook' | 'filename'>) { return join(this.rootFolder, entry.notebook, entry.filename); }
  private async locked<T>(run: () => Promise<T>): Promise<T> {
    const result = this.queue.then(run, run); this.queue = result.then(() => undefined, () => undefined); return result;
  }
  private async index(): Promise<InternalIndex> {
    const path = this.metaPath('index.json');
    if (!await this.storage.exists(path)) return { version: 1, entries: [], notebooks: ['收件箱'] };
    const value = JSON.parse(await this.storage.read(path)) as InternalIndex;
    const validated = parseLibraryIndex(value);
    return { ...validated, entries: validated.entries.map((entry, index) => {
      const token = value.entries[index]?.hiddenToken;
      if (token !== undefined && (typeof token !== 'string' || !/^[0-9a-f-]{36}$/.test(token))) throw new Error('Invalid GuideRail undo token');
      return { ...entry, ...(token ? { hiddenToken: token } : {}) };
    }) };
  }
  private async saveIndex(index: InternalIndex) {
    await ensureFolder(this.storage, join(this.rootFolder, '.guiderail'));
    await this.storage.write(this.metaPath('index.json'), JSON.stringify(index));
  }
  async list(): Promise<LibraryIndex> { const index = await this.index(); return { ...index, entries: index.entries.map(cleanEntry) }; }
  async createNotebook(name: string) {
    name = notebookName(name); await ensureFolder(this.storage, join(this.rootFolder, name));
    return this.locked(async () => { const index = await this.index(); index.notebooks = [...new Set(['收件箱', ...(index.notebooks ?? []), name])]; await this.saveIndex(index); return name; });
  }
  async saveCapture(input: unknown): Promise<Entry> {
    const request = validateCaptureRequest(input);
    return this.locked(async () => {
      const { capture } = request; const notebook = notebookName(request.notebook); const id = sha256(`${capture.conversationId}:${capture.messageId}`); const pendingPath = this.metaPath(`pending-${id}.json`); const captureHash = sha256(JSON.stringify(request));
      const index = await this.index(); const existing = index.entries.find(item => item.id === id);
      if (existing) {
        if (!await this.storage.exists(this.notePath(existing))) throw new Error('Indexed note is missing');
        if (existing.hidden) { delete existing.hidden; delete existing.hiddenToken; await this.saveIndex(index); }
        return cleanEntry(existing);
      }
      const images = (capture.images ?? []).map((image, position) => {
        const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(image.data);
        if (!match) throw new Error('Invalid image');
        return { name: `${position}.${match[1].replace('jpeg', 'jpg')}`, bytes: Uint8Array.from(Buffer.from(match[2], 'base64')) };
      });
      let pending: PendingCapture | undefined;
      if (await this.storage.exists(pendingPath)) pending = JSON.parse(await this.storage.read(pendingPath)) as PendingCapture;
      if (pending && pending.captureHash !== captureHash) throw new Error('Pending capture conflicts with this request');
      const entry: InternalEntry = pending?.entry ?? { id, title: request.preferredTitle || capture.text.trim().split('\n')[0]?.slice(0, 80) || '图片收藏', notebook, filename: `${id}.md`, createdAt: new Date().toISOString(), conversationId: capture.conversationId, messageId: capture.messageId, pageUrl: capture.pageUrl, images: images.map(image => image.name) };
      if (entry.notebook !== notebook) throw new Error('Pending capture targets another notebook');
      const folder = join(this.rootFolder, notebook); await ensureFolder(this.storage, folder);
      const fields = { title: entry.title, source: entry.pageUrl, conversation_id: entry.conversationId, message_id: entry.messageId, guiderail_id: id, created: entry.createdAt };
      let body = capture.markdown || capture.text;
      entry.images.forEach((name, position) => { const link = `![图片 ${position + 1}](attachments/${id}/${name})`; const marker = `GUIDERAILIMAGE${position}PLACEHOLDER`; body = body.includes(marker) ? body.replace(marker, link) : `${body}\n\n${link}`; });
      const header = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
      const markdown = `---\n${header}\n---\n\n${body}\n`; const noteHash = sha256(markdown); const notePath = this.notePath(entry);
      if (!pending) { await ensureFolder(this.storage, join(this.rootFolder, '.guiderail')); await this.storage.write(pendingPath, JSON.stringify({ entry, captureHash, noteHash })); }
      if (await this.storage.exists(notePath)) { if (!pending || sha256(await this.storage.read(notePath)) !== pending.noteHash) throw new Error('Note already exists outside the recoverable capture'); }
      else {
        if (images.length) { const attachmentFolder = join(folder, 'attachments', id); await ensureFolder(this.storage, attachmentFolder); for (const image of images) await this.storage.writeBinary(join(attachmentFolder, image.name), image.bytes.buffer.slice(image.bytes.byteOffset, image.bytes.byteOffset + image.bytes.byteLength)); }
        await this.storage.write(notePath, markdown);
      }
      index.entries.push(entry); index.notebooks = [...new Set(['收件箱', ...(index.notebooks ?? []), notebook])];
      try { await this.saveIndex(index); } catch (error) { throw new Error(`Note saved but index update failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
      await this.storage.remove(pendingPath);
      return cleanEntry(entry);
    });
  }
  async readEntry(id: string): Promise<EntryContent> {
    const index = await this.index(); const internal = index.entries.find(item => item.id === id); if (!internal) throw new Error('Entry not found');
    const markdown = await this.storage.read(this.notePath(internal)); const images: EntryContent['images'] = [];
    for (const name of internal.images) {
      const extension = name.split('.').pop()!; const bytes = Buffer.from(await this.storage.readBinary(join(this.rootFolder, internal.notebook, 'attachments', id, name)));
      images.push({ name, data: `data:${imageTypes[extension]};base64,${bytes.toString('base64')}` });
    }
    return { entry: cleanEntry(internal), markdown, images };
  }
  async importEntry(input: unknown): Promise<Entry> {
    const content = parseEntryContent(input); const incoming = content.entry; const payloadHash = sha256(JSON.stringify(content)); const pendingPath = this.metaPath(`import-${incoming.id}.json`);
    return this.locked(async () => {
      const index = await this.index(); const existing = index.entries.find(item => item.id === incoming.id);
      if (existing) {
        const current = await this.readEntry(existing.id);
        if (sha256(JSON.stringify(current)) !== payloadHash) throw new Error('Imported entry conflicts with existing content');
        return cleanEntry(existing);
      }
      let pending: { payloadHash: string } | undefined;
      if (await this.storage.exists(pendingPath)) pending = JSON.parse(await this.storage.read(pendingPath)) as { payloadHash: string };
      if (pending && pending.payloadHash !== payloadHash) throw new Error('Pending import conflicts with this content');
      const folder = join(this.rootFolder, notebookName(incoming.notebook)); await ensureFolder(this.storage, folder); await ensureFolder(this.storage, join(this.rootFolder, '.guiderail'));
      if (!pending) await this.storage.write(pendingPath, JSON.stringify({ payloadHash }));
      const notePath = this.notePath(incoming);
      if (await this.storage.exists(notePath)) { if (await this.storage.read(notePath) !== content.markdown) throw new Error('Imported note conflicts with an existing file'); }
      else await this.storage.write(notePath, content.markdown);
      if (content.images.length) {
        const attachments = join(folder, 'attachments', incoming.id); await ensureFolder(this.storage, attachments);
        for (const image of content.images) {
          const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(image.data); if (!match) throw new Error('Invalid imported image');
          const bytes = Buffer.from(match[2], 'base64'); const path = join(attachments, image.name);
          if (await this.storage.exists(path)) { if (!Buffer.from(await this.storage.readBinary(path)).equals(bytes)) throw new Error('Imported image conflicts with an existing file'); }
          else await this.storage.writeBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
      }
      index.entries.push({ ...incoming }); index.notebooks = [...new Set(['收件箱', ...(index.notebooks ?? []), incoming.notebook])]; await this.saveIndex(index); await this.storage.remove(pendingPath); return incoming;
    });
  }
  async renameEntry(id: string, title: string) {
    title = title.trim(); if (!title || title.length > 240) throw new Error('Invalid title');
    await this.locked(async () => { const index = await this.index(); const entry = index.entries.find(item => item.id === id); if (!entry) throw new Error('Entry not found'); const path = this.notePath(entry); const markdown = await this.storage.read(path); if (!/^title: .*$/m.test(markdown)) throw new Error('Title property is missing'); await this.storage.write(path, markdown.replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`)); entry.title = title; await this.saveIndex(index); });
  }
  async moveEntry(id: string, target: string) {
    target = notebookName(target); await this.locked(async () => { const index = await this.index(); const entry = index.entries.find(item => item.id === id); if (!entry) throw new Error('Entry not found'); if (entry.notebook === target) return; const oldFolder = join(this.rootFolder, entry.notebook); const newFolder = join(this.rootFolder, target); await ensureFolder(this.storage, newFolder); const destination = join(newFolder, entry.filename); if (await this.storage.exists(destination)) throw new Error('Destination note already exists'); await this.storage.rename(this.notePath(entry), destination); if (entry.images.length) { await ensureFolder(this.storage, join(newFolder, 'attachments')); await this.storage.rename(join(oldFolder, 'attachments', id), join(newFolder, 'attachments', id)); } entry.notebook = target; index.notebooks = [...new Set(['收件箱', ...(index.notebooks ?? []), target])]; await this.saveIndex(index); });
  }
  async hideEntry(id: string) {
    return this.locked(async () => { const index = await this.index(); const entry = index.entries.find(item => item.id === id); if (!entry) throw new Error('Entry not found'); if (!entry.hiddenToken) entry.hiddenToken = randomUUID(); entry.hidden = true; await this.saveIndex(index); return entry.hiddenToken; });
  }
  async restoreEntry(id: string, undoToken: string) {
    await this.locked(async () => { const index = await this.index(); const entry = index.entries.find(item => item.id === id); if (!entry || !entry.hidden || entry.hiddenToken !== undoToken) throw new Error('Invalid undo token'); delete entry.hidden; delete entry.hiddenToken; await this.saveIndex(index); });
  }
  async rebuildIndex(): Promise<number> {
    return this.locked(async () => { const previous = await this.index().catch(() => ({ version: 1 as const, entries: [], notebooks: ['收件箱'] })); const rebuilt: InternalIndex = { version: 1, entries: [], notebooks: previous.notebooks }; const root = await this.storage.list(this.rootFolder); for (const folder of root.folders) { const notebook = this.rootFolder ? folder.slice(this.rootFolder.length + 1) : folder; if (!notebook || notebook.startsWith('.') || notebook.includes('/')) continue; notebookName(notebook); for (const file of (await this.storage.list(folder)).files) { if (!/(?:^|\/)[a-f0-9]{64}\.md$/.test(file)) continue; const markdown = await this.storage.read(file); const fields: Record<string, string> = {}; for (const line of (/^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? '').split('\n')) { const match = /^(title|source|conversation_id|message_id|guiderail_id|created): (.*)$/.exec(line); if (match) try { fields[match[1]] = JSON.parse(match[2]); } catch { /* ignore foreign note */ } } if (!fields.guiderail_id || fields.guiderail_id !== sha256(`${fields.conversation_id}:${fields.message_id}`)) continue; const images = [...markdown.matchAll(/attachments\/([a-f0-9]{64})\/(\d+\.(?:png|jpg|webp|gif))/g)].filter(match => match[1] === fields.guiderail_id).map(match => match[2]); const prior = previous.entries.find(item => item.id === fields.guiderail_id); rebuilt.entries.push({ id: fields.guiderail_id, filename: `${fields.guiderail_id}.md`, title: fields.title, notebook, createdAt: fields.created, conversationId: fields.conversation_id, messageId: fields.message_id, pageUrl: fields.source, images, ...(prior?.hidden ? { hidden: true, hiddenToken: prior.hiddenToken } : {}) }); } } await this.saveIndex(rebuilt); return rebuilt.entries.length; });
  }
}
