import { ChannelType } from 'discord.js';

export function stripBotMention(content, botUserId) {
  if (!content) return '';
  const mentionPattern = new RegExp(`<@!?${escapeRegExp(botUserId)}>`, 'g');
  return content.replace(mentionPattern, '').trim();
}

export function buildMessagePayload({ message, botUser, trigger, referencedMessage }) {
  const cleanedContent = stripBotMention(message.content, botUser.id);
  const attachments = [...message.attachments.values()].map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    url: attachment.url,
    proxyUrl: attachment.proxyURL,
    contentType: attachment.contentType ?? null,
    size: attachment.size,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    description: attachment.description ?? null,
  }));

  const roles = message.member
    ? [...message.member.roles.cache.values()]
        .filter((role) => role.id !== message.guild.id)
        .map((role) => ({ id: role.id, name: role.name }))
    : [];

  return {
    event: 'discord.message',
    trigger,
    receivedAt: new Date().toISOString(),

    // Make-friendly top-level fields for easy mapping.
    guildId: message.guild.id,
    channelId: message.channel.id,
    messageId: message.id,
    authorId: message.author.id,
    content: cleanedContent,
    rawContent: message.content,
    messageUrl: message.url,
    attachments,

    guild: {
      id: message.guild.id,
      name: message.guild.name,
      iconUrl: message.guild.iconURL({ size: 256 }) ?? null,
      memberCount: message.guild.memberCount,
    },
    channel: {
      id: message.channel.id,
      name: message.channel.name ?? null,
      type: message.channel.type,
      typeName: ChannelType[message.channel.type] ?? 'Unknown',
      parentId: message.channel.parentId ?? null,
      isThread: message.channel.isThread(),
    },
    author: {
      id: message.author.id,
      username: message.author.username,
      globalName: message.author.globalName ?? null,
      displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
      avatarUrl: message.author.displayAvatarURL({ size: 256 }),
      bot: message.author.bot,
    },
    member: {
      nickname: message.member?.nickname ?? null,
      joinedAt: message.member?.joinedAt?.toISOString() ?? null,
      roles,
    },
    message: {
      id: message.id,
      url: message.url,
      content: cleanedContent,
      rawContent: message.content,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      attachments,
      referencedMessage: referencedMessage
        ? {
            id: referencedMessage.id,
            url: referencedMessage.url,
            authorId: referencedMessage.author.id,
            authorUsername: referencedMessage.author.username,
            content: referencedMessage.content,
          }
        : null,
    },
    bot: {
      id: botUser.id,
      username: botUser.username,
    },
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
