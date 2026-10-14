<script lang="ts">
  let { name, size = 24 }: { name: string; size?: number } = $props();
  const paths: Record<string, string> = {
    play: 'M8 5L20 12L8 19Z',
    menu: 'M4 6H20M4 12H20M4 18H20',
    close: 'M6 6L18 18M18 6L6 18',
    sound: 'M4 9H8L13 5V19L8 15H4ZM16 8Q22 12 16 16M16 4Q28 12 16 20',
    mute: 'M4 9H8L13 5V19L8 15H4ZM17 9L23 15M23 9L17 15',
    auto: 'M18 5A8 8 0 1 0 20 15M18 1V6H23M10 8L16 12L10 16Z',
    turtle: 'M5 15C3 6 17 5 19 15ZM2 15H21M6 15L4 19M16 15L18 19M19 12H23',
    walk: 'M13 3H13.01M11 7L8 12L4 13M11 7L15 11L20 11M11 7L12 14L7 21M12 14L17 20',
    fast: 'M3 8H9M1 12H7M3 16H9M13 4L21 12L13 20M9 6L15 12L9 18',
    bolt: 'M14 2L5 14H11L10 22L20 9H13Z',
    plus: 'M5 12H19M12 5V19', minus: 'M5 12H19',
    info: 'M12 11V17M12 7H12.01M22 12A10 10 0 1 1 2 12A10 10 0 1 1 22 12',
  };
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.info}/></svg>
