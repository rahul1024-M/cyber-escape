/**
 * Auth abstraction. Accounts are not enabled (FLAGS.ENABLE_ACCOUNTS = false);
 * every player is a local guest identified by their codename.
 */
import { isEnabled } from "../flags";
import { storageService } from "./storageService";
import type { AuthUser } from "../platform";

const notAvailable = () =>
  Promise.reject(new Error("Accounts are not available yet. You are playing as a guest."));

export const authService = {
  available: () => isEnabled("ENABLE_ACCOUNTS"),
  async getCurrentUser(): Promise<AuthUser | null> {
    const p = storageService.loadPlayer();
    return p ? { id: p.id, codename: p.name, guest: true } : null;
  },
  signIn: (_email: string, _password: string) => notAvailable(),
  signUp: (_email: string, _password: string) => notAvailable(),
  signOut: () => notAvailable(),
  resetPassword: (_email: string) => notAvailable(),
};
