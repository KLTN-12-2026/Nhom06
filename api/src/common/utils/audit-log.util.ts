import { Prisma, PrismaClient } from '@prisma/client';

type AuditClient = PrismaClient | Prisma.TransactionClient;

const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'password_hash', 'accessToken', 'token']);

function sanitizeAuditData(data?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!data) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!SENSITIVE_KEYS.has(key) && value !== undefined) {
      sanitized[key] = value;
    }
  }
  return sanitized as Prisma.InputJsonValue;
}

export interface AuditLogInput {
  actorUserId?: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
}

export async function writeAuditLog(client: AuditClient, input: AuditLogInput): Promise<void> {
  await client.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      oldData: sanitizeAuditData(input.oldData),
      newData: sanitizeAuditData(input.newData),
    },
  });
}
