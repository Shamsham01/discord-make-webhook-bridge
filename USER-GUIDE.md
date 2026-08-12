---
description: A simple how-to for adding the bot to Discord, setting it up, and using it every day.
---

# Discord Make Bot — User Guide

This guide is for people who want to use the bot in a Discord server. You do not need to write code.

{% hint style="info" %}
If you can click a link, type a Discord command, and follow a few steps, you can use this bot.
{% endhint %}

## What this bot does

The bot connects your Discord server to automations you build in [Make](https://www.make.com/).

In plain words:

- Someone talks to the bot in Discord.
- The bot sends that message to the right automation.
- The automation can think, look things up, or use AI.
- The bot posts the answer back in Discord.

You can use it as a helper, a support assistant, a content tool, or anything else you set up in Make.

People in the server can:

- **@mention** the bot in a message
- **Reply** to a message the bot already sent
- Use the **`/run`** command to pick a specific automation

## Add the bot to your server

You need permission to add apps to the Discord server (usually **Manage Server**).

1. Open this invite link:

   [Add the bot to Discord](https://discord.com/oauth2/authorize?client_id=1148676666273566760)

2. Choose the server where you want the bot.
3. Confirm the permissions Discord shows you.
4. Click **Authorize**.

The bot should then appear in your server’s member list.

### Permissions the bot needs

Please allow these when you invite it. They are what the bot uses to read messages, reply, and show that it is working:

| Permission | Why it is needed |
| --- | --- |
| **View Channels** | So the bot can see the rooms where people talk to it |
| **Send Messages** | So it can reply |
| **Send Messages in Threads** | So it can reply inside threads too |
| **Read Message History** | So it can understand replies to its own messages |
| **Add Reactions** | So it can add a small reaction (like 👀) while it is working |

{% hint style="success" %}
If a permission is missing, the bot may be online but stay silent. You can fix this later in **Server Settings → Integrations** (or **Roles**) by giving the bot those permissions again.
{% endhint %}

## Channel setup

The bot can work in any text channel it is allowed to see. You do not have to create a special channel, but many servers like a dedicated one such as `#ai-chat` or `#ask-bot`.

### Give the bot access

In each channel where people should talk to the bot:

1. Open the channel settings.
2. Make sure the bot’s role can **View Channel**, **Send Messages**, and **Read Message History**.
3. If you use threads, also allow **Send Messages in Threads**.

### Optional: lock a workflow to one channel

When you add a workflow, you can limit it to one channel (for example, only `#support`).

- Mentions and replies for that workflow then work in that channel (and in threads inside it).
- The `/run` command will only offer that workflow when you are in that channel.

If you do not pick a channel, the workflow can be used anywhere the bot can see.

## Set it up for the first time

This part is for a server admin (someone with **Manage Server**).

You will connect Discord to a Make automation using a webhook link. That link is just an address Make gives you so the bot knows where to send messages.

### 1. Get a webhook link from Make

1. In Make, create a scenario.
2. Add a **Custom webhook** as the starting step.
3. Copy the webhook URL Make shows you.

Keep that link private. Treat it like a password.

### 2. Save it in Discord

In your Discord server, type:

```text
/webhook set
```

Then fill in:

- **name** — a short, easy name, such as `helper` or `support`
- **url** — paste the Make webhook link
- **description** — a sentence about what it does, such as `Answers general questions`
- **channel** — optional. Pick a channel if this workflow should only work there
- **secret** — optional. An extra password if you want Make to accept requests only from this bot

Example:

```text
/webhook set name:helper url:https://hook.eu1.make.com/your-link description:Answers everyday questions channel:#ai-chat
```

The first workflow you add becomes the **default** automatically. That means the bot will use it when someone mentions it or replies to it.

To change a workflow later, run `/webhook set` again with the **same name**. The new details replace the old ones.

{% hint style="info" %}
Only people with **Manage Server** can use `/webhook` commands. Those replies are private, so other members do not see the setup details. The webhook link is never shown back in Discord.
{% endhint %}

### 3. Check that it works

Run:

```text
/webhook test name:helper
```

If Make received the test, Discord will tell you it was delivered. You can then finish your Make scenario so it sends a reply back to Discord.

The full list of commands, including when and why to use each one, is in [All commands](#all-commands).

## How to talk to the bot

After a default workflow is set, anyone in the server can use it.

### Mention the bot

Type `@` and choose the bot, then write your question.

**Example**

```text
@YourBot Can you summarise this meeting in three bullet points?
```

### Reply to the bot

If the bot already answered, click **Reply** on that message and keep the conversation going. You do not need to mention it again.

**Example**

```text
Make that shorter, and add a friendly greeting.
```

While it works, the bot may add a 👀 reaction. When it is done, it replies in the same channel.

## The default workflow

The **default** is the everyday automation. It is what the bot uses when someone:

- mentions the bot, or
- replies to the bot

and AI routing is **not** turned on.

### How it is chosen

- The first workflow you add is set as default for you.
- You can change it at any time with:

```text
/webhook default name:support
```

Pick the name from the list Discord shows you.

### When to use it

Use one default if you mostly want a single assistant, such as:

- a general Q&A bot in `#ai-chat`
- a support helper in `#help`
- a writing assistant for your team

**Example**

You save a workflow named `helper` and leave it as the default. Then this is enough:

```text
@YourBot Draft a welcome message for new members.
```

The bot sends that request to `helper` and posts the answer.

## AI routing

AI routing is optional. Use it when you have **more than one** workflow and you want the bot to pick the right one for each message.

Think of it as a receptionist:

1. Someone mentions the bot or replies to it.
2. The **router** reads the message.
3. It chooses the best workflow, such as `support`, `billing`, or `writer`.
4. That workflow does the real work and the bot replies.

### Turn routing on

1. Add each workflow with `/webhook set`, and write a clear **description** for every one. The router uses those descriptions to decide.
2. Add one extra workflow that is only the router (the “receptionist”).
3. Run:

```text
/webhook router name:router
```

Replace `router` with the name you gave that workflow.

### Turn routing off

```text
/webhook router name:off
```

Mentions and replies then go back to the **default** workflow.

### Example

You have three workflows:

| Name | Description |
| --- | --- |
| `support` | Helps with product questions and how-to |
| `billing` | Answers payment, invoice, and plan questions |
| `writer` | Drafts posts, replies, and announcements |
| `router` | Reads the message and chooses support, billing, or writer |

Someone writes:

```text
@YourBot I was charged twice this month. Can you help?
```

The router sends that to `billing`. The billing workflow answers in Discord.

Someone else writes:

```text
@YourBot Write a short Discord announcement about tomorrow’s update.
```

The router sends that to `writer`.

{% hint style="warning" %}
Routing only applies to **mentions** and **replies**. The `/run` command always uses the workflow you pick yourself. It does not go through the router.
{% endhint %}

## The `/run` command

`/run` lets anyone in the server start a **specific** workflow on purpose. It is the “I know exactly which tool I want” option.

Type:

```text
/run
```

Then fill in:

- **workflow** — choose from the list (only workflows allowed in this channel are shown)
- **input** — the message or instructions for that workflow

### Examples

Ask the support workflow a question:

```text
/run workflow:support input:How do I reset my password?
```

Ask the writer workflow to draft something:

```text
/run workflow:writer input:Write a friendly 2-sentence welcome for new members.
```

Ask a billing workflow:

```text
/run workflow:billing input:What is included in the Pro plan?
```

The bot will show that it is working, then post the result in the channel.

If a workflow is limited to one channel, `/run` only works there. Discord will tell you if you are in the wrong place.

## All commands

There are two command families:

- **`/webhook ...`** — for server admins (**Manage Server**). Used to add, check, and organise workflows. Replies are private.
- **`/run`** — for everyone. Used to start a specific workflow.

When you type a command, Discord often shows a list of workflow names. Pick from that list instead of guessing.

| Command | Who can use it | Use it to |
| --- | --- | --- |
| `/webhook set` | Admins | Add or update a workflow |
| `/webhook list` | Admins | See every workflow on this server |
| `/webhook status` | Admins | Check one workflow’s details |
| `/webhook test` | Admins | Check that Make is receiving messages |
| `/webhook remove` | Admins | Delete a workflow you no longer need |
| `/webhook default` | Admins | Choose what runs for mentions and replies |
| `/webhook router` | Admins | Turn AI routing on or off |
| `/run` | Everyone | Start a specific workflow yourself |

### `/webhook set`

**Why:** This is how you connect Discord to a Make automation. Without it, the bot has nothing to run.

**When:** First-time setup, when you add a new helper, or when you need to change a link, description, channel, or secret.

**How:** Type `/webhook set`, then fill in:

| Field | Required? | What to put |
| --- | --- | --- |
| **name** | Yes | A short name, such as `support` or `writer`. Use the same name later to update it. |
| **url** | Yes | The webhook link from Make |
| **description** | No | What this workflow does. People see this in `/run`, and the AI router uses it to choose. |
| **channel** | No | Limit the workflow to one channel |
| **secret** | No | An extra password, only if your Make scenario checks for one |

**Example — add a support helper**

```text
/webhook set name:support url:https://hook.eu1.make.com/your-link description:Helps with product questions channel:#help
```

**Example — update the description later**

```text
/webhook set name:support url:https://hook.eu1.make.com/your-link description:Helps with product questions and how-to
```

{% hint style="info" %}
Names should stay short and simple: letters, numbers, dashes, or underscores. Discord will offer existing names as you type.
{% endhint %}

### `/webhook list`

**Why:** So you can see what is already set up, which one is the default, and which one is the AI router.

**When:** After setup, before changing anything, or when someone says the bot is using the wrong helper.

**How:**

```text
/webhook list
```

You will see every workflow, plus labels such as *default* or *AI router*.

**Example result**

- **helper** _(default)_ — Answers everyday questions
- **billing** — Answers payment questions
- **router** _(AI router)_ — Chooses the right workflow

### `/webhook status`

**Why:** To inspect one workflow in more detail than the list, without exposing the secret webhook link.

**When:** You want to check where it is allowed to run, whether it is the default or the router, or whether a secret is set.

**How:**

```text
/webhook status name:support
```

Pick the name from the list Discord shows.

**Example:** Use this if `/run` says a workflow can only be used in another channel, and you need to confirm which channel that is.

### `/webhook test`

**Why:** To check the connection to Make before people start using the bot, or when something stops working.

**When:** Right after `/webhook set`, after you change a Make scenario, or when mentions and `/run` fail.

**How:**

```text
/webhook test name:helper
```

If it works, Discord says the test was delivered. If it fails, fix the Make link or scenario, then test again.

{% hint style="warning" %}
A successful test means Make received the message. It does not always mean Make is already sending a nice reply back. Finish the Make scenario if the bot still has nothing useful to post.
{% endhint %}

### `/webhook remove`

**Why:** To delete a workflow you no longer need, so people cannot run it by mistake.

**When:** A helper is retired, a Make scenario was replaced, or you added a test workflow you do not want to keep.

**How:**

```text
/webhook remove name:old-helper
```

**What happens next**

- That name disappears from `/run` and `/webhook list`.
- If it was the **default**, the bot picks another remaining workflow as default.
- If it was the **AI router**, routing is turned off.

{% hint style="danger" %}
This cannot be undone from Discord. You would need to add the workflow again with `/webhook set`.
{% endhint %}

### `/webhook default`

**Why:** Mentions and replies need one everyday workflow. This command chooses which one that is.

**When:** You have more than one workflow and want a different one to answer `@Bot` messages. Also use it after you add a better main helper.

**How:**

```text
/webhook default name:support
```

The first workflow you add is already the default. You only need this command when you want to change it.

**Example:** You started with `helper`, then built a stronger `support` workflow. Set `support` as default so everyday mentions go there. People can still use `/run` for the others.

See [The default workflow](#the-default-workflow) for more.

### `/webhook router`

**Why:** So the bot can read a mention or reply and send it to the best workflow, instead of always using the default.

**When:** You have several helpers (support, billing, writing, and so on) and you do not want people to pick with `/run` every time.

**How to turn on:**

```text
/webhook router name:router
```

Use the name of the workflow that should act as the receptionist. Give every other workflow a clear description first, so the router can choose well.

**How to turn off:**

```text
/webhook router name:off
```

Mentions and replies then use the default workflow again.

See [AI routing](#ai-routing) for a full example.

### `/run`

**Why:** So anyone can start a **specific** workflow, even if it is not the default and even if routing is on.

**When:** You already know which helper you want, or you want to skip the router.

**How:** Type `/run`, pick a **workflow** from the list, then type your **input**.

```text
/run workflow:writer input:Write a friendly 2-sentence welcome for new members.
```

- Anyone in the server can use it.
- The result is posted in the channel, not as a private reply.
- Only workflows allowed in the current channel appear in the list.

See [The `/run` command](#the-run-command) for more examples.

## Quick comparison

| What you do | What happens |
| --- | --- |
| `@Bot your question` | Uses the **default** workflow, or the **router** if routing is on |
| Reply to the bot | Same as above, and continues the conversation |
| `/run workflow:name input:...` | Always runs the workflow you chose |

## Everyday tips

- Give each workflow a clear name and description. That helps people using `/run`, and it helps the router choose well.
- Start simple: one default workflow in one channel. Add routing later if you need several helpers.
- If nothing happens when you mention the bot, check that it can see the channel and that a default workflow is set (`/webhook list`).
- If a command does not appear, try typing `/` and looking for `webhook` or `run`. You may need to wait a moment after inviting the bot, or kick and re-invite it with the [install link](https://discord.com/oauth2/authorize?client_id=1148676666273566760).

## Need help?

Ask a server admin to run `/webhook list` and `/webhook test` on the workflow you expected to run. If the test succeeds, the connection to Make is working, and the next place to check is the Make scenario itself.
