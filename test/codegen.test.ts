import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { GolangBlock } from '../blocks/ast_golang/go_block.js';
import { PythonBlock } from '../blocks/ast_python/py_block.js';
import { TypeScriptBlock } from '../blocks/ast_typescript/ts_block.js';
import { CodegenEngine } from '../compiler/codegen_engine.js';
import { IRSchema } from '../core/types.js';

describe('Code Generation Blocks & Engine', () => {
  const sampleSchema: IRSchema = {
    name: 'CreatePaymentRequest',
    version: 1,
    route: 'create_payment',
    fields: {
      paymentId: { name: 'paymentId', type: 'string', required: true },
      amount: { name: 'amount', type: 'number', required: true },
      success: { name: 'success', type: 'boolean', required: true },
      items: { name: 'items', type: 'array', itemType: 'string', required: false },
    },
  };

  it('should generate valid TypeScript Zod schema block', () => {
    const tsCode = TypeScriptBlock.generate(sampleSchema);
    expect(tsCode).toContain('export const CreatePaymentRequestSchema = z.object({');
    expect(tsCode).toContain('paymentId: z.string(),');
    expect(tsCode).toContain('amount: z.number(),');
    expect(tsCode).toContain('success: z.boolean(),');
    expect(tsCode).toContain('validateCreatePaymentRequest');
  });

  it('should generate valid Protobuf and Go struct block', () => {
    const protoCode = GolangBlock.generateProto(sampleSchema);
    expect(protoCode).toContain('syntax = "proto3";');
    expect(protoCode).toContain('message CreatePaymentRequest {');
    expect(protoCode).toContain('string paymentId = 1;');
    expect(protoCode).toContain('double amount = 2;');

    const goStruct = GolangBlock.generateGoStruct(sampleSchema);
    expect(goStruct).toContain('type CreatePaymentRequest struct {');
    expect(goStruct).toContain('PaymentId string `json:"paymentId"');
  });

  it('should generate valid Python Pydantic block', () => {
    const pyCode = PythonBlock.generate(sampleSchema);
    expect(pyCode).toContain('class CreatePaymentRequest(BaseModel):');
    expect(pyCode).toContain('paymentId: str');
    expect(pyCode).toContain('amount: float');
    expect(pyCode).toContain('items: Optional[list[str]] = None');
  });

  it('should compile files to output directory via CodegenEngine', () => {
    const testOutDir = path.resolve(process.cwd(), '.test_generated');
    const engine = new CodegenEngine(testOutDir);
    const result = engine.compile(sampleSchema);

    expect(fs.existsSync(result.files.typescript)).toBe(true);
    expect(fs.existsSync(result.files.proto)).toBe(true);
    expect(fs.existsSync(result.files.golang)).toBe(true);
    expect(fs.existsSync(result.files.python)).toBe(true);
    expect(fs.existsSync(result.files.irJson)).toBe(true);

    // Clean up
    fs.rmSync(testOutDir, { recursive: true, force: true });
  });
});
