import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';
import { MAILER } from '../../providers/mailer/mailer.interface';
import type { Mailer } from '../../providers/mailer/mailer.interface';
import { trackingBaseUrl } from '../tracking/render';

export interface CertificateInput {
  employeeId: string;
  moduleTitle: string;
  quizTitle: string;
  scorePct: number;
  sourceSendId?: string;
}

/** Escapes text interpolated into the certificate email body. */
function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
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
        tenant: { select: { name: true } },
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
      const verifyUrl = `${trackingBaseUrl()}/verify/${cert.serial}`;

      await this.mailer.send({
        to: cert.employee.email,
        fromName: `${cert.tenant.name} Security Awareness`,
        fromAddress:
          process.env.NOTIFICATION_FROM_ADDRESS ??
          process.env.DIGEST_FROM_ADDRESS ??
          'reports@vlumeaware-trk.io',
        subject: `Your certificate — ${cert.moduleTitle}`,
        html: `
          <p>Hello ${esc(cert.employee.name)},</p>
          <p>
            You completed <strong>${esc(cert.moduleTitle)}</strong> with a score of
            ${cert.scorePct}%. Your certificate of completion is attached.
          </p>
          <p>
            Serial <strong>${esc(cert.serial)}</strong> —
            <a href="${verifyUrl}">verify this certificate</a>.
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
    return buildCertificatePdf({
      tenant: cert.tenant.name,
      employee: cert.employee.name,
      module: cert.moduleTitle,
      score: cert.scorePct,
      serial: cert.serial,
      issued: cert.issuedAt.toISOString().slice(0, 10),
    });
  }
}

/** Escapes text for a PDF string literal. */
function pdfEsc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Builds a minimal valid single-page PDF (Helvetica) with the certificate
 * text. Landscape A4. No external library.
 */
function buildCertificatePdf(c: {
  tenant: string;
  employee: string;
  module: string;
  score: number;
  serial: string;
  issued: string;
}): Buffer {
  const line = (x: number, y: number, size: number, text: string) =>
    `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEsc(text)}) Tj ET`;

  const content = [
    '0.06 0.44 0.26 RG 3 w 30 30 782 535 re S',
    line(120, 470, 34, 'Certificate of Completion'),
    line(120, 420, 14, 'This certifies that'),
    line(120, 385, 26, c.employee),
    line(120, 345, 14, 'has completed the security awareness module'),
    line(120, 315, 18, c.module),
    line(120, 275, 14, `with a score of ${c.score}%`),
    line(120, 210, 12, `Issued by ${c.tenant} via Vlumeaware`),
    line(120, 190, 12, `Date: ${c.issued}`),
    line(120, 170, 12, `Serial: ${c.serial}`),
    line(120, 150, 10, 'Verify at /verify/' + c.serial),
  ].join('\n');

  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  );
  objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
