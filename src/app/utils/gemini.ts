import { env } from '../config/env';

interface GeminiParsedJob {
  title: string;
  titleBn?: string;
  organization: string;
  organizationSlug?: string;
  deadline: string;
  totalPositions: number;
  officialFee: string;
  serviceFee: string;
  sourceUrl?: string;
  officialPdfUrl?: string;
  positions: Array<{
    id?: string;
    title: string;
    grade?: string;
    posts?: number;
    salary?: string;
    govtFee?: number;
    minEducation?: string;
  }>;
  eligibility: {
    minAge?: number;
    maxAge?: number;
    districts?: string;
    education?: string;
  };
  instructions?: any;
}

const API_KEYS = [
  env.GEMINI_API_KEY_1 || env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '',
  env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY_2 || '',
].filter(Boolean) as string[];

let currentKeyIndex = 0;

function getActiveKey(): string {
  return API_KEYS[currentKeyIndex % API_KEYS.length];
}

function rotateKey(): void {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
}

export const geminiUtils = {
  generateText: async (prompt: string): Promise<string> => {
    let lastError: any = null;

    for (let attempt = 0; attempt < API_KEYS.length; attempt++) {
      const apiKey = getActiveKey();
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error?.message || `Gemini API HTTP ${response.status}`);
        }

        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini API returned empty text response');
        return text;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Gemini Rotation] Key index ${currentKeyIndex % API_KEYS.length} failed: ${err.message}. Rotating...`);
        rotateKey();
      }
    }

    throw new Error(`All Gemini API keys exhausted. Last error: ${lastError?.message}`);
  },

  parseCircularContent: async (rawText: string, metadata?: { sourceUrl?: string; pdfUrl?: string }): Promise<GeminiParsedJob> => {
    const prompt = `
You are an expert Bangladesh Government and Private Job Circular Parser for the "Chakri Sheba" platform.
Extract and analyze the following job circular content and return ONLY a valid JSON object (no markdown fences, no explanatory text).

RAW CIRCULAR CONTENT:
"""
${rawText.slice(0, 8000)}
"""

JSON SCHEMA REQUIREMENTS:
{
  "title": "Clean, official circular title in English or Bengali",
  "titleBn": "Clean official circular title in Bengali",
  "organization": "Official organization name (e.g., বাংলাদেশ সরকারি কর্ম কমিশন (BPSC))",
  "deadline": "ISO 8601 date string (e.g., 2026-12-30T23:59:59.000Z)",
  "totalPositions": 10,
  "officialFee": "200",
  "serviceFee": "50",
  "sourceUrl": "${metadata?.sourceUrl || ''}",
  "officialPdfUrl": "${metadata?.pdfUrl || ''}",
  "positions": [
    {
      "title": "Position/Post name",
      "grade": "Grade (e.g. ৯class/গ্রেড)",
      "posts": 5,
      "salary": "Salary scale",
      "govtFee": 200,
      "minEducation": "Required qualification"
    }
  ],
  "eligibility": {
    "minAge": 18,
    "maxAge": 32,
    "districts": "সকল জেলা",
    "education": "Required minimum degree"
  },
  "instructions": "Application process summary"
}

Return ONLY raw JSON.
`;

    const rawResponse = await geminiUtils.generateText(prompt);
    const cleaned = rawResponse
      .replace(/^```json/im, '')
      .replace(/^```/im, '')
      .replace(/```$/im, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiParsedJob;
      return parsed;
    } catch {
      // Fallback regex extraction if model returned surrounding text
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as GeminiParsedJob;
      }
      throw new Error('Failed to parse Gemini response as JSON');
    }
  },
};
