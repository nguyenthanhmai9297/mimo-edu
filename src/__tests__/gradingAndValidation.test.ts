import { describe, it, expect } from 'vitest';
import {
  gradeSingleQuestion,
  gradeFullSubmission,
  createPublicQuestionsSnapshot,
  createRandom6CharCode,
  normalizeShortAnswer,
  createRichTextFromPlain,
} from '../utils/gradingEngine';
import {
  classFormSchema,
  studentFormSchema,
  studentCodeLoginSchema,
  commentFormSchema,
  mathGameFormSchema,
  aiParsedHomeworkResponseSchema,
} from '../schemas/validation';
import type { HomeworkQuestion } from '../types/domain';

describe('Grading Engine & Snapshot Sanitization', () => {
  it('grades single_choice questions accurately', () => {
    const q: HomeworkQuestion = {
      id: 'q1',
      order: 1,
      type: 'single_choice',
      prompt: createRichTextFromPlain('2 + 2 = ?'),
      points: 2,
      options: [
        { id: 'A', label: 'A', content: createRichTextFromPlain('3') },
        { id: 'B', label: 'B', content: createRichTextFromPlain('4') },
      ],
      correctOptionId: 'B',
    };

    const correctResult = gradeSingleQuestion(q, {
      questionId: 'q1',
      type: 'single_choice',
      selectedOptionId: 'B',
    });
    expect(correctResult.isCorrect).toBe(true);
    expect(correctResult.score).toBe(2);

    const wrongResult = gradeSingleQuestion(q, {
      questionId: 'q1',
      type: 'single_choice',
      selectedOptionId: 'A',
    });
    expect(wrongResult.isCorrect).toBe(false);
    expect(wrongResult.score).toBe(0);
  });

  it('grades multiple_choice questions requiring exact option match', () => {
    const q: HomeworkQuestion = {
      id: 'q2',
      order: 2,
      type: 'multiple_choice',
      prompt: createRichTextFromPlain('Chọn các số nguyên tố:'),
      points: 3,
      options: [
        { id: 'A', label: 'A', content: createRichTextFromPlain('2') },
        { id: 'B', label: 'B', content: createRichTextFromPlain('3') },
        { id: 'C', label: 'C', content: createRichTextFromPlain('4') },
      ],
      correctOptionIds: ['A', 'B'],
    };

    const exactResult = gradeSingleQuestion(q, {
      questionId: 'q2',
      type: 'multiple_choice',
      selectedOptionIds: ['B', 'A'],
    });
    expect(exactResult.isCorrect).toBe(true);
    expect(exactResult.score).toBe(3);

    const partialResult = gradeSingleQuestion(q, {
      questionId: 'q2',
      type: 'multiple_choice',
      selectedOptionIds: ['A'],
    });
    expect(partialResult.isCorrect).toBe(false);
    expect(partialResult.score).toBe(0);
  });

  it('grades true_false_multi statements with partial points', () => {
    const q: HomeworkQuestion = {
      id: 'q3',
      order: 3,
      type: 'true_false_multi',
      prompt: createRichTextFromPlain('Xét tính đúng sai:'),
      points: 2,
      statements: [
        { id: 's1', label: 'a', statement: createRichTextFromPlain('2 là số chẵn'), isTrue: true, points: 1 },
        { id: 's2', label: 'b', statement: createRichTextFromPlain('9 là số nguyên tố'), isTrue: false, points: 1 },
      ],
    };

    const halfResult = gradeSingleQuestion(q, {
      questionId: 'q3',
      type: 'true_false_multi',
      statementAnswers: { s1: true, s2: true },
    });
    expect(halfResult.isCorrect).toBe(false);
    expect(halfResult.score).toBe(1);

    const fullResult = gradeSingleQuestion(q, {
      questionId: 'q3',
      type: 'true_false_multi',
      statementAnswers: { s1: true, s2: false },
    });
    expect(fullResult.isCorrect).toBe(true);
    expect(fullResult.score).toBe(2);
  });

  it('grades short_answer normalizing case, whitespace, and comma decimals', () => {
    expect(normalizeShortAnswer('  12,5  ')).toBe('12.5');
    const q: HomeworkQuestion = {
      id: 'q4',
      order: 4,
      type: 'short_answer',
      prompt: createRichTextFromPlain('Tính 25 : 2'),
      points: 1.5,
      acceptableAnswers: ['12.5', '25/2'],
    };

    const commaDecimal = gradeSingleQuestion(q, {
      questionId: 'q4',
      type: 'short_answer',
      shortAnswerText: ' 12,5 ',
    });
    expect(commaDecimal.isCorrect).toBe(true);
    expect(commaDecimal.score).toBe(1.5);
  });

  it('marks essay questions as non-auto-graded and preserves teacher scores in gradeFullSubmission', () => {
    const qEssay: HomeworkQuestion = {
      id: 'q5',
      order: 5,
      type: 'essay',
      prompt: createRichTextFromPlain('Giải bài toán có lời văn'),
      points: 3,
      rubric: 'Viết lời giải và phép tính đúng',
    };

    const summary = gradeFullSubmission(
      [qEssay],
      [{ questionId: 'q5', type: 'essay', essayContent: createRichTextFromPlain('Bài giải của em...') }],
      [{ questionId: 'q5', score: 2.5, maxScore: 3, isAutoGraded: false, teacherComment: 'Làm tốt!' }]
    );

    expect(summary.allAutoGradable).toBe(false);
    expect(summary.totalScore).toBe(2.5);
    expect(summary.questionResults[0].teacherComment).toBe('Làm tốt!');
  });

  it('strips grading keys, rubrics, and solutions before sending snapshot to student portal', () => {
    const rawQuestions: HomeworkQuestion[] = [
      {
        id: 'q1',
        order: 1,
        type: 'single_choice',
        prompt: createRichTextFromPlain('Câu 1'),
        points: 2,
        options: [{ id: 'A', label: 'A', content: createRichTextFromPlain('10') }],
        correctOptionId: 'A',
        rubric: 'Đáp án mật',
        sampleSolution: createRichTextFromPlain('Lời giải mẫu'),
      },
    ];
    const sanitized = createPublicQuestionsSnapshot(rawQuestions);
    expect(sanitized[0].id).toBe('q1');
    expect(sanitized[0].correctOptionId).toBeUndefined();
    expect(sanitized[0].rubric).toBeUndefined();
    expect(sanitized[0].sampleSolution).toBeUndefined();
  });

  it('generates valid 6-character unambiguous alphanumeric student access codes', () => {
    for (let i = 0; i < 25; i++) {
      const code = createRandom6CharCode();
      expect(code).toMatch(/^[A-Z2-9]{6}$/);
      expect(code).not.toContain('O');
      expect(code).not.toContain('0');
      expect(code).not.toContain('I');
      expect(code).not.toContain('1');
    }
  });
});

describe('Zod Form & Domain Validation Schemas', () => {
  it('validates class creation schema', () => {
    const valid = classFormSchema.safeParse({
      name: 'Toán Tư Duy 5A',
      code: 'TOAN5A',
      grade: 'Khối 5',
      subject: 'Toán',
      schoolYear: '2025-2026',
      scheduleText: 'Thứ 3 & Thứ 6',
      status: 'active',
    });
    expect(valid.success).toBe(true);

    const invalid = classFormSchema.safeParse({
      name: '',
      code: 'A',
      grade: '',
      schoolYear: '25',
      status: 'active',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates student creation schema', () => {
    const valid = studentFormSchema.safeParse({
      fullName: 'Nguyễn Minh Khôi',
      grade: 'Khối 5',
      classIds: ['class_5a'],
      status: 'active',
      internalNotes: 'Ghi chú nội bộ chỉ giáo viên thấy',
    });
    expect(valid.success).toBe(true);
  });

  it('validates 6-character student portal login code and normalizes uppercase', () => {
    const res = studentCodeLoginSchema.safeParse({ code: ' ab3k9p ' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.code).toBe('AB3K9P');
    }

    const tooShort = studentCodeLoginSchema.safeParse({ code: 'ABC' });
    expect(tooShort.success).toBe(false);
  });

  it('validates periodic parent/student comments and math games', () => {
    const validComment = commentFormSchema.safeParse({
      studentId: 'stu_1',
      type: 'monthly',
      month: 10,
      year: 2025,
      strengths: 'Con nắm vững kiến thức phân số và tích cực phát biểu.',
      status: 'published',
    });
    expect(validComment.success).toBe(true);

    const validGame = mathGameFormSchema.safeParse({
      title: 'Đua Xe Tính Nhẩm',
      embedUrl: 'https://wordwall.net/embed/example',
      category: 'Phép tính',
      order: 1,
      status: 'published',
    });
    expect(validGame.success).toBe(true);
  });

  it('validates AI parsed homework response schema', () => {
    const parsed = aiParsedHomeworkResponseSchema.safeParse({
      title: 'BTVN Phân Số',
      questions: [
        {
          type: 'single_choice',
          promptText: '1/2 + 1/2 bằng bao nhiêu?',
          points: 2,
          options: [
            { label: 'A', text: '1' },
            { label: 'B', text: '2' },
          ],
          correctOptionLabel: 'A',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });
});
