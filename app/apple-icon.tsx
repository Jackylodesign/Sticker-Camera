// Home-screen icon for iPhone (180×180): the logo mark on the dark background.
import { ImageResponse } from "next/og";
import { LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e0e0e",
      }}
    >
      <svg
        width={104}
        height={104}
        viewBox={LOGO_VIEWBOX}
        fill="none"
        stroke="#fff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {LOGO_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>,
    size,
  );
}
