import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { GuildConfigStore } from '../src/store.js';

test('persists multiple named webhooks and removes them independently', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-bridge-'));
  const filePath = path.join(directory, 'guilds.json');

  const store = new GuildConfigStore(filePath);
  await store.init();
  await store.upsertWebhook('guild-1', 'support', { webhookUrl: 'https://hook.eu1.make.com/support' });
  await store.upsertWebhook('guild-1', 'draw', { webhookUrl: 'https://hook.eu1.make.com/draw' });

  const reloaded = new GuildConfigStore(filePath);
  await reloaded.init();
  const config = reloaded.get('guild-1');
  assert.equal(config.defaultWebhook, 'support');
  assert.equal(config.webhooks.support.webhookUrl, 'https://hook.eu1.make.com/support');
  assert.equal(config.webhooks.draw.webhookUrl, 'https://hook.eu1.make.com/draw');

  assert.equal(await reloaded.removeWebhook('guild-1', 'support'), true);
  assert.equal(reloaded.get('guild-1').defaultWebhook, 'draw');
  assert.equal(await reloaded.removeWebhook('guild-1', 'draw'), true);
  assert.equal(reloaded.get('guild-1'), null);

  await fs.rm(directory, { recursive: true, force: true });
});

test('migrates the original single-webhook configuration to default', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'discord-bridge-'));
  const filePath = path.join(directory, 'guilds.json');
  await fs.writeFile(filePath, JSON.stringify({
    'guild-1': {
      webhookUrl: 'https://hook.eu1.make.com/original',
      secret: 'test-secret',
      channelId: 'channel-1',
      updatedAt: '2026-07-17T08:00:00.000Z',
      updatedBy: 'user-1',
    },
  }));

  const store = new GuildConfigStore(filePath);
  await store.init();
  const config = store.get('guild-1');
  assert.equal(config.defaultWebhook, 'default');
  assert.equal(config.routerWebhook, null);
  assert.equal(config.webhooks.default.webhookUrl, 'https://hook.eu1.make.com/original');
  assert.equal(config.webhooks.default.secret, 'test-secret');

  await fs.rm(directory, { recursive: true, force: true });
});
