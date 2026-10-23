import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Firestore Security Rules Specification Verification', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf-8');

  it('enforces admin allowlist verification helper', () => {
    expect(rulesContent).toContain('function isAdmin()');
    expect(rulesContent).toContain('nguyenthanhmai9297@gmail.com');
    expect(rulesContent).toContain('adminAllowlist');
  });

  it('prevents unauthenticated list enumeration on sensitive collections', () => {
    expect(rulesContent).toContain('match /students/{studentId}');
    expect(rulesContent).toContain('allow list: if isAdmin()');
    expect(rulesContent).toContain('match /studentCodeIndex/{code}');
    expect(rulesContent).toContain('match /homework/{homeworkId}');
    expect(rulesContent).toContain('match /assignments/{assignmentId}');
  });

  it('validates schema fields on studentAssignments and submissions updates', () => {
    expect(rulesContent).toContain('isValidStudentAssignment');
    expect(rulesContent).toContain('isValidSubmission');
    expect(rulesContent).toContain("data.status == 'assigned' || data.status == 'in_progress' || data.status == 'submitted' || data.status == 'graded' || data.status == 'returned'");
  });
});
