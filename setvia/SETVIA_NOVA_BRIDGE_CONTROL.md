# SETVIA Nova Ops Bridge Control

## Current Runtime

- Replit app: https://replit.com/@FlowerConcierge/Setvia-Nova-Bridge?utm_source=chatgpt&utm_medium=authorized_app&utm_campaign=chatgpt_open_in_replit
- Replit creation request returned: `creating`
- App name requested: `setvia-mini-nova-ops-bridge`

## Product

**Setvia Mini — Copiloto de Vendas para WhatsApp**

Core promise:

> O Setvia te diz o que responder, acompanha suas vendas e mostra quanto você ganhou.

## Locked Build Scope

- PT-BR first
- Mobile-first
- Replit first
- Hotmart aligned
- Local persistence MVP
- No login required for first version
- No paid API required for first version
- No fake active integrations

## Setvia MVP Screens

1. Home / Hoje
2. Copilot de Vendas
3. Leads / Orders
4. Follow-ups
5. Dashboard
6. Reports
7. Settings
8. Discord Bridge setup/status area

## Discord Bridge

First required command:

```text
/status
```

`/status` must report:

- App status
- Discord bridge status
- Storage mode
- Hotmart status
- Leads count
- Pending approvals
- Supplier records pending verification
- Latest audit event
- Current risks
- Next best action

## Replit Secrets Needed Later

```text
DISCORD_TOKEN
DISCORD_CLIENT_ID
DISCORD_GUILD_ID
AUDIT_WEBHOOK_URL optional
APPROVALS_WEBHOOK_URL optional
LEADS_WEBHOOK_URL optional
SUPPLIERS_WEBHOOK_URL optional
OPENAI_API_KEY optional
```

## Approval Gates

Require approval before:

- Publishing app
- Changing price
- Refund action
- Supplier approval
- Payment setting change
- Domain/DNS change
- Deleting records
- Blocking access
- Sending bulk customer messages
- Using personal details
- Activating paid tools

## Truth Rule

No external integration is active unless real credentials or connection details exist.
Missing integrations must show as `Pending` or `Not Connected`.

## Acceptance Test

- App opens on mobile
- Home / Hoje shows metrics and next actions
- Copilot provides PT-BR copy-ready WhatsApp replies
- Lead can be added and saved locally
- Dashboard updates from local data
- CSV export works
- PDF summary works
- Settings save locally
- Discord Bridge area shows Pending Setup if credentials are missing
- After Discord credentials are added and commands registered, `/status` responds in Discord

## Linked GitHub Issue

- https://github.com/Specbe/shopify-bridge/issues/3
