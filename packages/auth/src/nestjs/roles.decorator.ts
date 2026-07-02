import { SetMetadata } from '@nestjs/common';
import type { AppRole } from '../roles';

export const ROLES_KEY = 'frontcore:requiredRole';

/** Exige que o utilizador tenha, no mínimo, a role indicada. */
export const Roles = (role: AppRole) => SetMetadata(ROLES_KEY, role);
