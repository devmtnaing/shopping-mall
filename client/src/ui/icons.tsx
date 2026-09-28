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
