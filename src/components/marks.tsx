import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * ALGM's mark: the stone that sits between the two endpoints in the wordmark.
 * Drawn from /algm-stone.png (128px, transparent), shown at 24–28px so it stays
 * crisp on high-density screens.
 */
export function StoneMark({ className }: { className?: string }) {
  return (
    <img
      src="/algm-stone.png"
      alt=""
      aria-hidden="true"
      width={28}
      height={28}
      decoding="async"
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

export function HonestyBar({ value, className }: { value: number; className?: string }) {
  const tone = value >= 80 ? "bg-good" : value >= 60 ? "bg-warn" : "bg-bad";
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-raised", className)}
      role="img"
      aria-label={`Honesty ${value}`}
    >
      <div
        className={cn("h-full rounded-full", tone)}
        style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function LivePip({ className }: { className?: string }) {
  return (
    <span
      className={cn("live-pip inline-block size-1.5 rounded-full bg-good", className)}
      aria-hidden="true"
    />
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">{children}</p>
  );
}
