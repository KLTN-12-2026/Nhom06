import { sanitizeAuditDataForRead } from './sanitize-audit-data';

describe('sanitizeAuditDataForRead', () => {
  it('trả về null khi đầu vào là null hoặc undefined', () => {
    expect(sanitizeAuditDataForRead(null)).toBeNull();
    expect(sanitizeAuditDataForRead(undefined)).toBeNull();
  });

  it('lọc các khóa nhạy cảm ở cả cấp ngoài, object lồng nhau và mảng (AC3)', () => {
    const raw = {
      username: 'nhanvien',
      password: 'plain-password',
      passwordHash: '$2b$10$secrethash',
      password_hash: '$2b$10$secrethash2',
      token: 'raw-token',
      accessToken: 'jwt-token',
      refresh_token: 'refresh-secret',
      apiKey: 'sk-123456',
      api_key: 'sk-abcdef',
      clientSecret: 'super-secret',
      authorization: 'Bearer xyz',
      nested: {
        status: 'locked',
        newPassword: 'new-password',
        llmApiKey: 'sk-llm',
      },
      items: [
        { lotCode: 'LO-01', access_token: 'hidden-token' },
        { lotCode: 'LO-02', qty: '10' },
      ],
    };

    const sanitized = sanitizeAuditDataForRead(raw);

    expect(sanitized).toEqual({
      username: 'nhanvien',
      nested: {
        status: 'locked',
      },
      items: [{ lotCode: 'LO-01' }, { lotCode: 'LO-02', qty: '10' }],
    });
  });

  it('giữ nguyên các kiểu dữ liệu nguyên thủy và khóa nghiệp vụ bình thường', () => {
    expect(
      sanitizeAuditDataForRead({
        receiptNo: 'PN2611230001',
        totalQty: '120',
        sessionsInvalidated: true,
        count: 3,
      }),
    ).toEqual({
      receiptNo: 'PN2611230001',
      totalQty: '120',
      sessionsInvalidated: true,
      count: 3,
    });
  });
});
