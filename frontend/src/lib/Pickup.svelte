<script lang="ts">import type { Item, SceneryItem } from './books'; let { item }: {item: Item | SceneryItem} = $props();</script>
<svg viewBox={item === "mine" ? "150 120 780 840" : item === "bubble" ? "120 130 840 820" : item === "treasure" ? "80 190 920 700" : item === "chest" ? "85 115 910 850" : item === "pearl" ? "85 65 910 950" : "0 0 48 48"} width="38" height="38" style="overflow:visible" fill="none" aria-hidden="true">
  {#if item === 'bubble'}
    <image href={`${import.meta.env.BASE_URL}assets/air_bubble.png`} width="1080" height="1080"/>
  {:else if item === 'treasure'}
    <image href={`${import.meta.env.BASE_URL}assets/treasure.png`} width="1080" height="1080"/>
  {:else if item === 'chest'}
    <image href={`${import.meta.env.BASE_URL}assets/gold_chest.png`} width="1080" height="1080"/>
  {:else if item === 'pearl'}
    <image href={`${import.meta.env.BASE_URL}assets/pearl.png`} width="1080" height="1080"/>
  {:else if item === 'mine'}
    <image href={`${import.meta.env.BASE_URL}assets/bomb.png`} width="1080" height="1080"/>
  {:else if item === 'fish'}
    <path d="M12 24Q26 5 42 24Q26 43 12 24L3 34V14Z" fill="#77c4ca" stroke="#2d7c93" stroke-width="2"/><path d="M23 15L29 24L23 33" stroke="#4095a8" stroke-width="3"/><circle cx="34" cy="22" r="2" fill="#12354b"/>
  {:else if item === 'shell'}
    <path d="M23 39Q0 28 8 16Q12 9 19 13Q24 2 31 12Q43 7 44 22Q46 32 26 39Z" fill="#dfb7bf" stroke="#9b7c99" stroke-width="2"/><path d="M24 36L12 18M25 36L24 14M27 36L36 18" stroke="#ae90ad" stroke-width="2"/>
  {:else if item === 'bottle'}
    <path d="M18 5H29V17L35 23V40Q23 46 12 40V23L18 17Z" fill="#79bea685" stroke="#91c8b2" stroke-width="2"/><path d="M17 7H30M17 11H30M15 28H32V37H15Z" stroke="#d0d6af" stroke-width="3"/><path d="M17 21V26" stroke="#d7f5e7" stroke-width="2"/>
  {/if}
</svg>
