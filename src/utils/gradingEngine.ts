import {
  HomeworkQuestion,
  QuestionGradingResult,
  RichTextContent,
  StudentQuestionAnswer,
} from '../types/domain.js';

/**
 * Normalizes a short-answer string:
 * - trims leading/trailing whitespace
 * - collapses internal multiple spaces into one
 * - lowercases characters
 * - normalizes Vietnamese decimal comma (e.g. "12,5" -> "12.5") when numeric
 */
export function normalizeShortAnswer(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  if (/^-?\d+,\d+$/.test(trimmed)) {
    return trimmed.replace(',', '.');
  }
  return trimmed;
}

/**
 * Generates a random 6-character alphanumeric code using unambiguous uppercase letters and digits.
 */
export function createRandom6CharCode(randomFn: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(randomFn() * alphabet.length);
    result += alphabet[idx];
  }
  return result;
}

/**
 * Strips standard answers, rubrics, and solutions from a HomeworkQuestion list
 * so that the snapshot sent to the student browser never leaks answers before allowed.
 */
export function createPublicQuestionsSnapshot(
  questions: HomeworkQuestion[]
): HomeworkQuestion[] {
  return questions.map((q) => {
    const cleanStatements = q.statements?.map((st) => ({
      id: st.id,
      label: st.label,
      statement: st.statement,
      points: st.points,
    }));

    return {
      id: q.id,
      order: q.order,
      type: q.type,
      prompt: q.prompt,
      points: q.points,
      ...(q.options ? { options: q.options } : {}),
      ...(cleanStatements ? { statements: cleanStatements } : {}),
    };
  });
}

/**
 * Centrally grades a single question based on the authoritative gradingKeyQuestion.
 */
export function gradeSingleQuestion(
  keyQuestion: HomeworkQuestion,
  studentAnswer?: StudentQuestionAnswer,
  existingResult?: QuestionGradingResult
): QuestionGradingResult {
  const maxScore = keyQuestion.points;

  if (!studentAnswer) {
    return {
      questionId: keyQuestion.id,
      score: 0,
      maxScore,
      isAutoGraded: keyQuestion.type !== 'essay',
      isCorrect: false,
      ...(existingResult?.teacherComment ? { teacherComment: existingResult.teacherComment } : {}),
    };
  }

  switch (keyQuestion.type) {
    case 'single_choice': {
      const isCorrect =
        Boolean(keyQuestion.correctOptionId) &&
        studentAnswer.selectedOptionId === keyQuestion.correctOptionId;
      return {
        questionId: keyQuestion.id,
        score: isCorrect ? maxScore : 0,
        maxScore,
        isAutoGraded: true,
        isCorrect,
      };
    }

    case 'multiple_choice': {
      const expected = [...(keyQuestion.correctOptionIds || [])].sort();
      const actual = [...(studentAnswer.selectedOptionIds || [])].sort();
      const isExactMatch =
        expected.length > 0 &&
        expected.length === actual.length &&
        expected.every((val, index) => val === actual[index]);
      return {
        questionId: keyQuestion.id,
        score: isExactMatch ? maxScore : 0,
        maxScore,
        isAutoGraded: true,
        isCorrect: isExactMatch,
      };
    }

    case 'true_false_multi': {
      const statements = keyQuestion.statements || [];
      if (statements.length === 0) {
        return {
          questionId: keyQuestion.id,
          score: 0,
          maxScore,
          isAutoGraded: true,
          isCorrect: false,
        };
      }
      let earned = 0;
      let allCorrect = true;
      const ansMap = studentAnswer.statementAnswers || {};
      for (const st of statements) {
        if (typeof st.isTrue === 'boolean' && ansMap[st.id] === st.isTrue) {
          earned += st.points;
        } else {
          allCorrect = false;
        }
      }
      const boundedScore = Math.min(maxScore, Number(earned.toFixed(2)));
      return {
        questionId: keyQuestion.id,
        score: boundedScore,
        maxScore,
        isAutoGraded: true,
        isCorrect: allCorrect,
      };
    }

    case 'short_answer': {
      const rawAns = studentAnswer.shortAnswerText || '';
      const normalizedActual = normalizeShortAnswer(rawAns);
      const acceptable = (keyQuestion.acceptableAnswers || []).map(normalizeShortAnswer);
      const isCorrect =
        normalizedActual.length > 0 && acceptable.includes(normalizedActual);
      return {
        questionId: keyQuestion.id,
        score: isCorrect ? maxScore : 0,
        maxScore,
        isAutoGraded: true,
        isCorrect,
      };
    }

    case 'essay': {
      // Essay questions are graded by teacher (with optional AI suggestion)
      const preservedScore =
        typeof existingResult?.score === 'number'
          ? Math.min(maxScore, Math.max(0, existingResult.score))
          : 0;
      return {
        questionId: keyQuestion.id,
        score: preservedScore,
        maxScore,
        isAutoGraded: false,
        ...(existingResult?.teacherComment
          ? { teacherComment: existingResult.teacherComment }
          : {}),
        ...(typeof existingResult?.aiSuggestedScore === 'number'
          ? { aiSuggestedScore: existingResult.aiSuggestedScore }
          : {}),
        ...(existingResult?.aiExplanation
          ? { aiExplanation: existingResult.aiExplanation }
          : {}),
        ...(existingResult?.aiImprovementFeedback
          ? { aiImprovementFeedback: existingResult.aiImprovementFeedback }
          : {}),
      };
    }
  }
}

/**
 * Centrally grades an entire submission against the authoritative grading key.
 */
export function gradeFullSubmission(
  gradingKeyQuestions: HomeworkQuestion[],
  studentAnswers: StudentQuestionAnswer[],
  existingResults: QuestionGradingResult[] = []
): {
  questionResults: QuestionGradingResult[];
  totalScore: number;
  maxScore: number;
  allAutoGradable: boolean;
} {
  const answerMap = new Map<string, StudentQuestionAnswer>();
  for (const ans of studentAnswers) {
    answerMap.set(ans.questionId, ans);
  }
  const existingMap = new Map<string, QuestionGradingResult>();
  for (const res of existingResults) {
    existingMap.set(res.questionId, res);
  }

  let totalScore = 0;
  let maxScore = 0;
  let allAutoGradable = true;

  const questionResults = gradingKeyQuestions.map((q) => {
    if (q.type === 'essay') {
      allAutoGradable = false;
    }
    const res = gradeSingleQuestion(q, answerMap.get(q.id), existingMap.get(q.id));
    totalScore += res.score;
    maxScore += q.points;
    return res;
  });

  return {
    questionResults,
    totalScore: Number(totalScore.toFixed(2)),
    maxScore: Number(maxScore.toFixed(2)),
    allAutoGradable,
  };
}

/**
 * Helper to create a default RichTextContent object from plain text
 */
export function createRichTextFromPlain(
  text: string,
  latexList: string[] = []
): RichTextContent {
  const blocks: RichTextContent['blocks'] = [
    {
      type: 'paragraph',
      align: 'left',
      text,
    },
  ];
  for (const latex of latexList) {
    if (latex.trim()) {
      blocks.push({
        type: 'math',
        inline: false,
        latex: latex.trim(),
      });
    }
  }
  return {
    version: 1,
    blocks,
  };
}
