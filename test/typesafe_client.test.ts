import { describe, expect, it } from 'vitest';
import { TypeSafeClient } from '../core/typesafe_client.js';

describe('TypeSafeClient', () => {
  it('should instantiate and formulate questions correctly', () => {
    const choiceQ = TypeSafeClient.choice({ optA: 'Option A', optB: 'Option B' });
    expect(choiceQ.type).toBe('choice');
    expect(choiceQ.criteria.optA).toBe('Option A');

    const noulQ = TypeSafeClient.noul('Is this statement true?');
    expect(noulQ.type).toBe('noul');
    expect(noulQ.instructions).toBe('Is this statement true?');

    const scoreQ = TypeSafeClient.score({ 1: 'Low', 5: 'High' });
    expect(scoreQ.type).toBe('score');
  });

  it('should connect to live TypeSafe Jev API and receive structured response', async () => {
    const client = new TypeSafeClient();
    const result = await client.systemOne({
      state: { text: 'I want to generate an invoice for 100 dollars' },
      questions: {
        intent: TypeSafeClient.choice({
          create_invoice: 'Create, generate or bill invoice',
          track_order: 'Track or check status',
        }),
      },
    });

    expect(result.response.model).toBeDefined();
    expect(result.response.answers.intent).toBeDefined();
    expect(result.response.answers.intent.type).toBe('choice');
    if (result.response.answers.intent.type === 'choice') {
      expect(result.response.answers.intent.choice).toBe('create_invoice');
      expect(result.response.answers.intent.confidence).toBeGreaterThan(0.7);
    }
  });
});
