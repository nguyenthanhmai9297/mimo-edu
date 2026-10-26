import type { NextFunction, Request, Response } from 'express';

/**
 * Server-side teacher check shared by every teacher API (AI, Mimo Quiz, Rung
 * chuông vàng, images). Same roles as firestore.rules:
 * - Teacher: any signed-in account with a verified email (Google sign-in);
 * - Admin: the owner's email or one listed in adminAllowlist.
 * The browser's Firebase ID token is verified with the Admin SDK, so a request
 * cannot claim to be someone else, and no request can make itself Admin.
 */

export const OWNER_EMAIL = 'nguyenthanhmai9297@gmail.com'; // same owner as firestore.rules isAdmin()

export type TeacherRequest = Request & { teacherEmail?: string; teacherUid?: string; isAdmin?: boolean };

interface TeacherAuthDeps {
  /** Verifies a Firebase ID token (Admin Auth), or null without server credentials. */
  verifyIdToken: ((token: string) => Promise<{ uid?: string; email?: string; email_verified?: boolean }>) | null;
  /** Whether an email has a document in adminAllowlist. */
  isAllowlisted: (email: string) => Promise<boolean>;
}

export function createRequireTeacher(getDeps: () => TeacherAuthDeps) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const { verifyIdToken, isAllowlisted } = getDeps();
    if (!header?.startsWith('Bearer ') || !verifyIdToken) {
      res.status(401).json({ error: 'Cần đăng nhập tài khoản giáo viên.', code: 'UNAUTHENTICATED' });
      return;
    }
    let decoded: { uid?: string; email?: string; email_verified?: boolean };
    try {
      decoded = await verifyIdToken(header.slice(7));
    } catch {
      res.status(401).json({ error: 'Phiên đăng nhập giáo viên đã hết hạn, vui lòng tải lại trang.', code: 'UNAUTHENTICATED' });
      return;
    }
    const email = decoded.email?.toLowerCase();
    if (!email || decoded.email_verified !== true) {
      res.status(403).json({ error: 'Tài khoản này chưa có email đã xác minh.', code: 'FORBIDDEN' });
      return;
    }
    let admin = email === OWNER_EMAIL;
    try {
      admin = admin || (await isAllowlisted(email));
    } catch {
      // Admin status only adds rights: without it the request is served as a teacher
    }
    (req as TeacherRequest).teacherEmail = email;
    (req as TeacherRequest).teacherUid = decoded.uid;
    (req as TeacherRequest).isAdmin = admin;
    next();
  };
}
