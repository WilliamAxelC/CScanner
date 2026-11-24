import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_STORAGE_KEY = 'cscanner_google_token_v1';

export interface StoredGoogleToken {
  accessToken: string;
  expiresAt: number;
  email?: string;
}

const memoryTokenHolder: { current: StoredGoogleToken | null } = {
  current: null,
};

export function getGoogleClientConfig(): {
  webClientId?: string;
  androidClientId?: string;
} {
  return {
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined,
    androidClientId:
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined,
  };
}

export function isGoogleOAuthConfigured(): boolean {
  const cfg = getGoogleClientConfig();
  if (Platform.OS === 'web') return Boolean(cfg.webClientId);
  if (Platform.OS === 'android') return Boolean(cfg.androidClientId);
  return Boolean(cfg.webClientId || cfg.androidClientId);
}

export function loadStoredToken(): StoredGoogleToken | null {
  if (memoryTokenHolder.current) {
    if (memoryTokenHolder.current.expiresAt > Date.now() + 15_000) {
      return memoryTokenHolder.current;
    }
    memoryTokenHolder.current = null;
  }
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredGoogleToken;
      if (parsed.expiresAt > Date.now() + 15_000) {
        memoryTokenHolder.current = parsed;
        return parsed;
      }
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export function saveStoredToken(token: StoredGoogleToken | null): void {
  memoryTokenHolder.current = token;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      if (token) {
        localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    } catch {
      // ignore storage quota
    }
  }
}

export async function fetchGoogleUserEmail(
  accessToken: string,
): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { email?: string };
    return data.email;
  } catch {
    return undefined;
  }
}

export function useGoogleDriveAuth() {
  const cfg = getGoogleClientConfig();
  const configured = isGoogleOAuthConfigured();
  const [token, setToken] = useState<StoredGoogleToken | null>(() =>
    loadStoredToken(),
  );

  // expo-auth-session requires non-empty client IDs on web if mounted unconditionally; pass harmless fallback when unconfigured
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: cfg.webClientId || 'unconfigured-web-client-id',
    androidClientId: cfg.androidClientId || 'unconfigured-android-client-id',
    scopes: [DRIVE_FILE_SCOPE, 'email'],
  });

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.accessToken) {
      const auth = response.authentication;
      const expiresIn = auth.expiresIn ?? 3600;
      const next: StoredGoogleToken = {
        accessToken: auth.accessToken,
        expiresAt: Date.now() + expiresIn * 1000,
      };
      saveStoredToken(next);
      setToken(next);
      fetchGoogleUserEmail(auth.accessToken).then((email) => {
        if (email) {
          const withEmail = { ...next, email };
          saveStoredToken(withEmail);
          setToken(withEmail);
        }
      });
    }
  }, [response]);

  const signIn = async () => {
    if (!configured) {
      throw new Error(
        'Google OAuth Client ID is not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID / EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID in .env.',
      );
    }
    return promptAsync();
  };

  const signOut = () => {
    saveStoredToken(null);
    setToken(null);
  };

  return {
    configured,
    requestReady: Boolean(request) && configured,
    token,
    signIn,
    signOut,
  };
}
