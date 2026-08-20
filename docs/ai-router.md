# AI routing

AI routing is **optional**. Use it when you have **more than one** Make workflow and want the bot to pick the best one for each @mention or reply — without users typing `/run` every time.

Think of it as a receptionist:

1. Someone @mentions the bot or replies to it
2. The **router** Make scenario reads the message
3. It returns which workflow should handle it (`support`, `billing`, `writer`, …)
4. The bot calls that workflow’s Make scenario
5. The **worker** scenario’s reply is posted in Discord

{% hint style="warning" %}
Routing applies only to **@mentions** and **replies**. The `/run` command always uses the workflow the user picks. It never goes through the router.
{% endhint %}

## When to use it

| Situation | Recommendation |
| --- | --- |
| One helper for the whole server | Skip routing — use a single **default** workflow |
| Several specialised helpers | Add a router + worker workflows |
| Users always know which tool they need | `/run` may be enough; routing is optional |

## Overview diagram

```
User @mentions bot in Discord
        │
        ▼
Bot POSTs to router Make webhook
  (message + list of available workflows)
        │
        ▼
Router AI returns { "route": "billing" }
        │
        ▼
Bot POSTs same payload to billing Make webhook
        │
        ▼
Billing scenario returns answer → bot posts in Discord
```

The router does **not** call other Make scenarios itself. The **bot** performs the second HTTP request after it reads `route`.

## Step 1 — Register worker workflows

Add each real workflow with a clear **description** (the router uses these to decide):

```
/webhook set name:support url:https://hook.eu1.make.com/... description:Product help and how-to
/webhook set name:billing url:https://hook.eu1.make.com/... description:Payments, invoices, and plans
/webhook set name:writer url:https://hook.eu1.make.com/... description:Drafts posts and announcements
```

Set your everyday fallback:

```
/webhook default name:support
```

Descriptions appear in `/run` autocomplete and in the `availableWorkflows` array sent to Make.

## Step 2 — Build the router scenario in Make

Create a **separate** Make scenario:

1. **Custom webhook** — copy this URL (this is the router’s trigger, not a worker URL)
2. **AI / classifier** — read the Discord message and pick a workflow  
   - Input: `content` from the webhook bundle  
   - Context: loop or format `availableWorkflows` (each item has `name` and `description`)  
   - Optional: attach a knowledge base for classification rules
3. **Webhook response** — return JSON only:

```json
{
  "route": "billing"
}
```

`route` must exactly match a name from `/webhook set` (letters, numbers, dashes, underscores; case-insensitive).

The router should **not** return the final user-facing answer unless you intentionally want the router to reply directly (if `route` is omitted, the bot posts whatever the router returned).

## Step 3 — Register the router with the bot

Register the router like any other workflow:

```
/webhook set name:router url:https://hook.eu1.make.com/YOUR_ROUTER_HOOK description:Routes messages to the best workflow
```

Then tell the bot this workflow is the AI router:

```
/webhook router name:router
```

Use the same **name** you chose in `/webhook set` (`router` in this example).

Verify with `/webhook list` — you should see **router** labelled _(AI router)_.

## Step 4 — Test

```
/webhook test name:router
```

Then @mention the bot with a message that should clearly map to one worker, e.g.:

```
@YourBot I was charged twice this month
```

Check Make execution history: router scenario first, then the chosen worker scenario.

## Turn routing off

```
/webhook router name:off
```

@mentions and replies go back to the **default** workflow only.

## Channel restrictions and routing

Each workflow can be limited to one Discord channel via `/webhook set ... channel:#...`.

When someone @mentions the bot:

1. The bot tries the **router** first — only if that workflow is allowed in the current channel
2. If the router is blocked for this channel, the bot tries the **default** workflow instead
3. If the router picks a target workflow, that target must also be allowed in the current channel

Example:

| Workflow | Channel |
| --- | --- |
| `router` | `#staff` only |
| `nft-flipping-agent` (default) | `#ai-chat` only |

* @mention in `#ai-chat` → default runs (router skipped)
* @mention in `#staff` → router runs, then routes to a worker

## Example router prompt (conceptual)

Give your AI module something like:

> You are a router. Read the user message and pick the best workflow name.  
> Available workflows:  
> - `support` — Product help and how-to  
> - `billing` — Payments and invoices  
> - `writer` — Drafts announcements  
>  
> Reply with JSON only: `{ "route": "workflow-name" }`

In Make, map the AI output into the Webhook response body. You may need a JSON parse or text parser module if the model returns extra text.

## Common mistakes

| Mistake | Result |
| --- | --- |
| Using the router URL as a worker URL | Wrong scenario runs or duplicate triggers |
| Router returns prose instead of `{ "route": "..." }` | Bot may post router text or show no useful reply |
| `route` name not registered in Discord | Error in Discord; check bot logs |
| Worker scenario missing Webhook response | Bot calls worker but posts nothing |
| Vague workflow descriptions | Router picks the wrong workflow |

## Related pages

* [Discord setup](discord-setup.md) — permissions, default workflow, commands
* [Make integration](make-integration.md) — payload fields, response formats, worker scenarios
