import { Prisma, PrismaClient } from '@prisma/client';

type AuditClient = PrismaClient | Prisma.TransactionClient;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'currentPassword',
  'newPassword',
  'confirmPassword',
  'current_password',
  'new_password',
  'confirm_password',
  'accessToken',
  'token',
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      if (!SENSITIVE_KEYS.has(key) && nestedValue !== undefined) {
        sanitized[key] = sanitizeValue(nestedValue);
      }
    }
    return sanitized;
  }
  return value;
}

function sanitizeAuditData(data?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!data) {
    return undefined;
  }

  return sanitizeValue(data) as Prisma.InputJsonValue;
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
