import { describe, it, expect, vi } from 'vitest';
import { MDParser } from '../core/md_parser.js';
import { MDLoader } from '../core/md_loader.js';
import { JITEngine } from '../core/jit_engine.js';
import { MCPAdapter } from '../core/mcp_adapter.js';

describe('MCP Full-Spectrum: Tools, Resources, Prompts & Real-Time Alerts', () => {
  it('should parse and detect # Resource: specifications', () => {
    const rawResource = `# Resource: transport://rail/stations
> MimeType: application/json
> Description: 全台火車站名冊目錄

\`\`\`javascript
return [
  { id: "1000", name: "台北", rail: "tra" },
  { id: "0990", name: "南港", rail: "thsr" }
];
\`\`\`
`;

    const type = MDParser.detectType(rawResource);
    expect(type).toBe('resource');

    const res = MDParser.parseResource(rawResource, 'rail_stations.resource.md');
    expect(res.uri).toBe('transport://rail/stations');
    expect(res.name).toBe('transport_rail_stations');
    expect(res.mimeType).toBe('application/json');
    expect(res.description).toBe('全台火車站名冊目錄');
    expect(res.logicCode).toBeDefined();
  });

  it('should parse and detect # Prompt: specifications', () => {
    const rawPrompt = `# Prompt: plan_rain_fallback_commute
> Description: 雨天通勤備案規劃提詞範本

## Arguments
- origin: string (出發地)
- destination: string (目的地)
- transport_mode: string (偏好運具: transit, car, bike [選填])

## Template
請以高階交通助理身分，針對出發地「{{origin}}」至目的地「{{destination}}」規劃雨天通勤備案。
`;

    const type = MDParser.detectType(rawPrompt);
    expect(type).toBe('prompt');

    const prompt = MDParser.parsePrompt(rawPrompt, 'rain_commute.prompt.md');
    expect(prompt.name).toBe('plan_rain_fallback_commute');
    expect(prompt.description).toBe('雨天通勤備案規劃提詞範本');
    expect(prompt.arguments.length).toBe(3);
    expect(prompt.arguments[0].name).toBe('origin');
    expect(prompt.arguments[0].required).toBe(true);
    expect(prompt.arguments[2].name).toBe('transport_mode');
    expect(prompt.arguments[2].required).toBe(false);
    expect(prompt.template).toContain('{{origin}}');
  });

  it('should load tools, resources, and prompts together into McpServer', () => {
    const engine = new JITEngine();
    const loader = new MDLoader('/virtual_test_specs');

    // 1. Tool
    loader.addInlineSpec(
      'get_weather.api.md',
      `# API: get_weather
> Stage: prod
> Description: 即時天氣查詢

## Fields
- city: string (城市名)

\`\`\`javascript
return { city: payload.city, condition: 'rainy', temp: 22 };
\`\`\`
`
    );

    // 2. Resource
    loader.addInlineSpec(
      'stations.resource.md',
      `# Resource: transport://rail/stations
> MimeType: application/json
> Description: 火車站點代碼表

\`\`\`javascript
return [{ id: '1000', name: '台北' }];
\`\`\`
`
    );

    // 3. Prompt
    loader.addInlineSpec(
      'commute.prompt.md',
      `# Prompt: commute_advice
> Description: 通勤路線諮詢

## Arguments
- from: string (起點)
- to: string (終點)

## Template
請幫我查詢從 {{from}} 到 {{to}} 的最速路線。
`
    );

    const mcpServer = MCPAdapter.createMcpServer(engine, loader);
    expect(mcpServer).toBeDefined();

    // Verify resources and prompts collections in loader
    expect(loader.getResources().length).toBe(1);
    expect(loader.getResources()[0].uri).toBe('transport://rail/stations');

    expect(loader.getPrompts().length).toBe(1);
    expect(loader.getPrompts()[0].name).toBe('commute_advice');
  });

  it('should broadcast resource update and alert notifications', () => {
    const engine = new JITEngine();
    const loader = new MDLoader('/virtual_test_specs');
    const mcpServer = MCPAdapter.createMcpServer(engine, loader);

    const loggingSpy = vi.spyOn(mcpServer, 'sendLoggingMessage').mockImplementation(async () => {});

    MCPAdapter.broadcastAlert('warning', '國道一號北上 25K 發生連環追撞，請改道行駛！', {
      highway: 'National-1',
      mileage: 25,
    });

    expect(loggingSpy).toHaveBeenCalled();
  });
});
