import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Compass,
  LayoutGrid,
  Layers,
  MoreHorizontal,
  Radar,
  Radio,
  Scale,
  Shield,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LatticeMark } from "@/components/marks";
import { RulesLine } from "@/components/rules-covenant";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAlgm } from "@/lib/store";

const PRIMARY = [
  { to: "/", label: "Command", icon: LayoutGrid },
  { to: "/advisor", label: "Advisor", icon: Compass },
  { to: "/honesty", label: "Honesty", icon: Shield },
  { to: "/learn", label: "Learn", icon: BookOpen },
] as const;

const MORE = [
  { to: "/rules", label: "Rules", icon: Scale },
  { to: "/live", label: "Live atlas", icon: Radio },
  { to: "/stack", label: "Stack", icon: Layers },
  { to: "/watch", label: "Watch", icon: Radar },
] as const;

function usePath() {
  return useRouterState({ select: (s) => s.location.pathname });
}

function NavLink({
  to,
  label,
  icon: Icon,
  rail,
}: {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  rail?: boolean;
}) {
  const path = usePath();
  const active = to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-3 rounded-lg transition-colors duration-150",
        rail
          ? "h-11 px-3 text-sm"
          : "h-12 min-w-0 flex-1 flex-col justify-center gap-0.5 px-1 text-xs tracking-wide",
        active ? "bg-raised text-fg" : "text-muted hover:bg-raised/70 hover:text-fg",
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span className={cn(!rail && "truncate")}>{label}</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const held = useAlgm(
    (s) => s.investigations.filter((i) => i.status === "held" || i.status === "inspecting").length,
  );
  const [menu, setMenu] = useState(false);
  const path = usePath();

  useEffect(() => {
    void useAlgm.persist.rehydrate();
  }, []);

  useEffect(() => {
    setMenu(false);
  }, [path]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-52 flex-col border-r border-line bg-bg/80 px-3 py-5 md:flex">
        <Link to="/" className="mb-8 flex items-center gap-2.5 px-2">
          <LatticeMark className="size-7" />
          <div>
            <p className="font-display text-lg leading-none tracking-tight">ALGM</p>
            <p className="mt-1 text-xs tracking-[0.14em] text-muted uppercase">On-device</p>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {PRIMARY.map((item) => (
            <NavLink key={item.to} rail {...item} />
          ))}
          <div className="my-3 h-px bg-line" />
          {MORE.map((item) => (
            <NavLink key={item.to} rail {...item} />
          ))}
        </nav>
        <RulesLine className="px-2" />
      </aside>

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-sm md:hidden">
        <Link to="/" className="flex items-center gap-2">
          <LatticeMark className="size-6" />
          <span className="font-display text-lg leading-none">ALGM</span>
        </Link>
        <Link
          to="/rules"
          className="ml-auto text-[0.625rem] tracking-[0.08em] text-muted uppercase"
        >
          No gates
        </Link>
        {held > 0 && (
          <Link
            to="/watch"
            className="rounded-full bg-warn/15 px-2 py-1 text-xs text-warn tabular-nums"
          >
            {held} held
          </Link>
        )}
      </header>

      <div className="md:pl-52">
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 pb-28 md:px-8 md:pt-8 md:pb-12">
          {children}
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-bg/95 px-1 pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] md:hidden">
        {PRIMARY.map((item) => (
          <NavLink key={item.to} {...item} />
        ))}
        <Sheet open={menu} onOpenChange={setMenu}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs tracking-wide text-muted"
            >
              <MoreHorizontal className="size-4" />
              More
            </button>
          </SheetTrigger>
          <SheetContent side="bottom">
            <SheetTitle className="pr-10">More</SheetTitle>
            <div className="mt-4 grid gap-2">
              {MORE.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex h-12 items-center gap-3 rounded-xl bg-raised px-4 text-sm"
                >
                  <item.icon className="size-4 text-accent" />
                  {item.label}
                  {item.to === "/watch" && held > 0 && (
                    <span className="ml-auto text-warn tabular-nums">{held} held</span>
                  )}
                </Link>
              ))}
              <Button
                variant="outline"
                className="mt-2"
                onClick={() => useAlgm.getState().clearDevice()}
              >
                Clear on-device state
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}

export function PageHeader({
  kicker,
  title,
  lede,
  action,
}: {
  kicker: string;
  title: string;
  lede?: string;
  action?: ReactNode;
}) {
  return (
    <header className="rise mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-xs font-medium tracking-[0.16em] text-muted uppercase">{kicker}</p>
        <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        {lede && <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">{lede}</p>}
      </div>
      {action}
    </header>
  );
}
