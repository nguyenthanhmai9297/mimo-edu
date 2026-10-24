import {
  HomeworkQuestion,
  QuestionGradingResult,
  RichTextContent,
  StudentQuestionAnswer,
} from '../types/domain.js';

/**
 * Normalizes a short-answer string so equivalent ways of writing the same
 * answer compare equal (Vietnamese conventions: "." or a space groups
 * thousands, "," is the decimal mark):
 * - case, surrounding/extra whitespace and a trailing full stop are ignored
 * - "1 000", "1.000" and "1000" are the same number; "12.345.678" too.
 *   Only groups of exactly three digits count as thousands, so "2.5", "0.125"
 *   and "2,5" stay decimals ("2,5" -> "2.5")
 * - leading zeros and trailing decimal zeros are dropped ("05" -> "5", "2,50" -> "2.5")
 * - spaces around operators and fraction bars are ignored ("3 / 4" -> "3/4");
 *   "x", "*" between numbers mean "×", "÷" means ":"
 * - a unit may touch the number or not ("42cm" -> "42 cm"); units themselves
 *   are never converted, so "42 cm" and "42 mm" (or a bare "42") stay different
 * - LaTeX from AI answers reads as typed text: "$7\,023$" -> "7023",
 *   "\frac{3}{4}" -> "3/4", "\text{cm}" -> "cm", "\times" -> "×", "2{,}5" -> "2.5"
 */
export function normalizeShortAnswer(raw: string): string {
  let s = latexToPlain(raw)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[  ]/g, ' ')
    .replace(/[−–]/g, '-')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!;]+$/, '')
    .trim();

  // Thousands separators: one kind per number, first group 1–3 digits (not 0)
  s = s.replace(
    /(?<![\d.,])([1-9]\d{0,2})([ .])(\d{3}(?:\2\d{3})*)(?=$|[^\d.,]|,\d|[.,](?!\d))/g,
    (_m, head: string, sep: string, rest: string) => head + rest.split(sep).join('')
  );
  // Decimal comma
  s = s.replace(/(\d),(\d)/g, '$1.$2');
  // Canonical numbers: no leading zeros, no trailing decimal zeros
  s = s.replace(/\d+(?:\.\d+)?/g, (n) => {
    let [int, frac = ''] = n.split('.');
    int = int.replace(/^0+(?=\d)/, '');
    frac = frac.replace(/0+$/, '');
    return frac ? `${int}.${frac}` : int;
  });
  // Operators and fraction bars
  s = s
    .replace(/(\d)\s*[x*×]\s*(?=\d)/g, '$1×')
    .replace(/÷/g, ':')
    .replace(/\s*([+×:/=<>])\s*/g, '$1')
    .replace(/(^|[\d(+×:/=<>])\s*-\s*(?=\d)/g, '$1-')
    .replace(/(\d)\s*-\s*(?=\d)/g, '$1-');
  // Units: "42cm" and "42 cm" alike; "%" and "°" stay attached
  s = s.replace(/(\d)\s+([%°])/g, '$1$2').replace(/(\d)\s*(\p{L})/gu, '$1 $2');
  return s.replace(/\s+/g, ' ').trim();
}

/** LaTeX an AI (or a teacher) may leave in an answer, rewritten as plain typed text. */
function latexToPlain(raw: string): string {
  return raw
    .replace(/\$/g, '')
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\(?:text|mathrm|textrm|mbox)\s*\{([^{}]*)\}/g, ' $1 ')
    .replace(/\{,\}/g, ',')
    .replace(/\\(?:times|cdot)/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\(?:[,;:! ]|quad|qquad)|~/g, ' ');
}

/** A normalized answer split into its value and a single trailing unit word ("42 cm"). */
function splitUnit(normalized: string): { value: string; unit: string } | null {
  const m = /^([^\p{L}]*\d[^\p{L}]*?)(?: ([\p{L}][\p{L}\d]*))?$/u.exec(normalized);
  return m ? { value: m[1], unit: m[2] ?? '' } : null;
}

/** "a/b" and "c/d" are the same fraction value (integers, non-zero denominators). */
function equivalentFractions(a: string, b: string): boolean {
  const fa = /^(-?\d+)\/(\d+)$/.exec(a);
  const fb = /^(-?\d+)\/(\d+)$/.exec(b);
  if (!fa || !fb || /^0+$/.test(fa[2]) || /^0+$/.test(fb[2])) return false;
  return BigInt(fa[1]) * BigInt(fb[2]) === BigInt(fb[1]) * BigInt(fa[2]);
}

/**
 * Whether a pupil's short answer matches one key answer. Beyond the written
 * forms normalizeShortAnswer() unifies, only what the question allows counts:
 * a missing unit with unitMode 'optional', an equal-value fraction with
 * acceptEquivalentFractions. Different numbers or units never match.
 */
export function shortAnswerMatches(
  studentText: string,
  keyAnswer: string,
  options: Pick<HomeworkQuestion, 'unitMode' | 'acceptEquivalentFractions'> = {}
): boolean {
  const student = normalizeShortAnswer(studentText);
  const key = normalizeShortAnswer(keyAnswer);
  if (!student || !key) return false;
  if (student === key) return true;
  if (options.unitMode !== 'optional' && !options.acceptEquivalentFractions) return false;

  const s = splitUnit(student);
  const k = splitUnit(key);
  if (!s || !k) return false;
  const unitOk = s.unit === k.unit || (options.unitMode === 'optional' && (!s.unit || !k.unit));
  if (!unitOk) return false;
  return s.value === k.value || (Boolean(options.acceptEquivalentFractions) && equivalentFractions(s.value, k.value));
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
      const isCorrect = (keyQuestion.acceptableAnswers || []).some((key) =>
        shortAnswerMatches(rawAns, key, keyQuestion)
      );
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
