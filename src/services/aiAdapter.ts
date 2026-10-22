import { GoogleGenAI, Type } from '@google/genai';
import {
  aiEssayGradingSuggestionSchema,
  aiParsedHomeworkResponseSchema,
} from '../schemas/validation';
import {
  ChoiceOption,
  HomeworkQuestion,
  TrueFalseStatement,
} from '../types/domain';
import { createRichTextFromPlain } from '../utils/gradingEngine';

export interface ParseHomeworkInput {
  mimeType: string;
  base64Data: string;
  solveWithAI: boolean;
  preferredModel?: string;
}

export interface ParsedHomeworkOutput {
  title: string;
  description: string;
  grade: string;
  questions: HomeworkQuestion[];
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
  parseHomeworkFromMedia(input: ParseHomeworkInput): Promise<ParsedHomeworkOutput>;
  suggestEssayGrading(input: EssayGradingInput): Promise<EssayGradingOutput>;
}

export class GeminiAIAdapter implements AIProviderAdapter {
  public readonly providerName = 'google-gemini';
  private readonly defaultModel = 'gemini-3.8-flash';

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
          {
            inlineData: {
              mimeType: input.mimeType,
              data: input.base64Data,
            },
          },
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

    const rawText = response.text?.trim() || '{}';
    const parsedJson = JSON.parse(rawText);
    const validated = aiParsedHomeworkResponseSchema.parse(parsedJson);

    const mappedQuestions: HomeworkQuestion[] = validated.questions.map(
      (q, index) => {
        const qId = `q_${Date.now()}_${index + 1}`;
        const prompt = createRichTextFromPlain(
          q.promptText,
          q.latexFormulas || []
        );

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
            content: createRichTextFromPlain(opt.text),
          }));

          if (input.solveWithAI) {
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
            statement: createRichTextFromPlain(st.text),
            isTrue: input.solveWithAI ? (st.isTrue ?? true) : undefined,
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
                acceptableAnswers: input.solveWithAI
                  ? q.acceptableAnswers || []
                  : [],
              }
            : {}),
          ...(q.type === 'essay'
            ? {
                rubric: q.rubric || '',
                ...(input.solveWithAI && q.sampleSolutionText
                  ? {
                      sampleSolution: createRichTextFromPlain(
                        q.sampleSolutionText
                      ),
                    }
                  : {}),
              }
            : {}),
        };
      }
    );

    const durationMs = Date.now() - startTime;
    return {
      title: validated.title,
      description: validated.description || 'Đề bài được trích xuất bằng AI',
      grade: validated.grade || 'Khối 5',
      questions: mappedQuestions,
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

export function getAIAdapter(): AIProviderAdapter {
  return new GeminiAIAdapter();
}
