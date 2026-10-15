# Engine approval fixes — 15 October 2026

All 20 findings previously marked FAIL have been addressed in the source and checked locally. Updated assessment: **32 PASS · 0 FAIL · 2 AT RISK · 5 NEEDS A HUMAN · 2 N/A**. These are local self-check verdicts, not Engine approval.

The review follows [Engine's supplied checklist](https://studio.engine.io/docs-content/prompt.md). Svelte 5 / TypeScript / Vite, pinned `stake-engine@0.1.32`, and the existing three published math modes are retained. No payout distribution was changed for these fixes. The player-facing title is now **Trenchbound Relay**; the internal game ID remains `deep_dive` for compatible launches and replay URLs.

## Verification performed

- `npm run check`: zero errors and warnings. `npm run build`: passed.
- `test:platform`, `test:rgs`, `test:routes`, `test:impacts`, `test:playback`, and `test:wake`: passed. Route verification covers all 1,017 real fixture books across Easy, Medium and Hard.
- Browser at `http://127.0.0.1:5180/`, with the supplied SDK talking to a local fixture RGS at `http://127.0.0.1:5188`. Only local simulated sessions were used. Helpers, screenshots and request logs are outside the repository at `C:/Users/gaeta/AppData/Local/Temp/engine-fixes-20261015/`.
- Local authentication returned the altered range 0.05–0.20, default 0.10. Space sent the selected amount `150000` and mode `base`; the returned 0.01× outcome displayed **$0.0015** and settled once.
- With session `USD-zero`, the UI showed **“Your balance is too low for this play amount.”**, disabled Start dive, and Space sent no play request.
- With session `USD-active`, authentication supplied an unfinished 0.15 round against a default of 0.10. Completion retained **$0.15**, and the next request sent `amount: 150000`.
- `XSC-win-social` and `XGC-win-social` each authenticated, played and settled a real fixture. Both showed 0.10 SC/GC and the exact 0.001 SC/GC return, without dollar symbols. Main result, amount picker, autoplay confirmation, Settings and rules were checked for restricted words; none found.
- Replay URL: `http://127.0.0.1:5180/?replay=true&game=deep_dive&version=3&mode=depth_600&event=win&rgs_url=http%3A%2F%2F127.0.0.1%3A5188&currency=XSC&amount=50000&social=true&lang=zz`. At 400×225 it displayed **“Play amount: 0.05 SC”**, **“Cost multiplier: 1× · Total play: 0.05 SC”**, then **0.003 SC / 0.06×**. Play again completed the same event twice. The local log contained replay GETs and no wallet requests during replay.
- Main controls were measured inside 1024×576, 400×225, 800×450 and 425×812; the document did not scroll. Small-popout result bounds ended above the controls. Screenshot evidence includes `play-400x225.png`, `play-800x450.png`, `play-425x812.png`, `laptop.png`, `rules-400x225.png` and `replay-400x225.png` in the temporary folder.
- Automated replay tests use actual loss, positive-return and maximum-win fixture books in every mode, plus invalid/missing optional amounts, fetch errors and a 100× cost example. These supplement the browser replay check; they do not claim every recorded round was watched manually.

## Full checklist

Paths below are relative to the repository. Line numbers refer to the current source.

| ID | Guideline | Verdict | Evidence / resulting behavior |
| --- | --- | --- | --- |
| 181 | Authenticates on launch | PASS | `frontend/src/lib/platform.ts:31`, `frontend/src/lib/session.ts:41`: normalize host/scheme/path and pass the supplied destination to the SDK. Local POST authenticate succeeded. |
| 274 | Invalid RGS fails clearly | PASS | `frontend/src/lib/session.ts:42` bounds wallet requests to 15 seconds; `frontend/src/App.svelte:246` shows a recovery error. No fallback host or demo fallback for partial live launches. |
| 183 | Successful live play | AT RISK | Local SDK play/settlement succeeded, including real book playback. A provider-issued Studio session is still required to confirm the deployed RGS, CORS and credentials. |
| 275 | No old branded loader | PASS | `frontend/src/App.svelte:298` uses neutral loading text. No player-visible Stake Engine loader; package names remain internal. |
| 213 | Unique, unrestricted title | PASS | `frontend/src/lib/platform.ts:3`, `frontend/index.html:6`: “Trenchbound Relay” throughout the UI and metadata. No restricted title terms; the exact-title web check found no matching game. This is not trademark clearance. |
| 217 | Appropriate content | NEEDS A HUMAN | Review all supplied art and animation at full size; confirm no inappropriate content or imagery of minors. |
| 253 | Distinct presentation | NEEDS A HUMAN | Compare the new title, tile/logo, submarine, symbols, theme, mechanic and overall presentation with existing games. Naming alone does not settle this. |
| 242 | Dynamic play levels | PASS | `frontend/src/App.svelte:241`, `frontend/src/App.svelte:205`, `frontend/src/lib/session.ts:41`: SDK authentication/config supplies levels; arrows and picker use those levels. Altered mock range/default loaded correctly. |
| 187 | Active amount restored | PASS | `frontend/src/lib/platform.ts:83`, `frontend/src/App.svelte:242`: use active `round.amount`, retain it after presentation. Browser next-play request verified 150000 against a default of 100000. |
| 219 | All required currencies | AT RISK | `frontend/src/lib/platform.ts:17` and `scripts/check_platform.mjs:7` verify USD/EUR/CAD/MXN/JPY/SC/GC/XEC formats. USD, SC and GC were played in-browser. Complete EUR/CAD/MXN/JPY play, modal and long-amount checks with operator sessions. |
| 273 | Sub-cent display | PASS | `frontend/src/lib/platform.ts:17` retains significant micro-units. Browser showed $0.0015; tests cover values down to one micro-unit and fractional JPY. |
| 221 | No settlement on closed zero rounds | PASS | `frontend/src/App.svelte:143` settles only active live rounds. `frontend/src/lib/session.ts:80` closes zero demo rounds immediately. SDK/demo lifecycle tests pass. |
| 222 | Insufficient balance | PASS | `frontend/src/App.svelte:54`, `frontend/src/App.svelte:150`, `frontend/src/App.svelte:181`, `frontend/src/App.svelte:288`: shared pre-play guard and visible explanation. Zero-balance keyboard check sent no play. All actual modes cost 1×. |
| 228 | Space shortcut | PASS | `frontend/src/App.svelte:173`, `frontend/src/App.svelte:254`: window listener, default prevention, repeat/menu/focus/busy/autoplay/replay/regional guards; routes through the same action. Browser request verified. |
| 227 | No main-frame scrolling | PASS | `frontend/src/app.css:36`: viewport-sized document/app/game, hidden outer overflow. Measurements match all four required viewport sizes. Dialogs scroll internally. |
| 104 | Autoplay confirmation | PASS | `frontend/src/App.svelte:294`, `frontend/src/App.svelte:313`: first press opens a choice of 10, 25 or 50 dives. Opening the menu did not start play. |
| 31 | High-cost confirmation | N/A | `math/games/deep_dive/library/publish_files/index.json:2`: all three modes cost 1×; no purchase/feature activation control. |
| 107 | All sound muted | NEEDS A HUMAN | `frontend/src/App.svelte:57`–`77`: all oscillators now pass through one master gain, including already-running tones. Listen while muting from both controls during collection and result playback. |
| 25 | RTP and maximum per mode | PASS | `frontend/src/App.svelte:320`: rules table states 96.4% in every mode and 250×/750×/1500× caps, matching lookup validation. |
| 24 | Every symbol described | PASS | `frontend/src/App.svelte:316`: bubble +1, treasure +3, chest ×2, pearl ×3, mine ÷2 with downward 0.01× rounding. Shared across modes. |
| 26 | Win conditions explained | PASS | `frontend/src/App.svelte:317`: encounter order, positive seabed contact, depth bonus, amount × multiplier, below-amount returns, zero stops and decorative objects explained. |
| 27 | Every mode and cost | PASS | `frontend/src/App.svelte:319`–`321`: Easy/Medium/Hard, depths, landing bonuses, costs and changed odds described. All state 1× as in the published index. |
| 29 | Free games / retriggers | N/A | No free-game feature in the index or book contract; rules explicitly say there are no free games or retriggers (`frontend/src/App.svelte:317`). |
| 235 | Every control explained | PASS | `frontend/src/App.svelte:322`–`329`: amount picker/arrows, difficulty, Space, autoplay/stop, four speeds, speaker/settings, sliders/reset, rules/close/Escape/reconnect and replay/repeat covered. |
| 185 | General disclaimer | PASS | `frontend/src/App.svelte:332`: malfunction, connectivity/recovery, long-run return, illustrative display, server settlement and “TM and © 2026 Engine.” |
| 266 | Displayed chances accurate | PASS | `frontend/src/App.svelte:321` and route/lookup checks: positive-return probabilities 50%, approximately 16.67%, approximately 8.33%. Rules distinguish positive return from profit. |
| 193 | Laptop 1024×576 | NEEDS A HUMAN | Local controls fit and a round was placed. Inspect the saved laptop view and final presentation/readability on a real laptop. |
| 195 | Both popouts | PASS | `frontend/src/app.css:104`: compact layout removes old minimum-height overflow. Controls fit 400×225 and 800×450; small-popout result and rules checked. |
| 194 | Mobile 425×812 | NEEDS A HUMAN | Viewport layout fits; saved mobile view available. Confirm real touch operation, browser chrome, readability and rotation on an actual phone. |
| 223 | Mobile double-tap zoom | PASS | `frontend/index.html:5` sets maximum-scale/user-scalable; `frontend/src/app.css:40` sets manipulation touch behavior on the game surface. |
| 239 | English | PASS | `frontend/src/App.svelte:227`: English document language; all shipped UI/rules/error text is English. Local snapshots contained no unresolved keys. |
| 240 | Unsupported languages | PASS | `frontend/src/lib/platform.ts:48`: SDK language normalized to English; `lang=zz` local social/replay launches loaded with English text. |
| 77 | Social wording throughout | PASS | `frontend/src/App.svelte:285`, `frontend/src/App.svelte:303`–`332`, `frontend/src/lib/platform.ts:53`: “TOTAL PLAY”, “Increase play amount”, neutral rules and errors. Browser result/picker/autoplay/settings/rules scans found no restricted words. |
| 78 | SC and GC amounts | PASS | `frontend/src/lib/platform.ts:24`: suffix SC/GC, no dollar symbol; both local sessions loaded, played and settled with exact amounts. |
| 225 | Social mode names | PASS | `frontend/src/App.svelte:38`, `frontend/src/lib/platform.ts:68`: consistent Easy, Medium, Hard, including rules and replay. |
| 188 | Social replay text | PASS | `frontend/src/App.svelte:283`: neutral “Play amount”, “Cost multiplier”, “Total play”; Hard replay and result showed SC without restricted terms. |
| 171 | Replay loads and plays | PASS | `frontend/src/lib/platform.ts:63`, `frontend/src/App.svelte:228`: GET replay before any session construction; validated recorded events, Start replay, retained result, hidden wallet controls, error state. Local repeat run generated no wallet calls. |
| 172 | Replay optional parameters | PASS | `frontend/src/lib/platform.ts:75`: applies amount/token; safe defaults for invalid amounts, English fallback. Browser showed original 0.05 SC. Automated EUR 5.00 and invalid values verified. |
| 173 | Replay again | PASS | `frontend/src/App.svelte:166`, `frontend/src/App.svelte:292`: reuses the same fetched round. Browser watched the Hard event twice successfully. |
| 174 | Replay cost | PASS | `frontend/src/App.svelte:283`: shows base amount, cost multiplier and multiplied total. Automated 100× fixture verifies 0.05 GC → 5.00 GC. Actual game modes all cost 1×. |
| 243 | Small-popout replay | PASS | `frontend/src/app.css:128`: replay controls/metadata fit 400×225. Screenshot shows completed 0.003 SC event and reachable Play again control. |

## Remaining checks before submission

1. Use a provider-issued launch to confirm the deployed wallet and replay endpoints and finish the five-currency runtime matrix. No live provider session was available here.
2. A person should review all artwork/content, similarity to existing titles, audible mute behavior, laptop readability and physical-phone touch behavior as specified above.
3. Upload the newly built `frontend/dist/` together with its matching existing three-mode math files. Existing upload archives, if any, should be regenerated from these current outputs. Nothing was published or submitted by this task.
