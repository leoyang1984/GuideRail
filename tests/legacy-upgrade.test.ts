// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emptyStorage } from '../src/storage/schema';
const calls = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), archive: vi.fn() }));
vi.mock('../src/storage/storage', () => ({ ChromeStorageRepository: class { read() { return calls.read(); } } }));
vi.mock('../src/library/library', () => ({ saveCapture: calls.save }));
vi.mock('../src/library/migration', () => ({ archiveLegacy: calls.archive }));
import { LegacyUpgrade } from '../src/sidepanel/components/LegacyUpgrade';
let root: Root; let host: HTMLDivElement; let error: unknown; const complete = vi.fn(async () => {});
beforeEach(() => {
  calls.save.mockReset().mockResolvedValue({}); calls.archive.mockReset().mockResolvedValue(undefined); complete.mockClear(); error = undefined;
  const data = emptyStorage(); data.sources.one = { id: 'one', conversationId: 'chat', messageId: 'reply', pageUrl: 'https://chatgpt.com/c/chat', role: 'assistant', text: '旧收藏', createdAt: '2026-09-09T00:00:00Z', updatedAt: '2026-09-09T00:00:00Z' }; calls.read.mockResolvedValue(data);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ 'guiderail-library-target': 'target' }) } } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(createElement(LegacyUpgrade, { count: 1, busy: false, action: async task => { try { await task(); } catch (e) { error = e; } }, onComplete: complete }))); }
it('uses one disclosed upgrade action and only completes after archival succeeds', async () => {
  await render(); expect(host.querySelectorAll('button')).toHaveLength(1); expect(host.textContent).toMatch(/备份并校验全部旧数据后|backed up and verified/);
  await act(async () => host.querySelector('button')!.click());
  expect(calls.save).toHaveBeenCalledOnce(); expect(calls.archive).toHaveBeenCalledWith(await calls.read(), 'target'); expect(complete).toHaveBeenCalledOnce();
  expect(calls.save.mock.invocationCallOrder[0]).toBeLessThan(calls.archive.mock.invocationCallOrder[0]);
});
it('does not archive after failed copying and can restart', async () => {
  calls.save.mockRejectedValueOnce(new Error('disk full')); await render();
  await act(async () => host.querySelector('button')!.click());
  expect(error).toBeInstanceOf(Error); expect(calls.archive).not.toHaveBeenCalled(); expect(complete).not.toHaveBeenCalled();
  await act(async () => host.querySelector('button')!.click()); expect(complete).toHaveBeenCalledOnce();
});
it('does not report completion when backup or verification fails', async () => {
  calls.archive.mockRejectedValueOnce(new Error('backup failed')); await render();
  await act(async () => host.querySelector('button')!.click());
  expect(complete).not.toHaveBeenCalled(); expect(host.querySelector('button')!.textContent).toMatch(/开始升级|Start Upgrade/);
});
