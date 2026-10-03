"use server";

import { ZodError } from "zod";
import { InvalidCredentialsError } from "@/platform/domain/auth";
import { getAuth } from "@/server/auth";
import { clearSessionCookie, readSessionToken, requestInfo, setSessionCookie } from "@/server/session";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
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
    if (error instanceof InvalidCredentialsError) {
      return { error: "Invalid sign-in details" };
    }

    if (error instanceof ZodError) {
      return { error: "Invalid sign-in details" };
    }

    throw error;
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await getAuth().logout(
    await readSessionToken(),
    await requestInfo(),
  );

  await clearSessionCookie();

  redirect("/login");
}