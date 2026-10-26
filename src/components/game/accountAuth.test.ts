import { describe, expect, it, vi } from "vitest";
import { signInWithPassword } from "./accountAuth";

describe("password sign-in", () => {
  it("submits the supplied credentials and accepts a successful response", async () => {
    const signIn = vi.fn().mockResolvedValue({ error: null });

    await expect(
      signInWithPassword({ signInWithPassword: signIn }, "agent@example.test", "training-only"),
    ).resolves.toBeUndefined();
    expect(signIn).toHaveBeenCalledWith({
      email: "agent@example.test",
      password: "training-only",
    });
  });

  it("surfaces authentication failures to the caller", async () => {
    const authError = new Error("mock invalid credentials");
    const signIn = vi.fn().mockResolvedValue({ error: authError });

    await expect(
      signInWithPassword({ signInWithPassword: signIn }, "agent@example.test", "wrong"),
    ).rejects.toBe(authError);
  });
});
