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
import { richTextFromAIText } from '../utils/richText.js';

export { richTextFromAIText };

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

export interface EssayGradingOutput {
  suggestedScore: number;
  explanation: string;
  improvementFeedback: string;
  provider: string;
  model: string;
  durationMs: number;
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
            correctOptionId = found?.id || options[0]?.id;
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
          isTrue: solveWithAI ? (st.isTrue ?? true) : undefined,
          points: st.points || 0.5,
        }));
      }

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
              acceptableAnswers: solveWithAI
                ? q.acceptableAnswers || []
                : [],
            }
          : {}),
        ...(q.needsReview
          ? { aiReviewNote: q.reviewNote?.trim() || 'AI chưa chắc chắn ở câu này, vui lòng kiểm tra.' }
          : {}),
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

  private getClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY chưa được cấu hình trên server.');
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
              description: 'Khối lớp ước tính, ví dụ Khối 5',
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
      grade: validated.grade || 'Khối 5',
      questions: mappedQuestions,
      figures: [],
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

// Output schema for Claude structured outputs. Kept free of numeric/length
// constraints; the result is re-validated with aiParsedHomeworkResponseSchema.
const claudeParsedHomeworkSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  grade: z.string().optional(),
  questions: z.array(
    z.object({
      type: z.enum([
        'single_choice',
        'multiple_choice',
        'true_false_multi',
        'short_answer',
        'essay',
      ]),
      promptText: z.string(),
      points: z.number(),
      options: z.array(z.object({ label: z.string(), text: z.string() })).optional(),
      correctOptionLabel: z.string().optional(),
      correctOptionLabels: z.array(z.string()).optional(),
      statements: z
        .array(
          z.object({
            label: z.string(),
            text: z.string(),
            isTrue: z.boolean().optional(),
            points: z.number().optional(),
          })
        )
        .optional(),
      acceptableAnswers: z.array(z.string()).optional(),
      rubric: z.string().optional(),
      sampleSolutionText: z.string().optional(),
      figures: z
        .array(
          z.object({
            page: z.number(),
            box: z.array(z.number()),
            description: z.string(),
          })
        )
        .optional(),
      needsReview: z.boolean().optional(),
      reviewNote: z.string().optional(),
    })
  ),
});

const CLAUDE_PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5 },
};

export class AnthropicAIAdapter implements AIProviderAdapter {
  public readonly providerName = 'anthropic-claude';
  public readonly defaultModel: string;
  private client: Anthropic | null = null;

  constructor(model?: string) {
    this.defaultModel = model?.startsWith('claude-') ? model : 'claude-sonnet-5-5';
  }

  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY chưa được cấu hình trên server.');
    }
    this.client ??= new Anthropic();
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
      return new Error('ANTHROPIC_API_KEY không hợp lệ. Vui lòng kiểm tra cấu hình server.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new Error('Claude đang quá tải hoặc vượt hạn mức. Vui lòng thử lại sau ít phút.');
    }
    if (error instanceof Anthropic.BadRequestError) {
      return new Error(`Yêu cầu không hợp lệ: ${error.message}`);
    }
    if (error instanceof Anthropic.APIError) {
      return new Error(`Lỗi Claude API (${error.status ?? 'mạng'}): ${error.message}`);
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  async parseHomeworkFromMedia(
    input: ParseHomeworkInput
  ): Promise<ParsedHomeworkOutput> {
    const startTime = Date.now();
    const model = this.resolveModel(input.preferredModel);
    const client = this.getClient();

    const solverInstruction = input.solveWithAI
      ? 'Giáo viên BẬT chế độ AI giải đề: hãy giải cẩn thận từng câu và điền đáp án (correctOptionLabel, correctOptionLabels, isTrue của từng mệnh đề, acceptableAnswers) cùng sampleSolutionText cho câu tự luận. Đáp án sẽ được giáo viên duyệt lại.'
      : 'Giáo viên TẮT chế độ AI giải đề: chỉ chép đề. Chỉ điền đáp án khi tài liệu ghi sẵn đáp án rõ ràng; nếu không, bỏ trống các trường đáp án.';

    const system = `Bạn số hóa đề kiểm tra / bài tập Toán tiếng Việt từ ảnh chụp hoặc PDF thành dữ liệu có cấu trúc. Giáo viên sẽ soát lại kết quả bên cạnh đề gốc trước khi giao cho học sinh, nên hãy chép trung thực, đầy đủ, đúng thứ tự.

Phạm vi:
- Bỏ qua phần đầu đề không phải câu hỏi: tên trường/phòng, họ tên, lớp, ô điểm, nhận xét của giáo viên, chữ ký.
- title: tên bài kiểm tra như in trên đề. grade: khối lớp dạng "Khối 3" lấy từ đề (ví dụ "Lớp 3"); bỏ trống nếu đề không ghi.
- Hướng dẫn chung của cả đề hoặc một phần (ví dụ "Khoanh vào chữ cái trước câu trả lời đúng") đưa vào description, không lặp lại trong từng câu.

Dạng câu hỏi (type):
- single_choice: trắc nghiệm một đáp án đúng.
- multiple_choice: trắc nghiệm nhiều đáp án đúng.
- true_false_multi: câu đúng/sai gồm nhiều mệnh đề a), b), c), d).
- short_answer: điền đáp số / trả lời ngắn.
- essay: tự luận trình bày lời giải. Nếu một bài tự luận có các ý a), b), c) thì giữ chung một câu, các ý xuống dòng trong promptText.
- Một câu có các ý a/, b/ mà mỗi ý có bộ phương án riêng (hoặc đáp án riêng) thì tách thành các câu hỏi riêng theo đúng thứ tự, mỗi câu mở đầu promptText bằng nhãn ý, ví dụ "a) Tích của 32 và 2 là:". Chia điểm của câu gốc cho các ý (ghi trong đề hoặc chia đều).

Cách viết nội dung:
- Công thức toán viết bằng LaTeX đặt trong $...$ ngay tại vị trí của nó trong câu, ví dụ: "Tính $\\frac{3}{4} + \\frac{1}{2}$". Công thức lớn đứng riêng một dòng thì viết thành một dòng "$$...$$".
- Dùng ký tự xuống dòng (\\n) để tách đoạn. Giữ nguyên tiếng Việt có dấu.
- Không chép số thứ tự "Câu 1." vào promptText; không chép nhãn "A." vào text của phương án (đặt vào label).
- Hình: nếu câu cần hình vẽ, tranh, đồ thị hoặc bảng để làm bài (kể cả hình để đếm như ngôi sao, tam giác, khối hình), khai báo từng hình trong figures để hệ thống cắt hình từ đề gốc:
  - page: số thứ tự trang/file chứa hình (bắt đầu từ 1).
  - box: [xMin, yMin, xMax, yMax] là khung bao quanh hình, theo thang 0–1000 của chiều rộng và chiều cao trang (0,0 là góc trên bên trái). Khung phải chứa trọn hình kể cả nhãn chữ trên hình, không lấy phần chữ của câu hỏi hay phương án.
  - description: mô tả ngắn hình đó.
  Bảng số liệu đơn giản thì chép thành chữ thay vì cắt hình.
- points: dùng điểm ghi trong đề; nếu đề không ghi, chia hợp lý để tổng là 10 điểm.
- Nếu tài liệu có nhiều file, đó là các trang liên tiếp của cùng một đề theo thứ tự gửi.

Đánh dấu cần kiểm tra: đặt needsReview = true và ghi reviewNote (một câu ngắn nêu lý do) khi câu đó cần giáo viên soát kỹ, ví dụ chữ hoặc số trong ảnh bị mờ, không chắc đã chép đúng, đáp án phụ thuộc vào việc đọc/đếm trên hình, hoặc đề có thể có nhiều cách hiểu. Không đánh dấu những câu rõ ràng.

${solverInstruction}`;

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    input.files.forEach((file, idx) => {
      content.push({ type: 'text', text: `Trang/File ${idx + 1}:` });
      if (file.mimeType === 'application/pdf') {
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: file.base64Data },
        });
      } else {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: file.mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
            data: file.base64Data,
          },
        });
      }
    });
    content.push({
      type: 'text',
      text: 'Hãy chuyển toàn bộ đề Toán trên thành dữ liệu theo schema.',
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      // Streaming keeps long exams (large outputs) clear of HTTP timeouts.
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 64000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: {
          effort: input.solveWithAI ? 'high' : 'medium',
          format: zodOutputFormat(claudeParsedHomeworkSchema),
        },
        system,
        messages: [{ role: 'user', content }],
      });
      message = await stream.finalMessage();
    } catch (error) {
      throw this.toFriendlyError(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new Error('Claude từ chối xử lý tài liệu này. Vui lòng kiểm tra lại nội dung file.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new Error('Đề quá dài để xử lý trong một lần. Vui lòng tách thành nhiều phần nhỏ hơn.');
    }

    const rawText = message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    const parsedJson = claudeParsedHomeworkSchema.parse(JSON.parse(rawText));
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
          .map((f) => ({ ...f, page: Math.round(f.page) })),
        points: q.points > 0 ? q.points : 2,
        statements: q.statements?.map((st) => ({
          ...st,
          points: st.points && st.points > 0 ? st.points : 0.5,
        })),
      })),
    });

    const questions = mapParsedQuestions(validated.questions, input.solveWithAI);
    return {
      title: validated.title,
      description: validated.description || 'Đề bài được trích xuất bằng AI',
      grade: validated.grade || 'Khối 5',
      questions,
      figures: collectFigureRequests(validated.questions, questions),
      answerSource: input.solveWithAI ? 'ai' : 'teacher',
      aiSolverEnabled: input.solveWithAI,
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
