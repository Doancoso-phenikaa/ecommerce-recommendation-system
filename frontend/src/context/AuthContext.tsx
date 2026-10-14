import {
  createContext,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser, LoginResponse } from '../types/auth';
import { AUTH_STORAGE_KEYS } from '../utils/auth-storage';

export interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (data: LoginResponse) => void;
  logout: () => void;
}

function restoreUser(): AuthUser | null {
  const storedUser = localStorage.getItem(AUTH_STORAGE_KEYS.user);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser) as AuthUser;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEYS.user);
    return null;
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(restoreUser);
  const [accessToken, setAccessToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_STORAGE_KEYS.accessToken),
  );
  const [refreshToken, setRefreshToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_STORAGE_KEYS.refreshToken),
  );

  const login = useCallback((data: LoginResponse) => {
    localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(data.user));
    localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, data.accessToken);
    localStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, data.refreshToken);

    setUser(data.user);
    setAccessToken(data.accessToken);
    setRefreshToken(data.refreshToken);
  }, []);

  const logout = useCallback(() => {
    Object.values(AUTH_STORAGE_KEYS).forEach((key) => {
      localStorage.removeItem(key);
    });

    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      refreshToken,
      isAuthenticated: Boolean(user && accessToken),
      login,
      logout,
    }),
    [accessToken, login, logout, refreshToken, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
