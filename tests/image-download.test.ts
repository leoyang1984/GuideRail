import { afterEach, expect, it, vi } from 'vitest';
import { downloadImage, isAllowedImageUrl } from '../src/background/image-download';

afterEach(() => vi.restoreAllMocks());

it('allows only the image hosts declared by the extension', () => {
  expect(isAllowedImageUrl('https://images.openai.com/static/example')).toBe(true);
  expect(isAllowedImageUrl('https://cdn.oaiusercontent.com/example.webp')).toBe(true);
  expect(isAllowedImageUrl('https://i.pinimg.com/example.jpg')).toBe(false);
  expect(isAllowedImageUrl('https://example.com/image.png')).toBe(false);
  expect(isAllowedImageUrl('http://images.openai.com/image.png')).toBe(false);
});

it('downloads a supported image with credentials omitted', async () => {
  const fetchImage = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } }));
  const result = await downloadImage('https://images.openai.com/static/example');
  expect(result).toEqual({ data: 'data:image/png;base64,iVBORw==', size: 4 });
  expect(fetchImage).toHaveBeenCalledWith('https://images.openai.com/static/example', expect.objectContaining({ credentials: 'omit' }));
});

it('rejects unsupported sources, content types and declared oversized images', async () => {
  await expect(downloadImage('https://example.com/image.png')).rejects.toThrow('来源暂不支持');
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('text', { headers: { 'content-type': 'text/plain' } }));
  await expect(downloadImage('https://images.openai.com/static/example')).rejects.toThrow('格式暂不支持');
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png', 'content-length': String(11 * 1024 * 1024) } }));
  await expect(downloadImage('https://images.openai.com/static/example')).rejects.toThrow('10 MB');
});

it('replaces browser network errors with a useful Chinese message', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
  await expect(downloadImage('https://images.openai.com/static/example')).rejects.toThrow('图片下载失败，请检查网络后重试');
});
