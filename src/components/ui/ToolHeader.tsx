'use client';

interface ToolHeaderProps {
    title: string;
    description: string;
    icon?: string;
    className?: string;
}

export function ToolHeader({ title, description, icon, className = '' }: ToolHeaderProps) {
    return (
        <div className={`flex flex-col gap-2 mb-6 ${className}`}>
            <div className="flex items-center gap-3">
                {icon && <span className="text-3xl">{icon}</span>}
                <h1 className="text-2xl font-bold text-text-white">{title}</h1>
            </div>
            <p className="text-text-muted text-sm max-w-2xl leading-relaxed">
                {description}
            </p>
        </div>
    );
}
