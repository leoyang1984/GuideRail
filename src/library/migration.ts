import { ChromeStorageRepository, STORAGE_KEY } from '../storage/storage';
import type { GuideRailStorage } from '../storage/schema';
import { digest, readIndex, rootDirectory, write } from './library';

/** Release browser data only after a read-back verified, complete disk backup. */
export async function archiveLegacy(expected: GuideRailStorage, expectedTarget?: string) {
  await navigator.locks.request('guiderail-library', () => navigator.locks.request('guiderail-legacy', async () => {
    if (expectedTarget && (await chrome.storage.local.get('guiderail-library-target'))['guiderail-library-target'] !== expectedTarget) throw new Error('保存文件夹已切换，请重新开始升级');
    const directory = await rootDirectory(); const index = await readIndex(directory);
    for (const source of Object.values(expected.sources)) {
      const id = await digest(`${source.conversationId}:${source.messageId}`); const entry = index.entries.find(e => e.id === id);
      if (!entry) throw new Error('迁移尚未完成');
      await (await (await directory.getDirectoryHandle(entry.notebook)).getFileHandle(entry.filename)).getFile();
    }
    const backup = JSON.stringify(expected);
    if (JSON.stringify(await new ChromeStorageRepository().read()) !== backup) throw new Error('旧数据发生变化，请重新打开页面再迁移');
    const meta = await directory.getDirectoryHandle('.guiderail', { create: true }); const name = `legacy-backup-${crypto.randomUUID()}.json`;
    await write(meta, name, backup);
    if (await (await (await meta.getFileHandle(name)).getFile()).text() !== backup) throw new Error('备份校验失败，已保留旧数据');
    await chrome.storage.local.remove(STORAGE_KEY);
  }));
}
