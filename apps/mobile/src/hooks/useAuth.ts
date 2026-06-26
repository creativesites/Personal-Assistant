import { useState, useEffect, createContext, useContext } from 'react';
import { api } from '../lib/api';
import { storage } from '../lib/storage';

interface AuthState {
  token: string | null;
  userId: string | null;
  loading: boolean;
}

interface AuthContext extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContext>({
  token: null,
  userId: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthProvider(): AuthContext {
  const [state, setState] = useState<AuthState>({ token: null, userId: null, loading: true });

  useEffect(() => {
    storage.getToken().then(async (token) => {
      const userId = token ? await storage.getUserId() : null;
      setState({ token, userId, loading: false });
    });
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    await storage.setToken(token);
    await storage.setUserId(user.id);
    setState({ token, userId: user.id, loading: false });
  };

  const logout = async () => {
    await storage.clearToken();
    setState({ token: null, userId: null, loading: false });
  };

  return { ...state, login, logout };
}
