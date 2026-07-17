import net from 'node:net';

const MAX_ERROR_BODY_LENGTH = 500;
const DISCORD_MESSAGE_LIMIT = 2_000;

export function validateWebhookUrl(rawUrl, allowedHosts) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('The webhook URL is not valid.');
  }

  if (url.protocol !== 'https:') {
    throw new Error('The webhook URL must use HTTPS.');
  }

  if (url.username || url.password) {
    throw new Error('Webhook URLs containing usernames or passwords are not allowed.');
  }

  const hostname = url.hostname.toLowerCase();
  const ipCandidate = hostname.replace(/^\[|\]$/g, '');
  if (!isHostAllowed(hostname, allowedHosts)) {
    throw new Error(`Webhook host “${hostname}” is not permitted by ALLOWED_WEBHOOK_HOSTS.`);
  }

  if (isPrivateIpLiteral(ipCandidate)) {
    throw new Error('Private, loopback, and link-local IP addresses are not allowed.');
  }

  return url.toString();
}

export function isHostAllowed(hostname, patterns) {
  if (patterns.includes('*')) return true;

  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // Keep the leading dot.
      return hostname.endsWith(suffix) && hostname.length > suffix.length;
    }

    return hostname === pattern;
  });
}

function isPrivateIpLiteral(hostname) {
  const version = net.isIP(hostname);
  if (version === 0) return false;

  if (version === 4) {
    const [a, b] = hostname.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a === 0
    );
  }

  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

export async function postToWebhook({ url, payload, secret, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      'content-type': 'application/json',
      'user-agent': 'discord-make-webhook-bridge/1.0',
      'x-discord-event': payload.event,
      'x-discord-guild-id': payload.guildId,
      'x-discord-message-id': payload.messageId,
    };

    if (secret) headers['x-discord-bridge-secret'] = secret;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error',
    });

    const responseText = await response.text();

    if (!response.ok) {
      const suffix = responseText
        ? `: ${responseText.slice(0, MAX_ERROR_BODY_LENGTH)}`
        : '';
      throw new Error(`Webhook returned HTTP ${response.status}${suffix}`);
    }

    return {
      status: response.status,
      replies: extractReplies(responseText, response.headers.get('content-type')),
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Webhook timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function extractReplies(responseText, contentType = '') {
  if (!responseText || !contentType.toLowerCase().includes('application/json')) return [];

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return [];
  }

  const candidates = [];

  if (typeof parsed?.reply === 'string') candidates.push(parsed.reply);
  if (typeof parsed?.content === 'string') candidates.push(parsed.content);
  if (Array.isArray(parsed?.replies)) candidates.push(...parsed.replies);
  if (Array.isArray(parsed?.messages)) candidates.push(...parsed.messages);

  return candidates
    .filter((value) => typeof value === 'string' && value.trim())
    .flatMap((value) => splitDiscordMessage(value.trim()));
}

export function splitDiscordMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
  if (text.length <= limit) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    let splitAt = remaining.lastIndexOf('\n\n', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = remaining.lastIndexOf('\n', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = remaining.lastIndexOf(' ', limit);
    if (splitAt < Math.floor(limit * 0.5)) splitAt = limit;

    chunks.push(remaining.slice(0, splitAt).trimEnd());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}
