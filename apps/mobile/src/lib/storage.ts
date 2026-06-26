import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'zuri_auth_token';
const USER_ID_KEY = 'zuri_user_id';

export const storage = {
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async setToken(token: string): Promise<void> {
    return SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clearToken(): Promise<void> {
    return SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  async getUserId(): Promise<string | null> {
    return SecureStore.getItemAsync(USER_ID_KEY);
  },
  async setUserId(id: string): Promise<void> {
    return SecureStore.setItemAsync(USER_ID_KEY, id);
  },
};
