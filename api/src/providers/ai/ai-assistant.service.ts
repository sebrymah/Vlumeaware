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

    const user = [
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
