import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';

export interface EmployeeRow {
  email: string;
  name: string;
  department?: string;
}

export interface BulkUploadResult {
  created: number;
  updated: number;
  skipped: Array<{ row: number; email?: string; reason: string }>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.db.employee.findMany({ orderBy: [{ department: 'asc' }, { name: 'asc' }] });
  }

  async findOne(id: string) {
    const employee = await this.prisma.db.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.db.employee.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Bulk upload. Existing employees are updated rather than duplicated, and
   * unusable rows are reported back instead of failing the whole file — a
   * 400-row CSV with two bad addresses should still onboard 398 people.
   */
  async bulkUpload(rows: EmployeeRow[]): Promise<BulkUploadResult> {
    const result: BulkUploadResult = { created: 0, updated: 0, skipped: [] };
    const seen = new Set<string>();

    // License seat limit: only NEW employees consume a seat; updates to existing
    // ones do not. Once the limit is reached, further new rows are skipped with a
    // clear reason rather than failing the whole upload.
    const tenantId = currentTenantId();
    const tenant = await this.prisma.db.tenant.findUnique({
      where: { id: tenantId },
      select: { seatLimit: true },
    });
    let seatsUsed = await this.prisma.db.employee.count();
    const seatLimit = tenant?.seatLimit ?? null;

    for (const [index, row] of rows.entries()) {
      const email = row.email?.trim().toLowerCase();
      const name = row.name?.trim();
      const rowNumber = index + 2; // account for the header line

      if (!email || !EMAIL.test(email)) {
        result.skipped.push({ row: rowNumber, email, reason: 'invalid email address' });
        continue;
      }
      if (!name) {
        result.skipped.push({ row: rowNumber, email, reason: 'missing name' });
        continue;
      }
      if (seen.has(email)) {
        result.skipped.push({ row: rowNumber, email, reason: 'duplicate within file' });
        continue;
      }
      seen.add(email);

      const existing = await this.prisma.db.employee.findFirst({ where: { email } });
      if (existing) {
        await this.prisma.db.employee.update({
          where: { id: existing.id },
          data: { name, department: row.department?.trim() || null },
        });
        result.updated += 1;
      } else {
        if (seatLimit !== null && seatsUsed >= seatLimit) {
          result.skipped.push({
            row: rowNumber,
            email,
            reason: `seat limit reached (${seatLimit} seats licensed)`,
          });
          continue;
        }
        await this.prisma.db.employee.create({
          data: {
            tenantId,
            email,
            name,
            department: row.department?.trim() || null,
          },
        });
        seatsUsed += 1;
        result.created += 1;
      }
    }

    return result;
  }

  parseCsv(buffer: Buffer): EmployeeRow[] {
    if (!buffer?.length) throw new BadRequestException('CSV file is empty');
    let records: Record<string, string>[];
    try {
      records = parse(buffer, {
        columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch (err) {
      throw new BadRequestException(`Could not parse CSV: ${(err as Error).message}`);
    }

    if (!records.length) throw new BadRequestException('CSV contained no data rows');
    const first = records[0];
    if (!('email' in first) || !('name' in first)) {
      throw new BadRequestException('CSV must have "email" and "name" columns');
    }

    return records.map((r) => ({ email: r.email, name: r.name, department: r.department }));
  }
}
