# Deploy on Cybrancee

This project is designed to run continuously on Cybrancee Discord Bot Hosting using the built-in Git integration.

## Required Cybrancee settings

Open your bot server in the Cybrancee panel and go to **Startup**.

Use these values:

| Setting | Value |
|---|---|
| Git Repo Address | `https://github.com/Shamsham01/discord-make-webhook-bridge` |
| Git Branch | `main` |
| Auto Update | Enabled |
| Node.js version / Docker Image | Node.js 20 or Node.js 22 |
| Bot JS File | `src/index.js` |
| Additional Node Packages | `discord.js dotenv` |

The project also includes `package.json` and `package-lock.json`, so dependencies and exact versions are documented in the repository.

## First Git installation

Cybrancee requires the server file manager to be empty before its Git integration performs the initial clone.

1. Open **Startup** and enter the Git settings above.
2. Open **Settings → Reinstall Server**.
3. Select **Delete current files and reinstall server**.
4. Confirm the reinstall.
5. Restart the server so Cybrancee pulls the repository.

> Reinstalling deletes current server files. Only use this for the initial deployment or after backing up `.env` and `data/guilds.json`.

## Create the `.env` file

The real `.env` file is deliberately excluded from Git.

In **Files**, create a file named `.env` in the repository root and add:

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

Never commit the real Discord token or Make webhook URLs to GitHub.

## Start the bot

1. Open the **Console** page.
2. Start or restart the server.
3. Confirm the console shows that the Discord client logged in.
4. Confirm the bot appears online in Discord.
5. Run `/webhook set` and `/webhook test` in your Discord server.

## Updating from GitHub

With **Auto Update** enabled, restarting the Cybrancee server pulls changes from the configured `main` branch.

Runtime configuration is stored in:

```text
./data/guilds.json
```

That file is ignored by Git, so a normal `git pull` does not replace it. Back up `.env` and the `data` directory before a reinstall, migration, or manual file cleanup.

## Optional scheduled tasks

Useful Cybrancee schedules include:

- A regular server restart, such as once per day, for recovery from unexpected connection issues.
- Regular backups containing `.env` and `data/guilds.json`.

## Troubleshooting

### Bot does not start

Check:

- Node.js is version 20 or 22.
- **Bot JS File** is exactly `src/index.js`.
- `discord.js` and `dotenv` are listed under **Additional Node Packages**.
- `.env` exists at the repository root.
- `DISCORD_TOKEN` contains the current token without quotes or extra spaces.

### Bot is online but does not receive messages

In the Discord Developer Portal, enable **Message Content Intent** for the application. Also verify that the bot can view the channel and read message history.

### Slash commands do not appear

Confirm the bot was invited with both scopes:

```text
bot
applications.commands
```

Restart the bot after changing its invite or permissions.

### Webhook configuration disappeared

Check whether `data/guilds.json` was deleted during a reinstall or file cleanup. Restore it from a backup, then restart the bot.
