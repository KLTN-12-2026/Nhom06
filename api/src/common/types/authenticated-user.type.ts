export interface AuthenticatedRole {
  code: string;
  name: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: AuthenticatedRole | null;
  permissions: string[];
  tokenVersion: number;
}
