import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId, runAsSystem } from '../../common/prisma/tenant-context';

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues a certificate for a passed module quiz. Idempotent per
   * employee+module+send, so a re-submit does not mint duplicates.
   */
  async issueForPass(input: {
    employeeId: string;
    moduleTitle: string;
    quizTitle: string;
    scorePct: number;
    sourceSendId?: string;
  }) {
    const existing = await this.prisma.db.certificate.findFirst({
      where: {
        employeeId: input.employeeId,
        moduleTitle: input.moduleTitle,
        sourceSendId: input.sourceSendId ?? null,
      },
    });
    if (existing) return existing;

    const serial = `VLA-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    return this.prisma.db.certificate.create({
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
