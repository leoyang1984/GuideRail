export type Locale = 'en' | 'zh';
export type LanguageSetting = 'auto' | 'en' | 'zh';

export const LANGUAGE_SETTING_KEY = 'guiderail-language';

export const dictionaries = {
  en: {
    // Content script buttons & toasts
    btnBookmark: '☆ Bookmark',
    btnBookmarked: '✓ Bookmarked',
    btnSaving: 'Saving…',
    btnRetry: 'Click to retry',
    btnSavedTextOnly: '✓ Text saved · {count} images skipped',
    toastSelectText: 'Please select text to bookmark',
    toastEmptyText: 'Selected text is empty',
    toastStreaming: 'Generating reply, please clip later',
    toastChatGPTOnly: 'Please use on a ChatGPT conversation page',
    toastClipping: 'Clipping…',
    toastClipped: '✓ Clipped to {notebook}',
    toastConfigureLibraryFirst: 'Please configure note library in GuideRail first',
    toastExtensionUpdated: 'Extension updated, please refresh this page',
    toastSaveFailed: 'Save failed',
    excerptPrefix: 'Excerpt: ',

    // Background service worker
    contextMenuSaveSelection: 'Clip selection to GuideRail',
    conversationChanged: 'Conversation changed, please retry shortly',
    invalidImageSource: 'Invalid image request source',
    imageDownloadFailed: 'Image download failed, please retry shortly',
    storagePermissionFailed: 'Save failed, please check folder permission and disk space',
    libraryUnconfigured: 'Please configure note library in GuideRail first',
    libraryReauthorize: 'Please re-authorize note library in GuideRail',
    libraryOpenFailed: 'Cannot open note library',

    // Sidepanel Header & List
    tagline: 'Keep what is worth revisiting',
    themeButtonTitle: 'Click to switch appearance theme',
    themeButtonLabel: 'Theme',
    loadingLibrary: 'Opening note library…',
    bookmarks: 'Bookmarks',
    tagAll: '#All',
    filterFolder: 'View folder',
    allBookmarks: 'All bookmarks',
    emptyAll: 'Open a ChatGPT conversation and click "☆ Bookmark" below any reply to see it here.',
    emptyFolder: 'This folder has no notes yet. New notes land in Inbox.',
    undoRemoved: 'Removed from list, file retained.',
    undo: 'Undo',
    retry: 'Retry',
    processing: 'Processing…',

    // Sidepanel Reader
    back: '← Back',
    jumpToSource: 'Jump to Source',
    reading: 'Reading note…',
    readError: 'Failed to read note',
    readErrorDetail: 'Cannot fully read this note. Please check if notes and attachments still exist in the save folder.',
    retryRead: 'Retry',
    actionFailed: 'Operation failed, please retry',
    openSettingsNotice: 'Settings page opened. Please select your save folder there.',
    selectionCancelled: 'Selection cancelled. You can choose again anytime.',
    folderPickerError: 'Cannot select folder right now. Please reopen the extension and try again.',
    listLoadError: 'Cannot load notes list right now. Please check if your save folder is accessible.',
    legacyReadError: 'Cannot read legacy bookmarks right now. Existing data in browser is retained.',
    retryLegacy: 'Retry Reading Legacy',
    legacyUpgradeComplete: 'Legacy notes migrated, full backup saved, and browser copy cleared. Images from old versions may need to be re-saved from original chat.',

    // Sidepanel Actions (Card Context Menu & Modal)
    moreActions: 'More actions',
    rename: 'Rename',
    titleLabel: 'Title',
    renameTitle: 'New Title',
    move: 'Move to…',
    folderLabel: 'Folder',
    selectDestination: 'Select destination',
    newFolder: 'New Folder…',
    newFolderName: 'New Folder Name',
    remove: 'Remove from List',
    details: 'Details',
    detailsLocation: 'Location: {notebook}',
    detailsFile: 'File: {filename}',
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    close: 'Close',

    // Sidepanel Card
    previewUnavailable: 'Preview unavailable',
    image: 'Image',
    excerptUnavailable: 'Excerpt unavailable, click to view',
    imagesCount: '{count} images',

    // Setup & Permissions
    permissionPromptTitle: 'Continue Accessing Bookmarks',
    permissionPromptDesc: 'Browser restart requires re-confirming folder permission for security.',
    allowAccess: 'Allow access to "{name}"',
    permissionDeniedRetry: 'Permission not granted yet, please try again.',
    connectObsidianRecommended: 'Connect Obsidian (Recommended)',
    folderMovedQuestion: 'Folder moved?',
    reselectFolder: 'Choose Folder Again',
    whereToSave: 'Where to save bookmarks?',
    whereToSaveDesc: 'Text and images will be saved automatically to this folder.',
    selectFolderButton: 'Select Save Folder',

    // Sidepanel Settings Drawer
    settings: 'Settings',
    appearance: 'Appearance',
    appearanceDesc: 'Click to switch Bear-inspired themes',
    themeSystem: 'System',
    themeRedDark: 'Red Dark',
    themeRedLight: 'Red Light',
    themeNord: 'Nordic Snow',
    themeSolarized: 'Parchment',
    language: 'Language',
    languageDesc: 'Choose interface language',
    langAuto: 'Auto (System)',
    langZh: '简体中文',
    langEn: 'English',
    storageTitle: 'Storage',
    obsidianVault: 'Obsidian Vault',
    localFolder: 'Save Folder',
    obsidianDesc: 'Saved via local Companion, no folder permission prompts.',
    folderDesc: 'New notes automatically land in Inbox.',
    rePair: 'Re-pair',
    useFolder: 'Switch to Folder',
    changeFolder: 'Change Folder',
    connectObsidian: 'Connect Obsidian',
    maintenance: 'Maintenance',
    maintenanceDesc: 'Use only if notes are missing. Rebuild recovers entries from disk notes.',
    rebuildIndex: 'Rebuild Note Index',
    rebuildSuccess: 'Note list repaired, {count} notes found.',
    backupFootnote: 'To backup your notes, copy your entire vault or folder.',

    // Companion Setup
    companionSetupTitle: 'Connect to Obsidian',
    companionSetupDesc: 'Generate a pairing code in Obsidian GuideRail Companion settings and enter it here. No browser folder permission required once connected.',
    enterPairingCode: 'Enter Pairing Code',
    pairingCode: 'Pairing Code',
    pairingCodePlaceholder: 'ABCD2345',
    localPort: 'Local Port',
    connect: 'Connect',
    chooseFolder: 'Select Local Folder',
    folderFallback: 'Or use a disk folder directly without Obsidian',
    switchToNormalFolder: 'Use Regular Folder',
    companionHelpLink: 'Don’t have the Obsidian plugin yet? View setup & download',
    companionConnectedNotice: 'Connected to Obsidian Vault "{name}".',

    // Companion Migration
    migrateFolder: 'Migrate Regular Folder',
    migrateFolderDesc: 'Compares previous folder with current Vault; will not overwrite conflicts or delete original files.',
    migratePreviewDesc: 'Original notes: {sourceCount}; to import: {importable}; identical: {identical}; conflicts: {conflicts}.',
    migrateInspect: 'Inspect Migration',
    migrateStart: 'Start Migration',
    migratingProgress: 'Importing {done}/{total}',
    migrateComplete: 'Migration complete: imported {imported}, skipped {identical} identical, retained {conflicts} conflicts. Original files retained.',
    migrateNoDir: 'No previously selected folder found',
    migrateNeedPerm: 'Permission to read original folder is required to migrate',

    // Legacy Upgrade
    legacyUpgradeTitle: 'Recover Legacy Bookmarks',
    legacyUpgradeDesc: 'Found {count} legacy bookmarks. They will be saved to Inbox, backed up and verified, then cleaned from browser storage.',
    legacyUpgradeNote: 'Existing files will not be overwritten. You can resume anytime if interrupted.',
    legacyReselect: 'Please reselect save folder before upgrading',
    legacySavingProgress: 'Saving {current} / {total}…',
    legacyBackupProgress: 'Backing up and verifying legacy data…',
    legacyStartUpgrade: 'Start Upgrade',
    legacyUpgrading: 'Upgrading…',
    legacyKeepOpen: 'Please keep this page open.',
  },
  zh: {
    // Content script buttons & toasts
    btnBookmark: '☆ 收藏',
    btnBookmarked: '✓ 已收藏',
    btnSaving: '保存中…',
    btnRetry: '点击重试',
    btnSavedTextOnly: '✓ 正文已收藏 · {count} 张图片未保存',
    toastSelectText: '请先选中要收藏的文本',
    toastEmptyText: '选中的内容为空',
    toastStreaming: '正在生成回复，请稍后摘录',
    toastChatGPTOnly: '请在 ChatGPT 对话页面中收藏',
    toastClipping: '正在摘录…',
    toastClipped: '✓ 已摘录至 {notebook}',
    toastConfigureLibraryFirst: '请先在插件中设置笔记库',
    toastExtensionUpdated: '扩展已更新，请刷新页面后重试',
    toastSaveFailed: '保存失败',
    excerptPrefix: '摘录: ',

    // Background service worker
    contextMenuSaveSelection: '收藏选中内容到 GuideRail',
    conversationChanged: '对话正在切换，请稍后重试',
    invalidImageSource: '图片请求来源无效',
    imageDownloadFailed: '图片下载失败，请稍后重试',
    storagePermissionFailed: '保存失败，请检查目录权限与磁盘空间',
    libraryUnconfigured: '请先在插件中设置笔记库',
    libraryReauthorize: '请在插件中重新授权笔记库',
    libraryOpenFailed: '无法打开笔记库',

    // Sidepanel Header & List
    tagline: '留住值得回看的内容',
    themeButtonTitle: '点击切换外观风格',
    themeButtonLabel: '风格',
    loadingLibrary: '正在打开笔记库…',
    bookmarks: '收藏',
    tagAll: '#全部',
    filterFolder: '查看文件夹',
    allBookmarks: '全部收藏',
    emptyAll: '打开 ChatGPT 对话，点击回复下方“☆ 收藏”，就能在这里找到。',
    emptyFolder: '这个文件夹还没有收藏。新收藏会先进入收件箱。',
    undoRemoved: '已移出收藏，文件仍保留。',
    undo: '撤销',
    retry: '重试',
    processing: '正在处理…',

    // Sidepanel Reader
    back: '← 返回',
    jumpToSource: '回到原回复',
    reading: '正在读取收藏…',
    readError: '读取笔记失败',
    readErrorDetail: '这条收藏暂时无法完整读取，请检查笔记和附件是否仍在保存文件夹中。',
    retryRead: '重新读取',
    actionFailed: '操作失败，请重试',
    openSettingsNotice: '已打开设置页面，请在那里选择保存文件夹。',
    selectionCancelled: '已取消，可以随时重新选择。',
    folderPickerError: '暂时无法选择文件夹，请重新打开扩展后再试。',
    listLoadError: '暂时无法读取收藏列表。请检查保存文件夹是否可访问。',
    legacyReadError: '旧收藏暂时无法读取，浏览器中的旧数据仍保留。',
    retryLegacy: '重试读取旧收藏',
    legacyUpgradeComplete: '旧收藏已接回，完整备份已保存，浏览器旧副本已清理。旧版本未保存的图片需要回原对话重新收藏。',

    // Sidepanel Actions (Card Context Menu & Modal)
    moreActions: '更多操作',
    rename: '修改标题',
    titleLabel: '标题',
    renameTitle: '新标题',
    move: '移动到…',
    folderLabel: '文件夹',
    selectDestination: '选择目标文件夹',
    newFolder: '新建文件夹…',
    newFolderName: '新文件夹名称',
    remove: '移出收藏',
    details: '详情',
    detailsLocation: '位置：{notebook}',
    detailsFile: '文件：{filename}',
    cancel: '取消',
    confirm: '确认',
    save: '保存',
    close: '关闭',

    // Sidepanel Card
    previewUnavailable: '预览不可用',
    image: '图片',
    excerptUnavailable: '摘要暂不可用，点击查看',
    imagesCount: '{count} 张图片',

    // Setup & Permissions
    permissionPromptTitle: '继续访问收藏',
    permissionPromptDesc: '浏览器重启后需重新确认访问权限，这是安全机制。',
    allowAccess: '允许访问 "{name}"',
    permissionDeniedRetry: '尚未获得访问权限，请再试一次。',
    connectObsidianRecommended: '连接 Obsidian（推荐）',
    folderMovedQuestion: '文件夹已搬走？',
    reselectFolder: '重新选择文件夹',
    whereToSave: '把收藏保存在哪里？',
    whereToSaveDesc: '文字和图片会自动保存在这个文件夹。',
    selectFolderButton: '选择保存文件夹',

    // Sidepanel Settings Drawer
    settings: '设置',
    appearance: '外观风格',
    appearanceDesc: '点击快速切换 Bear 经典主题',
    themeSystem: '跟随系统',
    themeRedDark: '红石墨夜间',
    themeRedLight: '红石墨日间',
    themeNord: '北欧雪国',
    themeSolarized: '羊皮纸',
    language: '界面语言',
    languageDesc: '选择侧边栏与提示的显示语言',
    langAuto: '跟随系统 (Auto)',
    langZh: '简体中文',
    langEn: 'English',
    storageTitle: '保存位置',
    obsidianVault: 'Obsidian Vault',
    localFolder: '保存文件夹',
    obsidianDesc: '通过本机 Companion 保存，无需文件夹授权。',
    folderDesc: '新收藏自动进入收件箱。',
    rePair: '重新配对',
    useFolder: '改用文件夹',
    changeFolder: '更换保存文件夹',
    connectObsidian: '连接 Obsidian',
    maintenance: '高级维护',
    maintenanceDesc: '仅在列表缺失或异常时使用。修复会从笔记文件恢复列表，并保留原列表备份。',
    rebuildIndex: '修复收藏列表',
    rebuildSuccess: '收藏列表已修复，共 {count} 条。',
    backupFootnote: '备份笔记库时，请复制整个保存文件夹。',

    // Companion Setup
    companionSetupTitle: '连接 Obsidian',
    companionSetupDesc: '在 Obsidian 的 GuideRail Companion 设置中生成配对码，再填到这里。连接后不需要浏览器文件夹授权。',
    enterPairingCode: '输入配对码',
    pairingCode: '配对码',
    pairingCodePlaceholder: 'ABCD2345',
    localPort: '本地端口',
    connect: '连接',
    chooseFolder: '选择保存文件夹',
    folderFallback: '或者直接授权本地普通磁盘目录保存（无需 Obsidian）',
    switchToNormalFolder: '改用普通文件夹',
    companionHelpLink: '尚未安装 Obsidian 插件？查看安装教程与下载',
    companionConnectedNotice: '已连接到 Obsidian Vault“{name}”。',

    // Companion Migration
    migrateFolder: '迁移普通文件夹',
    migrateFolderDesc: '先比较原文件夹与当前 Vault；不会覆盖冲突内容，也不会删除原文件。',
    migratePreviewDesc: '原收藏 {sourceCount} 条；待导入 {importable} 条；已存在且相同 {identical} 条；冲突 {conflicts} 条。',
    migrateInspect: '检查迁移',
    migrateStart: '开始迁移',
    migratingProgress: '正在导入 {done}/{total}',
    migrateComplete: '迁移完成：导入 {imported} 条，跳过 {identical} 条相同收藏，保留 {conflicts} 条冲突。原文件未删除。',
    migrateNoDir: '没有找到以前选择的普通文件夹',
    migrateNeedPerm: '需要允许读取原文件夹才能迁移',

    // Legacy Upgrade
    legacyUpgradeTitle: '接回旧收藏',
    legacyUpgradeDesc: '发现 {count} 条旧收藏。将保存到收件箱，备份并校验全部旧数据后，清理浏览器中的旧副本。',
    legacyUpgradeNote: '已有文件不会覆盖。中断后可重新点击继续。',
    legacyReselect: '请重新选择保存文件夹后继续升级',
    legacySavingProgress: '正在保存 {current} / {total} 条…',
    legacyBackupProgress: '正在备份并校验旧数据…',
    legacyStartUpgrade: '开始升级',
    legacyUpgrading: '正在升级…',
    legacyKeepOpen: '请保持此页面打开。',
  },
} as const;

export type TranslationKey = keyof typeof dictionaries.en;

export function getSystemLocale(): Locale {
  const lang = (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.())
    || (typeof navigator !== 'undefined' && navigator.language)
    || 'en';
  return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getEffectiveLocale(setting?: LanguageSetting): Locale {
  if (setting === 'en') return 'en';
  if (setting === 'zh') return 'zh';
  return getSystemLocale();
}

let currentSetting: LanguageSetting = 'auto';

export function setGlobalLanguageSetting(setting: LanguageSetting) {
  currentSetting = setting;
}

export function getGlobalLanguageSetting(): LanguageSetting {
  return currentSetting;
}

export function t(key: TranslationKey, params?: Record<string, string | number>, forcedLocale?: Locale): string {
  const locale = forcedLocale ?? getEffectiveLocale(currentSetting);
  let text: string = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
