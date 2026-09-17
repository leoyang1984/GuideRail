import { afterEach, expect, it, vi } from 'vitest';

const library = vi.hoisted(() => ({ save: vi.fn(), ready: vi.fn() }));
vi.mock('../src/library/library', () => ({ saveCapture: library.save, rootDirectory: library.ready }));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function setup(currentUrl = 'https://chatgpt.com/c/new-chat') {
  vi.resetModules(); library.save.mockReset().mockResolvedValue({ notebook: '收件箱' });
  let listener: (message: unknown, sender: chrome.runtime.MessageSender, respond: (result: unknown) => void) => unknown;
  let menuClickListener: ((info: { menuItemId: string }, tab?: { id?: number }) => void) | undefined;
  let commandListener: ((command: string) => void) | undefined;
  const set = vi.fn(async () => {});
  const getTab = vi.fn(async () => ({ url: currentUrl }));
  const sendMessage = vi.fn(async () => ({ ok: true }));
  const queryTabs = vi.fn(async () => [{ id: 7, url: currentUrl }]);
  const createMenu = vi.fn((_opts: unknown, cb?: () => void) => { cb?.(); });
  const removeAllMenus = vi.fn((cb?: () => void) => { cb?.(); });
  vi.stubGlobal('chrome', {
    runtime: { id: 'guiderail', onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() }, onMessage: { addListener: (fn: typeof listener) => { listener = fn; } } },
    sidePanel: { setPanelBehavior: vi.fn(async () => {}) },
    tabs: { get: getTab, sendMessage, query: queryTabs },
    storage: { local: { get: vi.fn(async () => ({})), set } },
    contextMenus: {
      create: createMenu,
      removeAll: removeAllMenus,
      onClicked: { addListener: (fn: typeof menuClickListener) => { menuClickListener = fn; } },
    },
    commands: {
      onCommand: { addListener: (fn: typeof commandListener) => { commandListener = fn; } },
    },
  });
  await import('../src/background/service-worker');
  const sendRaw = (message: unknown, url = 'https://chatgpt.com/c/new-chat', frameId = 0) => new Promise(resolve => {
    listener(message, { id: 'guiderail', url, frameId, tab: { id: 7 } as chrome.tabs.Tab }, resolve);
  });
  const send = (url: string, conversationId = 'new-chat', frameId = 0, preferredTitle?: string) => new Promise(resolve => {
    listener({ kind: 'guiderail:command', command: { type: 'saveReply', preferredTitle, capture: {
      conversationId, messageId: 'reply', role: 'assistant', pageUrl: `https://chatgpt.com/c/${conversationId}`, text: 'A saved reply',
    } } }, { id: 'guiderail', url, frameId, tab: { id: 7 } as chrome.tabs.Tab }, resolve);
  });
  const triggerMenuClick = (menuItemId = 'guiderail:save-selection', tabId = 7) => {
    menuClickListener?.({ menuItemId }, { id: tabId });
  };
  const triggerCommand = async (command = 'save-selection') => {
    commandListener?.(command);
    await new Promise(resolve => setTimeout(resolve, 10));
  };
  return { send, sendRaw, set, getTab, save: library.save, sendMessage, createMenu, removeAllMenus, triggerMenuClick, triggerCommand };
}

it.each(['https://chatgpt.com/', 'https://chatgpt.com/c/old-chat'])('saves after SPA navigation from %s using the current tab URL', async url => {
  const { send, set, getTab, save } = await setup();
  expect(await send(url)).toEqual({ ok: true, notebook: '收件箱' });
  expect(getTab).toHaveBeenCalledWith(7);
  expect(save).toHaveBeenCalledOnce();
  expect(set).not.toHaveBeenCalled();
});

it('rejects a capture from a conversation that is no longer current', async () => {
  const { send, set } = await setup();
  expect(await send('https://chatgpt.com/c/old-chat', 'old-chat')).toEqual({ ok: false, error: 'conversation-changed' });
  expect(set).not.toHaveBeenCalled();
});

it.each(['https://example.com/c/new-chat', 'https://chatgpt.com/'])('rejects a tab without a current ChatGPT conversation: %s', async url => {
  const { send, set } = await setup(url);
  expect(await send('https://chatgpt.com/c/new-chat')).toEqual({ ok: false, error: 'conversation-changed' });
  expect(set).not.toHaveBeenCalled();
});

it('rejects foreign origins and child frames', async () => {
  const { send, set } = await setup();
  expect(await send('https://example.com/c/new-chat')).toEqual({ ok: false, error: 'invalid-source' });
  expect(await send('https://chatgpt.com/c/new-chat', 'new-chat', 1)).toEqual({ ok: false, error: 'invalid-source' });
  expect(set).not.toHaveBeenCalled();
});

it('reports storage failures without claiming the reply was saved', async () => {
  const { send, save } = await setup();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  save.mockRejectedValueOnce(new Error('目录授权已失效'));
  expect(await send('https://chatgpt.com/c/new-chat')).toEqual({ ok: false, error: '目录授权已失效' });
});

it('saves new captures to the inbox even when an old destination setting exists', async () => {
  const { send, save } = await setup();
  chrome.storage.local.get = vi.fn(async () => ({ 'guiderail-notebook': '旧保存位置' })) as typeof chrome.storage.local.get;
  expect(await send('https://chatgpt.com/c/new-chat')).toEqual({ ok: true, notebook: '收件箱' });
  expect(save.mock.calls[0][1]).toBe('收件箱');
});

it('downloads an allowed cross-origin image only for the current main-frame conversation', async () => {
  const { sendRaw } = await setup();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })));
  expect(await sendRaw({ kind: 'guiderail:imageDownload', conversationId: 'new-chat', url: 'https://images.openai.com/static/reference' })).toEqual({ ok: true, data: 'data:image/png;base64,iVBORw==', size: 4 });
  expect(await sendRaw({ kind: 'guiderail:imageDownload', conversationId: 'other', url: 'https://images.openai.com/static/reference' })).toEqual({ ok: false, error: expect.stringMatching(/对话正在切换，请稍后重试|Conversation changed, please retry shortly/) });
  expect(await sendRaw({ kind: 'guiderail:imageDownload', conversationId: 'new-chat', url: 'https://example.com/image.png' })).toEqual({ ok: false, error: '该图片来源暂不支持收藏', errorCode: 'unsupported-source' });
});

it('passes preferredTitle to saveCapture when provided', async () => {
  const { send, save } = await setup();
  expect(await send('https://chatgpt.com/c/new-chat', 'new-chat', 0, '摘录: 核心重点')).toEqual({ ok: true, notebook: '收件箱' });
  expect(save.mock.calls[0][2]).toBe('摘录: 核心重点');
});

it('registers context menu for selection and forwards click to tab', async () => {
  const { createMenu, triggerMenuClick, sendMessage } = await setup();
  expect(createMenu).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'guiderail:save-selection',
      title: expect.stringMatching(/收藏选中内容到 GuideRail|Clip selection to GuideRail/),
      contexts: ['selection'],
    }),
    expect.any(Function),
  );
  triggerMenuClick('guiderail:save-selection', 7);
  expect(sendMessage).toHaveBeenCalledWith(7, { kind: 'guiderail:clipSelection' });
});

it('forwards save-selection command to active ChatGPT tab', async () => {
  const { triggerCommand, sendMessage } = await setup('https://chatgpt.com/c/new-chat');
  await triggerCommand('save-selection');
  expect(sendMessage).toHaveBeenCalledWith(7, { kind: 'guiderail:clipSelection' });
});
