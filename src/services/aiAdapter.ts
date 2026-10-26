import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { GoogleGenAI, Type } from '@google/genai';
import { z } from 'zod';
import {
  aiEssayGradingSuggestionSchema,
  aiParsedHomeworkResponseSchema,
} from '../schemas/validation.js';
import {
  ChoiceOption,
  HomeworkQuestion,
  TrueFalseStatement,
} from '../types/domain.js';
import { AICompleteness, checkCompleteness } from '../utils/aiCompleteness.js';
import { DEFAULT_GRADE, normalizeGrade } from '../utils/grade.js';
import { richTextFromAIText } from '../utils/richText.js';
import type { FigureSpec, FigureVerification } from '../features/homework/figureSpec.js';
import {
  claudeFigureCompareSchema,
  claudeFigureReadSchema,
  FIGURE_COMPARE_SYSTEM,
  FIGURE_READ_SYSTEM,
  figureSpecFromWire,
  verificationFromWire,
} from './figureAI.js';

export { DEFAULT_GRADE, normalizeGrade, richTextFromAIText };

export interface MediaFileInput {
  mimeType: string;
  base64Data: string;
}

export interface ParseHomeworkInput {
  /** Pages of one exam, in reading order (images and/or PDFs). */
  files: MediaFileInput[];
  solveWithAI: boolean;
  preferredModel?: string;
}

type AIParsedHomework = z.infer<typeof aiParsedHomeworkResponseSchema>;

export interface FigureRequest {
  questionId: string;
  /** 1-based index of the source page/file. */
  page: number;
  /** [xMin, yMin, xMax, yMax], each normalized to 0–1000 of the page size. */
  box: [number, number, number, number];
  description: string;
}

export interface ParsedHomeworkOutput {
  title: string;
  description: string;
  grade: string;
  questions: HomeworkQuestion[];
  /** Figure regions to crop from the source pages (client-side) into question prompts. */
  figures: FigureRequest[];
  /** Whether every question of the paper came back; the editor warns when not. */
  completeness: AICompleteness;
  answerSource: 'teacher' | 'ai';
  aiSolverEnabled: boolean;
  provider: string;
  model: string;
  durationMs: number;
  estimatedCostUsd: number;
}

export interface EssayGradingInput {
  questionPrompt: string;
  maxPoints: number;
  rubric?: string;
  sampleSolution?: string;
  studentEssayText: string;
  preferredModel?: string;
}

export interface FigureRedrawInput {
  /** The figure picture as it is in the question (cropped from the exam). */
  image: MediaFileInput;
  /** The question's text, for context only (labels it names, units). */
  questionText: string;
  /** What the teacher says went wrong last time ("thiếu điểm C", "ô tô đậm ở hàng dưới"). */
  hint?: string;
}

export interface FigureRedrawOutput {
  redrawable: boolean;
  reason: string;
  spec: FigureSpec | null;
  readings: { pointLabels: string[]; measurements: string[]; otherText: string[] };
  uncertain: string[];
  provider: string;
  model: string;
  durationMs: number;
  estimatedCostUsd: number;
}

export interface FigureCompareInput {
  original: MediaFileInput;
  /** MimoEDU's drawing of the AI's description (PNG). */
  redrawn: MediaFileInput;
  questionText: string;
}

export interface FigureCompareOutput {
  verification: FigureVerification;
  provider: string;
  model: string;
  durationMs: number;
  estimatedCostUsd: number;
}

export interface EssayGradingOutput {
  suggestedScore: number;
  explanation: string;
  improvementFeedback: string;
  provider: string;
  model: string;
  durationMs: number;
}

/**
 * The AI service cannot be used right now (no key, or the key was rejected).
 * The message is for teachers; server configuration details stay in the logs.
 */
export class AIUnavailableError extends Error {
  readonly code = 'AI_UNAVAILABLE';
  constructor(readonly detail: string) {
    super('Chức năng AI đang tạm chưa sẵn sàng. Thầy cô vẫn có thể soạn bài thủ công, hoặc báo người quản trị hệ thống để bật AI.');
  }
}

/** Whether the configured provider has its key, checked before any AI work starts. */
export function isAIConfigured(): boolean {
  return Boolean(process.env.AI_PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);
}


/**
 * Provider-agnostic AI interface so the system can switch or add providers
 * without rewriting business logic.
 */
export interface AIProviderAdapter {
  readonly providerName: string;
  readonly defaultModel: string;
  parseHomeworkFromMedia(input: ParseHomeworkInput): Promise<ParsedHomeworkOutput>;
  suggestEssayGrading(input: EssayGradingInput): Promise<EssayGradingOutput>;
  redrawFigure(input: FigureRedrawInput): Promise<FigureRedrawOutput>;
  compareFigure(input: FigureCompareInput): Promise<FigureCompareOutput>;
}

const FIGURES_NEED_CLAUDE = 'Chức năng AI vẽ lại hình hiện chỉ chạy với Claude. Hãy báo người quản trị hệ thống.';

/** An AI short answer as a teacher would type it: no $…$, no LaTeX spacing commands. */
function plainAnswer(answer: string): string {
  return answer
    .replace(/\$/g, '')
    .replace(/\\[,;:! ]|~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapParsedQuestions(
  parsedQuestions: AIParsedHomework['questions'],
  solveWithAI: boolean
): HomeworkQuestion[] {
  return parsedQuestions.map(
    (q, index) => {
      const qId = `q_${Date.now()}_${index + 1}`;
      const prompt = richTextFromAIText(
        q.promptText,
        q.latexFormulas || []
      );
      if (q.figureDescription?.trim() && !q.figures?.length) {
        prompt.blocks.push({
          type: 'paragraph',
          align: 'left',
          italic: true,
          text: `[Hình vẽ trong đề gốc – cần chèn lại: ${q.figureDescription.trim()}]`,
        });
      }

      let options: ChoiceOption[] | undefined;
      let correctOptionId: string | undefined;
      let correctOptionIds: string[] | undefined;

      if (
        (q.type === 'single_choice' || q.type === 'multiple_choice') &&
        q.options &&
        q.options.length > 0
      ) {
        options = q.options.map((opt, oIdx) => ({
          id: `${qId}_opt_${oIdx + 1}`,
          label: opt.label || String.fromCharCode(65 + oIdx),
          content: richTextFromAIText(opt.text),
        }));

        if (solveWithAI) {
          if (q.type === 'single_choice' && q.correctOptionLabel) {
            const found = options.find(
              (o) =>
                o.label.toUpperCase() ===
                q.correctOptionLabel?.trim().toUpperCase()
            );
            correctOptionId = found?.id; // no match: left empty and flagged below, never guessed
          }
          if (q.type === 'multiple_choice' && q.correctOptionLabels) {
            const upperLabels = q.correctOptionLabels.map((l) =>
              l.trim().toUpperCase()
            );
            correctOptionIds = options
              .filter((o) => upperLabels.includes(o.label.toUpperCase()))
              .map((o) => o.id);
          }
        }
      }

      let statements: TrueFalseStatement[] | undefined;
      if (q.type === 'true_false_multi' && q.statements) {
        statements = q.statements.map((st, sIdx) => ({
          id: `${qId}_st_${sIdx + 1}`,
          label: st.label || String.fromCharCode(97 + sIdx),
          statement: richTextFromAIText(st.text),
          // Missing verdicts stay empty (flagged below) instead of defaulting to "Đúng"
          ...(solveWithAI && typeof st.isTrue === 'boolean' ? { isTrue: st.isTrue } : {}),
          points: st.points || 0.5,
        }));
      }

      const acceptableAnswers = (q.acceptableAnswers || []).map(plainAnswer).filter(Boolean);
      const unsolved =
        solveWithAI &&
        ((q.type === 'single_choice' && !correctOptionId) ||
          (q.type === 'multiple_choice' && !correctOptionIds?.length) ||
          (q.type === 'true_false_multi' && (!statements?.length || statements.some((s) => s.isTrue === undefined))) ||
          (q.type === 'short_answer' && acceptableAnswers.length === 0) ||
          (q.type === 'essay' && !q.sampleSolutionText?.trim()));
      const reviewNotes = [
        q.needsReview ? q.reviewNote?.trim() || 'AI chưa chắc chắn ở câu này, vui lòng kiểm tra.' : '',
        unsolved ? 'AI chưa giải được câu này, thầy cô hãy nhập đáp án hoặc lời giải.' : '',
      ].filter(Boolean);

      return {
        id: qId,
        order: index + 1,
        type: q.type,
        prompt,
        points: q.points || 2,
        ...(options ? { options } : {}),
        ...(correctOptionId ? { correctOptionId } : {}),
        ...(correctOptionIds ? { correctOptionIds } : {}),
        ...(statements ? { statements } : {}),
        ...(q.type === 'short_answer'
          ? {
              acceptableAnswers: solveWithAI ? acceptableAnswers : [],
            }
          : {}),
        ...(reviewNotes.length ? { aiReviewNote: reviewNotes.join(' ') } : {}),
        ...(q.type === 'essay'
          ? {
              rubric: q.rubric || '',
              ...(solveWithAI && q.sampleSolutionText
                ? {
                    sampleSolution: richTextFromAIText(
                      q.sampleSolutionText
                    ),
                  }
                : {}),
            }
          : {}),
      };
    }
  );
}

export function collectFigureRequests(
  parsedQuestions: AIParsedHomework['questions'],
  mappedQuestions: HomeworkQuestion[]
): FigureRequest[] {
  return parsedQuestions.flatMap((q, idx) =>
    (q.figures ?? [])
      .filter((f) => f.box[2] > f.box[0] && f.box[3] > f.box[1])
      .map((f) => ({
        questionId: mappedQuestions[idx].id,
        page: f.page,
        box: f.box.map((v) => Math.min(1000, Math.max(0, v))) as FigureRequest['box'],
        description: f.description?.trim() || q.figureDescription?.trim() || 'Hình vẽ',
      }))
  );
}

export class GeminiAIAdapter implements AIProviderAdapter {
  public readonly providerName = 'google-gemini';
  public readonly defaultModel = 'gemini-3.8-flash';

  async redrawFigure(): Promise<FigureRedrawOutput> {
    throw new Error(FIGURES_NEED_CLAUDE);
  }

  async compareFigure(): Promise<FigureCompareOutput> {
    throw new Error(FIGURES_NEED_CLAUDE);
  }

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AIUnavailableError('GEMINI_API_KEY is not set');
    }
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  async parseHomeworkFromMedia(
    input: ParseHomeworkInput
  ): Promise<ParsedHomeworkOutput> {
    const startTime = Date.now();
    const modelName = input.preferredModel || this.defaultModel;
    const ai = this.getClient();

    const solverInstruction = input.solveWithAI
      ? 'BẠN ĐƯỢC YÊU CẦU GIẢI ĐỀ: Hãy tự giải từng bài toán cẩn thận và điền đầy đủ đáp án đúng (correctOptionLabel, correctOptionLabels, isTrue cho từng mệnh đề, acceptableAnswers, và sampleSolutionText).'
      : 'KHÔNG TỰ GIẢI ĐỀ: Chỉ trích xuất nguyên vẹn câu hỏi và các phương án từ tài liệu. Chỉ điền đáp án nếu trong ảnh/PDF đã ghi sẵn đáp án rõ ràng; nếu không có sẵn, để trống trường đáp án.';

    const systemInstruction = `Bạn là chuyên gia Toán học và số hóa đề thi tiếng Việt.
Nhiệm vụ: Nhận diện nội dung từ ảnh hoặc PDF đề Toán và chuyển thành cấu trúc JSON chuẩn gồm 5 loại câu hỏi:
1. "single_choice": Trắc nghiệm 1 đáp án đúng (options A, B, C, D).
2. "multiple_choice": Trắc nghiệm nhiều đáp án đúng.
3. "true_false_multi": Đúng/Sai nhiều ý (mỗi câu có các mệnh đề a, b, c, d).
4. "short_answer": Câu trả lời ngắn (điền đáp số).
5. "essay": Câu tự luận trình bày lời giải.

Quy tắc:
- Giữ nguyên tiếng Việt có dấu rõ ràng.
- Các biểu thức toán học phức tạp hãy trích xuất thêm vào mảng latexFormulas (cú pháp LaTeX chuẩn không bọc dấu $).
- ${solverInstruction}`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          ...input.files.map((file) => ({
            inlineData: {
              mimeType: file.mimeType,
              data: file.base64Data,
            },
          })),
          {
            text: 'Hãy phân tích tài liệu đề Toán này và trả về dữ liệu JSON theo đúng schema.',
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'Tiêu đề bài tập về nhà',
            },
            description: {
              type: Type.STRING,
              description: 'Mô tả hoặc hướng dẫn chung',
            },
            grade: {
              type: Type.STRING,
              description: 'Khối lớp in trên đề, ví dụ Khối 3; bỏ trống nếu đề không ghi',
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description:
                      'Một trong: single_choice, multiple_choice, true_false_multi, short_answer, essay',
                  },
                  promptText: {
                    type: Type.STRING,
                    description: 'Nội dung câu hỏi',
                  },
                  latexFormulas: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Danh sách công thức LaTeX trong câu hỏi nếu có',
                  },
                  points: {
                    type: Type.NUMBER,
                    description: 'Điểm số của câu hỏi',
                  },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        text: { type: Type.STRING },
                      },
                      required: ['label', 'text'],
                    },
                  },
                  correctOptionLabel: {
                    type: Type.STRING,
                  },
                  correctOptionLabels: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  statements: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        text: { type: Type.STRING },
                        isTrue: { type: Type.BOOLEAN },
                        points: { type: Type.NUMBER },
                      },
                      required: ['label', 'text'],
                    },
                  },
                  acceptableAnswers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  rubric: {
                    type: Type.STRING,
                  },
                  sampleSolutionText: {
                    type: Type.STRING,
                  },
                },
                required: ['type', 'promptText', 'points'],
              },
            },
          },
          required: ['title', 'questions'],
        },
      },
    });

    const rawText = (response.text || '{}')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    const parsedJson = JSON.parse(rawText);
    if (
      !parsedJson ||
      !Array.isArray(parsedJson.questions) ||
      parsedJson.questions.length === 0
    ) {
      throw new Error(
        'Không tìm thấy câu hỏi Toán học nào trong ảnh hoặc PDF đã tải lên. Vui lòng chọn file đề Toán rõ nét hơn.'
      );
    }
    const validated = aiParsedHomeworkResponseSchema.parse(parsedJson);

    const mappedQuestions = mapParsedQuestions(
      validated.questions,
      input.solveWithAI
    );

    const durationMs = Date.now() - startTime;
    return {
      title: validated.title,
      description: validated.description || 'Đề bài được trích xuất bằng AI',
      grade: normalizeGrade(validated.grade),
      questions: mappedQuestions,
      figures: [],
      // Gemini's schema has no printed numbers, so only a stated count can reveal gaps
      completeness: checkCompleteness(
        validated.questions.map((q) => q.sourceNumber),
        validated.questionCountOnExam,
        false
      ),
      answerSource: input.solveWithAI ? 'ai' : 'teacher',
      aiSolverEnabled: input.solveWithAI,
      provider: this.providerName,
      model: modelName,
      durationMs,
      estimatedCostUsd: 0.0015,
    };
  }

  async suggestEssayGrading(
    input: EssayGradingInput
  ): Promise<EssayGradingOutput> {
    const startTime = Date.now();
    const modelName = input.preferredModel || this.defaultModel;
    const ai = this.getClient();

    const prompt = `Hãy chấm điểm đề xuất cho câu trả lời tự luận môn Toán của học sinh.
- Đề bài: ${input.questionPrompt}
- Thang điểm tối đa: ${input.maxPoints} điểm
- Hướng dẫn chấm / Rubric: ${input.rubric || 'Chấm theo tính đúng đắn của lập luận và kết quả toán học.'}
- Đáp án tham khảo: ${input.sampleSolution || 'Không đính kèm'}
- Bài làm của học sinh: ${input.studentEssayText}

Hãy trả về JSON gồm:
1. suggestedScore (số điểm từ 0 đến ${input.maxPoints})
2. explanation (giải thích ngắn gọn cho giáo viên vì sao đề xuất mức điểm này)
3. improvementFeedback (nhận xét thân thiện, khích lệ gửi cho học sinh để cải thiện cách trình bày Toán)`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestedScore: {
              type: Type.NUMBER,
              description: 'Điểm số đề xuất',
            },
            explanation: {
              type: Type.STRING,
              description: 'Giải thích lý do chấm cho giáo viên',
            },
            improvementFeedback: {
              type: Type.STRING,
              description: 'Nhận xét giúp học sinh cải thiện',
            },
          },
          required: ['suggestedScore', 'explanation', 'improvementFeedback'],
        },
      },
    });

    const rawText = response.text?.trim() || '{}';
    const parsed = aiEssayGradingSuggestionSchema.parse(JSON.parse(rawText));
    const boundedScore = Math.min(
      input.maxPoints,
      Math.max(0, Number(parsed.suggestedScore.toFixed(2)))
    );

    return {
      suggestedScore: boundedScore,
      explanation: parsed.explanation,
      improvementFeedback: parsed.improvementFeedback,
      provider: this.providerName,
      model: modelName,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Step 1 of a conversion (both modes): what Claude copies from the paper,
 * re-validated afterwards with aiParsedHomeworkResponseSchema. Every field is
 * required: optional fields (each a branch in the compiled output grammar)
 * made the API reject the whole request with 400 "Schema is too complex",
 * before reading any page. Fields that do not apply are sent empty ("", [], 0)
 * and dropped by wireToParsed. No answer fields: copying never solves.
 */
const claudeParsedHomeworkSchema = z.object({
  title: z.string(),
  description: z.string(),
  grade: z.string(),
  /** 0 when the exam does not number its questions. */
  questionCountOnExam: z.number(),
  questions: z.array(
    z.object({
      sourceNumber: z.string(),
      type: z.enum([
        'single_choice',
        'multiple_choice',
        'true_false_multi',
        'short_answer',
        'essay',
      ]),
      promptText: z.string(),
      points: z.number(),
      options: z.array(z.object({ label: z.string(), text: z.string() })),
      statements: z.array(z.object({ label: z.string(), text: z.string() })),
      figures: z.array(
        z.object({
          page: z.number(),
          box: z.array(z.number()),
          description: z.string(),
        })
      ),
      reviewNote: z.string(),
    })
  ),
});

/** Step 2, only with "AI giải": answers to the questions step 1 copied, by their 1-based index. */
const claudeSolutionSchema = z.object({
  answers: z.array(
    z.object({
      index: z.number(),
      correctOptionLabels: z.array(z.string()),
      /** One verdict per statement, in order: "dung", "sai", or "" when not sure. */
      statementAnswers: z.array(z.enum(['dung', 'sai', ''])),
      acceptableAnswers: z.array(z.string()),
      sampleSolutionText: z.string(),
      /** false: the answer is a guess (e.g. inferred from the options); it is dropped, only the note stays. */
      certain: z.boolean(),
      reviewNote: z.string(),
    })
  ),
});

type ClaudeExtraction = z.infer<typeof claudeParsedHomeworkSchema>;
type ClaudeSolution = z.infer<typeof claudeSolutionSchema>;

/** The copied exam (plus answers, when solved) in the optional shape the rest of the import uses. */
export function wireToParsed(wire: ClaudeExtraction, solution?: ClaudeSolution['answers']) {
  const text = (v: string) => (v.trim() ? v : undefined);
  const list = <T,>(v: T[]) => (v.length ? v : undefined);
  return {
    title: wire.title,
    description: text(wire.description),
    grade: text(wire.grade),
    questionCountOnExam: wire.questionCountOnExam > 0 ? wire.questionCountOnExam : undefined,
    questions: wire.questions.map((q, idx) => {
      const found = solution?.find((a) => Math.round(a.index) === idx + 1);
      // An answer Claude itself is not sure of is never filled in: the teacher decides
      const answer = found && !found.certain
        ? { ...found, correctOptionLabels: [], statementAnswers: [], acceptableAnswers: [], sampleSolutionText: '' }
        : found;
      const labels = (answer?.correctOptionLabels ?? []).filter((l) => l.trim());
      const note = [q.reviewNote, answer?.reviewNote ?? ''].map((n) => n.trim()).filter(Boolean).join(' ');
      return {
        sourceNumber: text(q.sourceNumber),
        type: q.type,
        promptText: q.promptText,
        points: q.points,
        options: list(q.options),
        ...(q.type === 'single_choice' && labels.length === 1 ? { correctOptionLabel: labels[0] } : {}),
        correctOptionLabels: q.type === 'multiple_choice' ? list(labels) : undefined,
        statements: list(
          q.statements.map((st, sIdx) => {
            const verdict = answer?.statementAnswers[sIdx];
            return { label: st.label, text: st.text, ...(verdict ? { isTrue: verdict === 'dung' } : {}) };
          })
        ),
        acceptableAnswers: list((answer?.acceptableAnswers ?? []).filter((a) => a.trim())),
        sampleSolutionText: text(answer?.sampleSolutionText ?? ''),
        figures: list(q.figures),
        needsReview: note ? true : undefined,
        reviewNote: text(note),
      };
    }),
  };
}

export const CLAUDE_PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

/**
 * Output ceiling for one conversion, scaled by page count. A measured 10-question
 * page with solving used ~2,500 output tokens (thinking included), so 12k for
 * the first page and 4k per extra page leaves several times that headroom,
 * while the worst case of a 1-page exam costs ~0.12 USD instead of ~0.64 USD.
 * Hitting it stops with "đề quá dài", never with a silently truncated exam.
 */
export function parseOutputTokenLimit(pages: number): number {
  return Math.min(64000, 12000 + 4000 * Math.max(0, pages - 1));
}

/** Teacher-facing reason for a 400 from Claude, by what the API actually said. */
export function badRequestReason(apiMessage: string): string {
  const m = apiMessage.toLowerCase();
  if (m.includes('schema') || m.includes('output_config') || m.includes('grammar')) {
    return 'Lỗi cấu hình AI phía máy chủ MimoEDU, không phải do tệp đề. Hãy báo quản trị viên';
  }
  if (m.includes('password') || m.includes('encrypted')) return 'Tệp PDF có mật khẩu nên AI không mở được. Hãy bỏ mật khẩu hoặc chụp ảnh đề';
  if (m.includes('page') && (m.includes('limit') || m.includes('maximum') || m.includes('exceed'))) {
    return 'Tệp có quá nhiều trang cho một lần nhận dạng. Hãy tách đề thành nhiều phần';
  }
  if (m.includes('too large') || m.includes('exceeds') || m.includes('maximum') || m.includes('size')) {
    return 'Ảnh hoặc tệp quá lớn để AI xử lý. Hãy chụp lại với độ phân giải thấp hơn hoặc tách đề';
  }
  if (m.includes('media type') || m.includes('image') || m.includes('base64') || m.includes('pdf')) {
    return 'AI không đọc được ảnh/tệp này (định dạng không đúng hoặc tệp bị hỏng). Hãy lưu lại thành JPG/PNG rồi thử lại';
  }
  return 'AI từ chối yêu cầu này. Hãy thử lại; nếu vẫn lỗi, báo quản trị viên kèm mã yêu cầu';
}

/** Pixel size of a JPEG, PNG, WEBP or GIF from its header; null when it cannot be read. */
export function imagePixelSize(base64: string): { width: number; height: number } | null {
  const b = Buffer.from(base64, 'base64');
  if (b.length < 30) return null;
  if (b.subarray(0, 4).toString('hex') === '89504e47') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.subarray(0, 3).toString('latin1') === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') {
    const chunk = b.subarray(12, 16).toString('latin1');
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
    return null;
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    // Walk the JPEG segments to the frame header (SOF0–SOF15, except DHT/JPG/DAC)
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      }
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Longest edge and pixel count Claude reads an image at; larger images are scaled down by the API. */
const CLAUDE_MAX_EDGE = 2576;
const CLAUDE_MAX_PIXELS = 3_750_000;

/** The image size Claude actually sees, which its pixel coordinates refer to. */
export function seenImageSize(base64: string): { width: number; height: number } | null {
  const size = imagePixelSize(base64);
  if (!size || size.width <= 0 || size.height <= 0) return null;
  const scale = Math.min(
    1,
    CLAUDE_MAX_EDGE / Math.max(size.width, size.height),
    Math.sqrt(CLAUDE_MAX_PIXELS / (size.width * size.height))
  );
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/** A pixel box on the image Claude saw, as the 0–1000 page box the editor crops with. */
export function pixelBoxToNormalized(box: number[], seen: { width: number; height: number }): number[] {
  const clamp = (v: number) => Math.min(1000, Math.max(0, Math.round(v)));
  const [x0, y0, x1, y1] = box;
  return [
    clamp((Math.min(x0, x1) / seen.width) * 1000),
    clamp((Math.min(y0, y1) / seen.height) * 1000),
    clamp((Math.max(x0, x1) / seen.width) * 1000),
    clamp((Math.max(y0, y1) / seen.height) * 1000),
  ];
}

/** The real image type from the file's first bytes (a .jpg may really be PNG, WEBP or HEIC). */
export function sniffImageType(base64: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' | 'unsupported' {
  const head = Buffer.from(base64.slice(0, 24), 'base64');
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (head.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif';
  return 'unsupported';
}

export class AnthropicAIAdapter implements AIProviderAdapter {
  public readonly providerName = 'anthropic-claude';
  public readonly defaultModel: string;
  private client: Anthropic | null = null;
  /** Token usage of the last conversion, also kept when the result was unusable. */
  public lastUsage: { inputTokens: number; outputTokens: number; costUsd: number; stopReason: string | null } | null = null;

  /**
   * Limits for cost-capped runs (the real-AI check script). Production uses
   * the defaults: SDK retries, 64k output tokens, refusal fallback on.
   */
  constructor(
    model?: string,
    private readonly limits: { maxRetries?: number; maxOutputTokens?: number; fallbacks?: boolean } = {}
  ) {
    this.defaultModel = model?.startsWith('claude-') ? model : 'claude-sonnet-5-5';
  }

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new AIUnavailableError('ANTHROPIC_API_KEY is not set');
    }
    this.client ??= new Anthropic(this.limits.maxRetries === undefined ? {} : { maxRetries: this.limits.maxRetries });
    return this.client;
  }

  private resolveModel(preferredModel?: string): string {
    return preferredModel?.startsWith('claude-') ? preferredModel : this.defaultModel;
  }

  private estimateCost(model: string, usage: Anthropic.Beta.BetaUsage): number {
    const price = CLAUDE_PRICING_PER_MTOK[model] ?? CLAUDE_PRICING_PER_MTOK['claude-sonnet-5-5'];
    const inputTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
    return Number(
      ((inputTokens * price.input + usage.output_tokens * price.output) / 1_000_000).toFixed(4)
    );
  }

  private toFriendlyError(error: unknown): Error {
    if (error instanceof Anthropic.AuthenticationError) {
      return new AIUnavailableError(`ANTHROPIC_API_KEY rejected: ${error.message}`);
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new Error('Claude đang quá tải hoặc vượt hạn mức. Vui lòng thử lại sau ít phút.');
    }
    // Raw API details go to the server log; teachers get the actual reason in plain words plus the request id
    if (error instanceof Anthropic.BadRequestError) {
      console.error('Claude API rejected the request:', error.message);
      return new Error(`${badRequestReason(error.message)} (mã yêu cầu: ${error.requestID ?? 'không có'})`);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Claude API error (${error.status ?? 'network'}):`, error.message);
      return new Error('Dịch vụ AI đang gặp sự cố tạm thời. Vui lòng thử lại sau ít phút.');
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  /** Page blocks sent with both steps: each page labelled with the pixel size Claude sees it at. */
  private pageBlocks(input: ParseHomeworkInput): Anthropic.Beta.BetaContentBlockParam[] {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    input.files.forEach((file, idx) => {
      const seen = file.mimeType === 'application/pdf' ? null : seenImageSize(file.base64Data);
      content.push({
        type: 'text',
        text: seen ? `Trang/File ${idx + 1} (ảnh rộng ${seen.width} px, cao ${seen.height} px):` : `Trang/File ${idx + 1}:`,
      });
      if (file.mimeType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.base64Data },
        });
      } else {
        const mediaType = sniffImageType(file.base64Data);
        if (mediaType === 'unsupported') {
          throw new Error(
            `Tệp số ${idx + 1} không phải ảnh JPG, PNG, WEBP hoặc GIF (có thể là ảnh HEIC của iPhone). Hãy lưu lại thành JPG rồi thử lại.`
          );
        }
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: file.base64Data },
        });
      }
    });
    return content;
  }

  /** Step 1, identical in both modes: copy the paper verbatim, never solve. */
  private buildParseRequest(input: ParseHomeworkInput) {
    const system = `Bạn số hóa đề kiểm tra / bài tập Toán tiếng Việt từ ảnh chụp hoặc PDF thành dữ liệu có cấu trúc. Giáo viên sẽ soát lại kết quả bên cạnh đề gốc trước khi giao cho học sinh, nên hãy chép trung thực, đầy đủ, đúng thứ tự.

Phạm vi:
- Bỏ qua phần đầu đề không phải câu hỏi: tên trường/phòng, họ tên, lớp, ô điểm, nhận xét của giáo viên, chữ ký.
- Trước khi chép, đếm tất cả các câu hỏi in trên đề (Câu 1, Câu 2, … ở mọi trang) và ghi tổng vào questionCountOnExam. Phải chép ĐỦ tất cả các câu đến câu cuối cùng, không dừng giữa chừng.
- sourceNumber: số câu như in trên đề, ví dụ "7"; ý tách riêng ghi "3a", "3b".
- title: tên bài kiểm tra như in trên đề. grade: khối lớp dạng "Khối 3" lấy từ đề (ví dụ "Lớp 3"); bỏ trống nếu đề không ghi.
- Hướng dẫn chung của cả đề hoặc một phần (ví dụ "Khoanh vào chữ cái trước câu trả lời đúng") đưa vào description, không lặp lại trong từng câu.

Dạng câu hỏi (type):
- single_choice: trắc nghiệm một đáp án đúng.
- multiple_choice: trắc nghiệm nhiều đáp án đúng.
- true_false_multi: câu đúng/sai gồm nhiều mệnh đề a), b), c), d).
- short_answer: điền đáp số / trả lời ngắn.
- essay: tự luận trình bày lời giải. Nếu một bài tự luận có các ý a), b), c) thì giữ chung một câu, các ý xuống dòng trong promptText.
- Một câu có các ý a/, b/ mà mỗi ý có bộ phương án riêng hoặc chỗ chấm để điền đáp số riêng (ví dụ "a) Diện tích hình H là: ……", "b) Chu vi hình H là: ……") thì LUÔN tách thành các câu hỏi riêng theo đúng thứ tự (sourceNumber "6a", "6b"), mỗi câu mở đầu promptText bằng nhãn ý. Phần dẫn chung của câu (ví dụ "Hình H gồm …") chép vào ý đầu tiên; ý sau dùng chung hình thì khai báo lại hình đó trong figures. Chia điểm của câu gốc cho các ý (ghi trong đề hoặc chia đều).

Cách viết nội dung:
- Công thức toán viết bằng LaTeX đặt trong $...$ ngay tại vị trí của nó trong câu, ví dụ: "Tính $\\frac{3}{4} + \\frac{1}{2}$". Công thức lớn đứng riêng một dòng thì viết thành một dòng "$$...$$".
- Dùng ký tự xuống dòng (\\n) để tách đoạn. Giữ nguyên tiếng Việt có dấu.
- Không chép số thứ tự "Câu 1." vào promptText; không chép nhãn "A." vào text của phương án (đặt vào label).
- Mọi trường đều phải có mặt. Trường không áp dụng thì để trống: chuỗi "", mảng [], questionCountOnExam = 0 nếu đề không đánh số câu.
- Hình: câu nào có hình in trên đề (hình vẽ, ô vuông, hình học có ghi kích thước, tranh, sơ đồ) thì KHÔNG được bỏ qua hình đó; nếu câu cần hình vẽ, tranh, đồ thị hoặc bảng để làm bài (kể cả hình để đếm như ngôi sao, tam giác, khối hình), khai báo từng hình trong figures để hệ thống cắt hình từ đề gốc:
  - page: số thứ tự trang/file chứa hình (bắt đầu từ 1).
  - box: [xMin, yMin, xMax, yMax] là khung bao quanh hình, tính bằng PIXEL của ảnh trang đó (kích thước ảnh ghi ngay trước mỗi trang; 0,0 là góc trên bên trái). Khung phải chứa TRỌN hình: mọi cạnh, đỉnh, nhãn chữ cái (A, B, C…), số đo (7 cm, 1cm²…) và mũi tên chú thích; thà rộng hơn một chút còn hơn cắt mất. Không lấy phần chữ của câu hỏi hay phương án.
  - description: mô tả ngắn hình đó.
- promptText chỉ chép chữ in trong đề, đúng nguyên văn. Không tự thêm vào promptText số đo, nhãn hay nội dung đọc từ hình vẽ (ví dụ không viết thêm "(BC = 7 cm)"); những thông tin đó đã nằm trong hình được cắt.
- Bảng số liệu: chép thành bảng ngay trong promptText, mỗi hàng một dòng dạng "| Lớp | 3A | 3B |"; nếu hàng đầu là tiêu đề thì thêm dòng "|---|---|---|" ngay sau nó. Chỉ cắt bảng thành hình khi bảng có hình vẽ hoặc ô gộp không chép được.
- Đơn vị đo (cm, m, kg, giờ, phút…) viết bằng chữ thường, không đặt trong $...$; đơn vị diện tích, thể tích dùng ký tự ² ³ (ví dụ 9 cm², 1 cm²).
- Số có hàng nghìn viết như in trên đề, với dấu cách thường (ví dụ 2 345); không dùng lệnh LaTeX \\, để tách hàng nghìn.
- points: dùng điểm ghi trong đề; nếu đề không ghi, chia hợp lý để tổng là 10 điểm.
- Nếu tài liệu có nhiều file, đó là các trang liên tiếp của cùng một đề theo thứ tự gửi.

Đánh dấu cần kiểm tra: ghi reviewNote (một câu ngắn nêu lý do; để "" nếu không cần) khi câu đó cần giáo viên soát kỹ, ví dụ chữ hoặc số trong ảnh bị mờ, không chắc đã chép đúng, hoặc đề có thể có nhiều cách hiểu. Không đánh dấu những câu rõ ràng.

Chỉ chép đề, KHÔNG giải và không nêu đáp án ở bất kỳ trường nào.`;

    const content = this.pageBlocks(input);
    content.push({
      type: 'text',
      text: 'Hãy chuyển toàn bộ đề Toán trên thành dữ liệu theo schema.',
    });
    return {
      system,
      messages: [{ role: 'user' as const, content }],
      output_config: {
        effort: 'medium' as const,
        format: zodOutputFormat(claudeParsedHomeworkSchema),
      },
    };
  }

  /** Step 2 ("Chép đề + AI giải"): answers for the questions step 1 copied; it cannot change them. */
  private buildSolveRequest(input: ParseHomeworkInput, extraction: ClaudeExtraction) {
    const copied = extraction.questions.map((q, idx) => ({
      index: idx + 1,
      sourceNumber: q.sourceNumber,
      type: q.type,
      promptText: q.promptText,
      ...(q.options.length ? { options: q.options } : {}),
      ...(q.statements.length ? { statements: q.statements } : {}),
      ...(q.figures.length ? { figures: q.figures.map((f) => `trang ${f.page}: ${f.description}`) } : {}),
    }));
    const system = `Bạn là giáo viên Toán tiểu học Việt Nam, giải đề kiểm tra để đề xuất đáp án. Giáo viên sẽ kiểm tra, sửa và duyệt từng đáp án trước khi dùng.

Đề đã được chép sẵn thành danh sách câu hỏi (kèm ảnh đề gốc để xem hình vẽ, bảng và số đo). Trả về một mục trong answers cho MỖI câu, đúng index của câu đó. Không chép lại hay sửa đề.

- single_choice: correctOptionLabels gồm đúng một nhãn (ví dụ ["B"]). multiple_choice: tất cả nhãn đúng.
- true_false_multi: statementAnswers có đúng một giá trị "dung"/"sai" cho mỗi mệnh đề, theo thứ tự.
- short_answer: acceptableAnswers ghi đáp số dạng chữ thường, không dùng $…$; nếu đáp số có đơn vị thì ghi cả dạng có đơn vị và không đơn vị (ví dụ "16 cm", "16").
- essay: sampleSolutionText là lời giải trình bày như học sinh lớp 3 (câu lời giải, phép tính kèm đơn vị trong ngoặc, dòng cuối "Đáp số: …"). Viết công thức trong $...$ nếu cần. Các dạng khác để sampleSolutionText là "".
- Số đo, độ dài, nhãn ghi trên hình vẽ là dữ kiện của bài: đọc chúng từ ảnh đề gốc.
- Trường không áp dụng để trống ("" hoặc []).
- certain = true chỉ khi bạn tự giải ra đáp án từ dữ kiện của đề (đã đọc/đếm được trên hình). Nếu hình mờ, thiếu số đo, phải đếm trên hình mà không chắc, không đủ dữ kiện, hoặc đáp án chỉ suy ra từ cách đặt các phương án, thì certain = false và ghi rõ lý do trong reviewNote; đáp án khi đó sẽ không được dùng.
- Câu chắc chắn thì reviewNote là "", trừ khi có điều giáo viên cần biết (ví dụ số đo đọc từ hình).`;
    const content = this.pageBlocks(input);
    content.push({
      type: 'text',
      text: `Đề đã chép (JSON):\n${JSON.stringify(copied)}\n\nHãy giải từng câu theo schema.`,
    });
    return {
      system,
      messages: [{ role: 'user' as const, content }],
      output_config: {
        effort: 'high' as const,
        format: zodOutputFormat(claudeSolutionSchema),
      },
    };
  }

  /** Cost of every call of the current conversion (a method so TS does not narrow lastUsage to null). */
  private usageCost(): number {
    return this.lastUsage?.costUsd ?? 0;
  }

  /** One structured-output call; usage is added to this.lastUsage. */
  private async runStructured(
    model: string,
    request: Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, 'system' | 'messages' | 'output_config'>,
    maxTokens: number
  ): Promise<{ message: Anthropic.Beta.BetaMessage; json: unknown }> {
    let message: Anthropic.Beta.BetaMessage;
    try {
      // Streaming keeps long exams (large outputs) clear of HTTP timeouts.
      const stream = this.getClient().beta.messages.stream({
        model,
        max_tokens: maxTokens,
        ...(this.limits.fallbacks === false
          ? {}
          : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }),
        ...request,
      });
      message = await stream.finalMessage();
    } catch (error) {
      throw this.toFriendlyError(error);
    }
    const before = this.lastUsage;
    this.lastUsage = {
      inputTokens: (before?.inputTokens ?? 0) + message.usage.input_tokens,
      outputTokens: (before?.outputTokens ?? 0) + message.usage.output_tokens,
      costUsd: Number(((before?.costUsd ?? 0) + this.estimateCost(model, message.usage)).toFixed(4)),
      stopReason: message.stop_reason,
    };
    if (message.stop_reason === 'refusal') {
      throw new Error('Claude từ chối xử lý tài liệu này. Vui lòng kiểm tra lại nội dung file.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('Đề quá dài để xử lý trong một lần. Vui lòng tách thành nhiều phần nhỏ hơn.');
    }
    const rawText = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    try {
      return { message, json: JSON.parse(rawText) };
    } catch {
      console.error('Claude returned non-JSON output, stop_reason:', message.stop_reason, rawText.slice(0, 300));
      throw new Error('AI trả kết quả không đúng định dạng. Vui lòng thử lại.');
    }
  }

  /** Exact input tokens of a conversion request, output schema included (count_tokens is free). */
  async countParseInputTokens(input: ParseHomeworkInput): Promise<number> {
    const result = await this.getClient().beta.messages.countTokens({
      model: this.resolveModel(input.preferredModel),
      ...this.buildParseRequest(input),
    });
    return result.input_tokens;
  }

  async parseHomeworkFromMedia(
    input: ParseHomeworkInput
  ): Promise<ParsedHomeworkOutput> {
    const startTime = Date.now();
    const model = this.resolveModel(input.preferredModel);
    this.lastUsage = null;

    const step1 = await this.runStructured(
      model,
      this.buildParseRequest(input),
      this.limits.maxOutputTokens ?? parseOutputTokenLimit(input.files.length)
    );
    const extraction = claudeParsedHomeworkSchema.parse(step1.json);

    let solution: ClaudeSolution['answers'] | undefined;
    if (input.solveWithAI && extraction.questions.length > 0) {
      try {
        const step2 = await this.runStructured(
          model,
          this.buildSolveRequest(input, extraction),
          this.limits.maxOutputTokens ?? parseOutputTokenLimit(input.files.length)
        );
        solution = claudeSolutionSchema.parse(step2.json).answers;
      } catch (error) {
        // The copied exam is still returned; every question is flagged as unsolved, with the reason
        if ((error as { code?: string } | null)?.code === 'AI_UNAVAILABLE') throw error;
        console.error('Solve step failed:', error);
        const reason = error instanceof Error ? error.message : String(error);
        solution = extraction.questions.map((_q, idx) => ({
          index: idx + 1,
          correctOptionLabels: [],
          statementAnswers: [],
          acceptableAnswers: [],
          sampleSolutionText: '',
          certain: false,
          reviewNote: `Bước AI giải bị lỗi: ${reason}`,
        }));
      }
    }
    const message = step1.message;
    const parsedJson = wireToParsed(extraction, solution);
    if (parsedJson.questions.length === 0) {
      throw new Error(
        'Không tìm thấy câu hỏi Toán học nào trong ảnh hoặc PDF đã tải lên. Vui lòng chọn file đề Toán rõ nét hơn.'
      );
    }
    const validated = aiParsedHomeworkResponseSchema.parse({
      ...parsedJson,
      questions: parsedJson.questions.map((q) => ({
        ...q,
        figures: q.figures
          ?.filter((f) => f.box.length === 4 && f.page >= 1 && f.page <= input.files.length)
          .map((f) => {
            const page = Math.round(f.page);
            const file = input.files[page - 1];
            const seen = file.mimeType === 'application/pdf' ? null : seenImageSize(file.base64Data);
            return { ...f, page, box: seen ? pixelBoxToNormalized(f.box, seen) : f.box };
          })
          .filter((f) => f.box[2] > f.box[0] && f.box[3] > f.box[1]),
        points: q.points > 0 ? q.points : 2,
        // The question's points shared between its statements (to the nearest quarter point)
        statements: q.statements?.map((st, _i, all) => ({
          ...st,
          points: Math.max(0.25, Math.round(((q.points > 0 ? q.points : 2) / all.length) * 4) / 4),
        })),
      })),
    });

    const questions = mapParsedQuestions(validated.questions, input.solveWithAI);
    return {
      title: validated.title,
      description: validated.description || 'Đề bài được trích xuất bằng AI',
      grade: normalizeGrade(validated.grade),
      questions,
      figures: collectFigureRequests(validated.questions, questions),
      completeness: checkCompleteness(
        validated.questions.map((q) => q.sourceNumber),
        validated.questionCountOnExam,
        message.stop_reason !== 'end_turn'
      ),
      answerSource: input.solveWithAI ? 'ai' : 'teacher',
      aiSolverEnabled: input.solveWithAI,
      provider: this.providerName,
      model: message.model,
      durationMs: Date.now() - startTime,
      estimatedCostUsd: this.usageCost(),
    };
  }

  /** One figure picture, labelled with the size Claude sees it at (its coordinates use that size). */
  private figureImage(label: string, file: MediaFileInput): Anthropic.Beta.BetaContentBlockParam[] {
    const mediaType = sniffImageType(file.base64Data);
    if (mediaType === 'unsupported') throw new Error('Ảnh hình không phải JPG, PNG, WEBP hoặc GIF.');
    const seen = seenImageSize(file.base64Data);
    return [
      { type: 'text', text: seen ? `${label} (ảnh rộng ${seen.width} px, cao ${seen.height} px):` : `${label}:` },
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: file.base64Data } },
    ];
  }

  /** Reads a figure into a description MimoEDU can draw. The AI never draws: no picture comes back. */
  async redrawFigure(input: FigureRedrawInput): Promise<FigureRedrawOutput> {
    const startTime = Date.now();
    const model = this.defaultModel;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: `Câu hỏi có hình này:\n${input.questionText.slice(0, 3000) || '(không có chữ)'}` },
      ...this.figureImage('Hình gốc', input.image),
    ];
    if (input.hint?.trim()) {
      content.push({ type: 'text', text: `Giáo viên nhận xét lần đọc trước: ${input.hint.trim().slice(0, 500)}\nĐọc lại hình gốc thật kỹ, sửa đúng các điểm này nếu hình gốc cho thấy như vậy.` });
    }
    content.push({ type: 'text', text: 'Hãy mô tả hình theo schema.' });
    const { message, json } = await this.runStructured(
      model,
      {
        system: FIGURE_READ_SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: zodOutputFormat(claudeFigureReadSchema) },
      },
      16000
    );
    const read = claudeFigureReadSchema.parse(json);
    const spec = read.redrawable ? figureSpecFromWire(read) : null;
    return {
      redrawable: read.redrawable && spec !== null,
      reason: read.redrawable && !spec ? 'AI chưa mô tả được hình này thành dữ liệu vẽ lại.' : read.reason,
      spec,
      readings: read.readings,
      uncertain: read.uncertain.filter((u) => u.trim()).slice(0, 20),
      provider: this.providerName,
      model: message.model,
      durationMs: Date.now() - startTime,
      estimatedCostUsd: this.estimateCost(model, message.usage),
    };
  }

  /** Compares the original figure with MimoEDU's drawing; differences mean the redraw is not used as is. */
  async compareFigure(input: FigureCompareInput): Promise<FigureCompareOutput> {
    const startTime = Date.now();
    const model = this.defaultModel;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      { type: 'text', text: `Câu hỏi có hình này:\n${input.questionText.slice(0, 3000) || '(không có chữ)'}` },
      ...this.figureImage('Ảnh 1 – HÌNH GỐC', input.original),
      ...this.figureImage('Ảnh 2 – HÌNH VẼ LẠI', input.redrawn),
      { type: 'text', text: 'So sánh hai hình theo schema.' },
    ];
    const { message, json } = await this.runStructured(
      model,
      {
        system: FIGURE_COMPARE_SYSTEM,
        messages: [{ role: 'user', content }],
        output_config: { effort: 'medium', format: zodOutputFormat(claudeFigureCompareSchema) },
      },
      12000
    );
    return {
      verification: verificationFromWire(claudeFigureCompareSchema.parse(json)),
      provider: this.providerName,
      model: message.model,
      durationMs: Date.now() - startTime,
      estimatedCostUsd: this.estimateCost(model, message.usage),
    };
  }

  async suggestEssayGrading(
    input: EssayGradingInput
  ): Promise<EssayGradingOutput> {
    const startTime = Date.now();
    const model = this.resolveModel(input.preferredModel);
    const client = this.getClient();

    const prompt = `Hãy chấm điểm đề xuất cho câu trả lời tự luận môn Toán của học sinh.
- Đề bài: ${input.questionPrompt}
- Thang điểm tối đa: ${input.maxPoints} điểm
- Hướng dẫn chấm / Rubric: ${input.rubric || 'Chấm theo tính đúng đắn của lập luận và kết quả toán học.'}
- Đáp án tham khảo: ${input.sampleSolution || 'Không đính kèm'}
- Bài làm của học sinh: ${input.studentEssayText}

Trả về:
1. suggestedScore: số điểm từ 0 đến ${input.maxPoints}
2. explanation: giải thích ngắn gọn cho giáo viên vì sao đề xuất mức điểm này
3. improvementFeedback: nhận xét thân thiện, khích lệ gửi học sinh để cải thiện cách trình bày`;

    let response;
    try {
      response = await client.beta.messages.parse({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: 'medium',
          format: zodOutputFormat(
            z.object({
              suggestedScore: z.number(),
              explanation: z.string(),
              improvementFeedback: z.string(),
            })
          ),
        },
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (error) {
      throw this.toFriendlyError(error);
    }

    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      throw new Error('Claude không thể đưa ra gợi ý chấm cho bài làm này.');
    }
    const parsed = aiEssayGradingSuggestionSchema.parse(response.parsed_output);
    const boundedScore = Math.min(
      input.maxPoints,
      Math.max(0, Number(parsed.suggestedScore.toFixed(2)))
    );

    return {
      suggestedScore: boundedScore,
      explanation: parsed.explanation,
      improvementFeedback: parsed.improvementFeedback,
      provider: this.providerName,
      model: response.model,
      durationMs: Date.now() - startTime,
    };
  }
}

export function getAIAdapter(): AIProviderAdapter {
  if (process.env.AI_PROVIDER === 'gemini') {
    return new GeminiAIAdapter();
  }
  return new AnthropicAIAdapter(process.env.AI_MODEL);
}
