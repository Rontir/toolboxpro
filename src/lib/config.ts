/**
 * Application configuration helper
 * Centralized access to environment variables with type safety
 */

export const config = {
    // API Configuration
    api: {
        baseUrl: process.env.NEXT_PUBLIC_API_URL ||
            (process.env.NODE_ENV === 'production'
                ? 'https://toolboxpro-api.onrender.com'
                : 'http://localhost:8000'),
        healthEndpoint: '/api/health',
        timeout: 30000, // 30 seconds
    },

    // App Info
    app: {
        name: process.env.NEXT_PUBLIC_APP_NAME || 'ToolBox Pro',
        version: process.env.NEXT_PUBLIC_APP_VERSION || '2.0.0',
    },

    // Feature Flags
    features: {
        analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
        pwa: process.env.NEXT_PUBLIC_ENABLE_PWA !== 'false', // default true
    },

    // UI Settings
    ui: {
        sidebarWidth: 280,
        animationDuration: 300,
        toastDuration: 3000,
    },
} as const;

// Helper to build full API URL
export function apiUrl(endpoint: string): string {
    const base = config.api.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${base}${path}`;
}

export default config;
