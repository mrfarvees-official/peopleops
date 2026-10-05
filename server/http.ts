import "server-only";

import { ZodError } from "zod";
import type { ForbiddenError } from "../platform/domain/pbac";
import type { PolicyReferenceError } from "../platform/application/pbac-ports";
import { getCurrentUser, requestInfo, sameOrigin } from "./session";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Unauthenticated");
    this.name = "UnauthenticatedError";
  }
}

export async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  return user;
}

export async function requestCtx() {
  const { ip } = await requestInfo();
  return { ip, requestId: crypto.randomUUID() };
}

const fail = (status: number, error: string, extra?: object) =>
  Response.json({ error, ...extra }, { status });

/** Wraps a route handler and maps domain errors to HTTP responses. */
export function api<A extends unknown[]>(
  handler: (req: Request, ...rest: A) => Promise<Response>,
  opts: { mutating?: boolean } = {},
) {
  return async (req: Request, ...rest: A): Promise<Response> => {
    if (opts.mutating && !sameOrigin(req)) return fail(403, "Forbidden");
    try {
      return await handler(req, ...rest);
    } catch (e) {
      // Matched by name: the bundler can load a module twice, which breaks instanceof.
      const name = (e as Error | undefined)?.name;
      if (name === "UnauthenticatedError") return fail(401, "Unauthorized");
      if (name === "ForbiddenError") {
        return fail(403, "Forbidden", {
          reason: (e as ForbiddenError).decision.reason,
        });
      }
      if (name === "PolicyNotFoundError") return fail(404, "Policy not found");
      if (name === "UnknownSettingError") return fail(404, "Unknown setting");
      if (name === "InvalidSettingValueError") {
        return fail(400, (e as Error).message);
      }
      if (name === "ValidationError") {
        return fail(400, (e as Error).message, {
          issues: (e as { details?: unknown }).details,
        });
      }
      if (name === "RecordNotFoundError" || name === "ModuleNotFoundError") {
        return fail(404, (e as Error).message);
      }
      if (name === "ConflictError" || name === "InvalidTransitionError") {
        return fail(409, (e as Error).message);
      }
      if (name === "ReadOnlyModuleError") return fail(405, (e as Error).message);
      if (name === "UnknownTableError" || name === "BackupNotFoundError") {
        return fail(404, (e as Error).message);
      }
      if (name === "TableCapabilityError") return fail(409, (e as Error).message);
      if (name === "DataFormatError" || name === "CsvSyntaxError") {
        return fail(400, (e as Error).message);
      }
      if (name === "PayloadTooLargeError") return fail(413, (e as Error).message);
      if (name === "BackupCorruptError") return fail(422, (e as Error).message);
      if (name === "ImportFailedError") {
        return fail(422, (e as Error).message, {
          reports: (e as { reports: unknown }).reports,
        });
      }
      if (name === "PolicyImmutableError" || name === "PolicyCodeTakenError") {
        return fail(409, (e as Error).message);
      }
      if (name === "PolicyReferenceError") {
        return fail(400, "Unknown references", {
          missing: (e as PolicyReferenceError).missing,
        });
      }
      if (e instanceof ZodError) {
        return fail(400, "Invalid request", { issues: e.issues });
      }
      if (e instanceof SyntaxError) return fail(400, "Invalid JSON");
      throw e;
    }
  };
}
