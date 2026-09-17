import { captureTargets, messageIdentity, messageImages } from './message-targets';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { locateMessage } from './locate';
import type { Capture } from '../storage/schema';
import { t, setGlobalLanguageSetting, LANGUAGE_SETTING_KEY } from '../i18n/core';

(() => {
  let locateGeneration = 0;
  const saving = new WeakSet<HTMLElement>();
  const buttonOwners = new WeakMap<HTMLElement, HTMLElement>();
  const conversation = () => location.pathname.match(/^\/c\/([a-zA-Z0-9_-]+)\/?$/)?.[1];
  const streaming = () => !!document.querySelector('[data-testid="stop-button"], .result-streaming');
  function snapshot(el: HTMLElement, included = messageImages(el)): Capture | null {
    const conversationId = conversation(); const identity = messageIdentity(el);
    if (!el.isConnected || !conversationId || !identity) return null;
    const { messageId, role } = identity;
    const clone = el.cloneNode(true) as HTMLElement;
    Array.from(clone.querySelectorAll('img')).forEach((img, index) => { const original = el.querySelectorAll('img')[index]; const imageIndex = included.indexOf(original); if (imageIndex >= 0) img.replaceWith(document.createTextNode(`\nGUIDERAILIMAGE${imageIndex}PLACEHOLDER\n`)); });
    clone.querySelectorAll('button').forEach(button => { const markers = button.textContent?.match(/GUIDERAILIMAGE\d+PLACEHOLDER/g); if (markers?.length) button.replaceWith(document.createTextNode(markers.join('\n'))); });
    clone.querySelectorAll('[data-guiderail],button,img,svg,iframe,style,script,video,audio').forEach(node => node.remove());
    const html = clone.innerHTML;
    clone.querySelectorAll('pre').forEach(pre => { pre.textContent = `\n\`\`\`\n${pre.querySelector('code')?.textContent ?? pre.textContent}\n\`\`\`\n`; });
    clone.querySelectorAll('p,li,h1,h2,h3,h4,blockquote,br,tr').forEach(block => { block.append(document.createTextNode('\n')); });
    const text = (clone.textContent || '').replace(/GUIDERAILIMAGE\d+PLACEHOLDER/g, '');
    const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' }); converter.use(gfm);
    return { markdown: converter.turndown(html), conversationId, messageId, role: role as Capture['role'], pageUrl: `https://chatgpt.com/c/${conversationId}`, text: text.trim(), html };
  }
  function node<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const el = document.createElement(tag); el.textContent = text; return el; }
  async function imageData(url: URL, conversationId: string) {
    if (url.protocol === 'https:' && url.hostname !== 'chatgpt.com') {
      const result = await chrome.runtime.sendMessage({ kind: 'guiderail:imageDownload', url: url.href, conversationId });
      if (!result?.ok && result?.errorCode === 'unsupported-source') return null;
      if (!result?.ok || typeof result.data !== 'string' || typeof result.size !== 'number') throw new Error(result?.error || '图片下载失败，请稍后重试');
      return { data: result.data as string, size: result.size as number };
    }
    const response = await fetch(url.href, { credentials: url.origin === location.origin ? 'include' : 'omit', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('图片下载失败，请稍后重试');
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!type || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) throw new Error('图片格式暂不支持');
    const reader = response.body?.getReader(); if (!reader) throw new Error('无法读取图片');
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 10 * 1024 * 1024) throw new Error('单张图片不能超过 10 MB'); chunks.push(value); } } finally { await reader.cancel().catch(() => {}); }
    const blob = new Blob(chunks as BlobPart[], { type });
    const data = await new Promise<string>((resolve, reject) => { const file = new FileReader(); file.onload = () => resolve(String(file.result)); file.onerror = () => reject(new Error('无法读取图片')); file.readAsDataURL(blob); });
    return { data, size };
  }
  async function collect(el: HTMLElement) {
    if (streaming() || saving.has(el)) return;
    const images = messageImages(el);
    const capture = snapshot(el, images); if (!capture) return;
    const button = el.querySelector<HTMLButtonElement>('[data-guiderail="collect"]'); if (!button) return;
    saving.add(el); button.textContent = t('btnSaving');
    try {
      const ready = await chrome.runtime.sendMessage({ kind: 'guiderail:libraryReady' });
      if (!ready?.ok) throw new Error(ready?.error || t('toastConfigureLibraryFirst'));
      if (images.length > 12) throw new Error('每条回复最多保存 12 张图片');
      capture.images = [];
      let total = 0;
      let skippedImages = 0;
      const seenContent = new Set<string>();
      const replacements = new Map<number, string>();
      for (const [index, img] of images.entries()) {
        if (!img.complete || !img.naturalWidth) throw new Error('图片尚未加载完成，请稍后重试');
        const url = new URL(img.currentSrc || img.src, location.href);
        if (!['https:', 'blob:'].includes(url.protocol)) throw new Error('图片地址暂不支持');
        const downloaded = await imageData(url, capture.conversationId);
        if (!downloaded) { replacements.set(index, ''); skippedImages++; continue; }
        total += downloaded.size;
        if (total > 18 * 1024 * 1024) throw new Error('每条回复中的图片总计不能超过 18 MB');
        const data = downloaded.data;
        // Different preview URLs may still return the same image bytes.
        const content = data.slice(data.indexOf(',') + 1);
        if (seenContent.has(content)) { replacements.set(index, ''); continue; }
        seenContent.add(content);
        replacements.set(index, `GUIDERAILIMAGE${capture.images.length}PLACEHOLDER`);
        capture.images.push({ data });
      }
      const remap = (value: string) => value.replace(/GUIDERAILIMAGE(\d+)PLACEHOLDER/g, (_match, index: string) => replacements.get(Number(index)) ?? '');
      if (capture.markdown) capture.markdown = remap(capture.markdown);
      if (capture.html) capture.html = remap(capture.html);
      if (!capture.text && !capture.images.length) throw new Error(skippedImages ? '这条回复只有暂不支持的图片，未创建空白收藏' : '回复内容尚未加载');
      const result = await chrome.runtime.sendMessage({ kind: 'guiderail:command', target: ready.target, command: { type: 'saveReply', capture } });
      if (!result?.ok) {
        button.textContent = result?.error === 'conversation-changed' ? t('conversationChanged') : `${result?.error || t('toastSaveFailed')} · ${t('btnRetry')}`;
        return;
      }
      button.textContent = skippedImages ? t('btnSavedTextOnly', { count: skippedImages }) : t('btnBookmarked');
    } catch (error) {
      button.textContent = !chrome.runtime?.id || /extension context invalidated/i.test(String(error))
        ? t('toastExtensionUpdated') : `${error instanceof Error ? error.message : t('toastSaveFailed')} · ${t('btnRetry')}`;
    }
    finally { saving.delete(el); }
  }

  function showToast(text: string, isError = false) {
    let toast = document.querySelector<HTMLElement>('[data-guiderail="toast"]');
    if (!toast) {
      toast = node('div');
      toast.dataset.guiderail = 'toast';
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;padding:9px 18px;font:13px/1.4 system-ui,-apple-system,sans-serif;color:#fff;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.25);transition:opacity .25s ease,transform .25s ease;opacity:0;transform:translateY(8px);pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.background = isError ? '#d32f2f' : '#1e1e24';
    void toast.offsetHeight;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    const holder = toast as unknown as { _timer?: ReturnType<typeof setTimeout> };
    if (holder._timer) clearTimeout(holder._timer);
    holder._timer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => { toast?.remove(); }, 300);
      }
    }, 2500);
  }

  function textHash(str: string): string {
    let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function quoteBlock(md: string): string {
    return md.split('\n').map(line => (line.trim().length ? `> ${line}` : '>')).join('\n');
  }

  let clipping = false;
  async function clipSelection() {
    if (clipping) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      showToast(t('toastSelectText'), true);
      return;
    }
    const conversationId = conversation();
    if (!conversationId) {
      showToast(t('toastChatGPTOnly'), true);
      return;
    }
    if (streaming()) {
      showToast(t('toastStreaming'), true);
      return;
    }

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const container = node('div');
    container.appendChild(fragment);

    container.querySelectorAll('[data-guiderail],button,img,svg,iframe,style,script,video,audio').forEach(item => item.remove());
    const html = container.innerHTML;
    container.querySelectorAll('pre').forEach(pre => {
      pre.textContent = `\n\`\`\`\n${pre.querySelector('code')?.textContent ?? pre.textContent}\n\`\`\`\n`;
    });
    container.querySelectorAll('p,li,h1,h2,h3,h4,blockquote,br,tr').forEach(block => {
      block.append(document.createTextNode('\n'));
    });
    const rawText = (container.textContent || '').trim();
    if (!rawText) {
      showToast(t('toastEmptyText'), true);
      return;
    }

    const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    converter.use(gfm);
    const markdown = converter.turndown(html);

    let anchorNode: Node | null = range.commonAncestorContainer;
    if (anchorNode.nodeType === Node.TEXT_NODE) anchorNode = anchorNode.parentElement;
    const messageEl = (anchorNode as HTMLElement | null)?.closest<HTMLElement>('[data-message-id], [data-turn]');
    const identity = messageEl ? messageIdentity(messageEl) : null;
    const parentMessageId = identity?.messageId;

    const hash = textHash(rawText);
    const messageId = parentMessageId
      ? `hl-${parentMessageId.slice(0, 36)}-${hash}`
      : `hl-sel-${hash}`;

    const snippet = rawText.replace(/\s+/g, ' ').slice(0, 36).trim();
    const preferredTitle = `${t('excerptPrefix')}${snippet}${rawText.length > 36 ? '…' : ''}`;

    clipping = true;
    showToast(t('toastClipping'));

    try {
      const ready = await chrome.runtime.sendMessage({ kind: 'guiderail:libraryReady' });
      if (!ready?.ok) throw new Error(ready?.error || t('toastConfigureLibraryFirst'));

      const capture: Capture = {
        conversationId,
        messageId,
        role: 'assistant',
        pageUrl: `https://chatgpt.com/c/${conversationId}`,
        text: rawText,
        markdown: quoteBlock(markdown),
        html,
      };

      const result = await chrome.runtime.sendMessage({
        kind: 'guiderail:command',
        target: ready.target,
        command: { type: 'saveReply', capture, preferredTitle },
      });

      if (!result?.ok) throw new Error(result?.error || t('toastSaveFailed'));
      showToast(t('toastClipped', { notebook: result.notebook || (t('excerptPrefix').trim() === '摘录:' ? '收件箱' : 'Inbox') }));
    } catch (error) {
      const msg = !chrome.runtime?.id || /extension context invalidated/i.test(String(error))
        ? t('toastExtensionUpdated')
        : (error instanceof Error ? error.message : t('toastSaveFailed'));
      showToast(msg, true);
    } finally {
      clipping = false;
    }
  }

  window.addEventListener('keydown', event => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && (event.code === 'KeyS' || event.key === 's' || event.key === 'S' || event.key === 'ß')) {
      event.preventDefault();
      void clipSelection();
    }
  });

  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      chrome.storage?.local?.get(LANGUAGE_SETTING_KEY).then(res => {
        if (res?.[LANGUAGE_SETTING_KEY]) setGlobalLanguageSetting(res[LANGUAGE_SETTING_KEY]);
        scan();
      }).catch(() => {});

      chrome.storage?.onChanged?.addListener(changes => {
        try {
          if (changes[LANGUAGE_SETTING_KEY]?.newValue) {
            setGlobalLanguageSetting(changes[LANGUAGE_SETTING_KEY].newValue);
            scan();
          }
        } catch {}
      });
    }
  } catch {}

  function scan() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) return;
    try {
      const targets = captureTargets();
      document.querySelectorAll<HTMLElement>('[data-guiderail="collect"]').forEach(button => { if (!targets.includes(buttonOwners.get(button)!)) { const parent = button.parentElement; button.remove(); if (parent?.dataset.guiderail === 'actions') parent.remove(); } });
      targets.forEach(el => {
        let button = el.querySelector<HTMLButtonElement>('[data-guiderail="collect"]');
        if (!button) {
          button = node('button', t('btnBookmark')); button.dataset.guiderail = 'collect'; button.style.cssText = 'font:12px sans-serif;padding:5px 10px;display:block;align-self:flex-end;width:fit-content;max-width:100%;margin:8px 0 8px auto;border:1px solid #789;border-radius:5px;background:#f5faf7;color:#234;cursor:pointer'; button.onclick = () => { void collect(el); };
          buttonOwners.set(button, el);
          if (el.matches('[data-turn]')) {
            // The turn spans the viewport; its screenshot-content wrapper follows
            // the same centered reading column as ordinary text replies.
            const content = el.querySelector<HTMLElement>('[data-conversation-screenshot-content]');
            const actions = node('div'); actions.dataset.guiderail = 'actions';
            actions.style.cssText = 'box-sizing:border-box;display:flex;justify-content:flex-end;align-self:center;width:100%;min-width:0;padding:0 2px;';
            if (!content) actions.style.cssText += 'max-width:var(--thread-content-max-width,48rem);margin-inline:auto;padding-inline:16px;';
            actions.append(button); (content ?? el).append(actions);
          } else el.append(button);
        } else if (!saving.has(el) && !button.textContent?.includes('✓') && !button.textContent?.includes('…')) {
          button.textContent = t('btnBookmark');
        }
        button.disabled = streaming() || !conversation() || saving.has(el);
      });
    } catch {}
  }
  const scanInterval = setInterval(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      clearInterval(scanInterval);
      return;
    }
    scan();
  }, 1200);
  scan();
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, _sender, respond) => {
        if (message?.kind === 'guiderail:clipSelection') {
          void clipSelection();
          respond({ ok: true });
          return true;
        }
        if (message?.kind === 'guiderail:longReplies') {
          const replies = streaming() ? [] : captureTargets().map(el => snapshot(el)).filter((item): item is Capture => !!item && item.text.length >= 300).sort((a, b) => b.text.length - a.text.length).slice(0, 5);
          respond({ replies }); return;
        }
        if (message?.kind === 'guiderail:status') { respond({ available: !!document.querySelector('[data-message-id]'), streaming: streaming() }); return; }
        if (message?.kind !== 'guiderail:locate') return;
        const generation = ++locateGeneration;
        if (conversation() !== message.conversationId) { respond({ found: false, reason: 'cancelled' }); return; }
        let interrupted = false;
        const interrupt = () => { interrupted = true; };
        const keyInterrupt = (event: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', 'Escape', ' '].includes(event.key)) interrupt(); };
        window.addEventListener('wheel', interrupt, { passive: true });
        window.addEventListener('touchstart', interrupt, { passive: true });
        window.addEventListener('pointerdown', interrupt);
        window.addEventListener('keydown', keyInterrupt);
        const cancelled = () => interrupted || generation !== locateGeneration || conversation() !== message.conversationId;
        const target = () => [...captureTargets(), ...Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]'))].find(el => {
          const currentId = messageIdentity(el)?.messageId;
          if (!currentId) return false;
          if (currentId === message.messageId) return true;
          if (typeof message.messageId === 'string' && message.messageId.startsWith('hl-') && message.messageId.includes(currentId)) return true;
          return false;
        });
        const scrollRoot = () => {
          const anchor = target() ?? document.querySelector<HTMLElement>('[data-message-id]');
          if (!anchor) return null;
          for (let parent = anchor?.parentElement; parent; parent = parent.parentElement) {
            if (parent.clientHeight > 0 && parent.scrollHeight > parent.clientHeight + 2 && /auto|scroll|overlay/.test(getComputedStyle(parent).overflowY)) return parent;
          }
          const root = document.scrollingElement;
          return root instanceof HTMLElement && root.clientHeight > 0 ? root : null;
        };
        const wait = () => new Promise<void>(resolve => setTimeout(resolve, 200));
        const run = async () => {
          const result = await locateMessage({
            cancelled, now: () => Date.now(), wait,
            find: () => !!target(),
            viewport: () => {
              const root = scrollRoot();
              return root ? { top: root.scrollTop, height: root.clientHeight, extent: root.scrollHeight, signature: Array.from(document.querySelectorAll<HTMLElement>('[data-message-id]')).map(el => el.dataset.messageId).join('|') } : null;
            },
            scroll: top => { if (!cancelled()) scrollRoot()?.scrollTo({ top, behavior: 'instant' as ScrollBehavior }); },
            reveal: async () => {
              const found = target(); if (!found || cancelled()) return false;
              found.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
              await wait();
              const mounted = target(); if (!mounted || cancelled()) return false;
              const bounds = mounted.getBoundingClientRect(); const root = scrollRoot(); const viewport = root?.getBoundingClientRect();
              if (bounds.bottom <= Math.max(0, viewport?.top ?? 0) || bounds.top >= Math.min(innerHeight, viewport?.bottom ?? innerHeight)) return false;
              const outline = mounted.style.outline; mounted.style.outline = '3px solid #218058'; setTimeout(() => { mounted.style.outline = outline; }, 2500);
              return true;
            },
          });
          const currentTarget = target();
          respond({ ...result, changed: result.found && currentTarget ? snapshot(currentTarget)?.text !== message.text : undefined });
        };
        void run().catch(() => respond({ found: false, reason: 'unavailable' })).finally(() => {
          window.removeEventListener('wheel', interrupt); window.removeEventListener('touchstart', interrupt);
          window.removeEventListener('pointerdown', interrupt); window.removeEventListener('keydown', keyInterrupt);
        });
        return true;
      });
    }
  } catch {}
})();
