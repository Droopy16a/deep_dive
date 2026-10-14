<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { DisplayAmount, type Balance, type Round, type JurisdictionFlags } from 'stake-engine';
  import { createSession, type GameSession } from './lib/session';
  import { readEvents, itemLabels, type DiveStep, type SceneryObject, type Item } from './lib/books';
  import { flightPosition } from './lib/flight';
  import Icon from './lib/Icon.svelte';
  import Ocean from './lib/Ocean.svelte';
  import Pickup from './lib/Pickup.svelte';

  let session: GameSession;
  let demo = $state(true), ready = $state(false), busy = $state(false), blocked = $state(false);
  let balance = $state<Balance>({ amount: 0, currency: 'USD' });
  let bet = $state(1_000_000), levels = $state<number[]>([]);
  let progress = $state(30), distance = $state(0), pitch = $state(0), grounded = $state(false), multiplier = $state(1), lastWin = $state(0);
  let status = $state('Preparing your dive'), error = $state('');
  let encounter = $state(''), encounterKey = $state(0), lost = $state(false), completed = $state(false);
  let modal = $state<'settings' | 'bet' | 'auto' | 'rules' | null>(null);
  let speed = $state(1), sound = $state(false), playSize = $state(1), playOpacity = $state(1);
  let autoRemaining = $state(0), autoRunning = false;
  let flags = $state<JurisdictionFlags | null>(null);
  let routeSteps = $state<DiveStep[]>([]);
  let scenery = $state<SceneryObject[]>([]);
  let disposed = false;
  let audio: AudioContext | null = null;
  const speeds = [ { label: 'Slow', icon: 'turtle', delay: 1100 }, { label: 'Normal', icon: 'walk', delay: 700 },
    { label: 'Fast', icon: 'fast', delay: 350 }, { label: 'Turbo', icon: 'bolt', delay: 160 } ];
  const subTop = (depth: number) => `calc(${16 + depth * .68}% - var(--sub-width) * ${depth / 100 * 46 / 420})`;
  const money = (amount: number) => DisplayAmount({ amount, currency: balance.currency });
  const speedAllowed = (index: number) => index < 2 || (index === 2 ? !flags?.disabledTurbo : !flags?.disabledSuperTurbo);
  const canPlay = $derived(ready && !busy && !blocked && balance.amount >= bet);

  function tone(win = false) {
    if (!sound) return;
    try {
      audio ??= new AudioContext();
      void audio.resume();
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(win ? 660 : 260, audio.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(win ? 990 : 180, audio.currentTime + .18);
      gain.gain.setValueAtTime(.045, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .2);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.start(); oscillator.stop(audio.currentTime + .21);
    } catch { /* Sound is optional; unsupported audio cannot interrupt settlement. */ }
  }
  function moveTo(target: DiveStep, duration: number, bounce: boolean, mineDive: boolean) {
    const from = {depth: progress, distance}, start = performance.now();
    duration *= Math.max(.9, Math.min(1.9, (target.distance - distance) / 44));
    return new Promise<void>((resolve, reject) => {
      function frame(now: number) {
        if (disposed) { reject(new Error('Playback interrupted')); return; }
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        const position = flightPosition(from, target, t, bounce, mineDive);
        progress = position.depth; distance = position.distance; pitch = position.pitch;
        if (t === 1) resolve(); else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  async function present(current: Round) {
    progress = 30; distance = 0; pitch = 0; grounded = false; multiplier = 1; lost = false; completed = false; lastWin = 0;
    const events = readEvents(current.state);
    routeSteps = events.filter((event): event is DiveStep => event.type === 'diveStep');
    scenery = routeSteps[0]?.scenery ?? [];
    let bounce = false;
    let mineDive = false;
    for (const event of events) {
      if (event.type === 'diveStep') {
        if (event.item !== 'launch') await moveTo(event, speeds[speed].delay, bounce, mineDive);
        multiplier = event.multiplier / 100;
        encounter = itemLabels[event.item];
        encounterKey += 1;
        status = event.item === 'mine' ? 'Mine hit · value halved' : itemLabels[event.item];
        bounce = ['bubble', 'treasure', 'chest', 'pearl'].includes(event.item);
        mineDive = event.item === 'mine';
        if (bounce) tone(true);
        if (mineDive) { pitch = 28; tone(false); }
        if (event.item === 'wreck' || event.item === 'ground') {
          grounded = true; pitch = 0; lost = multiplier === 0;
        }
      } else { multiplier = event.amount / 100; }
    }
    if (!grounded) throw new Error('Route ended before seabed contact');
    if (current.active) { balance = (await session.endRound()).balance; current.active = false; }
    lastWin = current.payout ?? Math.round((current.amount ?? bet) * multiplier);
    encounter = ''; completed = true;
    status = multiplier > 0 ? 'TREASURE RECOVERED' : 'DIVE COMPLETE';
    tone(multiplier > 0);
  }
  async function dive() {
    if (!canPlay) return;
    busy = true; error = ''; modal = null; completed = false;
    try {
      tone();
      const result = await session.play(bet);
      balance = result.balance;
      await present(result.round);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Unable to finish round';
      blocked = true; autoRemaining = 0;
    } finally { busy = false; }
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
  function changeBet(direction: number) {
    if (busy || autoRemaining || !levels.length) return;
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
        session = await createSession(window.location.href); demo = session.demo;
        const auth = await session.authenticate();
        balance = auth.balance; levels = auth.config.betLevels; flags = auth.jurisdictionFlags;
        bet = levels.includes(auth.config.defaultBetLevel) ? auth.config.defaultBetLevel : levels[0];
        if (!Number.isSafeInteger(bet)) throw new Error('No valid bet levels supplied');
        if (flags.minimumRoundDuration > 0) throw new Error('This prototype requires minimumRoundDuration = 0');
        if (auth.round?.active) { busy = true; await present(auth.round); }
        ready = true; if (!completed) status = 'Ready to dive';
      } catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to start session'; blocked = true; }
      finally { busy = false; }
    })();
  });
  onDestroy(() => { disposed = true; autoRemaining = 0; void audio?.close(); });
</script>

<main class="game" class:playing={busy} style={`--play-scale:${playSize};--play-opacity:${playOpacity}`}>
  <Ocean {progress} {distance} {pitch} {grounded} {busy} {lost} endDistance={routeSteps.at(-1)?.distance ?? 400}/>
  <header class="topbar">
    <div class="studio"><span class="studio-mark">CZN</span><span>DEEP DIVE<small>{demo ? 'FUN PLAY · DEMO' : 'CZN STUDIOS'}</small></span></div>
    <div class="wordmark" aria-hidden="true"><span>DEEP</span><strong>DIVE</strong><i>✦</i></div>
    <div class="top-actions">
      <button class="icon-button" onclick={() => { sound = !sound; if (sound) tone(); }} aria-label={sound ? 'Mute sound' : 'Enable sound'} aria-pressed={sound}><Icon name={sound ? 'sound' : 'mute'} size={21}/></button>
      <button class="icon-button" onclick={() => modal = 'settings'} aria-label="Open settings"><Icon name="menu" size={21}/></button>
    </div>
  </header>
  <div class="session-label">{demo ? 'DEMO CREDITS · NO REAL MONEY' : 'RGS SESSION'}</div>
  {#if !busy && !completed}<div class="intro"><span>THE OCEAN IS FULL OF SURPRISES</span><h1>Go deeper.</h1><p>Collect treasure. Watch for mines.<br/>Reach the wreck.</p></div>{/if}
  {#if busy}<div class="live-multiplier"><small>COLLECTED</small>{multiplier.toFixed(2)}<span>×</span></div>{/if}
  <div class="vessel-label" style={`left:32%;top:${subTop(progress)};translate:0 -40px`}>{money(bet)}</div>
  {#if busy || completed}{#each scenery as object (object.id)}{#if object.distance > distance - 65 && object.distance < distance + 110}<div class="route-token field-item" class:background-scenery={["fish","shell","bottle"].includes(object.item)} style={`left:calc(32% + var(--sub-width) * ${86 / 420} + ${(object.distance - distance) * .7}%);top:${subTop(object.depth)};scale:${object.scale};rotate:${object.rotation}deg`} aria-hidden="true"><span><Pickup item={object.item}/></span>{#if ['bubble','treasure','chest','pearl','mine'].includes(object.item)}<strong>{itemLabels[object.item as Item]}</strong>{/if}</div>{/if}{/each}{/if}
  {#if busy}{#each routeSteps as step}{#if !['launch','wreck','ground'].includes(step.item) && step.distance > distance + .1 && step.distance < distance + 110}<div class="route-token" class:mine={step.item === 'mine'} class:bubble={step.item === 'bubble'} class:chest={step.item === 'chest'} class:pearl={step.item === 'pearl'} style={`left:calc(32% + var(--sub-width) * ${86 / 420} + ${(step.distance - distance) * .7}%);top:${subTop(step.depth)}`} aria-hidden="true"><span><Pickup item={step.item}/></span><strong>{itemLabels[step.item]}</strong></div>{/if}{/each}{/if}
  {#key encounterKey}{#if encounter}<div class:danger={encounter === '÷2'} class="encounter" style={`left:41%;top:${subTop(progress)}`}>{encounter}</div>{/if}{/key}
  {#if completed && !busy}<div class="result" class:empty={multiplier === 0} role="status"><small>{status}</small><strong>{multiplier > 0 ? money(lastWin) : 'No treasure this time'}</strong><span>{multiplier.toFixed(2)}×</span></div>{/if}
  <div class="depth-scale" aria-hidden="true"><span>0m</span><i></i><span>50m</span><i></i><span>100m</span></div>
  <div class="bottom-shade"></div>
  <footer class="controls">
    <div class="control-row">
      <div class="telemetry"><div><small>DEPTH</small><strong>{progress.toFixed(1)}<span>m</span></strong></div><div><small>DISTANCE</small><strong>{distance.toFixed(1)}<span>m</span></strong></div><div><small>MULTIPLIER</small><strong>×{multiplier.toFixed(2)}</strong></div></div>
      <div class="speeds" aria-label="Animation speed">{#each speeds as option, index}<button class:active={speed === index} disabled={busy || !speedAllowed(index)} onclick={() => speed = index} aria-label={`${option.label} speed`} aria-pressed={speed === index} title={option.label}><Icon name={option.icon} size={23}/></button>{/each}</div>
    </div>
    <div class="wallet-row"><div class="balance"><small>{demo ? 'DEMO BALANCE' : 'BALANCE'}</small><strong>{money(balance.amount)}</strong></div><div class="bet-control"><button class="bet-display" onclick={() => modal = 'bet'} disabled={busy || !!autoRemaining || !ready}><small>TOTAL BET</small><strong>{money(bet)}</strong></button><div class="bet-arrows"><button aria-label="Increase bet" onclick={() => changeBet(1)} disabled={busy || !!autoRemaining || bet === levels.at(-1)}>▴</button><button aria-label="Decrease bet" onclick={() => changeBet(-1)} disabled={busy || !!autoRemaining || bet === levels[0]}>▾</button></div></div></div>
    <p class="game-status" aria-live="polite">{error || (autoRemaining ? `Autoplay · ${autoRemaining} dives remaining` : !ready ? status : '')}</p>
  </footer>
  <div class="play-cluster">
    <button class="auto-button" class:active={autoRemaining > 0} aria-label={autoRemaining ? 'Stop autoplay after this round' : 'Open autoplay'} title={autoRemaining ? 'Stop after this dive' : 'Autoplay'} disabled={!ready || blocked || (!!flags?.disabledAutoplay && !autoRemaining)} onclick={() => { if (autoRemaining) autoRemaining = 0; else if (!busy) modal = 'auto'; }}><Icon name="auto" size={24}/></button>
    <button class="play-button" class:spinning={busy} aria-label={busy ? 'Dive in progress' : 'Start dive'} disabled={!canPlay || !!autoRemaining} onclick={dive}><Icon name={busy ? 'auto' : 'play'} size={48}/></button>
  </div>
  {#if error}<div class="connection-error" role="alert">{error}<button onclick={() => window.location.reload()}>Reconnect</button></div>{/if}
  {#if modal}
    <div class="modal-shade"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabindex="-1" use:focusDialog onkeydown={(event) => { if (event.key === 'Escape') modal = null; }}>
      <button class="icon-button modal-close" aria-label="Close dialog" onclick={() => modal = null}><Icon name="close"/></button>
      <h2 id="dialog-title">{modal === 'settings' ? 'SETTINGS' : modal === 'bet' ? 'TOTAL BET' : modal === 'auto' ? 'AUTOPLAY' : 'HOW TO PLAY'}</h2>
      {#if modal === 'settings'}
        <label class="setting-toggle">Sound effects<button class="toggle" class:enabled={sound} aria-label="Toggle sound effects" aria-pressed={sound} onclick={() => { sound = !sound; if (sound) tone(); }}>{sound ? 'ON' : 'OFF'}</button></label>
        <label class="slider">Play button size<input type="range" min="0.8" max="1.15" step="0.05" bind:value={playSize}/></label>
        <label class="slider">Play button opacity<input type="range" min="0.45" max="1" step="0.05" bind:value={playOpacity}/></label>
        <button class="outline-button" onclick={() => { playSize = 1; playOpacity = 1; }}>Reset play button</button>
        <button class="text-button" onclick={() => modal = 'rules'}><Icon name="info" size={18}/> How to play</button>
      {:else if modal === 'bet'}
        <div class="bet-grid">{#each levels as amount}<button class:selected={amount === bet} disabled={busy || !!autoRemaining} onclick={() => { bet = amount; modal = null; }}>{money(amount)}</button>{/each}</div>
      {:else if modal === 'auto'}
        <p>Choose a number of dives. Stop autoplay at any time; the current dive will finish.</p><div class="bet-grid">{#each [10, 25, 50] as count}<button disabled={!canPlay || !!flags?.disabledAutoplay} onclick={() => startAuto(count)}>{count} dives</button>{/each}</div>
      {:else}
        <p>Collect air bubbles (+1), treasure (+3), gold chests (×2) and pearls (×3). Each collectible bounces the submarine upward. Mines halve the multiplier and send it deeper. The round finishes only when the submarine touches the seabed, at the wreck on a winning route.</p><p>Start at 1×. Mine halves round down to 0.01×; enough mines reduce the value to zero. The prototype pays 0× to 10× with a 96% weighted return. Outcomes are chosen before their routes are built. Speed changes animation only.</p><p>{demo ? 'Fun play uses demo credits only. Reload resets your balance.' : 'Results and balance are supplied by the game server.'}</p>
      {/if}
    </div></div>
  {/if}
</main>



