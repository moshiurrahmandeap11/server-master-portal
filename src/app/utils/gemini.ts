import { env } from '../config/env';

export interface GeminiParsedJob {
  title: string;
  titleBn?: string;
  organization: string;
  organizationSlug?: string;
  category?: string;
  memoNo?: string;
  circularDate?: string;
  applicationStartDate?: string;
  deadline: string;
  totalPositions: number;
  officialFee: string;
  serviceFee: string;
  sourceUrl?: string;
  officialPdfUrl?: string;
  officialLink?: string;
  bannerUrl?: string;
  circularImage?: string;
  positions: Array<{
    id?: string;
    title: string;
    grade?: string;
    posts?: number;
    salary?: string;
    govtFee?: number;
    minEducation?: string;
    experience?: string;
  }>;
  eligibility: {
    minAge?: number;
    maxAge?: number;
    ageCutOffDate?: string;
    districts?: string;
    quotaRules?: string;
    education?: string;
  };
  instructions?: {
    smsPrefix?: string;
    smsFormat?: string;
    steps?: string[];
  };
  bengaliDescription?: string;
  requirements?: string[];
  documentsRequired?: string[];
  faqItems?: Array<{ question: string; answer: string }>;
  seoTitle?: string;
  seoDescription?: string;
  seoKeywords?: string[];
}

export interface GeminiParsedResume {
  name: string;
  nameBn?: string;
  fatherName?: string;
  motherName?: string;
  dob?: string;
  gender?: 'male' | 'female';
  maritalStatus?: 'single' | 'married' | 'other';
  religion?: string;
  bloodGroup?: string;
  nid?: string;
  phone?: string;
  email?: string;
  presentAddress?: string;
  permanentAddress?: string;
  district?: string;
  division?: string;
  careerObjective?: string;
  professionalSummary?: string;
  educations: Array<{
    level: string;
    examTitle: string;
    institute?: string;
    boardUniversity?: string;
    rollNumber?: string;
    regNumber?: string;
    passingYear: number;
    gpaCgpa?: number;
    scale?: number;
    groupMajor?: string;
  }>;
  experiences: Array<{
    designation: string;
    organization: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    responsibilities?: string;
  }>;
  skills: string[];
  trainings?: Array<{
    title: string;
    institute?: string;
    duration?: string;
    completionYear?: number;
  }>;
  languages?: string[];
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

const MODELS = ['gemini-3.5-flash', 'gemini-3.5-flash-lite'];

export const geminiUtils = {
  generateMultimodal: async (parts: Array<any>, maxTokens = 8192): Promise<string> => {
    let lastError: any = null;

    for (let attempt = 0; attempt < API_KEYS.length * MODELS.length; attempt++) {
      const apiKey = getActiveKey();
      const model = MODELS[attempt % MODELS.length];

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.1, // Low temperature for high extraction accuracy
              maxOutputTokens: maxTokens,
              responseMimeType: 'application/json',
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
        console.warn(`[Gemini Multimodal] Model ${model} with key index ${currentKeyIndex % API_KEYS.length} failed: ${err.message}. Rotating...`);
        rotateKey();
      }
    }

    throw new Error(`All Gemini API attempts exhausted. Last error: ${lastError?.message}`);
  },

  generateText: async (prompt: string): Promise<string> => {
    return geminiUtils.generateMultimodal([{ text: prompt }], 4096);
  },

  parseCircularFromPdfBuffer: async (pdfBuffer: Buffer, metadata?: { sourceUrl?: string; pdfUrl?: string }): Promise<GeminiParsedJob> => {
    const base64Pdf = pdfBuffer.toString('base64');

    const promptText = `
You are the Master OCR and Bangladesh Official Job Circular Intelligence Engine for the "Chakri Sheba" platform.
Examine this official Bangladesh job circular PDF thoroughly across ALL pages. Read every single table row, position, grade, requirement, and condition.

CRITICAL INSTRUCTIONS:
1. DO NOT SKIP ANY POSITION OR ROW. If the circular lists 15 positions across 3 pages, extract ALL 15 positions into the "positions" array.
2. Accurately calculate "totalPositions" as the exact sum of all vacant posts across all positions.
3. If grade is mentioned (e.g. ৯ম গ্রেড, ১০ম গ্রেড, ১১তম গ্রেড, ২০তম গ্রেড), extract it accurately.
4. If pay scale is mentioned (e.g. ২২,০০০-৫৩,০৬০/- বা ৮,২৫০-২০,০১০/-), extract it into "salary".
5. Extract all eligible districts or exclusions from column 4 into "eligibility.districts".
6. Extract the exact application start date and application deadline (time & date).
7. Extract official examination/application fee (government fee + teletalk SMS fee).
8. Extract SMS instructions, prefix, format and online website link (e.g., xyz.teletalk.com.bd).
9. Output valid JSON matching the exact schema below.

JSON OUTPUT SCHEMA:
{
  "title": "Full Official Title in English (e.g. Department of Agricultural Extension DAE Job Circular 2026)",
  "titleBn": "সম্পূর্ণ অফিসিয়াল বিজ্ঞপ্তির শিরোনাম বাংলায় (যেমন: কৃষি সম্প্রসারণ অধিদপ্তর নিয়োগ বিজ্ঞপ্তি ২০২৬)",
  "organization": "অফিসিয়াল প্রতিষ্ঠানের নাম বাংলায় (যেমন: কৃষি সম্প্রসারণ অধিদপ্তর)",
  "organizationSlug": "org-slug",
  "category": "govt | bank | railway | defense | teacher | ngo | private",
  "memoNo": "স্মারক নং (যদি থাকে)",
  "circularDate": "বিজ্ঞপ্তি প্রকাশের তারিখ",
  "applicationStartDate": "অনলাইনে আবেদন শুরুর তারিখ ও সময়",
  "deadline": "2026-12-31T23:59:59.000Z (ISO 8601 String)",
  "totalPositions": 25,
  "officialFee": "200",
  "serviceFee": "50",
  "sourceUrl": "${metadata?.sourceUrl || ''}",
  "officialPdfUrl": "${metadata?.pdfUrl || ''}",
  "officialLink": "http://xyz.teletalk.com.bd",
  "positions": [
    {
      "title": "পদের নাম (যেমন: উপ-সহকারী কৃষি কর্মকর্তা)",
      "grade": "১০ম গ্রেড",
      "posts": 10,
      "salary": "১৬,০০০-৩৮,৬৪০/-",
      "govtFee": 200,
      "minEducation": "স্বীকৃত ইনস্টিটিউট হতে কৃষিতে ৪ বছর মেয়াদী ডিপ্লোমা",
      "experience": "অভিজ্ঞতার বিবরণ (যদি থাকে)"
    }
  ],
  "eligibility": {
    "minAge": 18,
    "maxAge": 30,
    "ageCutOffDate": "০১-০১-২০২৬",
    "districts": "সকল জেলার যোগ্য প্রার্থীগণ আবেদন করতে পারবেন (অথবা নির্দিষ্ট জেলার তালিকা)",
    "quotaRules": "মুক্তিযোদ্ধা ও শারীরিক প্রতিবন্ধীদের ক্ষেত্রে বয়স সর্বোচ্চ ৩২ বছর পর্যন্ত শিথিলযোগ্য",
    "education": "নূন্যতম শিক্ষাগত যোগ্যতা"
  },
  "instructions": {
    "smsPrefix": "DAE",
    "smsFormat": "১ম SMS: DAE <Space> User_ID পাঠিয়ে দিন 16222 নম্বরে।",
    "steps": [
      "১. নির্ধারিত ওয়েবসাইটে প্রবেশ করে নির্ভুলভাবে অনলাইন আবেদন ফরম পূরণ করতে হবে।",
      "২. আবেদনপত্র সাবমিটের পর প্রাপ্ত Applicant's Copy-তে থাকা User ID ব্যবহার করে ৭২ ঘণ্টার মধ্যে টেলিটক প্রিপেইড সিম দিয়ে ফি জমা দিতে হবে।"
    ]
  },
  "bengaliDescription": "সার্কুলারের একটি আকর্ষণীয় ও প্রাতিষ্ঠানিক সম্পাদকীয় বিবরণ বাংলায় ৩-৪ বাক্যে।",
  "requirements": [
    "প্রার্থীকে অবশ্যই বাংলাদেশের নাগরিক হতে হবে।",
    "সরকারি চাকুরির প্রচলিত সকল বিধিবিধান ও কোটা নীতি প্রযোজ্য হবে।"
  ],
  "documentsRequired": [
    "সকল শিক্ষাগত যোগ্যতার মূল সনদপত্র",
    "জাতীয় পরিচয়পত্র (NID) বা জন্ম নিবন্ধন সনদ",
    "নাগরিকত্ব সনদপত্র ও চারিত্রিক সনদপত্র",
    "কোটা দাবির স্বপক্ষে প্রয়োজনীয় প্রত্যয়নপত্র"
  ],
  "faqItems": [
    {
      "question": "আবেদনের শেষ সময় কবে?",
      "answer": "বিজ্ঞপ্তি অনুযায়ী আবেদনের শেষ তারিখ ও সময় উল্লেখ থাকবে।"
    },
    {
      "question": "আবেদন ফি কীভাবে জমা দেওয়া যাবে?",
      "answer": "যেকোনো টেলিটক প্রিপেইড মোবাইল নম্বরের মাধ্যমে SMS পাঠিয়ে ফি প্রদান করতে হবে।"
    }
  ],
  "seoTitle": "SEO Title বাংলায় (৬০ ক্যারেক্টারের মধ্যে)",
  "seoDescription": "SEO Meta Description বাংলায় (১৫০ ক্যারেক্টারের মধ্যে)",
  "seoKeywords": ["চাকরির বিজ্ঞপ্তি", "সরকারি চাকরি", "টেলিটক আবেদন"]
}
`;

    const rawResponse = await geminiUtils.generateMultimodal([
      { text: promptText },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf,
        },
      },
    ], 8192);

    const cleaned = rawResponse
      .replace(/^```json/im, '')
      .replace(/^```/im, '')
      .replace(/```$/im, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiParsedJob;
      return parsed;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as GeminiParsedJob;
      }
      throw new Error('Failed to parse Gemini multimodal response as JSON');
    }
  },

  parseCircularContent: async (rawText: string, metadata?: { sourceUrl?: string; pdfUrl?: string }): Promise<GeminiParsedJob> => {
    // If pdfUrl is an online URL, attempt to download buffer and parse directly
    const targetUrl = metadata?.pdfUrl || (rawText.trim().startsWith('http') && rawText.includes('.pdf') ? rawText.trim() : null);

    if (targetUrl && targetUrl.startsWith('http')) {
      try {
        console.log(`[Gemini Parser] Fetching PDF buffer from URL: ${targetUrl}`);
        const fetchRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (fetchRes.ok) {
          const arrayBuffer = await fetchRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          if (buffer.length > 500) {
            return await geminiUtils.parseCircularFromPdfBuffer(buffer, {
              sourceUrl: metadata?.sourceUrl || targetUrl,
              pdfUrl: targetUrl,
            });
          }
        }
      } catch (e: any) {
        console.warn(`[Gemini Parser] URL buffer fetch failed (${e.message}), falling back to text parsing`);
      }
    }

    // Text parsing mode with 8192 tokens
    const prompt = `
You are the Master Bangladesh Official Job Circular Parser for the "Chakri Sheba" platform.
Examine this official Bangladesh job circular text thoroughly. Extract ALL positions without omitting any row.

CIRCULAR TEXT / CONTENT:
"""
${rawText}
"""

Extract all positions, grade, salary, eligible districts, fees, deadline, SMS codes and return ONLY valid JSON matching this structure:
{
  "title": "Official Title in English",
  "titleBn": "অফিসিয়াল শিরোনাম বাংলায়",
  "organization": "প্রতিষ্ঠানের নাম বাংলায়",
  "organizationSlug": "org-slug",
  "category": "govt | bank | railway | defense | teacher | ngo | private",
  "memoNo": "স্মারক নং",
  "circularDate": "বিজ্ঞপ্তি প্রকাশের তারিখ",
  "applicationStartDate": "অনলাইনে আবেদন শুরুর তারিখ ও সময়",
  "deadline": "2026-12-31T23:59:59.000Z",
  "totalPositions": 10,
  "officialFee": "200",
  "serviceFee": "50",
  "sourceUrl": "${metadata?.sourceUrl || ''}",
  "officialPdfUrl": "${metadata?.pdfUrl || ''}",
  "officialLink": "http://xyz.teletalk.com.bd",
  "positions": [
    {
      "title": "পদের নাম",
      "grade": "১০ম গ্রেড",
      "posts": 5,
      "salary": "১৬,০০০-৩৮,৬৪০/-",
      "govtFee": 200,
      "minEducation": "শিক্ষাগত যোগ্যতা",
      "experience": "অভিজ্ঞতা"
    }
  ],
  "eligibility": {
    "minAge": 18,
    "maxAge": 30,
    "ageCutOffDate": "০১-০১-২০২৬",
    "districts": "সকল জেলার যোগ্য প্রার্থীগণ আবেদন করতে পারবেন",
    "quotaRules": "কোটা সম্পর্কিত নিয়মাবলী",
    "education": "নূন্যতম শিক্ষাগত যোগ্যতা"
  },
  "instructions": {
    "smsPrefix": "XYZ",
    "smsFormat": "১ম SMS: XYZ <Space> User_ID পাঠিয়ে দিন 16222 নম্বরে।",
    "steps": ["ধাপ ১...", "ধাপ ২..."]
  },
  "bengaliDescription": "সার্কুলারের বাংলা সম্পাদকীয় বিবরণ",
  "requirements": ["শর্ত ১", "শর্ত ২"],
  "documentsRequired": ["সনদ ১", "সনদ ২"],
  "faqItems": [{"question": "প্রশ্ন", "answer": "উত্তর"}],
  "seoTitle": "SEO শিরোনাম",
  "seoDescription": "SEO বিবরণ",
  "seoKeywords": ["চাকরি", "নিয়োগ বিজ্ঞপ্তি"]
}
`;

    const rawResponse = await geminiUtils.generateMultimodal([{ text: prompt }], 8192);
    const cleaned = rawResponse
      .replace(/^```json/im, '')
      .replace(/^```/im, '')
      .replace(/```$/im, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiParsedJob;
      return parsed;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as GeminiParsedJob;
      }
      throw new Error('Failed to parse Gemini response as JSON');
    }
  },

  parseResumeFromPdfBuffer: async (pdfBuffer: Buffer): Promise<GeminiParsedResume> => {
    const base64Pdf = pdfBuffer.toString('base64');

    const promptText = `
You are an expert AI Resume and Curriculum Vitae (CV) Parsing Engine specifically trained for Bangladeshi job seekers and international resumes.
Examine this Resume / CV PDF document thoroughly across ALL pages. Read every single section: Personal Details, Educational Qualifications, Professional Experience, Skills, Training, and Certifications.

CRITICAL PARSING RULES:
1. Extract candidate's full name in English and Bangla (if present).
2. Extract Father's Name and Mother's Name accurately if mentioned.
3. Extract Date of Birth in standard YYYY-MM-DD format (e.g. 1998-05-15).
4. Identify Gender: "male" or "female".
5. Identify Marital Status: "single" or "married" or "other".
6. Extract Phone number and Email address.
7. Extract Present and Permanent Address, District, and Division in Bangladesh (e.g. Dhaka, Chittagong, Rajshahi, Khulna, Sylhet, Barisal, Rangpur, Mymensingh).
8. Parse ALL Education records chronologically into the "educations" array:
   - For SSC / Dakhil: level = "ssc", examTitle = "SSC" / "Dakhil", boardUniversity = board name (e.g. Dhaka, Rajshahi, Comilla, etc.), groupMajor = Science/Arts/Commerce, passingYear (integer), gpaCgpa (number), scale = 5.0.
   - For HSC / Alim / Diploma: level = "hsc", examTitle = "HSC" / "Diploma", boardUniversity = board name, groupMajor = Science/Commerce/Humanities, passingYear, gpaCgpa, scale = 5.0.
   - For Graduation / Bachelor / B.Sc / BBA / BA: level = "graduation", examTitle = degree title, institute = university/college, passingYear, gpaCgpa, scale = 4.0.
   - For Masters / M.Sc / MBA: level = "masters", examTitle = degree title, institute = university, passingYear, gpaCgpa, scale = 4.0.
9. Parse ALL Work Experience into the "experiences" array:
   - designation (job title)
   - organization (company name)
   - startDate (YYYY-MM or YYYY)
   - endDate (YYYY-MM or "Present" if current)
   - isCurrent (boolean)
   - responsibilities (short summary of key duties)
10. Extract Skills as a clean string array in "skills" (e.g. ["MS Office", "Data Entry", "Python", "Communication"]).
11. Return strictly valid JSON adhering to the schema below without any markdown fences.

JSON SCHEMA:
{
  "name": "Candidate Full Name",
  "nameBn": "প্রার্থীর নাম বাংলায়",
  "fatherName": "Father Name",
  "motherName": "Mother Name",
  "dob": "1998-05-15",
  "gender": "male",
  "maritalStatus": "single",
  "religion": "Islam",
  "bloodGroup": "B+",
  "nid": "NID number",
  "phone": "01XXXXXXXXX",
  "email": "candidate@email.com",
  "presentAddress": "Full present address",
  "permanentAddress": "Full permanent address",
  "district": "Dhaka",
  "division": "Dhaka",
  "careerObjective": "Career objective or executive summary from CV",
  "educations": [
    {
      "level": "ssc",
      "examTitle": "Secondary School Certificate (SSC)",
      "institute": "School Name",
      "boardUniversity": "Dhaka",
      "groupMajor": "Science",
      "passingYear": 2016,
      "gpaCgpa": 5.0,
      "scale": 5.0
    }
  ],
  "experiences": [
    {
      "designation": "Job Title",
      "organization": "Company Name",
      "startDate": "2022-01",
      "endDate": "2024-05",
      "isCurrent": false,
      "responsibilities": "Key duties performed"
    }
  ],
  "skills": ["MS Excel", "Bangla Typing", "English Typing"],
  "trainings": [
    {
      "title": "Training Name",
      "institute": "Training Center",
      "duration": "3 Months",
      "completionYear": 2023
    }
  ],
  "languages": ["Bengali", "English"]
}
`;

    const rawResponse = await geminiUtils.generateMultimodal([
      { text: promptText },
      {
        inlineData: {
          mimeType: 'application/pdf',
          data: base64Pdf,
        },
      },
    ], 8192);

    const cleaned = rawResponse
      .replace(/^```json/im, '')
      .replace(/^```/im, '')
      .replace(/```$/im, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as GeminiParsedResume;
      return parsed;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as GeminiParsedResume;
      }
      throw new Error('Failed to parse Gemini resume response as JSON');
    }
  },
};
