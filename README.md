# 💧 Hydro Researcher — Automated Hydrogen Market Intelligence

An automated AI-powered system that scans global hydrogen news daily, classifies bankability signals, and delivers reports via Telegram.

## What It Does

- Scans **18 watchlist queries** across Google News every day
- Classifies findings into 4 signal categories
- Delivers formatted intelligence reports to a private Telegram bot
- Runs automatically at **7:00 AM Jerusalem time**

## Signal Categories

| Signal | Criteria |
|--------|----------|
| 🟢 **BANKABILITY** | SPAs, take-or-pay clauses, 10–15yr binding contracts |
| 🔴 **RED FLAGS** | Project withdrawals, RFNBO stalls, cost threats |
| 🔵 **REGIONAL TRIGGERS** | EU Hydrogen Mechanism, German H2 Core Network, China 5YP |
| ⚪ **MONITOR** | General hydrogen market developments |

## Watchlist Coverage

- **Binding contracts:** SPAs, "supply agreement signed", "offtake", "take-or-pay"
- **EU:** Hydrogen Mechanism offtake collection, RFNBO certification, Innovation Fund
- **Germany:** H2 Core Network, electrolyser connections, Carbon Contracts for Difference
- **China:** 15th Five-Year Plan demonstration projects, subsidies
- **Sectors:** Data center behind-the-meter, port decarbonization, green ammonia (India, Middle East)
- **Red flags:** Project withdrawals, RFNBO delays, cost competitiveness threats
- **Key companies:** Plug Power, RWE, Nel, ITM Power, Bloom Energy

## Tech Stack

- **Backend:** Deno (TypeScript) — deployed on Base44
- **Search:** Serper.dev Google News API (24-hour lookback, deduplicated)
- **Delivery:** Telegram Bot API (`@HydrogenAlertBot`)
- **Automation:** Base44 CRON scheduler (every 2 days at 04:00 UTC)

## File Structure

```
functions/
  hydrogenDailyScan.ts    # Main scan + classification + Telegram delivery
.agents/
  rules/                  # Agent standing instructions
  skills/                 # Reusable scripts
```

## Investment Philosophy

This system is built around **bankability over hype** — rejecting non-binding MOUs in favor of verifiable contract signals that indicate real capital commitment in the green hydrogen sector.
