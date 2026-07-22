import {
  Client,
  Events,
  GatewayIntentBits,
} from 'discord.js';
import { env, assertRequiredEnvironment } from './env.js';
import { GuildConfigStore, normalizeName } from './store.js';
import { buildMessagePayload } from './payload.js';
import { postToWebhook } from './webhook.js';
import {
  handleAutocomplete,
  handleRunCommand,
  handleWebhookCommand,
  registerGuildCommand,
} from './commands.js';
import { startHealthServer } from './health.js';

assertRequiredEnvironment();

const store = new GuildConfigStore(env.dataFile);
await store.init();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const processedMessages = new Map();
const PROCESSED_TTL_MS = 10 * 60 * 1_000;

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`[discord] Logged in as ${readyClient.user.tag}`);
  const results = await Promise.allSettled(readyClient.guilds.cache.map((guild) => registerGuildCommand(guild)));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) console.error(`[discord] Failed to register commands in ${failed.length} guild(s).`);
});

client.on(Events.GuildDelete, async (guild) => {
  try {
    await store.delete(guild.id);
    console.log(`[discord] Removed stored configuration for departed guild ${guild.id}.`);
  } catch (error) {
    console.error(`[discord] Failed to remove configuration for guild ${guild.id}:`, error);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    await registerGuildCommand(guild);
    console.log(`[discord] Registered commands in ${guild.name} (${guild.id}).`);
  } catch (error) {
    console.error(`[discord] Command registration failed for guild ${guild.id}:`, error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      await handleAutocomplete(interaction, { store });
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'webhook') await handleWebhookCommand(interaction, { store, env });
    if (interaction.commandName === 'run') await handleRunCommand(interaction, { store, env });
  } catch (error) {
    console.error('[discord] Command failed:', error);
    const message = '❌ The command failed unexpectedly. Check the bot logs.';
    if (interaction.deferred || interaction.replied) await interaction.editReply(message).catch(() => {});
    else await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.inGuild() || message.author.bot || message.webhookId) return;

  const config = store.get(message.guildId);
  if (!config || !Object.keys(config.webhooks ?? {}).length) return;

  pruneProcessedMessages();
  if (processedMessages.has(message.id)) return;

  const mentioned = message.mentions.users.has(client.user.id);
  let referencedMessage = null;
  let repliedToBot = false;
  if (message.reference?.messageId) {
    try {
      referencedMessage = await message.fetchReference();
      repliedToBot = referencedMessage.author.id === client.user.id;
    } catch (error) {
      console.warn(`[discord] Could not fetch referenced message ${message.reference.messageId}: ${error.message}`);
    }
  }
  if (!mentioned && !repliedToBot) return;

  const initialName = config.routerWebhook || config.defaultWebhook;
  const initialWebhook = config.webhooks[initialName];
  if (!initialWebhook || !isChannelAllowed(message, initialWebhook.channelId)) return;

  processedMessages.set(message.id, Date.now());
  const trigger = mentioned && repliedToBot ? 'mention+reply' : mentioned ? 'mention' : 'reply';
  let acknowledgement = null;

  try {
    if (env.ackReaction) acknowledgement = await message.react(env.ackReaction).catch(() => null);
    await message.channel.sendTyping().catch(() => {});

    const payload = buildMessagePayload({ message, botUser: client.user, trigger, referencedMessage });
    payload.workflow = initialName;
    payload.availableWorkflows = Object.values(config.webhooks).map(({ name, description, channelId }) => ({ name, description: description ?? null, channelId: channelId ?? null }));
    payload.routing = config.routerWebhook ? { enabled: true, routerWorkflow: config.routerWebhook } : { enabled: false };

    let result = await deliver(initialWebhook, payload);
    let deliveredName = initialName;

    // An AI router Make scenario can return { "route": "workflow-name" }.
    if (config.routerWebhook && result.route) {
      let routeName = null;
      try { routeName = normalizeName(result.route); } catch { routeName = null; }
      const routedWebhook = routeName ? config.webhooks[routeName] : null;
      if (!routedWebhook) throw new Error(`AI router selected unknown workflow “${result.route}”.`);
      if (!isChannelAllowed(message, routedWebhook.channelId)) throw new Error(`AI router selected workflow “${routeName}” outside its permitted channel.`);
      if (routeName !== initialName) {
        payload.workflow = routeName;
        payload.routedBy = config.routerWebhook;
        result = await deliver(routedWebhook, payload);
        deliveredName = routeName;
      }
    }

    await acknowledgement?.users.remove(client.user.id).catch(() => {});
    if (env.successReaction) await message.react(env.successReaction).catch(() => {});
    for (const reply of result.replies) {
      await message.reply({ content: reply, allowedMentions: { parse: [], repliedUser: false } });
    }
    console.log(`[webhook] ${trigger} delivered workflow=${deliveredName} guild=${message.guildId} channel=${message.channelId} message=${message.id}`);
  } catch (error) {
    await acknowledgement?.users.remove(client.user.id).catch(() => {});
    if (env.errorReaction) await message.react(env.errorReaction).catch(() => {});
    console.error(`[webhook] Delivery failed for guild=${message.guildId} channel=${message.channelId} message=${message.id}:`, error);
    if (env.showDeliveryErrors) {
      await message.reply({ content: 'I could not complete the configured automation. A server administrator should run `/webhook test`.', allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
    }
  }
});

function deliver(webhook, payload) {
  return postToWebhook({ url: webhook.webhookUrl, secret: webhook.secret, timeoutMs: env.webhookTimeoutMs, payload });
}

function isChannelAllowed(message, configuredChannelId) {
  if (!configuredChannelId) return true;
  return message.channelId === configuredChannelId || message.channel.parentId === configuredChannelId;
}

function pruneProcessedMessages() {
  const cutoff = Date.now() - PROCESSED_TTL_MS;
  for (const [messageId, processedAt] of processedMessages) {
    if (processedAt < cutoff) processedMessages.delete(messageId);
  }
}

const healthServer = startHealthServer({ port: env.port, client, store });

async function shutdown(signal) {
  console.log(`[system] Received ${signal}; shutting down.`);
  healthServer.close();
  client.destroy();
  process.exit(0);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

await client.login(env.discordToken);
