import { jwtDecode } from "jwt-decode";

interface JwtUserPayload {
  exp?: number;
  user?: {
    email?: string;
    name?: string;
    id?: string | number;
    isInhouseEditer?: number;
    isInhouseEditor?: number;
  };
}

export function isAccessTokenExpired(accessToken: string): boolean {
  try {
    const d = jwtDecode<JwtUserPayload>(accessToken);
    if (d.exp == null) return true;
    return Date.now() >= d.exp * 1000;
  } catch {
    return true;
  }
}
