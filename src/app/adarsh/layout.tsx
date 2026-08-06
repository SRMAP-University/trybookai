import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Adarsh Admin — BookAI",
  robots: { index: false, follow: false },
};

const links = [
  { href: "/adarsh", label: "Overview" },
  { href: "/adarsh/users", label: "Users" },
  { href: "/adarsh/books", label: "Generations" },
  { href: "/adarsh/feedback", label: "Complaints" },
];

export default async function AdarshLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  if (!session) {
    redirect("/login?callbackUrl=/adarsh");
  }

  return (
    <div className="min-h-screen bg-[#f6f9fc] text-[#0a2540]">
      <header className="border-b border-[#e6ebf1] bg-white">
        <div className="mx-auto flex max-w-[1200px] items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/adarsh" className="text-[15px] font-semibold tracking-[-0.02em]">
            Adarsh Admin
          </Link>
          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 text-[13px] text-[#425466] hover:bg-[#f0efff] hover:text-[#635bff]"
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/dashboard"
            className="text-[12px] text-[#697386] hover:text-[#0a2540]"
          >
            ← Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
