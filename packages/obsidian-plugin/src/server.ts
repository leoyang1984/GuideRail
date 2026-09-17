import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  COMPANION_LIMITS,
  COMPANION_PROTOCOL_VERSION,
  captureIdempotencyKey,
  companionRoutes,
  validateCaptureRequest,
  validatePairRequest,
  type CompanionErrorCode,
} from '../../../src/companion/protocol';
import { CompanionVaultLibrary } from './vault-library';

export interface PairedClient { id: string; origin: string; tokenHash: string; pairedAt: string }
export interface CompanionServerSettings { port: number; instanceId: string; clients: PairedClient[] }
type PersistSettings = (settings: CompanionServerSettings) => Promise<void>;
function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
function json(response: ServerResponse, status: number, value: unknown, origin?: string) {
  response.statusCode = status; response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store');
  if (origin) { response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); }
  response.end(JSON.stringify(value));
}
function failure(response: ServerResponse, status: number, code: CompanionErrorCode, message: string, retryable = false, origin?: string) {
  json(response, status, { ok: false, error: { code, message, retryable } }, origin);
}
async function body(request: IncomingMessage) {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > COMPANION_LIMITS.requestBytes) throw new Error('PAYLOAD_TOO_LARGE'); chunks.push(bytes); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as unknown; } catch { throw new Error('BAD_REQUEST'); }
}
function isExtensionOrigin(origin: string) { return /^chrome-extension:\/\/[a-p]{32}$/.test(origin); }

export class CompanionServer {
  private server: Server | null = null;
  private pairing: { code: string; expiresAt: number; failures: number } | null = null;
  constructor(private library: CompanionVaultLibrary, private settings: CompanionServerSettings, private persist: PersistSettings, private companionVersion: string, private vaultName: string, private onPair?: (client: PairedClient) => void) {}
  startPairing() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes = randomBytes(8);
    const code = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join(''); this.pairing = { code, expiresAt: Date.now() + 5 * 60_000, failures: 0 }; return code;
  }
  currentPairing(): { code: string; expiresAt: number } | null {
    if (!this.pairing || this.pairing.expiresAt <= Date.now()) { this.pairing = null; return null; }
    return { code: this.pairing.code, expiresAt: this.pairing.expiresAt };
  }
  cancelPairing() { this.pairing = null; }
  updateLibrary(library: CompanionVaultLibrary) { this.library = library; }
  async start() {
    if (this.server) return;
    this.server = createServer((request, response) => { void this.route(request, response); });
    await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(this.settings.port, '127.0.0.1', () => { this.server!.off('error', reject); resolve(); }); });
  }
  listeningPort() {
    const address = this.server?.address(); return address && typeof address === 'object' ? address.port : null;
  }
  async stop() {
    this.pairing = null; const server = this.server; this.server = null; if (!server) return;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  private client(request: IncomingMessage, origin: string) {
    const authorization = request.headers.authorization; if (!authorization?.startsWith('Bearer ')) return null;
    const candidate = Buffer.from(hash(authorization.slice(7)), 'hex');
    return this.settings.clients.find(client => {
      const stored = Buffer.from(client.tokenHash, 'hex');
      const originMatches = !origin || client.origin === origin;
      return originMatches && stored.length === candidate.length && timingSafeEqual(candidate, stored);
    }) ?? null;
  }
  private async route(request: IncomingMessage, response: ServerResponse) {
    const origin = String(request.headers.origin ?? '');
    if (origin && !isExtensionOrigin(origin)) { failure(response, 403, 'AUTH_INVALID', 'Extension origin is not allowed'); return; }
    if (request.method === 'OPTIONS') {
      if (!isExtensionOrigin(origin)) { failure(response, 403, 'AUTH_INVALID', 'Extension origin is not allowed'); return; }
      response.statusCode = 204;
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-GuideRail-Protocol, Idempotency-Key');
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      response.setHeader('Access-Control-Allow-Private-Network', 'true');
      response.setHeader('Access-Control-Max-Age', '600');
      response.end();
      return;
    }
    if (request.headers['x-guiderail-protocol'] !== String(COMPANION_PROTOCOL_VERSION)) { failure(response, 426, 'PROTOCOL_UNSUPPORTED', 'GuideRail protocol version is not supported', false, origin); return; }
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    try {
      if (request.method === 'POST' && url.pathname === companionRoutes.pair) {
        if (!isExtensionOrigin(origin)) { failure(response, 403, 'AUTH_INVALID', 'Extension origin is not allowed', false, origin); return; }
        await this.pair(request, response, origin);
        return;
      }
      const matchedClient = this.client(request, origin);
      if (!matchedClient) { failure(response, request.headers.authorization ? 403 : 401, request.headers.authorization ? 'AUTH_INVALID' : 'AUTH_REQUIRED', 'A valid pairing token is required', false, origin); return; }
      const responseOrigin = origin || matchedClient.origin;
      if (request.method === 'GET' && url.pathname === companionRoutes.status) { this.ok(response, { protocol: 1, companionVersion: this.companionVersion, vaultName: this.vaultName, instanceId: this.settings.instanceId, paired: true, capabilities: ['library-v1', 'capture-json-base64', 'library-import-v1'] }, responseOrigin); return; }
      if (request.method === 'GET' && url.pathname === companionRoutes.library) { this.ok(response, await this.library.list(), responseOrigin); return; }
      if (request.method === 'POST' && url.pathname === companionRoutes.captures) { const payload = await body(request); const capture = validateCaptureRequest(payload); if (request.headers['idempotency-key'] !== captureIdempotencyKey(capture.capture)) { failure(response, 400, 'BAD_REQUEST', 'Idempotency-Key does not match the capture', false, responseOrigin); return; } this.ok(response, await this.library.saveCapture(payload), responseOrigin, 201); return; }
      if (request.method === 'POST' && url.pathname === companionRoutes.imports) { const payload = await body(request); const item = payload as { entry?: { id?: unknown } }; if (request.headers['idempotency-key'] !== `import:${String(item.entry?.id ?? '')}`) { failure(response, 400, 'BAD_REQUEST', 'Idempotency-Key does not match the import', false, responseOrigin); return; } this.ok(response, await this.library.importEntry(payload), responseOrigin, 201); return; }
      if (request.method === 'POST' && url.pathname === companionRoutes.notebooks) { const value = await body(request) as { name?: unknown }; this.ok(response, { name: await this.library.createNotebook(String(value.name ?? '')) }, responseOrigin, 201); return; }
      if (request.method === 'POST' && url.pathname === companionRoutes.rebuild) { this.ok(response, { count: await this.library.rebuildIndex() }, responseOrigin); return; }
      const match = /^\/v1\/entries\/([a-f0-9]{64})(?:\/(move|hide|restore))?$/.exec(url.pathname);
      if (match) { const [, id, action] = match;
        if (request.method === 'GET' && !action) { this.ok(response, await this.library.readEntry(id), responseOrigin); return; }
        if (request.method === 'PATCH' && !action) { const value = await body(request) as { title?: unknown }; await this.library.renameEntry(id, String(value.title ?? '')); this.ok(response, {}, responseOrigin); return; }
        if (request.method === 'POST' && action === 'move') { const value = await body(request) as { notebook?: unknown }; await this.library.moveEntry(id, String(value.notebook ?? '')); this.ok(response, {}, responseOrigin); return; }
        if (request.method === 'POST' && action === 'hide') { this.ok(response, { undoToken: await this.library.hideEntry(id) }, responseOrigin); return; }
        if (request.method === 'POST' && action === 'restore') { const value = await body(request) as { undoToken?: unknown }; await this.library.restoreEntry(id, String(value.undoToken ?? '')); this.ok(response, {}, responseOrigin); return; }
      }
      failure(response, 404, 'NOT_FOUND', 'Endpoint not found', false, responseOrigin);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'PAYLOAD_TOO_LARGE') failure(response, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large', false, origin);
      else if (message === 'BAD_REQUEST' || /^Invalid /.test(message)) failure(response, 400, 'BAD_REQUEST', message, false, origin);
      else if (/not found|missing/i.test(message)) failure(response, 404, 'NOT_FOUND', message, false, origin);
      else if (/exist|conflict|modified|index update/i.test(message)) failure(response, 409, 'CONFLICT', message, false, origin);
      else failure(response, 500, 'INTERNAL_ERROR', 'Companion operation failed', true, origin);
    }
  }
  private ok(response: ServerResponse, data: unknown, origin: string, status = 200) { json(response, status, { ok: true, data }, origin); }
  private async pair(request: IncomingMessage, response: ServerResponse, origin: string) {
    if (!this.pairing || this.pairing.expiresAt < Date.now()) { this.pairing = null; failure(response, 403, 'PAIRING_DISABLED', 'Open the Companion settings and start pairing', false, origin); return; }
    const value = validatePairRequest(await body(request));
    if (value.code !== this.pairing.code) { this.pairing.failures++; if (this.pairing.failures >= 5) this.pairing = null; failure(response, 403, 'PAIRING_CODE_INVALID', 'Pairing code is invalid or expired', false, origin); return; }
    this.pairing = null; const token = randomBytes(32).toString('base64url');
    this.settings.clients = this.settings.clients.filter(client => client.id !== value.client.id);
    const newClient: PairedClient = { id: value.client.id, origin, tokenHash: hash(token), pairedAt: new Date().toISOString() };
    this.settings.clients.push(newClient); await this.persist(this.settings);
    this.onPair?.(newClient);
    this.ok(response, { protocol: 1, companionVersion: this.companionVersion, vaultName: this.vaultName, instanceId: this.settings.instanceId, token }, origin);
  }
}
