'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { apiUrl } from '@/lib/config';

// Types
interface User {
    id: number;
    email: string;
    display_name: string | null;
    role: 'guest' | 'user' | 'premium' | 'admin' | 'owner';
    is_active: boolean;
    tool_permissions: string[];
}

interface AuthTokens {
    access_token: string;
    refresh_token: string;
    token_type: string;
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (email: string, password: string) => Promise<void>;
    register: (email: string, password: string, displayName?: string) => Promise<void>;
    logout: () => void;
    hasToolAccess: (toolId: string) => boolean;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Restricted tools that require special permissions
const RESTRICTED_TOOLS = ['piko_empiko', 'structure_matcher'];

// Storage keys
const ACCESS_TOKEN_KEY = 'toolboxpro_access_token';
const REFRESH_TOKEN_KEY = 'toolboxpro_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Save tokens to localStorage
    const saveTokens = (tokens: AuthTokens) => {
        localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    };

    // Clear tokens
    const clearTokens = () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
    };

    // Get access token
    const getAccessToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);
    const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

    // Fetch current user
    const fetchUser = useCallback(async () => {
        const token = getAccessToken();
        if (!token) {
            setUser(null);
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(apiUrl('/api/auth/me'), {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const userData = await res.json();
                setUser(userData);
            } else if (res.status === 401) {
                // Token expired, try refresh
                await refreshTokens();
            } else {
                clearTokens();
                setUser(null);
            }
        } catch (error) {
            console.error('Failed to fetch user:', error);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Refresh tokens
    const refreshTokens = async () => {
        const refreshToken = getRefreshToken();
        if (!refreshToken) {
            clearTokens();
            setUser(null);
            return;
        }

        try {
            const res = await fetch(apiUrl('/api/auth/refresh'), {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${refreshToken}` }
            });

            if (res.ok) {
                const tokens: AuthTokens = await res.json();
                saveTokens(tokens);
                await fetchUser();
            } else {
                clearTokens();
                setUser(null);
            }
        } catch (error) {
            console.error('Failed to refresh tokens:', error);
            clearTokens();
            setUser(null);
        }
    };

    // Login
    const login = async (email: string, password: string) => {
        const res = await fetch(apiUrl('/api/auth/login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Login failed');
        }

        const tokens: AuthTokens = await res.json();
        saveTokens(tokens);
        await fetchUser();
    };

    // Register
    const register = async (email: string, password: string, displayName?: string) => {
        const res = await fetch(apiUrl('/api/auth/register'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, display_name: displayName })
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.detail || 'Registration failed');
        }

        const tokens: AuthTokens = await res.json();
        saveTokens(tokens);
        await fetchUser();
    };

    // Logout
    const logout = () => {
        clearTokens();
        setUser(null);
    };

    // Check tool access
    const hasToolAccess = (toolId: string): boolean => {
        // Non-restricted tools are accessible to everyone
        if (!RESTRICTED_TOOLS.includes(toolId)) {
            return true;
        }

        // Not logged in = no access to restricted tools
        if (!user) {
            return false;
        }

        // Admin, Owner and premium have access to everything
        if (user.role === 'admin' || user.role === 'owner' || user.role === 'premium') {
            return true;
        }

        // Check explicit permissions
        return user.tool_permissions.includes(toolId);
    };

    // Refresh user data
    const refreshUser = async () => {
        await fetchUser();
    };

    // Check auth on mount
    useEffect(() => {
        fetchUser();
    }, [fetchUser]);

    // Auto-refresh tokens every 10 minutes
    useEffect(() => {
        const interval = setInterval(() => {
            if (getAccessToken()) {
                refreshTokens();
            }
        }, 10 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            isLoading,
            isAuthenticated: !!user,
            login,
            register,
            logout,
            hasToolAccess,
            refreshUser
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export { RESTRICTED_TOOLS };
