import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';
import { LOGIN_FORM_MARKER, sanitizeLandingHtml } from '../../common/security/sanitize-landing-html';

/**
 * Client-authored landing pages — the simulated login a target lands on. The
 * HTML is sanitized on the way in (appearance only; the platform injects the
 * metadata-only form), so what is stored is already safe to render.
 */
@Injectable()
export class LandingPagesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.db.customLandingPage.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });
  }

  async get(id: string) {
    const page = await this.prisma.db.customLandingPage.findUnique({ where: { id } });
    if (!page) throw new NotFoundException('Landing page not found');
    return page;
  }

  /** Sanitizes without saving — for the live preview while composing. */
  preview(html: string): { html: string } {
    return { html: sanitizeLandingHtml(html) };
  }

  async create(name: string, html: string) {
    const bodyHtml = sanitizeLandingHtml(html);
    if (!bodyHtml.trim()) {
      throw new BadRequestException('The landing page is empty after sanitizing — add some visible content.');
    }
    return this.prisma.db.customLandingPage.create({
      data: { tenantId: currentTenantId(), name: name.trim() || 'Custom landing page', bodyHtml },
      select: { id: true, name: true, createdAt: true },
    });
  }

  async remove(id: string) {
    await this.get(id);
    await this.prisma.db.customLandingPage.delete({ where: { id } });
    return { deleted: true };
  }

  /** Where the injected metadata-only form goes; here so the web mirrors it. */
  static readonly formMarker = LOGIN_FORM_MARKER;
}
