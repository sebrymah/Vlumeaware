import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { currentTenantId } from '../../common/prisma/tenant-context';

/**
 * Named, tenant-scoped sets of employees for segmented / targeted phishing.
 * Every call runs inside the request's tenant scope (set by the interceptor),
 * so the Prisma tenant guard confines all of these to the acting tenant.
 */
@Injectable()
export class GroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const groups = await this.prisma.db.employeeGroup.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        sourceCampaignId: true,
        sourceCriteria: true,
        _count: { select: { members: true } },
      },
    });
    const sourceIds = groups.map((g) => g.sourceCampaignId).filter((id): id is string => !!id);
    const campaigns = sourceIds.length
      ? await this.prisma.db.campaign.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = new Map(campaigns.map((c) => [c.id, c.name]));
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      // Keep the original shape for the campaign builder's selector, which reads
      // `_count.members`; memberCount is the same value under a clearer name.
      _count: { members: g._count.members },
      memberCount: g._count.members,
      sourceCampaignId: g.sourceCampaignId,
      sourceCampaignName: g.sourceCampaignId ? nameOf.get(g.sourceCampaignId) ?? null : null,
      sourceCriteria: g.sourceCriteria,
    }));
  }

  async findOne(id: string) {
    const group = await this.prisma.db.employeeGroup.findUnique({
      where: { id },
      include: {
        members: {
          orderBy: { createdAt: 'asc' },
          include: { employee: { select: { id: true, name: true, email: true, department: true } } },
        },
      },
    });
    if (!group) throw new NotFoundException('Group not found');
    return {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      members: group.members.map((m) => m.employee),
    };
  }

  async create(name: string) {
    return this.createWithMembers(name, [], undefined);
  }

  /**
   * Creates a group and its members in one transaction.
   *
   * This is the "create from campaign results" path: the caller has already shown
   * a preview and let the admin trim it, so the members arrive as the final set.
   * Provenance is recorded so the group can say where it came from. The ids are
   * narrowed to this tenant exactly as setMembers does — a foreign id can never be
   * linked in.
   */
  async createWithMembers(
    name: string,
    employeeIds: string[],
    source?: { campaignId?: string; criteria?: string },
  ) {
    const clean = name.trim();
    if (!clean) throw new ConflictException('A group name is required.');

    const tenantId = currentTenantId();
    const valid = await this.prisma.db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true },
    });
    const ids = valid.map((e) => e.id);

    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const group = await tx.employeeGroup.create({
          data: {
            name: clean,
            tenantId,
            sourceCampaignId: source?.campaignId ?? null,
            sourceCriteria: source?.criteria ?? null,
          },
        });
        if (ids.length) {
          await tx.employeeGroupMember.createMany({
            data: ids.map((employeeId) => ({ groupId: group.id, employeeId, tenantId })),
            skipDuplicates: true,
          });
        }
        return { id: group.id, name: group.name, memberCount: ids.length };
      });
    } catch (err) {
      throw GroupsService.friendly(err);
    }
  }

  async rename(id: string, name: string) {
    await this.findOne(id);
    const clean = name.trim();
    if (!clean) throw new ConflictException('A group name is required.');
    try {
      return await this.prisma.db.employeeGroup.update({ where: { id }, data: { name: clean } });
    } catch (err) {
      throw GroupsService.friendly(err);
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.db.employeeGroup.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Replaces the group's members with the given employee ids. The ids are first
   * narrowed to employees that actually belong to this tenant (a tenant-scoped
   * lookup), so a foreign id can never be linked into the group even though the
   * FK alone would allow it.
   */
  async setMembers(id: string, employeeIds: string[]) {
    await this.findOne(id);
    const valid = await this.prisma.db.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true },
    });
    const ids = valid.map((e) => e.id);
    await this.prisma.db.employeeGroupMember.deleteMany({ where: { groupId: id } });
    if (ids.length) {
      const tenantId = currentTenantId();
      await this.prisma.db.employeeGroupMember.createMany({
        data: ids.map((employeeId) => ({ groupId: id, employeeId, tenantId })),
        skipDuplicates: true,
      });
    }
    return this.findOne(id);
  }

  private static friendly(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('A group with that name already exists.');
    }
    return err;
  }
}
