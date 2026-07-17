import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { postToWebhook, validateWebhookUrl } from './webhook.js';

export const webhookCommand = new SlashCommandBuilder()
  .setName('webhook')
  .setDescription('Configure the Make.com webhook bridge for this server.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('set')
      .setDescription('Set or replace this server’s Make.com webhook.')
      .addStringOption((option) =>
        option
          .setName('url')
          .setDescription('The Make custom webhook URL.')
          .setMaxLength(2_048)
          .setRequired(true),
      )
      .addChannelOption((option) =>
        option
          .setName('channel')
          .setDescription('Optional channel restriction; omit to allow all channels.')
          .addChannelTypes(
            ChannelType.GuildText,
            ChannelType.GuildAnnouncement,
            ChannelType.PublicThread,
            ChannelType.PrivateThread,
            ChannelType.AnnouncementThread,
            ChannelType.GuildForum,
          ),
      )
      .addStringOption((option) =>
        option
          .setName('secret')
          .setDescription('Optional secret sent in the x-discord-bridge-secret header.')
          .setMaxLength(256),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('status').setDescription('Show the current webhook bridge status.'),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('test').setDescription('Send a test event to the configured webhook.'),
  )
  .addSubcommand((subcommand) =>
    subcommand.setName('remove').setDescription('Remove this server’s webhook configuration.'),
  );

export async function registerGuildCommand(guild) {
  await guild.commands.set([webhookCommand.toJSON()]);
}

export async function handleWebhookCommand(interaction, { store, env }) {
  if (!interaction.inGuild()) {
    await interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'You need the **Manage Server** permission to configure this bridge.',
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'set') {
    const rawUrl = interaction.options.getString('url', true);
    const channel = interaction.options.getChannel('channel');
    const secret = interaction.options.getString('secret')?.trim() || null;

    let webhookUrl;
    try {
      webhookUrl = validateWebhookUrl(rawUrl, env.allowedWebhookHosts);
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
      return;
    }

    await store.set(interaction.guildId, {
      webhookUrl,
      secret,
      channelId: channel?.id ?? null,
      updatedAt: new Date().toISOString(),
      updatedBy: interaction.user.id,
    });

    const scope = channel ? `only in ${channel}` : 'in all text channels';
    await interaction.reply({
      content: `✅ Webhook saved. I will forward direct mentions and replies to my messages ${scope}.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'status') {
    const config = store.get(interaction.guildId);
    if (!config) {
      await interaction.reply({ content: 'No webhook is configured for this server.', ephemeral: true });
      return;
    }

    const host = new URL(config.webhookUrl).hostname;
    const scope = config.channelId ? `<#${config.channelId}>` : 'All text channels';
    await interaction.reply({
      content: [
        '**Webhook bridge is active**',
        `Host: \`${host}\``,
        `Scope: ${scope}`,
        `Secret header: ${config.secret ? 'Configured' : 'Not configured'}`,
        `Updated: <t:${Math.floor(new Date(config.updatedAt).getTime() / 1000)}:R>`,
      ].join('\n'),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'remove') {
    const removed = await store.delete(interaction.guildId);
    await interaction.reply({
      content: removed ? '✅ Webhook configuration removed.' : 'No webhook was configured.',
      ephemeral: true,
    });
    return;
  }

  if (subcommand === 'test') {
    const config = store.get(interaction.guildId);
    if (!config) {
      await interaction.reply({
        content: 'Configure a webhook first with `/webhook set`.',
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const result = await postToWebhook({
        url: config.webhookUrl,
        secret: config.secret,
        timeoutMs: env.webhookTimeoutMs,
        payload: {
          event: 'discord.webhook.test',
          trigger: 'command',
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

      await interaction.editReply(`✅ Test delivered successfully (HTTP ${result.status}).`);
    } catch (error) {
      await interaction.editReply(`❌ Test failed: ${error.message}`);
    }
  }
}
