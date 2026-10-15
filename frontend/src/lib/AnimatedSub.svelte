<script lang="ts">
  import { onMount } from 'svelte';
  import { parseGIF, decompressFrames } from 'gifuct-js';
  let { damaged = false }: { damaged?: boolean } = $props();
  let canvas: HTMLCanvasElement;
  let loaded = $state(false);
  const width = 180, height = 126;

  // Source-specific rendering mask: remove edge-connected blue water, retain
  // enclosed blue portholes, then keep only the submarine's connected shape.
  function isolate(data: ImageData): ImageData {
    const pixels = data.data, count = width * height;
    const background = new Uint8Array(count), seen = new Uint8Array(count);
    const queue = new Int32Array(count);
    let tail = 0;
    const water = (p: number) => {
      const r = pixels[p * 4], g = pixels[p * 4 + 1], b = pixels[p * 4 + 2];
      return b > r * 1.15 && g > r * 1.1;
    };
    const add = (p: number) => {
      if (!background[p] && water(p)) { background[p] = 1; queue[tail++] = p; }
    };
    for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
    for (let head = 0; head < tail; head++) {
      const p = queue[head], x = p % width, y = Math.floor(p / width);
      if (x) add(p - 1); if (x < width - 1) add(p + 1);
      if (y) add(p - width); if (y < height - 1) add(p + width);
    }
    let largest: number[] = [];
    for (let p = 0; p < count; p++) {
      if (background[p] || seen[p]) continue;
      const component: number[] = [p]; seen[p] = 1;
      for (let i = 0; i < component.length; i++) {
        const v = component[i], x = v % width, y = Math.floor(v / width);
        const visit = (n: number) => { if (!background[n] && !seen[n]) { seen[n] = 1; component.push(n); } };
        if (x) visit(v - 1); if (x < width - 1) visit(v + 1);
        if (y) visit(v - width); if (y < height - 1) visit(v + width);
      }
      if (component.length > largest.length) largest = component;
    }
    const keep = new Uint8Array(count);
    for (const p of largest) keep[p] = 1;
    for (let p = 0; p < count; p++) if (!keep[p]) pixels[p * 4 + 3] = 0;
    return data;
  }

  onMount(() => {
    const controller = new AbortController();
    let stopped = false, request = 0;
    void (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}assets/submarine-scene.gif`, { signal: controller.signal });
        if (!response.ok) throw new Error('Sprite unavailable');
        const gif = parseGIF(await response.arrayBuffer());
        const frames = decompressFrames(gif, true);
        const surface = document.createElement('canvas'); surface.width = gif.lsd.width; surface.height = gif.lsd.height;
        const context = surface.getContext('2d', { willReadFrequently: true })!;
        const patch = document.createElement('canvas');
        const sprites: ImageData[] = [];
        let previous: typeof frames[number] | null = null;
        let restore: ImageData | null = null;
        for (const frame of frames) {
          if (previous?.disposalType === 2) context.clearRect(previous.dims.left, previous.dims.top, previous.dims.width, previous.dims.height);
          if (previous?.disposalType === 3 && restore) context.putImageData(restore, 0, 0);
          restore = frame.disposalType === 3 ? context.getImageData(0, 0, surface.width, surface.height) : null;
          patch.width = frame.dims.width; patch.height = frame.dims.height;
          patch.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), patch.width, patch.height), 0, 0);
          context.drawImage(patch, frame.dims.left, frame.dims.top);
          sprites.push(isolate(context.getImageData(122, 82, width, height)));
          previous = frame;
        }
        if (stopped) return;
        if (!sprites.length) throw new Error('Sprite contains no frames');
        const output = canvas.getContext('2d')!;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let last = -1, damageStart = 0, wasDamaged = false;
        const started = performance.now();
        function render(now: number) {
          if (stopped) return;
          if (damaged && !wasDamaged) damageStart = now;
          wasDamaged = damaged;
          // The supplied GIF also contains a torpedo/explosion. Use its idle
          // movement during normal play and trigger damage only on mine/loss.
          const index = reduced ? 0 : damaged
            ? Math.min(sprites.length - 1, 18 + Math.floor(Math.max(0, now - damageStart) / 100))
            : Math.floor(Math.max(0, now - started) / 100) % Math.min(17, sprites.length);
          if (index !== last) { output.putImageData(sprites[index], 0, 0); last = index; }
          request = requestAnimationFrame(render);
        }
        loaded = true;
        request = requestAnimationFrame(render);
      } catch { /* Keep the previous supplied PNG visible if decoding fails. */ }
    })();
    return () => { stopped = true; controller.abort(); cancelAnimationFrame(request); };
  });
</script>
<canvas bind:this={canvas} {width} {height} class:ready={loaded} aria-hidden="true"></canvas>
{#if !loaded}<svg viewBox="0 0 180 126" role="img" aria-label="Submarine"><path d="M42 60H130Q165 60 165 84Q165 108 130 108H42Q15 108 15 84Q15 60 42 60Z" fill="#e9b34f" stroke="#153d50" stroke-width="4"/><path d="M70 60V43H100V60M85 43V28H108" fill="none" stroke="#e9b34f" stroke-width="7"/>{#each [50,85,120] as x}<circle cx={x} cy="82" r="12" fill="#9ddde4" stroke="#153d50" stroke-width="4"/>{/each}</svg>{/if}
<style>canvas,svg{width:100%;height:100%;object-fit:contain;display:block}canvas{display:none}canvas.ready{display:block}</style>
