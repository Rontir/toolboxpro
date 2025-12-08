'use client';

import { useI18n } from '@/components/I18n';

interface BreadcrumbItem {
    icon: string;
    name: string;
    onClick?: () => void;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
    const { t } = useI18n();

    if (items.length <= 1) return null;

    return (
        <nav
            className="breadcrumbs"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-tertiary)',
                borderRadius: '10px',
                marginBottom: '1rem',
                fontSize: '0.875rem',
                flexWrap: 'wrap',
            }}
        >
            {items.map((item, index) => (
                <span key={index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {index > 0 && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>›</span>
                    )}
                    <span
                        onClick={item.onClick}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            cursor: item.onClick ? 'pointer' : 'default',
                            color: index === items.length - 1 ? 'var(--text-white)' : 'var(--text-muted)',
                            fontWeight: index === items.length - 1 ? 600 : 400,
                            transition: 'color 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            if (item.onClick) {
                                e.currentTarget.style.color = 'var(--accent)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.color = index === items.length - 1 ? 'var(--text-white)' : 'var(--text-muted)';
                        }}
                    >
                        <span>{item.icon}</span>
                        <span>{item.name}</span>
                    </span>
                </span>
            ))}
        </nav>
    );
}
