<script lang="ts">
  import { onMount } from 'svelte';
  import AnimatedSub from './AnimatedSub.svelte';
  import { buildWake, type WakeSample } from './wake';
  let { targetDepth, camera, progress, distance, pitch, grounded, busy, lost, wake }: { targetDepth: number; camera: number; progress: number; distance: number; pitch: number; grounded: boolean; busy: boolean; lost: boolean; wake: WakeSample[] } = $props();
  let submarine: SVGSVGElement;
  let viewport = $state({width:1200, height:740, subWidth:340});
  const trail = $derived(buildWake(wake, {...viewport, distance, targetDepth, camera}));
  const groundY = $derived((.364 + targetDepth * .012 - camera) * 740);
  onMount(() => {
    const parent = submarine.parentElement!;
    const measure = () => {
      const rect = parent.getBoundingClientRect();
      viewport = {width:rect.width, height:rect.height, subWidth:submarine.getBoundingClientRect().width};
    };
    const observer = new ResizeObserver(measure);
    observer.observe(parent); observer.observe(submarine); measure();
    return () => observer.disconnect();
  });
</script>
<img class="ocean-backdrop" src={`${import.meta.env.BASE_URL}assets/ocean-background.jpeg`} alt=""/>
<div class="ambient-bubbles" aria-hidden="true">
  {#each [{x:7.8,y:35.5,s:.7},{x:11.6,y:44.5,s:1.2},{x:12.4,y:42,s:.8},{x:21.6,y:64,s:1.7},{x:22.3,y:67,s:.8},{x:34.8,y:38.5,s:1.3},{x:47,y:43,s:1.2},{x:57.6,y:58.2,s:1.6},{x:59.4,y:57.3,s:.7},{x:62,y:15.7,s:1.3},{x:68.6,y:43,s:.6},{x:75.3,y:38.2,s:1.6},{x:81.6,y:49.4,s:1},{x:92.6,y:38.5,s:.6},{x:94.8,y:45,s:1.5}] as bubble}
    <i style={`left:${bubble.x}%;top:${bubble.y}%;--bubble-size:${bubble.s}cqw`}></i>
  {/each}
</div>
<svg class="ocean-art" viewBox="0 0 1200 740" preserveAspectRatio="none" aria-hidden="true">
  <g class="launch-pier" transform={`translate(${80 - distance * 8.4} ${220-camera*740})`} stroke="#00111d" stroke-width="3" stroke-linejoin="round">
    <path d="M-80 0H120L158 15H-80Z" fill="#4b819c"/>
    <path d="M-80 -14H102L120 0H-80Z" fill="#c2e6ed"/>
    <path d="M-30 -14V-56H-22V-14M80 -14V-39H88V-14" fill="#94c7d8"/>
    <path d="M-80 18H105L87 32H-80Z" fill="#001c31"/>
    <path d="M-80 -9H101" stroke="#e5faff" stroke-width="2"/>
  </g>
</svg>
<svg class="water-wake" viewBox={`0 0 ${viewport.width} ${viewport.height}`} preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="sub-wake-fade" gradientUnits="userSpaceOnUse" x1={trail.points[0]?.x ?? 0} y1={trail.points[0]?.y ?? 0} x2={trail.points.at(-1)?.x ?? 1} y2={trail.points.at(-1)?.y ?? 0}>
    <stop stop-color="#71dcff" stop-opacity="0"/><stop offset=".6" stop-color="#8eeeff" stop-opacity=".5"/><stop offset="1" stop-color="#d9fcff" stop-opacity=".85"/>
  </linearGradient></defs>
  <g class="sub-wake" class:active={busy && !grounded}>
    <path d={trail.path} fill="none" stroke="url(#sub-wake-fade)" stroke-width="8" stroke-linecap="round" opacity=".22"/>
    <path class="wake-streams" d={trail.path} fill="none" stroke="url(#sub-wake-fade)" stroke-width="1.8" stroke-linecap="round"/>
    <g class="wake-bubbles" fill="#d1faff33" stroke="#d9fcff" stroke-width="1">
      {#each trail.bubbles as bubble}<circle cx={bubble.x} cy={bubble.y} r={bubble.radius} opacity={bubble.opacity}/>{/each}
    </g>
  </g>
</svg>
<svg bind:this={submarine} class="submarine-art" viewBox="-160 -80 420 160" aria-hidden="true" style={`left:32%;top:calc(${(.364 + progress * targetDepth / 100 * .012 - camera) * 100}% - var(--sub-width) * ${progress / 100 * 46 / 420})`}>
  <g class:sub-travelling={busy} class:sub-lost={lost}>
    <g class:sub-bob={!busy && !grounded && !lost} transform={`rotate(${pitch})`}>
      <path d="M75 0L225 -28V40Z" fill="#d4ffee" opacity=".08"/>
      <foreignObject x="-80" y="-70" width="180" height="126"><AnimatedSub/></foreignObject>
    </g>
  </g>
</svg>

<style>
  .water-wake{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:-1}
  .sub-wake{opacity:0;transition:opacity .25s ease;pointer-events:none}
  .sub-wake.active{opacity:1}
  .wake-streams{stroke-dasharray:24 14;animation:wake-flow .9s linear infinite;animation-play-state:paused}
  .active .wake-streams{animation-play-state:running}
  @keyframes wake-flow{to{stroke-dashoffset:76}}
  @media(prefers-reduced-motion:reduce){.sub-wake{transition:none}.wake-streams{animation:none}.wake-bubbles{display:none}}
</style>
