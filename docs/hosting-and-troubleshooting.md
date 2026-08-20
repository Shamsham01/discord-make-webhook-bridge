# Hosting and troubleshooting

This page covers running the bot on a host (e.g. Cybrancee), environment variables, and fixing common problems.

## Hosting on Cybrancee

The bot is designed to run continuously with Cybrancee’s Git integration.

### Startup settings

| Setting | Value |
| --- | --- |
| Git Repo Address | `https://github.com/Shamsham01/discord-make-webhook-bridge` |
| Git Branch | `main` |
| Auto Update | Enabled |
| Node.js version | Node.js 20 or 22 |
| Bot JS File | `src/index.js` |
| Additional Node Packages | `discord.js dotenv` |

The repository `package.json` lists exact dependency versions.

### First Git install

Cybrancee needs an empty file manager for the initial clone:

1. Enter Git settings above under **Startup**
2. **Settings → Reinstall Server** → delete current files and reinstall
3. Restart so Cybrancee pulls the repository

{% hint style="danger" %}
Reinstall deletes server files. Back up `.env` and `data/guilds.json` first.
{% endhint %}

### Create `.env`

The real `.env` is not in Git. Create it in the repository root:

```env
DISCORD_TOKEN=your_discord_bot_token
DATA_FILE=./data/guilds.json
WEBHOOK_TIMEOUT_MS=120000
ALLOWED_WEBHOOK_HOSTS=*.make.com
ACK_REACTION=👀
SUCCESS_REACTION=
ERROR_REACTION=⚠️
SHOW_DELIVERY_ERRORS=true
PORT=3000
```

For long Make AI Agents, increase the timeout:

```env
WEBHOOK_TIMEOUT_MS=500000
```

Never commit tokens or Make webhook URLs to GitHub.

### Start and verify

1. Start or restart the server in the Cybrancee **Console**
2. Confirm the log shows `[discord] Logged in as ...`
3. Confirm the bot is online in Discord
4. Run `/webhook set` and `/webhook test` in your server

### Persistent data

Workflow configuration is stored in:

```text
./data/guilds.json
```

This file is not in Git. A reinstall or accidental delete removes all `/webhook` settings — restore from backup if needed.

When the bot leaves a server, that server’s entry is removed from `guilds.json` automatically.

### Updates from GitHub

With **Auto Update** enabled, restarting pulls the latest `main` branch. Your `.env` and `data/` folder are not overwritten by git pull.

{% hint style="info" %}
Edit **`.env`** for secrets and timeouts. Do not rely on editing `.env.example` on the host — that file is only a template in the repo.
{% endhint %}

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | _(required)_ | Bot token from Discord Developer Portal |
| `DATA_FILE` | `./data/guilds.json` | Where workflow config is stored |
| `WEBHOOK_TIMEOUT_MS` | `120000` | How long HookBot waits for Make’s webhook response |
| `ALLOWED_WEBHOOK_HOSTS` | `*.make.com` | Host allow-list for webhook URLs |
| `ACK_REACTION` | _(optional)_ | Reaction while working, e.g. `👀` |
| `SUCCESS_REACTION` | _(optional)_ | Reaction on success |
| `ERROR_REACTION` | _(optional)_ | Reaction on failure, e.g. `⚠️` |
| `SHOW_DELIVERY_ERRORS` | `true` | Post a generic Discord message when delivery fails |
| `PORT` | `3000` | Health check HTTP port |

Health check: `GET /` or `GET /health` returns JSON with `discordReady` and guild counts.

## Troubleshooting

### Bot does not start

Check:

* Node.js 20 or 22
* **Bot JS File** is `src/index.js`
* `.env` exists with a valid `DISCORD_TOKEN` (no quotes or extra spaces)
* Console for startup errors

### Bot is online but @HookBot does nothing

Check in order:

1. HookBot can **View Channel** and **Read Message History** in that channel
2. `/webhook list` shows a **default** workflow
3. You are in the channel allowed for the default (or router), if one was set
4. AI routing: run `/webhook router name:off` to test without the router
5. Host logs for `Mention/reply ignored ... (no workflow allowed in this channel)`

### Slash commands do not appear

* Re-invite with scopes: `bot` and `applications.commands`
* Wait a minute after invite, or kick and re-invite
* Restart the bot (registers commands on startup)

### `/webhook test` succeeds but @HookBot gets no reply

* Make received the request — the scenario may not return a reply body
* Short workflows: add **Webhook response** and map Agent output into it
* Long AI workflows: use Make’s **Discord** module with `channelId` and `messageId` from the webhook payload (see [Make integration](make-integration.md))
* If Make returns only `Accepted`, HookBot posts nothing unless Make posts via the Discord module

### “Completed successfully” with no text (`/run`)

Make returned a success with an empty or `Accepted` body. Map Agent output into **Webhook response**, or post via Make’s **Discord** module for long scenarios.

### Webhook timed out

* Agent or scenario runs longer than `WEBHOOK_TIMEOUT_MS` — increase in `.env`
* Long AI workflows: use Make’s **Discord** module instead of holding **Webhook response** open — see [Make integration](make-integration.md)

### Workflow configuration disappeared

`data/guilds.json` was deleted (common after Cybrancee reinstall). Restore from backup or re-run `/webhook set` for each workflow.

### Wrong workflow runs when someone @HookBot

* `/webhook list` — check which is **default** and **AI router**
* If routing is on, mentions hit the router first (when allowed in channel)
* Use `/webhook default name:...` to change the fallback

### `ALLOWED_WEBHOOK_HOSTS` error when setting webhook

The Make URL host must match the allow-list (default `*.make.com`). Contact your host admin if you use a custom proxy URL.

## Getting more help

1. `/webhook list` and `/webhook test name:your-workflow`
2. Make scenario execution history for the matching time
3. Bot host console logs around `[webhook]` and `[discord]` lines
4. [Discord setup](discord-setup.md) and [Make integration](make-integration.md)
