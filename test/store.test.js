import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GuildConfigStore } from '../src/store.js';

test('persists and deletes guild configurations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-bridge-'));
  const filePath = path.join(directory, 'guilds.json');

  const store = new GuildConfigStore(filePath);
  await store.init();
  await store.set('guild-1', { webhookUrl: 'https://hook.eu1.make.com/test' });

  const reloaded = new GuildConfigStore(filePath);
  await reloaded.init();
  assert.deepEqual(reloaded.get('guild-1'), {
    webhookUrl: 'https://hook.eu1.make.com/test',
  });

  assert.equal(await reloaded.delete('guild-1'), true);
  assert.equal(reloaded.get('guild-1'), null);

  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(raw, {});

  await fs.rm(directory, { recursive: true, force: true });
});
