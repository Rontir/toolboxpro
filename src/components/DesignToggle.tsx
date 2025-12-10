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
        console.log('Design toggled to:', newDesign);
        setDesign(newDesign);

        // Apply design directly to document
        if (typeof window !== 'undefined') {
            if (newDesign === 'glass') {
                document.documentElement.setAttribute('data-design', 'glass');
                console.log('Set data-design to glass');
            } else {
                document.documentElement.removeAttribute('data-design');
                console.log('Removed data-design');
            }

            // Verify it was set
            const currentValue = document.documentElement.getAttribute('data-design');
            console.log('Current data-design value:', currentValue);
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
