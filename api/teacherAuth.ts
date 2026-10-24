import type { NextFunction, Request, Response } from 'express';

/**
 * Server-side teacher check shared by every teacher-only API (AI, Mimo Quiz).
 * Same rule as firestore.rules isAdmin(): a verified Google email that is the
 * owner's or is listed in adminAllowlist. The browser's Firebase ID token is
 * verified with the Admin SDK, so a request cannot claim to be a teacher.
 */

export const OWNER_EMAIL = 'nguyenthanhmai9297@gmail.com'; // same owner as firestore.rules isAdmin()

export type TeacherRequest = Request & { teacherEmail?: string };

interface TeacherAuthDeps {
  /** Verifies a Firebase ID token (Admin Auth), or null without server credentials. */
  verifyIdToken: ((token: string) => Promise<{ email?: string; email_verified?: boolean }>) | null;
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
    let decoded: { email?: string; email_verified?: boolean };
    try {
      decoded = await verifyIdToken(header.slice(7));
    } catch {
      res.status(401).json({ error: 'Phiên đăng nhập giáo viên đã hết hạn, vui lòng tải lại trang.', code: 'UNAUTHENTICATED' });
      return;
    }
    const email = decoded.email;
    try {
      const allowed =
        Boolean(email) && decoded.email_verified === true && (email === OWNER_EMAIL || (await isAllowlisted(email!)));
      if (!allowed) {
        res.status(403).json({ error: 'Tài khoản này không có quyền giáo viên.', code: 'FORBIDDEN' });
        return;
      }
    } catch {
      res.status(503).json({ error: 'Chưa kiểm tra được quyền giáo viên, vui lòng thử lại sau.' });
      return;
    }
    (req as TeacherRequest).teacherEmail = email;
    next();
  };
}
