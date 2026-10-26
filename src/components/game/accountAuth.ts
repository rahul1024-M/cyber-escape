interface PasswordAuth {
  signInWithPassword(credentials: { email: string; password: string }): Promise<{
    error: Error | null;
  }>;
}

export async function signInWithPassword(
  auth: PasswordAuth,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await auth.signInWithPassword({ email, password });
  if (error) throw error;
}
