# Deep Dive — CZN Studios

Version 0.3: a payout-first, side-scrolling submarine prototype using Svelte 5/TypeScript/Vite, the official Stake Engine TypeScript client and Python Math SDK. Official documentation/source review is recorded in [docs/stake-engine-notes.md](docs/stake-engine-notes.md).

## Run

Dependencies are already installed on this computer. In PowerShell:

```powershell
cd "$env:USERPROFILE\Desktop\czn-deep-dive"
npm.cmd run dev
```

Open the printed local URL (normally http://127.0.0.1:5173/). Without RGS launch parameters, the game runs in clearly marked fun play with 100 demo credits. Reload resets the demo. A preview server may already be running on port 5173.

For a fresh checkout, install Git, Node 22.19+ and Python 3.12, then:

```powershell
npm.cmd --prefix frontend ci
py -3.12 scripts/setup_math.py
.\.stake\venv\Scripts\python.exe scripts/run_math.py
npm.cmd run dev
```

The machine's plain `python` command points to 3.10; use `py -3.12`. No environment activation or global Python package install is needed. On macOS/Linux, substitute `python3.12`, `.stake/venv/bin/python`, and `npm`. Rust/Cargo is needed only when adding the optional official optimizer; this starter does not optimize.

## Mechanics and payout-first routes

A round starts at **1×**. The camera tracks horizontally; the ocean's foreground, rocks and light layers scroll at different speeds. Encounter positions are part of the math event book.

| Encounter | Value effect | Movement |
| --- | --- | --- |
| Air bubble | +1× | Bounce upward |
| Treasure | +3× | Bounce upward |
| Gold chest | ×2 | Bounce upward |
| Pearl | ×3 | Bounce upward |
| Naval mine | ÷2 | Dive downward |
| Wreck / seabed | Final value | Finish on ground contact |

Values use integer hundredths: 100 means 1×. Each mine halves the current value and **rounds down to 0.01×**. For example, 1.87× becomes 0.93×; 0.01× becomes 0×. This makes zero reachable through actual mine effects, with no hidden final override.

The math module selects a payout from the configured catalogue **before generating its route**. It creates a rewarding opening with all four positive mechanics, then searches for an exact sequence of encounters. A zero target gets a mine-heavy ending until value naturally reaches zero. The final route point is ground contact (depth 100); winning routes reach the wreck there. No earlier point reaches the seabed. Motion between positive contacts contains an upward arc; mine hits cause descent. Settlement and the final result wait for the ground-contact animation to complete.

The frontend never chooses live payouts or rewrites server events. Stake Engine selects one precomputed book before playback. In local demo, a book is chosen before its animation starts. The word “payout-first” describes the math generation order, not client-side live game math.

## Prototype payout distribution

There are 100 equally weighted books:

| Payout | Books |
| --- | ---: |
| 0× | 60 |
| 0.5× | 8 |
| 1× | 8 |
| 2× | 10 |
| 3× | 8 |
| 5× | 4 |
| 10× | 2 |

Exact weighted RTP is 96%, maximum final payout is 10×. Collected value can temporarily exceed the final payout before mines. This is still a small demonstration model, not completed or certified casino math.

## Verify, build and upload

```powershell
.\.stake\venv\Scripts\python.exe scripts/run_math.py
npm.cmd run test:routes
npm.cmd run test:rgs
npm.cmd run check
npm.cmd run build
```

The math runner verifies payout-table/book IDs, weights, every arithmetic transition, final win, event order, ground termination and RTP. The frontend route check cross-validates all 100 Python books, bounce arcs, natural zero outcomes and absence of premature ground contact. The RGS check uses the actual pinned client with mocked responses; it places no external bets.

**Version 0.2 requires replacing both frontend and math together.** Older v0.1 event books lack distance and do not match the new mechanics.

- Frontend: upload the contents of `frontend/dist/` (index.html, assets and fixtures) at the upload root.
- Math: upload only `index.json`, `books_base.jsonl.zst` and `lookUpTable_base_0.csv` from `math/games/deep_dive/library/publish_files/`, at the upload root.
- Both supplied upload ZIPs contain their files directly at the root. Extract/select their contents if Studio does not accept ZIPs directly. Do not upload source code or node_modules.

Nothing has been uploaded or published automatically. Live RGS testing still requires an authorized Stake Engine launch URL.

## Architecture

```text
config/game.json                 Prototype identity, outcome catalogue, RTP/cap
math/games/deep_dive/
  game_config.py                Official Config/BetMode/Distribution setup
  route.py                      Payout-first route search and encounter effects
  gamestate.py                  SDK event books and final-win accounting
  run.py                        Official simulation/config workflow
  library/publish_files/        Generated RGS math trio
frontend/src/
  App.svelte                    Round lifecycle and event playback
  lib/books.ts                  Typed contract and arithmetic validation
  lib/flight.ts                 Exact route interpolation and bounce arcs
  lib/Ocean.svelte               Scrolling scene and seabed geometry
  lib/Pickup.svelte              Original collectible/mine SVGs
  lib/AnimatedSub.svelte         User-supplied GIF decoding/masking
  lib/session.ts                Official RGS adapter and local demo
frontend/public/                Local sprites, generated books and math config
scripts/                        Setup, generation and verification
.stake/                         Pinned SDK checkout + Python venv (ignored)
```

The SDK requires `games/<id>/` inside its own checkout. The runner stages source there, runs it, then copies output back; edit `math/games/deep_dive/`, not `.stake/`. The SDK normally preserves an existing final weight table; our unoptimized runner invalidates its old copied table before regeneration so new books cannot accidentally use stale payouts. Generated SDK frontend/backend/optimization configs remain in `library/configs/`.

`config/game.json` is CZN's own configuration, not an invented Stake Engine deployment API. Provider number 0 is a placeholder. The official SDK is pinned to a6dccd86de740cc5d318079483cb6204cc5c19bc; `stake-engine` is pinned to 0.1.32. npm and Python dependency locks are included. The simple official fifty_fifty + Svelte/Vite walkthrough was selected instead of the larger optional Pixi/Svelte/Turbo/Storybook monorepo.

## RGS integration

A provider-issued launch URL supplies `sessionID`, `rgs_url`, `lang` and `device`. The pinned client expects rgs_url as a host without a protocol prefix and uses HTTPS. Authentication supplies integer bet levels and authoritative balance. Wallet amounts use 1,000,000 units per currency unit, independently of math multipliers' scale of 100.

The documented client methods are Authenticate(), Play({amount, mode: 'base'}), and EndRound(). Events arrive in round.state. An active recovered round replays from its beginning; after ground contact, EndRound is called only if round.active remains true. Auto-closed rounds receive no extra close call. Partial launch parameters fail visibly instead of falling back to demo. API/network failures block new bets until reload/authentication.

Autoplay is bounded to 10/25/50 rounds and can stop after the current dive. Speed controls affect playback only. Autoplay/turbo follow the session's jurisdiction flags. Non-zero minimumRoundDuration is rejected pending confirmation of its publicly undocumented unit. Complete jurisdiction displays, localization, checkpoint recovery and operator controls remain future production work.

## Animated sprite

The user-supplied GIF is stored locally in assets/submarine-scene.gif. Pinned gifuct-js 2.1.2 decodes its 28 frames. A source-specific canvas mask removes edge-connected cave/water pixels while retaining enclosed portholes and the submarine. First 17 frames provide ordinary animation; the explosion sequence is used only for a zero-payout ground finish, not a mine that merely halves value. Reduced motion freezes sprite animation. The earlier PNG is a loading/error fallback. No runtime requests go to Envato/Trello. Source GIF bytes are preserved.


## Version 0.3 — scattered ocean field

Real encounter gaps are randomized to 52–80 metres (previously 23–34); final approach is 65 metres. Travel duration scales with the gap so the submarine has room to move between collisions. Each book contains at least 60 randomly placed, scaled and rotated scenery objects in its launch event, including uncollected reward/mine icons plus harmless fish, shells and bottles. Objects fill the water above and below the route, scroll with the world and remain visible at the end. Reward/mine scenery is excluded from a swept hull-sized safety corridor; neutral scenery sits in the background and has no collision effect. All scenery is deterministic per book for replay/reconnect, and never changes value or adds payout-bearing events. Outcome frequencies and 96% RTP remain unchanged. Republish the refreshed math and frontend together to receive the new field data.