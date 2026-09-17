const supportedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const maxImageBytes = 10 * 1024 * 1024;

export class ImageDownloadError extends Error {
  constructor(message: string, readonly code: 'unsupported-source') { super(message); }
}

export function isAllowedImageUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:') return false;
  return url.hostname === 'images.openai.com'
    || url.hostname === 'oaiusercontent.com'
    || url.hostname.endsWith('.oaiusercontent.com');
}

function base64(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    parts.push(String.fromCharCode(...bytes.subarray(offset, offset + 32_768)));
  }
  return btoa(parts.join(''));
}

export async function downloadImage(value: string) {
  if (!isAllowedImageUrl(value)) throw new ImageDownloadError('该图片来源暂不支持收藏', 'unsupported-source');
  let response: Response;
  try { response = await fetch(value, { credentials: 'omit', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error('图片下载失败，请检查网络后重试'); }
  if (!response.ok || !isAllowedImageUrl(response.url || value)) throw new Error('图片下载失败，请稍后重试');
  const type = response.headers.get('content-type')?.split(';')[0].toLowerCase();
  if (!type || !supportedTypes.has(type)) throw new Error('图片格式暂不支持');
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > maxImageBytes) throw new Error('单张图片不能超过 10 MB');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('无法读取图片');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      size += chunk.length;
      if (size > maxImageBytes) throw new Error('单张图片不能超过 10 MB');
      chunks.push(chunk);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return { data: `data:${type};base64,${base64(bytes)}`, size };
}
