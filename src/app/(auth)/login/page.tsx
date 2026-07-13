"use client";

import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      toast.error("Invalid email or password");
      return;
    }

    const callbackUrl =
      new URLSearchParams(window.location.search).get("callbackUrl") ??
      "/dashboard";
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div>
      {/* Mobile brand */}
      <Link
        href="/"
        className="mb-8 inline-flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-[#0a2540] lg:hidden"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#635bff]">
          <span className="text-[13px] font-bold text-white">B</span>
        </span>
        BookAI
      </Link>

      <div className="mb-8">
        <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-[#0a2540]">
          Welcome back
        </h1>
        <p className="mt-2 text-[14px] text-[#425466]">
          Sign in to continue to your dashboard
        </p>
      </div>

      <div className="rounded-lg border border-[#e6ebf1] bg-white p-7 stripe-shadow-sm sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-[13px] font-medium text-[#0a2540]"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              className="auth-field"
              required
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-[13px] font-medium text-[#0a2540]"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Enter your password"
              className="auth-field"
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Continue
          </button>
        </form>
      </div>

      <p className="mt-6 text-center text-[13px] text-[#697386]">
        New to BookAI?{" "}
        <Link href="/register" className="font-medium text-[#635bff] hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}
