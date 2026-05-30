import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = 'http://104.251.216.253:3002/api/app';

const api = axios.create({ baseURL: BASE_URL, timeout: 10000 });

let _onUnauthorized = null;
export function setOnUnauthorized(fn) { _onUnauthorized = fn; }

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      await AsyncStorage.multiRemove(['token', 'funcionario', 'push_token']);
      _onUnauthorized?.();
    }
    return Promise.reject(error);
  }
);

export default api;
