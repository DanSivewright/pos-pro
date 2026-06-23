"use client";

import { SignInButton, UserButton } from "@clerk/nextjs";
import { api } from "@pos-pro/backend/convex/_generated/api";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UploadCashup } from "@/components/upload-cashup";

export default function Dashboard() {
  const stores = useQuery(api.stores.listPermitted);

  let body: ReactNode;
  if (stores === undefined) {
    body = <p className="text-muted-foreground">Loading stores…</p>;
  } else if (stores.length === 0) {
    body = <p className="text-muted-foreground">No stores available.</p>;
  } else {
    body = (
      <ul className="grid gap-3">
        {stores.map((store) => (
          <li key={store.id}>
            <Link
              className="block rounded-lg border p-4 font-medium hover:bg-muted"
              href={`/dashboard/stores/${store.id}`}
            >
              {store.name}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <Authenticated>
        <main className="container mx-auto max-w-3xl px-4 py-6">
          <header className="mb-6 flex items-center justify-between">
            <h1 className="font-semibold text-2xl">Stores</h1>
            <div className="flex items-center gap-4">
              <UploadCashup />
              <UserButton />
            </div>
          </header>
          {body}
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
