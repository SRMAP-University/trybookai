"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/marketing/landing-showcase";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/features", label: "Features" },
  { href: "/books", label: "Books" },
  { href: "/blog", label: "Blog" },
  { href: "/#pricing", label: "Pricing" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#f3f3f1]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-[72px] max-w-[1200px] items-center px-6">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <LogoMark className="h-7 w-7" />
          <span className="text-[17px] font-bold tracking-tight text-[#111]">
            BookAI
          </span>
        </Link>

        {/* Center nav — desktop */}
        <div className="hidden flex-1 items-center justify-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1 text-[14px] text-[#444] transition-colors hover:text-[#111]"
            >
              {link.label}
              {(link.label === "Product") && (
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              )}
            </a>
          ))}
        </div>

        {/* Right actions */}
        <div className="ml-auto hidden items-center gap-5 md:flex">
          <Link
            href="/login"
            className="text-[14px] text-[#444] hover:text-[#111]"
          >
            Sign in
          </Link>
          <Link href="/register" className="landing-btn-dark !py-2 !px-4 !text-[13px]">
            Get started
          </Link>
        </div>

        <button
          className="ml-auto text-[#111] md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-t border-[#e8e8e6] bg-[#f3f3f1] px-6 py-5 md:hidden">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[15px] text-[#111]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <Link href="/register" className="landing-btn-dark mt-2 text-center">
              Get started
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
