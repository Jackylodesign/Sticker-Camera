// The Sticker Index mark (lib/logo.ts), drawn with lines in the current text
// colour, so it matches the wordmark.
import { LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/logo";

export default function LogoMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={LOGO_VIEWBOX}
      fill="none"
      stroke="currentColor"
      // 2.4 in a 24px box = 1.8px at 18px, about the stem width of the
      // 18px Medium wordmark next to it.
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {LOGO_PATHS.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
