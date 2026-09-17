import { useState } from 'react';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { archiveLegacy } from '../../library/migration';
import { libraryBackend } from '../../library/backend';
import { ChromeStorageRepository } from '../../storage/storage';
import { useI18n } from '../../i18n';

export function LegacyUpgrade({ count, busy, action, onComplete }: {
  count: number; busy: boolean; action(task: () => Promise<void>): Promise<void>; onComplete(): Promise<void>;
}) {
  const { t } = useI18n();
  const [progress, setProgress] = useState('');
  return <section className="library-setup"><h2>{t('legacyUpgradeTitle')}</h2>
    <p>{t('legacyUpgradeDesc', { count })}</p>
    <p className="muted">{t('legacyUpgradeNote')}</p>
    <button disabled={busy} onClick={() => void action(async () => {
      try {
        const data = await new ChromeStorageRepository().read();
        const target = (await chrome.storage.local.get('guiderail-library-target'))['guiderail-library-target'];
        if (!target) throw new Error(t('legacyReselect'));
        const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
        converter.use(gfm); converter.remove(['img', 'script', 'style', 'iframe']);
        const sources = Object.values(data.sources);
        for (let i = 0; i < sources.length; i++) {
          setProgress(t('legacySavingProgress', { current: i + 1, total: sources.length }));
          const source = sources[i];
          await libraryBackend.saveCapture({ ...source, markdown: source.html ? converter.turndown(source.html) : source.text }, '收件箱', source.title, target);
        }
        setProgress(t('legacyBackupProgress'));
        await archiveLegacy(data, target);
        await onComplete();
      } finally { setProgress(''); }
    })}>{progress ? t('legacyUpgrading') : t('legacyStartUpgrade')}</button>
    {progress && <p role="status">{progress} {t('legacyKeepOpen')}</p>}
  </section>;
}
