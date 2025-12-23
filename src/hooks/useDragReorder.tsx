'use client';

import { useState, useRef, useCallback } from 'react';

interface DraggableItem {
    id: string;
    [key: string]: unknown;
}

interface UseDragReorderOptions<T> {
    items: T[];
    onReorder: (items: T[]) => void;
}

/**
 * Hook to handle drag & drop reordering
 */
export function useDragReorder<T extends DraggableItem>({
    items,
    onReorder
}: UseDragReorderOptions<T>) {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dragOverId, setDragOverId] = useState<string | null>(null);
    const dragNodeRef = useRef<HTMLElement | null>(null);

    const handleDragStart = useCallback((e: React.DragEvent, item: T) => {
        setDraggedId(item.id);
        dragNodeRef.current = e.currentTarget as HTMLElement;

        // Set drag image (phantom)
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);

        // Add dragging class after a tiny delay (for phantom image)
        setTimeout(() => {
            if (dragNodeRef.current) {
                dragNodeRef.current.style.opacity = '0.5';
            }
        }, 0);
    }, []);

    const handleDragEnd = useCallback(() => {
        if (dragNodeRef.current) {
            dragNodeRef.current.style.opacity = '1';
        }
        setDraggedId(null);
        setDragOverId(null);
        dragNodeRef.current = null;
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, item: T) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedId && item.id !== draggedId) {
            setDragOverId(item.id);
        }
    }, [draggedId]);

    const handleDrop = useCallback((e: React.DragEvent, targetItem: T) => {
        e.preventDefault();

        if (!draggedId || draggedId === targetItem.id) return;

        const draggedIndex = items.findIndex(i => i.id === draggedId);
        const targetIndex = items.findIndex(i => i.id === targetItem.id);

        if (draggedIndex === -1 || targetIndex === -1) return;

        const newItems = [...items];
        const [removed] = newItems.splice(draggedIndex, 1);
        newItems.splice(targetIndex, 0, removed);

        onReorder(newItems);
        setDragOverId(null);
    }, [draggedId, items, onReorder]);

    const handleDragLeave = useCallback(() => {
        setDragOverId(null);
    }, []);

    const getDragHandleProps = useCallback((item: T) => ({
        draggable: true,
        onDragStart: (e: React.DragEvent) => handleDragStart(e, item),
        onDragEnd: handleDragEnd,
        onDragOver: (e: React.DragEvent) => handleDragOver(e, item),
        onDrop: (e: React.DragEvent) => handleDrop(e, item),
        onDragLeave: handleDragLeave,
    }), [handleDragStart, handleDragEnd, handleDragOver, handleDrop, handleDragLeave]);

    const getItemStyle = useCallback((item: T) => ({
        opacity: draggedId === item.id ? 0.5 : 1,
        transform: dragOverId === item.id ? 'translateY(4px)' : 'translateY(0)',
        transition: 'transform 0.2s ease',
        borderTop: dragOverId === item.id ? '2px solid var(--accent)' : 'none',
    }), [draggedId, dragOverId]);

    return {
        draggedId,
        dragOverId,
        getDragHandleProps,
        getItemStyle,
    };
}

/**
 * Drag handle icon component
 */
export function DragHandle({ style }: { style?: React.CSSProperties }) {
    return (
        <div
            style={{
                cursor: 'grab',
                padding: '0.25rem',
                color: 'var(--text-muted)',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                ...style,
            }}
            title="Przeciągnij aby zmienić kolejność"
        >
            ⠿
        </div>
    );
}

/**
 * Example draggable list wrapper
 */
interface DraggableListProps<T extends DraggableItem> {
    items: T[];
    onReorder: (items: T[]) => void;
    renderItem: (item: T, dragHandleProps: ReturnType<typeof useDragReorder>['getDragHandleProps'] extends (item: T) => infer R ? R : never, style: React.CSSProperties) => React.ReactNode;
}

export function DraggableList<T extends DraggableItem>({
    items,
    onReorder,
    renderItem
}: DraggableListProps<T>) {
    const { getDragHandleProps, getItemStyle } = useDragReorder({ items, onReorder });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {items.map(item => (
                <div key={item.id}>
                    {renderItem(item, getDragHandleProps(item), getItemStyle(item))}
                </div>
            ))}
        </div>
    );
}
