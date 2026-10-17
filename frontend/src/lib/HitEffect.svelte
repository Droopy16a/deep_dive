<script lang="ts">
  let { bomb, left, top, onDone }: { bomb: boolean; left: string; top: string; onDone: () => void } = $props();
  const rays = Array.from({length: 12}, (_, index) => ({
    angle: index * 30 + 12,
    reach: 48 + (index % 3) * 16,
    delay: (index % 4) * 18,
  }));
</script>

<div class="hit-effect" class:bomb style={`left:${left};top:${top}`} aria-hidden="true" onanimationend={event => { if (event.target === event.currentTarget) onDone(); }}>
  <div class="halo"></div>
  <div class="shockwave"></div>
  <div class="core"></div>
  {#if bomb}
    {#each [0, 1, 2, 3, 4] as puff}
      <i class="smoke" style={`--x:${(puff - 2) * 21}px;--y:${-35 - (puff % 3) * 16}px;--delay:${puff * 35}ms`}></i>
    {/each}
  {/if}
  {#each rays as ray, index}
    <div class="ray" style={`--angle:${ray.angle}deg;--reach:${bomb ? ray.reach * 1.35 : ray.reach}px;--delay:${ray.delay}ms`}>
      <i class="spark" class:star={!bomb && index % 2 === 0}></i>
    </div>
  {/each}
</div>

<style>
  .hit-effect{position:absolute;width:0;height:0;pointer-events:none;z-index:2;--light:#fff2a3;--color:#ffd15b;animation:effect-lifetime .95s linear both}
  .halo,.shockwave,.core,.smoke{position:absolute;border-radius:50%;will-change:transform,opacity}
  .halo{inset:-85px;background:radial-gradient(circle,#fff6baaa 0%,#ffc95466 25%,#ffbd2922 48%,transparent 70%);mix-blend-mode:screen;animation:halo .75s ease-out both}
  .shockwave{inset:-20px;border:2px solid var(--light);box-shadow:0 0 12px var(--color),inset 0 0 8px var(--color);animation:ring .65s ease-out both}
  .core{inset:-17px;background:radial-gradient(circle,#fff 5%,var(--light) 35%,var(--color) 60%,transparent 75%);animation:core .45s ease-out both}
  .ray{position:absolute;inset:0;transform:rotate(var(--angle))}
  .spark{position:absolute;left:-3px;top:-3px;width:6px;height:6px;border-radius:50%;background:var(--light);box-shadow:0 0 8px var(--color);animation:spark .7s var(--delay) ease-out both}
  .star{left:-7px;top:-7px;width:14px;height:14px;border-radius:0;clip-path:polygon(50% 0,62% 37%,100% 50%,62% 63%,50% 100%,38% 63%,0 50%,38% 37%)}
  .bomb{--light:#fff0b8;--color:#ff752b;animation-duration:1.15s}
  .bomb .halo{inset:-125px;background:radial-gradient(circle,#ffedbccc,#ff812b77 24%,#f7411522 50%,transparent 70%);animation-duration:.65s}
  .bomb .core{inset:-42px;background:radial-gradient(circle,#fffbe7 8%,#ffe58f 23%,#ff9b31 43%,#ef481c 60%,transparent 73%);animation-duration:.55s}
  .bomb .shockwave{border-color:#ffc58c;animation-duration:.8s}
  .bomb .spark{width:10px;height:4px;background:#ffca75;animation-duration:.85s}
  .smoke{inset:-25px;background:radial-gradient(circle,#6b544ccc,#34374588 55%,transparent 72%);animation:smoke .9s var(--delay) ease-out both}
  @keyframes effect-lifetime{from{opacity:1}to{opacity:1}}
  @keyframes halo{0%{opacity:0;transform:scale(.3)}15%{opacity:1}100%{opacity:0;transform:scale(1.3)}}
  @keyframes ring{from{opacity:.95;transform:scale(.3)}to{opacity:0;transform:scale(4)}}
  @keyframes core{0%{opacity:1;transform:scale(.25)}25%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.7)}}
  @keyframes spark{0%{opacity:0;transform:translateX(4px) scale(.3)}12%{opacity:1}100%{opacity:0;transform:translateX(var(--reach)) scale(.15)}}
  @keyframes smoke{0%{opacity:0;transform:scale(.3)}25%{opacity:.7}100%{opacity:0;transform:translate(var(--x),var(--y)) scale(1.8)}}
  @media(prefers-reduced-motion:reduce){
    .ray,.shockwave,.smoke{display:none}
    .halo,.core{animation:gentle-fade .45s ease-out both}
    @keyframes gentle-fade{from{opacity:.65}to{opacity:0}}
  }
</style>
