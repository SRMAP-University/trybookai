import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Editor",
  robots: { index: false, follow: false },
};

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-white">{children}</div>
  );
}
