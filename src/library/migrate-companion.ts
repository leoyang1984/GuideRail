import { CompanionClient, loadCompanionConnection } from '../companion/client';
import type { EntryContentResponse } from '../companion/protocol';
import { LIBRARY_CHANGE, type Entry } from './library';
import { directoryLibraryBackend } from './backend';

export interface CompanionMigrationPreview {
  sourceCount: number;
  importable: Entry[];
  identical: number;
  conflicts: Entry[];
}
async function dataUrl(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
async function sourceContent(entry: Entry): Promise<EntryContentResponse> {
  const content = await directoryLibraryBackend.readEntry(entry);
  return { entry, markdown: content.markdown, images: await Promise.all(content.images.map(async (image, index) => ({ name: entry.images[index], data: await dataUrl(image) }))) };
}
async function client() { const connection = await loadCompanionConnection(); if (!connection) throw new Error('请先连接 Obsidian Companion'); return new CompanionClient(connection); }
export async function previewCompanionMigration(): Promise<CompanionMigrationPreview> {
  const source = await directoryLibraryBackend.list(); const target = await (await client()).list(); const targetIds = new Set(target.entries.map(entry => entry.id));
  const importable = source.entries.filter(entry => !targetIds.has(entry.id)); const common = source.entries.filter(entry => targetIds.has(entry.id)); let identical = 0; const conflicts: Entry[] = []; const companion = await client();
  for (const entry of common) {
    const [local, remote] = await Promise.all([sourceContent(entry), companion.readEntry(entry.id)]);
    if (JSON.stringify(local) === JSON.stringify(remote)) identical++; else conflicts.push(entry);
  }
  return { sourceCount: source.entries.length, importable, identical, conflicts };
}
export async function runCompanionMigration(preview: CompanionMigrationPreview, progress?: (completed: number, total: number) => void) {
  const companion = await client(); let completed = 0;
  for (const entry of preview.importable) { await companion.importEntry(await sourceContent(entry)); completed++; progress?.(completed, preview.importable.length); }
  await chrome.storage.local.set({ [LIBRARY_CHANGE]: crypto.randomUUID() }).catch(() => {});
  return { imported: completed, identical: preview.identical, conflicts: preview.conflicts.length };
}
