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

  list() {
    return this.prisma.db.employeeGroup.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true, _count: { select: { members: true } } },
    });
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
    const clean = name.trim();
    if (!clean) throw new ConflictException('A group name is required.');
    try {
      return await this.prisma.db.employeeGroup.create({ data: { name: clean, tenantId: currentTenantId() } });
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
