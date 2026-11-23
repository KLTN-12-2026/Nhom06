export interface UserRoleInfo {
  code: string;
  name: string;
}

export interface UserItem {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRoleInfo | null;
  status: 'active' | 'locked' | 'disabled' | string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateUserPayload {
  username: string;
  email: string;
  fullName: string;
  phone?: string;
  password: string;
  roleCode: string;
}

export interface UpdateUserProfilePayload {
  email?: string;
  fullName?: string;
  phone?: string | null;
}

export interface RoleOption {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  permissionCodes: string[];
}

export interface PermissionMatrixResponse {
  permissions: Array<{
    code: string;
    module: string;
    action: string;
    description: string | null;
  }>;
  roles: Array<{
    code: string;
    name: string;
    permissionCodes: string[];
  }>;
}
