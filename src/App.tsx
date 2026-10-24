/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AppProvider } from './app/providers';
import { AppRouter } from './app/router';

// Same flag as lib/firebase/config, read here so production never loads Firebase for it
const usingFirebaseEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

/**
 * Local testing only: ?demo=giaovien signs in the emulator's test teacher.
 * The Auth emulator accepts this unsigned credential; production never runs this.
 */
function useEmulatorTeacherDemoLogin(): boolean {
  const [pending, setPending] = useState(
    () => usingFirebaseEmulator && new URLSearchParams(window.location.search).get('demo') === 'giaovien'
  );
  useEffect(() => {
    if (!pending) return;
    void Promise.all([import('firebase/auth'), import('./lib/firebase/config')])
      .then(async ([{ GoogleAuthProvider, signInWithCredential }, { auth }]) => {
        await auth.authStateReady();
        if (auth.currentUser) return;
        const fakeIdToken = JSON.stringify({
          sub: 'giaovien-demo',
          email: 'giaovien@demo.test',
          email_verified: true,
          name: 'Giáo viên thử nghiệm',
        });
        return signInWithCredential(auth, GoogleAuthProvider.credential(fakeIdToken));
      })
      .catch((error) => console.error('Emulator demo login failed:', error))
      // Render the routes only afterwards, so the admin guard sees the session
      .finally(() => setPending(false));
  }, [pending]);
  return pending;
}

export default function App() {
  const demoLoginPending = useEmulatorTeacherDemoLogin();
  if (demoLoginPending) {
    return <div className="p-8 text-center text-sm font-bold text-slate-600">Đang đăng nhập tài khoản giáo viên thử nghiệm…</div>;
  }
  return (
    <AppProvider>
      <AppRouter />
      {usingFirebaseEmulator && (
        <div className="pointer-events-none fixed bottom-20 left-2 z-[100] rounded-full border border-purple-400 bg-purple-50/95 px-2.5 py-1 text-[10px] font-bold text-purple-900 shadow md:bottom-3 md:text-[11px]">
          Chế độ thử nghiệm<span className="hidden md:inline"> (dữ liệu giả lập) · Giáo viên: giaovien@demo.test · Học sinh: MIMO03</span>
        </div>
      )}
    </AppProvider>
  );
}
