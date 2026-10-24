import { describe, expect, it } from 'vitest';
import { describeGameSaveError } from '../services/firestoreRepository';

const wrapped = (error: string) => new Error(JSON.stringify({ error, operationType: 'write', path: 'games/x' }));

describe('Kho trò chơi – báo lỗi khi lưu', () => {
  it('explains a rules rejection and never claims success', () => {
    const msg = describeGameSaveError(wrapped('Missing or insufficient permissions.'));
    expect(msg).toContain('CHƯA được lưu');
    expect(msg).toContain('quyền');
  });
  it('explains network problems', () => {
    expect(describeGameSaveError(wrapped('Failed to get document because the client is offline.'))).toContain('Không kết nối');
  });
  it('keeps other messages readable', () => {
    expect(describeGameSaveError(new Error('Máy chủ chưa ghi nhận trò chơi.'))).toBe('Trò chơi CHƯA được lưu: Máy chủ chưa ghi nhận trò chơi.');
  });
});
