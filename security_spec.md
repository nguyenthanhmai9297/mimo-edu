# Security Specification — Lớp Chúng Tôi

## 1. Data Invariants

1. **Default Deny**: All unlisted paths in Firestore are strictly denied (`allow read, write: if false;`).
2. **Admin Identity Verification**: Admin privileges (`isAdmin()`) require an authenticated user (`request.auth != null`), a verified email (`request.auth.token.email_verified == true`), and either the bootstrapped owner email (`dang.nh.aprotrain@gmail.com`) or an existing document in `/adminAllowlist/$(request.auth.token.email)`.
3. **No Public Collection Scraping (`list` Isolation)**: Listing `/students`, `/studentCodeIndex`, `/homework`, `/assignments`, `/studentAssignments`, `/submissions`, `/comments`, `/classes`, `/aiJobs`, and `/adminAllowlist` is restricted strictly to verified Admins (`isAdmin()`). Unauthenticated clients can never enumerate student profiles or 6-character codes.
4. **Path ID Hardening**: Every single-document operation (`get`, `create`, `update`, `delete`) enforces `isValidId(id)` (`^[a-zA-Z0-9_\-@\.]+$`, `<= 128` chars) to block ID poisoning.
5. **Schema & Volumetric Bounds (`isValid[Entity]`)**: Every `create` and `update` operation validates exact allowed keys (`hasOnly`), required keys (`hasAll`), string length bounds, and bounded array sizes before any relational read (`get`/`exists`).
6. **Relational Integrity**: Submissions and StudentAssignments require both the referenced `studentId` and `assignmentId` documents to exist in `/students` and `/assignments`.
7. **Immutability of Identity Fields**: `createdAt`, `studentId`, `assignmentId`, and `accessCode` cannot be mutated during updates.

## 2. The "Dirty Dozen" Payloads

1. **Unverified Admin Email Spoof**: Authenticated user with `email == 'dang.nh.aprotrain@gmail.com'` but `email_verified == false` attempting to create a class. -> `PERMISSION_DENIED`
2. **Shadow Field Injection on Class Creation**: Admin payload containing `{ ..., isSuperAdmin: true }` not in allowed keys. -> `PERMISSION_DENIED`
3. **Unauthenticated Student Enumeration**: Client calling `getDocs(collection(db, 'students'))` without admin auth. -> `PERMISSION_DENIED`
4. **Unauthenticated Code Index Enumeration**: Client calling `getDocs(collection(db, 'studentCodeIndex'))` to scrape 6-char codes. -> `PERMISSION_DENIED`
5. **ID Poisoning Attack**: Creating a document with a 500-character ID or special shell characters. -> `PERMISSION_DENIED`
6. **Denial-of-Wallet Oversized String**: Submitting a student `fullName` with 10,000 characters (`> 120`). -> `PERMISSION_DENIED`
7. **Unbounded Array Injection**: Creating a student with 50 `classIds` (`> 20` max limit). -> `PERMISSION_DENIED`
8. **Insecure HTTP Game URL**: Creating a `MathGame` with `http://malicious.example.com` instead of `https://`. -> `PERMISSION_DENIED`
9. **Orphaned Submission Write**: Creating a submission referencing a non-existent `studentId` or `assignmentId`. -> `PERMISSION_DENIED`
10. **Immutable AccessCode Mutation**: Updating a student document to change `accessCode` after creation. -> `PERMISSION_DENIED`
11. **Value Poisoning on Update**: Updating `status` on a class to `'hacked_status'` outside the enum `['active', 'archived']`. -> `PERMISSION_DENIED`
12. **Unauthorized Homework Deletion**: Non-admin attempting to delete a master homework document. -> `PERMISSION_DENIED`
