import 'dotenv/config';
import path from 'node:path';

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function optionalString(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const env = Object.freeze({
  discordToken: optionalString(process.env.DISCORD_TOKEN),
  dataFile: path.resolve(process.env.DATA_FILE || './data/guilds.json'),
  webhookTimeoutMs: parsePositiveInteger(process.env.WEBHOOK_TIMEOUT_MS, 120_000),
  allowedWebhookHosts: (process.env.ALLOWED_WEBHOOK_HOSTS || '*.make.com')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
  ackReaction: optionalString(process.env.ACK_REACTION),
  successReaction: optionalString(process.env.SUCCESS_REACTION),
  errorReaction: optionalString(process.env.ERROR_REACTION),
  showDeliveryErrors: parseBoolean(process.env.SHOW_DELIVERY_ERRORS, true),
  port: parsePositiveInteger(process.env.PORT, 3000),
});

export function assertRequiredEnvironment() {
  if (!env.discordToken) {
    throw new Error('DISCORD_TOKEN is required. Copy .env.example to .env and add the bot token.');
  }
}
