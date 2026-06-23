"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@pos-pro/ui/components/sheet";
import { cn } from "@pos-pro/ui/lib/utils";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { LayoutGrid, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ModeToggle } from "./mode-toggle";

interface NavItem {
  href: string;
  icon: typeof LayoutGrid;
  isActive: (pathname: string) => boolean;
  label: string;
}

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Control Tower",
    icon: LayoutGrid,
    isActive: (pathname) =>
      pathname === "/dashboard" || pathname.startsWith("/dashboard/stores"),
  },
];

function Brand() {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <span
        aria-hidden="true"
        className="flex size-7 items-center justify-center rounded-md bg-primary font-semibold text-primary-foreground text-sm"
      >
        P
      </span>
      <span className="font-semibold text-sm tracking-tight">pos-pro</span>
    </div>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      <p className="px-2.5 pt-2 pb-1 font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
        Workspace
      </p>
      {NAV.map((item) => {
        const active = item.isActive(pathname);
        const Icon = item.icon;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-2.5 rounded-md px-2.5 font-medium text-sm md:h-9",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-auto flex items-center justify-between gap-2 border-sidebar-border border-t px-2 pt-3">
      <div className="flex items-center gap-2">
        <UserButton />
        <span className="text-muted-foreground text-xs">Account</span>
      </div>
      <ModeToggle />
    </div>
  );
}

function DesktopSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1 px-3 py-4 md:flex">
      <Brand />
      <div className="mt-2 flex min-h-0 flex-1 flex-col">
        <SidebarNav />
      </div>
      <SidebarFooter />
    </aside>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        aria-label="Open navigation"
        className="-ml-1 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground md:hidden"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        className="flex w-72 flex-col gap-1 bg-sidebar p-3"
        side="left"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Primary navigation for pos-pro
        </SheetDescription>
        <Brand />
        <div className="mt-2 flex min-h-0 flex-1 flex-col">
          <SidebarNav onNavigate={() => setOpen(false)} />
        </div>
        <SidebarFooter />
      </SheetContent>
    </Sheet>
  );
}

export function PageHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2 px-4 pt-3 pb-2 md:px-5">
      <MobileNav />
      <h1 className="font-semibold text-lg tracking-tight md:text-xl">
        {title}
      </h1>
      {actions && (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

export function Canvas({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 px-2 md:pr-3 md:pl-1">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-t-xl border border-border border-b-0 bg-background">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Authenticated>
        <div className="flex h-svh bg-shell text-foreground">
          <DesktopSidebar />
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      </Authenticated>
      <Unauthenticated>
        <div className="flex min-h-svh items-center justify-center">
          <SignInButton />
        </div>
      </Unauthenticated>
      <AuthLoading>
        <div className="flex min-h-svh items-center justify-center text-muted-foreground">
          Loading…
        </div>
      </AuthLoading>
    </>
  );
}
