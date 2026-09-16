import axios from 'axios';
import api from './api';
import { AdvisorResult } from './advisorService';

export type FieldProblemStatus = 'open' | 'needs_information' | 'advice_ready' | 'monitoring' | 'resolved' | 'reopened';

export interface FieldProblemResponse {
  id: string;
  turn_number: number;
  farmer_text: string;
  advice: AdvisorResult;
  created_at: string;
}

export interface FieldProblem {
  id: string;
  field_id: string;
  title: string;
  observation: string;
  status: FieldProblemStatus;
  advisor_turn_count: number;
  responses_remaining: number;
  crop: string;
  stage: string;
  latest_advice?: AdvisorResult;
  responses?: FieldProblemResponse[];
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  resolution_comment?: string;
}

const MOCK_AI_STORAGE_KEY = 'spectron.mockAi';
const MOCK_FIELD_PROBLEMS_KEY = 'spectron.mockFieldProblems';

const messageFromError = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error) && typeof error.response?.data === 'string') {
    return error.response.data.trim() || fallback;
  }
  return error instanceof Error ? error.message : fallback;
};

const isMockAiEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const stored = window.localStorage.getItem(MOCK_AI_STORAGE_KEY);
    if (stored && ['1', 'true', 'on', 'yes'].includes(stored.toLowerCase())) {
      return true;
    }
  } catch {
    // ignore storage access issues
  }

  return new URLSearchParams(window.location.search).get('mockAi') === '1';
};

const buildMockAdvice = (observation: string, turnNumber: number): AdvisorResult => ({
  status: turnNumber > 1 ? 'monitoring' : 'advice_ready',
  headline: turnNumber > 1 ? 'Field follow-up received' : 'Field advice is ready',
  what_may_be_happening:
    'Mock AI: This symptom may be linked to uneven moisture, heat stress, or minor pest pressure, but it is not enough to confirm a single cause.',
  do_now: [
    'Check the affected patch and compare it with a healthy nearby area.',
    'Inspect root-zone moisture before adjusting irrigation.',
    'Look under leaves for insects, eggs, or fresh damage.',
  ],
  check_next: [
    'Recheck the same plants tomorrow morning.',
    'Track whether the symptom is spreading to nearby rows.',
  ],
  why_this_advice: [
    'The field report suggests early stress, not a confirmed diagnosis.',
    'A structured check is safer than acting on one symptom alone.',
  ],
  avoid_for_now: [
    'Do not spray chemicals before confirming the symptom.',
    'Do not increase watering from leaf appearance alone.',
  ],
  recheck_after: 'Recheck the marked plants after 6 to 12 hours, then again tomorrow morning.',
  get_help_if: [
    'The affected area expands quickly by tomorrow.',
    'You see fast tissue collapse, foul smell, or severe insect presence.',
  ],
  tell_us_next: 'Do you see spots, insects, or mainly yellowing and drooping?',
  safety_note: 'This is mock AI advice for testing. Confirm the visible symptom in the Field before treatment.',
  confidence: turnNumber > 1 ? 'moderate' : 'high',
  evidence: [`Farmer report: ${observation}`, 'Mock crop reference and sensor context were used for testing.'],
  context_used: {
    crop: 'Paddy/Rice',
    growth_stage: 'Tillering',
    recent_sensor_data: true,
    current_weather: true,
    crop_reference_entries: 6,
    recent_field_problems: turnNumber - 1,
    decision_support_only: true,
    evidence_score: 0.84,
    confidence_reason: 'Mock AI testing mode uses a stable example context.',
    data_limitations: ['This advice is generated from mock data only.'],
  },
});

const readMockProblems = (): Record<string, FieldProblem[]> => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(MOCK_FIELD_PROBLEMS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeMockProblems = (value: Record<string, FieldProblem[]>) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(MOCK_FIELD_PROBLEMS_KEY, JSON.stringify(value));
};

const listMockProblems = (fieldId: string): FieldProblem[] => readMockProblems()[fieldId] || [];

const saveMockProblem = (fieldId: string, problem: FieldProblem) => {
  const all = readMockProblems();
  const current = all[fieldId] || [];
  const next = [problem, ...current.filter((item) => item.id !== problem.id)];
  all[fieldId] = next;
  writeMockProblems(all);
  return problem;
};

export const getFieldProblems = async (fieldId: string): Promise<FieldProblem[]> => {
  if (isMockAiEnabled()) {
    return listMockProblems(fieldId);
  }

  const response = await api.get<{ problems?: FieldProblem[] }>(`/api/fields/${encodeURIComponent(fieldId)}/problems`);
  return response.data.problems || [];
};

export const getFieldProblem = async (fieldId: string, problemId: string): Promise<FieldProblem> => {
  if (isMockAiEnabled()) {
    const problem = listMockProblems(fieldId).find((item) => item.id === problemId);
    if (!problem) {
      throw new Error('Problem not found.');
    }
    return problem;
  }

  const response = await api.get<FieldProblem>(`/api/fields/${encodeURIComponent(fieldId)}/problems/${encodeURIComponent(problemId)}`);
  return response.data;
};

export const createFieldProblem = async (fieldId: string, observation: string): Promise<FieldProblem> => {
  if (isMockAiEnabled()) {
    const createdAt = '2026-08-03T08:45:00.000Z';
    const advice = buildMockAdvice(observation, 1);
    return saveMockProblem(fieldId, {
      id: `mock-problem-${Date.now()}`,
      field_id: fieldId,
      title: 'Possible crop stress',
      observation,
      status: 'advice_ready',
      advisor_turn_count: 1,
      responses_remaining: 2,
      crop: 'Paddy/Rice',
      stage: 'Tillering',
      latest_advice: advice,
      responses: [
        {
          id: `mock-response-${Date.now()}`,
          turn_number: 1,
          farmer_text: observation,
          advice,
          created_at: createdAt,
        },
      ],
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  try {
    const response = await api.post<FieldProblem>(
      `/api/fields/${encodeURIComponent(fieldId)}/problems`,
      { observation },
      { timeout: 300000 },
    );
    return response.data;
  } catch (error) {
    throw new Error(messageFromError(error, 'Problem advice is unavailable right now.'));
  }
};

export const answerFieldProblem = async (fieldId: string, problemId: string, answer: string): Promise<FieldProblem> => {
  if (isMockAiEnabled()) {
    const problem = listMockProblems(fieldId).find((item) => item.id === problemId);
    if (!problem) {
      throw new Error('Problem not found.');
    }

    const turnNumber = (problem.responses?.length || 0) + 1;
    const advice = buildMockAdvice(answer, turnNumber);
    const updated: FieldProblem = {
      ...problem,
      status: 'monitoring',
      advisor_turn_count: turnNumber,
      responses_remaining: Math.max(0, 3 - turnNumber),
      latest_advice: advice,
      responses: [
        ...(problem.responses || []),
        {
          id: `mock-response-${Date.now()}`,
          turn_number: turnNumber,
          farmer_text: answer,
          advice,
          created_at: '2026-08-03T09:10:00.000Z',
        },
      ],
      updated_at: '2026-08-03T09:10:00.000Z',
    };

    return saveMockProblem(fieldId, updated);
  }

  try {
    const response = await api.post<FieldProblem>(
      `/api/fields/${encodeURIComponent(fieldId)}/problems/${encodeURIComponent(problemId)}/responses`,
      { answer },
      { timeout: 300000 },
    );
    return response.data;
  } catch (error) {
    throw new Error(messageFromError(error, 'Could not update this problem.'));
  }
};

export const resolveFieldProblem = async (
  fieldId: string,
  problemId: string,
  helpful?: boolean,
  resolution_comment?: string,
): Promise<FieldProblem> => {
  if (isMockAiEnabled()) {
    const problem = listMockProblems(fieldId).find((item) => item.id === problemId);
    if (!problem) {
      throw new Error('Problem not found.');
    }

    const updated: FieldProblem = {
      ...problem,
      status: 'resolved',
      resolution_comment,
      resolved_at: '2026-08-03T09:30:00.000Z',
      updated_at: '2026-08-03T09:30:00.000Z',
    };

    return saveMockProblem(fieldId, updated);
  }

  const response = await api.post<FieldProblem>(
    `/api/fields/${encodeURIComponent(fieldId)}/problems/${encodeURIComponent(problemId)}/resolve`,
    { helpful, comment: resolution_comment },
  );
  return response.data;
};
