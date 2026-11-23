import { PrismaClient } from '@prisma/client';
import { writeAuditLog } from './audit-log.util';

describe('writeAuditLog', () => {
  it('loại bỏ mọi khóa mật khẩu/token ở cả tầng ngoài lẫn object lồng nhau', async () => {
    const createMock = jest.fn().mockResolvedValue({});
    const client = { auditLog: { create: createMock } } as unknown as PrismaClient;

    await writeAuditLog(client, {
      actorUserId: 'u-1',
      eventType: 'USER_PASSWORD_CHANGED',
      entityType: 'user',
      entityId: 'u-1',
      oldData: {
        password: 'old-secret',
        currentPassword: 'old-secret',
        passwordHash: '$2b$10$oldhash',
        nested: {
          newPassword: 'new-secret',
          confirmPassword: 'new-secret',
          safeField: 'ok',
        },
      },
      newData: {
        username: 'nhanvien',
        password_hash: '$2b$10$newhash',
        new_password: 'new-secret',
        accessToken: 'jwt-secret',
        sessionsInvalidated: true,
      },
    });

    const callArg = createMock.mock.calls[0][0];
    const serialized = JSON.stringify(callArg);
    expect(serialized).not.toContain('old-secret');
    expect(serialized).not.toContain('new-secret');
    expect(serialized).not.toContain('$2b$10$');
    expect(serialized).not.toContain('jwt-secret');
    expect(callArg.data.oldData).toEqual({ nested: { safeField: 'ok' } });
    expect(callArg.data.newData).toEqual({
      username: 'nhanvien',
      sessionsInvalidated: true,
    });
  });
});
