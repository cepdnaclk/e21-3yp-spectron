import api from './api';
import axios from 'axios';

export type AdvisorContextUsed = {
  crop: string;
  growth_stage: string;
  recent_sensor_data?: boolean;
  current_weather?: boolean;
  crop_reference_entries: number;
  recent_field_problems?: number;
  decision_support_only?: boolean;
  evidence_score?: number;
  confidence_reason?: string;
  data_limitations?: string[];
};

export type AdvisorResult = {
  status: string;
  headline?: string;
  what_may_be_happening?: string;
  do_now?: string[];
  check_next?: string[];
  why_this_advice?: string[];
  avoid_for_now?: string[];
  recheck_after?: string;
  get_help_if?: string[];
  tell_us_next?: string;
  safety_note?: string;
  confidence: string;
  evidence?: string[];
  sources?: string[];
  summary?: string;
  possible_causes?: string[];
  actions_now?: string[];
  monitor_next?: string[];
  recheck?: string;
  follow_up_question?: string;
  urgent_warning?: string;
  context_used?: AdvisorContextUsed;
};
export type AdvisorRecommendation = { id: string; observation: string; advice: AdvisorResult; created_at?: string };

const MOCK_AI_STORAGE_KEY = 'spectron.mockAi';

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

const buildMockAdvice = (observation: string): AdvisorResult => ({
  status: 'advice_ready',
  headline: 'Field needs a calm follow-up check',
  what_may_be_happening:
    'Mock AI: The crop may be showing early stress from uneven moisture, heat, or minor pest pressure, but the symptom is not enough to confirm one cause.',
  do_now: [
    'Check 5 to 10 affected plants in two parts of the Field.',
    'Compare dry and wet soil near the root zone before changing irrigation.',
    'Look under leaves for insects, eggs, or fresh chewing marks.',
  ],
  check_next: [
    'Note whether the symptom is spreading by tomorrow morning.',
    'Compare the affected area with a healthy nearby patch.',
  ],
  why_this_advice: [
    'The report suggests stress, but not a confirmed disease diagnosis.',
    'Simple field checks can prevent the wrong treatment decision.',
  ],
  avoid_for_now: [
    'Do not spray chemicals before confirming the visible symptom.',
    'Do not increase watering from leaf appearance alone.',
  ],
  recheck_after: 'Recheck the marked plants after 6 to 12 hours, then again tomorrow morning.',
  get_help_if: [
    'More than one-third of the affected area worsens by tomorrow.',
    'You see fast leaf burn, foul smell, or stem collapse.',
  ],
  tell_us_next: 'Do you see insects, spots, or only yellowing and wilting?',
  safety_note: 'This is mock AI advice for testing. Confirm the visible symptom in the Field before treatment.',
  confidence: 'moderate',
  evidence: [
    `Farmer report: ${observation}`,
    'Mock crop reference notes were used for testing.',
  ],
  context_used: {
    crop: 'Paddy/Rice',
    growth_stage: 'Tillering',
    recent_sensor_data: true,
    current_weather: true,
    crop_reference_entries: 6,
    recent_field_problems: 1,
    decision_support_only: true,
    evidence_score: 0.82,
    confidence_reason: 'Mock AI testing mode uses a consistent example context.',
    data_limitations: ['This is generated from mock data only.'],
  },
});

export const requestFieldAdvice = async (fieldId: string, observation: string) => {
  if (isMockAiEnabled()) {
    return {
      id: `mock-advice-${fieldId}`,
      crop: 'Paddy/Rice',
      stage: 'Tillering',
      observation,
      advice: buildMockAdvice(observation),
    };
  }

  try {
    const response = await api.post<{ id: string; crop: string; stage: string; observation: string; advice: AdvisorResult }>(
      `/api/fields/${encodeURIComponent(fieldId)}/advisor/recommendations`,
      { observation },
      { timeout: 300000 },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message = typeof error.response?.data === 'string'
        ? error.response.data.trim()
        : 'AI Advisor is temporarily unavailable.';
      throw new Error(message || 'AI Advisor is temporarily unavailable.');
    }
    throw error;
  }
};

export const getFieldAdvice = async (fieldId: string): Promise<AdvisorRecommendation[]> => {
  if (isMockAiEnabled()) {
    return [
      {
        id: `mock-advice-${fieldId}`,
        observation: 'Leaves in one corner look pale and slightly droopy in the afternoon.',
        created_at: '2026-08-03T08:30:00.000Z',
        advice: buildMockAdvice('Leaves in one corner look pale and slightly droopy in the afternoon.'),
      },
    ];
  }

  const response = await api.get<{ recommendations?: AdvisorRecommendation[] }>(`/api/fields/${encodeURIComponent(fieldId)}/advisor/recommendations`);
  return response.data.recommendations || [];
};
