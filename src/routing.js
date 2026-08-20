export function isChannelAllowed(channelId, parentChannelId, configuredChannelId) {
  if (!configuredChannelId) return true;
  return channelId === configuredChannelId || parentChannelId === configuredChannelId;
}

export function resolveMentionWebhook(config, { channelId, parentChannelId }) {
  if (!config?.webhooks || !Object.keys(config.webhooks).length) return null;

  const candidates = [];
  if (config.routerWebhook) candidates.push(config.routerWebhook);
  if (config.defaultWebhook && !candidates.includes(config.defaultWebhook)) {
    candidates.push(config.defaultWebhook);
  }

  for (const name of candidates) {
    const webhook = config.webhooks[name];
    if (webhook && isChannelAllowed(channelId, parentChannelId, webhook.channelId)) {
      return { name, webhook };
    }
  }

  return null;
}
