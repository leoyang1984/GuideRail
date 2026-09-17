import { libraryBackend } from '../library/backend';
import { getChatGPTConversationId, isChatGPTUrl } from '../domain/conversation';
import { downloadImage, ImageDownloadError } from './image-download';
import { t, setGlobalLanguageSetting, LANGUAGE_SETTING_KEY, type LanguageSetting } from '../i18n/core';
import { ChromeStorageRepository, createDispatcher } from '../storage/storage';

function configureSidePanel() {
  void chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })
    ?.catch?.((error: unknown) => console.error('Could not configure GuideRail side panel.', error));
}

function setupContextMenu() {
  if (!chrome.contextMenus) return;
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus?.create({
        id: 'guiderail:save-selection',
        title: t('contextMenuSaveSelection'),
        contexts: ['selection'],
        documentUrlPatterns: ['https://chatgpt.com/*'],
      }, () => {
        void chrome.runtime?.lastError;
      });
    });
  } catch { /* Context menus unavailable */ }
}

chrome.storage?.local?.get?.(LANGUAGE_SETTING_KEY)?.then?.(res => {
  const lang = res?.[LANGUAGE_SETTING_KEY] as LanguageSetting | undefined;
  if (lang) setGlobalLanguageSetting(lang);
  setupContextMenu();
})?.catch?.(() => {});

chrome.storage?.onChanged?.addListener?.((changes, area) => {
  if (area === 'local' && LANGUAGE_SETTING_KEY in changes) {
    const next = changes[LANGUAGE_SETTING_KEY].newValue as LanguageSetting | undefined;
    if (next) {
      setGlobalLanguageSetting(next);
      setupContextMenu();
    }
  }
});

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanel();
  setupContextMenu();
});
chrome.runtime.onStartup.addListener(() => {
  configureSidePanel();
  setupContextMenu();
});
configureSidePanel();
setupContextMenu();

chrome.contextMenus?.onClicked?.addListener((info, tab) => {
  if (info.menuItemId === 'guiderail:save-selection' && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { kind: 'guiderail:clipSelection' }).catch(() => {});
  }
});

chrome.commands?.onCommand?.addListener(command => {
  if (command === 'save-selection') {
    chrome.tabs.query?.({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id !== undefined && isChatGPTUrl(tab.url ?? '')) {
        chrome.tabs.sendMessage(tab.id, { kind: 'guiderail:clipSelection' }).catch(() => {});
      }
    }).catch(() => {});
  }
});

const repository = new ChromeStorageRepository();
const dispatch = createDispatcher(repository);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  if (message?.kind === 'guiderail:libraryReady') {
    void libraryBackend.status().then(async status => {
      if (!status.configured) throw new Error(t('libraryUnconfigured'));
      if (!status.available) throw new Error(status.error || t('libraryReauthorize'));
      const settings = await chrome.storage.local.get('guiderail-library-target'); respond({ ok: true, target: settings['guiderail-library-target'] });
    }).catch(error => respond({ ok: false, error: error instanceof Error ? error.message : t('libraryOpenFailed') })); return true;
  }
  if (message?.kind === 'guiderail:captureContext' && sender.tab && getChatGPTConversationId(sender.url ?? '')) {
    void repository.read().then(data => respond({ ok: true, data })).catch(() => respond({ ok: false })); return true;
  }
  if (message?.kind === 'guiderail:imageDownload') {
    const run = async () => {
      if (!sender.tab || sender.tab.id === undefined || sender.frameId !== 0 || !isChatGPTUrl(sender.url ?? '')) {
        respond({ ok: false, error: t('invalidImageSource') }); return;
      }
      const tab = await chrome.tabs.get(sender.tab.id);
      const conversationId = getChatGPTConversationId(tab.url ?? '');
      if (!conversationId || conversationId !== message.conversationId) {
        respond({ ok: false, error: t('conversationChanged') }); return;
      }
      const image = await downloadImage(String(message.url ?? ''));
      respond({ ok: true, ...image });
    };
    void run().catch((error: unknown) => respond({ ok: false, error: error instanceof Error ? error.message : t('imageDownloadFailed'), errorCode: error instanceof ImageDownloadError ? error.code : undefined }));
    return true;
  }
  if (message?.kind !== 'guiderail:command') return;
  const run = async () => {
    if (sender.tab) {
      if (sender.tab.id === undefined || sender.frameId !== 0 || !isChatGPTUrl(sender.url ?? '') || message.command?.type !== 'saveReply') {
        respond({ ok: false, error: 'invalid-source' }); return;
      }
      // Read the current tab URL: an SPA can change conversations without replacing its document.
      const tab = await chrome.tabs.get(sender.tab.id);
      const conversationId = getChatGPTConversationId(tab.url ?? '');
      if (!conversationId || conversationId !== message.command.capture?.conversationId) {
        respond({ ok: false, error: 'conversation-changed' }); return;
      }
    }
    if (message.command?.type === 'saveReply') {
      const entry = await libraryBackend.saveCapture(message.command.capture, '收件箱', message.command.preferredTitle, message.target);
      respond({ ok: true, notebook: entry.notebook }); return;
    }
    await dispatch(message.command);
    respond({ ok: true });
  };
  void run().catch((error: unknown) => {
    console.error('Could not save GuideRail changes.', error);
    respond({ ok: false, error: error instanceof Error ? error.message : t('storagePermissionFailed') });
  });
  return true;
});
