# Setup for Discord admins

This page is for server administrators who connect the bot to Make and manage workflows. You do not need to write code.

{% hint style="info" %}
Only people with **Manage Server** can use `/webhook` commands. Those replies are private — other members do not see webhook URLs or secrets.
{% endhint %}

## Before you start

You will need:

1. Permission to **Manage Server** in Discord
2. A Make account with at least one scenario (or more, if you use AI routing)
3. A webhook URL from Make’s **Custom webhook** trigger module

## Add the bot to your server

1. Open the [bot invite link](https://discord.com/oauth2/authorize?client_id=1148676666273566760).
2. Choose your server and confirm permissions.
3. Click **Authorize**.

The bot should appear in your member list.

### Permissions the bot needs

| Permission | Why |
| --- | --- |
| **View Channels** | See channels where people talk to it |
| **Send Messages** | Post replies |
| **Send Messages in Threads** | Reply inside threads |
| **Read Message History** | Understand replies to its own messages |
| **Add Reactions** | Optional 👀 while working (if configured by the host) |

If a permission is missing, the bot may be online but stay silent. Fix this under **Server Settings → Integrations** or **Roles**.

### Message Content Intent (important)

In the [Discord Developer Portal](https://discord.com/developers/applications), open your bot application → **Bot** → enable **Message Content Intent** under **Privileged Gateway Intents**.

This is required for:

* @mentions
* Replies to the bot without @mentioning it again

If mentions do nothing and slash commands work, this intent is the first thing to check.

## Channel setup

The bot works in any text channel it can see. Many servers use a dedicated channel such as `#ai-chat` or `#ask-bot`.

### Give the bot access

In each channel where people should use the bot:

1. Open channel settings → **Permissions**
2. Allow the bot role: **View Channel**, **Send Messages**, **Read Message History**
3. For threads, also allow **Send Messages in Threads**

### Optional: lock a workflow to one channel

When you add a workflow with `/webhook set`, you can pick a **channel**:

* Mentions and replies for that workflow work in that channel (and threads inside it)
* `/run` only offers that workflow when you are in that channel

If you leave **channel** empty, the workflow works anywhere the bot can read messages.

{% hint style="info" %}
If AI routing is on and the router is limited to a different channel than your default workflow, mentions in the default’s channel still work — the bot falls back to the default when the router is not allowed there.
{% endhint %}

## First-time setup

### 1. Get a webhook URL from Make

1. In Make, create a scenario
2. Add **Webhooks → Custom webhook** as the first module
3. Copy the webhook URL

Treat that URL like a password. Do not post it in public Discord channels.

See [Make integration](make-integration.md) for how to finish the scenario so replies appear in Discord.

### 2. Register the workflow in Discord

Type `/webhook set` and fill in:

| Field | Required? | What to put |
| --- | --- | --- |
| **name** | Yes | Short name, e.g. `helper` or `nft-flipping-agent` |
| **url** | Yes | The Make custom webhook URL |
| **description** | No | One sentence about what it does — shown in `/run` and used by the AI router |
| **channel** | No | Limit this workflow to one channel |
| **secret** | No | Extra password if your Make scenario checks for one |

**Example**

```
/webhook set name:helper url:https://hook.eu1.make.com/your-link description:Answers everyday questions channel:#ai-chat
```

The **first** workflow you add becomes the **default** automatically. That is what @mentions and replies use when AI routing is off.

To update a workflow later, run `/webhook set` again with the **same name**.

### 3. Test the connection

```
/webhook test name:helper
```

If Make received the test, Discord shows a success message. A successful test means Make got the HTTP request — finish your Make scenario if the bot still has nothing useful to post back.

## How people use the bot

### @mention the bot

```
@YourBot Can you summarise this in three bullet points?
```

### Reply to the bot

Click **Reply** on a message the bot sent. No need to @mention again.

```
Make that shorter and add a friendly greeting.
```

While working, the bot may react with 👀 (if enabled). When done, it replies in the same channel.

## The default workflow

The **default** is the everyday automation for @mentions and replies when AI routing is **off**.

* The first workflow you add is set as default automatically
* Change it anytime:

```
/webhook default name:support
```

Pick the name from Discord’s autocomplete list.

## The `/run` command

Anyone in the server can run a **specific** workflow:

```
/run workflow:support input:How do I reset my password?
```

* Only workflows allowed in the **current channel** appear in the list
* The result is posted in the channel (not ephemeral)
* `/run` never goes through the AI router — you pick the workflow yourself

## Quick comparison

| What someone does | What happens |
| --- | --- |
| `@Bot question` | Default workflow, or **router** first if AI routing is on |
| Reply to the bot | Same as above |
| `/run workflow:name input:...` | Always runs the workflow they chose |

## All `/webhook` commands

| Command | Use it to |
| --- | --- |
| `/webhook set` | Add or update a workflow |
| `/webhook list` | See every workflow, default, and AI router |
| `/webhook status` | Inspect one workflow (channel scope, secret set, etc.) |
| `/webhook test` | Send a test event to Make |
| `/webhook remove` | Delete a workflow |
| `/webhook default` | Choose the workflow for @mentions and replies |
| `/webhook router` | Turn AI routing on or off |

### `/webhook list` example

* **helper** _(default)_ — Answers everyday questions
* **billing** — Payment questions
* **router** _(AI router)_ — Chooses the right workflow

### `/webhook remove` notes

* If you remove the default, another remaining workflow becomes default
* If you remove the AI router workflow, routing is turned off
* You cannot undo this from Discord — re-add with `/webhook set` if needed

## AI routing (optional)

If you have several workflows, you can add a **router** that picks the best one for each message. See [AI routing](ai-router.md) for the full setup.

**Turn on**

```
/webhook router name:router
```

**Turn off**

```
/webhook router name:off
```

## Everyday tips

* Use clear **names** and **descriptions** on every workflow
* Start with one default in one channel; add routing later if needed
* Run `/webhook list` if mentions do nothing — confirm a default is set
* Run `/webhook test` in the same channel where people @mention the bot
* If slash commands are missing, re-invite the bot with `bot` and `applications.commands` scopes

## Need help?

1. Run `/webhook list` and `/webhook test name:your-workflow`
2. If the test succeeds, check the Make scenario (see [Make integration](make-integration.md))
3. See [Hosting and troubleshooting](hosting-and-troubleshooting.md) for bot hosting and common fixes
