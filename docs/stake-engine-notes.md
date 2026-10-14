# Stake Engine source review

Reviewed 13 October 2026. Only official Stake Engine documentation and repositories informed the integration.

## Sources and pinned references

| Source | Findings / use |
| --- | --- |
| [Current documentation](https://stakeengine.org/docs) | SDKs optional; games publish static math and frontend files |
| [Current RGS overview](https://stakeengine.org/docs/rgs) | Authenticate first; recommended Basic Flow is play followed by end-round; runtime launch parameters |
| [Math SDK](https://github.com/engineio/math-sdk/tree/a6dccd86de740cc5d318079483cb6204cc5c19bc) | Python engine, game classes, output files and generated configs; pinned by setup script |
| [Simple RGS example](https://github.com/engineio/math-sdk/blob/a6dccd86de740cc5d318079483cb6204cc5c19bc/docs/simple_example/simple_example.md) | Smallest documented Svelte/Vite + fifty_fifty path; relative Vite base; ACP file upload |
| [Math installation](https://github.com/engineio/math-sdk/blob/a6dccd86de740cc5d318079483cb6204cc5c19bc/docs/math_docs/general_overview.md) | Python >=3.12, pip, editable install; Make recommended; Rust only for optimization |
| [Required file format](https://github.com/engineio/math-sdk/blob/a6dccd86de740cc5d318079483cb6204cc5c19bc/docs/rgs_docs/data_format.md) | index.json, CSV lookup, compressed JSONL; static payout multiplier scale 100 |
| [TS client](https://github.com/engineio/ts-client/tree/df9e126d79b3fe1ef353f4fac9c1699cd79a4d3e) | Published `stake-engine` 0.1.32; factory/method names, types, request payloads, guards and amount helpers |
| [Web SDK](https://github.com/engineio/web-sdk/tree/1843d60cedb94b390e641b563f32ad64353bec5e) | Optional full monorepo; current README requires Node >=22.16 and pnpm 10.5 |
| [Official authentication component](https://github.com/engineio/web-sdk/blob/1843d60cedb94b390e641b563f32ad64353bec5e/packages/components-shared/src/components/Authenticate.svelte) | `round.state` event list, session recovery and example decimal RGS payout multiplier |

Several current web pages (Wallet Endpoints, Simple RGS Walkthrough, frontend First Steps/Dependencies, math Setup) were placeholders at review time. Repository source filled those gaps. Older hosted math docs mention earlier tooling versions; current repository setup/package metadata takes precedence. `create-vite@9.2.1 --template svelte-ts` supplied the frontend tooling; the exact installed tree is in `frontend/package-lock.json`. Stake's client is pinned exactly because it is marked beta upstream.

## Official structure and workflows

Math SDK games normally live in `games/<id>/`, with `game_config.py`, `gamestate.py`, `run.py`, and (for more involved examples) calculation/executable/override/event/optimization modules and reel CSVs. Core `src/` provides Config, BetMode, Distribution, state, event bookkeeping and output writers. `utils/` supports optimization and analysis. Library output includes books, lookup tables, forced-result data, configs and publish files. The small Deep Dive class uses `Executables` directly; extra pass-through subclass files from reel templates are unnecessary here.

Official local math workflow: `make setup`, then `make run GAME=<id>`, or install requirements plus `pip install -e .` and execute the game's run.py. Deep Dive provides equivalent Python scripts that work without Make/activation on Windows. The public SDK's multiprocess writer is preserved, with one worker and 100 books. No runtime outcome calculation is deployed: RGS selects a precomputed book according to CSV weights.

Full Web SDK workflow: clone, `pnpm install`, then `pnpm run storybook --filter=lines` or `pnpm run dev --filter=lines`. Layout is `apps/{cluster,lines,price,scatter,ways}` and shared `packages/` (config, constants, state, utils, components, Pixi wrappers, RGS requests). Pattern: math book events → typed event handlers → UI emitter / Svelte/Pixi components, with XState sequencing and Storybook fixtures. This scaffold implements a minimal sequential handler directly in App.svelte instead of bringing in that whole monorepo.

## Configuration boundaries

- `config/game.json` is CZN's prototype configuration; no claimed official `stake.config` format is introduced.
- Python `GameConfig` defines provider/game identity, bet modes, distributions, RTP metadata and win limit.
- SDK `generate_configs()` produces frontend/backend/optimizer configs and `index.json`.
- `index.json` and files it references are the required math upload contract.
- RGS launch URL supplies session and host. Authentication supplies balance, currency, bet levels and jurisdiction flags.
- Vite/Svelte/TypeScript files configure the frontend toolchain; `base: './'` is essential for nested static hosting.

## Remaining production work

Replace the enumerated treasure/mine model with the intended collection, multiplier and hazard rules; choose and validate RTP/volatility/maximum win with suitable weighting and analysis. Add richer animation only from returned book events. Expand event handlers and checkpoint recovery together. Confirm non-zero round-duration units and implement jurisdiction requirements before accepting those sessions. Assign the real provider/game identity, validate uploaded artifacts in ACP, and test authenticated sessions on the authorized RGS. This project is a foundation, not a completed casino submission.

## Version 0.2 follow-up (14 October 2026)

The current model supersedes the original fifty_fifty demonstration: outcome catalogue 0/0.5/1/2/3/5/10×, 60 zero books, 96% exact weighted RTP. Python selects the target before a bounded route search; every air-bubble/treasure/chest/pearl/mine operation is replay-validated against that target. Mines use integer hundredths and floor on division. The frontend interpolates these immutable distance/depth contact points, bounces after positive encounters and settles only after terminal seabed contact. Terrain parallax is cosmetic and follows the same distance state. Both math and frontend must be republished together because the event schema now includes distance. See the rewritten README for current setup and rules.


## Independent 97% / 250× model (14 October 2026)

Official reference: https://bgaming.com/games/aviamasters lists 97% RTP and 250× maximum. Exact probabilities are not published in the reviewed sources. With user approval, Deep Dive uses independent probabilities matching those two targets only, retaining its own pickup rules. Aggregate integer weights are split across route books, written to the SDK lookup tables before config/hash generation, and mirrored into local demo selectionWeight metadata. Live book events do not select outcomes. No claim of identical hit rate or volatility is made.
