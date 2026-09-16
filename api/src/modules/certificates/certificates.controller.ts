import { Controller, Get, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ROLES } from '../../common/auth/roles';
import { Public, Roles } from '../../common/auth/roles.decorator';
import { CertificatesService } from './certificates.service';

@Controller()
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get('tenants/:tenantId/certificates')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  list() {
    return this.certificates.list();
  }

  @Get('tenants/:tenantId/certificates/:certId')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  findOne(@Param('certId', ParseUUIDPipe) certId: string) {
    return this.certificates.findOne(certId);
  }

  /** Download the certificate as a PDF. */
  @Get('tenants/:tenantId/certificates/:certId/pdf')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  async pdf(@Param('certId', ParseUUIDPipe) certId: string, @Res() res: Response) {
    const pdf = await this.certificates.renderPdf(certId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${certId}.pdf"`);
    res.send(pdf);
  }

  /** Public verification of a certificate serial (e.g. for an auditor). */
  @Public()
  @Get('verify/:serial')
  verify(@Param('serial') serial: string) {
    return this.certificates.verify(serial);
  }
}
