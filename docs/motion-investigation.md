# Deep Dive motion investigation — REA

## Production migration — October 16, 2026

Production now generates and plays physics version 3 books. The browser and Python adapter use the recovered fixed-tick gravity, falling-speed cap, common pickup impulse, rocket momentum and height-dependent upward limit. Launch is downward (+78) at the top of a 6,000-unit field; native height maps to the chosen 100/300/600 m display depth. Contact times are whole ticks, with no steering toward future items. Every round, including a zero-value round, coasts to its first seabed contact and then brakes over 39 ticks. Horizontal distance during braking uses the native sum of decreasing velocities rather than a per-contact ease or linear interpolation.

The browser uses the recovered rotation spring (gain .08, damping .7, steep-descent wobble), stepping on the same virtual tick clock. Its target direction is projected through the local ocean's pixel geometry, so the 600 m world and tall layouts do not leave the hull pointing away from its wake. The source `Cs.setPos` method is executed in isolation against that helper for 1,000 native orientation ticks and 400 mapped-geometry ticks. The closed-form vertical helper is also compared directly against reference `Ow.update` with bonuses disabled, across rising, falling and above-terminal launch velocities. Normal playback uses 60 native ticks per second, with the reference default speed rates .5/1/4/10. Render interpolation does not move the contact ticks. Version 2 replay validation remains supported.

Off-path functional scenery now comes from the native twelve-object seeded placement/respawn stream, including rocket conversion and object spacing. Published objects carry spawn/despawn distances; the browser does not reveal future respawns early. Objects crossing the authoritative local hull path are excluded. Cosmetic fish, shells and bottles remain local decoration. All published functional scenery positions and lifecycle distances are verified against the independent browser kernel at every book's field seed.

All 1,017 books were regenerated and pass contact physics, surface/floor bounds, camera, scenery clearance, exact braking, zero-stop rules, arithmetic, payout odds and weighted RTP checks. `scripts/fixtures/payout-contract.json` fingerprints every book ID/payout/weight triple, captured against Git HEAD before the migration. `npm run test:payouts` confirms all triples are unchanged. SDK generation verifies all publish/config hashes and mode lookups. Current route checks count 2,358 climbing pickup contacts and 3,730 climb-interrupting mines.

Browser verification of the final integration: Easy round settled at 100 m with 16/16 contacts and a 1.53× result; Hard round settled at 600 m with 23/23 contacts and a zero result, including a live Slow→Fast change. Recorded p95 frame interval was 16.7 ms for those observed rounds; this is not a general performance guarantee. Browser warning/error capture returned an empty list. The saved `docs/flight-motion-verification.jpg` shows the final curved wake and native-seeded scenery during an Easy round. Mean Normal book duration is 10.14/10.08/9.96 seconds across Easy/Medium/Hard.

**Approved fidelity boundary:** after reviewing the working implementation and the distinction between constrained routes and native collisions, the user explicitly chose **“Finish with payout-constrained paths.”** This resolves the previously open completion criterion. On-path contacts are scheduled by the existing outcome-constrained solver and follow the recovered forces. Native monetary precision, item denominations and carrier-dependent success are not substituted for the user's existing rules. Full unrestricted-field equivalence is not claimed or part of the approved final scope.

Final acceptance audit: production generation and playback both use the recovered forces; native rotation/speed/braking are integrated and tested; functional scenery uses validated native seeded placement and lifetimes; all 1,017 payout/weight/ID triples match the original table; downward launch and seabed landing remain; simulated browser rounds settle correctly with all contacts delivered and no captured warnings or errors. The user-approved constrained-path implementation is complete. The unrestricted seed searches are terminal experiments, not background tasks or dependencies of the result.

The sections below preserve the investigation chronology; their earlier implementation-status statements are superseded by this production migration.

## October 16, 2026 follow-up

### Recovered model and user constraints (later investigation)

The earlier claim that the artifact did not establish game-specific physics is superseded. The public bundle exports `Ow` as `U`; the lazy-loaded `classes-BFBKmJaN.js` imports `U` as `xs` and constructs that model in `FlightGame` (`Ra`). The previously inspected large bundle already contained `Ow`, its field object class `At` and RNG `EA`. A narrow keyword search had missed those minified classes.

Recovered mechanics: launch vertical velocity -78; forward velocity -80; gravity +1 per tick until vertical velocity reaches 60; collectible impulse -40; rocket impulse +20; maximum upward velocity -110 with a height-dependent additional constraint; collision radius 220; twelve independently respawning field objects with seeded positions and spacing rejection; collectible-to-rocket conversion after defined respawn counts; carrier bounds ±1350, wrap -2500→4050, and horizontal braking +2 per tick. Collectibles have additions 1/2/5/10 and multipliers 2/3/4/5; internal multiplier precision is 1/8192. Rocket halving and cap are part of the simulator. These are static source observations, corroborated by isolated execution of only the selected pure model classes, not an observation of a live reference wager.

New REA summary Evidence: `ev_e4e61ab0a3caa8cdca42cc60d62c26a0e8c533a283e8079ecd7453fdad386de9`, parent `ev_2375c257d5a763adc7f736e601bf13197d57ffa329bcd90d66bf4acc001d7e08`. Both files parsed successfully; broad semantic coverage remains partial. Public artifact hashes: index `4c5061157c5a2c483b4ba41816c9bbea53b636a52acc19fd20e71103e97c5ef3`; classes `e08c714411483cd5673d4f9d37a5a956cfd2d2e1f1855b6931aaee80abc4312e`.

Independent implementations now exist in `frontend/src/lib/flight-model.ts` and `math/games/deep_dive/flight_model.py`. `npm run test:reference` compares every scalar and field-object position against the selected reference classes for 707 seeds (including signed/unsigned boundaries and a larger safe-integer seed), covering 220,186 reference ticks, 2,294 contacts, 237 landings and 470 misses. Binary hashes of every tick additionally prove Python/frontend parity for both reference and downward layouts over the tested seeds. A large-seed float-initialization mismatch found by the expanded test was corrected. This is bounded differential evidence plus source review, not exhaustive testing of every possible seed.

The user explicitly chose **keep downward dive and seabed landing**, then **keep every current payout outcome and weight**. Do not replace the payout distribution, RTP, depth odds or caps to make the new native field fit. The downward kernel's sole launch adaptation currently starts y=-6000, vy=+78 rather than the reference's y=0, vy=-78; its other forces and field rules are the same.

`scripts/find_reference_seeds.mjs` performed a bounded search of 1,000,000 downward field seeds. Only 11 of the 98 required base payout values were found; the lowest observed positive payout was 0.50×, while 22 existing required values are below 0.50×. This does **not** prove other seeds cannot produce the missing values. It does establish that directly replacing current books with the tested native field pool cannot preserve the requested table. The saved, resumable search is local under ignored `analysis/aviamasters-reference/seed-search.json`; it is not a live process once the command exits.

**Status at the end of the kernel-only stage (superseded above):** the kernels had not yet been connected to production. This was subsequently completed, with payout preservation and the remaining field-generation difference documented above.

Reference supplied for this pass: https://bgaming.com/games/aviamasters. Its public description establishes randomized encounters, pickup-driven climbs and rocket-driven dives. It does not publish physics coefficients or the path generator. Reinspection of the retained public JavaScript artifact returned the same partial static Evidence `ev_f399af96c9285c717173173c6b7cc059a3874e9c6743a0c40a7cfb073458c22a`, parent `ev_83b8dda8738fd83ba91c35f4ca47ca225f264a339e9c4ef47e116d4ec4929ebf`. Exact reference physics remain unresolved; these changes must not be described as a recovered or verified identical implementation.

The local generator previously delayed every encounter until 250 ms after the previous physical apex. Removed that delay: pickups can now chain during a climb and mines can interrupt upward motion. Surface clearance still follows the analytic gravity/drag solution and the existing depth-limited contact impulse. No gravity, drag, item arithmetic, selection weights or payout targets were changed. This supersedes the earlier requirement that every pickup complete a separate arc before the next contact.

Orientation now uses the rendered pixel-space horizontal and vertical scales, including the hull's depth offset, measured from the live viewport. This fixes tilt distortion between wide and tall layouts while retaining the existing 90 ms orientation damping.

Regenerated all 1,017 books across 100m, 300m and 600m modes. Route checks confirm 809 climbing pickup contacts and 3,523 climb-interrupting mines, exact contact positions and impulses, collision-clear scenery, bounded surface/floor motion and unchanged 96.4% weighted RTP for all modes. Mean baseline playback duration decreased from 18.47/23.19/29.58 seconds to 14.73/19.34/25.72 seconds for Easy/Medium/Hard, before speed-control scaling. Svelte/TypeScript checks, production build, contact/viewport-angle regressions, playback, wake and SDK lifecycle/weighted selection checks pass. Browser verification uses only the local simulated demo; no reference bets were placed.

The historical sections below describe previous passes and may refer to earlier catalogue sizes or superseded motion rules.

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
