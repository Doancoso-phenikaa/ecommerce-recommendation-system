import { UserRole } from '../../../common/enums/user-role.enum.js';

export interface AuthenticationTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
}
