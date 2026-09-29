/**
 * JIT Protocol Synthesis Framework - Security Linter & Spec Guard Plugin
 * 
 * Provides static analysis (SAST) for Markdown API specifications:
 * 1. SEC-001: Hardcoded Secrets & Token Leaks (OpenAI, AWS, JWT, API Keys)
 * 2. SEC-002: SSRF & Private Network / Cloud Metadata Targets
 * 3. SEC-003: Unprotected Sensitive Routes (Missing ## Auth on admin/delete/pay)
 * 4. SEC-004: Missing Rate Limiting (DoS Vulnerability)
 * 5. SEC-005: Real PII in Sample / Mock Payloads
 * 6. SEC-006: Dangerous System Calls (child_process, eval, process.exit)
 */

import fs from 'fs';
import path from 'path';
import { JITPlugin, JITPluginContext } from '../core/plugin.js';

export type SecuritySeverity = 'critical' | 'warning' | 'info';

export interface SecurityFinding {
  ruleId: string;
  severity: SecuritySeverity;
  message: string;
  file?: string;
  line?: number;
  sample?: string;
  remediation: string;
}

export interface SecurityAuditReport {
  scannedFiles: number;
  totalFindings: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  findings: SecurityFinding[];
  passed: boolean;
}

export interface SecurityLinterOptions {
  specsDir?: string;
  strictMode?: boolean; // If true, aborts engine startup on critical findings
  ignoredRules?: string[];
}

export class SpecSecurityLinter {
  private ignoredRules: Set<string>;

  constructor(options: { ignoredRules?: string[] } = {}) {
    this.ignoredRules = new Set(options.ignoredRules || []);
  }

  /**
   * Statically audit a Markdown API specification string
   */
  public auditSpec(content: string, filePath = 'spec.api.md'): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const lines = content.split('\n');

    // State tracking across Markdown sections
    let currentSection = '';
    let hasRoute = false;
    let routeName = '';
    let hasAuth = false;
    let hasRateLimit = false;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // Track code fence boundaries
      if (trimmed.startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Section Header Tracking
      if (trimmed.startsWith('## ')) {
        currentSection = trimmed.replace(/^##\s+/, '').toLowerCase();
        if (currentSection.startsWith('route')) {
          hasRoute = true;
          const match = trimmed.match(/`?(\/[a-zA-Z0-9_/:-]+)`?/);
          if (match) routeName = match[1];
        } else if (currentSection.startsWith('auth')) {
          hasAuth = true;
        } else if (currentSection.startsWith('ratelimit') || currentSection.startsWith('rate limit')) {
          hasRateLimit = true;
        }
      }

      // Check SEC-001: Hardcoded Secrets
      if (!this.ignoredRules.has('SEC-001')) {
        const secretCheck = this.checkHardcodedSecret(trimmed);
        if (secretCheck) {
          findings.push({
            ruleId: 'SEC-001',
            severity: 'critical',
            message: `Detected potential hardcoded secret or token: ${secretCheck.type}`,
            file: filePath,
            line: lineNum,
            sample: secretCheck.sample,
            remediation: "Never hardcode API keys or JWT tokens in Markdown. Use '${ENV_VAR}' instead.",
          });
        }
      }

      // Check SEC-002: SSRF & Private Network / Cloud Metadata Targets
      if (!this.ignoredRules.has('SEC-002')) {
        if (currentSection.includes('upstream') || currentSection.includes('notify') || currentSection.includes('relay')) {
          const ssrfCheck = this.checkSSRF(trimmed);
          if (ssrfCheck) {
            findings.push({
              ruleId: 'SEC-002',
              severity: 'critical',
              message: `Target points to private network or cloud metadata service (Potential SSRF): ${ssrfCheck}`,
              file: filePath,
              line: lineNum,
              sample: trimmed,
              remediation: 'Do not point Upstream or Notify targets to localhost, private LAN, or 169.254.169.254.',
            });
          }
        }
      }

      // Check SEC-005: PII in Sample / Mock Data
      if (!this.ignoredRules.has('SEC-005')) {
        if (currentSection.includes('sample') || currentSection.includes('mock')) {
          const piiCheck = this.checkPII(trimmed);
          if (piiCheck) {
            findings.push({
              ruleId: 'SEC-005',
              severity: 'warning',
              message: `Possible real PII detected in sample/mock data: ${piiCheck}`,
              file: filePath,
              line: lineNum,
              sample: trimmed,
              remediation: 'Use masked or synthetic test data (e.g. 0912-000-000, test@example.com) to prevent leaks.',
            });
          }
        }
      }

      // Check SEC-006: Dangerous System Calls & Sandbox Escape (Targets executable code blocks and logic sections)
      if (!this.ignoredRules.has('SEC-006')) {
        const isCodeSection =
          inCodeBlock ||
          currentSection.includes('logic') ||
          currentSection.includes('code') ||
          currentSection.includes('handler');
        if (isCodeSection && !trimmed.startsWith('```')) {
          const dangerousCheck = this.checkDangerousCode(trimmed);
          if (dangerousCheck) {
            findings.push({
              ruleId: 'SEC-006',
              severity: 'critical',
              message: `Dangerous system call or execution pattern detected: ${dangerousCheck}`,
              file: filePath,
              line: lineNum,
              sample: trimmed,
              remediation: 'Avoid low-level system commands, shell execution, or file deletion in API specs.',
            });
          }
        }
      }
    }

    // Check SEC-003: Unprotected Sensitive Routes
    if (!this.ignoredRules.has('SEC-003') && hasRoute && routeName) {
      const sensitiveKeywords = [
        'admin', 'delete', 'destroy', 'remove', 'purge', 'refund',
        'pay', 'payout', 'withdraw', 'transfer', 'update', 'secret', 'config',
      ];
      const isSensitive = sensitiveKeywords.some((kw) => routeName.toLowerCase().includes(kw));

      if (isSensitive && !hasAuth) {
        findings.push({
          ruleId: 'SEC-003',
          severity: 'warning',
          message: `Sensitive route '${routeName}' lacks a '## Auth' block, leaving it open to anonymous access.`,
          file: filePath,
          remediation: "Add an '## Auth' block (e.g. type: bearer, role: admin) to protect this sensitive endpoint.",
        });
      }
    }

    // Check SEC-004: Missing Rate Limiting on Routes
    if (!this.ignoredRules.has('SEC-004') && hasRoute && !hasRateLimit) {
      findings.push({
        ruleId: 'SEC-004',
        severity: 'info',
        message: `Route '${routeName || 'unknown'}' has no '## RateLimit' defined.`,
        file: filePath,
        remediation: "Add a '## RateLimit' section (e.g. max: 60, window: 60s) to prevent DoS and cost exhaustion.",
      });
    }

    return findings;
  }

  /**
   * Audit an entire directory of Markdown files
   */
  public async auditDirectory(specsDir: string): Promise<SecurityAuditReport> {
    const allFindings: SecurityFinding[] = [];
    let fileCount = 0;

    if (!fs.existsSync(specsDir)) {
      return {
        scannedFiles: 0,
        totalFindings: 0,
        criticalCount: 0,
        warningCount: 0,
        infoCount: 0,
        findings: [],
        passed: true,
      };
    }

    const files = fs.readdirSync(specsDir).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      fileCount++;
      const fullPath = path.join(specsDir, file);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const findings = this.auditSpec(content, file);
      allFindings.push(...findings);
    }

    const criticalCount = allFindings.filter((f) => f.severity === 'critical').length;
    const warningCount = allFindings.filter((f) => f.severity === 'warning').length;
    const infoCount = allFindings.filter((f) => f.severity === 'info').length;

    return {
      scannedFiles: fileCount,
      totalFindings: allFindings.length,
      criticalCount,
      warningCount,
      infoCount,
      findings: allFindings,
      passed: criticalCount === 0,
    };
  }

  // --- Detection Sub-routines ---

  private checkHardcodedSecret(line: string): { type: string; sample: string } | null {
    // Skip comments and environment variable references
    if (line.includes('${') || line.startsWith('//') || line.startsWith('# ')) {
      return null;
    }

    // OpenAI keys: sk-[a-zA-Z0-9]{20,}
    if (/sk-[a-zA-Z0-9_-]{20,}/.test(line)) {
      return { type: 'OpenAI Secret Key', sample: 'sk-...' };
    }
    // Bearer JWT with actual tokens (not placeholder)
    if (/Bearer\s+eyJ[a-zA-Z0-9_-]{20,}/.test(line)) {
      return { type: 'Live JWT Token', sample: 'Bearer eyJ...' };
    }
    // GitHub Personal Access Token: ghp_ or gho_
    if (/gh[pous]_[a-zA-Z0-9]{30,}/.test(line)) {
      return { type: 'GitHub Personal Access Token', sample: 'ghp_...' };
    }
    // AWS Access Key ID
    if (/AKIA[0-9A-Z]{16}/.test(line)) {
      return { type: 'AWS Access Key ID', sample: 'AKIA...' };
    }
    // Google API Key
    if (/AIza[0-9A-Za-z-_]{35}/.test(line)) {
      return { type: 'Google API Key', sample: 'AIza...' };
    }
    // Slack Bot Token
    if (/xox[baprs]-[0-9a-zA-Z]{10,}/.test(line)) {
      return { type: 'Slack Token', sample: 'xoxb-...' };
    }
    // Stripe Live Secret Key
    if (/sk_live_[0-9a-zA-Z]{20,}/.test(line)) {
      return { type: 'Stripe Live Secret Key', sample: 'sk_live_...' };
    }

    return null;
  }

  private checkSSRF(line: string): string | null {
    // Cloud Metadata Subnet: 169.254.0.0/16
    if (/(https?:\/\/)?169\.254\.\d{1,3}\.\d{1,3}/.test(line)) return 'Cloud Metadata / Link-Local IP (169.254.x.x)';
    // Localhost / Loopback: 127.0.0.0/8, 0.0.0.0/8, ::1, or internal domain
    if (/(https?:\/\/)?(127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|localhost|::1|\b\w+\.(localhost|local|internal|lan))(:\d+)?/i.test(line)) {
      return 'Localhost / Loopback / Internal Address';
    }
    // Private RFC 1918 Class A: 10.0.0.0/8
    if (/(https?:\/\/)?10\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(line)) {
      return 'Private LAN Address (10.x.x.x)';
    }
    // Private Class C: 192.168.0.0/16
    if (/(https?:\/\/)?192\.168\.\d{1,3}\.\d{1,3}/.test(line)) {
      return 'Private LAN Address (192.168.x.x)';
    }
    // Private Class B: 172.16-31
    if (/(https?:\/\/)?172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}/.test(line)) {
      return 'Private LAN Address (172.16-31.x.x)';
    }
    return null;
  }

  private checkPII(line: string): string | null {
    // Credit card number: 16 digits formatted
    if (/\b(?:\d{4}[ -]?){3}\d{4}\b/.test(line)) {
      if (!line.includes('0000') && !line.includes('1111') && !line.includes('1234')) {
        return 'Credit Card Number';
      }
    }
    // Taiwan National ID format: 1 capital letter + 1 or 2 + 8 digits
    if (/\b[A-Z][12]\d{8}\b/.test(line)) {
      return 'Taiwan National ID Number';
    }
    return null;
  }

  private checkDangerousCode(line: string): string | null {
    // 1. Direct dangerous modules and shell execution
    if (/\bchild_process\b/.test(line)) return 'child_process import';
    if (/\bworker_threads\b/.test(line)) return 'worker_threads import';
    if (/\b(execSync|spawnSync)\s*\(/.test(line)) return 'Synchronous shell execution';
    if (/\b(exec|spawn|fork)\s*\(/.test(line)) return 'Process execution call';
    if (/\bprocess\.(exit|kill|binding|mainModule|dlopen)\b/.test(line)) return 'Dangerous process method invocation';
    if (/\beval\s*\(/.test(line)) return 'Dynamic code evaluation (eval)';
    if (/\bnew\s+Function\s*\(/.test(line) || /\bFunction\s*\(/.test(line)) return 'Dynamic Function constructor evaluation';
    if (/\bfs\.(rmSync|unlinkSync|rmdirSync|writeFileSync|appendFileSync)\b/.test(line)) return 'Dangerous filesystem write/delete operation';

    // 2. Prototype climbing and sandbox escape
    if (/\b(constructor|__proto__|prototype)\b/.test(line)) return 'Sandbox escape via prototype climbing or constructor access';
    if (/\b(globalThis|global)\b/.test(line)) return 'Global scope access attempt';

    // 3. Obfuscation detection (e.g. 'child_' + 'process', 'con' + 'structor')
    const collapsed = line.replace(/['"]\s*\+\s*['"]/g, '');
    if (/\bchild_process\b/.test(collapsed)) return 'Obfuscated child_process string concatenation';
    if (/\bconstructor\b/.test(collapsed)) return 'Obfuscated constructor string concatenation';
    if (/\bprocess\b/.test(collapsed) && (collapsed.includes('mainModule') || collapsed.includes('binding') || collapsed.includes('exit'))) {
      return 'Obfuscated process method access';
    }

    // 4. Dynamic encoding / payload unpacking
    if (/\b(atob|String\.fromCharCode)\b/.test(line) && /\(/.test(line)) {
      return 'Obfuscated payload decoding (dynamic unpacking)';
    }

    return null;
  }

  /**
   * Format report for terminal CLI with color indicators
   */
  public formatReport(report: SecurityAuditReport): string {
    const lines: string[] = [];
    lines.push('===============================================================');
    lines.push(' 🛡️  JIT API Security Audit & Spec Guard Report');
    lines.push('===============================================================');
    lines.push(`Scanned: ${report.scannedFiles} specification file(s)`);
    lines.push(`Status:  ${report.passed ? '✅ PASSED' : '❌ FAILED (Critical vulnerabilities detected)'}`);
    lines.push(`Summary: 🔴 ${report.criticalCount} Critical | 🟡 ${report.warningCount} Warning | 🔵 ${report.infoCount} Info`);
    lines.push('---------------------------------------------------------------');

    if (report.findings.length === 0) {
      lines.push('🎉 No security issues detected. Your specs adhere to secure guidelines!');
    } else {
      for (const finding of report.findings) {
        const icon = finding.severity === 'critical' ? '🔴 [CRITICAL]' : finding.severity === 'warning' ? '🟡 [WARNING]' : '🔵 [INFO]';
        const location = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''}` : '';
        lines.push(`${icon} ${finding.ruleId}: ${finding.message}`);
        if (location) lines.push(`   📍 Location: ${location}`);
        if (finding.sample) lines.push(`   🔍 Detected: ${finding.sample}`);
        lines.push(`   💡 Fix:      ${finding.remediation}`);
        lines.push('');
      }
    }
    lines.push('===============================================================');
    return lines.join('\n');
  }
}

/**
 * Factory for Security Linter Plugin
 */
export function createSecurityLinterPlugin(options: SecurityLinterOptions = {}): JITPlugin {
  const linter = new SpecSecurityLinter({ ignoredRules: options.ignoredRules });
  const specsDir = options.specsDir || path.resolve(process.cwd(), 'specs');

  return {
    name: 'guard-spec-linter',
    version: '1.4.1',
    description: 'Static Security SAST Linter & Secret Leak Guard for JIT Markdown API Specs',
    async onInit(ctx: JITPluginContext) {
      const report = await linter.auditDirectory(specsDir);
      if (report.criticalCount > 0) {
        console.warn('\n' + linter.formatReport(report) + '\n');
        if (options.strictMode) {
          throw new Error(`[SecurityLinter] Blocked engine startup due to ${report.criticalCount} critical security finding(s).`);
        }
      }
    },
  };
}
