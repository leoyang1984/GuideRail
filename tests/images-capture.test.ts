// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
async function setup(ready = true) {
  vi.resetModules(); vi.useFakeTimers(); window.history.replaceState({}, '', '/c/chat');
  document.body.innerHTML = '<div data-message-id="image-reply" data-message-author-role="assistant"><p>开始</p><img src="https://chatgpt.com/image.png"><p>结束</p></div>';
  const img = document.querySelector('img')!;
  Object.defineProperties(img, { naturalWidth: { value: 1024 }, naturalHeight: { value: 1024 }, complete: { value: true } });
  const send = vi.fn(async (message: { kind: string }): Promise<Record<string, unknown>> => message.kind === 'guiderail:libraryReady' ? { ok: ready, target: 'library-target', error: '请先设置笔记库' } : { ok: true, notebook: '图片' });
  vi.stubGlobal('chrome', { runtime: { id: 'extension', sendMessage: send, onMessage: { addListener: vi.fn() } } });
  const fetchImage = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } }));
  vi.stubGlobal('fetch', fetchImage);
  await import('../src/content/messages');
  return { send, fetchImage, button: document.querySelector('button')! };
}
it('blocks capture before downloading when no library has been configured', async () => {
  const { button, fetchImage } = await setup(false); button.click();
  await vi.waitFor(() => expect(button.textContent).toContain('请先设置笔记库'));
  expect(fetchImage).not.toHaveBeenCalled();
});
it('collects images and carries the original image position and target to the writer', async () => {
  const { button, send } = await setup(); button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/已收藏|Bookmarked/));
  const message = send.mock.calls.find(([m]) => m.kind === 'guiderail:command')?.[0] as unknown as { target: string; command: { capture: { markdown: string; images: { data: string }[] } } };
  expect(message.target).toBe('library-target'); expect(message.command.capture.images[0].data).toMatch(/^data:image\/png;base64,/);
  expect(message.command.capture.markdown).toMatch(/开始[\s\S]*GUIDERAILIMAGE0PLACEHOLDER[\s\S]*结束/);
});
it('does not report success if an image download fails', async () => {
  const { button, send, fetchImage } = await setup(); fetchImage.mockRejectedValueOnce(new Error('图片下载失败')); button.click();
  await vi.waitFor(() => expect(button.textContent).toContain('图片下载失败'));
  expect(send.mock.calls.some(([m]) => m.kind === 'guiderail:command')).toBe(false);
});

it('routes cross-origin images through the extension background instead of page fetch', async () => {
  const { button, send, fetchImage } = await setup();
  document.querySelector('img')!.src = 'https://images.openai.com/static/reference';
  send.mockImplementation(async (message: { kind: string }) => {
    if (message.kind === 'guiderail:libraryReady') return { ok: true, target: 'library-target' };
    if (message.kind === 'guiderail:imageDownload') return { ok: true, data: 'data:image/png;base64,iVBORw0KGgo=', size: 8 };
    return { ok: true, notebook: '收件箱' };
  });
  button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/已收藏|Bookmarked/));
  expect(fetchImage).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith(expect.objectContaining({ kind: 'guiderail:imageDownload', conversationId: 'chat', url: 'https://images.openai.com/static/reference' }));
});

it('shows a Chinese recoverable error returned by the background downloader', async () => {
  const { button, send } = await setup();
  document.querySelector('img')!.src = 'https://images.openai.com/static/reference';
  send.mockImplementation(async (message: { kind: string }) => {
    if (message.kind === 'guiderail:libraryReady') return { ok: true, target: 'library-target' };
    if (message.kind === 'guiderail:imageDownload') return { ok: false, error: '图片下载失败，请稍后重试' };
    return { ok: true };
  });
  button.click();
  await vi.waitFor(() => expect(button.textContent).toContain('图片下载失败，请稍后重试'));
  expect(button.textContent).not.toContain('Failed to fetch');
  expect(send.mock.calls.some(([message]) => message.kind === 'guiderail:command')).toBe(false);
});

it('saves mixed-reply text while clearly reporting unsupported images', async () => {
  const { button, send } = await setup();
  document.querySelector('img')!.src = 'https://example.com/reference.jpg';
  send.mockImplementation(async (message: { kind: string }) => {
    if (message.kind === 'guiderail:libraryReady') return { ok: true, target: 'library-target' };
    if (message.kind === 'guiderail:imageDownload') return { ok: false, error: '该图片来源暂不支持收藏', errorCode: 'unsupported-source' };
    return { ok: true, notebook: '收件箱' };
  });
  button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/✓ 正文已收藏 · 1 张图片未保存|✓ Text saved · 1 images skipped/));
  const saved = send.mock.calls.find(([message]) => message.kind === 'guiderail:command')?.[0] as unknown as { command: { capture: { text: string; images: unknown[]; markdown: string } } };
  expect(saved.command.capture.text).toContain('开始');
  expect(saved.command.capture.images).toHaveLength(0);
  expect(saved.command.capture.markdown).not.toContain('GUIDERAILIMAGE');
});

it('adds a button to a standalone generated image turn without a message node', async () => {
  const { send } = await setup();
  document.body.innerHTML = '<section data-turn="assistant" data-turn-id="image-turn"><div data-conversation-screenshot-content><button aria-label="Edit image"><img src="https://chatgpt.com/image.png" width="1024" height="1024"></button><div><button>Copy</button></div></div></section>';
  const img = document.querySelector('img')!;
  Object.defineProperties(img, { naturalWidth: { value: 1024 }, naturalHeight: { value: 1024 }, complete: { value: true } });
  await vi.advanceTimersByTimeAsync(1200);
  const button = document.querySelector<HTMLButtonElement>('[data-guiderail="collect"]')!;
  expect(button).not.toBeNull(); expect(button.closest('[data-conversation-screenshot-content]')).not.toBeNull(); expect(button.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId).toBe('image-turn'); button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/已收藏|Bookmarked/));
  const message = send.mock.calls.find(([m]) => m.kind === 'guiderail:command')?.[0] as unknown as { command: { capture: { messageId: string; markdown: string; images: unknown[] } } };
  expect(message.command.capture.messageId).toBe('turn-image-turn'); expect(message.command.capture.images).toHaveLength(1);
  expect(message.command.capture.markdown).toContain('GUIDERAILIMAGE0PLACEHOLDER'); expect(message.command.capture.markdown).not.toContain('Copy');
});
it('uses one complete-turn button for sibling images and ignores user uploads', async () => {
  await setup();
  document.body.innerHTML = '<section data-turn="assistant" data-turn-id="mixed"><div data-message-author-role="assistant" data-message-id="text">Text</div><button><img src="https://chatgpt.com/image.png" width="512" height="512"></button></section><section data-turn="user" data-turn-id="upload"><img width="512" height="512"></section>';
  await vi.advanceTimersByTimeAsync(2400);
  expect(document.querySelectorAll('[data-guiderail="collect"]')).toHaveLength(1);
  expect(document.querySelector('[data-guiderail="collect"]')?.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId).toBe('mixed');
});

async function replaceWithImages(urls: string[]) {
  document.body.innerHTML = `<section data-turn="assistant" data-turn-id="duplicates">${urls.map(src => `<button><img src="${src}" width="512" height="512"></button>`).join('')}</section>`;
  document.querySelectorAll('img').forEach(img => Object.defineProperties(img, { naturalWidth: { value: 512 }, naturalHeight: { value: 512 }, complete: { value: true } }));
  await vi.advanceTimersByTimeAsync(1200);
  return document.querySelector<HTMLButtonElement>('[data-guiderail="collect"]')!;
}
it('aligns text and standalone-image collection buttons to the right', async () => {
  const { button: textButton } = await setup();
  const imageButton = await replaceWithImages(['https://chatgpt.com/image.png']);
  for (const button of [textButton, imageButton]) {
    expect(button.style.marginLeft).toBe('auto'); expect(button.style.alignSelf).toBe('flex-end'); expect(button.style.display).toBe('block');
  }
});
it('downloads a repeated image URL only once and emits one placeholder', async () => {
  const { send, fetchImage } = await setup();
  const button = await replaceWithImages(Array(3).fill('https://chatgpt.com/image.png')); button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/已收藏|Bookmarked/));
  expect(fetchImage).toHaveBeenCalledOnce();
  const message = send.mock.calls.find(([m]) => m.kind === 'guiderail:command')?.[0] as unknown as { command: { capture: { markdown: string; images: unknown[] } } };
  expect(message.command.capture.images).toHaveLength(1);
  expect(message.command.capture.markdown.match(/GUIDERAILIMAGE\d+PLACEHOLDER/g)).toHaveLength(1);
});
it('deduplicates identical bytes from different URLs without dropping distinct images', async () => {
  const { send, fetchImage } = await setup();
  fetchImage.mockImplementation(async (...args: unknown[]) => new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, String(args[0]).includes('different') ? 2 : 1]), { headers: { 'content-type': 'image/png' } }));
  const button = await replaceWithImages(['https://chatgpt.com/a.png', 'https://chatgpt.com/b.png', 'https://chatgpt.com/different.png']); button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/已收藏|Bookmarked/));
  const message = send.mock.calls.find(([m]) => m.kind === 'guiderail:command')?.[0] as unknown as { command: { capture: { markdown: string; images: unknown[] } } };
  expect(message.command.capture.images).toHaveLength(2);
  expect(message.command.capture.markdown.match(/GUIDERAILIMAGE\d+PLACEHOLDER/g)).toEqual(['GUIDERAILIMAGE0PLACEHOLDER', 'GUIDERAILIMAGE1PLACEHOLDER']);
});
it('ignores hidden preview nodes but keeps offscreen conversation images', async () => {
  const { fetchImage } = await setup();
  const button = await replaceWithImages(['https://chatgpt.com/a.png', 'https://chatgpt.com/hidden.png']);
  document.querySelectorAll('img')[1].parentElement!.style.display = 'none'; button.click();
  await vi.waitFor(() => expect(button.textContent).toMatch(/已收藏|Bookmarked/));
  expect(fetchImage).toHaveBeenCalledOnce();
});
