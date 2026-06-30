import { beforeEach, describe, expect, it, vi } from "vitest";

// The panel is an async Server Component, so we can invoke it directly and
// assert on its return value — no DOM render needed. getCaller is the gate;
// getUserList backs the row list. next/cache + sonner are mocked only so the
// transitive import graph (via the switch + action) loads under node.
const { getCaller, getUserList } = vi.hoisted(() => ({
  getCaller: vi.fn(),
  getUserList: vi.fn(),
}));

vi.mock("@/lib/superuser", () => ({ getCaller }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { getUserList } })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

import { SuperUserPanel } from "@/components/super-user-panel";

describe("SuperUserPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing for a non-super-user", async () => {
    getCaller.mockResolvedValue({ isSuperuser: false, userId: "u1" });
    expect(await SuperUserPanel()).toBeNull();
    // Never reaches Clerk for the user list when the caller isn't a super-user.
    expect(getUserList).not.toHaveBeenCalled();
  });

  it("renders the panel for a super-user", async () => {
    getCaller.mockResolvedValue({ isSuperuser: true, userId: "u1" });
    getUserList.mockResolvedValue({
      data: [
        {
          emailAddresses: [],
          fullName: "Ann Operator",
          id: "u1",
          primaryEmailAddressId: null,
          publicMetadata: { superuser: true },
          username: null,
        },
      ],
    });
    expect(await SuperUserPanel()).not.toBeNull();
    expect(getUserList).toHaveBeenCalled();
  });
});
