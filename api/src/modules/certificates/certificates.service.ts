import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { notificationFromAddress } from '../../providers/mailer/from-addresses';
import { StorageService } from '../../providers/storage/storage.service';
import { renderCertificatePdf } from './certificate-pdf';
import { isCertificateTemplate } from './certificate-templates';
import { escapeHtml as esc } from '../../common/html/escape';
import { MAILER } from '../../providers/mailer/mailer.interface';
import type { Mailer } from '../../providers/mailer/mailer.interface';
import { publicBaseUrl } from '../tracking/render';

export interface CertificateInput {
  employeeId: string;
  moduleTitle: string;
  quizTitle: string;
  scorePct: number;
  sourceSendId?: string;
}

/** PNG files start with these eight bytes; anything else we treat as JPEG. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly storage: StorageService,
  ) {}

  /**
   * Issues a certificate for a passed module quiz. Idempotent per
   * employee+module+send, so a re-submit does not mint duplicates.
   */
  async issueForPass(input: CertificateInput) {
    return (await this.issue(input)).certificate;
  }

  /**
   * Issues the certificate and emails it to the employee — but only when it
   * was newly minted. A re-submitted quiz returns the certificate already on
   * file without posting the employee a second copy.
   */
  async issueAndEmail(input: CertificateInput): Promise<{ id: string; emailed: boolean }> {
    const { certificate, created } = await this.issue(input);
    return {
      id: certificate.id,
      emailed: created ? await this.emailToEmployee(certificate.id) : false,
    };
  }

  /** Shared by both entry points; reports whether this call minted the row. */
  private async issue(input: CertificateInput) {
    const existing = await this.prisma.db.certificate.findFirst({
      where: {
        employeeId: input.employeeId,
        moduleTitle: input.moduleTitle,
        sourceSendId: input.sourceSendId ?? null,
      },
    });
    if (existing) return { certificate: existing, created: false };

    const serial = `VLA-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const certificate = await this.prisma.db.certificate.create({
      data: {
        tenantId: currentTenantId(),
        employeeId: input.employeeId,
        serial,
        moduleTitle: input.moduleTitle,
        quizTitle: input.quizTitle,
        scorePct: input.scorePct,
        sourceSendId: input.sourceSendId,
      },
    });
    return { certificate, created: true };
  }

  list() {
    return this.prisma.db.certificate.findMany({
      orderBy: { issuedAt: 'desc' },
      include: { employee: { select: { name: true, email: true, department: true } } },
    });
  }

  async findOne(id: string) {
    const cert = await this.prisma.db.certificate.findUnique({
      where: { id },
      include: {
        employee: { select: { name: true, email: true } },
        tenant: {
          select: {
            name: true,
            brandLogoUrl: true,
            brandPrimaryColor: true,
            certificateTemplate: true,
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  /** Public verification by serial — no tenant context. */
  verify(serial: string) {
    return runAsSystem('certificate verify by serial', () =>
      this.prisma.db.certificate.findUnique({
        where: { serial },
        select: {
          serial: true,
          moduleTitle: true,
          quizTitle: true,
          scorePct: true,
          issuedAt: true,
          tenant: { select: { name: true } },
          employee: { select: { name: true } },
        },
      }),
    );
  }

  /**
   * Renders a certificate PDF addressed by its public serial, with no tenant
   * context — so the employee portal and an auditor can download it from a
   * public link. The serial is the unguessable public key that already gates
   * verification.
   */
  async renderPdfBySerial(serial: string): Promise<{ pdf: Buffer; serial: string }> {
    const cert = await runAsSystem('certificate: resolve serial for pdf', () =>
      this.prisma.db.certificate.findUnique({ where: { serial }, select: { id: true, serial: true } }),
    );
    if (!cert) throw new NotFoundException('Certificate not found');
    const pdf = await runAsSystem('certificate: render pdf by serial', () => this.renderPdf(cert.id));
    return { pdf, serial: cert.serial };
  }

  /**
   * Emails the certificate PDF to the employee who earned it.
   *
   * Sent from the notification address, never SIMULATION_FROM_ADDRESS: that
   * domain and IP pool exist to deliver fake phishing, and a genuine
   * certificate must not arrive from the same sender the employee is being
   * trained to distrust.
   *
   * Never throws. A mail failure must not fail the quiz submission that earned
   * the certificate — the record is already saved and downloadable by the
   * admin — so the outcome is returned instead and logged at error level.
   */
  async emailToEmployee(certificateId: string): Promise<boolean> {
    try {
      const cert = await this.findOne(certificateId);
      if (!cert.employee.email) {
        this.logger.warn(`Certificate ${cert.serial} has no employee email; not sending`);
        return false;
      }

      const pdf = await this.renderPdf(certificateId);
      const verifyUrl = `${publicBaseUrl()}/verify/${cert.serial}`;

      await this.mailer.send({
        to: cert.employee.email,
        fromName: `${cert.tenant.name} Security Awareness`,
        fromAddress: notificationFromAddress(),
        subject: `Your certificate — ${cert.moduleTitle}`,
        html: `
          <p>Hello ${esc(cert.employee.name)},</p>
          <p>
            You completed <strong>${esc(cert.moduleTitle)}</strong> with a score of
            ${cert.scorePct}%. Your certificate of completion is attached.
          </p>
          <p>
            Serial <strong>${esc(cert.serial)}</strong>.
            <a href="${verifyUrl}">Verify this certificate</a>.
          </p>
          <p>Thank you for taking the training seriously.<br />${esc(cert.tenant.name)}</p>
        `,
        sendId: `certificate-${cert.id}`,
        attachments: [
          {
            filename: `certificate-${cert.serial}.pdf`,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      });

      this.logger.log(`Certificate ${cert.serial} emailed to ${cert.employee.email}`);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to email certificate ${certificateId}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Renders the certificate as a self-contained one-page PDF. Hand-built with
   * pdf-lib-free primitives so there is no heavyweight PDF dependency: a minimal
   * but valid PDF document.
   */
  async renderPdf(id: string): Promise<Buffer> {
    const cert = await this.findOne(id);
    const tenant = cert.tenant;

    // The logo is embedded, so the bytes are needed rather than a signed URL.
    // A missing or unreadable one just leaves the client's name in its place.
    let clientLogo: { bytes: Buffer; mimetype: string } | null = null;
    if (tenant.brandLogoUrl) {
      const bytes = await this.storage.get(tenant.brandLogoUrl);
      if (bytes) {
        const mimetype = bytes.subarray(0, 8).equals(PNG_MAGIC) ? 'image/png' : 'image/jpeg';
        clientLogo = { bytes, mimetype };
      } else {
        this.logger.warn(`Certificate ${cert.serial}: logo could not be read; rendering without it`);
      }
    }

    return renderCertificatePdf({
      template: isCertificateTemplate(tenant.certificateTemplate)
        ? tenant.certificateTemplate
        : 'branded',
      tenantName: tenant.name,
      employeeName: cert.employee.name,
      moduleTitle: cert.moduleTitle,
      quizTitle: cert.quizTitle,
      scorePct: cert.scorePct,
      serial: cert.serial,
      issued: cert.issuedAt,
      verifyUrl: `${publicBaseUrl()}/verify/${cert.serial}`,
      accentHex: tenant.brandPrimaryColor,
      clientLogo,
    });
  }
}
