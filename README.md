# Discord → Make Webhook Bridge

A lightweight, multi-server Discord bot that forwards **direct mentions** and **replies to the bot's messages** to a Make.com custom webhook configured separately by each Discord server.

It can also turn the webhook response into a Discord reply, so server owners can build complete Make AI chatbots without writing Discord code or connecting a separate Discord module in every Make scenario.

## Features

- Live Discord Gateway connection using `discord.js`
- One webhook configuration per Discord guild/server
- Admin-only `/webhook` slash command
- Optional channel restriction
- Triggers on direct bot mentions and replies to bot messages
- Structured Make-friendly JSON payload
- Attachments, author, guild, channel, roles, message URL and reply context
- Optional shared-secret request header
- Optional JSON webhook response → Discord reply
- URL allow-list and HTTPS-only validation
- Atomic JSON persistence
- Cybrancee deployment guide and optional Dockerfile
- Health endpoint, duplicate event protection and safe Discord reply splitting

## Commands

Only members with **Manage Server** permission can use these commands.

```text
/webhook set url:<MAKE_WEBHOOK_URL> [channel:#channel] [secret:optional-secret]
/webhook status
/webhook test
/webhook remove
```

The webhook URL is never printed back into Discord. Command responses are ephemeral.

## 1. Create the Discord application

1. Open the Discord Developer Portal and create a new application.
2. Open **Bot** and create/reset the bot token.
3. Enable **Message Content Intent** under **Privileged Gateway Intents**.
   - This is required for messages that reply to the bot without mentioning it.
4. Copy the token into `.env` as `DISCORD_TOKEN`.

For unverified bots, Message Content Intent must be enabled but does not require approval. Verified/verification-eligible bots may need Discord approval.

## 2. Invite the bot

In **OAuth2 → URL Generator**, select:

- Scopes: `bot`, `applications.commands`
- Bot permissions:
  - View Channels
  - Send Messages
  - Send Messages in Threads
  - Read Message History
  - Add Reactions

Open the generated URL and invite the bot to your server.

## 3. Run locally

```bash
cp .env.example .env
npm install
npm test
npm start
```

The bot registers `/webhook` as a guild command when it starts and whenever it joins a new server.

## 4. Configure a Make scenario

1. Create a Make scenario.
2. Add **Webhooks → Custom webhook**.
3. Copy the generated Make webhook URL.
4. In Discord, run:

```text
/webhook set url:https://hook.eu1.make.com/your-webhook-id channel:#ai-chat
```

5. Run `/webhook test`.
6. In Make, process the incoming JSON using your AI Agent or other modules.

### Important Make fields

The most convenient top-level fields are:

```json
{
  "event": "discord.message",
  "trigger": "mention",
  "guildId": "...",
  "channelId": "...",
  "messageId": "...",
  "authorId": "...",
  "content": "The message with the bot mention removed",
  "rawContent": "<@BOT_ID> The original message",
  "messageUrl": "https://discord.com/channels/...",
  "attachments": []
}
```

The payload also contains nested `guild`, `channel`, `author`, `member`, `message`, and `bot` objects.

## 5. Reply from Make through this bot

At the end of the Make scenario, add **Webhooks → Webhook response**.

Return status `200`.

### Plain text (recommended for AI Agent replies)

Map the agent response directly into **Body**, for example `6. Response`.

Multi-line text is supported as-is. No JSON wrapping is required.

### JSON body (optional)

If you prefer structured JSON, set header:

```text
Content-Type: application/json
```

And a body such as:

```json
{
  "reply": "This response will be posted as a reply in Discord."
}
```

Multiple replies are supported:

```json
{
  "replies": [
    "First message",
    "Second message"
  ]
}
```

Supported JSON fields: `reply`, `content`, `replies`, or `messages`.

The bot ignores ordinary Make responses such as plain-text `Accepted`.

Discord messages longer than 2,000 characters are split automatically into multiple replies. Mentions returned by the scenario are disabled to prevent accidental `@everyone`, role or user pings.

## Optional shared-secret validation

Configure a secret:

```text
/webhook set url:https://hook.eu1.make.com/... secret:your-random-secret
```

The bot sends it in this request header:

```text
x-discord-bridge-secret: your-random-secret
```

Validate or filter that header near the start of your Make scenario. It helps ensure the scenario only processes calls from your bridge instance.

## Configuration storage

Guild settings are stored in `DATA_FILE`, defaulting to:

```text
./data/guilds.json
```

Example runtime record:

```json
{
  "123456789012345678": {
    "webhookUrl": "https://hook.eu1.make.com/...",
    "secret": null,
    "channelId": "234567890123456789",
    "updatedAt": "2026-07-17T08:00:00.000Z",
    "updatedBy": "345678901234567890"
  }
}
```

`data/*.json` is ignored by Git. Webhook URLs should be treated as secrets.

### Hosting warning

The JSON store is suitable for one bot process and a modest number of servers. Back up `.env` and `data/guilds.json` before reinstalling, migrating, or clearing the Cybrancee server files.

For multiple replicas or a larger public bot, replace the JSON store with PostgreSQL, Supabase, Redis or another shared database.

## Cybrancee deployment

See the complete [Cybrancee deployment guide](CYBRANCEE.md).

Use these Startup settings:

| Cybrancee setting | Value |
|---|---|
| Git Repo Address | `https://github.com/Shamsham01/discord-make-webhook-bridge` |
| Git Branch | `main` |
| Auto Update | Enabled |
| Node.js version / Docker Image | Node.js 20 or Node.js 22 |
| Bot JS File | `src/index.js` |
| Additional Node Packages | `discord.js dotenv` |

For the initial Git installation, Cybrancee requires an empty file manager. Configure the Git fields, use **Reinstall Server → Delete current files and reinstall server**, then restart so the repository is pulled.

> Reinstalling permanently deletes current server files. Back up an existing `.env` and `data/guilds.json` first.

After the repository is installed, create `.env` in the project root using `.env.example` as the template. At minimum, set:

```env
DISCORD_TOKEN=your_discord_bot_token
DATA_FILE=./data/guilds.json
```

The included health server exposes:

```text
GET /health
```

The Discord bridge itself does not require a public HTTP endpoint; it connects outbound to Discord and Make.

## Environment variables

| Variable | Required | Default | Purpose |
|---|---:|---|---|
| `DISCORD_TOKEN` | Yes | — | Discord bot token |
| `DATA_FILE` | No | `./data/guilds.json` | Persistent guild configuration |
| `WEBHOOK_TIMEOUT_MS` | No | `120000` | Maximum Make scenario response time |
| `ALLOWED_WEBHOOK_HOSTS` | No | `*.make.com` | Allowed webhook host patterns |
| `ACK_REACTION` | No | `👀` | Reaction while processing |
| `SUCCESS_REACTION` | No | blank | Reaction after successful delivery |
| `ERROR_REACTION` | No | `⚠️` | Reaction after failed delivery |
| `SHOW_DELIVERY_ERRORS` | No | `true` | Post a generic failure reply |
| `PORT` | No | `3000` | Health server port |

## Security notes

- The default allow-list accepts HTTPS endpoints below `make.com` only.
- Avoid setting `ALLOWED_WEBHOOK_HOSTS=*` on a public multi-tenant bot because administrators could make the service request arbitrary destinations.
- Redirects are rejected so an allowed URL cannot redirect the bot to a disallowed host.
- Webhook URLs and optional secrets are stored in the local JSON file. Protect and back up the Cybrancee server files.
- The bot ignores messages from bots and Discord webhooks to prevent loops.
- Discord output from Make is sent with mentions disabled.

## Suggested production upgrades

The most useful next upgrades for a larger public service are:

1. Database-backed encrypted configuration.
2. Per-guild rate limits and monthly usage quotas.
3. Multiple named agents/webhooks per server or channel.
4. Signed webhook requests using HMAC and timestamps.
5. Conversation/thread IDs and short-term chat history.
6. An admin dashboard and install analytics.
7. Retry queue with idempotency keys and a dead-letter log.
8. Sharding when the bot grows to thousands of servers.

## License

MIT