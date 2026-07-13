"use client";

import { SessionProvider } from "next-auth/react";
import {
  DashboardSidebar,
  MobileDashboardNav,
} from "@/components/dashboard/sidebar";
import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardUserProvider } from "@/components/dashboard/user-context";
import { GlobalGenerationWidget } from "@/components/dashboard/global-generation-widget";
import { ExplorationNotice } from "@/components/dashboard/exploration-notice";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      <DashboardUserProvider>
        <div className="min-h-screen bg-white">
          <DashboardSidebar />
          <div className="lg:pl-[240px]">
            <DashboardHeader />
            <ExplorationNotice />
            <main className="px-4 py-8 pb-24 lg:px-10 lg:pb-10">
              <div className="mx-auto max-w-[960px]">{children}</div>
            </main>
          </div>
          <MobileDashboardNav />
          <GlobalGenerationWidget />
        </div>
      </DashboardUserProvider>
    </SessionProvider>
  );
}
