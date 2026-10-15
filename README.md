# Trenchbound Relay — CZN Studios

Svelte 5 / TypeScript / Vite frontend, official pinned Stake Engine client, and Python Math SDK. The selector offers Easy (100 m), Medium (300 m) and Hard (600 m), with an immediate loss at zero and a bonus for reaching the selected seabed. The model is independently designed; it is not BGaming's undisclosed exact math.

## Run locally

Dependencies are installed on this computer:

```powershell
cd "$env:USERPROFILE\Desktop\czn-deep-dive"
npm.cmd run dev
```

Open the printed address, normally http://127.0.0.1:5173/. Without RGS parameters the game uses 100 demo credits; reload resets them. Demo books for the chosen depth load on demand.

For a fresh checkout, install Git, Node 22.19+ and Python 3.12:

```powershell
npm.cmd --prefix frontend ci
py -3.12 scripts/setup_math.py
.\.stake\venv\Scripts\python.exe scripts/run_math.py
npm.cmd run dev
```

The machine's plain python is 3.10; use the pinned virtual environment. On macOS/Linux use python3.12, .stake/venv/bin/python and npm. Rust is needed only for the optional optimizer, which this prototype does not use.

## Depth betting

Select Easy (100 m), Medium (300 m) or Hard (600 m) beside the bet amount before starting a round. Only these three depths are generated and accepted by the game. Bet and target depth lock during a round and autoplay; animation speed can change during playback. Each depth is a distinct RGS bet mode at cost 1× stake.

| Target | Landing chance | Landing bonus | Maximum payout | RTP |
| --- | ---: | ---: | ---: | ---: |
| 100 m | 50.00% | ×1 | 250× | 96.4% |
| 300 m | 16.67% | ×3 | 750× | 96.4% |
| 600 m | 8.33% | ×6 | 1500× | 96.4% |

Landing chance means probability of any positive return, not profit. Some landings return less than the stake. Greater depth reduces landing probability and increases both the landing bonus and potential payout. Expected gross return stays 96.4% of stake in every mode; short sessions need not resemble RTP. At 600 m the cap is 1,500×, compared with 250× at 100 m.

The generator derives deeper modes by multiplying zero-outcome weight and scaling positive payouts by the depth factor. Positive route shapes remain independent variants. All integer lookup weights are validated using exact rational arithmetic. Changing depth does not influence an already-started result.

## Round rules

Start at the surface with 1× collected value. Air bubble +1, treasure +3, gold chest ×2, pearl ×3, bomb ÷2. Mine halving rounds down to 0.01×. If a bomb takes the collected value to zero in open water, the round stops at that collision and returns zero. If the zeroing bomb is within 12 real metres of the seabed, the downward motion continues to an explicit zero-value ground contact. No pickups occur after zero, and landing cannot turn a loss into a win.

A positive outcome must reach the chosen seabed with value remaining. Only then is the depth bonus applied to the collected multiplier: ×1 at 100 m through ×10 at 1,000 m. Ground contact and its bonus are explicit validated events, followed by the final payout. The frontend cannot change live outcomes.

Payout is selected before the exact route is generated. The regular raw positive multipliers follow the existing logarithmic quantile model, plus an explicit rare cap. Paths mix random encounters, short/medium/long gaps and short bomb clusters. Opaque off-path props use the same supplied assets and circular glows but never affect payout; they remain clear of the swept submarine hull using an 7.2 m physical margin, rather than a depth-scaled empty corridor.

Depth changes the world: every metre has the same vertical scale, so a 1,000 m seabed is ten times farther below the surface than a 100 m seabed. The submarine starts at its original screen height. A damped camera with a viewing window follows it downward and stops near the floor for the final approach; scenery, depth ticks, pickups and the historical wake share that camera offset.

Flight uses a deterministic gravity-and-water-drag simulation with item-specific velocity impulses. Pickups always reverse vertical motion upward; bombs always send it downward. Contact spacing leaves time for a pickup rise to crest and begin falling before the next hit, with at least 4% of scene height of visible lift. The vertical world scale is 1.2% of scene height per metre. The simulator discovers contact depths from the current position and momentum; the frontend never steers toward the next item or flattens the trajectory there. Books store physical contact times, outgoing velocities and one constant forward speed. A globally chosen speed is retried if the encounter schedule would hit the floor too soon. A constant replay time scale caps visual forward speed at 350 scene units per second before the player speed setting, so dense Easy books cannot rush past in two seconds. Positive routes finish with an unpowered descent until the simulated hull reaches the bottom. Both languages verify the same equations and impacts.

The payout-first contract remains: the weighted outcome selects a valid encounter sequence, then physics builds its presentation. Physics does not replace the published RGS payout distribution. Upload the new frontend and math together; old books do not carry the required physics state.

Flight uses one continuous animation clock with smooth live speed changes. The water wake follows recent world positions and bends through climbs and dives. Slow/Normal/Fast/Turbo duration factors are 2.25/1.35/0.65/0.24. Reduced-motion preferences disable decorative animation.

## Build, verify and upload

```powershell
.\.stake\venv\Scripts\python.exe scripts/run_math.py
npm.cmd run test:impacts
npm.cmd run test:routes
npm.cmd run test:rgs
npm.cmd run test:platform
npm.cmd run test:playback
npm.cmd run test:wake
npm.cmd run check
npm.cmd run build
```

Upload the current frontend and math together: older one-mode math does not support depth selection or the current zero-loss endings.

- Frontend: contents of frontend/dist/ directly at the upload root.
- Math: index.json and every referenced books_*.jsonl.zst / lookUpTable_*_0.csv from math/games/deep_dive/library/publish_files/, directly at the upload root (7 files for three modes).
- The supplied upload ZIPs contain root files, with no source code, Python SDK or node_modules. Extract/select their contents if Studio requires individual files.

Nothing is published automatically. Live operator verification requires a provider-issued launch URL. Local RGS tests use the real pinned client with mocked responses and place no external bets.

## Architecture and configuration

config/game.json controls base RTP, raw cap, logarithmic distribution, route variety and supported depths. math/games/deep_dive/depths.py derives the three probability tables and landing bonuses. game_config.py maps them to official BetMode objects; gamestate.py emits the selected mode's events; route.py builds exact paths. run.py uses official create_books / generate_configs and writes weights before hash generation. scripts/run_math.py removes obsolete mode files, stages code into the SDK's games/deep_dive layout, checks all modes, then exports library files and demo fixtures. Edit math/games/deep_dive, not the staged copy in .stake.

frontend/public/math-model.json contains per-depth odds, caps and generated outcomes. Demo books are split by mode and loaded only when needed. frontend/src/lib/books.ts validates first-zero stops, near-bottom zero landings and the landing bonus. session.ts sends the chosen mode using the documented Play({amount, mode}) call. App.svelte handles depth selection, event playback and settlement; Ocean.svelte renders the scene and wake.

Mode IDs are base for 100 m, depth_300 for 300 m and depth_600 for 600 m. Removed depth modes are rejected. An active authenticated round restores its depth from validated launch metadata and checks it against round.mode. Authenticate(), Play() and EndRound() remain the official SDK calls. Wallet units are 1,000,000 per currency unit; event multipliers use hundredths. Partial launch parameters fail rather than silently falling back to demo.

SDK pins: Python math-sdk a6dccd86de740cc5d318079483cb6204cc5c19bc; TypeScript stake-engine 0.1.32. Provider number 0 remains a placeholder. The simplest official fifty_fifty and Svelte/Vite examples were used instead of the optional larger monorepo. See docs/stake-engine-notes.md for the original source review and THIRD_PARTY_NOTICES.md for asset/dependency notices. The user's supplied PNGs and submarine GIF are served locally.

Interface icons use Lucide Svelte (@lucide/svelte 1.57.0), with direct imports for the controls. The icon license ships in licenses/lucide.txt.

Changing difficulty after a settled round resets the camera/scene preview to the new target. The selected seabed depth is displayed beside the odds; the selector itself keeps Easy / Medium / Hard labels.

## Engine platform behavior

The launch adapter accepts bare RGS hosts and full HTTP/HTTPS addresses, preserves the supplied host and path, and falls back to English for unsupported language codes. An unfinished round restores its original play amount. Space starts the same action as the main control, subject to availability and regional settings.

Amounts preserve significant micro-units, including sub-cent returns. USD, EUR, CAD, MXN, JPY and SC/GC formatting share one formatter. Social launches use neutral wording throughout the interface, rules, errors and replay.

Replay links use `replay=true&game=deep_dive&version=…&mode=…&event=…&rgs_url=…`; optional `amount`, `currency`, `lang`, `device` and `social` parameters are supported. Replay fetches the recorded event without creating a wallet session, displays the base amount and total cost, and supports repeat playback.

See [the Engine fixes and verification record](docs/engine-approval-fixes.md) for the addressed guideline IDs, local evidence and remaining operator/human checks.
