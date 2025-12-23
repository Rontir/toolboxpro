'use client';

import { ReactNode } from 'react';

interface SectionProps {
    title?: string;
    children: ReactNode;
    actions?: ReactNode;
    className?: string;
    noPadding?: boolean;
}

export function Section({
    title,
    children,
    actions,
    className = '',
    noPadding = false
}: SectionProps) {
    return (
        <div className={`card ${className}`}>
            {(title || actions) && (
                <div className="card-header">
                    <span className="flex items-center gap-2">{title}</span>
                    {actions && <div className="flex items-center gap-2">{actions}</div>}
                </div>
            )}
            <div className={noPadding ? '' : 'card-body'}>
                {children}
            </div>
        </div>
    );
}
