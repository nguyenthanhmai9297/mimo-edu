import { describe, it, expect } from 'vitest';
import {
  collectFigureRequests,
  getAIAdapter,
  mapParsedQuestions,
  richTextFromAIText,
} from '../services/aiAdapter';
import { aiParsedHomeworkResponseSchema } from '../schemas/validation';
import { createPublicQuestionsSnapshot } from '../utils/gradingEngine';

describe('richTextFromAIText', () => {
  it('keeps inline $...$ math inside paragraphs and splits lines', () => {
    const rich = richTextFromAIText('Tính $\\frac{3}{4} + \\frac{1}{2}$\na) Rút gọn');
    expect(rich.blocks).toEqual([
      { type: 'paragraph', align: 'left', text: 'Tính $\\frac{3}{4} + \\frac{1}{2}$' },
      { type: 'paragraph', align: 'left', text: 'a) Rút gọn' },
    ]);
  });

  it('turns standalone $$...$$ lines into display math blocks', () => {
    const rich = richTextFromAIText('Giải phương trình:\n$$x^2 - 5x + 6 = 0$$');
    expect(rich.blocks[1]).toEqual({ type: 'math', inline: false, latex: 'x^2 - 5x + 6 = 0' });
  });

  it('appends extra formulas and never returns empty content', () => {
    expect(richTextFromAIText('', ['\\sqrt{2}']).blocks).toEqual([
      { type: 'math', inline: false, latex: '\\sqrt{2}' },
    ]);
    expect(richTextFromAIText('').blocks).toHaveLength(1);
  });
});

describe('getAIAdapter', () => {
  it('defaults to Claude Sonnet 5.5', () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    const adapter = getAIAdapter();
    expect(adapter.providerName).toBe('anthropic-claude');
    expect(adapter.defaultModel).toBe('claude-sonnet-5-5');
  });
});

describe('figures and review flags from AI output', () => {
  const parsed = aiParsedHomeworkResponseSchema.parse({
    title: 'Bài kiểm tra cuối học kì I',
    grade: 'Khối 3',
    questions: [
      {
        type: 'single_choice',
        promptText: '$\\frac{1}{3}$ số ngôi sao là:',
        points: 0.5,
        options: [
          { label: 'A', text: '3 ngôi sao' },
          { label: 'B', text: '4 ngôi sao' },
          { label: 'C', text: '5 ngôi sao' },
        ],
        correctOptionLabel: 'C',
        figures: [{ page: 1, box: [380, 540, 980, 700], description: '15 ngôi sao' }],
      },
      {
        type: 'single_choice',
        promptText: 'Số hình tam giác có trong hình bên là:',
        points: 1,
        options: [
          { label: 'A', text: '4' },
          { label: 'B', text: '5' },
          { label: 'C', text: '6' },
        ],
        correctOptionLabel: 'C',
        figures: [{ page: 1, box: [600, 700, 400, 800] }],
        needsReview: true,
        reviewNote: 'Đáp án dựa vào đếm hình.',
      },
    ],
  });

  it('maps figure boxes to question ids and drops invalid boxes', () => {
    const questions = mapParsedQuestions(parsed.questions, true);
    const figures = collectFigureRequests(parsed.questions, questions);
    expect(figures).toEqual([
      { questionId: questions[0].id, page: 1, box: [380, 540, 980, 700], description: '15 ngôi sao' },
    ]);
    // A figure was requested, so no "insert figure" placeholder text is added
    expect(questions[0].prompt.blocks).toHaveLength(1);
  });

  it('carries the review note only for flagged questions', () => {
    const questions = mapParsedQuestions(parsed.questions, true);
    expect(questions[0].aiReviewNote).toBeUndefined();
    expect('aiReviewNote' in questions[0]).toBe(false);
    expect(questions[1].aiReviewNote).toBe('Đáp án dựa vào đếm hình.');
  });

  it('never exposes the review note in the student snapshot', () => {
    const questions = mapParsedQuestions(parsed.questions, true);
    expect(createPublicQuestionsSnapshot(questions)[1]).not.toHaveProperty('aiReviewNote');
  });
});
