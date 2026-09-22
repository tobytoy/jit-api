import { describe, it, expect } from 'vitest';
import path from 'path';
import { SpecTestRunner } from '../core/test_runner.js';

describe('U3: Spec Automated Test Runner (SpecTestRunner)', () => {
    const specsDir = path.resolve(process.cwd(), 'specs');

    it('should run automated tests on all specs and return summary report', async () => {
        const runner = new SpecTestRunner(specsDir);
        const report = await runner.runAll();

        expect(report).toBeDefined();
        expect(report.totalSpecs).toBeGreaterThan(0);
        expect(report.passedSpecs).toBeGreaterThan(0);
        expect(report.items.length).toBe(report.totalSpecs);
        expect(report.passedSpecs + report.failedSpecs).toBe(report.totalSpecs);

        // Check if order.api.md tests ran
        const orderResults = report.items.filter(r => r.filename.includes('order.api.md'));
        expect(orderResults.length).toBeGreaterThan(0);
        const orderSpec = orderResults[0];
        expect(orderSpec.hasPayload).toBe(true);
        expect(orderSpec.payloadPassed).toBe(true);
    });
});
