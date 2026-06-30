import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Clerk + Next cache boundaries; the action's gate and guardrail logic
// runs for real. getUser resolves the caller (via getCaller); getUserList backs
// the last-super-user guard; updateUserMetadata is the write we assert on.
const { authMock, getUser, getUserList, updateUserMetadata, revalidatePath } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    getUser: vi.fn(),
    getUserList: vi.fn(),
    updateUserMetadata: vi.fn(),
    revalidatePath: vi.fn(),
  }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: vi.fn(async () => ({
    users: { getUser, getUserList, updateUserMetadata },
  })),
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import { setSuperuser } from "./super-user-actions";

const NOT_SUPERUSER = /Only super-users/;
const SELF_DEMOTE = /your own super-user access/;
const LAST_SUPERUSER = /At least one super-user must remain/;

function callerIsSuper(isSuperuser: boolean) {
  authMock.mockResolvedValue({ userId: "caller" });
  getUser.mockResolvedValue({ publicMetadata: { superuser: isSuperuser } });
}

function usersData(...users: { id: string; superuser: boolean }[]) {
  return {
    data: users.map((user) => ({
      id: user.id,
      publicMetadata: { superuser: user.superuser },
    })),
  };
}

function userList(...users: { id: string; superuser: boolean }[]) {
  getUserList.mockResolvedValue(usersData(...users));
}

describe("setSuperuser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateUserMetadata.mockResolvedValue({});
  });

  it("rejects a caller who is not a super-user", async () => {
    callerIsSuper(false);
    await expect(setSuperuser("target", true)).rejects.toThrow(NOT_SUPERUSER);
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("promotes another user and revalidates the dashboard", async () => {
    callerIsSuper(true);
    await setSuperuser("target", true);
    expect(updateUserMetadata).toHaveBeenCalledWith("target", {
      publicMetadata: { superuser: true },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    // Promotion never needs the last-super-user scan.
    expect(getUserList).not.toHaveBeenCalled();
  });

  it("refuses to let a super-user demote themselves", async () => {
    callerIsSuper(true);
    await expect(setSuperuser("caller", false)).rejects.toThrow(SELF_DEMOTE);
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("refuses to demote the last remaining super-user", async () => {
    callerIsSuper(true);
    // Only "target" is left as a super-user in the directory.
    userList({ id: "target", superuser: true });
    await expect(setSuperuser("target", false)).rejects.toThrow(LAST_SUPERUSER);
    expect(updateUserMetadata).not.toHaveBeenCalled();
  });

  it("demotes a super-user when another remains", async () => {
    callerIsSuper(true);
    userList(
      { id: "caller", superuser: true },
      { id: "target", superuser: true }
    );
    await setSuperuser("target", false);
    expect(updateUserMetadata).toHaveBeenCalledWith("target", {
      publicMetadata: { superuser: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("rolls back its own demote if a concurrent demote emptied the roster", async () => {
    callerIsSuper(true);
    // Pre-check sees two supers; by the post-write re-count a racing demote has
    // left none, so the action must undo its own write.
    getUserList
      .mockResolvedValueOnce(
        usersData(
          { id: "caller", superuser: true },
          { id: "target", superuser: true }
        )
      )
      .mockResolvedValueOnce(usersData());
    await expect(setSuperuser("target", false)).rejects.toThrow(LAST_SUPERUSER);
    expect(updateUserMetadata).toHaveBeenNthCalledWith(1, "target", {
      publicMetadata: { superuser: false },
    });
    expect(updateUserMetadata).toHaveBeenNthCalledWith(2, "target", {
      publicMetadata: { superuser: true },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
