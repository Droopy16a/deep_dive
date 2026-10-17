<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { Balance, Round, JurisdictionFlags } from 'stake-engine';
  import { GAME_TITLE, formatAmount, launchCurrency, initialBet, loadReplay, sessionError, type ReplayData } from './lib/platform';
  import { createSession, modeForDepth, type GameSession } from './lib/session';
  import { readEvents, itemLabels, type DiveStep } from './lib/books';
  import { sampleFlight, flightDuration, flightPitch, type FlightView } from './lib/flight';
  import { followCamera } from './lib/camera';
  import { createPlaybackClock } from './lib/playback';
  import { createFlightOrientation } from './lib/flight-model';
  import Icon from './lib/Icon.svelte';
  import Ocean from './lib/Ocean.svelte';
  import type { WakeSample } from './lib/wake';
  import Pickup from './lib/Pickup.svelte';
  // import GameWordmark from './lib/GameWordmark.svelte';

  const launchParams = new URL(window.location.href).searchParams;
  const replay = launchParams.get('replay') === 'true';
  let social = $state(launchParams.get('social') === 'true' || ['XSC', 'XGC', 'XEC'].includes(launchParams.get('currency') ?? ''));
  let replayData = $state<ReplayData | null>(null);
  let session: GameSession;
  let demo = $state(true), ready = $state(false), busy = $state(false), blocked = $state(false);
  let balance = $state<Balance>({ amount: 0, currency: launchCurrency(launchParams) });
  let bet = $state(1_000_000), levels = $state<number[]>([]);
  let progress = $state(0), distance = $state(0), pitch = $state(0), grounded = $state(false), multiplier = $state(1), lastWin = $state(0);
  let status = $state('Preparing your dive'), error = $state('');
  let encounter = $state(''), encounterKey = $state(0), lost = $state(false), completed = $state(false);
  let modal = $state<'settings' | 'bet' | 'auto' | 'rules' | null>(null);
  let speed = $state(1), sound = $state(false), playSize = $state(1), playOpacity = $state(1);
  let autoRemaining = $state(0), autoRunning = false;
  let flags = $state<JurisdictionFlags | null>(null);
  let routeSteps = $state<DiveStep[]>([]);
  let wake = $state<WakeSample[]>([]);
  // Field lifetimes control respawning, not visibility: retain old props until offscreen.
  const offPathItems = $derived((routeSteps[0]?.scenery ?? []).filter(object =>
    ['bubble', 'treasure', 'chest', 'pearl', 'mine'].includes(object.item)));
  type DepthMode = {mode:string;depth:number;landingBonus:number;rtp:number;maxWin:number;winProbability:number};
  let selectedDepth = $state(100), roundDepth = $state(100);
  let depthModes = $state<DepthMode[]>([]);
  const difficulties = [{depth:100,label:'Easy'}, {depth:300,label:'Medium'}, {depth:600,label:'Hard'}];
  const displayDepth = $derived(busy || completed ? roundDepth : selectedDepth);
  const selectedMode = $derived(depthModes.find(mode => mode.depth === selectedDepth));
  let disposed = false;
  let launching = $state(false);
  let audio: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  const speeds = [ { label: 'Slow', icon: 'turtle', delay: 1100 }, { label: 'Normal', icon: 'walk', delay: 700 },
    { label: 'Fast', icon: 'fast', delay: 350 }, { label: 'Turbo', icon: 'bolt', delay: 160 } ];
  let camera = $state(0);
  let flightView:FlightView = {width:1200,height:740,subWidth:340};
  const subTop = (depth: number) => `calc(${(.364 + depth * displayDepth / 100 * .012 - camera) * 100}% - var(--sub-width) * ${depth / 100 * 46 / 420})`;
  const depthTicks = $derived(Array.from({length: Math.floor(displayDepth / (displayDepth <= 200 ? 25 : 50)) + 1}, (_, i) => {
    const metres = i * (displayDepth <= 200 ? 25 : 50);
    return {metres, top: (.364 + metres * .012 - camera) * 100};
  }).filter(tick => tick.top >= 15 && tick.top <= 86));
  const money = (amount: number) => formatAmount(amount, balance.currency);
  const speedAllowed = (index: number) => index < 2 || (index === 2 ? !flags?.disabledTurbo : !flags?.disabledSuperTurbo);
  const canPlay = $derived(!replay && ready && !busy && !blocked && balance.amount >= bet);
  const insufficient = $derived(!replay && ready && !blocked && !busy && balance.amount < bet);
  const shakeIntensity = $derived(busy && !completed ? Math.pow(Math.max(0, Math.min(1, (multiplier - 1) / 249)), 1.3) : 0);

  function toggleSound() {
    sound = !sound;
    if (masterGain && audio) masterGain.gain.setValueAtTime(sound ? 1 : 0, audio.currentTime);
    if (sound) tone();
  }

  function tone(win = false) {
    if (!sound) return;
    try {
      audio ??= new AudioContext();
      if (!masterGain) { masterGain = audio.createGain(); masterGain.connect(audio.destination); }
      masterGain.gain.setValueAtTime(1, audio.currentTime);
      void audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(win ? 660 : 260, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(win ? 990 : 180, audio.currentTime + .18);
      gain.gain.setValueAtTime(.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .2);
      oscillator.connect(gain); gain.connect(masterGain);
      oscillator.start(); oscillator.stop(audio.currentTime + .21);
    } catch { /* Sound is optional; unsupported audio cannot interrupt settlement. */ }
  }
  function playRoute(steps: DiveStep[]) {
    const duration = flightDuration(steps);
    const clock = createPlaybackClock(duration, speed, steps[0].physics!.version===3);
    const native=steps[0].physics!.version===3, orientation=createFlightOrientation();
    let orientationPitch=0;
    const started = performance.now();
    let previousTime = started, nextEvent = 0;
    const timings: number[] = [];
    const history: WakeSample[] = [];
    return new Promise<void>((resolve, reject) => {
      function frame(now: number) {
        if (disposed) { reject(new Error('Playback interrupted')); return; }
        const clockFrame = clock.advance(Math.max(0, now - previousTime), speed);
        const elapsed = clockFrame.end;
        const position = sampleFlight(steps, elapsed, duration);
        progress = position.depth; distance = position.distance; grounded = position.grounded;
        camera = followCamera(camera, progress, roundDepth, now - previousTime);
        if (import.meta.env.DEV && now > previousTime) timings.push(now - previousTime);
        const orientationSamples=new Map<number,number>([[Math.floor(clockFrame.start*.06),orientationPitch]]);
        if(native) {
          orientationPitch=orientation.advanceTo(Math.floor(elapsed*.06),tick=>sampleFlight(steps,tick*1000/60,duration).nativeVelocity,
            (tick,value)=>orientationSamples.set(tick,value),tick=>flightPitch(sampleFlight(steps,tick*1000/60,duration).velocity,
              120,roundDepth,flightView,false)*Math.PI/180);
          pitch=orientationPitch;
        } else {
          const targetPitch = flightPitch(position.velocity, steps[0].physics!.horizontalSpeed, roundDepth, flightView);
          pitch += (targetPitch - pitch) * (1 - Math.exp(-(now - previousTime) / 90));
        }
        // Fill missed samples when a background tab throttles animation frames.
        // This keeps the curved wake intact rather than reducing it to a dot.
        for (let time = Math.max(previousTime, now - 1400) + 33; time < now - 16; time += 33) {
          const previous = sampleFlight(steps, clockFrame.at(time - previousTime), duration);
          history.push({distance: previous.distance, depth: previous.depth,
            pitch: native ? orientationSamples.get(Math.floor(clockFrame.at(time-previousTime)*.06))??orientationPitch : flightPitch(previous.velocity, steps[0].physics!.horizontalSpeed, roundDepth, flightView), time});
        }
        previousTime = now;
        history.push({distance, depth: progress, pitch, time: now});
        while (history.length && (history.length > 128 || history[0].distance < distance - 100 || history[0].time < now - 1400)) history.shift();
        wake = [...history];
        while (nextEvent < steps.length && steps[nextEvent].distance <= distance + 1e-7) {
          const event = steps[nextEvent++];
          multiplier = event.multiplier / 100;
          encounter = itemLabels[event.item]; encounterKey++;
          status = event.item === 'mine' ? 'Mine hit · value halved' : itemLabels[event.item];
          if (['bubble','treasure','chest','pearl'].includes(event.item)) tone(true);
          if (event.item === 'mine') tone(false);
        }
        if (elapsed >= duration) {
          const end = steps.at(-1)!;
          progress = end.depth; grounded = end.item === 'ground'; pitch = grounded ? 0 : pitch;
          if (import.meta.env.DEV && timings.length) {
            const sorted = [...timings].sort((a,b) => a-b);
            console.debug('Trenchbound Relay motion', JSON.stringify({frames: timings.length,
              durationMs: Math.round(now - started), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * .95)] * 10) / 10,
              contacts: nextEvent, expectedContacts: steps.length}));
          }
          resolve();
        }
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  async function present(current: Round) {
    camera = 0; progress = 0; distance = 0; pitch = 0; grounded = false; multiplier = 1; lost = false; completed = false; lastWin = 0;
    wake = [];
    const events = readEvents(current.state);
    const target = (events[0] as DiveStep).targetDepth!;
    if (current.mode && current.mode !== modeForDepth(target)) throw new Error('Server mode does not match the route depth');
    roundDepth = target; selectedDepth = target;
    routeSteps = events.filter((event): event is DiveStep => event.type === 'diveStep');
    await playRoute(routeSteps);
    multiplier = events.at(-1)!.type === 'finalWin' ? (events.at(-1) as {amount:number}).amount / 100 : multiplier;
    lost = multiplier === 0;
    if (!grounded && multiplier !== 0) throw new Error('A positive payout must reach the seabed');
    if (!replay && current.active) { balance = (await session.endRound()).balance; current.active = false; }
    lastWin = current.payout ?? Math.round((current.amount ?? bet) * multiplier);
    encounter = ''; completed = true;
    status = multiplier > 1 ? 'TREASURE RECOVERED' : multiplier === 1 ? 'AMOUNT RETURNED' : 'DIVE COMPLETE';
    tone(multiplier > 1);
  }
  async function dive() {
    if (!canPlay) return;
    busy = true; error = ''; modal = null; completed = false; multiplier = 1;
    try {
      tone();
      const result = await session.play(bet, selectedDepth);
      balance = result.balance;
      launching = true;
      await new Promise(resolve => setTimeout(resolve, 160));
      const playback = present(result.round);
      requestAnimationFrame(() => { launching = false; });
      await playback;
    } catch (cause) {
      error = sessionError(cause);
      blocked = true; autoRemaining = 0;
    } finally { busy = false; }
  }
  async function watchReplay() {
    if (!replayData || !ready || busy || blocked) return;
    busy = true; modal = null; error = '';
    try { await present(replayData.round); }
    catch { error = 'Unable to show this replay. Reconnect to try again.'; blocked = true; }
    finally { busy = false; }
  }
  function spacebar(event: KeyboardEvent) {
    if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.matches('input, select, textarea, button, [contenteditable="true"]') || modal) return;
    event.preventDefault();
    if (!event.repeat && !replay && !autoRunning && !flags?.disabledSpacebar && canPlay) void dive();
  }
  async function startAuto(count: number) {
    if (!canPlay || flags?.disabledAutoplay || autoRunning) return;
    modal = null; autoRemaining = count; autoRunning = true;
    while (autoRemaining > 0 && !disposed && !blocked && balance.amount >= bet) {
      await dive();
      autoRemaining = Math.max(0, autoRemaining - 1);
      if (autoRemaining > 0) await new Promise(resolve => setTimeout(resolve, 500));
    }
    autoRemaining = 0; autoRunning = false;
  }
  function changeDifficulty(depth: number) {
    if (replay || busy || autoRemaining) return;
    selectedDepth = depth;
    // A finished dive belongs to the old target; show the new ocean from launch.
    completed = false; camera = 0; progress = 0; distance = 0; pitch = 0;
    grounded = false; lost = false; multiplier = 1; lastWin = 0;
    wake = []; routeSteps = []; encounter = ''; status = 'Ready to dive';
  }
  function changeBet(direction: number) {
    if (replay || busy || autoRemaining || !levels.length) return;
    const index = levels.indexOf(bet);
    bet = levels[Math.max(0, Math.min(levels.length - 1, index + direction))];
  }
  function focusDialog(node: HTMLElement) {
    const previous = document.activeElement as HTMLElement | null;
    node.querySelector<HTMLElement>('button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = [...node.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    node.addEventListener('keydown', trap);
    return { destroy() { node.removeEventListener('keydown', trap); previous?.focus(); } };
  }
  onMount(() => {
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}math-model.json`);
        if (!response.ok) throw new Error('Depth configuration missing');
        const model = await response.json();
        if (!Array.isArray(model.modes) || model.modes.length !== difficulties.length || !difficulties.every(difficulty =>
          model.modes.some((mode: DepthMode) => mode.depth === difficulty.depth &&
            mode.mode === modeForDepth(mode.depth) && mode.landingBonus === mode.depth / 100 &&
            mode.winProbability > 0 && mode.winProbability <= 1 && mode.maxWin > 0))) throw new Error('Upload the matching difficulty-mode frontend and math');
        depthModes = model.modes;
        document.documentElement.lang = 'en';
        if (replay) {
          demo = false;
          replayData = await loadReplay(window.location.href);
          balance = { amount: 0, currency: replayData.currency }; bet = replayData.amount;
          const events = readEvents(replayData.round.state);
          selectedDepth = roundDepth = (events[0] as DiveStep).targetDepth!;
          if (replayData.round.mode !== modeForDepth(selectedDepth) || events.at(-1)!.type !== 'finalWin' || (events.at(-1) as {amount:number}).amount / 100 !== replayData.round.payoutMultiplier) throw new Error('Replay route mismatch');
          ready = true; status = 'Ready to watch'; return;
        }
        session = await createSession(window.location.href); demo = session.demo;
        const auth = await session.authenticate();
        flags = auth.jurisdictionFlags; social = social || !!flags.socialCasino;
        if (social && !['XSC', 'XGC', 'XEC'].includes(auth.balance.currency)) throw new Error('Social session token mismatch');
        balance = auth.balance; levels = auth.config.betLevels;
        bet = initialBet(auth.config, auth.round);
        if (flags.minimumRoundDuration > 0) throw new Error('This prototype requires minimumRoundDuration = 0');
        if (auth.round?.active) { busy = true; await present(auth.round); }
        ready = true; if (!completed) status = 'Ready to dive';
      } catch (cause) { error = replay ? 'Unable to load this replay. Check the link and reconnect to try again.' : sessionError(cause); blocked = true; }
      finally { busy = false; }
    })();
  });
  onDestroy(() => { disposed = true; autoRemaining = 0; void audio?.close(); });
</script>

<svelte:head><title>{GAME_TITLE} · CZN Studios{replay ? ' · Replay' : ''}</title></svelte:head>
<svelte:window onkeydown={spacebar}/>

<main class="game" class:playing={busy} class:launching={launching} class:shaking={shakeIntensity > 0} style={`--play-scale:${playSize};--play-opacity:${playOpacity};--shake-offset:${shakeIntensity * 6}px`}>
  <div class="game-world"><Ocean targetDepth={displayDepth} {camera} {progress} {distance} {pitch} {grounded} {busy} {lost} {wake} onViewport={view => { flightView = view; }}/></div>
  <header class="topbar">
    <div class="studio"><img class="studio-logo" src={`${import.meta.env.BASE_URL}czn-studios-logo.png`} alt="CZN Studios"/><span>{GAME_TITLE.toUpperCase()}<small>{replay ? 'ROUND REPLAY' : 'DEMO \u00b7 SIMULATED BALANCE'}</small></span></div>
    <!-- <div class="wordmark"><GameWordmark/></div> -->
    <div class="top-actions">
      <button class="icon-button" onclick={toggleSound} aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound}><Icon name={sound ? 'sound' : 'mute'} size={21}/></button>
      <button class="icon-button" onclick={() => modal = 'settings'} aria-label="Open settings"><Icon name="menu" size={21}/></button>
    </div>
  </header>
  {#if ready || busy}
  {#if !completed}<div class="live-multiplier" aria-label={`Current multiplier ${multiplier.toFixed(2)} times`}>{multiplier.toFixed(2)}<span>x</span></div>{/if}
  <div class="vessel-label" style={`left:32%;top:${subTop(progress)};translate:0 -40px`}>{money(busy ? Math.round(bet * multiplier) : completed ? lastWin : bet)}</div>
  {#if busy || completed}{#each offPathItems as object (object.id)}{#if object.distance > distance - 110 && object.distance < distance + 110 && distance >= (object.spawnDistance??-Infinity)}<div class="route-token off-path-item" class:mine={object.item === 'mine'} style={`left:calc(32% + var(--sub-width) * ${86 / 420} + ${(object.distance - distance) * .7}%);top:${subTop(object.depth)};scale:${object.scale};rotate:${object.rotation}deg`} aria-hidden="true"><span><Pickup item={object.item}/></span></div>{/if}{/each}{/if}
  {#if busy}{#each routeSteps as step (step.index)}{#if !['launch','ground'].includes(step.item) && step.distance > distance + .1 && step.distance < distance + 110}<div class="route-token" class:mine={step.item === 'mine'} class:bubble={step.item === 'bubble'} class:chest={step.item === 'chest'} class:pearl={step.item === 'pearl'} style={`left:calc(32% + var(--sub-width) * ${86 / 420} + ${(step.distance - distance) * .7}%);top:${subTop(step.depth)}`} aria-hidden="true"><span><Pickup item={step.item}/></span></div>{/if}{/each}{/if}
  {#key encounterKey}{#if encounter}<div class:danger={encounter === '÷2'} class="encounter" style={`left:41%;top:${subTop(progress)}`}>{encounter}</div>{/if}{/key}
  {#if completed && !busy}<div class="result" class:empty={multiplier === 0} role="status"><small>{status}</small><strong>{multiplier > 0 ? money(lastWin) : 'No treasure this time'}</strong><span>{multiplier.toFixed(2)}×</span></div>{/if}
  <div class="world-depth-scale" aria-hidden="true">{#each depthTicks as tick}<span style={`top:${tick.top}%`}>{tick.metres}m ─</span>{/each}</div>
  <div class="bottom-shade"></div>
  <footer class="controls">
    <div class="control-row">
      <div class="telemetry"><div><small>DEPTH</small><strong>{(progress * displayDepth / 100).toFixed(1)}<span>m</span></strong></div><div><small>DISTANCE</small><strong>{distance.toFixed(1)}<span>m</span></strong></div><div><small>MULTIPLIER</small><strong>x{multiplier.toFixed(2)}</strong></div></div>
      <div class="speeds" aria-label="Animation speed">{#each speeds as option, index}<button class:active={speed === index} disabled={!speedAllowed(index)} onclick={() => speed = index} aria-label={`${option.label} speed`} aria-pressed={speed === index} title={option.label}><Icon name={option.icon} size={23}/></button>{/each}</div>
    </div>
    {#if replay}
      <div class="replay-details"><strong>{replayData?.modeLabel} · Replay</strong><span>Play amount: {money(bet)}</span><span>Cost multiplier: {replayData?.costMultiplier}× · {social ? 'Total play' : 'Round cost'}: {money(bet * (replayData?.costMultiplier ?? 1))}</span></div>
    {:else}
      <div class="wallet-row"><div class="balance"><small>{demo ? 'DEMO BALANCE' : 'BALANCE'}</small><strong>{money(balance.amount)}</strong></div><div class="depth-bet-controls"><div class="depth-control" role="group" aria-labelledby="difficulty-label">
          <small id="difficulty-label">DIFFICULTY</small>
          <div class="difficulty-options">
            {#each difficulties as difficulty}
              <button type="button" class:selected={selectedDepth === difficulty.depth} aria-pressed={selectedDepth === difficulty.depth} onclick={() => changeDifficulty(difficulty.depth)} disabled={busy || !!autoRemaining || !ready}>{difficulty.label}</button>
            {/each}
          </div>
        </div><div class="bet-control"><button class="bet-display" onclick={() => modal = 'bet'} disabled={busy || !!autoRemaining || !ready}><span><small>TOTAL PLAY</small><strong>{money(bet)}</strong></span></button><div class="bet-arrows"><button aria-label="Increase play amount" onclick={() => changeBet(1)} disabled={busy || !!autoRemaining || !ready || bet === levels.at(-1)}><Icon name="chevron-up" size={14}/></button><button aria-label="Decrease play amount" onclick={() => changeBet(-1)} disabled={busy || !!autoRemaining || !ready || bet === levels[0]}><Icon name="chevron-down" size={14}/></button></div></div></div></div>
    {/if}
    <p class="depth-odds">{selectedMode ? `${selectedDepth} m seabed · ${(selectedMode.winProbability * 100).toFixed(1)}% landing chance · ×${selectedMode.landingBonus} landing bonus` : "Preparing depths"}</p>
    <p class="game-status" aria-live="polite" id="play-explanation">{error || (insufficient ? 'Your balance is too low for this play amount.' : autoRemaining ? `Autoplay · ${autoRemaining} dives remaining` : '')}</p>
  </footer>
  <div class="play-cluster">
    {#if replay}
      <button class="replay-button" disabled={busy || blocked || !ready} onclick={watchReplay}>{busy ? 'Playing…' : completed ? 'Play again' : 'Start replay'}</button>
    {:else}
    <button class="auto-button" class:active={autoRemaining > 0} aria-label={autoRemaining ? 'Stop autoplay after this round' : 'Open autoplay'} title={autoRemaining ? 'Stop after this dive' : 'Autoplay'} disabled={!ready || blocked || (!!flags?.disabledAutoplay && !autoRemaining)} onclick={() => { if (autoRemaining) autoRemaining = 0; else if (!busy) modal = 'auto'; }}><Icon name="auto" size={24}/></button>
    <button class="play-button" class:spinning={busy} aria-label={busy ? 'Dive in progress' : 'Start dive'} aria-describedby="play-explanation" disabled={!canPlay || !!autoRemaining} onclick={() => dive()}><Icon name="play" size={48}/></button>
    {/if}
  </div>
  {:else if !error}<p class="loading" role="status">{replay ? 'Loading recorded round…' : 'Connecting to your dive…'}</p>{/if}
  {#if error}<div class="connection-error" role="alert">{error}<button onclick={() => window.location.reload()}>Reconnect</button></div>{/if}
  {#if modal}
    <div class="modal-shade"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1" use:focusDialog onkeydown={(event) => { if (event.key === 'Escape') modal = null; }}>
      <button class="icon-button modal-close" aria-label="Close dialog" onclick={() => modal = null}><Icon name="close"/></button>
      <h2 id="dialog-title">{modal === 'settings' ? 'SETTINGS' : modal === 'bet' ? 'TOTAL PLAY' : modal === 'auto' ? 'AUTOPLAY' : 'HOW TO PLAY'}</h2>
      {#if modal === 'settings'}
        <label class="setting-toggle">Sound effects<button class="toggle" class:enabled={sound} aria-label="Toggle sound effects" aria-pressed={sound} onclick={toggleSound}>{sound ? 'ON' : 'OFF'}</button></label>
        <label class="slider">Play button size<input type="range" min="0.8" max="1.15" step="0.05" bind:value={playSize}/></label>
        <label class="slider">Play button opacity<input type="range" min="0.45" max="1" step="0.05" bind:value={playOpacity}/></label>
        <button class="outline-button" onclick={() => { playSize = 1; playOpacity = 1; }}>Reset play button</button>
        <button class="text-button" onclick={() => modal = 'rules'}><Icon name="info" size={18}/> How to play</button>
      {:else if modal === 'bet'}
        <div class="bet-grid">{#each levels as amount}<button class:selected={amount === bet} disabled={busy || !!autoRemaining} onclick={() => { bet = amount; modal = null; }}>{money(amount)}</button>{/each}</div>
      {:else if modal === 'auto'}
        <p>Choose a number of dives. Stop autoplay at any time; the current dive will finish.</p><div class="bet-grid">{#each [10, 25, 50] as count}<button disabled={!canPlay || !!flags?.disabledAutoplay} onclick={() => startAuto(count)}>{count} dives</button>{/each}</div>
      {:else}
        <h3>Round rules</h3>
        <p>Start with a collected multiplier of 1×. Air bubbles add 1, treasure adds 3, gold chests multiply by 2 and pearls multiply by 3. These effects apply in encounter order. Mines divide the current value by 2, rounded down to 0.01×. Collectibles lift the submarine; mines send it deeper. Decorative objects away from the route do not change the result.</p>
        <p>Choose Easy, Medium or Hard before starting. Reach the chosen seabed with value remaining to win. The landing bonus multiplies the collected value. The final win equals the play amount multiplied by the final multiplier. Positive returns may be smaller than the play amount. A mine that reduces the value to zero ends the round with no win. Within 12 m of the bottom, the submarine continues to the seabed at zero; otherwise it stops at that mine. No further collectibles apply after zero. There are no free games or retriggers. Outcomes are determined by the game server; speed and other controls change presentation only.</p>
        <h3>Modes and symbol wins</h3>
        <p>All modes use the same symbol effects above and can be played for 1× the selected play amount per round. Higher difficulty means a deeper seabed, fewer successful landings and a larger landing bonus and maximum win.</p>
        <table class="rules-table"><caption>RTP and maximum win by mode</caption><thead><tr><th>Mode / depth</th><th>Per round</th><th>Landing bonus</th><th>RTP</th><th>Max win</th></tr></thead><tbody>{#each depthModes as mode}<tr><th>{difficulties.find(difficulty => difficulty.depth === mode.depth)?.label} / {mode.depth} m</th><td>1×</td><td>{mode.landingBonus}×</td><td>{(mode.rtp * 100).toFixed(1)}%</td><td>{mode.maxWin}×</td></tr>{/each}</tbody></table>
        <p>Maximum wins are multiples of the selected play amount, including the landing bonus. Landing chances are Easy 50%, Medium approximately 16.67%, and Hard approximately 8.33%. Landing chance means any positive return, including a return smaller than the play amount. RTP is the theoretical long-run gross return, not the expected result of an individual session.</p>
        <h3>Controls</h3>
        {#if replay}
          <p>Start replay watches the recorded round. Play again restarts that same round after it finishes. The mode, original play amount, cost multiplier and total play are shown below the ocean. Replay is view only; no new plays can be placed. Reconnect reloads this same recording if a connection error occurs.</p>
        {:else}
          <p>Start dive begins one round at the displayed total play. Space also starts one round when no menu is open and this shortcut is available in your region. The up and down arrows change total play by one allowed amount and stop at the ends. Total play also opens the server's allowed amounts. Choose an amount or close the panel to return. Difficulty selects Easy, Medium or Hard. Amount and difficulty lock while a round or autoplay is running.</p>
          <p>Autoplay opens a confirmation menu. Choose 10, 25 or 50 dives to start. Press its stop control to finish the current round and cancel the remaining dives. Autoplay stops if the balance is too low or a connection error occurs. It may be unavailable in some regions. The balance shows the available amount; the result shows the last round's gross win and multiplier.</p>
        {/if}
        <p>Slow, Normal, Fast and Turbo change animation speed, including during playback. Faster options may be unavailable in some regions. The speaker mutes or enables every sound; the same control is in Settings. The menu opens Settings; How to play opens these rules. Play button size and opacity adjust the main control; Reset play button restores both defaults. Close dismisses any panel; Escape also closes it. Reconnect reloads the game and recovers any unfinished live round. There is no fullscreen or feature activation control.</p>
        <h3>General information</h3>
        <p>{demo ? 'Fun play uses a simulated balance only. Reload resets it.' : replay ? 'This is a recording of a server result. It does not change your balance.' : 'Results and balance are supplied by the game server.'}</p>
        <p>Malfunction voids all wins and plays. A consistent internet connection is required. In the event of a disconnection, reload the game to finish any uncompleted rounds. The expected return is calculated over many plays. The game display does not represent a physical device and is for illustrative purposes only. Wins are settled according to the amount received from the Remote Game Server, rather than events within the web browser. TM and © 2026 Engine. Trenchbound Relay by CZN Studios.</p>
      {/if}
    </div></div>
  {/if}
</main>



