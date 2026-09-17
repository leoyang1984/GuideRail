import { useState } from 'react';
import { COMPANION_DEFAULT_PORT } from '../../companion/protocol';
import { pairCompanion } from '../../companion/client';
import { useI18n } from '../../i18n';

export function CompanionSetup({ busy, error, action, onConnected, onUseDirectory, onRetry, configuredVault }: {
  busy: boolean; error?: string;
  action(task: () => Promise<void>): Promise<void>;
  onConnected(vaultName: string): Promise<void>;
  onUseDirectory(): Promise<void>;
  onRetry?(): Promise<void>;
  configuredVault?: string;
}) {
  const { t } = useI18n();
  const [code, setCode] = useState(''); const [port, setPort] = useState(String(COMPANION_DEFAULT_PORT));

  const form = (
    <form onSubmit={event => { event.preventDefault(); void action(async () => { const connection = await pairCompanion(code, Number(port)); await onConnected(connection.vaultName); }); }}>
      <label>{t('pairingCode')}<input value={code} maxLength={8} autoCapitalize="characters" autoComplete="off" placeholder={t('pairingCodePlaceholder')} disabled={busy} onChange={event => setCode(event.target.value.toUpperCase())} /></label>
      <label>{t('localPort')}<input value={port} inputMode="numeric" disabled={busy} onChange={event => setPort(event.target.value)} /></label>
      <button type="submit" className="primary" disabled={busy || !/^[A-Z2-9]{8}$/.test(code) || !/^\d{4,5}$/.test(port)}>{t('connect')}</button>
    </form>
  );

  if (configuredVault) {
    return (
      <section className="library-setup companion-setup">
        <h2>{t('companionDisconnectedTitle')}</h2>
        <div className="companion-vault-badge">
          📦 {t('currentBoundVault', { name: configuredVault })}
        </div>
        <div className="companion-troubleshoot-box">
          <p className="troubleshoot-heading">{t('companionTroubleshootTitle')}</p>
          <ol className="troubleshoot-steps">
            <li>{t('companionTroubleshootStep1')}</li>
            <li>{t('companionTroubleshootStep2')}</li>
          </ol>
        </div>
        {error && <p role="status" className="error">{error}</p>}
        {onRetry && (
          <button type="button" className="primary" disabled={busy} onClick={() => void action(onRetry)}>
            {t('btnRetryConnection')}
          </button>
        )}
        <p className="companion-help">
          <a href="https://github.com/leoyang1984/GuideRail#step-2-install-the-obsidian-companion-plugin-recommended" target="_blank" rel="noopener noreferrer" className="companion-help-link">
            {t('companionHelpLink')} ↗
          </a>
        </p>
        <details className="companion-reconfigure">
          <summary>{t('reconfigureCompanion')}</summary>
          {form}
        </details>
        <button type="button" disabled={busy} onClick={() => void onUseDirectory()}>{t('switchToNormalFolder')}</button>
      </section>
    );
  }

  return (
    <section className="library-setup companion-setup">
      <h2>{t('companionSetupTitle')}</h2>
      <p>{t('companionSetupDesc')}</p>
      <div className="companion-tip-box">
        {t('companionKeepRunningTip')}
      </div>
      {error && <p role="status" className="error">{error}</p>}
      {form}
      <p className="companion-help"><a href="https://github.com/leoyang1984/GuideRail#step-2-install-the-obsidian-companion-plugin-recommended" target="_blank" rel="noopener noreferrer" className="companion-help-link">{t('companionHelpLink')} ↗</a></p>
      <button type="button" disabled={busy} onClick={() => void onUseDirectory()}>{t('switchToNormalFolder')}</button>
    </section>
  );
}
