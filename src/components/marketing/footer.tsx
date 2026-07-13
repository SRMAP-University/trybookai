import Link from "next/link";
import { LogoMark } from "@/components/marketing/landing-showcase";

export function Footer() {
  return (
    <footer className="border-t border-[#e8e8e6] py-10">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-8 px-6 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark className="h-6 w-6" />
          <span className="text-[15px] font-bold text-[#111]">BookAI</span>
        </Link>

        <div className="flex flex-wrap gap-x-8 gap-y-2 text-[14px] text-[#6b6b6b]">
          <Link href="/books" className="hover:text-[#111]">
            Books
          </Link>
          <Link href="/#pricing" className="hover:text-[#111]">
            Pricing
          </Link>
          <Link href="/login" className="hover:text-[#111]">
            Sign in
          </Link>
        </div>

        <p className="text-[13px] text-[#6b6b6b]">
          © {new Date().getFullYear()} BookAI
        </p>
      </div>
    </footer>
  );
}
