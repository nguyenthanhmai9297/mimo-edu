import { z } from 'zod';

export const classFormSchema = z.object({
  name: z.string().min(1, 'Tên lớp học không được để trống').max(100),
  grade: z.string().min(1, 'Vui lòng chọn khối / lớp').max(30),
  schoolYear: z.string().min(4, 'Năm học không hợp lệ').max(30),
  description: z.string().max(1000).optional().or(z.literal('')),
  status: z.enum(['active', 'archived']).default('active'),
});

export type ClassFormValues = z.infer<typeof classFormSchema>;

export const studentFormSchema = z.object({
  fullName: z.string().min(1, 'Họ tên học sinh không được để trống').max(120),
  nickname: z.string().max(60).optional().or(z.literal('')),
  avatarUrl: z.string().max(500).optional().or(z.literal('')),
  grade: z.string().min(1, 'Vui lòng chọn khối lớp').max(30),
  classIds: z.array(z.string()).max(20, 'Tối đa 20 lớp học'),
  dob: z.string().max(40).optional().or(z.literal('')),
  internalNotes: z.string().max(2000).optional().or(z.literal('')),
  status: z.enum(['active', 'dropped', 'archived']).default('active'),
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;

export const studentCodeLoginSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'Mã truy cập phải gồm đúng 6 chữ cái hoặc chữ số'),
});

export const commentFormSchema = z.object({
  studentId: z.string().min(1, 'Vui lòng chọn học sinh'),
  type: z.enum(['monthly', 'submission']).default('monthly'),
  month: z.number().min(1).max(12),
  year: z.number().min(2020).max(2100),
  strengths: z.string().min(1, 'Vui lòng nhập điểm mạnh của học sinh').max(2000),
  improvements: z.string().max(2000).optional().or(z.literal('')),
  completionRate: z.string().max(200).optional().or(z.literal('')),
  practiceSuggestions: z.string().max(2000).optional().or(z.literal('')),
  status: z.enum(['draft', 'published']).default('published'),
});

export type CommentFormValues = z.infer<typeof commentFormSchema>;

export const mathGameFormSchema = z.object({
  title: z.string().min(1, 'Tên trò chơi không được để trống').max(120),
  description: z.string().max(1000).optional().or(z.literal('')),
  embedUrl: z
    .string()
    .url('URL không hợp lệ')
    .regex(/^https:\/\/.*/, 'Chỉ chấp nhận đường dẫn bắt đầu bằng https://')
    .max(500),
  category: z.enum([
    'Số học',
    'Phép tính',
    'Hình học',
    'Tư duy logic',
    'Ôn tập kiến thức',
  ]),
  thumbnailUrl: z.string().max(500).optional().or(z.literal('')),
  order: z.number().min(0).max(10000).default(1),
  status: z.enum(['draft', 'published', 'archived']).default('published'),
});

export type MathGameFormValues = z.infer<typeof mathGameFormSchema>;

export const aiParsedQuestionSchema = z.object({
  type: z.enum([
    'single_choice',
    'multiple_choice',
    'true_false_multi',
    'short_answer',
    'essay',
  ]),
  promptText: z.string().min(1),
  latexFormulas: z.array(z.string()).optional(),
  points: z.number().positive().default(2),
  options: z
    .array(
      z.object({
        label: z.string(),
        text: z.string(),
      })
    )
    .optional(),
  correctOptionLabel: z.string().optional(),
  correctOptionLabels: z.array(z.string()).optional(),
  statements: z
    .array(
      z.object({
        label: z.string(),
        text: z.string(),
        isTrue: z.boolean().optional(),
        points: z.number().positive().default(0.5),
      })
    )
    .optional(),
  acceptableAnswers: z.array(z.string()).optional(),
  rubric: z.string().optional(),
  sampleSolutionText: z.string().optional(),
  figureDescription: z.string().optional(),
  figures: z
    .array(
      z.object({
        page: z.number().int().min(1),
        box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        description: z.string().optional(),
      })
    )
    .optional(),
  needsReview: z.boolean().optional(),
  reviewNote: z.string().optional(),
});

export const aiParsedHomeworkResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  grade: z.string().optional(),
  questions: z.array(aiParsedQuestionSchema).min(1),
});

export const aiEssayGradingSuggestionSchema = z.object({
  suggestedScore: z.number().min(0),
  explanation: z.string().min(1),
  improvementFeedback: z.string().min(1),
});

const QUESTION_TYPES = [
  'single_choice',
  'multiple_choice',
  'true_false_multi',
  'short_answer',
  'essay',
] as const;

/** A homework draft prepared outside the app (JSON file) to open in the editor. */
export const homeworkImportSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  grade: z.string().max(40).optional(),
  answerSource: z.enum(['teacher', 'ai']).default('teacher'),
  aiSolverEnabled: z.boolean().default(false),
  questions: z
    .array(
      z
        .object({
          id: z.string().min(1),
          order: z.number(),
          type: z.enum(QUESTION_TYPES),
          points: z.number().min(0),
          prompt: z.object({ version: z.literal(1), blocks: z.array(z.any()) }),
        })
        .passthrough()
    )
    .min(1)
    .max(100),
});
