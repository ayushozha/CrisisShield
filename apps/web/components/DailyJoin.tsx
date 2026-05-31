"use client";

import { useState } from "react";
import { Video, ExternalLink } from "lucide-react";
import type { AdapterContract } from "@/lib/types";

// Joins a real Daily realtime AI session when one is live. The Daily SDK is an
// optionalDependency and imported dynamically, so the dashboard builds and runs
// even when the SDK isn't installed (fixture mode just shows the session URL).
export function DailyJoin({
  daily,
  mode,
}: {
  daily?: AdapterContract;
  mode: "live" | "fixture";
}) {
  const [status, setStatus] = useState<string>("idle");
  const url = daily?.proof?.session_url as string | undefined;
  const isLive = daily?.mode === "live" && mode === "live";

  async function join() {
    if (!url) return;
    setStatus("connecting");
    try {
      const mod: any = await import("@daily-co/daily-js").catch(() => null);
      if (!mod?.default) {
        // SDK absent — open the room in a new tab as the fallback.
        window.open(url, "_blank");
        setStatus("opened in tab (SDK not installed)");
        return;
      }
      const call = mod.default.createCallObject();
      call.on("joined-meeting", () => setStatus("joined"));
      call.on("participant-joined", () => setStatus("participant joined"));
      call.on("left-meeting", () => setStatus("left"));
      await call.join({ url });
      setStatus("joined");
    } catch {
      window.open(url, "_blank");
      setStatus("opened in tab");
    }
  }

  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2">
      <div className="flex items-center gap-2">
        <Video size={14} className="text-[var(--color-accent)]" />
        <div>
          <div className="text-[11px] font-semibold">Daily realtime AI session</div>
          <div className="mono truncate text-[10px] text-[var(--color-muted)]" style={{ maxWidth: 340 }}>
            {url ?? "no session"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {status !== "idle" && (
          <span className="mono text-[10px] text-[var(--color-ok)]">{status}</span>
        )}
        <button
          onClick={join}
          disabled={!url}
          className="mono inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-40"
          style={{
            background: isLive ? "var(--color-accent)" : "var(--color-line-bright)",
            color: isLive ? "#0a0c12" : "var(--color-fg)",
          }}
          title={isLive ? "Join the live Daily session" : "Fixture session — opens the room URL"}
        >
          {isLive ? "Join live" : "Open"} <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
}
