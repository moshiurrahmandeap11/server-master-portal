import { UserRole } from '../../generated/prisma';

export interface IRequestUser {
  candidateId: string;
  email: string;
  role: UserRole;
  phone?: string | null;
  name?: string | null;
}
