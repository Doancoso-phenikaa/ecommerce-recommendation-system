import { UserRole } from '../enums/user-role.enum.js';

export interface AuthenticatedUser {
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
}
