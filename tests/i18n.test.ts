// @vitest-environment jsdom
import { describe, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dictionaries, getEffectiveLocale, getSystemLocale, setGlobalLanguageSetting, t, LANGUAGE_SETTING_KEY } from '../src/i18n';
import { tCompanion, getObsidianLocale } from '../packages/obsidian-plugin/src/i18n';

describe('i18n module', () => {
  beforeEach(() => {
    setGlobalLanguageSetting('auto');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setGlobalLanguageSetting('auto');
  });

  it('has identical keys in English and Chinese dictionaries', () => {
    const enKeys = Object.keys(dictionaries.en).sort();
    const zhKeys = Object.keys(dictionaries.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('translates content in both languages', () => {
    expect(t('btnBookmark', undefined, 'en')).toBe('☆ Bookmark');
    expect(t('btnBookmark', undefined, 'zh')).toBe('☆ 收藏');

    expect(t('btnBookmarked', undefined, 'en')).toBe('✓ Bookmarked');
    expect(t('btnBookmarked', undefined, 'zh')).toBe('✓ 已收藏');

    expect(t('settings', undefined, 'en')).toBe('Settings');
    expect(t('settings', undefined, 'zh')).toBe('设置');
  });

  it('interpolates parameters correctly in both languages', () => {
    expect(t('toastClipped', { notebook: 'Notes' }, 'en')).toBe('✓ Clipped to Notes');
    expect(t('toastClipped', { notebook: '收件箱' }, 'zh')).toBe('✓ 已摘录至 收件箱');

    expect(t('btnSavedTextOnly', { count: 3 }, 'en')).toBe('✓ Text saved · 3 images skipped');
    expect(t('btnSavedTextOnly', { count: 3 }, 'zh')).toBe('✓ 正文已收藏 · 3 张图片未保存');
  });

  it('resolves effective locale based on setting and system locale', () => {
    expect(getEffectiveLocale('en')).toBe('en');
    expect(getEffectiveLocale('zh')).toBe('zh');

    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    expect(getEffectiveLocale('auto')).toBe('zh');

    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    expect(getSystemLocale()).toBe('en');
    expect(getEffectiveLocale('auto')).toBe('en');

    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    expect(getSystemLocale()).toBe('zh');

    Object.defineProperty(navigator, 'language', { value: 'ja-JP', configurable: true });
    expect(getEffectiveLocale('auto')).toBe('en');
    expect(LANGUAGE_SETTING_KEY).toBe('guiderail-language');
  });

  it('updates global language setting', () => {
    setGlobalLanguageSetting('zh');
    expect(t('bookmarks')).toBe('收藏');

    setGlobalLanguageSetting('en');
    expect(t('bookmarks')).toBe('Bookmarks');
  });
});

describe('Obsidian companion i18n', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('translates companion strings based on Obsidian language setting', () => {
    window.localStorage.setItem('language', 'zh');
    expect(getObsidianLocale()).toBe('zh');
    expect(tCompanion('header')).toBe('GuideRail Companion');
    expect(tCompanion('rootFolderTitle')).toBe('保存根目录');
    expect(tCompanion('connectTitle')).toBe('连接 GuideRail');

    window.localStorage.setItem('language', 'en');
    expect(getObsidianLocale()).toBe('en');
    expect(tCompanion('rootFolderTitle')).toBe('Vault Root Folder');
    expect(tCompanion('connectTitle')).toBe('Connect GuideRail');
  });

  it('interpolates parameters in companion strings', () => {
    window.localStorage.setItem('language', 'en');
    expect(tCompanion('codeCopiedNotice', { code: 'ABCD2345' })).toBe('Pairing code copied: ABCD2345');
    expect(tCompanion('pairedClientsDesc', { count: 2 })).toBe('2 authorized client(s)');

    window.localStorage.setItem('language', 'zh');
    expect(tCompanion('codeCopiedNotice', { code: 'ABCD2345' })).toBe('已复制配对码：ABCD2345');
    expect(tCompanion('pairedClientsDesc', { count: 2 })).toBe('2 个已授权客户端');
  });
});
