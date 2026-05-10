export interface ApiEnvelope<TData = unknown, TResult = unknown> {
  code: number;
  msg?: string;
  reason?: string;
  data: TData | null;
  result: TResult | null;
}

export interface LoginData {
  token: string;
  userId: string;
  userName: string;
  roleId: string;
  remark: string;
}

export type LoginResponse = ApiEnvelope<LoginData, LoginData>;

export interface CurrentUserData {
  userId: string;
  userName: string;
  name: string;
  roleId: string;
  remark: string;
  [key: string]: unknown;
}

export type CurrentUserResponse = ApiEnvelope<CurrentUserData, unknown>;

export interface UserProfileState {
  name: string;
  email: string;
  phone: string;
}

export interface UserPreferenceState {
  theme: "system" | "light" | "dark" | "executive" | "ocean" | "contrast" | string;
  compact: boolean;
  emailAlerts: boolean;
  tokenAlerts: boolean;
  systemAlerts: boolean;
}

export interface PasswordChangePayload {
  currentPassword: string;
  newPassword: string;
}

export interface RuntimeSchemaError extends Error {
  name: "SchemaValidationError";
}
