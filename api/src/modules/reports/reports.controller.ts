import { Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ROLES } from '../../common/auth/roles';
import { Roles } from '../../common/auth/roles.decorator';
import { AuditService } from '../../common/audit/audit.service';
import { ReportsService } from './reports.service';

@Controller('tenants/:tenantId/reports')
@Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly audit: AuditService,
  ) {}

  @Get('trend')
  trend() {
    return this.reports.trend();
  }

  /** Download a campaign report as CSV. */
  @Get(':campaignId/export.csv')
  async exportCsv(@Param('campaignId', ParseUUIDPipe) campaignId: string, @Res() res: Response) {
    const csv = await this.reports.exportCsv(campaignId);
    // Exporting campaign results moves employee-level data off-platform, so the
    // download is a security-relevant event (actor/tenant come from the scope).
    await this.audit.record('report.export_csv', `campaign ${campaignId}`);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="campaign-${campaignId}.csv"`);
    res.send(csv);
  }

  @Get(':campaignId')
  dashboard(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.reports.dashboard(campaignId);
  }

  /** Writes a new report record with a freshly generated narrative. */
  @Post(':campaignId/generate')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  generate(@Param('campaignId', ParseUUIDPipe) campaignId: string) {
    return this.reports.generate(campaignId);
  }
}
