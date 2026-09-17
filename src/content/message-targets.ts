/** Generated image cards can live directly under a turn, outside message nodes. */
const messageSelector = '[data-message-id][data-message-author-role="assistant"]';
const turnSelector = '[data-turn="assistant"][data-turn-id]';
export function messageImages(el: HTMLElement): HTMLImageElement[] {
  const seen = new Set<string>();
  return Array.from(el.querySelectorAll<HTMLImageElement>('img')).filter(img => {
    if (img.closest('[data-guiderail], [hidden], [aria-hidden="true"]') || Math.max(img.naturalWidth, img.width) <= 80 || Math.max(img.naturalHeight, img.height) <= 80) return false;
    for (let node: HTMLElement | null = img; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (node === el) break;
    }
    const url = img.currentSrc || img.src;
    if (!url || seen.has(url)) return false;
    seen.add(url); return true;
  });
}
export function messageIdentity(el: HTMLElement): { messageId: string; role: 'assistant' | 'user' } | null {
  if (el.matches(turnSelector)) return { messageId: `turn-${el.dataset.turnId}`, role: 'assistant' };
  const role = el.dataset.messageAuthorRole;
  return el.dataset.messageId && (role === 'assistant' || role === 'user') ? { messageId: el.dataset.messageId, role } : null;
}
export function captureTargets(): HTMLElement[] {
  const targets = Array.from(document.querySelectorAll<HTMLElement>(messageSelector));
  for (const turn of Array.from(document.querySelectorAll<HTMLElement>(turnSelector))) {
    const messages = targets.filter(el => turn.contains(el));
    if (!messageImages(turn).some(img => !messages.some(el => el.contains(img)))) continue;
    // One turn-level button captures the complete reply, including sibling image cards.
    for (const message of messages) targets.splice(targets.indexOf(message), 1);
    targets.push(turn);
  }
  return targets;
}
