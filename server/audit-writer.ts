import "server-only";

import { LOG_VIEWS_KEY } from "../platform/domain/settings";
import { PrismaAuditWriter } from "../platform/infrastructure/prisma-audit-writer";
import { getDb } from "./db";
import { getSettingsReader } from "./settings-reader";

/** Whether view and list actions are recorded (the audit.log_views setting; off by default). */
export const logViews = () => getSettingsReader().getFlag(LOG_VIEWS_KEY);

/** The one way server code creates an audit writer, so the setting applies everywhere. */
export const createAuditWriter = () => new PrismaAuditWriter(getDb(), logViews);
