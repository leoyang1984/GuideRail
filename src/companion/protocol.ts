import type { Capture } from '../storage/schema';
import type { Entry, LibraryIndex } from '../library/library';

export const COMPANION_PROTOCOL_VERSION = 1 as const;
export const COMPANION_DEFAULT_PORT = 27124;
export const COMPANION_ORIGIN = `http://127.0.0.1:${COMPANION_DEFAULT_PORT}`;
export const COMPANION_HEADERS = {
  authorization: 'Authorization',
  protocol: 'X-GuideRail-Protocol',
  idempotency: 'Idempotency-Key',
} as const;
export const COMPANION_LIMITS = {
  requestBytes: 26 * 1024 * 1024,
  markdownCharacters: 400_000,
  textCharacters: 200_000,
  imagesPerCapture: 12,
  encodedImagesBytes: 25 * 1024 * 1024,
  notebookCharacters: 80,
  titleCharacters: 240,
} as const;

export const companionRoutes = {
  status: '/v1/status',
  pair: '/v1/pair',
  library: '/v1/library',
  captures: '/v1/captures',
  notebooks: '/v1/notebooks',
  rebuild: '/v1/library/rebuild',
  imports: '/v1/imports',
  entry: (id: string) => `/v1/entries/${encodeURIComponent(id)}`,
  moveEntry: (id: string) => `/v1/entries/${encodeURIComponent(id)}/move`,
  hideEntry: (id: string) => `/v1/entries/${encodeURIComponent(id)}/hide`,
  restoreEntry: (id: string) => `/v1/entries/${encodeURIComponent(id)}/restore`,
} as const;

export type CompanionErrorCode =
  | 'BAD_REQUEST'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'PAIRING_DISABLED'
  | 'PAIRING_CODE_INVALID'
  | 'PROTOCOL_UNSUPPORTED'
  | 'PAYLOAD_TOO_LARGE'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VAULT_UNAVAILABLE'
  | 'WRITE_FAILED'
  | 'INTERNAL_ERROR';

export interface CompanionError {
  code: CompanionErrorCode;
  message: string;
  retryable: boolean;
}
export type CompanionResponse<T> = { ok: true; data: T } | { ok: false; error: CompanionError };

export interface CompanionIdentity {
  protocol: typeof COMPANION_PROTOCOL_VERSION;
  companionVersion: string;
  vaultName: string;
  instanceId: string;
}
export type CompanionCapability = 'library-v1' | 'capture-json-base64' | 'library-import-v1';
export interface StatusResponse extends CompanionIdentity {
  paired: boolean;
  capabilities: CompanionCapability[];
}
export interface PairRequest {
  code: string;
  client: { id: string; name: 'GuideRail'; version: string };
}
export interface PairResponse extends CompanionIdentity { token: string }
export interface CaptureRequest {
  capture: Capture;
  notebook: string;
  preferredTitle?: string;
}
export interface EntryContentResponse {
  entry: Entry;
  markdown: string;
  images: { name: string; data: string }[];
}
export interface RenameEntryRequest { title: string }
export interface MoveEntryRequest { notebook: string }
export interface HideEntryResponse { undoToken: string }
export interface RestoreEntryRequest { undoToken: string }
export interface CreateNotebookRequest { name: string }
export interface RebuildIndexResponse { count: number }

const errorCodes = new Set<CompanionErrorCode>([
  'BAD_REQUEST', 'AUTH_REQUIRED', 'AUTH_INVALID', 'PAIRING_DISABLED', 'PAIRING_CODE_INVALID',
  'PROTOCOL_UNSUPPORTED', 'PAYLOAD_TOO_LARGE', 'NOT_FOUND', 'CONFLICT', 'VAULT_UNAVAILABLE',
  'WRITE_FAILED', 'INTERNAL_ERROR',
]);
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Companion response is not an object');
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, maximum = 10_000): string {
  if (typeof value !== 'string' || !value || value.length > maximum) throw new Error(`Invalid ${name}`);
  return value;
}
function entry(value: unknown): Entry {
  const item = record(value);
  const result: Entry = {
    id: text(item.id, 'entry id', 200), title: text(item.title, 'entry title', COMPANION_LIMITS.titleCharacters),
    notebook: text(item.notebook, 'notebook', COMPANION_LIMITS.notebookCharacters), filename: text(item.filename, 'filename', 203),
    createdAt: text(item.createdAt, 'created time', 40), conversationId: text(item.conversationId, 'conversation id', 200),
    messageId: text(item.messageId, 'message id', 200), pageUrl: text(item.pageUrl, 'page URL', 500),
    images: Array.isArray(item.images) ? item.images.map((image, index) => text(image, `image ${index}`, 220)) : (() => { throw new Error('Invalid images'); })(),
  };
  if (!/^[a-f0-9]{64}$/.test(result.id) || result.filename !== `${result.id}.md` || !result.notebook.trim() || /[\\/:*?"<>|\x00-\x1f]/.test(result.notebook) || result.notebook.startsWith('.') || /[. ]$/.test(result.notebook) || !Number.isFinite(Date.parse(result.createdAt)) || result.pageUrl !== `https://chatgpt.com/c/${result.conversationId}` || result.images.some(name => !/^\d+\.(png|jpg|webp|gif)$/.test(name))) throw new Error('Invalid entry');
  if (item.hidden !== undefined) { if (typeof item.hidden !== 'boolean') throw new Error('Invalid hidden state'); result.hidden = item.hidden; }
  return result;
}
export function parseEntry(value: unknown): Entry { return entry(value); }

export function parseCompanionResponse<T>(value: unknown, parseData: (data: unknown) => T): CompanionResponse<T> {
  const envelope = record(value);
  if (envelope.ok === true) return { ok: true, data: parseData(envelope.data) };
  if (envelope.ok !== false) throw new Error('Invalid companion response');
  const source = record(envelope.error); const code = text(source.code, 'error code', 80) as CompanionErrorCode;
  if (!errorCodes.has(code) || typeof source.retryable !== 'boolean') throw new Error('Invalid companion error');
  return { ok: false, error: { code, message: text(source.message, 'error message', 500), retryable: source.retryable } };
}

export function parseStatusResponse(value: unknown): StatusResponse {
  const source = record(value);
  if (source.protocol !== COMPANION_PROTOCOL_VERSION || typeof source.paired !== 'boolean') throw new Error('Unsupported companion protocol');
  if (!Array.isArray(source.capabilities) || !source.capabilities.includes('library-v1') || !source.capabilities.includes('capture-json-base64') || source.capabilities.some(value => !['library-v1', 'capture-json-base64', 'library-import-v1'].includes(String(value)))) throw new Error('Unsupported companion capabilities');
  return {
    protocol: COMPANION_PROTOCOL_VERSION,
    companionVersion: text(source.companionVersion, 'companion version', 40), vaultName: text(source.vaultName, 'vault name', 240),
    instanceId: text(source.instanceId, 'instance id', 100), paired: source.paired,
    capabilities: [...source.capabilities] as CompanionCapability[],
  };
}

export function validatePairRequest(value: unknown): PairRequest {
  const source = record(value); const client = record(source.client); const code = text(source.code, 'pairing code', 8);
  if (!/^[A-Z2-9]{8}$/.test(code) || client.name !== 'GuideRail') throw new Error('Invalid pairing request');
  return { code, client: { id: text(client.id, 'client id', 100), name: 'GuideRail', version: text(client.version, 'client version', 40) } };
}

export function parsePairResponse(value: unknown): PairResponse {
  const source = record(value);
  if (source.protocol !== COMPANION_PROTOCOL_VERSION) throw new Error('Unsupported companion protocol');
  const token = text(source.token, 'pairing token', 500);
  if (token.length < 43) throw new Error('Invalid pairing token');
  return { protocol: COMPANION_PROTOCOL_VERSION, companionVersion: text(source.companionVersion, 'companion version', 40), vaultName: text(source.vaultName, 'vault name', 240), instanceId: text(source.instanceId, 'instance id', 100), token };
}

export function parseLibraryIndex(value: unknown): LibraryIndex {
  const source = record(value);
  if (source.version !== 1 || !Array.isArray(source.entries)) throw new Error('Invalid library index');
  const notebooks = source.notebooks === undefined ? undefined : Array.isArray(source.notebooks) ? source.notebooks.map((name, index) => text(name, `notebook ${index}`, COMPANION_LIMITS.notebookCharacters)) : (() => { throw new Error('Invalid notebooks'); })();
  return { version: 1, entries: source.entries.map(entry), ...(notebooks ? { notebooks } : {}) };
}

export function parseEntryContent(value: unknown): EntryContentResponse {
  const source = record(value); const parsedEntry = entry(source.entry);
  if (!Array.isArray(source.images)) throw new Error('Invalid entry images');
  const images = source.images.map((value, index) => { const image = record(value); const name = text(image.name, `image ${index} name`, 220); const data = text(image.data, `image ${index} data`, 14 * 1024 * 1024); if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Invalid image data'); return { name, data }; });
  if (images.length > COMPANION_LIMITS.imagesPerCapture || images.length !== parsedEntry.images.length || images.some((image, index) => image.name !== parsedEntry.images[index])) throw new Error('Entry images do not match');
  return { entry: parsedEntry, markdown: text(source.markdown, 'markdown', COMPANION_LIMITS.markdownCharacters), images };
}

export function validateCaptureRequest(value: unknown): CaptureRequest {
  const source = record(value); const capture = record(source.capture);
  const conversationId = text(capture.conversationId, 'conversation id', 200); const messageId = text(capture.messageId, 'message id', 200);
  const pageUrl = text(capture.pageUrl, 'page URL', 500); const body = typeof capture.text === 'string' ? capture.text : '';
  if (!/^[\w-]{1,200}$/.test(conversationId) || !/^[\w-]{1,200}$/.test(messageId) || pageUrl !== `https://chatgpt.com/c/${conversationId}` || body.length > COMPANION_LIMITS.textCharacters || !['assistant', 'user'].includes(String(capture.role))) throw new Error('Invalid capture');
  if (capture.markdown !== undefined && (typeof capture.markdown !== 'string' || capture.markdown.length > COMPANION_LIMITS.markdownCharacters)) throw new Error('Invalid capture markdown');
  if (capture.html !== undefined && typeof capture.html !== 'string') throw new Error('Invalid capture HTML');
  if (capture.images !== undefined && (!Array.isArray(capture.images) || capture.images.length > COMPANION_LIMITS.imagesPerCapture || capture.images.some(image => !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(record(image).data))))) throw new Error('Invalid capture images');
  const images = capture.images as { data: string }[] | undefined;
  if ((images ?? []).reduce((total, image) => total + image.data.length, 0) > COMPANION_LIMITS.encodedImagesBytes) throw new Error('Capture images are too large');
  return { capture: capture as unknown as Capture, notebook: text(source.notebook, 'notebook', COMPANION_LIMITS.notebookCharacters), ...(source.preferredTitle === undefined ? {} : { preferredTitle: text(source.preferredTitle, 'preferred title', COMPANION_LIMITS.titleCharacters) }) };
}

export function captureIdempotencyKey(capture: Pick<Capture, 'conversationId' | 'messageId'>): string {
  if (!/^[\w-]{1,200}$/.test(capture.conversationId) || !/^[\w-]{1,200}$/.test(capture.messageId)) throw new Error('Invalid capture identity');
  return `capture:${capture.conversationId}:${capture.messageId}`;
}
