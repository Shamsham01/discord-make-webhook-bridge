---
description: >-
  Connect Discord to Make.com: setup for server admins, scenario design for
  Make engineers, AI routing, hosting, and troubleshooting.
cover: .gitbook/assets/HookBot Gitbook Cover.png
coverY: 0
layout:
  width: default
  cover:
    visible: true
    size: full
    mask: none
  title:
    visible: true
  description:
    visible: true
  tableOfContents:
    visible: true
  outline:
    visible: true
  pagination:
    visible: true
  metadata:
    visible: true
  tags:
    visible: true
  actions:
    visible: true
---

# Discord HookBot — User Guide

HookBot connects your Discord server to automations you build in [Make](https://www.make.com/). Someone talks to the bot in Discord; the bot sends the message to Make; Make runs your scenario (AI Agent, tools, lookups); the bot posts the answer back in the channel.

{% hint style="info" %}
You do not need to write code to **use** the bot in Discord. Make engineers configure scenarios; Discord admins run `/webhook` commands to connect them.
{% endhint %}

## Who this guide is for

| Audience | Start here |
| --- | --- |
| **Discord server admins** | [Setup for Discord admins](docs/discord-setup.md) |
| **Make engineers** | [Make integration guide](docs/make-integration.md) |
| **Multi-workflow setups** | [AI routing](docs/ai-router.md) |
| **Hosting / fixing issues** | [Hosting and troubleshooting](docs/hosting-and-troubleshooting.md) |

## What people can do in Discord

| Action | Who | What happens |
| --- | --- | --- |
| **@mention** the bot | Everyone | Sends the message to the default workflow, or the AI router if enabled |
| **Reply** to the bot | Everyone | Same as @mention — continues the conversation |
| **`/run`** | Everyone | Runs a specific workflow by name |
| **`/webhook ...`** | Admins (Manage Server) | Add, test, and organise Make workflows |

## Quick start (Discord admin)

1. [Add the bot to your server](docs/discord-setup.md#add-the-bot-to-your-server)
2. Enable **Message Content Intent** in the Discord Developer Portal
3. In Make, create a scenario with **Custom webhook** → your logic → **Webhook response**
4. In Discord:

```
/webhook set name:helper url:https://hook.eu1.make.com/your-link description:Answers everyday questions channel:#ai-chat
/webhook test name:helper
```

5. @mention the bot in `#ai-chat`

[Full setup walkthrough →](docs/discord-setup.md)

## Quick start (Make engineer)

1. Module 1: **Custom webhook** (URL goes into Discord `/webhook set`)
2. Middle: AI Agent, filters, knowledge base, etc. — map `content` from the webhook bundle
3. Last module: **Webhook response** with Agent output, e.g. `{ "reply": "{{Response}}" }` or plain text

Do **not** add an HTTP module calling back to the bot host. See [Make integration guide](docs/make-integration.md).

## AI routing (optional)

When you have several workflows, add a **router** Make scenario that returns `{ "route": "workflow-name" }`. Register it with:

```
/webhook set name:router url:https://hook.eu1.make.com/...
/webhook router name:router
```

[Full AI routing guide →](docs/ai-router.md)

## Documentation pages

* [Setup for Discord admins](docs/discord-setup.md) — invite, permissions, channels, commands, default workflow, `/run`
* [Make integration guide](docs/make-integration.md) — payload, headers, response formats, scenario patterns
* [AI routing](docs/ai-router.md) — router registration, Make scenario, channel rules
* [Hosting and troubleshooting](docs/hosting-and-troubleshooting.md) — Cybrancee, `.env`, common fixes

## Install link

[Add HookBot to Discord](https://discord.com/oauth2/authorize?client_id=1148676666273566760)

Requires **Manage Server** to configure workflows. Anyone can @mention the bot or use `/run` once a workflow is set up.
