"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { GoogleButton } from "@/components/auth/google-button";

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prompt = searchParams.get("prompt");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error ?? "Registration failed");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      toast.error("Account created but sign-in failed. Please log in.");
      router.push("/login");
      return;
    }

    toast.success("Welcome to BookAI");
    router.push("/dashboard");
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
          Create your account
        </h1>
        <p className="mt-2 text-[14px] text-[#425466]">
          50 pages included every month
        </p>
      </div>

      {prompt && (
        <div className="mb-6 flex items-start gap-3 rounded-md border border-[#e6ebf1] bg-[#f0efff] px-4 py-3.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white">
            <Sparkles className="h-3.5 w-3.5 text-[#635bff]" />
          </span>
          <p className="text-[13px] leading-relaxed text-[#425466]">
            We&rsquo;ll start from your idea:{" "}
            <span className="line-clamp-2 text-[#0a2540]">
              &ldquo;{prompt}&rdquo;
            </span>
          </p>
        </div>
      )}

      <div className="rounded-lg border border-[#e6ebf1] bg-white p-7 stripe-shadow-sm sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-[13px] font-medium text-[#0a2540]"
            >
              Name
            </label>
            <input
              id="name"
              name="name"
              placeholder="Your name"
              className="auth-field"
              required
            />
          </div>
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
              placeholder="Min. 8 characters"
              className="auth-field"
              minLength={8}
              required
            />
          </div>
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            Create account
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[#e6ebf1]" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase tracking-wide text-[#697386]">
            <span className="bg-white px-3">or continue with</span>
          </div>
        </div>

        <GoogleButton callbackUrl={callbackUrl} />
      </div>

      <p className="mt-6 text-center text-[13px] text-[#697386]">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-[#635bff] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
