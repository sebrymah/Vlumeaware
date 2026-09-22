import { Module } from '@nestjs/common';
import { TrainingModule } from '../training/training.module';
import { TrainingModulesModule } from '../training-modules/training-modules.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { TenantsModule } from '../tenants/tenants.module';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

@Module({
  imports: [TrainingModule, TrainingModulesModule, CertificatesModule, TenantsModule],
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
