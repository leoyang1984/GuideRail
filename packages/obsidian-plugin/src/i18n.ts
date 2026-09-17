export type Locale = 'en' | 'zh';

export function getObsidianLocale(): Locale {
  const lang = (
    (typeof window !== 'undefined' && window.localStorage?.getItem('language')) ||
    (typeof window !== 'undefined' && (window as unknown as { moment?: { locale?: () => string } }).moment?.locale?.()) ||
    'en'
  ).toLowerCase();

  return lang.startsWith('zh') ? 'zh' : 'en';
}

const strings = {
  en: {
    header: 'GuideRail Companion',
    desc: 'Only listens on local 127.0.0.1. Once paired, GuideRail saves clips into this Vault without browser directory permissions.',
    rootFolderTitle: 'Vault Root Folder',
    rootFolderDesc: 'Folder inside your Vault. Leave empty or "/" to save directly in Vault root (e.g. "收件箱/"); default "GuideRail" saves under "GuideRail/收件箱/".',
    rootFolderPlaceholder: 'GuideRail (empty for Vault root)',
    portTitle: 'Local Port',
    portDesc: 'Default 27124. Server restarts automatically when modified.',
    connectTitle: 'Connect GuideRail',
    pairingCodePrefix: 'Pairing code: ',
    clickToCopy: 'Click to copy pairing code',
    codeCopiedNotice: 'Pairing code copied: {code}',
    codeNoticeWithClip: 'GuideRail Pairing Code: {code} (copied to clipboard)',
    codeNoticeWithoutClip: 'GuideRail Pairing Code: {code}',
    validNotice: ' (Valid for ~{minutes} min, single use. Click code or button to copy)',
    copyCodeButton: 'Copy Code',
    connectDescDefault: 'Click to generate a one-time pairing code and copy it to clipboard.',
    regenerateButton: 'Regenerate',
    generateButton: 'Generate Pairing Code',
    cannotBeginPairing: 'Cannot begin pairing',
    pairedClientsTitle: 'Paired Clients',
    pairedClientsDesc: '{count} authorized client(s)',
    revokeAllButton: 'Revoke All',
    revokedAllNotice: 'Revoked all GuideRail connections',
    clientPairedNotice: 'GuideRail client paired: {origin}',
    serverStartFailedNotice: 'GuideRail Companion failed to start: {error}',
    serverNotRunningError: 'Local service is not running',
    portUnavailable: 'Port unavailable',
  },
  zh: {
    header: 'GuideRail Companion',
    desc: '服务只监听本机 127.0.0.1。配对后，GuideRail 无需浏览器文件夹授权即可写入当前 Vault。',
    rootFolderTitle: '保存根目录',
    rootFolderDesc: 'Vault 内的保存文件夹。留空或填“/”表示直接保存在 Vault 根目录（如“收件箱/”）；默认“GuideRail”会存放在“GuideRail/收件箱/”。',
    rootFolderPlaceholder: 'GuideRail（留空为 Vault 根目录）',
    portTitle: '本地端口',
    portDesc: '默认 27124。修改后服务会自动重启。',
    connectTitle: '连接 GuideRail',
    pairingCodePrefix: '配对码：',
    clickToCopy: '点击复制配对码',
    codeCopiedNotice: '已复制配对码：{code}',
    codeNoticeWithClip: 'GuideRail 配对码：{code}（已复制到剪贴板）',
    codeNoticeWithoutClip: 'GuideRail 配对码：{code}',
    validNotice: '（约 {minutes} 分钟内有效，单次使用。点击配对码或右侧按钮复制）',
    copyCodeButton: '复制配对码',
    connectDescDefault: '点击后生成一次性配对码，并自动复制到剪贴板。',
    regenerateButton: '重新生成',
    generateButton: '生成配对码',
    cannotBeginPairing: '无法开始配对',
    pairedClientsTitle: '已配对客户端',
    pairedClientsDesc: '{count} 个已授权客户端',
    revokeAllButton: '撤销全部',
    revokedAllNotice: '已撤销全部 GuideRail 连接',
    clientPairedNotice: 'GuideRail 客户端配对成功：{origin}',
    serverStartFailedNotice: 'GuideRail Companion 无法启动：{error}',
    serverNotRunningError: '本地服务未启动',
    portUnavailable: '端口不可用',
  },
} as const;

export type CompanionTranslationKey = keyof typeof strings.en;

export function tCompanion(key: CompanionTranslationKey, params?: Record<string, string | number>): string {
  const locale = getObsidianLocale();
  let text: string = strings[locale][key] ?? strings.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
