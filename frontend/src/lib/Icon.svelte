<script lang="ts">
  import Play from '@lucide/svelte/icons/play';
  import Menu from '@lucide/svelte/icons/menu';
  import X from '@lucide/svelte/icons/x';
  import Volume2 from '@lucide/svelte/icons/volume-2';
  import VolumeX from '@lucide/svelte/icons/volume-x';
  import Repeat2 from '@lucide/svelte/icons/repeat-2';
  import Turtle from '@lucide/svelte/icons/turtle';
  import Footprints from '@lucide/svelte/icons/footprints';
  import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
  import Zap from '@lucide/svelte/icons/zap';
  import Plus from '@lucide/svelte/icons/plus';
  import Minus from '@lucide/svelte/icons/minus';
  import Info from '@lucide/svelte/icons/info';
  import ChevronUp from '@lucide/svelte/icons/chevron-up';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let { name, size = 24 }: { name: string; size?: number } = $props();
  const icons: Record<string, typeof Play> = {
    play: Play, menu: Menu, close: X, sound: Volume2, mute: VolumeX,
    auto: Repeat2, turtle: Turtle, walk: Footprints, fast: ChevronsRight,
    bolt: Zap, plus: Plus, minus: Minus, info: Info,
    'chevron-up': ChevronUp, 'chevron-down': ChevronDown,
  };
  const SelectedIcon = $derived(icons[name] ?? Info);
</script>
<SelectedIcon {size} strokeWidth={1.7} fill={name === 'play' ? 'currentColor' : 'none'} aria-hidden="true"/>
