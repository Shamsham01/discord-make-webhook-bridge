# Make integration guide

This page is for **Make engineers** building or maintaining scenarios that receive Discord messages and send replies back.

The bot POSTs JSON to your **Custom webhook** URL and waits for the HTTP response. Put your Agent output in a **Webhook response** module at the end of the scenario.

{% hint style="warning" %}
Do **not** add a final **HTTP** module that calls back to the Discord bot host. The bot reads the reply from Make’s **Webhook response** body only. An HTTP callback requires HTTPS on the bot side and is not supported in the current version.
{% endhint %}

## Scenario pattern (worker workflow)

Every workflow the bot can run (default, `/run` targets, router targets) should follow this shape:

```
Custom webhook  →  your logic / AI Agent  →  Webhook response
```

1. **Custom webhook** — trigger; URL is what you paste into `/webhook set`
2. **Middle modules** — AI Agent, tools, knowledge base, filters, etc.
3. **Webhook response** — last module; body contains the text Discord should post

### Long-running AI Agents

Make may hold the webhook connection open while the Agent runs. If the Agent takes longer than the bot’s timeout, Discord shows an error.

The host sets `WEBHOOK_TIMEOUT_MS` (default 120 seconds). For slow Agents, increase it in the bot’s `.env` (e.g. `500000` for ~8 minutes). Make still has its own webhook hold limits — design scenarios accordingly.

If Make returns `Accepted` with no reply body, the bot treats that as success with **no Discord message**. Always map Agent output into the **Webhook response** body.

## What the bot sends to Make

Each request is `POST` with `Content-Type: application/json`.

### Headers

| Header | Description |
| --- | --- |
| `x-discord-event` | Event type, e.g. `discord.message` |
| `x-discord-guild-id` | Discord server ID |
| `x-discord-message-id` | Discord message ID |
| `x-discord-bridge-secret` | Present only if you set a **secret** in `/webhook set` |

Validate the secret in Make if you configured one (optional but recommended for production).

### Event types

| `event` value | When it fires |
| --- | --- |
| `discord.message` | @mention or reply to the bot |
| `discord.workflow.run` | Someone used `/run` |
| `discord.webhook.test` | Admin ran `/webhook test` |

### Key payload fields (mentions and replies)

| Field | Description |
| --- | --- |
| `content` | User message with the bot @mention stripped |
| `rawContent` | Original Discord message text |
| `trigger` | `mention`, `reply`, or `mention+reply` |
| `workflow` | Name of the workflow being invoked |
| `guildId`, `channelId`, `messageId`, `authorId` | IDs for logging and threading |
| `messageUrl` | Link to the Discord message |
| `attachments` | Array of attachment metadata (URLs, names, types) |
| `author`, `guild`, `channel`, `member` | Structured context for mapping |
| `message.referencedMessage` | Prior message when user replied to the bot |
| `availableWorkflows` | All registered workflows (name, description, channelId) — useful for routers |
| `routing` | `{ "enabled": true/false, "routerWorkflow": "..." }` |

A full example payload is in the repository at `examples/sample-discord-payload.json`.

### `/run` payload differences

* `event`: `discord.workflow.run`
* `trigger`: `slash-command`
* `content` / `rawContent`: the **input** option from `/run`

### Test payload

* `event`: `discord.webhook.test`
* `trigger`: `command`
* `content`: `"Webhook bridge test"`

## What Make should return

The bot parses the **Webhook response** HTTP body. Supported formats:

### JSON with a reply field

Any of these string fields work:

```json
{
  "reply": "Hello from Make!"
}
```

Also accepted: `content`, `response`, `Response`, `replies` (array), `messages` (array).

Example from the repo: `examples/make-webhook-response.json`

### Plain text

Map the Agent **Response** field directly into the Webhook response body:

```
Line one of the answer
Line two of the answer
```

Example: `examples/make-webhook-response.txt`

Messages longer than 2,000 characters are split automatically.

### Ignored bodies

These are treated as “success, no Discord reply”:

* Empty body
* `Accepted`
* `"Accepted"`

If users see “completed successfully” with no text, your scenario likely returned `Accepted` without mapping Agent output to the Webhook response.

### AI router: return a route, not the final answer

The **router** scenario should usually return:

```json
{
  "route": "billing"
}
```

`route` must match a workflow **name** registered in Discord via `/webhook set`. The bot then POSTs the same Discord payload to that workflow’s Make URL and posts **that** scenario’s reply in Discord.

See [AI routing](ai-router.md) for the full two-step flow.

## Example: simple Q&A scenario

1. **Custom webhook** — copy URL → `/webhook set name:helper url:...`
2. **AI Agent** (or other modules) — map `content` from the webhook bundle into the Agent input
3. **Webhook response** — body:

```json
{
  "reply": "{{Agent Response}}"
}
```

Or map the Agent Response as plain text in the body field.

## Example: scenario with optional secret

In Discord:

```
/webhook set name:helper url:https://hook.eu1.make.com/... secret:my-shared-secret
```

In Make, after the Custom webhook, add a filter or router that checks header `x-discord-bridge-secret` equals `my-shared-secret` before running expensive AI steps.

## Mapping tips in Make

| Discord field | Typical Make use |
| --- | --- |
| `content` | Main user question for the Agent |
| `author.displayName` | Personalise replies |
| `channel.name` | Channel-aware behaviour |
| `message.referencedMessage.content` | Conversation context on replies |
| `availableWorkflows` | Router AI prompt / classifier input |
| `workflow` | Know which webhook entry received this run |

## Checklist before go-live

- [ ] Custom webhook is module 1
- [ ] Webhook response is the **last** module
- [ ] Agent (or final) output is mapped into the response body
- [ ] Test with `/webhook test name:your-workflow` in Discord
- [ ] Test with a real @mention in the target channel
- [ ] For routers: response is `{ "route": "workflow-name" }`, not the final user answer

## Related pages

* [Discord setup](discord-setup.md) — register workflows with `/webhook set`
* [AI routing](ai-router.md) — dedicated router scenario
* [Hosting and troubleshooting](hosting-and-troubleshooting.md) — timeouts and common errors
