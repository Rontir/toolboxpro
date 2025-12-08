'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface DroppedFile {
    file: File;
    timestamp: number;
}

interface DroppedFileContextType {
    droppedFile: DroppedFile | null;
    setDroppedFile: (file: File | null) => void;
    clearDroppedFile: () => void;
    consumeDroppedFile: () => File | null;
}

const DroppedFileContext = createContext<DroppedFileContextType | null>(null);

export function DroppedFileProvider({ children }: { children: ReactNode }) {
    const [droppedFile, setDroppedFileState] = useState<DroppedFile | null>(null);

    const setDroppedFile = (file: File | null) => {
        if (file) {
            setDroppedFileState({ file, timestamp: Date.now() });
        } else {
            setDroppedFileState(null);
        }
    };

    const clearDroppedFile = () => {
        setDroppedFileState(null);
    };

    const consumeDroppedFile = () => {
        if (droppedFile) {
            const file = droppedFile.file;
            setDroppedFileState(null);
            return file;
        }
        return null;
    };

    return (
        <DroppedFileContext.Provider value={{ droppedFile, setDroppedFile, clearDroppedFile, consumeDroppedFile }}>
            {children}
        </DroppedFileContext.Provider>
    );
}

export function useDroppedFile() {
    const context = useContext(DroppedFileContext);
    if (!context) {
        throw new Error('useDroppedFile must be used within DroppedFileProvider');
    }
    return context;
}
