'use client';

const ACCESS_TOKEN_KEY = 'toolboxpro_access_token';
const REFRESH_TOKEN_KEY = 'toolboxpro_refresh_token';

function migrateLegacyToken(storageKey: string): string | null {
    const sessionValue = sessionStorage.getItem(storageKey);
    if (sessionValue) {
        return sessionValue;
    }

    const legacyValue = localStorage.getItem(storageKey);
    if (legacyValue) {
        sessionStorage.setItem(storageKey, legacyValue);
        localStorage.removeItem(storageKey);
        return legacyValue;
    }

    return null;
}

export interface StoredAuthTokens {
    access_token: string;
    refresh_token: string;
}

export function saveAuthTokens(tokens: StoredAuthTokens): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearAuthTokens(): void {
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function getAccessToken(): string | null {
    return migrateLegacyToken(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    return migrateLegacyToken(REFRESH_TOKEN_KEY);
}
