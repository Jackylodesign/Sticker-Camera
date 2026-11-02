// The Sticker Index mark: a sticker with its corner peeling up.
// Drawn with lines in the current text colour, so it matches the wordmark.
// Swap this file for another SVG to change the icon.
export default function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // 2.4 in a 24px box = 1.8px at 18px, about the stem width of the
      // 18px Medium wordmark next to it.
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* sheet, with the top-right corner cut off */}
      <path d="M14 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-8" />
      {/* the corner folded back */}
      <path d="M14 3v4a3 3 0 0 0 3 3h4z" />
    </svg>
  );
}
