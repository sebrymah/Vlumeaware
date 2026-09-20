import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AI_PROVIDER } from './ai.interface';
import type { AiProvider } from './ai.interface';

export interface GeneratedScenario {
  title: string;
  subjectLine: string;
  bodyHtml: string;
  senderSpoofName: string;
  redFlags: string[];
}

export interface RiskAdviceInput {
  tenantName: string;
  employees: Array<{
    id: string;
    name: string;
    department: string | null;
    riskScore: number;
    riskLevel: string;
    sends: number;
    clicks: number;
    reports: number;
    credentialSubmissions: number;
    quizPasses: number;
    repeatClicker: boolean;
  }>;
  /** The tenant's own modules — the only things that may be recommended. */
  modules: Array<{ id: string; title: string }>;
}

export interface RiskAdvice {
  summary: string;
  actions: string[];
  assignments: Array<{ employeeId: string; moduleId: string; reason: string }>;
}

export interface NarrativeInput {
  tenantName: string;
  campaignName: string;
  totalSent: number;
  openRate: number;
  clickRate: number;
  reportRate: number;
  credentialSubmissionCount: number;
  emailShapedUsernameRate?: number | null;
  previousClickRate?: number | null;
  topDepartments: Array<{ department: string; clickRate: number; sent: number }>;
}

/**
 * The Vlumeaware AI assistant: every prompt the product sends, and the parsing
 * and guards around the replies. Which model answers is the provider's
 * business — see AiProvider.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AiProvider) {}

  get available() {
    return this.provider.available;
  }

  /** Diagnostics only. */
  get backend() {
    return { provider: this.provider.name, model: this.provider.model };
  }

  /**
   * Draft a phishing pretext for review. Output is always a draft: an admin
   * edits and approves before it can be attached to a campaign.
   */
  async generateScenario(input: {
    industry: string;
    difficultyTier: 'low' | 'medium' | 'high';
    context?: string;
  }): Promise<GeneratedScenario> {
    const system = [
        'You write authorized phishing simulation templates for Vlumeaware, a security',
        'awareness platform. Every template is used only against employees of a client',
        'that has signed a written authorization agreement, and every click leads to a',
        'training page, never to credential capture.',
        '',
        'Ground the pretext in Nigerian business reality: invoice and mandate fraud',
        'patterns, local payroll cycles, bank and regulatory notice formats (CBN, FIRS,',
        'NDPC), pension and HMO notices, and the phrasing Nigerian corporate email',
        'actually uses. Avoid generic US-centric lures.',
        '',
        'Return ONLY a JSON object with keys: title, subjectLine, bodyHtml,',
        'senderSpoofName, redFlags (array of 3-5 short strings naming the specific',
        'giveaways an employee should have spotted). bodyHtml must be simple inline',
        'styled HTML and must contain the literal placeholder {{TRACKING_URL}} exactly',
        'once as the href of its primary call to action, and may use {{EMPLOYEE_NAME}}.',
    ].join('\n');

    // The model has a training cutoff and will otherwise invent a plausible
    // year — one draft dated a 2024 pension deadline. Both dates are computed
    // here, weekday included, so no date arithmetic is left to the model.
    const today = new Date();
    const deadline = nextWorkingDay(today, 5);
    const user = [
      `Today's date is ${formatLongDate(today)}.`,
      `If the pretext needs a deadline, use ${formatLongDate(deadline)}.`,
      `Never reference a date in the past, and never a year other than ${today.getFullYear()}.`,
      '',
      `Industry: ${input.industry}`,
      `Difficulty tier: ${input.difficultyTier}`,
      input.context ? `Additional context: ${input.context}` : '',
      '',
      'Difficulty guidance: low = obvious errors and a generic greeting;',
      'medium = plausible internal sender, mild urgency, one subtle domain tell;',
      'high = context-aware pretext referencing a real business process, clean',
      'writing, and only a single technical giveaway.',
    ]
      .filter(Boolean)
      .join('\n');

    const text = await this.provider.complete({ system, user, maxTokens: 2000, json: true });

    const parsed = this.parseJson<GeneratedScenario>(text);
    if (!parsed.bodyHtml?.includes('{{TRACKING_URL}}')) {
      throw new ServiceUnavailableException(
        'Generated scenario omitted the {{TRACKING_URL}} placeholder; regenerate.',
      );
    }
    return {
      title: parsed.title,
      subjectLine: parsed.subjectLine,
      bodyHtml: parsed.bodyHtml,
      senderSpoofName: parsed.senderSpoofName,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags.slice(0, 5) : [],
    };
  }

  /**
   * Reads the tenant's risk table and says what to do about it.
   *
   * The model is given the real rows and the tenant's real modules, and every
   * id it returns is checked against them before anything is shown: a
   * recommendation naming an employee who does not exist, or a module the
   * client has not got, is worse than no recommendation on a page an admin
   * acts on.
   */
  async adviseOnRisk(input: RiskAdviceInput): Promise<RiskAdvice> {
    if (!input.employees.length) {
      return {
        summary: 'No employees have been through a simulation yet, so there is no risk to assess.',
        actions: [],
        assignments: [],
      };
    }

    const system = [
      'You advise the security lead of a Nigerian SME on what to do about the',
      'human risk their phishing simulations have measured. You are reading a real',
      'risk table, not a hypothetical one.',
      '',
      'Tone: measured and practical, the way a security consultant briefs a manager.',
      'No alarmism, no vendor language, no praise. Name what the numbers show and',
      'what to do about it, in that order. Be specific about people and modules',
      'rather than giving generic awareness advice.',
      '',
      'Reporting is the behaviour worth building: an employee who reports a',
      'simulation before clicking is the control working. Someone who clicks',
      'repeatedly, or who submitted credentials, needs attention beyond a video.',
      'Say so plainly, and keep remedies proportionate — remedial training, a',
      'conversation, tighter controls for a specific role, not blanket punishment.',
      '',
      'Return ONLY a json object with keys:',
      '  summary    — 2-4 sentences on where this organisation actually stands.',
      '  actions    — 2-5 short strings, each one concrete step the admin can take.',
      '  assignments — the employees who should be given a module now. Each entry is',
      '                { employeeId, moduleId, reason }, using ONLY the ids given',
      '                below. One short sentence of reason, naming the behaviour that',
      '                justifies it. Return an empty array if nobody needs one.',
      '',
      'Never invent an employee or a module. If no listed module fits someone who',
      'needs training, say so in actions instead of inventing an assignment.',
    ].join('\n');

    const user = [
      `Organisation: ${input.tenantName}`,
      '',
      'Employees, highest risk first:',
      ...input.employees.map(
        (e) =>
          `- id=${e.id} | ${e.name}${e.department ? ` (${e.department})` : ''} | score ${e.riskScore}/100 ${e.riskLevel}` +
          ` | ${e.sends} simulations, ${e.clicks} clicks, ${e.reports} reported, ` +
          `${e.credentialSubmissions} credential submissions, ${e.quizPasses} quizzes passed` +
          `${e.repeatClicker ? ' | REPEAT CLICKER' : ''}`,
      ),
      '',
      input.modules.length
        ? 'Training modules available to assign:'
        : 'This client has no training modules yet — recommend no assignments and say so in actions.',
      ...input.modules.map((m) => `- id=${m.id} | ${m.title}`),
    ].join('\n');

    const text = await this.provider.complete({ system, user, maxTokens: 1200, json: true });
    const parsed = this.parseJson<RiskAdvice>(text);

    const employeeIds = new Set(input.employees.map((e) => e.id));
    const moduleIds = new Set(input.modules.map((m) => m.id));
    const assignments = (Array.isArray(parsed.assignments) ? parsed.assignments : []).filter(
      (a) => employeeIds.has(a?.employeeId) && moduleIds.has(a?.moduleId),
    );
    if (assignments.length !== (parsed.assignments?.length ?? 0)) {
      this.logger.warn('Risk advice referenced unknown employees or modules; those were dropped');
    }

    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      actions: Array.isArray(parsed.actions) ? parsed.actions.filter(Boolean).slice(0, 5) : [],
      assignments: assignments.slice(0, 20),
    };
  }

  /** Board-report narrative in Vlumetech's governance tone. */
  async generateReportNarrative(input: NarrativeInput): Promise<string> {
    const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

    const system = [
        'You write the narrative section of a Vlumetech security governance report.',
        'Audience: a Nigerian SME or mid-market board and its audit committee.',
        '',
        'Tone: measured, factual, governance-first. State what the numbers show, frame',
        'residual risk in business terms, and recommend proportionate action. No',
        'alarmism, no vendor marketing language, no praise for the client. Refer to the',
        'exercise as an authorized simulation.',
        '',
        'Structure with these headings exactly: Summary, What The Numbers Show,',
        'Risk Assessment, Recommended Actions. Use short paragraphs. Plain prose, no',
      'bullet lists except under Recommended Actions. 350-500 words.',
    ].join('\n');

    const user = [
      `Client: ${input.tenantName}`,
            `Campaign: ${input.campaignName}`,
            `Simulated emails delivered: ${input.totalSent}`,
            `Open rate: ${pct(input.openRate)}`,
            `Click rate: ${pct(input.clickRate)}`,
            `Report rate (employees who reported before clicking): ${pct(input.reportRate)}`,
            `Employees who submitted credentials on the simulated page: ${input.credentialSubmissionCount}`,
            input.emailShapedUsernameRate != null
              ? `Of those, ${pct(input.emailShapedUsernameRate)} typed an email-shaped username (a sign they entered real-looking work credentials).`
              : '',
            input.previousClickRate != null
              ? `Click rate in the previous campaign: ${pct(input.previousClickRate)}`
              : 'No previous campaign for trend comparison.',
            '',
            'Click rate by department:',
      ...input.topDepartments.map(
        (d) => `- ${d.department}: ${pct(d.clickRate)} of ${d.sent} recipients`,
      ),
    ].join('\n');

    return (await this.provider.complete({ system, user, maxTokens: 1500 })).trim();
  }

  private parseJson<T>(text: string): T {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) {
      this.logger.error(`Claude returned no JSON object: ${text.slice(0, 200)}`);
      throw new ServiceUnavailableException('Claude returned an unparseable scenario');
    }
    try {
      return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
      throw new ServiceUnavailableException('Claude returned malformed JSON');
    }
  }
}

/** "Sunday, 20 September 2026" — the form a Nigerian corporate email would use. */
function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** `days` working days ahead, so a deadline never lands on a weekend. */
function nextWorkingDay(from: Date, days: number): Date {
  const date = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return date;
}
