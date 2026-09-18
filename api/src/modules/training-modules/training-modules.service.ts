import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';
import { runAsSystem } from '../../common/prisma/tenant-context';
import { StorageService } from '../../providers/storage/storage.service';

const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
]);

@Injectable()
export class TrainingModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const rows = await this.prisma.db.trainingModule.findMany({ orderBy: { createdAt: 'desc' } });
    // Return time-limited playable URLs (signed for uploads; hosted links pass through).
    return Promise.all(
      rows.map(async (r) => ({ ...r, videoUrl: await this.storage.signedUrl(r.videoUrl) })),
    );
  }

  async findOne(id: string) {
    const module = await this.prisma.db.trainingModule.findUnique({ where: { id } });
    if (!module) throw new NotFoundException('Training module not found');
    return module;
  }

  /** Registers a module backed by an already-hosted video URL (LMS, Vimeo…). */
  createFromLink(input: {
    title: string;
    description?: string;
    videoUrl: string;
    durationSeconds?: number;
  }) {
    if (!/^https?:\/\//i.test(input.videoUrl)) {
      throw new BadRequestException('videoUrl must be an http(s) URL');
    }
    return this.prisma.db.trainingModule.create({
      data: {
        tenantId: currentTenantId(),
        title: input.title,
        description: input.description,
        videoUrl: input.videoUrl,
        videoSource: 'link',
        durationSeconds: input.durationSeconds,
      },
    });
  }

  /** Uploads a video file to object storage and registers the module. */
  async createFromUpload(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    input: { title: string; description?: string; durationSeconds?: number },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('A video file is required');
    if (!VIDEO_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported video type: ${file.mimetype}`);
    }
    const tenantId = currentTenantId();
    const storedUrl = await this.storage.put(
      `training-videos/${tenantId}`,
      file.buffer,
      file.mimetype,
    );
    return this.prisma.db.trainingModule.create({
      data: {
        tenantId,
        title: input.title,
        description: input.description,
        videoUrl: storedUrl,
        videoSource: 'upload',
        durationSeconds: input.durationSeconds,
      },
    });
  }

  async update(id: string, data: { title?: string; description?: string; durationSeconds?: number }) {
    await this.findOne(id);
    return this.prisma.db.trainingModule.update({ where: { id }, data });
  }

  async remove(id: string) {
    await this.findOne(id);
    const inUse = await this.prisma.db.trainingRoutingRule.count({ where: { trainingModuleId: id } });
    if (inUse > 0) {
      throw new BadRequestException(
        'Module is referenced by a routing rule. Reassign or clear that rule first.',
      );
    }
    await this.prisma.db.trainingModule.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Clones a shared-library item into this tenant's private module library. The
   * clone references the same stored video (no binary duplication) and records
   * its origin so the UI can show it came from the Vlumetech library.
   */
  async cloneFromShared(sharedModuleId: string) {
    const shared = await runAsSystem('read shared module for clone', () =>
      this.prisma.db.sharedTrainingModule.findUnique({ where: { id: sharedModuleId } }),
    );
    if (!shared) throw new NotFoundException('Shared module not found');
    return this.prisma.db.trainingModule.create({
      data: {
        tenantId: currentTenantId(),
        title: shared.title,
        description: shared.description,
        videoUrl: shared.videoUrl,
        videoSource: shared.videoSource,
        durationSeconds: shared.durationSeconds,
        sharedModuleId: shared.id,
      },
    });
  }

  /** A playable URL for the teachable-moment page: signed for uploads, as-is for links. */
  async playableUrl(module: { videoUrl: string; videoSource: 'upload' | 'link' }) {
    if (module.videoSource === 'link') return module.videoUrl;
    return this.storage.signedUrl(module.videoUrl);
  }
}
