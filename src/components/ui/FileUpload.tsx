'use client';

import { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
    onFileSelect?: (file: File) => void;
    onFilesSelect?: (files: File[]) => void;
    accept?: string;
    label?: string;
    sublabel?: string;
    icon?: string;
    isLoading?: boolean;
    loadingText?: string;
    progress?: number;
    className?: string;
    multiple?: boolean;
    directory?: boolean;
}

export function FileUpload({
    onFileSelect,
    onFilesSelect,
    accept = '*/*',
    label = 'Wybierz plik',
    sublabel = 'lub przeciągnij i upuść tutaj',
    icon = '📁',
    isLoading = false,
    loadingText = 'Przetwarzanie...',
    progress = 0,
    className = '',
    multiple = false,
    ...props
}: FileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files?.length) {
            const files = Array.from(e.dataTransfer.files);
            if (multiple && onFilesSelect) {
                onFilesSelect(files);
            } else if (onFileSelect) {
                onFileSelect(files[0]);
            }
        }
    }, [onFileSelect, onFilesSelect, multiple]);

    const handleClick = () => {
        if (!isLoading) {
            inputRef.current?.click();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.length) {
            const files = Array.from(e.target.files);
            if (multiple && onFilesSelect) {
                onFilesSelect(files);
            } else if (onFileSelect) {
                onFileSelect(files[0]);
            }
        }
    };

    return (
        <div
            className={`upload-zone ${isDragging ? 'dragging' : ''} ${className}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
            style={{
                position: 'relative',
                cursor: isLoading ? 'wait' : 'pointer',
                borderColor: isDragging ? 'var(--accent)' : undefined,
                backgroundColor: isDragging ? 'rgba(var(--accent-rgb, 34, 197, 94), 0.05)' : undefined
            }}
        >
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple={multiple}
                className="hidden"
                style={{ display: 'none' }}
                onChange={handleChange}
                disabled={isLoading}
            />

            {isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3">
                    <div className="spinner"></div>
                    <p className="text-sm font-medium text-accent">{loadingText}</p>
                    {progress > 0 && (
                        <div className="w-full max-w-[200px] h-1.5 bg-bg-tertiary rounded-full overflow-hidden mt-2">
                            <div
                                className="h-full bg-accent transition-all duration-300"
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <>
                    <span className="icon text-4xl mb-2 block transition-transform duration-300 group-hover:scale-110">{icon}</span>
                    <p className="title text-lg font-semibold mb-1">{label}</p>
                    <p className="subtitle text-sm text-text-muted">{sublabel}</p>
                </>
            )}
        </div>
    );
}
