import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { sanitizeHtml } from '../../common/security/sanitize-html';

/**
 * The shared phishing-template catalogue. Templates are global, read-only
 * reference content — an admin browses them and clones one into their own
 * tenant library, where it becomes an ordinary editable scenario (unapproved).
 */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: { category?: string; difficultyTier?: 'low' | 'medium' | 'high'; industryTag?: string }) {
    // Global content: read outside tenant scope on purpose.
    const rows = await runAsSystem('browse global phishing template catalogue', () =>
      this.prisma.db.phishingTemplate.findMany({
        where: {
          category: filter.category,
          difficultyTier: filter.difficultyTier,
          industryTag: filter.industryTag,
        },
        orderBy: [{ category: 'asc' }, { title: 'asc' }],
      }),
    );
    return rows.map(TemplatesService.clean);
  }

  categories() {
    return runAsSystem('list template categories', async () => {
      const rows = await this.prisma.db.phishingTemplate.findMany({
        distinct: ['category'],
        select: { category: true },
        orderBy: { category: 'asc' },
      });
      return rows.map((r) => r.category);
    });
  }

  industries() {
    return runAsSystem('list template industries', async () => {
      const rows = await this.prisma.db.phishingTemplate.findMany({
        distinct: ['industryTag'],
        select: { industryTag: true },
        where: { industryTag: { not: null } },
        orderBy: { industryTag: 'asc' },
      });
      return rows.map((r) => r.industryTag).filter((x): x is string => x !== null);
    });
  }

  async findOne(id: string) {
    const template = await runAsSystem('read global template', () =>
      this.prisma.db.phishingTemplate.findUnique({ where: { id } }),
    );
    if (!template) throw new NotFoundException('Template not found');
    return TemplatesService.clean(template);
  }

  /**
   * Sanitized on read as well as on write. The catalogue is global and its
   * bodies are rendered as HTML in every client's console, so a row persisted
   * before a sanitizer fix has to be neutralised when it is served, not only
   * when it is saved.
   */
  private static clean<T extends { bodyHtml: string }>(row: T): T {
    return { ...row, bodyHtml: sanitizeHtml(row.bodyHtml) };
  }

  // --- Vlumetech staff authoring (global catalogue) -----------------------

  /** Add a scenario to the global catalogue. Vlumetech staff only. */
  create(input: {
    title: string;
    category: string;
    difficultyTier: 'low' | 'medium' | 'high';
    industryTag?: string;
    subjectLine: string;
    bodyHtml: string;
    senderSpoofName: string;
    redFlags: string[];
  }) {
    return runAsSystem('create global template', () =>
      this.prisma.db.phishingTemplate.create({
        data: {
          title: input.title,
          category: input.category,
          difficultyTier: input.difficultyTier,
          industryTag: input.industryTag,
          subjectLine: input.subjectLine,
          bodyHtml: sanitizeHtml(input.bodyHtml),
          senderSpoofName: input.senderSpoofName,
          redFlags: input.redFlags,
          source: 'vlumetech',
        },
      }),
    );
  }

  async update(
    id: string,
    data: Partial<{
      title: string;
      category: string;
      difficultyTier: 'low' | 'medium' | 'high';
      industryTag: string;
      subjectLine: string;
      bodyHtml: string;
      senderSpoofName: string;
      redFlags: string[];
    }>,
  ) {
    await this.findOne(id);
    const clean = { ...data };
    if (typeof clean.bodyHtml === 'string') clean.bodyHtml = sanitizeHtml(clean.bodyHtml);
    return runAsSystem('update global template', () =>
      this.prisma.db.phishingTemplate.update({ where: { id }, data: clean }),
    );
  }

  async remove(id: string) {
    await this.findOne(id);
    await runAsSystem('delete global template', () =>
      this.prisma.db.phishingTemplate.delete({ where: { id } }),
    );
    return { deleted: true };
  }

  /**
   * Clones a catalogue template into the acting tenant's scenario library as an
   * unapproved draft. It carries no approval, so it still passes through the
   * same review-and-approve gate as any scenario before it can be sent.
   */
  async cloneToTenant(templateId: string) {
    const template = await this.findOne(templateId);
    return this.prisma.db.scenario.create({
      data: {
        tenantId: currentTenantId(),
        title: template.title,
        difficultyTier: template.difficultyTier,
        industryTag: template.industryTag,
        subjectLine: template.subjectLine,
        bodyHtml: template.bodyHtml,
        senderSpoofName: template.senderSpoofName,
        redFlags: template.redFlags,
        createdByClaude: false,
      },
    });
  }
}
