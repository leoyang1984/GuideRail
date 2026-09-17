import { useState } from 'react';
import { ensureDirectoryPermission } from '../../export/directory';
import { directoryLibraryBackend } from '../../library/backend';
import { previewCompanionMigration, runCompanionMigration, type CompanionMigrationPreview } from '../../library/migrate-companion';
import { useI18n } from '../../i18n';

export function CompanionMigration({ busy, action, onComplete }: { busy: boolean; action(task: () => Promise<void>): Promise<void>; onComplete(message: string): Promise<void> }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState<CompanionMigrationPreview | null>(null); const [progress, setProgress] = useState('');
  const inspect = () => action(async () => {
    const directory = await directoryLibraryBackend.rememberedDirectory();
    if (!directory) throw new Error(t('migrateNoDir'));
    if (!await ensureDirectoryPermission(directory)) throw new Error(t('migrateNeedPerm'));
    setPreview(await previewCompanionMigration());
  });
  return <div className="bear-drawer-row"><div className="bear-drawer-info"><span className="bear-drawer-title">{t('migrateFolder')}</span>
    <span className="bear-drawer-desc">{t('migrateFolderDesc')}</span>
    {preview && <span className="bear-drawer-desc">{t('migratePreviewDesc', { sourceCount: preview.sourceCount, importable: preview.importable.length, identical: preview.identical, conflicts: preview.conflicts.length })}</span>}
    {progress && <span className="bear-drawer-desc">{progress}</span>}</div>
    {!preview ? <button className="bear-action-btn" disabled={busy} onClick={() => void inspect()}>{t('migrateInspect')}</button> : <button className="bear-action-btn" disabled={busy || !preview.importable.length} onClick={() => void action(async () => {
      const result = await runCompanionMigration(preview, (done, total) => setProgress(t('migratingProgress', { done, total })));
      setPreview(null);
      setProgress('');
      await onComplete(t('migrateComplete', { imported: result.imported, identical: result.identical, conflicts: result.conflicts }));
    })}>{t('migrateStart')}</button>}
  </div>;
}
