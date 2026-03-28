'use client';

import { apiUrl } from '@/lib/config';
import { getAccessToken } from '@/lib/authStorage';

/**
 * Hook for logging user activity.
 * Works for both authenticated and anonymous users.
 */
export function useActivityLog() {
    const logActivity = async (action: string, details?: string) => {
        try {
            await fetch(apiUrl('/api/log-activity'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAccessToken() || ''}`
                },
                body: JSON.stringify({ action, details })
            });
        } catch (e) {
            // Silent fail - logging should not block main functionality
            console.debug('Activity log failed:', e);
        }
    };

    return { logActivity };
}

/**
 * Log tool usage. Call this when a user opens/uses a tool.
 */
export function logToolUse(toolId: string) {
    fetch(apiUrl('/api/log-activity'), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getAccessToken() || ''}`
        },
        body: JSON.stringify({ action: 'tool_use', details: toolId })
    }).catch(() => { });
}
