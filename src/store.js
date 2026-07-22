import fs from 'node:fs/promises';
import path from 'node:path';

export class GuildConfigStore {
  #filePath;
  #configs = new Map();
  #writeQueue = Promise.resolve();

  constructor(filePath) {
    this.#filePath = filePath;
  }

  async init() {
    await fs.mkdir(path.dirname(this.#filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.#filePath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Configuration root must be a JSON object.');
      }

      this.#configs = new Map(
        Object.entries(parsed).map(([guildId, config]) => [guildId, normalizeGuildConfig(config)]),
      );
      await this.#persist();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await this.#persist();
    }
  }

  get(guildId) {
    const config = this.#configs.get(String(guildId));
    return config ? structuredClone(config) : null;
  }

  has(guildId) {
    return this.#configs.has(String(guildId));
  }

  count() {
    return this.#configs.size;
  }

  async set(guildId, config) {
    this.#configs.set(String(guildId), normalizeGuildConfig(config));
    await this.#enqueuePersist();
    return this.get(guildId);
  }

  async upsertWebhook(guildId, name, webhook) {
    const key = normalizeName(name);
    const config = this.get(guildId) ?? emptyGuildConfig();
    config.webhooks[key] = { ...webhook, name: key };
    if (!config.defaultWebhook) config.defaultWebhook = key;
    await this.set(guildId, config);
    return structuredClone(config.webhooks[key]);
  }

  async removeWebhook(guildId, name) {
    const key = normalizeName(name);
    const config = this.get(guildId);
    if (!config?.webhooks[key]) return false;
    delete config.webhooks[key];
    if (config.defaultWebhook === key) config.defaultWebhook = Object.keys(config.webhooks)[0] ?? null;
    if (config.routerWebhook === key) config.routerWebhook = null;
    if (!Object.keys(config.webhooks).length) return this.delete(guildId);
    await this.set(guildId, config);
    return true;
  }

  async delete(guildId) {
    const deleted = this.#configs.delete(String(guildId));
    if (deleted) await this.#enqueuePersist();
    return deleted;
  }

  #enqueuePersist() {
    this.#writeQueue = this.#writeQueue.catch(() => {}).then(() => this.#persist());
    return this.#writeQueue;
  }

  async #persist() {
    const sortedEntries = [...this.#configs.entries()].sort(([a], [b]) => a.localeCompare(b));
    const json = `${JSON.stringify(Object.fromEntries(sortedEntries), null, 2)}\n`;
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, json, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryPath, this.#filePath);
  }
}

export function normalizeName(value) {
  const name = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name || name.length > 40) throw new Error('Webhook name must be 1–40 characters using letters, numbers, dashes or underscores.');
  return name;
}

function emptyGuildConfig() {
  return { webhooks: {}, defaultWebhook: null, routerWebhook: null };
}

function normalizeGuildConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return emptyGuildConfig();

  // Automatic migration from the original one-webhook-per-guild format.
  if (config.webhookUrl) {
    return {
      webhooks: {
        default: {
          name: 'default',
          webhookUrl: config.webhookUrl,
          secret: config.secret ?? null,
          channelId: config.channelId ?? null,
          description: 'Migrated webhook',
          updatedAt: config.updatedAt ?? new Date().toISOString(),
          updatedBy: config.updatedBy ?? null,
        },
      },
      defaultWebhook: 'default',
      routerWebhook: null,
    };
  }

  const webhooks = {};
  for (const [rawName, webhook] of Object.entries(config.webhooks ?? {})) {
    try {
      const name = normalizeName(rawName);
      if (webhook?.webhookUrl) webhooks[name] = { ...webhook, name };
    } catch {
      // Ignore malformed records instead of preventing the bot from starting.
    }
  }

  const names = Object.keys(webhooks);
  return {
    webhooks,
    defaultWebhook: names.includes(config.defaultWebhook) ? config.defaultWebhook : names[0] ?? null,
    routerWebhook: names.includes(config.routerWebhook) ? config.routerWebhook : null,
  };
}
