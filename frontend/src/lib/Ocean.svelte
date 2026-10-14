<script lang="ts">
  import AnimatedSub from './AnimatedSub.svelte';
  let { progress, distance, pitch, grounded, busy, lost }: { progress: number; distance: number; pitch: number; grounded: boolean; busy: boolean; lost: boolean } = $props();
</script>
<svg class="ocean-art" viewBox="0 0 1200 740" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <linearGradient id="water" x2="0" y2="1"><stop stop-color="#166f94"/><stop offset=".36" stop-color="#104565"/><stop offset="1" stop-color="#071932"/></linearGradient>
    <linearGradient id="sand" x2="0" y2="1"><stop stop-color="#244955"/><stop offset="1" stop-color="#102435"/></linearGradient>
    <linearGradient id="hull" x2="0" y2="1"><stop stop-color="#ffe39c"/><stop offset=".5" stop-color="#edb955"/><stop offset="1" stop-color="#a35d29"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="#7ef6ef" stop-opacity=".4"/><stop offset="1" stop-color="#7ef6ef" stop-opacity="0"/></radialGradient>
    <pattern id="ocean-rocks" width="1200" height="740" patternUnits="userSpaceOnUse" patternTransform={`translate(${-distance * 3} 0)`}>
      <path d="M0 590L80 554L150 579L240 540L320 593L410 560L500 586L640 537L770 578L900 530L1040 572L1200 590V740H0Z" fill="#123044"/>
    </pattern>
    <pattern id="moving-floor" width="600" height="740" patternUnits="userSpaceOnUse" patternTransform={`translate(${-distance * 8.4} 0)`}>
      <g stroke="#307471" stroke-width="7" fill="none" opacity=".65"><path d="M50 720Q20 661 52 638M65 722Q85 675 61 655M480 730Q451 680 482 640"/></g>
      <g fill="#37606a" opacity=".5"><ellipse cx="180" cy="679" rx="55" ry="15"/><ellipse cx="420" cy="712" rx="40" ry="12"/><ellipse cx="545" cy="665" rx="26" ry="8"/></g>
      <path d="M12 657H38M294 693H321M365 641H380" stroke="#58929a" opacity=".25" stroke-width="2"/>
    </pattern>
  </defs>
  <rect width="1200" height="740" fill="url(#water)"/>
  <g fill="#b0e7e8" opacity=".045" transform={`translate(${-distance * .4} 0)`}><path d="M170 0L330 650H560L350 0Z"/><path d="M600 0L770 640H850L710 0Z"/><path d="M1020 0L890 650H1000L1160 0Z"/><path d="M1520 0L1490 650H1600L1660 0Z"/></g>
  <path d="M0 170Q130 155 260 172T520 170T780 166T1040 172T1300 165" fill="none" stroke="#96e4ef" stroke-opacity=".12" stroke-width="3"/>
  <g class="distant-fish" fill="#4892a3" opacity=".3"><path d="M715 248Q732 235 749 248Q732 262 715 248L702 258V237Z"/><path d="M815 306Q826 296 840 306Q826 316 815 306L805 313V298Z"/><path d="M640 286Q650 278 662 286Q650 295 640 286L630 293V280Z"/></g>
  <rect width="1200" height="740" fill="url(#ocean-rocks)"/>
  <rect y="621.6" width="1200" height="119" fill="url(#sand)"/>
  <rect width="1200" height="740" fill="url(#moving-floor)"/>
  <path d="M0 622H1200" stroke="#70a7a0" stroke-opacity=".32" stroke-width="2"/>
  <g transform={`translate(${80 - distance * 8.4} 220)`}><path d="M-80 0H120L158 15H-80Z" fill="#2b4c60"/><path d="M-80 -14H102L120 0H-80Z" fill="#78949d"/><path d="M-30 -14V-56H-22V-14M80 -14V-39H88V-14" stroke="#637d89" stroke-width="5"/><path d="M-80 18H105L87 32H-80Z" fill="#132c43"/></g>

</svg>
<svg class="submarine-art" viewBox="-160 -80 420 160" aria-hidden="true" style={`left:32%;top:calc(${16 + progress * .68}% - var(--sub-width) * ${progress / 100 * 46 / 420})`}>
  <g class:sub-travelling={busy} class:sub-lost={lost}>
    <g class:sub-bob={!busy && !grounded} transform={`rotate(${pitch})`}>
      <path d="M75 0L225 -28V40Z" fill="#d4ffee" opacity=".08"/>
      <g class="bubble-trail" fill="none" stroke="#b0e9e5" opacity=".6"><circle cx="-70" cy="0" r="6"/><circle cx="-100" cy="-10" r="4"/><circle cx="-130" cy="-3" r="2"/></g>
      <foreignObject x="-80" y="-70" width="180" height="126"><AnimatedSub damaged={lost}/></foreignObject>
    </g>
  </g>
</svg>
