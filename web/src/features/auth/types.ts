export interface AuthRole {
  code: string;
  name: string;
}

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: AuthRole | null;
  permissions: string[];
}

export interface LoginPayload {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}
