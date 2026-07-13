"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { readJson } from "@/lib/api";

export type DashboardUser = {
  plan: string;
  pagesUsed: number;
  pagesLimit: number;
  audioMinutesUsed?: number;
  audioMinutesLimit?: number;
  trialEndsAt?: string | null;
  hasUsedPremiumTrial?: boolean;
  hasStripeSubscription?: boolean;
  onTrial?: boolean;
  name: string | null;
  email: string;
};

type DashboardUserContextValue = {
  user: DashboardUser | null;
  refresh: () => void;
};

const DashboardUserContext = createContext<DashboardUserContextValue>({
  user: null,
  refresh: () => undefined,
});

export function DashboardUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<DashboardUser | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/settings")
      .then(async (res) => {
        const result = await readJson<DashboardUser>(res);
        if (result.ok) setUser(result.data);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <DashboardUserContext.Provider value={{ user, refresh }}>
      {children}
    </DashboardUserContext.Provider>
  );
}

export function useDashboardUser() {
  return useContext(DashboardUserContext);
}
