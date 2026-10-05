"use server";

import { getAuth } from "@/server/auth";
import {
  clearSessionCookie,
  readSessionToken,
  requestInfo,
  setSessionCookie,
} from "@/server/session";
import { redirect } from "next/navigation";

// Matched by name, not instanceof: after a hot reload the running auth service
// can hold an older copy of the error class, and a wrong password must never
// turn into a crash.
const SIGN_IN_FAILURES = ["InvalidCredentialsError", "ZodError"];

export async function loginAction(
  _previous: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  try {
    const result = await getAuth().login(
      {
        email: formData.get("email"),
        password: formData.get("password"),
      },
      await requestInfo(),
    );

    await setSessionCookie(result.token, result.expiresAt);
  } catch (error) {
    if (SIGN_IN_FAILURES.includes((error as Error)?.name)) {
      return {
        error:
          "That email and password do not match. Check them and try again.",
      };
    }

    throw error;
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await getAuth().logout(await readSessionToken(), await requestInfo());

  await clearSessionCookie();

  redirect("/login");
}
