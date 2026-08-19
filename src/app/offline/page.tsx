import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f9fc] px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ebe9ff] text-[#635bff]">
        <WifiOff className="h-7 w-7" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-[-0.03em] text-[#0a2540]">
        You&apos;re offline
      </h1>
      <p className="mt-3 max-w-md text-[15px] leading-relaxed text-[#697386]">
        BookAI needs an internet connection for generation, billing, and sync.
        Reconnect and try again.
      </p>
      <Button
        asChild
        className="mt-8 h-11 rounded-full bg-[#635bff] px-6 hover:bg-[#5851e5]"
      >
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}
