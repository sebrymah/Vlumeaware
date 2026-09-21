import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AGREEMENT_UPLOAD, LOGO_UPLOAD } from '../../common/upload/upload-limits';
import { CERTIFICATE_TEMPLATES } from '../certificates/certificate-templates';
import { IsBoolean, IsDateString, IsEmail, IsHexColor, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { JwtPayload } from '../../common/auth/roles';
import { ROLES } from '../../common/auth/roles';
import { TenantsService } from './tenants.service';

class CreateTenantDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsHexColor() brandPrimaryColor?: string;
  @IsOptional() @IsString() brandLogoUrl?: string;
}

class AgreementDto {
  @IsDateString() signedAt!: string;
}

class CreateTenantUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsIn(['client_admin', 'client_viewer']) role!: 'client_admin' | 'client_viewer';
}

class SecurityDto {
  // A floor of 8 and a ceiling of 64: below 8 is indefensible, above 64 people
  // start writing passwords down.
  @IsOptional() @IsInt() @Min(8) @Max(64) passwordMinLength?: number;
  // 15 minutes to 30 days.
  @IsOptional() @IsInt() @Min(15) @Max(43200) sessionTimeoutMinutes?: number;
  @IsOptional() @IsBoolean() requireMfa?: boolean;
}

class BrandingDto {
  @IsOptional() @IsHexColor() brandPrimaryColor?: string;
  @IsOptional() @IsIn(CERTIFICATE_TEMPLATES) certificateTemplate?: string;
}

class StatusDto {
  @IsIn(['active', 'suspended', 'offboarded']) status!: 'active' | 'suspended' | 'offboarded';
}

class DeliverabilityDto {
  @IsOptional() @IsString() sendingDomain?: string;
  @IsOptional() @IsBoolean() allowlistConfirmed?: boolean;
}

class DigestDto {
  @IsOptional() @IsBoolean() digestEnabled?: boolean;
  @IsOptional() @IsEmail() digestEmail?: string;
}

class LicenseDto {
  @IsOptional() @IsString() licenseTier?: string | null;
  @IsOptional() @IsInt() @Min(0) seatLimit?: number | null;
}

class ApproveDto {
  @IsOptional() @IsString() licenseTier?: string;
  @IsOptional() @IsInt() @Min(1) seatLimit?: number;
}

@Controller('tenants')
@Roles(ROLES.superadmin)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }

  @Get()
  list() {
    return this.tenants.list();
  }

  @Get('overview')
  overview() {
    return this.tenants.crossClientOverview();
  }

  @Get('pending-signups')
  pendingSignups() {
    return this.tenants.listPendingSignups();
  }

  @Post(':tenantId/approve')
  approve(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApproveDto,
  ) {
    return this.tenants.approveSignup(tenantId, user.sub, dto);
  }

  @Get(':tenantId/trial')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  trial(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.trialStatus(tenantId);
  }

  @Get(':tenantId')
  findOne(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.findOne(tenantId);
  }

  @Post(':tenantId/agreement')
  @UseInterceptors(FileInterceptor('document', AGREEMENT_UPLOAD))
  agreement(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: AgreementDto,
    @UploadedFile() document: { buffer: Buffer; mimetype: string; originalname: string },
  ) {
    return this.tenants.recordAgreement(tenantId, document, new Date(dto.signedAt));
  }

  /** A client admin manages their own console security. */
  @Get(':tenantId/security')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  getSecurity(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.getSecurity(tenantId);
  }

  @Patch(':tenantId/security')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  setSecurity(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: SecurityDto) {
    return this.tenants.setSecurity(tenantId, dto);
  }

  @Post(':tenantId/users/:userId/unlock')
  @HttpCode(200)
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  unlockUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.tenants.unlockUser(tenantId, userId);
  }

  /** The client's own slice of the audit trail. */
  @Get(':tenantId/audit-log')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  auditLog(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.auditLog(tenantId);
  }

  @Get(':tenantId/branding')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  getBranding(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.getBranding(tenantId);
  }

  /** A client admin controls their own look; Vlumetech staff can also set it. */
  @Patch(':tenantId/branding')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  setBranding(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: BrandingDto) {
    return this.tenants.setBranding(tenantId, dto);
  }

  @Post(':tenantId/branding/logo')
  @Roles(ROLES.superadmin, ROLES.clientAdmin)
  @UseInterceptors(FileInterceptor('logo', LOGO_UPLOAD))
  setLogo(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @UploadedFile() logo: { buffer: Buffer; mimetype: string },
  ) {
    return this.tenants.setLogo(tenantId, logo);
  }

  @Patch(':tenantId/status')
  setStatus(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: StatusDto) {
    return this.tenants.setStatus(tenantId, dto.status);
  }

  @Patch(':tenantId/deliverability')
  setDeliverability(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: DeliverabilityDto) {
    return this.tenants.setDeliverability(tenantId, dto);
  }

  @Patch(':tenantId/digest')
  setDigest(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: DigestDto) {
    return this.tenants.setDigest(tenantId, dto);
  }

  /** Set the client's license tier and seat (employee) limit. */
  @Patch(':tenantId/license')
  setLicense(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: LicenseDto) {
    return this.tenants.setLicense(tenantId, dto);
  }

  @Get(':tenantId/seats')
  @Roles(ROLES.superadmin, ROLES.clientAdmin, ROLES.clientViewer)
  seatUsage(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.seatUsage(tenantId);
  }

  @Post(':tenantId/users')
  createUser(@Param('tenantId', ParseUUIDPipe) tenantId: string, @Body() dto: CreateTenantUserDto) {
    return this.tenants.createTenantUser(tenantId, dto);
  }

  @Get(':tenantId/users')
  listUsers(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.tenants.listTenantUsers(tenantId);
  }
}
