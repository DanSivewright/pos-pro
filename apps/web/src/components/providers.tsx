"use client";

import { useAuth } from "@clerk/nextjs";
import { env } from "@pos-pro/env/web";
import { Toaster } from "@pos-pro/ui/components/sonner";
import { TooltipProvider } from "@pos-pro/ui/components/tooltip";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ThemeProvider } from "./theme-provider";

const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
    >
      <TooltipProvider>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {children}
        </ConvexProviderWithClerk>
        <Toaster richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}
