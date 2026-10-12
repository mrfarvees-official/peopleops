"use server";

import { getSignup } from "@/server/accounts";
import { getAuth } from "@/server/auth";
import {
  clearSessionCookie,
  readSessionToken,
  requestInfo,
  setSessionCookie,
} from "@/server/session";
import { redirect } from "next/navigation";
import type { ZodError } from "zod";

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

export interface SignupState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

// Same reason as SIGN_IN_FAILURES: matched by name, never instanceof.
export async function signupAction(
  _previous: SignupState | null,
  formData: FormData,
): Promise<SignupState | null> {
  const password = formData.get("password");
  if (password !== formData.get("confirm")) {
    return { fieldErrors: { confirm: "The passwords do not match" } };
  }
  try {
    const info = await requestInfo();
    const raw = {
      companyName: formData.get("companyName"),
      displayName: formData.get("displayName"),
      email: formData.get("email"),
      password,
      country: formData.get("country") || undefined,
    };
    const created = await getSignup().signUp(raw, {
      ip: info.ip,
      requestId: crypto.randomUUID(),
    });
    // Sign the new admin straight in.
    const session = await getAuth().login(
      { email: created.email, password },
      info,
    );
    await setSessionCookie(session.token, session.expiresAt);
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === "ZodError") {
      const fieldErrors: Record<string, string> = {};
      for (const i of (error as ZodError).issues) {
        fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
      }
      return { fieldErrors };
    }
    if (name === "SignupRateLimitError") {
      return { error: (error as Error).message };
    }
    throw error;
  }
  redirect("/dashboard");
}
