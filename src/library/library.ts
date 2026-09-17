import { loadDirectory, writeNewFile } from '../export/directory';
import type { Capture } from '../storage/schema';

export interface Entry { id: string; title: string; notebook: string; filename: string; createdAt: string; conversationId: string; messageId: string; pageUrl: string; images: string[]; hidden?: boolean; hiddenToken?: string }
export interface LibraryIndex { version: 1; entries: Entry[]; notebooks?: string[] }
export const LIBRARY_CHANGE = 'guiderail-library-revision';
export function notebookName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || name.startsWith('.') || /[. ]$/.test(name)) throw new Error('笔记本名称无效');
  return name;
}
export async function rootDirectory() {
  const root = await loadDirectory('library-directory');
  if (!root) throw new Error('请先在插件中设置笔记库');
  if (await root.queryPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('请在插件中重新授权笔记库');
  return root;
}
async function readJSON<T>(dir: FileSystemDirectoryHandle, name: string): Promise<T | null> {
  try { return JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()) as T; }
  catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
}
export async function write(dir: FileSystemDirectoryHandle, name: string, data: string | Blob) {
  let existed = true;
  try { await dir.getFileHandle(name); } catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; existed = false; }
  let stream: FileSystemWritableFileStream | undefined;
  try { const file = await dir.getFileHandle(name, { create: true }); stream = await file.createWritable(); await stream.write(data); await stream.close(); }
  catch (error) { await stream?.abort().catch(() => {}); if (!existed) await dir.removeEntry(name).catch(() => {}); throw error; }
}
export async function readIndex(root: FileSystemDirectoryHandle): Promise<LibraryIndex> {
  let meta;
  try { meta = await root.getDirectoryHandle('.guiderail'); }
  catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return { version: 1, entries: [] }; throw error; }
  const index = await readJSON<LibraryIndex>(meta, 'index.json');
  if (!index) return { version: 1, entries: [] };
  if (index.version !== 1 || !Array.isArray(index.entries)) throw new Error('笔记库索引格式不支持');
  if (index.notebooks !== undefined) { if (!Array.isArray(index.notebooks)) throw new Error('笔记本索引无效'); index.notebooks.forEach(notebookName); }
  for (const e of index.entries) {
    if (typeof e.title !== 'string' || e.title.length > 240 || typeof e.createdAt !== 'string' || !Number.isFinite(Date.parse(e.createdAt)) || !/^[\w-]{1,200}$/.test(e.conversationId) || !/^[\w-]{1,200}$/.test(e.messageId) || e.pageUrl !== `https://chatgpt.com/c/${e.conversationId}`) throw new Error('笔记库索引无效');
    notebookName(e.notebook);
    if (!/^[a-f0-9]{64}$/.test(e.id) || e.filename !== `${e.id}.md` || !Array.isArray(e.images) || e.images.some(p => !/^\d+\.(png|jpg|webp|gif)$/.test(p))) throw new Error('笔记库索引无效');
  }
  return index;
}
export async function digest(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join(''); }
export function imageBlob(data: string): Blob {
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data);
  if (!match || data.length > 14 * 1024 * 1024) throw new Error('图片格式不支持或超过 10 MB');
  const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
  if (bytes.length > 10 * 1024 * 1024) throw new Error('单张图片超过 10 MB');
  const valid = match[1] === 'png' ? bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 : match[1] === 'gif' ? String.fromCharCode(...bytes.slice(0, 3)) === 'GIF' : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('图片内容与格式不匹配');
  return new Blob([bytes], { type: `image/${match[1]}` });
}
export async function saveCapture(capture: Capture, notebook: string, preferredTitle?: string, expectedTarget?: string) {
  return navigator.locks.request('guiderail-library', async () => {
    if (expectedTarget && (await chrome.storage.local.get('guiderail-library-target'))['guiderail-library-target'] !== expectedTarget) throw new Error('保存位置已切换，请重新收藏');
    const root = await rootDirectory(); notebook = notebookName(notebook);
    if (!/^[\w-]{1,200}$/.test(capture.conversationId) || !/^[\w-]{1,200}$/.test(capture.messageId) || capture.pageUrl !== `https://chatgpt.com/c/${capture.conversationId}` || typeof capture.text !== 'string' || capture.text.length > 200000 || (capture.markdown?.length ?? 0) > 400000) throw new Error('收藏内容无效');
    if ((capture.images?.length ?? 0) > 12) throw new Error('每条回复最多保存 12 张图片');
    if ((capture.images ?? []).reduce((sum, image) => sum + image.data.length, 0) > 25 * 1024 * 1024) throw new Error('图片总大小超出限制');
    const blobs = (capture.images ?? []).map(image => imageBlob(image.data));
    if (blobs.reduce((sum, blob) => sum + blob.size, 0) > 18 * 1024 * 1024) throw new Error('每条回复图片总大小超过 18 MB');
    if (!capture.text.trim() && !blobs.length) throw new Error('回复内容为空');
    const id = await digest(`${capture.conversationId}:${capture.messageId}`);
    const index = await readIndex(root); const existing = index.entries.find(e => e.id === id); if (existing) {
      await (await (await root.getDirectoryHandle(existing.notebook)).getFileHandle(existing.filename)).getFile();
      if (existing.images.length) { const images = await (await (await root.getDirectoryHandle(existing.notebook)).getDirectoryHandle('attachments')).getDirectoryHandle(existing.id); for (const name of existing.images) await (await images.getFileHandle(name)).getFile(); }
      if (existing.hidden) { delete existing.hidden; delete existing.hiddenToken; await write(await root.getDirectoryHandle('.guiderail'), 'index.json', JSON.stringify(index)); await chrome.storage.local.set({ [LIBRARY_CHANGE]: crypto.randomUUID() }).catch(() => {}); }
      return existing;
    }
    const folder = await root.getDirectoryHandle(notebook, { create: true });
    const meta = await root.getDirectoryHandle('.guiderail', { create: true });
    // A durable pending record makes a crash between note and index writes retryable.
    const pendingName = `pending-${id}.json`;
    const pending = await readJSON<Entry & { captureHash: string; noteHash?: string }>(meta, pendingName);
    const captureHash = await digest(JSON.stringify(capture));
    if (pending && pending.captureHash !== captureHash) throw new Error('未完成的收藏内容发生变化，请先重建索引或清理未完成文件');
    if (pending && pending.notebook !== notebook) throw new Error(`上次保存未完成，请切换到“${pending.notebook}”后重试`);
    const entry: Entry = pending ?? { id, title: preferredTitle || capture.text.trim().split('\n')[0]?.slice(0, 80) || '图片收藏', notebook, filename: `${id}.md`, createdAt: new Date().toISOString(), conversationId: capture.conversationId, messageId: capture.messageId, pageUrl: capture.pageUrl, images: blobs.map((blob, i) => `${i}.${blob.type.split('/')[1].replace('jpeg', 'jpg')}`) };
    let noteExists = false;
    try { await folder.getFileHandle(entry.filename); noteExists = true; } catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; }
    if (noteExists && !pending) throw new Error('发现同名笔记，已保留文件；请重建索引后重试');
    if (noteExists && pending?.noteHash && await digest(await (await (await folder.getFileHandle(entry.filename)).getFile()).text()) !== pending.noteHash) throw new Error('笔记已被修改，已保留文件，请重建索引');
    if (!pending) await write(meta, pendingName, JSON.stringify({ ...entry, captureHash }));
    if (!noteExists) {
      if (blobs.length) {
        const attachments = await (await folder.getDirectoryHandle('attachments', { create: true })).getDirectoryHandle(id, { create: true });
        for (let i = 0; i < blobs.length; i++) await write(attachments, entry.images[i], blobs[i]);
      }
      const fields = { title: entry.title, source: entry.pageUrl, conversation_id: entry.conversationId, message_id: entry.messageId, guiderail_id: id, created: entry.createdAt };
      const header = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');
      let body = capture.markdown || capture.text;
      entry.images.forEach((name, i) => { const image = `![图片 ${i + 1}](attachments/${id}/${name})`; const marker = `GUIDERAILIMAGE${i}PLACEHOLDER`; body = body.includes(marker) ? body.replace(marker, image) : `${body}\n\n${image}`; });
      const markdown = `---\n${header}\n---\n\n${body}\n`;
      await write(meta, pendingName, JSON.stringify({ ...entry, captureHash, noteHash: await digest(markdown) }));
      if (await writeNewFile(folder, entry.filename, markdown) !== 'written') throw new Error('笔记已存在，已保留原文件');
    }
    const { captureHash: _captureHash, noteHash: _noteHash, ...cleanEntry } = entry as Entry & { captureHash?: string; noteHash?: string };
    index.entries.push(cleanEntry); await write(meta, 'index.json', JSON.stringify(index));
    await meta.removeEntry(pendingName).catch(() => {});
    await chrome.storage.local.set({ [LIBRARY_CHANGE]: crypto.randomUUID() }).catch(() => {});
    return entry;
  });
}

async function notify() { await chrome.storage.local.set({ [LIBRARY_CHANGE]: crypto.randomUUID() }).catch(() => {}); }
export async function createNotebook(name: string) {
  name = notebookName(name);
  await navigator.locks.request('guiderail-library', async () => {
    const root = await rootDirectory(); const index = await readIndex(root);
    await root.getDirectoryHandle(name, { create: true });
    index.notebooks = [...new Set(['收件箱', ...(index.notebooks ?? []), name])];
    await write(await root.getDirectoryHandle('.guiderail', { create: true }), 'index.json', JSON.stringify(index));
    await notify();
  });
  return name;
}
export interface DirectoryRemovedEntry { backend: 'directory'; id: string; token: string; directory: FileSystemDirectoryHandle }
export interface CompanionRemovedEntry { backend: 'companion'; id: string; token: string }
export type RemovedEntry = DirectoryRemovedEntry | CompanionRemovedEntry;
export async function hideEntry(id: string): Promise<DirectoryRemovedEntry> {
  return navigator.locks.request('guiderail-library', async () => {
    const root = await rootDirectory(); const index = await readIndex(root); const entry = index.entries.find(e => e.id === id);
    if (!entry) throw new Error('收藏不存在');
    const token = crypto.randomUUID(); entry.hidden = true; entry.hiddenToken = token;
    await write(await root.getDirectoryHandle('.guiderail'), 'index.json', JSON.stringify(index)); await notify();
    return { backend: 'directory', id, token, directory: root };
  });
}
export async function restoreEntry(removed: DirectoryRemovedEntry) {
  await navigator.locks.request('guiderail-library', async () => {
    const root = await rootDirectory();
    if (root !== removed.directory && !await root.isSameEntry(removed.directory)) throw new Error('请切回原保存文件夹后撤销');
    const index = await readIndex(root); const entry = index.entries.find(e => e.id === removed.id);
    if (!entry) throw new Error('这条收藏已不在列表中');
    if (!entry.hidden) return;
    if (entry.hiddenToken !== removed.token) throw new Error('这条收藏已被再次移出，无法撤销先前操作');
    delete entry.hidden; delete entry.hiddenToken;
    await write(await root.getDirectoryHandle('.guiderail'), 'index.json', JSON.stringify(index)); await notify();
  });
}
export async function moveEntry(id: string, target: string) {
  target = notebookName(target);
  await navigator.locks.request('guiderail-library', async () => {
    const root = await rootDirectory(); const index = await readIndex(root); const entry = index.entries.find(e => e.id === id);
    if (!entry) throw new Error('收藏不存在'); if (entry.notebook === target) return;
    const from = await root.getDirectoryHandle(entry.notebook); const to = await root.getDirectoryHandle(target, { create: true });
    const content = await (await (await from.getFileHandle(entry.filename)).getFile()).text();
    async function copyNew(dir: FileSystemDirectoryHandle, name: string, blob: Blob) {
      if (await writeNewFile(dir, name, blob) === 'skipped') {
        const old = await (await dir.getFileHandle(name)).getFile();
        const a = new Uint8Array(await old.arrayBuffer()), b = new Uint8Array(await blob.arrayBuffer());
        if (a.length !== b.length || a.some((v, i) => v !== b[i])) throw new Error('目标文件已存在且内容不同，已保留原文件');
      }
    }
    if (entry.images.length) {
      const src = await (await from.getDirectoryHandle('attachments')).getDirectoryHandle(id);
      const dest = await (await to.getDirectoryHandle('attachments', { create: true })).getDirectoryHandle(id, { create: true });
      for (const name of entry.images) await copyNew(dest, name, await (await src.getFileHandle(name)).getFile());
    }
    await copyNew(to, entry.filename, new Blob([content], { type: 'text/markdown' }));
    entry.notebook = target;
    await write(await root.getDirectoryHandle('.guiderail'), 'index.json', JSON.stringify(index)); await notify();
    // Leave the original as a recovery copy if cleanup fails; the index already points to the verified destination.
    try {
      await from.removeEntry(entry.filename);
      if (entry.images.length) {
        const attachments = await from.getDirectoryHandle('attachments'); const old = await attachments.getDirectoryHandle(id);
        for (const name of entry.images) await old.removeEntry(name);
        await attachments.removeEntry(id); // Never recursively delete files we do not own.
      }
    } catch { throw new Error('已移动到目标笔记本；原位置清理失败，保留了恢复副本'); }
  });
}
type IterableDirectory = FileSystemDirectoryHandle & { values(): AsyncIterableIterator<FileSystemHandle> };
export async function rebuildIndex() {
  return navigator.locks.request('guiderail-library', async () => {
    const root = await rootDirectory(); const meta = await root.getDirectoryHandle('.guiderail', { create: true });
    let previous: LibraryIndex | null = null;
    try { previous = await readIndex(root); } catch { /* Preserve the damaged index below before replacement. */ }
    let old: string | undefined;
    try { old = await (await (await meta.getFileHandle('index.json')).getFile()).text(); } catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; }
    const index: LibraryIndex = { version: 1, entries: [], notebooks: previous?.notebooks ?? ['收件箱'] };
    for await (const handle of (root as unknown as IterableDirectory).values()) {
      if (handle.kind !== 'directory' || handle.name.startsWith('.')) continue;
      const folder = await root.getDirectoryHandle(handle.name);
      for await (const file of (folder as IterableDirectory).values()) {
        if (file.kind !== 'file' || !/^[a-f0-9]{64}\.md$/.test(file.name)) continue;
        const text = await (await (await folder.getFileHandle(file.name)).getFile()).text();
        const header = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1]; if (!header) continue;
        const fields: Record<string, string> = {};
        for (const line of header.split('\n')) { const match = /^(title|source|conversation_id|message_id|guiderail_id|created): (.*)$/.exec(line); if (match) { try { fields[match[1]] = JSON.parse(match[2]); } catch { /* Not an owned note. */ } } }
        if (!fields.conversation_id || !fields.message_id || !fields.title || !Number.isFinite(Date.parse(fields.created)) || fields.guiderail_id !== await digest(`${fields.conversation_id}:${fields.message_id}`) || file.name !== `${fields.guiderail_id}.md` || fields.source !== `https://chatgpt.com/c/${fields.conversation_id}`) continue;
        notebookName(handle.name);
        const images = [...new Set(Array.from(text.matchAll(/!\[[^\]]*\]\(attachments\/([a-f0-9]{64})\/(\d+\.(?:png|jpg|webp|gif))\)/g)).filter(m => m[1] === fields.guiderail_id).map(m => m[2]))];
        if (images.length) { const attachments = await (await folder.getDirectoryHandle('attachments')).getDirectoryHandle(fields.guiderail_id); for (const name of images) await (await attachments.getFileHandle(name)).getFile(); }
        const prior = previous?.entries.find(e => e.id === fields.guiderail_id);
        const entry: Entry = { id: fields.guiderail_id, filename: file.name, notebook: handle.name, title: fields.title, conversationId: fields.conversation_id, messageId: fields.message_id, pageUrl: fields.source, createdAt: fields.created, images, ...(prior?.hidden ? { hidden: true } : {}) };
        const duplicate = index.entries.findIndex(e => e.id === entry.id);
        if (duplicate < 0) index.entries.push(entry);
        else if (prior?.notebook === entry.notebook) index.entries[duplicate] = entry;
      }
    }
    if (old !== undefined) await write(meta, `index-backup-${crypto.randomUUID()}.json`, old);
    index.entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    await write(meta, 'index.json', JSON.stringify(index)); await notify(); return index.entries.length;
  });
}

export async function renameEntry(id: string, title: string) {
  title = title.trim(); if (!title || title.length > 240) throw new Error('标题须为 1–240 个字符');
  await navigator.locks.request('guiderail-library', async () => {
    const root = await rootDirectory(); const index = await readIndex(root); const entry = index.entries.find(e => e.id === id);
    if (!entry) throw new Error('收藏不存在');
    const folder = await root.getDirectoryHandle(entry.notebook);
    const content = await (await (await folder.getFileHandle(entry.filename)).getFile()).text();
    const header = /^---\n([\s\S]*?)\n---\n/.exec(content);
    if (!header || !/^title: .*$/m.test(header[1])) throw new Error('笔记属性已被修改，请在编辑器中修改标题后重建索引');
    const changedHeader = header[0].replace(/^title: .*$/m, () => `title: ${JSON.stringify(title)}`);
    await write(folder, entry.filename, changedHeader + content.slice(header[0].length));
    entry.title = title;
    await write(await root.getDirectoryHandle('.guiderail'), 'index.json', JSON.stringify(index)); await notify();
  });
}
