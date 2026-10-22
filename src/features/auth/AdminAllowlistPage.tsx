import React, { useEffect, useState } from 'react';
import { Plus, ShieldCheck } from 'lucide-react';
import {
  addAdminEmailToAllowlist,
  subscribeAdminAllowlist,
} from '../../services/firestoreRepository';
import { AdminAllowlistEntry } from '../../types/domain';

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
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-slate-900">
          Quản Lý Quyền Truy Cập Admin (Allowlist)
        </h1>
        <p className="text-sm text-slate-600">
          Chỉ những địa chỉ email Google có trong danh sách dưới đây mới được
          phép truy cập phân hệ Quản trị Giáo viên. Người dùng không thể tự
          đăng ký làm Admin.
        </p>
      </div>

      <form onSubmit={handleAdd} className="cartoon-card bg-white p-5">
        <label className="mb-1.5 block text-xs font-bold text-slate-700">
          Cấp quyền cho email Giáo viên / Quản trị viên mới
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="giaovientoan@gmail.com"
            className="flex-1 rounded-xl border-2 border-slate-800 px-3.5 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="cartoon-button flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-extrabold text-white whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Đang cấp quyền...' : 'Cấp Quyền Admin'}
          </button>
        </div>
        {errorMsg && (
          <p className="mt-2 text-xs font-bold text-rose-600">{errorMsg}</p>
        )}
      </form>

      <div className="cartoon-card overflow-hidden bg-white">
        <div className="border-b-2 border-slate-900 bg-amber-100 px-5 py-3 font-display text-sm font-extrabold text-slate-900">
          Danh Sách Email Được Cấp Quyền ({entries.length})
        </div>
        <div className="divide-y divide-slate-200">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between px-5 py-3.5 text-sm"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <span className="font-mono font-bold text-slate-900">
                  {entry.email}
                </span>
              </div>
              <span className="text-xs text-slate-500">
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
