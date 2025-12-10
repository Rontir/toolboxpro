'use client';

import { useState, useEffect } from 'react';

export default function DesignToggle() {
    const [design, setDesign] = useState<'classic' | 'glass'>('classic');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        // Load saved design preference
        const savedDesign = localStorage.getItem('toolbox-design') as 'classic' | 'glass' | null;
        if (savedDesign) {
            setDesign(savedDesign);
            document.documentElement.setAttribute('data-design', savedDesign);
        }
    }, []);

    const toggleDesign = () => {
        const newDesign = design === 'classic' ? 'glass' : 'classic';
        setDesign(newDesign);

        // Apply design
        if (newDesign === 'glass') {
            document.documentElement.setAttribute('data-design', 'glass');
        } else {
            document.documentElement.removeAttribute('data-design');
        }

        // Save preference
        localStorage.setItem('toolbox-design', newDesign);
    };

    if (!mounted) return null;

    return (
        <button
            onClick={toggleDesign}
            className="design-toggle-btn"
            title={design === 'classic' ? 'Przełącz na Liquid Glass' : 'Przełącz na Classic'}
        >
            {design === 'classic' ? '💎' : '🎨'}
        </button>
    );
}
