"use client";

import { useEffect, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getLicenseStatus } from "@/lib/api";
import { AlertTriangle } from "lucide-react";

interface LicenseStatus {
  status: "licensed" | "trial" | "expired" | "invalid" | "developer_unlimited";
  days_left: number | null;
}

const TRIAL_WARNING_DAYS = 3;

export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [banner, setBanner] = useState(false);

  const check = useCallback(async () => {
    try {
      const r = await getLicenseStatus();
      const s: LicenseStatus = r.data;
      setStatus(s);

      if (s.status === "developer_unlimited") {
        // Developer machine — bypass everything silently
      } else if (s.status === "expired" || s.status === "invalid") {
        router.replace("/activate");
      } else if (s.status === "trial" && s.days_left !== null && s.days_left <= TRIAL_WARNING_DAYS) {
        setBanner(true);
      }
    } catch {
      // Backend not reachable — allow through (Tauri loads backend async)
    } finally {
      setChecked(true);
    }
  }, [router]);

  useEffect(() => { check(); }, [check]);

  if (pathname === "/activate") return <>{children}</>;

  if (!checked) return null;

  return (
    <>
      {banner && status?.status === "trial" && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500/90 text-black text-center py-1.5 text-xs font-medium flex items-center justify-center gap-2">
          <AlertTriangle size={12} />
          Trial mode — {status.days_left} day{status.days_left !== 1 ? "s" : ""} remaining.
          <button
            onClick={() => router.push("/activate")}
            className="underline font-bold ml-1"
          >
            Activate Now
          </button>
          <button onClick={() => setBanner(false)} className="ml-2 opacity-60 hover:opacity-100">&times;</button>
        </div>
      )}
      {children}
    </>
  );
}
