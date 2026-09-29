import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MDParser } from '../core/md_parser.js';
import { JITEngine } from '../core/jit_engine.js';
import { ProjectScaffolder } from '../adapters/scaffolder.js';
import * as channelLine from '../plugins/channel_line.js';

describe('Declarative Notify & Relay Suite', () => {
  const tempTestDir = path.resolve(process.cwd(), './.jit_relay_temp');

  beforeEach(() => {
    process.env.TARGET_C_USER_ID = 'U_TARGET_C_12345';
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test_token_xyz';
  });

  afterEach(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    vi.restoreAllMocks();
  });

  describe('MDParser ## Notify Parsing', () => {
    it('should parse ## Notify section with channel, target, condition, and template', () => {
      const markdown = `
# API: relay_test
## Intent
Forward urgent messages
## Notify
- channel: line
- target: env.TARGET_C_USER_ID
- condition: shouldRelay == true
- template: "🚨 Alert from {senderId}: {text}"
- tokenEnv: LINE_CHANNEL_ACCESS_TOKEN
## Logic
\`\`\`javascript
return { shouldRelay: true };
\`\`\`
`;
      const parsed = MDParser.parse(markdown, 'relay_test.api.md');
      expect(parsed.notify).toBeDefined();
      expect(parsed.notify?.channel).toBe('line');
      expect(parsed.notify?.target).toBe('env.TARGET_C_USER_ID');
      expect(parsed.notify?.condition).toBe('shouldRelay == true');
      expect(parsed.notify?.template).toContain('Alert from {senderId}');
      expect(parsed.notify?.tokenEnv).toBe('LINE_CHANNEL_ACCESS_TOKEN');

      const routeDef = MDParser.toRouteDefinition(parsed);
      expect(routeDef.notify).toBeDefined();
      expect(routeDef.notify?.target).toBe('env.TARGET_C_USER_ID');
    });
  });

  describe('JITEngine Declarative Notify Dispatch', () => {
    it('should dispatch notify when condition evaluates to true', async () => {
      const pushSpy = vi.spyOn(channelLine, 'sendLinePush').mockResolvedValue(true);

      const engine = new JITEngine();
      const routeDef = {
        route: 'test_relay',
        description: 'Test relay',
        intentCriteria: 'Test',
        handler: async () => ({}),
        notify: {
          channel: 'line',
          target: 'env.TARGET_C_USER_ID',
          condition: 'urgency == "HIGH"',
          template: 'Alert: {text} from {senderId}',
          tokenEnv: 'LINE_CHANNEL_ACCESS_TOKEN',
        },
      };

      const result = await engine.dispatchDeclarativeNotify(
        routeDef,
        { senderId: 'U_USER_B1', text: 'POS system crashed' },
        { urgency: 'HIGH' }
      );

      expect(result?.dispatched).toBe(true);
      expect(result?.target).toBe('U_TARGET_C_12345');
      expect(pushSpy).toHaveBeenCalledWith(
        'U_TARGET_C_12345',
        [{ type: 'text', text: 'Alert: POS system crashed from U_USER_B1' }],
        'test_token_xyz'
      );
    });

    it('should NOT dispatch notify when condition evaluates to false', async () => {
      const pushSpy = vi.spyOn(channelLine, 'sendLinePush').mockResolvedValue(true);

      const engine = new JITEngine();
      const routeDef = {
        route: 'test_relay_false',
        description: 'Test relay false',
        intentCriteria: 'Test',
        handler: async () => ({}),
        notify: {
          channel: 'line',
          target: 'env.TARGET_C_USER_ID',
          condition: 'urgency == "HIGH"',
          template: 'Alert',
        },
      };

      const result = await engine.dispatchDeclarativeNotify(
        routeDef,
        { senderId: 'U_USER_B2', text: 'Just saying hello' },
        { urgency: 'NORMAL' } // Not HIGH
      );

      expect(result?.dispatched).toBe(false);
      expect(pushSpy).not.toHaveBeenCalled();
    });
  });

  describe('Scaffolder line-relay Preset', () => {
    it('should scaffold complete line-relay project', async () => {
      const outDir = path.join(tempTestDir, 'relay-app');
      const res = await ProjectScaffolder.scaffold({
        preset: 'line-relay',
        outDir,
      });

      expect(fs.existsSync(path.join(outDir, 'specs/relay_condition.api.md'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, '.env.example'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'src/worker.ts'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'wrangler.toml'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'README.md'))).toBe(true);

      const specContent = fs.readFileSync(path.join(outDir, 'specs/relay_condition.api.md'), 'utf-8');
      expect(specContent).toContain('## Notify');
      expect(specContent).toContain('env.TARGET_C_USER_ID');
    });
  });
});
