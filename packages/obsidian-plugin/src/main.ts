import { Notice, Plugin, PluginSettingTab, Setting, normalizePath, type App, type DataAdapter } from 'obsidian';
import { randomUUID } from 'node:crypto';
import manifest from '../manifest.json';
import { CompanionServer, type CompanionServerSettings } from './server';
import { CompanionVaultLibrary, type VaultStorage } from './vault-library';
import { tCompanion } from './i18n';

interface CompanionSettings extends CompanionServerSettings { rootFolder: string }
const defaults = (): CompanionSettings => ({ port: 27124, rootFolder: 'GuideRail', instanceId: randomUUID(), clients: [] });

class ObsidianStorage implements VaultStorage {
  constructor(private adapter: DataAdapter) {}
  exists(path: string) { return this.adapter.exists(normalizePath(path)); }
  read(path: string) { return this.adapter.read(normalizePath(path)); }
  write(path: string, data: string) { return this.adapter.write(normalizePath(path), data); }
  readBinary(path: string) { return this.adapter.readBinary(normalizePath(path)); }
  writeBinary(path: string, data: ArrayBuffer) { return this.adapter.writeBinary(normalizePath(path), data); }
  mkdir(path: string) { return this.adapter.mkdir(normalizePath(path)); }
  remove(path: string) { return this.adapter.remove(normalizePath(path)); }
  rename(from: string, to: string) { return this.adapter.rename(normalizePath(from), normalizePath(to)); }
  list(path: string) { return this.adapter.list(normalizePath(path)); }
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const input = document.createElement('textarea');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(input);
    return ok;
  } catch {}
  return false;
}

export default class GuideRailCompanionPlugin extends Plugin {
  settings = defaults(); server: CompanionServer | null = null; activeTab: CompanionSettingsTab | null = null;
  async onload() {
    this.settings = { ...defaults(), ...(await this.loadData() as Partial<CompanionSettings> | null) };
    this.addSettingTab(new CompanionSettingsTab(this.app, this));
    await this.restartServer();
  }
  async onunload() { this.activeTab = null; await this.server?.stop(); }
  async saveSettings() { await this.saveData(this.settings); }
  updateRootFolder(rootFolder: string) {
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
      async settings => { this.settings = { ...this.settings, ...settings }; await this.saveSettings(); },
      manifest.version,
      this.app.vault.getName(),
      client => {
        new Notice(tCompanion('clientPairedNotice', { origin: client.origin }));
        this.activeTab?.display();
      }
    );
    try {
      await this.server.start();
    } catch (error) {
      this.server = null;
      new Notice(tCompanion('serverStartFailedNotice', { error: error instanceof Error ? error.message : tCompanion('portUnavailable') }));
    }
  }
  beginPairing() { if (!this.server) throw new Error(tCompanion('serverNotRunningError')); return this.server.startPairing(); }
  currentPairing() { return this.server?.currentPairing() ?? null; }
}

class CompanionSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: GuideRailCompanionPlugin) { super(app, plugin); }
  hide() { if (this.plugin.activeTab === this) this.plugin.activeTab = null; }
  display() {
    this.plugin.activeTab = this;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: tCompanion('header') });
    containerEl.createEl('p', { text: tCompanion('desc') });
    new Setting(containerEl)
      .setName(tCompanion('rootFolderTitle'))
      .setDesc(tCompanion('rootFolderDesc'))
      .addText(text => text.setPlaceholder(tCompanion('rootFolderPlaceholder')).setValue(this.plugin.settings.rootFolder).onChange(async value => {
        const next = value.trim();
        if (next === this.plugin.settings.rootFolder) return;
        this.plugin.updateRootFolder(next);
        await this.plugin.saveSettings();
      }));
    new Setting(containerEl)
      .setName(tCompanion('portTitle'))
      .setDesc(tCompanion('portDesc'))
      .addText(text => text.setValue(String(this.plugin.settings.port)).onChange(async value => {
        const port = Number(value.trim());
        if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === this.plugin.settings.port) return;
        this.plugin.settings.port = port;
        await this.plugin.saveSettings();
        await this.plugin.restartServer();
      }));
    const pairing = this.plugin.currentPairing();
    const remainingMinutes = pairing ? Math.max(1, Math.ceil((pairing.expiresAt - Date.now()) / 60_000)) : 0;
    const pairingSetting = new Setting(containerEl).setName(tCompanion('connectTitle'));
    if (pairing) {
      const desc = document.createDocumentFragment();
      desc.append(tCompanion('pairingCodePrefix'));
      const codeSpan = document.createElement('code');
      codeSpan.textContent = pairing.code;
      codeSpan.style.userSelect = 'all';
      codeSpan.style.fontSize = '1.15em';
      codeSpan.style.fontWeight = 'bold';
      codeSpan.style.padding = '2px 6px';
      codeSpan.style.cursor = 'pointer';
      codeSpan.title = tCompanion('clickToCopy');
      codeSpan.onclick = async () => {
        const ok = await copyToClipboard(pairing.code);
        new Notice(ok ? tCompanion('codeCopiedNotice', { code: pairing.code }) : tCompanion('codeNoticeWithoutClip', { code: pairing.code }));
      };
      desc.append(codeSpan);
      desc.append(tCompanion('validNotice', { minutes: remainingMinutes }));
      pairingSetting.setDesc(desc);
      pairingSetting.addButton(button => button.setButtonText(tCompanion('copyCodeButton')).onClick(async () => {
        const ok = await copyToClipboard(pairing.code);
        new Notice(ok ? tCompanion('codeCopiedNotice', { code: pairing.code }) : tCompanion('codeNoticeWithoutClip', { code: pairing.code }));
      }));
    } else {
      pairingSetting.setDesc(tCompanion('connectDescDefault'));
    }
    pairingSetting.addButton(button => button.setButtonText(pairing ? tCompanion('regenerateButton') : tCompanion('generateButton')).setCta(!pairing).onClick(async () => {
      try {
        const code = this.plugin.beginPairing();
        const ok = await copyToClipboard(code);
        new Notice(ok ? tCompanion('codeNoticeWithClip', { code }) : tCompanion('codeNoticeWithoutClip', { code }), 30_000);
        this.display();
      } catch (error) {
        new Notice(error instanceof Error ? error.message : tCompanion('cannotBeginPairing'));
      }
    }));
    new Setting(containerEl)
      .setName(tCompanion('pairedClientsTitle'))
      .setDesc(tCompanion('pairedClientsDesc', { count: this.plugin.settings.clients.length }))
      .addButton(button => button.setButtonText(tCompanion('revokeAllButton')).setWarning().onClick(async () => {
        this.plugin.settings.clients = [];
        this.plugin.server?.cancelPairing();
        await this.plugin.saveSettings();
        new Notice(tCompanion('revokedAllNotice'));
        this.display();
      }));
  }
}
