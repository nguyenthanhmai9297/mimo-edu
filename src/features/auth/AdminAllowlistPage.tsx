import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import {
  addAdminEmailToAllowlist,
  subscribeAdminAllowlist,
} from '../../services/firestoreRepository';
import { AdminAllowlistEntry } from '../../types/domain';
import { PageHeader, STUDIO_INPUT } from '../../components/studio/StudioUi';

export const AdminAllowlistPage: React.FC = () => {
  const [entries, setEntries] = useState<AdminAllowlistEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = subscribeAdminAllowlist(setEntries);
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const cleaned = newEmail.trim().toLowerCase();
    if (!cleaned.includes('@')) {
      setErrorMsg('Vui lòng nhập địa chỉ email Google hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      await addAdminEmailToAllowlist(cleaned);
      setNewEmail('');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể thêm email vào allowlist.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="studio-skin max-w-3xl space-y-6">
      <PageHeader
        icon={ShieldCheck}
        tone="navy"
        title="Quyền Admin"
        description="Chỉ email Google có trong danh sách này mới vào được MimoEDU Studio. Người dùng không thể tự đăng ký làm admin."
      />

      <form onSubmit={handleAdd} className="studio-card p-5">
        <label className="mb-1.5 block text-xs font-bold text-[#3B4A66]">
          Cấp quyền cho email Giáo viên / Quản trị viên mới
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="giaovientoan@gmail.com"
            className={`${STUDIO_INPUT} flex-1`}
          />
          <button type="submit" disabled={saving} className="studio-btn studio-btn-primary">
            <Plus className="h-4 w-4" />
            {saving ? 'Đang cấp quyền…' : 'Cấp quyền admin'}
          </button>
        </div>
        {errorMsg && (
          <p className="mt-2 text-xs font-bold text-rose-600">{errorMsg}</p>
        )}
      </form>

      <div className="studio-card overflow-hidden">
        <div className="border-b border-[#DCE7F3] bg-[#F6FAFF] px-5 py-3 font-display text-sm font-extrabold text-[#172B4D]">
          Email được cấp quyền ({entries.length})
        </div>
        <div className="divide-y divide-[#EEF3F9]">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-5 py-3.5 text-sm"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#1F9D6B]" />
                <span className="font-mono font-bold text-[#172B4D]">
                  {entry.email}
                </span>
              </div>
              <span className="text-xs text-[#5E6C84]">
                Vai trò: <strong>{entry.role}</strong> · Cấp bởi:{' '}
                {entry.addedBy}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
