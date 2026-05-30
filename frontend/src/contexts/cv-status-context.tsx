/**
 * CareerPilot — CV Status Context
 * =================================
 * Shared React Context for CV upload status.
 * Allows any component (sidebar, profile, dashboard, etc.) to read
 * the current CV status and trigger a refresh after upload/clear,
 * eliminating the need for a full page refresh.
 */

"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { getCVStatus } from "@/lib/api";

interface CvStatus {
  uploaded: boolean;
  filename: string;
  chunk_count: number;
  sections_detected: string[];
}

interface CvStatusContextValue {
  cvStatus: CvStatus;
  refreshCvStatus: () => Promise<void>;
}

const DEFAULT_STATUS: CvStatus = {
  uploaded: false,
  filename: "",
  chunk_count: 0,
  sections_detected: [],
};

const CvStatusContext = createContext<CvStatusContextValue>({
  cvStatus: DEFAULT_STATUS,
  refreshCvStatus: async () => {},
});

export function CvStatusProvider({ children }: { children: ReactNode }) {
  const [cvStatus, setCvStatus] = useState<CvStatus>(DEFAULT_STATUS);

  const refreshCvStatus = useCallback(async () => {
    try {
      const status = await getCVStatus();
      setCvStatus(status);
    } catch {
      setCvStatus(DEFAULT_STATUS);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    refreshCvStatus();
  }, [refreshCvStatus]);

  return (
    <CvStatusContext.Provider value={{ cvStatus, refreshCvStatus }}>
      {children}
    </CvStatusContext.Provider>
  );
}

export function useCvStatus() {
  return useContext(CvStatusContext);
}
