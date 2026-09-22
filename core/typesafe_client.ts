import dotenv from 'dotenv';
import {
  JevChoiceQuestion,
  JevNoulQuestion,
  JevQuestion,
  JevRequest,
  JevResponse,
  JevScoreQuestion,
} from './types.js';

dotenv.config();

export interface TypeSafeClientConfig {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export class TypeSafeClient {
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;
  private timeoutMs: number;

  constructor(config?: TypeSafeClientConfig) {
    this.apiKey = config?.apiKey !== undefined ? config.apiKey : (process.env.TYPESAFE_API_KEY || '');
    this.baseUrl = config?.baseUrl || 'https://api.typesafe.ai/v1/systemone';
    this.defaultModel = config?.model || 'jev-latest';
    this.timeoutMs = config?.timeoutMs || 10000;

    if (!this.apiKey) {
      console.warn('[TypeSafeClient] Notice: TYPESAFE_API_KEY is not set. Local fallback (e.g. Needle) will be used.');
    }
  }

  public hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  static choice(criteria: Record<string, string>): JevChoiceQuestion {
    return { type: 'choice', criteria };
  }

  static noul(instructions: string): JevNoulQuestion {
    return { type: 'noul', instructions };
  }

  static score(levels: Record<string, string>): JevScoreQuestion {
    return { type: 'score', levels };
  }

  async systemOne(req: {
    state: Record<string, unknown>;
    questions: Record<string, JevQuestion>;
    model?: string;
  }): Promise<{ response: JevResponse; latencyMs: number }> {
    const startTime = Date.now();
    const payload: JevRequest = {
      model: req.model || this.defaultModel,
      state: req.state,
      questions: req.questions,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`TypeSafe Jev API error (${res.status}): ${errorBody}`);
      }

      const json = (await res.json()) as JevResponse;
      return { response: json, latencyMs };
    } finally {
      clearTimeout(timer);
    }
  }
}
