<script lang="ts">import type { Item, SceneryItem } from './books'; let { item }: {item: Item | SceneryItem} = $props();</script>
<svg viewBox="0 0 48 48" width="38" height="38" fill="none" aria-hidden="true">
  {#if item === 'bubble'}
    <circle cx="24" cy="24" r="19" fill="#a4edff30" stroke="#c5f5ff" stroke-width="2"/><path d="M12 22Q13 12 23 11" stroke="white" stroke-width="3" stroke-linecap="round"/><circle cx="33" cy="34" r="3" fill="#aff1ff80"/>
  {:else if item === 'treasure'}
    <path d="M17 7H31L27 16Q43 25 37 39Q24 47 11 39Q5 25 21 16Z" fill="#dca83c" stroke="#80561b" stroke-width="2"/><path d="M18 16H30" stroke="#ffed99" stroke-width="3"/><circle cx="24" cy="30" r="9" fill="#ffdc75"/><path d="M24 24V36M20 28Q29 23 28 30Q18 32 22 35H28" stroke="#b47a23" stroke-width="2"/>
  {:else if item === 'chest'}
    <path d="M5 24Q5 9 15 9H34Q43 9 43 24Z" fill="#f1bc40" stroke="#95611d" stroke-width="2"/><rect x="5" y="24" width="38" height="17" rx="3" fill="#bb7925" stroke="#f5ce61" stroke-width="2"/><path d="M13 10V40M35 10V40" stroke="#ffe092" stroke-width="4"/><rect x="20" y="21" width="9" height="11" rx="2" fill="#ffdf76"/><circle cx="24.5" cy="26" r="1.8" fill="#6b4b21"/>
  {:else if item === 'pearl'}
    <circle cx="24" cy="24" r="18" fill="#d4c0ee" stroke="#f5eaff" stroke-width="2"/><ellipse cx="18" cy="17" rx="7" ry="6" fill="#fff9ff"/><path d="M16 36Q31 43 39 26" stroke="#a995c7" stroke-width="3" stroke-linecap="round"/>
  {:else if item === 'mine'}
    <path d="M24 2V11M24 37V46M2 24H11M37 24H46M8 8L14 14M34 34L40 40M8 40L14 34M34 14L40 8" stroke="#9faebc" stroke-width="5"/><circle cx="24" cy="24" r="15" fill="#283c4d" stroke="#97a5b3" stroke-width="2"/><circle cx="20" cy="20" r="4" fill="#5b7180"/><circle cx="28" cy="28" r="5" fill="#fa7866"/>
  {:else if item === 'fish'}
    <path d="M12 24Q26 5 42 24Q26 43 12 24L3 34V14Z" fill="#77c4ca" stroke="#2d7c93" stroke-width="2"/><path d="M23 15L29 24L23 33" stroke="#4095a8" stroke-width="3"/><circle cx="34" cy="22" r="2" fill="#12354b"/>
  {:else if item === 'shell'}
    <path d="M23 39Q0 28 8 16Q12 9 19 13Q24 2 31 12Q43 7 44 22Q46 32 26 39Z" fill="#dfb7bf" stroke="#9b7c99" stroke-width="2"/><path d="M24 36L12 18M25 36L24 14M27 36L36 18" stroke="#ae90ad" stroke-width="2"/>
  {:else if item === 'bottle'}
    <path d="M18 5H29V17L35 23V40Q23 46 12 40V23L18 17Z" fill="#79bea685" stroke="#91c8b2" stroke-width="2"/><path d="M17 7H30M17 11H30M15 28H32V37H15Z" stroke="#d0d6af" stroke-width="3"/><path d="M17 21V26" stroke="#d7f5e7" stroke-width="2"/>
  {/if}
</svg>
