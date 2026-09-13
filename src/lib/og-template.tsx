import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 };

export function OgCard({
  kicker = "BookAI",
  title,
  footer = "AI book generator · trybookai.com",
}: {
  kicker?: string;
  title: string;
  footer?: string;
}): ReactElement {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(145deg, #0a2540 0%, #1b1464 48%, #635bff 100%)",
        color: "#ffffff",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          opacity: 0.82,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: title.length > 70 ? 52 : 64,
          fontWeight: 700,
          lineHeight: 1.12,
          letterSpacing: "-0.03em",
          maxWidth: 980,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", fontSize: 26, opacity: 0.78 }}>
        {footer}
      </div>
    </div>
  );
}
