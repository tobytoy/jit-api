import * as fs from 'fs';
import * as path from 'path';
import { GolangBlock } from '../blocks/ast_golang/go_block.js';
import { PythonBlock } from '../blocks/ast_python/py_block.js';
import { TypeScriptBlock } from '../blocks/ast_typescript/ts_block.js';
import { IRSchema } from '../core/types.js';

export interface CodegenResult {
  schema: IRSchema;
  files: {
    typescript: string;
    proto: string;
    golang: string;
    python: string;
    irJson: string;
  };
}

export class CodegenEngine {
  private outputDir: string;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.resolve(process.cwd(), 'generated');
  }

  private ensureDirs(): void {
    const dirs = [
      this.outputDir,
      path.join(this.outputDir, 'typescript'),
      path.join(this.outputDir, 'golang'),
      path.join(this.outputDir, 'python'),
      path.join(this.outputDir, 'schemas'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Compile IRSchema to static files across TS, Go, and Python
   */
  public compile(schema: IRSchema): CodegenResult {
    this.ensureDirs();

    const fileNameBase = schema.route.replace(/[^a-zA-Z0-9_-]/g, '_');

    // 1. Generate TypeScript (Zod + types)
    const tsCode = TypeScriptBlock.generate(schema);
    const tsPath = path.join(this.outputDir, 'typescript', `${fileNameBase}.ts`);
    fs.writeFileSync(tsPath, tsCode, 'utf-8');

    // 2. Generate Protobuf (.proto)
    const protoCode = GolangBlock.generateProto(schema);
    const protoPath = path.join(this.outputDir, 'golang', `${fileNameBase}.proto`);
    fs.writeFileSync(protoPath, protoCode, 'utf-8');

    // 3. Generate Go Struct
    const goCode = GolangBlock.generateGoStruct(schema);
    const goPath = path.join(this.outputDir, 'golang', `${fileNameBase}.go`);
    fs.writeFileSync(goPath, goCode, 'utf-8');

    // 4. Generate Python (Pydantic + FastAPI)
    const pyCode = PythonBlock.generate(schema);
    const pyPath = path.join(this.outputDir, 'python', `${fileNameBase}.py`);
    fs.writeFileSync(pyPath, pyCode, 'utf-8');

    // 5. Save IR JSON
    const irPath = path.join(this.outputDir, 'schemas', `${fileNameBase}.json`);
    fs.writeFileSync(irPath, JSON.stringify(schema, null, 2), 'utf-8');

    return {
      schema,
      files: {
        typescript: tsPath,
        proto: protoPath,
        golang: goPath,
        python: pyPath,
        irJson: irPath,
      },
    };
  }
}
