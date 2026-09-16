import { SetMetadata } from '@nestjs/common';
import type { Role } from './roles';

export const ROLES_KEY = 'vlumeaware:roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'vlumeaware:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
