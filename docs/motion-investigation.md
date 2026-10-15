# Deep Dive motion investigation — REA

## Scope

Improve continuous flight, readable losing routes and round transitions using the supplied reference https://aviamastersgame.uk/ and Deep Dive's own source. Preserve configured payout weights and exact pickup arithmetic. Current local RTP was already 96.4% when this work began; it has been preserved. Maximum payout remains 250×.

## Evidence and boundaries

| Question | Evidence | Conclusion |
| --- | --- | --- |
| What does the supplied page launch? | REA controlled browser capture ev_f91a354723d1a229b571b3a0da0a0a8ce1f86196c236c3f4eb717558a0cb494a | Observed page includes an empty game-frame and a demo handler targeting https://bgaming-network.com/play/Aviamasters/FUN?server=demo. The marketing page itself is not the game engine. |
| Which public game artifact is loaded? | REA capture ev_d1f1f1525399039e7d2070acf070e83b89bb03a8330ff1a90d7c583f5ef05840 | Demo shell loaded public module https://cdn.bgaming-network.com/html/Aviamasters/assets/index-CPSOXDt6.js. No reference bets were placed. |
| What static analysis was performed? | REA parent ev_83b8dda8738fd83ba91c35f4ca47ca225f264a339e9c4ef47e116d4ec4929ebf; summary ev_f399af96c9285c717173173c6b7cc059a3874e9c6743a0c40a7cfb073458c22a | One 749,540-byte JavaScript file parsed; no parse failures. Semantic coverage is partial, including graph limits and 45,503 unknowns. The public minified bundle includes shared sprite/ticker machinery; it does not establish the exact game-specific physics. |
| What caused Deep Dive's mechanical feel? | Direct local source review: App.svelte moveTo/present, flight.ts, route.py | Separate per-encounter animation clocks changed horizontal speed at each contact. Pitch jumped to 28 degrees on mines. Long consecutive mine endings were predictable. These are local source findings, not claims about Aviamasters. |

Public bundle SHA-256: 4c5061157c5a2c483b4ba41816c9bbea53b636a52acc19fd20e71103e97c5ef3

Raw demo launch URLs and session tokens are intentionally omitted. REA browser launches used temporary owned profiles and reported cleanup. Static analysis did not execute the downloaded artifact. Exact Aviamasters physics, undisclosed probabilities and real-money runtime behavior remain unknown. Our implementation is original, not recovered proprietary code.

## Implemented changes

- One animation clock and shared world distance for the entire route; no per-pickup promise/clock restart.
- Smooth launch and braking, C1 vertical curves, actual trajectory-based pitch and 90 ms orientation damping.
- Exact upward pickup arcs and opposite mine arcs retained; ground contact remains the only finish.
- Varied three-to-five-item openings with bounded value; losing routes use two-to-four-mine clusters with real chest recoveries. No arithmetic or final payout override.
- Normal duration 7.5–14 seconds, scaled by existing speed controls. Varying routes remain deterministic for reconnect/replay.
- Submarine remains visible on a loss; short scene fade handles launch reset. Partial returns no longer use a positive settlement sound.
- Rules display the generated RTP and cap automatically; decorative objects remain outside the swept path.

## Verification

147 generated books pass exact arithmetic, configured weighted RTP, maximum payout, scenery clearance, endpoint velocity, continuous timeline, mine-streak and seabed checks. All 100,000 selection tickets and the official SDK lifecycle adapter pass local tests. Svelte/TypeScript and production build checks pass. Live operator RGS testing remains outside this local verification. Browser observations and measured frame timing are recorded in the accompanying verification report; no universal frame-rate guarantee is claimed.
