'use client';

import { useState, useEffect, useCallback } from 'react';

interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    icon: string;
    target?: string; // CSS selector
    position?: 'top' | 'bottom' | 'left' | 'right';
}

const ONBOARDING_STEPS: OnboardingStep[] = [
    {
        id: 'welcome',
        title: 'Witaj w ToolBox Pro! 🎉',
        description: 'Profesjonalne narzędzia do obróbki e-commerce. Pokażemy Ci podstawy w 30 sekund.',
        icon: '👋',
    },
    {
        id: 'tools',
        title: 'Wybierz narzędzie',
        description: 'Kliknij na dowolne narzędzie z listy po lewej stronie. Każde ma unikalną funkcję.',
        icon: '🧰',
        target: '.tools-list',
        position: 'right',
    },
    {
        id: 'spotlight',
        title: 'Szybki dostęp (Ctrl+K)',
        description: 'Naciśnij Ctrl+K aby otworzyć wyszukiwarkę. Szukaj narzędzi po nazwie.',
        icon: '🔍',
    },
    {
        id: 'shortcuts',
        title: 'Skróty klawiszowe',
        description: 'Ctrl+1 do Ctrl+9 otwiera narzędzia. Ctrl+/ pokazuje wszystkie skróty.',
        icon: '⌨️',
    },
    {
        id: 'history',
        title: 'Historia operacji',
        description: 'Każda operacja jest zapisywana. Możesz pobrać wyniki ponownie z historii.',
        icon: '📜',
    },
    {
        id: 'done',
        title: 'Gotowe! 🚀',
        description: 'Znasz już podstawy. Zacznij pracę! Wróć tutaj klikając ikonę pomocy (?).',
        icon: '✅',
    },
];

const STORAGE_KEY = 'toolbox-onboarding-complete';

/**
 * Hook to manage onboarding state
 */
export function useOnboarding() {
    const [isComplete, setIsComplete] = useState(true); // Default complete to avoid flash
    const [currentStep, setCurrentStep] = useState(0);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if onboarding was completed
        const complete = localStorage.getItem(STORAGE_KEY) === 'true';
        setIsComplete(complete);
        if (!complete) {
            setIsVisible(true);
        }
    }, []);

    const startOnboarding = useCallback(() => {
        setCurrentStep(0);
        setIsVisible(true);
    }, []);

    const nextStep = useCallback(() => {
        if (currentStep < ONBOARDING_STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            completeOnboarding();
        }
    }, [currentStep]);

    const prevStep = useCallback(() => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    }, [currentStep]);

    const skipOnboarding = useCallback(() => {
        completeOnboarding();
    }, []);

    const completeOnboarding = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setIsComplete(true);
        setIsVisible(false);
    }, []);

    const resetOnboarding = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setIsComplete(false);
        setCurrentStep(0);
        setIsVisible(true);
    }, []);

    return {
        isComplete,
        isVisible,
        currentStep,
        totalSteps: ONBOARDING_STEPS.length,
        step: ONBOARDING_STEPS[currentStep],
        startOnboarding,
        nextStep,
        prevStep,
        skipOnboarding,
        resetOnboarding,
    };
}

/**
 * Onboarding Modal Component
 */
export function OnboardingModal() {
    const {
        isVisible,
        currentStep,
        totalSteps,
        step,
        nextStep,
        prevStep,
        skipOnboarding
    } = useOnboarding();

    if (!isVisible || !step) return null;

    const isFirst = currentStep === 0;
    const isLast = currentStep === totalSteps - 1;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(12px)',
                zIndex: 10001,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'fadeIn 0.3s ease',
            }}
        >
            <div
                style={{
                    background: 'var(--bg-card)',
                    borderRadius: '24px',
                    padding: '2.5rem',
                    width: '100%',
                    maxWidth: '480px',
                    border: '1px solid var(--border)',
                    boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                    textAlign: 'center',
                    animation: 'scaleIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
            >
                {/* Icon */}
                <div style={{
                    fontSize: '4rem',
                    marginBottom: '1.5rem',
                    animation: 'bounce 0.6s ease',
                }}>
                    {step.icon}
                </div>

                {/* Title */}
                <h2 style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: 'var(--text-white)',
                    marginBottom: '1rem',
                }}>
                    {step.title}
                </h2>

                {/* Description */}
                <p style={{
                    fontSize: '1rem',
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                    marginBottom: '2rem',
                }}>
                    {step.description}
                </p>

                {/* Progress */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '2rem',
                }}>
                    {Array.from({ length: totalSteps }).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                width: i === currentStep ? '24px' : '8px',
                                height: '8px',
                                borderRadius: '4px',
                                background: i === currentStep ? 'var(--accent)' : 'var(--bg-tertiary)',
                                transition: 'all 0.3s ease',
                            }}
                        />
                    ))}
                </div>

                {/* Buttons */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'center',
                }}>
                    {!isFirst && (
                        <button
                            onClick={prevStep}
                            style={{
                                padding: '0.75rem 1.5rem',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: '12px',
                                color: 'var(--text-gray)',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                            }}
                        >
                            ← Wstecz
                        </button>
                    )}

                    <button
                        onClick={nextStep}
                        style={{
                            padding: '0.75rem 2rem',
                            background: 'var(--accent)',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: '0 4px 20px var(--accent-glow)',
                        }}
                    >
                        {isLast ? '🎉 Zaczynajmy!' : 'Dalej →'}
                    </button>
                </div>

                {/* Skip link */}
                {!isLast && (
                    <button
                        onClick={skipOnboarding}
                        style={{
                            marginTop: '1.5rem',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            opacity: 0.7,
                        }}
                    >
                        Pomiń przewodnik
                    </button>
                )}
            </div>
        </div>
    );
}

/**
 * Small help button to restart onboarding
 */
export function OnboardingTrigger() {
    const { startOnboarding, isComplete } = useOnboarding();

    if (!isComplete) return null;

    return (
        <button
            onClick={startOnboarding}
            title="Pokaż przewodnik"
            style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.25rem',
                opacity: 0.6,
                transition: 'opacity 0.2s',
                padding: '0.25rem',
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = '1'}
            onMouseOut={(e) => e.currentTarget.style.opacity = '0.6'}
        >
            ❓
        </button>
    );
}
