# Make integration guide

This page is for **Make engineers** building or maintaining scenarios that receive Discord messages and send replies back.

HookBot POSTs JSON to your **Custom webhook** URL when someone @HookBot, replies to HookBot, or uses `/run`.

## Scenario patterns

### Short workflows — Webhook response

For quick automations (under roughly one to two minutes), end with **Webhook response** and map your output into the body:

```
Custom webhook  →  your logic / AI Agent  →  Webhook response
```

1. **Custom webhook** — trigger; URL is what you paste into `/webhook set`
2. **Middle modules** — AI Agent, filters, knowledge base, etc.
3. **Webhook response** — body contains the text HookBot posts in Discord

HookBot waits for this response and posts the result as a reply to the user’s message.

### Long workflows — Make Discord module

{% hint style="tip" %}
For **long AI workflows** (Agents with tool calling, multi-step research, etc.), avoid holding **Webhook response** open until everything finishes — Make and HookBot both have timeouts.

Instead:

1. Let the Custom webhook trigger complete (optionally return a short acknowledgement from **Webhook response**, or none)
2. Run your Agent and tools in the background
3. Use Make’s native **Discord** module to post the final answer

Map **`channelId`** and **`messageId`** from the initial Custom webhook payload — HookBot already sends both. Use them in **Create a Message** (or reply to that message) so the answer appears in the same channel and thread as the user’s @HookBot message.

This pattern works well when the scenario may run for many minutes while tools or sub-agents execute.
{% endhint %}

## What HookBot sends to Make

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
| `discord.message` | @HookBot or reply to HookBot |
| `discord.workflow.run` | Someone used `/run` |
| `discord.webhook.test` | Admin ran `/webhook test` |

### Key payload fields (mentions and replies)

| Field | Description |
| --- | --- |
| `content` | User message with the @HookBot mention stripped |
| `rawContent` | Original Discord message text |
| `trigger` | `mention`, `reply`, or `mention+reply` |
| `workflow` | Name of the workflow being invoked |
| `guildId`, `channelId`, `messageId`, `authorId` | IDs for logging, Discord module mapping, and threading |
| `messageUrl` | Link to the Discord message |
| `attachments` | Array of attachment metadata (URLs, names, types) |
| `author`, `guild`, `channel`, `member` | Structured context for mapping |
| `message.referencedMessage` | Prior message when user replied to HookBot |
| `availableWorkflows` | All registered workflows (name, description, channelId) — useful for routers |
| `routing` | `{ "enabled": true/false, "routerWorkflow": "..." }` |

A full example payload is in the repository at `examples/sample-discord-payload.json`.

### `/run` payload differences

* `event`: `discord.workflow.run`
* `trigger`: `slash-command`
* `content` / `rawContent`: the **input** option from `/run`

Note: `/run` uses the slash command interaction ID as `messageId`, not a channel message — prefer the **Webhook response** pattern for `/run` unless you map channel context differently.

### Test payload

* `event`: `discord.webhook.test`
* `trigger`: `command`
* `content`: `"Webhook bridge test"`

## What Make should return (Webhook response path)

When you use **Webhook response**, HookBot parses the response body. Supported formats:

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

Messages longer than 2,000 characters are split automatically when HookBot posts them.

### Ignored bodies

These are treated as “success, no Discord reply” from HookBot:

* Empty body
* `Accepted`
* `"Accepted"`

If users see “completed successfully” with no text on `/run`, your scenario likely returned `Accepted` without a reply body. For long workflows, switch to the **Discord** module pattern above.

### AI router: return a route, not the final answer

The **router** scenario should usually return:

```json
{
  "route": "billing"
}
```

`route` must match a workflow **name** registered in Discord via `/webhook set`. HookBot then POSTs the same Discord payload to that workflow’s Make URL and posts **that** scenario’s reply in Discord.

See [AI routing](ai-router.md) for the full two-step flow.

## Example: simple Q&A scenario

1. **Custom webhook** — copy URL → `/webhook set name:helper url:...`
2. **AI Agent** — map `content` from the webhook bundle into the Agent input
3. **Webhook response** — body:

```json
{
  "reply": "{{Agent Response}}"
}
```

Or map the Agent Response as plain text in the body field.

## Example: long Agent with Discord module

1. **Custom webhook** — receives payload with `channelId`, `messageId`, `content`
2. **AI Agent** (+ tools) — runs as long as needed
3. **Discord → Create a Message** (or equivalent) — channel = `channelId`, reply/thread using `messageId` as needed, message = Agent output

No Webhook response body required for the final answer — Make posts directly to Discord.

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
| `channelId` | Target channel for Discord module replies |
| `messageId` | Reply to the triggering @HookBot message |
| `author.displayName` | Personalise replies |
| `channel.name` | Channel-aware behaviour |
| `message.referencedMessage.content` | Conversation context on replies |
| `availableWorkflows` | Router AI prompt / classifier input |
| `workflow` | Know which webhook entry received this run |

## Checklist before go-live

- [ ] Custom webhook is module 1
- [ ] Short scenarios: **Webhook response** maps Agent output into the body
- [ ] Long AI scenarios: **Discord** module uses `channelId` and `messageId` from the webhook payload
- [ ] Test with `/webhook test name:your-workflow` in Discord
- [ ] Test with a real @HookBot message in the target channel
- [ ] For routers: response is `{ "route": "workflow-name" }`, not the final user answer

## Related pages

* [Discord setup](discord-setup.md) — register workflows with `/webhook set`
* [AI routing](ai-router.md) — dedicated router scenario
* [Hosting and troubleshooting](hosting-and-troubleshooting.md) — timeouts and common errors
