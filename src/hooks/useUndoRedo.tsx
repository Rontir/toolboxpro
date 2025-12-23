'use client';

import { useState, useCallback, useRef } from 'react';

interface StateSnapshot<T> {
    state: T;
    timestamp: number;
    description: string;
}

interface UseUndoRedoOptions {
    maxHistory?: number;
}

/**
 * Generic undo/redo hook for any state
 */
export function useUndoRedo<T>(
    initialState: T,
    options: UseUndoRedoOptions = {}
) {
    const { maxHistory = 50 } = options;

    const [state, setState] = useState<T>(initialState);
    const [undoStack, setUndoStack] = useState<StateSnapshot<T>[]>([]);
    const [redoStack, setRedoStack] = useState<StateSnapshot<T>[]>([]);
    const isUndoRedoRef = useRef(false);

    const pushState = useCallback((newState: T, description: string = 'Change') => {
        if (isUndoRedoRef.current) {
            isUndoRedoRef.current = false;
            return;
        }

        setUndoStack(prev => {
            const newStack = [...prev, { state, timestamp: Date.now(), description }];
            // Limit history size
            if (newStack.length > maxHistory) {
                return newStack.slice(-maxHistory);
            }
            return newStack;
        });
        setRedoStack([]); // Clear redo on new action
        setState(newState);
    }, [state, maxHistory]);

    const undo = useCallback(() => {
        if (undoStack.length === 0) return false;

        const lastState = undoStack[undoStack.length - 1];

        setRedoStack(prev => [...prev, { state, timestamp: Date.now(), description: 'Undo' }]);
        setUndoStack(prev => prev.slice(0, -1));

        isUndoRedoRef.current = true;
        setState(lastState.state);

        return true;
    }, [undoStack, state]);

    const redo = useCallback(() => {
        if (redoStack.length === 0) return false;

        const nextState = redoStack[redoStack.length - 1];

        setUndoStack(prev => [...prev, { state, timestamp: Date.now(), description: 'Redo' }]);
        setRedoStack(prev => prev.slice(0, -1));

        isUndoRedoRef.current = true;
        setState(nextState.state);

        return true;
    }, [redoStack, state]);

    const reset = useCallback((newState: T) => {
        setState(newState);
        setUndoStack([]);
        setRedoStack([]);
    }, []);

    return {
        state,
        setState: pushState,
        undo,
        redo,
        canUndo: undoStack.length > 0,
        canRedo: redoStack.length > 0,
        undoCount: undoStack.length,
        redoCount: redoStack.length,
        reset,
        history: undoStack,
    };
}

/**
 * Keyboard listener for Ctrl+Z / Ctrl+Y
 */
export function useUndoRedoKeyboard(
    onUndo: () => boolean | void,
    onRedo: () => boolean | void,
    enabled: boolean = true
) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!enabled) return;

        // Ignore if in input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            if (e.shiftKey) {
                // Ctrl+Shift+Z = Redo
                e.preventDefault();
                onRedo();
            } else {
                // Ctrl+Z = Undo
                e.preventDefault();
                onUndo();
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            // Ctrl+Y = Redo
            e.preventDefault();
            onRedo();
        }
    }, [onUndo, onRedo, enabled]);

    // Auto-register
    if (typeof window !== 'undefined') {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }
}

/**
 * UndoRedo indicator component
 */
interface UndoRedoButtonsProps {
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    undoCount?: number;
    redoCount?: number;
}

export function UndoRedoButtons({
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    undoCount = 0,
    redoCount = 0
}: UndoRedoButtonsProps) {
    return (
        <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
        }}>
            <button
                onClick={onUndo}
                disabled={!canUndo}
                title={`Cofnij (Ctrl+Z)${undoCount > 0 ? ` - ${undoCount} akcji` : ''}`}
                style={{
                    padding: '0.5rem',
                    background: canUndo ? 'var(--bg-tertiary)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: canUndo ? 'pointer' : 'not-allowed',
                    opacity: canUndo ? 1 : 0.4,
                    fontSize: '1rem',
                    color: 'var(--text-gray)',
                    transition: 'all 0.2s',
                }}
            >
                ↩️
            </button>
            <button
                onClick={onRedo}
                disabled={!canRedo}
                title={`Ponów (Ctrl+Y)${redoCount > 0 ? ` - ${redoCount} akcji` : ''}`}
                style={{
                    padding: '0.5rem',
                    background: canRedo ? 'var(--bg-tertiary)' : 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: canRedo ? 'pointer' : 'not-allowed',
                    opacity: canRedo ? 1 : 0.4,
                    fontSize: '1rem',
                    color: 'var(--text-gray)',
                    transition: 'all 0.2s',
                }}
            >
                ↪️
            </button>
        </div>
    );
}
