'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchProfile, login as loginApi, register as registerApi, setAuthHeader } from '@/lib/api';

const TOKEN_KEY = 'news_token';

const useAuth = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthHeader(token);

    try {
      const { data } = await fetchProfile();
      setUser(data.user);
    } catch (error) {
      localStorage.removeItem(TOKEN_KEY);
      setAuthHeader(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const login = async (credentials) => {
    const { data } = await loginApi(credentials);
    localStorage.setItem(TOKEN_KEY, data.token);
    setAuthHeader(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    const { data } = await registerApi(payload);
    localStorage.setItem(TOKEN_KEY, data.token);
    setAuthHeader(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setAuthHeader(null);
    setUser(null);
  };

  return { user, loading, login, register, logout };
};

export default useAuth;

