"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => GuideRailCompanionPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var import_node_crypto3 = require("node:crypto");

// manifest.json
var manifest_default = {
  id: "guiderail-companion",
  name: "GuideRail Companion",
  version: "0.2.0",
  minAppVersion: "1.5.0",
  description: "Receives GuideRail captures over a private loopback connection and saves them to this vault.",
  author: "GuideRail",
  isDesktopOnly: true
};

// src/server.ts
var import_node_crypto = require("node:crypto");
var import_node_http = require("node:http");

// ../../src/companion/protocol.ts
var COMPANION_PROTOCOL_VERSION = 1;
var COMPANION_DEFAULT_PORT = 27124;
var COMPANION_ORIGIN = `http://127.0.0.1:${COMPANION_DEFAULT_PORT}`;
var COMPANION_LIMITS = {
  requestBytes: 26 * 1024 * 1024,
  markdownCharacters: 4e5,
  textCharacters: 2e5,
  imagesPerCapture: 12,
  encodedImagesBytes: 25 * 1024 * 1024,
  notebookCharacters: 80,
  titleCharacters: 240
};
var companionRoutes = {
  status: "/v1/status",
  pair: "/v1/pair",
  library: "/v1/library",
  captures: "/v1/captures",
  notebooks: "/v1/notebooks",
  rebuild: "/v1/library/rebuild",
  imports: "/v1/imports",
  entry: (id) => `/v1/entries/${encodeURIComponent(id)}`,
  moveEntry: (id) => `/v1/entries/${encodeURIComponent(id)}/move`,
  hideEntry: (id) => `/v1/entries/${encodeURIComponent(id)}/hide`,
  restoreEntry: (id) => `/v1/entries/${encodeURIComponent(id)}/restore`
};
function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Companion response is not an object");
  return value;
}
function text(value, name, maximum = 1e4) {
  if (typeof value !== "string" || !value || value.length > maximum) throw new Error(`Invalid ${name}`);
  return value;
}
function entry(value) {
  const item = record(value);
  const result = {
    id: text(item.id, "entry id", 200),
    title: text(item.title, "entry title", COMPANION_LIMITS.titleCharacters),
    notebook: text(item.notebook, "notebook", COMPANION_LIMITS.notebookCharacters),
    filename: text(item.filename, "filename", 203),
    createdAt: text(item.createdAt, "created time", 40),
    conversationId: text(item.conversationId, "conversation id", 200),
    messageId: text(item.messageId, "message id", 200),
    pageUrl: text(item.pageUrl, "page URL", 500),
    images: Array.isArray(item.images) ? item.images.map((image, index) => text(image, `image ${index}`, 220)) : (() => {
      throw new Error("Invalid images");
    })()
  };
  if (!/^[a-f0-9]{64}$/.test(result.id) || result.filename !== `${result.id}.md` || !result.notebook.trim() || /[\\/:*?"<>|\x00-\x1f]/.test(result.notebook) || result.notebook.startsWith(".") || /[. ]$/.test(result.notebook) || !Number.isFinite(Date.parse(result.createdAt)) || result.pageUrl !== `https://chatgpt.com/c/${result.conversationId}` || result.images.some((name) => !/^\d+\.(png|jpg|webp|gif)$/.test(name))) throw new Error("Invalid entry");
  if (item.hidden !== void 0) {
    if (typeof item.hidden !== "boolean") throw new Error("Invalid hidden state");
    result.hidden = item.hidden;
  }
  return result;
}
function validatePairRequest(value) {
  const source = record(value);
  const client = record(source.client);
  const code = text(source.code, "pairing code", 8);
  if (!/^[A-Z2-9]{8}$/.test(code) || client.name !== "GuideRail") throw new Error("Invalid pairing request");
  return { code, client: { id: text(client.id, "client id", 100), name: "GuideRail", version: text(client.version, "client version", 40) } };
}
function parseLibraryIndex(value) {
  const source = record(value);
  if (source.version !== 1 || !Array.isArray(source.entries)) throw new Error("Invalid library index");
  const notebooks = source.notebooks === void 0 ? void 0 : Array.isArray(source.notebooks) ? source.notebooks.map((name, index) => text(name, `notebook ${index}`, COMPANION_LIMITS.notebookCharacters)) : (() => {
    throw new Error("Invalid notebooks");
  })();
  return { version: 1, entries: source.entries.map(entry), ...notebooks ? { notebooks } : {} };
}
function parseEntryContent(value) {
  const source = record(value);
  const parsedEntry = entry(source.entry);
  if (!Array.isArray(source.images)) throw new Error("Invalid entry images");
  const images = source.images.map((value2, index) => {
    const image = record(value2);
    const name = text(image.name, `image ${index} name`, 220);
    const data = text(image.data, `image ${index} data`, 14 * 1024 * 1024);
    if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error("Invalid image data");
    return { name, data };
  });
  if (images.length > COMPANION_LIMITS.imagesPerCapture || images.length !== parsedEntry.images.length || images.some((image, index) => image.name !== parsedEntry.images[index])) throw new Error("Entry images do not match");
  return { entry: parsedEntry, markdown: text(source.markdown, "markdown", COMPANION_LIMITS.markdownCharacters), images };
}
function validateCaptureRequest(value) {
  const source = record(value);
  const capture = record(source.capture);
  const conversationId = text(capture.conversationId, "conversation id", 200);
  const messageId = text(capture.messageId, "message id", 200);
  const pageUrl = text(capture.pageUrl, "page URL", 500);
  const body2 = typeof capture.text === "string" ? capture.text : "";
  if (!/^[\w-]{1,200}$/.test(conversationId) || !/^[\w-]{1,200}$/.test(messageId) || pageUrl !== `https://chatgpt.com/c/${conversationId}` || body2.length > COMPANION_LIMITS.textCharacters || !["assistant", "user"].includes(String(capture.role))) throw new Error("Invalid capture");
  if (capture.markdown !== void 0 && (typeof capture.markdown !== "string" || capture.markdown.length > COMPANION_LIMITS.markdownCharacters)) throw new Error("Invalid capture markdown");
  if (capture.html !== void 0 && typeof capture.html !== "string") throw new Error("Invalid capture HTML");
  if (capture.images !== void 0 && (!Array.isArray(capture.images) || capture.images.length > COMPANION_LIMITS.imagesPerCapture || capture.images.some((image) => !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(String(record(image).data))))) throw new Error("Invalid capture images");
  const images = capture.images;
  if ((images ?? []).reduce((total, image) => total + image.data.length, 0) > COMPANION_LIMITS.encodedImagesBytes) throw new Error("Capture images are too large");
  return { capture, notebook: text(source.notebook, "notebook", COMPANION_LIMITS.notebookCharacters), ...source.preferredTitle === void 0 ? {} : { preferredTitle: text(source.preferredTitle, "preferred title", COMPANION_LIMITS.titleCharacters) } };
}
function captureIdempotencyKey(capture) {
  if (!/^[\w-]{1,200}$/.test(capture.conversationId) || !/^[\w-]{1,200}$/.test(capture.messageId)) throw new Error("Invalid capture identity");
  return `capture:${capture.conversationId}:${capture.messageId}`;
}

// src/server.ts
function hash(value) {
  return (0, import_node_crypto.createHash)("sha256").update(value).digest("hex");
}
function json(response, status, value, origin) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  if (origin) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.end(JSON.stringify(value));
}
function failure(response, status, code, message, retryable = false, origin) {
  json(response, status, { ok: false, error: { code, message, retryable } }, origin);
}
async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > COMPANION_LIMITS.requestBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("BAD_REQUEST");
  }
}
function isExtensionOrigin(origin) {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin);
}
var CompanionServer = class {
  constructor(library, settings, persist, companionVersion, vaultName, onPair) {
    this.library = library;
    this.settings = settings;
    this.persist = persist;
    this.companionVersion = companionVersion;
    this.vaultName = vaultName;
    this.onPair = onPair;
  }
  server = null;
  pairing = null;
  startPairing() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = (0, import_node_crypto.randomBytes)(8);
    const code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
    this.pairing = { code, expiresAt: Date.now() + 5 * 6e4, failures: 0 };
    return code;
  }
  currentPairing() {
    if (!this.pairing || this.pairing.expiresAt <= Date.now()) {
      this.pairing = null;
      return null;
    }
    return { code: this.pairing.code, expiresAt: this.pairing.expiresAt };
  }
  cancelPairing() {
    this.pairing = null;
  }
  updateLibrary(library) {
    this.library = library;
  }
  async start() {
    if (this.server) return;
    this.server = (0, import_node_http.createServer)((request, response) => {
      void this.route(request, response);
    });
    await new Promise((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.settings.port, "127.0.0.1", () => {
        this.server.off("error", reject);
        resolve();
      });
    });
  }
  listeningPort() {
    const address = this.server?.address();
    return address && typeof address === "object" ? address.port : null;
  }
  async stop() {
    this.pairing = null;
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  client(request, origin) {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return null;
    const candidate = Buffer.from(hash(authorization.slice(7)), "hex");
    return this.settings.clients.find((client) => {
      const stored = Buffer.from(client.tokenHash, "hex");
      const originMatches = !origin || client.origin === origin;
      return originMatches && stored.length === candidate.length && (0, import_node_crypto.timingSafeEqual)(candidate, stored);
    }) ?? null;
  }
  async route(request, response) {
    const origin = String(request.headers.origin ?? "");
    if (origin && !isExtensionOrigin(origin)) {
      failure(response, 403, "AUTH_INVALID", "Extension origin is not allowed");
      return;
    }
    if (request.method === "OPTIONS") {
      if (!isExtensionOrigin(origin)) {
        failure(response, 403, "AUTH_INVALID", "Extension origin is not allowed");
        return;
      }
      response.statusCode = 204;
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-GuideRail-Protocol, Idempotency-Key");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
      response.setHeader("Access-Control-Max-Age", "600");
      response.end();
      return;
    }
    if (request.headers["x-guiderail-protocol"] !== String(COMPANION_PROTOCOL_VERSION)) {
      failure(response, 426, "PROTOCOL_UNSUPPORTED", "GuideRail protocol version is not supported", false, origin);
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "POST" && url.pathname === companionRoutes.pair) {
        if (!isExtensionOrigin(origin)) {
          failure(response, 403, "AUTH_INVALID", "Extension origin is not allowed", false, origin);
          return;
        }
        await this.pair(request, response, origin);
        return;
      }
      const matchedClient = this.client(request, origin);
      if (!matchedClient) {
        failure(response, request.headers.authorization ? 403 : 401, request.headers.authorization ? "AUTH_INVALID" : "AUTH_REQUIRED", "A valid pairing token is required", false, origin);
        return;
      }
      const responseOrigin = origin || matchedClient.origin;
      if (request.method === "GET" && url.pathname === companionRoutes.status) {
        this.ok(response, { protocol: 1, companionVersion: this.companionVersion, vaultName: this.vaultName, instanceId: this.settings.instanceId, paired: true, capabilities: ["library-v1", "capture-json-base64", "library-import-v1"] }, responseOrigin);
        return;
      }
      if (request.method === "GET" && url.pathname === companionRoutes.library) {
        this.ok(response, await this.library.list(), responseOrigin);
        return;
      }
      if (request.method === "POST" && url.pathname === companionRoutes.captures) {
        const payload = await body(request);
        const capture = validateCaptureRequest(payload);
        if (request.headers["idempotency-key"] !== captureIdempotencyKey(capture.capture)) {
          failure(response, 400, "BAD_REQUEST", "Idempotency-Key does not match the capture", false, responseOrigin);
          return;
        }
        this.ok(response, await this.library.saveCapture(payload), responseOrigin, 201);
        return;
      }
      if (request.method === "POST" && url.pathname === companionRoutes.imports) {
        const payload = await body(request);
        const item = payload;
        if (request.headers["idempotency-key"] !== `import:${String(item.entry?.id ?? "")}`) {
          failure(response, 400, "BAD_REQUEST", "Idempotency-Key does not match the import", false, responseOrigin);
          return;
        }
        this.ok(response, await this.library.importEntry(payload), responseOrigin, 201);
        return;
      }
      if (request.method === "POST" && url.pathname === companionRoutes.notebooks) {
        const value = await body(request);
        this.ok(response, { name: await this.library.createNotebook(String(value.name ?? "")) }, responseOrigin, 201);
        return;
      }
      if (request.method === "POST" && url.pathname === companionRoutes.rebuild) {
        this.ok(response, { count: await this.library.rebuildIndex() }, responseOrigin);
        return;
      }
      const match = /^\/v1\/entries\/([a-f0-9]{64})(?:\/(move|hide|restore))?$/.exec(url.pathname);
      if (match) {
        const [, id, action] = match;
        if (request.method === "GET" && !action) {
          this.ok(response, await this.library.readEntry(id), responseOrigin);
          return;
        }
        if (request.method === "PATCH" && !action) {
          const value = await body(request);
          await this.library.renameEntry(id, String(value.title ?? ""));
          this.ok(response, {}, responseOrigin);
          return;
        }
        if (request.method === "POST" && action === "move") {
          const value = await body(request);
          await this.library.moveEntry(id, String(value.notebook ?? ""));
          this.ok(response, {}, responseOrigin);
          return;
        }
        if (request.method === "POST" && action === "hide") {
          this.ok(response, { undoToken: await this.library.hideEntry(id) }, responseOrigin);
          return;
        }
        if (request.method === "POST" && action === "restore") {
          const value = await body(request);
          await this.library.restoreEntry(id, String(value.undoToken ?? ""));
          this.ok(response, {}, responseOrigin);
          return;
        }
      }
      failure(response, 404, "NOT_FOUND", "Endpoint not found", false, responseOrigin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "PAYLOAD_TOO_LARGE") failure(response, 413, "PAYLOAD_TOO_LARGE", "Request body is too large", false, origin);
      else if (message === "BAD_REQUEST" || /^Invalid /.test(message)) failure(response, 400, "BAD_REQUEST", message, false, origin);
      else if (/not found|missing/i.test(message)) failure(response, 404, "NOT_FOUND", message, false, origin);
      else if (/exist|conflict|modified|index update/i.test(message)) failure(response, 409, "CONFLICT", message, false, origin);
      else failure(response, 500, "INTERNAL_ERROR", "Companion operation failed", true, origin);
    }
  }
  ok(response, data, origin, status = 200) {
    json(response, status, { ok: true, data }, origin);
  }
  async pair(request, response, origin) {
    if (!this.pairing || this.pairing.expiresAt < Date.now()) {
      this.pairing = null;
      failure(response, 403, "PAIRING_DISABLED", "Open the Companion settings and start pairing", false, origin);
      return;
    }
    const value = validatePairRequest(await body(request));
    if (value.code !== this.pairing.code) {
      this.pairing.failures++;
      if (this.pairing.failures >= 5) this.pairing = null;
      failure(response, 403, "PAIRING_CODE_INVALID", "Pairing code is invalid or expired", false, origin);
      return;
    }
    this.pairing = null;
    const token = (0, import_node_crypto.randomBytes)(32).toString("base64url");
    this.settings.clients = this.settings.clients.filter((client) => client.id !== value.client.id);
    const newClient = { id: value.client.id, origin, tokenHash: hash(token), pairedAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.settings.clients.push(newClient);
    await this.persist(this.settings);
    this.onPair?.(newClient);
    this.ok(response, { protocol: 1, companionVersion: this.companionVersion, vaultName: this.vaultName, instanceId: this.settings.instanceId, token }, origin);
  }
};

// src/vault-library.ts
var import_node_crypto2 = require("node:crypto");
var imageTypes = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
function notebookName(value) {
  const name = value.trim();
  if (!name || name.length > 80 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || name.startsWith(".") || /[. ]$/.test(name)) throw new Error("Invalid notebook");
  return name;
}
function safeRoot(value) {
  const path = value.trim().replace(/^\/+|\/+$/g, "");
  if (!path || path === ".") return "";
  if (path.split("/").some((part) => !part || part === "." || part === ".." || /[\\:*?"<>|\x00-\x1f]/.test(part))) throw new Error("Invalid library folder");
  return path;
}
function join(...parts) {
  return parts.filter(Boolean).join("/");
}
function cleanEntry(entry2) {
  const { hiddenToken: _hiddenToken, ...clean } = entry2;
  return clean;
}
async function ensureFolder(storage, path) {
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current = join(current, part);
    if (!await storage.exists(current)) await storage.mkdir(current);
  }
}
function sha256(value) {
  return (0, import_node_crypto2.createHash)("sha256").update(value).digest("hex");
}
var CompanionVaultLibrary = class {
  constructor(storage, rootFolder) {
    this.storage = storage;
    this.rootFolder = rootFolder;
    this.rootFolder = safeRoot(rootFolder);
  }
  queue = Promise.resolve();
  metaPath(name) {
    return join(this.rootFolder, ".guiderail", name);
  }
  notePath(entry2) {
    return join(this.rootFolder, entry2.notebook, entry2.filename);
  }
  async locked(run) {
    const result = this.queue.then(run, run);
    this.queue = result.then(() => void 0, () => void 0);
    return result;
  }
  async index() {
    const path = this.metaPath("index.json");
    if (!await this.storage.exists(path)) return { version: 1, entries: [], notebooks: ["\u6536\u4EF6\u7BB1"] };
    const value = JSON.parse(await this.storage.read(path));
    const validated = parseLibraryIndex(value);
    return { ...validated, entries: validated.entries.map((entry2, index) => {
      const token = value.entries[index]?.hiddenToken;
      if (token !== void 0 && (typeof token !== "string" || !/^[0-9a-f-]{36}$/.test(token))) throw new Error("Invalid GuideRail undo token");
      return { ...entry2, ...token ? { hiddenToken: token } : {} };
    }) };
  }
  async saveIndex(index) {
    await ensureFolder(this.storage, join(this.rootFolder, ".guiderail"));
    await this.storage.write(this.metaPath("index.json"), JSON.stringify(index));
  }
  async list() {
    const index = await this.index();
    return { ...index, entries: index.entries.map(cleanEntry) };
  }
  async createNotebook(name) {
    name = notebookName(name);
    await ensureFolder(this.storage, join(this.rootFolder, name));
    return this.locked(async () => {
      const index = await this.index();
      index.notebooks = [.../* @__PURE__ */ new Set(["\u6536\u4EF6\u7BB1", ...index.notebooks ?? [], name])];
      await this.saveIndex(index);
      return name;
    });
  }
  async saveCapture(input) {
    const request = validateCaptureRequest(input);
    return this.locked(async () => {
      const { capture } = request;
      const notebook = notebookName(request.notebook);
      const id = sha256(`${capture.conversationId}:${capture.messageId}`);
      const pendingPath = this.metaPath(`pending-${id}.json`);
      const captureHash = sha256(JSON.stringify(request));
      const index = await this.index();
      const existing = index.entries.find((item) => item.id === id);
      if (existing) {
        if (!await this.storage.exists(this.notePath(existing))) throw new Error("Indexed note is missing");
        if (existing.hidden) {
          delete existing.hidden;
          delete existing.hiddenToken;
          await this.saveIndex(index);
        }
        return cleanEntry(existing);
      }
      const images = (capture.images ?? []).map((image, position) => {
        const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(image.data);
        if (!match) throw new Error("Invalid image");
        return { name: `${position}.${match[1].replace("jpeg", "jpg")}`, bytes: Uint8Array.from(Buffer.from(match[2], "base64")) };
      });
      let pending;
      if (await this.storage.exists(pendingPath)) pending = JSON.parse(await this.storage.read(pendingPath));
      if (pending && pending.captureHash !== captureHash) throw new Error("Pending capture conflicts with this request");
      const entry2 = pending?.entry ?? { id, title: request.preferredTitle || capture.text.trim().split("\n")[0]?.slice(0, 80) || "\u56FE\u7247\u6536\u85CF", notebook, filename: `${id}.md`, createdAt: (/* @__PURE__ */ new Date()).toISOString(), conversationId: capture.conversationId, messageId: capture.messageId, pageUrl: capture.pageUrl, images: images.map((image) => image.name) };
      if (entry2.notebook !== notebook) throw new Error("Pending capture targets another notebook");
      const folder = join(this.rootFolder, notebook);
      await ensureFolder(this.storage, folder);
      const fields = { title: entry2.title, source: entry2.pageUrl, conversation_id: entry2.conversationId, message_id: entry2.messageId, guiderail_id: id, created: entry2.createdAt };
      let body2 = capture.markdown || capture.text;
      entry2.images.forEach((name, position) => {
        const link = `![\u56FE\u7247 ${position + 1}](attachments/${id}/${name})`;
        const marker = `GUIDERAILIMAGE${position}PLACEHOLDER`;
        body2 = body2.includes(marker) ? body2.replace(marker, link) : `${body2}

${link}`;
      });
      const header = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
      const markdown = `---
${header}
---

${body2}
`;
      const noteHash = sha256(markdown);
      const notePath = this.notePath(entry2);
      if (!pending) {
        await ensureFolder(this.storage, join(this.rootFolder, ".guiderail"));
        await this.storage.write(pendingPath, JSON.stringify({ entry: entry2, captureHash, noteHash }));
      }
      if (await this.storage.exists(notePath)) {
        if (!pending || sha256(await this.storage.read(notePath)) !== pending.noteHash) throw new Error("Note already exists outside the recoverable capture");
      } else {
        if (images.length) {
          const attachmentFolder = join(folder, "attachments", id);
          await ensureFolder(this.storage, attachmentFolder);
          for (const image of images) await this.storage.writeBinary(join(attachmentFolder, image.name), image.bytes.buffer.slice(image.bytes.byteOffset, image.bytes.byteOffset + image.bytes.byteLength));
        }
        await this.storage.write(notePath, markdown);
      }
      index.entries.push(entry2);
      index.notebooks = [.../* @__PURE__ */ new Set(["\u6536\u4EF6\u7BB1", ...index.notebooks ?? [], notebook])];
      try {
        await this.saveIndex(index);
      } catch (error) {
        throw new Error(`Note saved but index update failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
      await this.storage.remove(pendingPath);
      return cleanEntry(entry2);
    });
  }
  async readEntry(id) {
    const index = await this.index();
    const internal = index.entries.find((item) => item.id === id);
    if (!internal) throw new Error("Entry not found");
    const markdown = await this.storage.read(this.notePath(internal));
    const images = [];
    for (const name of internal.images) {
      const extension = name.split(".").pop();
      const bytes = Buffer.from(await this.storage.readBinary(join(this.rootFolder, internal.notebook, "attachments", id, name)));
      images.push({ name, data: `data:${imageTypes[extension]};base64,${bytes.toString("base64")}` });
    }
    return { entry: cleanEntry(internal), markdown, images };
  }
  async importEntry(input) {
    const content = parseEntryContent(input);
    const incoming = content.entry;
    const payloadHash = sha256(JSON.stringify(content));
    const pendingPath = this.metaPath(`import-${incoming.id}.json`);
    return this.locked(async () => {
      const index = await this.index();
      const existing = index.entries.find((item) => item.id === incoming.id);
      if (existing) {
        const current = await this.readEntry(existing.id);
        if (sha256(JSON.stringify(current)) !== payloadHash) throw new Error("Imported entry conflicts with existing content");
        return cleanEntry(existing);
      }
      let pending;
      if (await this.storage.exists(pendingPath)) pending = JSON.parse(await this.storage.read(pendingPath));
      if (pending && pending.payloadHash !== payloadHash) throw new Error("Pending import conflicts with this content");
      const folder = join(this.rootFolder, notebookName(incoming.notebook));
      await ensureFolder(this.storage, folder);
      await ensureFolder(this.storage, join(this.rootFolder, ".guiderail"));
      if (!pending) await this.storage.write(pendingPath, JSON.stringify({ payloadHash }));
      const notePath = this.notePath(incoming);
      if (await this.storage.exists(notePath)) {
        if (await this.storage.read(notePath) !== content.markdown) throw new Error("Imported note conflicts with an existing file");
      } else await this.storage.write(notePath, content.markdown);
      if (content.images.length) {
        const attachments = join(folder, "attachments", incoming.id);
        await ensureFolder(this.storage, attachments);
        for (const image of content.images) {
          const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(image.data);
          if (!match) throw new Error("Invalid imported image");
          const bytes = Buffer.from(match[2], "base64");
          const path = join(attachments, image.name);
          if (await this.storage.exists(path)) {
            if (!Buffer.from(await this.storage.readBinary(path)).equals(bytes)) throw new Error("Imported image conflicts with an existing file");
          } else await this.storage.writeBinary(path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
      }
      index.entries.push({ ...incoming });
      index.notebooks = [.../* @__PURE__ */ new Set(["\u6536\u4EF6\u7BB1", ...index.notebooks ?? [], incoming.notebook])];
      await this.saveIndex(index);
      await this.storage.remove(pendingPath);
      return incoming;
    });
  }
  async renameEntry(id, title) {
    title = title.trim();
    if (!title || title.length > 240) throw new Error("Invalid title");
    await this.locked(async () => {
      const index = await this.index();
      const entry2 = index.entries.find((item) => item.id === id);
      if (!entry2) throw new Error("Entry not found");
      const path = this.notePath(entry2);
      const markdown = await this.storage.read(path);
      if (!/^title: .*$/m.test(markdown)) throw new Error("Title property is missing");
      await this.storage.write(path, markdown.replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`));
      entry2.title = title;
      await this.saveIndex(index);
    });
  }
  async moveEntry(id, target) {
    target = notebookName(target);
    await this.locked(async () => {
      const index = await this.index();
      const entry2 = index.entries.find((item) => item.id === id);
      if (!entry2) throw new Error("Entry not found");
      if (entry2.notebook === target) return;
      const oldFolder = join(this.rootFolder, entry2.notebook);
      const newFolder = join(this.rootFolder, target);
      await ensureFolder(this.storage, newFolder);
      const destination = join(newFolder, entry2.filename);
      if (await this.storage.exists(destination)) throw new Error("Destination note already exists");
      await this.storage.rename(this.notePath(entry2), destination);
      if (entry2.images.length) {
        await ensureFolder(this.storage, join(newFolder, "attachments"));
        await this.storage.rename(join(oldFolder, "attachments", id), join(newFolder, "attachments", id));
      }
      entry2.notebook = target;
      index.notebooks = [.../* @__PURE__ */ new Set(["\u6536\u4EF6\u7BB1", ...index.notebooks ?? [], target])];
      await this.saveIndex(index);
    });
  }
  async hideEntry(id) {
    return this.locked(async () => {
      const index = await this.index();
      const entry2 = index.entries.find((item) => item.id === id);
      if (!entry2) throw new Error("Entry not found");
      if (!entry2.hiddenToken) entry2.hiddenToken = (0, import_node_crypto2.randomUUID)();
      entry2.hidden = true;
      await this.saveIndex(index);
      return entry2.hiddenToken;
    });
  }
  async restoreEntry(id, undoToken) {
    await this.locked(async () => {
      const index = await this.index();
      const entry2 = index.entries.find((item) => item.id === id);
      if (!entry2 || !entry2.hidden || entry2.hiddenToken !== undoToken) throw new Error("Invalid undo token");
      delete entry2.hidden;
      delete entry2.hiddenToken;
      await this.saveIndex(index);
    });
  }
  async rebuildIndex() {
    return this.locked(async () => {
      const previous = await this.index().catch(() => ({ version: 1, entries: [], notebooks: ["\u6536\u4EF6\u7BB1"] }));
      const rebuilt = { version: 1, entries: [], notebooks: previous.notebooks };
      const root = await this.storage.list(this.rootFolder);
      for (const folder of root.folders) {
        const notebook = this.rootFolder ? folder.slice(this.rootFolder.length + 1) : folder;
        if (!notebook || notebook.startsWith(".") || notebook.includes("/")) continue;
        notebookName(notebook);
        for (const file of (await this.storage.list(folder)).files) {
          if (!/(?:^|\/)[a-f0-9]{64}\.md$/.test(file)) continue;
          const markdown = await this.storage.read(file);
          const fields = {};
          for (const line of (/^---\n([\s\S]*?)\n---\n/.exec(markdown)?.[1] ?? "").split("\n")) {
            const match = /^(title|source|conversation_id|message_id|guiderail_id|created): (.*)$/.exec(line);
            if (match) try {
              fields[match[1]] = JSON.parse(match[2]);
            } catch {
            }
          }
          if (!fields.guiderail_id || fields.guiderail_id !== sha256(`${fields.conversation_id}:${fields.message_id}`)) continue;
          const images = [...markdown.matchAll(/attachments\/([a-f0-9]{64})\/(\d+\.(?:png|jpg|webp|gif))/g)].filter((match) => match[1] === fields.guiderail_id).map((match) => match[2]);
          const prior = previous.entries.find((item) => item.id === fields.guiderail_id);
          rebuilt.entries.push({ id: fields.guiderail_id, filename: `${fields.guiderail_id}.md`, title: fields.title, notebook, createdAt: fields.created, conversationId: fields.conversation_id, messageId: fields.message_id, pageUrl: fields.source, images, ...prior?.hidden ? { hidden: true, hiddenToken: prior.hiddenToken } : {} });
        }
      }
      await this.saveIndex(rebuilt);
      return rebuilt.entries.length;
    });
  }
};

// src/i18n.ts
function getObsidianLocale() {
  const lang = (typeof window !== "undefined" && window.localStorage?.getItem("language") || typeof window !== "undefined" && window.moment?.locale?.() || "en").toLowerCase();
  return lang.startsWith("zh") ? "zh" : "en";
}
var strings = {
  en: {
    header: "GuideRail Companion",
    desc: "Only listens on local 127.0.0.1. Once paired, GuideRail saves clips into this Vault without browser directory permissions.",
    rootFolderTitle: "Vault Root Folder",
    rootFolderDesc: 'Folder inside your Vault. Leave empty or "/" to save directly in Vault root (e.g. "\u6536\u4EF6\u7BB1/"); default "GuideRail" saves under "GuideRail/\u6536\u4EF6\u7BB1/".',
    rootFolderPlaceholder: "GuideRail (empty for Vault root)",
    portTitle: "Local Port",
    portDesc: "Default 27124. Server restarts automatically when modified.",
    connectTitle: "Connect GuideRail",
    pairingCodePrefix: "Pairing code: ",
    clickToCopy: "Click to copy pairing code",
    codeCopiedNotice: "Pairing code copied: {code}",
    codeNoticeWithClip: "GuideRail Pairing Code: {code} (copied to clipboard)",
    codeNoticeWithoutClip: "GuideRail Pairing Code: {code}",
    validNotice: " (Valid for ~{minutes} min, single use. Click code or button to copy)",
    copyCodeButton: "Copy Code",
    connectDescDefault: "Click to generate a one-time pairing code and copy it to clipboard.",
    regenerateButton: "Regenerate",
    generateButton: "Generate Pairing Code",
    cannotBeginPairing: "Cannot begin pairing",
    pairedClientsTitle: "Paired Clients",
    pairedClientsDesc: "{count} authorized client(s)",
    revokeAllButton: "Revoke All",
    revokedAllNotice: "Revoked all GuideRail connections",
    clientPairedNotice: "GuideRail client paired: {origin}",
    serverStartFailedNotice: "GuideRail Companion failed to start: {error}",
    serverNotRunningError: "Local service is not running",
    portUnavailable: "Port unavailable"
  },
  zh: {
    header: "GuideRail Companion",
    desc: "\u670D\u52A1\u53EA\u76D1\u542C\u672C\u673A 127.0.0.1\u3002\u914D\u5BF9\u540E\uFF0CGuideRail \u65E0\u9700\u6D4F\u89C8\u5668\u6587\u4EF6\u5939\u6388\u6743\u5373\u53EF\u5199\u5165\u5F53\u524D Vault\u3002",
    rootFolderTitle: "\u4FDD\u5B58\u6839\u76EE\u5F55",
    rootFolderDesc: "Vault \u5185\u7684\u4FDD\u5B58\u6587\u4EF6\u5939\u3002\u7559\u7A7A\u6216\u586B\u201C/\u201D\u8868\u793A\u76F4\u63A5\u4FDD\u5B58\u5728 Vault \u6839\u76EE\u5F55\uFF08\u5982\u201C\u6536\u4EF6\u7BB1/\u201D\uFF09\uFF1B\u9ED8\u8BA4\u201CGuideRail\u201D\u4F1A\u5B58\u653E\u5728\u201CGuideRail/\u6536\u4EF6\u7BB1/\u201D\u3002",
    rootFolderPlaceholder: "GuideRail\uFF08\u7559\u7A7A\u4E3A Vault \u6839\u76EE\u5F55\uFF09",
    portTitle: "\u672C\u5730\u7AEF\u53E3",
    portDesc: "\u9ED8\u8BA4 27124\u3002\u4FEE\u6539\u540E\u670D\u52A1\u4F1A\u81EA\u52A8\u91CD\u542F\u3002",
    connectTitle: "\u8FDE\u63A5 GuideRail",
    pairingCodePrefix: "\u914D\u5BF9\u7801\uFF1A",
    clickToCopy: "\u70B9\u51FB\u590D\u5236\u914D\u5BF9\u7801",
    codeCopiedNotice: "\u5DF2\u590D\u5236\u914D\u5BF9\u7801\uFF1A{code}",
    codeNoticeWithClip: "GuideRail \u914D\u5BF9\u7801\uFF1A{code}\uFF08\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF09",
    codeNoticeWithoutClip: "GuideRail \u914D\u5BF9\u7801\uFF1A{code}",
    validNotice: "\uFF08\u7EA6 {minutes} \u5206\u949F\u5185\u6709\u6548\uFF0C\u5355\u6B21\u4F7F\u7528\u3002\u70B9\u51FB\u914D\u5BF9\u7801\u6216\u53F3\u4FA7\u6309\u94AE\u590D\u5236\uFF09",
    copyCodeButton: "\u590D\u5236\u914D\u5BF9\u7801",
    connectDescDefault: "\u70B9\u51FB\u540E\u751F\u6210\u4E00\u6B21\u6027\u914D\u5BF9\u7801\uFF0C\u5E76\u81EA\u52A8\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",
    regenerateButton: "\u91CD\u65B0\u751F\u6210",
    generateButton: "\u751F\u6210\u914D\u5BF9\u7801",
    cannotBeginPairing: "\u65E0\u6CD5\u5F00\u59CB\u914D\u5BF9",
    pairedClientsTitle: "\u5DF2\u914D\u5BF9\u5BA2\u6237\u7AEF",
    pairedClientsDesc: "{count} \u4E2A\u5DF2\u6388\u6743\u5BA2\u6237\u7AEF",
    revokeAllButton: "\u64A4\u9500\u5168\u90E8",
    revokedAllNotice: "\u5DF2\u64A4\u9500\u5168\u90E8 GuideRail \u8FDE\u63A5",
    clientPairedNotice: "GuideRail \u5BA2\u6237\u7AEF\u914D\u5BF9\u6210\u529F\uFF1A{origin}",
    serverStartFailedNotice: "GuideRail Companion \u65E0\u6CD5\u542F\u52A8\uFF1A{error}",
    serverNotRunningError: "\u672C\u5730\u670D\u52A1\u672A\u542F\u52A8",
    portUnavailable: "\u7AEF\u53E3\u4E0D\u53EF\u7528"
  }
};
function tCompanion(key, params) {
  const locale = getObsidianLocale();
  let text2 = strings[locale][key] ?? strings.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text2 = text2.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text2;
}

// src/main.ts
var defaults = () => ({ port: 27124, rootFolder: "GuideRail", instanceId: (0, import_node_crypto3.randomUUID)(), clients: [] });
var ObsidianStorage = class {
  constructor(adapter) {
    this.adapter = adapter;
  }
  exists(path) {
    return this.adapter.exists((0, import_obsidian.normalizePath)(path));
  }
  read(path) {
    return this.adapter.read((0, import_obsidian.normalizePath)(path));
  }
  write(path, data) {
    return this.adapter.write((0, import_obsidian.normalizePath)(path), data);
  }
  readBinary(path) {
    return this.adapter.readBinary((0, import_obsidian.normalizePath)(path));
  }
  writeBinary(path, data) {
    return this.adapter.writeBinary((0, import_obsidian.normalizePath)(path), data);
  }
  mkdir(path) {
    return this.adapter.mkdir((0, import_obsidian.normalizePath)(path));
  }
  remove(path) {
    return this.adapter.remove((0, import_obsidian.normalizePath)(path));
  }
  rename(from, to) {
    return this.adapter.rename((0, import_obsidian.normalizePath)(from), (0, import_obsidian.normalizePath)(to));
  }
  list(path) {
    return this.adapter.list((0, import_obsidian.normalizePath)(path));
  }
};
async function copyToClipboard(text2) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text2);
      return true;
    }
  } catch {
  }
  try {
    const input = document.createElement("textarea");
    input.value = text2;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(input);
    return ok;
  } catch {
  }
  return false;
}
var GuideRailCompanionPlugin = class extends import_obsidian.Plugin {
  settings = defaults();
  server = null;
  activeTab = null;
  async onload() {
    this.settings = { ...defaults(), ...await this.loadData() };
    this.addSettingTab(new CompanionSettingsTab(this.app, this));
    await this.restartServer();
  }
  async onunload() {
    this.activeTab = null;
    await this.server?.stop();
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  updateRootFolder(rootFolder) {
    this.settings.rootFolder = rootFolder;
    const library = new CompanionVaultLibrary(new ObsidianStorage(this.app.vault.adapter), rootFolder);
    this.server?.updateLibrary(library);
  }
  async restartServer() {
    await this.server?.stop();
    const library = new CompanionVaultLibrary(new ObsidianStorage(this.app.vault.adapter), this.settings.rootFolder);
    this.server = new CompanionServer(
      library,
      this.settings,
      async (settings) => {
        this.settings = { ...this.settings, ...settings };
        await this.saveSettings();
      },
      manifest_default.version,
      this.app.vault.getName(),
      (client) => {
        new import_obsidian.Notice(tCompanion("clientPairedNotice", { origin: client.origin }));
        this.activeTab?.display();
      }
    );
    try {
      await this.server.start();
    } catch (error) {
      this.server = null;
      new import_obsidian.Notice(tCompanion("serverStartFailedNotice", { error: error instanceof Error ? error.message : tCompanion("portUnavailable") }));
    }
  }
  beginPairing() {
    if (!this.server) throw new Error(tCompanion("serverNotRunningError"));
    return this.server.startPairing();
  }
  currentPairing() {
    return this.server?.currentPairing() ?? null;
  }
};
var CompanionSettingsTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  hide() {
    if (this.plugin.activeTab === this) this.plugin.activeTab = null;
  }
  display() {
    this.plugin.activeTab = this;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: tCompanion("header") });
    containerEl.createEl("p", { text: tCompanion("desc") });
    new import_obsidian.Setting(containerEl).setName(tCompanion("rootFolderTitle")).setDesc(tCompanion("rootFolderDesc")).addText((text2) => text2.setPlaceholder(tCompanion("rootFolderPlaceholder")).setValue(this.plugin.settings.rootFolder).onChange(async (value) => {
      const next = value.trim();
      if (next === this.plugin.settings.rootFolder) return;
      this.plugin.updateRootFolder(next);
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName(tCompanion("portTitle")).setDesc(tCompanion("portDesc")).addText((text2) => text2.setValue(String(this.plugin.settings.port)).onChange(async (value) => {
      const port = Number(value.trim());
      if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === this.plugin.settings.port) return;
      this.plugin.settings.port = port;
      await this.plugin.saveSettings();
      await this.plugin.restartServer();
    }));
    const pairing = this.plugin.currentPairing();
    const remainingMinutes = pairing ? Math.max(1, Math.ceil((pairing.expiresAt - Date.now()) / 6e4)) : 0;
    const pairingSetting = new import_obsidian.Setting(containerEl).setName(tCompanion("connectTitle"));
    if (pairing) {
      const desc = document.createDocumentFragment();
      desc.append(tCompanion("pairingCodePrefix"));
      const codeSpan = document.createElement("code");
      codeSpan.textContent = pairing.code;
      codeSpan.style.userSelect = "all";
      codeSpan.style.fontSize = "1.15em";
      codeSpan.style.fontWeight = "bold";
      codeSpan.style.padding = "2px 6px";
      codeSpan.style.cursor = "pointer";
      codeSpan.title = tCompanion("clickToCopy");
      codeSpan.onclick = async () => {
        const ok = await copyToClipboard(pairing.code);
        new import_obsidian.Notice(ok ? tCompanion("codeCopiedNotice", { code: pairing.code }) : tCompanion("codeNoticeWithoutClip", { code: pairing.code }));
      };
      desc.append(codeSpan);
      desc.append(tCompanion("validNotice", { minutes: remainingMinutes }));
      pairingSetting.setDesc(desc);
      pairingSetting.addButton((button) => button.setButtonText(tCompanion("copyCodeButton")).onClick(async () => {
        const ok = await copyToClipboard(pairing.code);
        new import_obsidian.Notice(ok ? tCompanion("codeCopiedNotice", { code: pairing.code }) : tCompanion("codeNoticeWithoutClip", { code: pairing.code }));
      }));
    } else {
      pairingSetting.setDesc(tCompanion("connectDescDefault"));
    }
    pairingSetting.addButton((button) => button.setButtonText(pairing ? tCompanion("regenerateButton") : tCompanion("generateButton")).setCta(!pairing).onClick(async () => {
      try {
        const code = this.plugin.beginPairing();
        const ok = await copyToClipboard(code);
        new import_obsidian.Notice(ok ? tCompanion("codeNoticeWithClip", { code }) : tCompanion("codeNoticeWithoutClip", { code }), 3e4);
        this.display();
      } catch (error) {
        new import_obsidian.Notice(error instanceof Error ? error.message : tCompanion("cannotBeginPairing"));
      }
    }));
    new import_obsidian.Setting(containerEl).setName(tCompanion("pairedClientsTitle")).setDesc(tCompanion("pairedClientsDesc", { count: this.plugin.settings.clients.length })).addButton((button) => button.setButtonText(tCompanion("revokeAllButton")).setWarning().onClick(async () => {
      this.plugin.settings.clients = [];
      this.plugin.server?.cancelPairing();
      await this.plugin.saveSettings();
      new import_obsidian.Notice(tCompanion("revokedAllNotice"));
      this.display();
    }));
  }
};
