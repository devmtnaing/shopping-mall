// Inline SVG icons (stroke style, 20px). Kept tiny on purpose: no icon font, no extra requests.
type P = { size?: number };
const svg = (d: string) =>
  function Icon({ size = 20 }: P) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d={d} />
      </svg>
    );
  };

export const IconHelp = svg(
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
);
export const IconExpand = svg('M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7');
export const IconClose = svg('M18 6 6 18M6 6l12 12');
export const IconStore = svg('M3 9l1.5-5h15L21 9M3 9h18M3 9v11h18V9M9 20v-6h6v6');
export const IconLayers = svg('M12 3 2 8l10 5 10-5-10-5zM2 16l10 5 10-5M2 12l10 5 10-5');
export const IconShare = svg('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13');
export const IconGlobe = svg(
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
);
export const IconSound = svg('M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14');
export const IconMuted = svg('M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6');
export const IconChat = svg('M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z');
