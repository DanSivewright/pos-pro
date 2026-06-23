"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { ControlTower } from "@/components/control-tower";
import { UploadCashup } from "@/components/upload-cashup";

export default function Dashboard() {
  return (
    <>
      <Authenticated>
        <main className="container mx-auto max-w-5xl px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="font-semibold text-2xl">Control Tower</h1>
            <div className="flex items-center gap-4">
              <UploadCashup />
              <UserButton />
            </div>
          </header>
          <ControlTower />
        </main>
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
