// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const handles = vi.hoisted(() => ({ directory: null as unknown }));
vi.mock('../src/export/directory', async original => ({ ...await original<typeof import('../src/export/directory')>(), loadDirectory: async () => handles.directory }));
import { LibraryApp } from '../src/sidepanel/LibraryApp';
let host: HTMLDivElement; let reactRoot: Root;
beforeEach(() => {
  handles.directory = null;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
  vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'guiderail-language': 'zh' }), set: async () => {}, remove: async () => {} }, onChanged: { addListener: vi.fn(), removeListener: vi.fn() } } });
  host = document.createElement('div'); document.body.append(host); reactRoot = createRoot(host);
});
afterEach(async () => { await act(async () => reactRoot.unmount()); host.remove(); vi.unstubAllGlobals(); });
it('shows a mandatory folder setup instead of a usable collection screen', async () => {
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  expect(host.textContent).toContain('把收藏保存在哪里？');
  expect(host.textContent).toContain('选择保存文件夹');
  expect(host.querySelector('.bookmark-open')).toBeNull();
  expect(host.querySelector('select')).toBeNull();
  expect(host.querySelectorAll('button')).toHaveLength(2);
});
it('shows reauthorization when a previously selected directory is no longer granted', async () => {
  handles.directory = { name: '我的笔记', queryPermission: async () => 'prompt' };
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  expect(host.textContent).toContain('继续访问收藏');
  expect(host.textContent).toContain('允许访问');
  expect(host.textContent).toContain('我的笔记');
});
it('reads the current Markdown from disk and renders its formatting when opening a note', async () => {
  const entry = { id: 'a'.repeat(64), filename: `${'a'.repeat(64)}.md`, title: '已收藏的笔记', notebook: '收件箱', conversationId: 'chat', messageId: 'message', pageUrl: 'https://chatgpt.com/c/chat', createdAt: '2026-09-09T00:00:00Z', images: [] };
  const read = vi.fn(async () => '---\ntitle: "已收藏的笔记"\n---\n\n## 外部编辑的新标题\n\n**磁盘正文**');
  handles.directory = { name: '我的笔记', queryPermission: async () => 'granted', getDirectoryHandle: async (name: string) => ({ getFileHandle: async () => ({ getFile: async () => ({ text: name === '.guiderail' ? async () => JSON.stringify({ version: 1, entries: [entry] }) : read }) }) }) };
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  expect(read).not.toHaveBeenCalled();
  expect(host.querySelector('select[aria-label="查看文件夹"]')).toBeNull();
  await act(async () => (host.querySelector('.bookmark-open') as HTMLButtonElement).click());
  expect(read).toHaveBeenCalledOnce();
  expect(host.querySelector('.library-location')).toBeNull();
  expect(host.querySelector('.data-settings')).toBeNull();
  expect(Array.from(host.querySelectorAll('button')).some(button => button.textContent === '刷新')).toBe(false);
  expect(host.querySelector('summary[aria-label="更多操作"]')).not.toBeNull();
  expect(host.querySelector('.reply-more')?.hasAttribute('open')).toBe(false);
  expect(host.querySelector('.reply-body h2')?.textContent).toBe('外部编辑的新标题');
  expect(host.querySelector('.reply-body strong')?.textContent).toBe('磁盘正文');
  const menu = host.querySelector<HTMLDetailsElement>('.reply-more')!;
  await act(async () => { menu.open = true; menu.dispatchEvent(new Event('toggle')); });
  expect(menu.querySelector('input')).toBeNull(); expect(menu.querySelector('select')).toBeNull();
  await act(async () => Array.from(menu.querySelectorAll('button')).find(button => button.textContent === '修改标题')!.click());
  expect(menu.querySelector('input')).not.toBeNull(); expect(menu.querySelector('select')).toBeNull();
  expect(document.activeElement).toBe(menu.querySelector('input'));
  await act(async () => menu.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(menu.open).toBe(false); expect(document.activeElement).toBe(menu.querySelector('summary'));
});

it('defaults to all folders and filtering never changes the future save destination', async () => {
  const entries = ['收件箱', '设计参考'].map((notebook, i) => ({ id: String(i).repeat(64), filename: `${String(i).repeat(64)}.md`, title: `收藏${i}`, notebook, conversationId: 'chat', messageId: `message${i}`, pageUrl: 'https://chatgpt.com/c/chat', createdAt: '2026-09-09T00:00:00Z', images: [] }));
  const set = vi.fn(async () => {}); chrome.storage.local.set = set;
  // A legacy save destination must not restrict the initial view.
  chrome.storage.local.get = vi.fn(async () => ({ 'guiderail-notebook': '设计参考', 'guiderail-language': 'zh' })) as typeof chrome.storage.local.get;
  handles.directory = { name: '收藏', queryPermission: async () => 'granted', getDirectoryHandle: async () => ({ getFileHandle: async () => ({ getFile: async () => ({ text: async () => JSON.stringify({ version: 1, entries }) }) }) }) };
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  expect(host.querySelectorAll('.bookmark-open')).toHaveLength(2);
  const filter = host.querySelector<HTMLSelectElement>('select[aria-label="查看文件夹"]')!;
  expect(filter.value).toBe('');
  await act(async () => { filter.value = '设计参考'; filter.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelectorAll('.bookmark-open')).toHaveLength(1);
  expect(host.querySelector('.bookmark-open')?.textContent).toContain('收藏1');
  // Changing the filter persists the selection, but must NOT change the save destination (notebook).
  expect(set).toHaveBeenCalledWith({ 'guiderail-folder-filter': '设计参考' });
  expect(set).not.toHaveBeenCalledWith(expect.objectContaining({ 'guiderail-notebook': expect.anything() }));
});
it('allows cancelling folder selection and trying again from the same single entry', async () => {
  const picker = vi.fn(async () => { throw new DOMException('Cancelled', 'AbortError'); });
  Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: picker });
  try {
    await act(async () => reactRoot.render(createElement(LibraryApp)));
    const choose = () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === '选择保存文件夹')!;
    await act(async () => choose().click());
    expect(host.textContent).toContain('已取消');
    expect((choose() as HTMLButtonElement).disabled).toBe(false);
    await act(async () => choose().click());
    expect(picker).toHaveBeenCalledTimes(2);
  } finally { delete (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker; }
});
it('opens the dedicated setting page only when the picker cannot run here', async () => {
  const create = vi.fn(async () => ({}));
  vi.stubGlobal('chrome', { ...chrome, tabs: { create }, runtime: { getURL: (path: string) => `chrome-extension://test/${path}` } });
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  await act(async () => Array.from(host.querySelectorAll('button')).find(button => button.textContent === '选择保存文件夹')!.click());
  expect(create).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledWith({ url: 'chrome-extension://test/src/sidepanel/index.html?view=settings' });
  expect(host.textContent).toContain('已打开设置页面');
});

function listFixture(read: () => Promise<string>) {
  handles.directory = { name: '收藏', queryPermission: async () => 'granted', getDirectoryHandle: async () => ({ getFileHandle: async () => ({ getFile: async () => ({ text: read }) }) }) };
}
function sampleEntry(n: number) { return { id: String(n).repeat(64), filename: `${String(n).repeat(64)}.md`, title: `收藏${n}`, notebook: '收件箱', conversationId: 'chat', messageId: `message${n}`, pageUrl: 'https://chatgpt.com/c/chat', createdAt: '2026-09-09T00:00:00Z', images: [] }; }
it('shows read failure instead of an empty collection and recovers through local retry', async () => {
  let broken = true;
  listFixture(async () => broken ? 'invalid json' : JSON.stringify({ version: 1, entries: [sampleEntry(1)] }));
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('无法读取收藏列表');
  expect(host.querySelector('.empty-state')).toBeNull(); expect(host.querySelector('.bookmark-open')).toBeNull();
  broken = false;
  await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '重试')!.click());
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.querySelectorAll('.bookmark-open')).toHaveLength(1);
});
it('automatically updates on change notifications and window focus without a refresh button', async () => {
  let entries = [sampleEntry(1)]; listFixture(async () => JSON.stringify({ version: 1, entries }));
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  expect(Array.from(host.querySelectorAll('button')).some(b => b.textContent === '刷新')).toBe(false);
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
  entries = [sampleEntry(1), sampleEntry(2)];
  await act(async () => listener({ 'guiderail-library-revision': { newValue: 'updated' } }, 'local'));
  expect(host.querySelectorAll('.bookmark-open')).toHaveLength(2);
  entries = [sampleEntry(2)];
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(host.querySelectorAll('.bookmark-open')).toHaveLength(1);
});
it('ignores an older read completing after a newer refresh', async () => {
  let finish!: (value: string) => void; let first = true;
  listFixture(() => { if (first) { first = false; return new Promise(resolve => { finish = resolve; }); } return Promise.resolve(JSON.stringify({ version: 1, entries: [sampleEntry(2)] })); });
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => finish(JSON.stringify({ version: 1, entries: [sampleEntry(1)] })));
  expect(host.querySelector('.bookmark-open')?.textContent).toContain('收藏2');
});
it('lets a user retry permission after denial', async () => {
  let granted = false; let accept = false;
  handles.directory = { name: '收藏', queryPermission: async () => granted ? 'granted' : 'prompt', requestPermission: async () => { granted = accept; return granted ? 'granted' : 'denied'; }, getDirectoryHandle: async () => { throw new DOMException('Missing', 'NotFoundError'); } };
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toContain('尚未获得访问权限');
  accept = true;
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).not.toContain('继续访问收藏'); expect(host.querySelector('.empty-state')).not.toBeNull();
});
it('retries a failed note read in place without returning to the collection list', async () => {
  let broken = true; const entry = sampleEntry(1);
  handles.directory = { name: '收藏', queryPermission: async () => 'granted', getDirectoryHandle: async (name: string) => ({ getFileHandle: async () => ({ getFile: async () => ({ text: async () => { if (name === '.guiderail') return JSON.stringify({ version: 1, entries: [entry] }); if (broken) throw new Error('unavailable'); return '# 已恢复正文'; } }) }) }) };
  await act(async () => reactRoot.render(createElement(LibraryApp)));
  await act(async () => (host.querySelector('.bookmark-open') as HTMLButtonElement).click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('无法完整读取');
  broken = false;
  await act(async () => Array.from(host.querySelectorAll('button')).find(b => b.textContent === '重新读取')!.click());
  expect(host.querySelector('[role="alert"]')).toBeNull(); expect(host.querySelector('.reply-body h1')?.textContent).toBe('已恢复正文');
  expect(host.querySelector('.bookmark-open')).toBeNull();
});
