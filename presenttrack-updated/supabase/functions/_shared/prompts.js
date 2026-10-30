// Prompts and strict JSON schemas for OpenAI structured outputs. Pure.
export const TOPICS = [
  'A day in my favorite hobby',
  'Benefits of a daily walk',
  'Why I enjoy cooking at home',
  'My favorite way to relax after school or work',
  'A place in my city I would recommend to visitors',
  'Why reading a little every day is a good habit',
];

export function pickTopic(rand = Math.random) {
  return TOPICS[Math.min(TOPICS.length - 1, Math.floor(rand() * TOPICS.length))];
}

const str = { type: 'string' };
const strArr = { type: 'array', items: str };

export const DECK_SCHEMA = {
  name: 'assessment_deck',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'topic', 'slides', 'guidelines'],
    properties: {
      title: str,
      topic: str,
      slides: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'title', 'bullets', 'notes'],
          properties: { kind: { type: 'string', enum: ['title', 'intro', 'point', 'example', 'conclusion'] }, title: str, bullets: strArr, notes: str },
        },
      },
      guidelines: {
        type: 'object',
        additionalProperties: false,
        required: ['overview', 'estimatedMinutes', 'tips', 'instructions'],
        properties: { overview: str, estimatedMinutes: { type: 'number' }, tips: strArr, instructions: strArr },
      },
    },
  },
};

export function deckMessages(topic) {
  const system =
    'You write short beginner-friendly presentation decks for a speaking-practice app. ' +
    'Use only everyday, familiar knowledge: no specialized, technical, medical, political or controversial content, and no statistics or claims that need citations. ' +
    'Respond with JSON only, matching the schema.';
  const user =
    `Topic: "${topic}".\n` +
    'Create a deck a beginner can present in about 2 to 3 minutes of speech (roughly 300-400 spoken words in total).\n' +
    'Rules:\n' +
    '- 6 slides in this order: kind "title", "intro", "point", "point", "example", "conclusion".\n' +
    '- Slide title: at most 60 characters. Each slide has 2 to 4 bullets, each at most 90 characters, short phrases not paragraphs. The title slide bullets are a subtitle and a short tagline.\n' +
    '- "notes" is what the speaker may say for that slide (2-3 sentences, plain text, max 500 characters). Notes are private and are not shown on the slide.\n' +
    '- "title" (deck title) max 80 chars; "topic" max 100 chars.\n' +
    '- guidelines: "overview" (1-2 sentences about the activity), "estimatedMinutes" (2 or 3), "tips" (3 short speaking tips), "instructions" (3-4 short steps: read the slides, prepare, record 2-3 minutes in a quiet place, speak naturally).\n' +
    '- Plain text only: no markdown, no emojis.';
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export const FEEDBACK_SCHEMA = {
  name: 'assessment_feedback',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'strengths', 'improvements', 'recommendations'],
    properties: { summary: str, strengths: strArr, improvements: strArr, recommendations: strArr },
  },
};

// `m` holds ONLY measured numbers/labels (no transcript text).
export function feedbackMessages(m) {
  const system =
    'You are a supportive speaking coach giving feedback on a baseline recording. ' +
    'You are given ONLY measured numbers. Use only those numbers; never invent data, quotes or events. ' +
    'You cannot see or hear the speaker: do NOT comment on or claim to evaluate eye contact, gestures, confidence, body language, voice tone or content quality. ' +
    'Filler and pause counts come from automatic transcription and may be imperfect; phrase them as possible, not as definite mistakes. ' +
    'Be encouraging, specific and concise. Plain text only. Respond with JSON only.';
  const user =
    'Measured results (JSON):\n' + JSON.stringify(m) + '\n\n' +
    'Write: "summary" (2-3 sentences, mention this is a baseline), "strengths" (1-3 items), "improvements" (1-3 items), "recommendations" (2-4 concrete practice actions). Each item at most 200 characters.';
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}
