import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { runAsSystem } from '../../common/prisma/tenant-context';
import { StorageService } from '../../providers/storage/storage.service';

const VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
]);

/**
 * The shared, GLOBAL awareness-content library. Managed by Vlumetech staff and
 * readable by every client. All reads/writes run under runAsSystem because
 * shared_training_modules has no tenant_id and sits outside the tenant guard.
 */
@Injectable()
export class SharedModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list() {
    const rows = await runAsSystem('browse shared awareness library', () =>
      this.prisma.db.sharedTrainingModule.findMany({ orderBy: { createdAt: 'desc' } }),
    );
    return Promise.all(
      rows.map(async (r) => ({ ...r, videoUrl: await this.storage.signedUrl(r.videoUrl) })),
    );
  }

  async findOne(id: string) {
    const module = await runAsSystem('read shared module', () =>
      this.prisma.db.sharedTrainingModule.findUnique({ where: { id } }),
    );
    if (!module) throw new NotFoundException('Shared module not found');
    return { ...module, videoUrl: await this.storage.signedUrl(module.videoUrl) };
  }

  createFromLink(input: { title: string; description?: string; category: string; videoUrl: string; durationSeconds?: number }) {
    if (!/^https?:\/\//i.test(input.videoUrl)) {
      throw new BadRequestException('videoUrl must be an http(s) URL');
    }
    return runAsSystem('create shared module (link)', () =>
      this.prisma.db.sharedTrainingModule.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          videoUrl: input.videoUrl,
          videoSource: 'link',
          durationSeconds: input.durationSeconds,
        },
      }),
    );
  }

  async createFromUpload(
    file: { buffer: Buffer; mimetype: string; originalname: string },
    input: { title: string; description?: string; category: string; durationSeconds?: number },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException('A video file is required');
    if (!VIDEO_MIME.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported video type: ${file.mimetype}`);
    }
    // Stored under a shared prefix, not a tenant's.
    const storedUrl = await this.storage.put('shared-training-videos', file.buffer, file.mimetype);
    return runAsSystem('create shared module (upload)', () =>
      this.prisma.db.sharedTrainingModule.create({
        data: {
          title: input.title,
          description: input.description,
          category: input.category,
          videoUrl: storedUrl,
          videoSource: 'upload',
          durationSeconds: input.durationSeconds,
        },
      }),
    );
  }

  async update(id: string, data: { title?: string; description?: string; category?: string; durationSeconds?: number }) {
    await this.findOne(id);
    return runAsSystem('update shared module', () =>
      this.prisma.db.sharedTrainingModule.update({ where: { id }, data }),
    );
  }

  async remove(id: string) {
    await this.findOne(id);
    await runAsSystem('delete shared module', () =>
      this.prisma.db.sharedTrainingModule.delete({ where: { id } }),
    );
    return { deleted: true };
  }
}
