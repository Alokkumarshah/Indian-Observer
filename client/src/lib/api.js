import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

export const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
});

export const setAuthHeader = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

export const getPublishedNews = () => api.get('/news');
export const getNewsById = (id) => api.get(`/news/${id}`);
export const getTrendingNews = () => api.get('/trending');
export const getTrendingStatus = () => api.get('/trending/status');
export const refreshTrending = () => api.post('/trending/refresh');
export const getDrafts = () => api.get('/news/drafts');
export const publishNews = (id) => api.patch(`/news/${id}/publish`);
export const deleteNews = (id) => api.delete(`/news/${id}`);
export const addComment = (id, text) => api.post(`/news/${id}/comments`, { text });
export const generateNews = (payload) => api.post('/news/generate', payload);
export const login = (payload) => api.post('/auth/login', payload);
export const register = (payload) => api.post('/auth/register', payload);
export const fetchProfile = () => api.get('/auth/me');

