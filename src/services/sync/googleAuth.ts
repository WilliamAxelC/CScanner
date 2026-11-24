import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const LEGACY_TOKEN_STORAGE_KEY = 'cscanner_google_token_v1';

export interface StoredGoogleToken {
  accessToken: string;
  expiresAt: number;
  email?: string;
}

// Store OAuth bearer tokens strictly in volatile process memory (never localStorage on shared web origins).
const memoryTokenHolder: { current: StoredGoogleToken | null } = {
  current: null,
};

function clearLegacyWebToken(): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage access issues
    }
  }
}

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
  clearLegacyWebToken();
  if (memoryTokenHolder.current) {
    if (memoryTokenHolder.current.expiresAt > Date.now() + 15_000) {
      return memoryTokenHolder.current;
    }
    memoryTokenHolder.current = null;
  }
  return null;
}

export function saveStoredToken(token: StoredGoogleToken | null): void {
  clearLegacyWebToken();
  memoryTokenHolder.current = token;
}

export async function revokeGoogleToken(accessToken: string): Promise<void> {
  if (!accessToken) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(accessToken)}`,
    });
  } catch {
    // Best-effort offline-safe revocation
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
        'Google OAuth Client ID is not configured in this build.',
      );
    }
    return promptAsync();
  };

  const signOut = () => {
    const existing = memoryTokenHolder.current?.accessToken;
    saveStoredToken(null);
    setToken(null);
    if (existing) {
      void revokeGoogleToken(existing);
    }
  };

  return {
    configured,
    requestReady: Boolean(request) && configured,
    token,
    signIn,
    signOut,
  };
}
