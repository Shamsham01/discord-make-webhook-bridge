import test from 'node:test';
import assert from 'node:assert/strict';
import { isChannelAllowed, resolveMentionWebhook } from '../src/routing.js';

test('isChannelAllowed accepts the configured channel and its threads', () => {
  assert.equal(isChannelAllowed('channel-a', null, 'channel-a'), true);
  assert.equal(isChannelAllowed('thread-1', 'channel-a', 'channel-a'), true);
  assert.equal(isChannelAllowed('channel-b', null, 'channel-a'), false);
});

test('resolveMentionWebhook uses default when router is channel-blocked', () => {
  const config = {
    defaultWebhook: 'nft-flipping-agent',
    routerWebhook: 'router',
    webhooks: {
      router: { name: 'router', webhookUrl: 'https://hook.make.com/router', channelId: 'staff' },
      'nft-flipping-agent': { name: 'nft-flipping-agent', webhookUrl: 'https://hook.make.com/agent', channelId: 'public' },
    },
  };

  const resolved = resolveMentionWebhook(config, { channelId: 'public', parentChannelId: null });
  assert.equal(resolved.name, 'nft-flipping-agent');
});

test('resolveMentionWebhook prefers router when both are allowed', () => {
  const config = {
    defaultWebhook: 'default',
    routerWebhook: 'router',
    webhooks: {
      router: { name: 'router', webhookUrl: 'https://hook.make.com/router', channelId: null },
      default: { name: 'default', webhookUrl: 'https://hook.make.com/default', channelId: 'public' },
    },
  };

  const resolved = resolveMentionWebhook(config, { channelId: 'public', parentChannelId: null });
  assert.equal(resolved.name, 'router');
});

test('resolveMentionWebhook uses default when routing is disabled', () => {
  const config = {
    defaultWebhook: 'nft-flipping-agent',
    routerWebhook: null,
    webhooks: {
      'nft-flipping-agent': { name: 'nft-flipping-agent', webhookUrl: 'https://hook.make.com/agent', channelId: 'public' },
    },
  };

  const resolved = resolveMentionWebhook(config, { channelId: 'public', parentChannelId: null });
  assert.equal(resolved.name, 'nft-flipping-agent');
});

test('resolveMentionWebhook returns null when no workflow matches the channel', () => {
  const config = {
    defaultWebhook: 'nft-flipping-agent',
    routerWebhook: null,
    webhooks: {
      'nft-flipping-agent': { name: 'nft-flipping-agent', webhookUrl: 'https://hook.make.com/agent', channelId: 'public' },
    },
  };

  assert.equal(resolveMentionWebhook(config, { channelId: 'other', parentChannelId: null }), null);
});
