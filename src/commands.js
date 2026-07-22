import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { normalizeName } from './store.js';
import { postToWebhook, validateWebhookUrl } from './webhook.js';

const EPHEMERAL = MessageFlags.Ephemeral;

function namedWebhookOption(option, description = 'Registered webhook name.') {
  return option
    .setName('name')
    .setDescription(description)
    .setRequired(true)
    .setAutocomplete(true);
}

export const webhookCommand = new SlashCommandBuilder()
  .setName('webhook')
  .setDescription('Manage Make.com webhooks for this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription('Add or update a named webhook.')
      .addStringOption((option) => option
        .setName('name')
        .setDescription('Short workflow name, e.g. support-agent. Pick an existing name to update it.')
        .setRequired(true)
        .setMaxLength(40)
        .setAutocomplete(true))
      .addStringOption((option) => option.setName('url').setDescription('The Make custom webhook URL.').setMaxLength(2_048).setRequired(true))
      .addStringOption((option) => option.setName('description').setDescription('What this workflow does. Shown to users and the AI router.').setMaxLength(200))
      .addChannelOption((option) => option.setName('channel').setDescription('Optional channel restriction.').addChannelTypes(
        ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread,
        ChannelType.PrivateThread, ChannelType.AnnouncementThread, ChannelType.GuildForum,
      ))
      .addStringOption((option) => option.setName('secret').setDescription('Optional x-discord-bridge-secret value.').setMaxLength(256)),
  )
  .addSubcommand((subcommand) => subcommand.setName('list').setDescription('List all registered webhooks.'))
  .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Show one webhook configuration.')
    .addStringOption((option) => namedWebhookOption(option)))
  .addSubcommand((subcommand) => subcommand.setName('test').setDescription('Send a test event to a webhook.')
    .addStringOption((option) => namedWebhookOption(option)))
  .addSubcommand((subcommand) => subcommand.setName('remove').setDescription('Remove a named webhook.')
    .addStringOption((option) => namedWebhookOption(option)))
  .addSubcommand((subcommand) => subcommand.setName('default').setDescription('Choose the webhook used for mentions and replies.')
    .addStringOption((option) => namedWebhookOption(option, 'Webhook used when the bot is mentioned or replied to.')))
  .addSubcommand((subcommand) => subcommand.setName('router').setDescription('Choose an AI router webhook, or disable routing.')
    .addStringOption((option) => namedWebhookOption(option, 'Webhook name, or choose “off” to disable routing.')));

export const runCommand = new SlashCommandBuilder()
  .setName('run')
  .setDescription('Run a registered Make.com workflow.')
  .setDMPermission(false)
  .addStringOption((option) => option
    .setName('workflow')
    .setDescription('Registered workflow name.')
    .setRequired(true)
    .setAutocomplete(true))
  .addStringOption((option) => option
    .setName('input')
    .setDescription('Message or instructions for the workflow.')
    .setRequired(true)
    .setMaxLength(2_000));

export async function registerGuildCommand(guild) {
  await guild.commands.set([webhookCommand.toJSON(), runCommand.toJSON()]);
}

export async function handleAutocomplete(interaction, { store }) {
  const focused = interaction.options.getFocused(true);
  const query = String(focused.value ?? '').toLowerCase();
  const config = store.get(interaction.guildId);

  if (interaction.commandName === 'run' && focused.name === 'workflow') {
    const choices = listWebhookChoices(config, query, {
      onlyChannelAllowed: true,
      channelId: interaction.channelId,
      parentChannelId: interaction.channel?.parentId ?? null,
    });
    return interaction.respond(choices);
  }

  if (interaction.commandName === 'webhook' && focused.name === 'name') {
    const subcommand = interaction.options.getSubcommand(false);
    const choices = listWebhookChoices(config, query, {
      includeOff: subcommand === 'router',
    });
    return interaction.respond(choices);
  }

  return interaction.respond([]);
}

function listWebhookChoices(config, query, {
  includeOff = false,
  onlyChannelAllowed = false,
  channelId = null,
  parentChannelId = null,
} = {}) {
  const choices = [];

  if (includeOff && (!query || 'off'.includes(query) || 'disable'.includes(query) || 'routing'.includes(query))) {
    choices.push({ name: 'off — Disable AI routing', value: 'off' });
  }

  const webhooks = Object.values(config?.webhooks ?? {})
    .filter((webhook) => {
      if (onlyChannelAllowed && !isWebhookAllowedInChannel(webhook, channelId, parentChannelId)) return false;
      if (!query) return true;
      return webhook.name.includes(query) || webhook.description?.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      const aRank = (config?.defaultWebhook === a.name ? 0 : 2) + (config?.routerWebhook === a.name ? 0 : 1);
      const bRank = (config?.defaultWebhook === b.name ? 0 : 2) + (config?.routerWebhook === b.name ? 0 : 1);
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });

  for (const webhook of webhooks) {
    if (choices.length >= 25) break;
    choices.push({
      name: formatWebhookChoiceLabel(webhook, config),
      value: webhook.name,
    });
  }

  return choices.slice(0, 25);
}

function formatWebhookChoiceLabel(webhook, config) {
  const tags = [
    config?.defaultWebhook === webhook.name ? 'default' : null,
    config?.routerWebhook === webhook.name ? 'router' : null,
    webhook.channelId ? 'channel-limited' : null,
  ].filter(Boolean);
  const suffix = [
    tags.length ? `(${tags.join(', ')})` : null,
    webhook.description || null,
  ].filter(Boolean).join(' — ');
  const label = suffix ? `${webhook.name} — ${suffix}` : webhook.name;
  return label.slice(0, 100);
}

function isWebhookAllowedInChannel(webhook, channelId, parentChannelId) {
  if (!webhook.channelId) return true;
  return webhook.channelId === channelId || webhook.channelId === parentChannelId;
}

export async function handleWebhookCommand(interaction, { store, env }) {
  if (!interaction.inGuild()) {
    return interaction.reply({ content: 'This command can only be used in a server.', flags: EPHEMERAL });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: 'You need the **Manage Server** permission to configure this bridge.', flags: EPHEMERAL });
  }

  const subcommand = interaction.options.getSubcommand();
  const config = store.get(interaction.guildId);

  if (subcommand === 'set') {
    let name;
    try { name = normalizeName(interaction.options.getString('name', true)); }
    catch (error) { return interaction.reply({ content: `❌ ${error.message}`, flags: EPHEMERAL }); }

    let webhookUrl;
    try { webhookUrl = validateWebhookUrl(interaction.options.getString('url', true), env.allowedWebhookHosts); }
    catch (error) { return interaction.reply({ content: `❌ ${error.message}`, flags: EPHEMERAL }); }

    const channel = interaction.options.getChannel('channel');
    await store.upsertWebhook(interaction.guildId, name, {
      webhookUrl,
      secret: interaction.options.getString('secret')?.trim() || null,
      channelId: channel?.id ?? null,
      description: interaction.options.getString('description')?.trim() || null,
      updatedAt: new Date().toISOString(),
      updatedBy: interaction.user.id,
    });
    return interaction.reply({
      content: `✅ Webhook **${name}** saved${channel ? ` for ${channel}` : ''}. Run it with \`/run workflow:${name}\`.`,
      flags: EPHEMERAL,
    });
  }

  if (subcommand === 'list') {
    const webhooks = Object.values(config?.webhooks ?? {});
    if (!webhooks.length) return interaction.reply({ content: 'No webhooks are configured.', flags: EPHEMERAL });
    const lines = webhooks.map((item) => {
      const flags = [config.defaultWebhook === item.name ? 'default' : null, config.routerWebhook === item.name ? 'AI router' : null].filter(Boolean).join(', ');
      return `• **${item.name}**${flags ? ` _(${flags})_` : ''}${item.description ? ` — ${item.description}` : ''}`;
    });
    return interaction.reply({
      content: `**Registered workflows**\n${lines.join('\n')}\n\nUse \`/run\` to trigger one.`,
      flags: EPHEMERAL,
    });
  }

  const rawName = interaction.options.getString('name', true);
  if (subcommand === 'router' && rawName.trim().toLowerCase() === 'off') {
    if (!config) return interaction.reply({ content: 'No webhooks are configured.', flags: EPHEMERAL });
    config.routerWebhook = null;
    await store.set(interaction.guildId, config);
    return interaction.reply({
      content: '✅ AI routing disabled. Mentions and replies now use the default webhook.',
      flags: EPHEMERAL,
    });
  }

  let name;
  try { name = normalizeName(rawName); }
  catch (error) { return interaction.reply({ content: `❌ ${error.message}`, flags: EPHEMERAL }); }
  const webhook = config?.webhooks?.[name];
  if (!webhook) {
    return interaction.reply({ content: `Webhook **${name}** was not found. Use \`/webhook list\`.`, flags: EPHEMERAL });
  }

  if (subcommand === 'status') {
    return interaction.reply({
      content: [
        `**${name}**`,
        `Host: \`${new URL(webhook.webhookUrl).hostname}\``,
        `Description: ${webhook.description || 'Not set'}`,
        `Scope: ${webhook.channelId ? `<#${webhook.channelId}>` : 'All text channels'}`,
        `Secret: ${webhook.secret ? 'Configured' : 'Not configured'}`,
        `Default: ${config.defaultWebhook === name ? 'Yes' : 'No'}`,
        `AI router: ${config.routerWebhook === name ? 'Yes' : 'No'}`,
      ].join('\n'),
      flags: EPHEMERAL,
    });
  }

  if (subcommand === 'remove') {
    await store.removeWebhook(interaction.guildId, name);
    return interaction.reply({ content: `✅ Webhook **${name}** removed.`, flags: EPHEMERAL });
  }

  if (subcommand === 'default' || subcommand === 'router') {
    config[subcommand === 'default' ? 'defaultWebhook' : 'routerWebhook'] = name;
    await store.set(interaction.guildId, config);
    return interaction.reply({
      content: `✅ **${name}** is now the ${subcommand === 'default' ? 'default mention/reply webhook' : 'AI router webhook'}.`,
      flags: EPHEMERAL,
    });
  }

  if (subcommand === 'test') {
    await interaction.deferReply({ flags: EPHEMERAL });
    try {
      const result = await postToWebhook({
        url: webhook.webhookUrl,
        secret: webhook.secret,
        timeoutMs: env.webhookTimeoutMs,
        payload: {
          event: 'discord.webhook.test',
          trigger: 'command',
          workflow: name,
          receivedAt: new Date().toISOString(),
          guildId: interaction.guildId,
          channelId: interaction.channelId,
          messageId: interaction.id,
          authorId: interaction.user.id,
          content: 'Webhook bridge test',
          guild: { id: interaction.guildId, name: interaction.guild.name },
          channel: { id: interaction.channelId },
          author: { id: interaction.user.id, username: interaction.user.username },
          bot: { id: interaction.client.user.id, username: interaction.client.user.username },
        },
      });
      return interaction.editReply(`✅ Test delivered to **${name}** (HTTP ${result.status}).`);
    } catch (error) {
      return interaction.editReply(`❌ Test failed: ${error.message}`);
    }
  }
}

export async function handleRunCommand(interaction, { store, env }) {
  const config = store.get(interaction.guildId);
  let name;
  try { name = normalizeName(interaction.options.getString('workflow', true)); }
  catch (error) { return interaction.reply({ content: `❌ ${error.message}`, flags: EPHEMERAL }); }
  const webhook = config?.webhooks?.[name];
  if (!webhook) {
    return interaction.reply({
      content: `Workflow **${name}** was not found. Ask an administrator to run \`/webhook list\`.`,
      flags: EPHEMERAL,
    });
  }
  if (!isWebhookAllowedInChannel(webhook, interaction.channelId, interaction.channel?.parentId ?? null)) {
    return interaction.reply({
      content: `Workflow **${name}** can only be used in <#${webhook.channelId}>.`,
      flags: EPHEMERAL,
    });
  }

  await interaction.deferReply();
  try {
    const input = interaction.options.getString('input', true);
    const result = await postToWebhook({
      url: webhook.webhookUrl,
      secret: webhook.secret,
      timeoutMs: env.webhookTimeoutMs,
      payload: {
        event: 'discord.workflow.run',
        trigger: 'slash-command',
        workflow: name,
        receivedAt: new Date().toISOString(),
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        messageId: interaction.id,
        authorId: interaction.user.id,
        content: input,
        rawContent: input,
        guild: { id: interaction.guildId, name: interaction.guild.name },
        channel: { id: interaction.channelId, name: interaction.channel?.name ?? null },
        author: {
          id: interaction.user.id,
          username: interaction.user.username,
          displayName: interaction.member?.displayName ?? interaction.user.displayName,
        },
        bot: { id: interaction.client.user.id, username: interaction.client.user.username },
      },
    });
    if (!result.replies.length) return interaction.editReply(`✅ **${name}** completed successfully.`);
    await interaction.editReply({ content: result.replies.shift(), allowedMentions: { parse: [] } });
    for (const reply of result.replies) await interaction.followUp({ content: reply, allowedMentions: { parse: [] } });
  } catch (error) {
    await interaction.editReply(`❌ Workflow **${name}** failed: ${error.message}`);
  }
}
