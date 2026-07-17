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

      this.#configs = new Map(Object.entries(parsed));
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
    this.#configs.set(String(guildId), structuredClone(config));
    await this.#enqueuePersist();
    return this.get(guildId);
  }

  async delete(guildId) {
    const deleted = this.#configs.delete(String(guildId));
    if (deleted) await this.#enqueuePersist();
    return deleted;
  }

  #enqueuePersist() {
    // Recover the queue after a previous write error so later admin commands can retry.
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
