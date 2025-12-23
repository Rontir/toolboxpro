'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { ToastProvider } from '@/components/Toast';
import { HistoryProvider, HistoryPanel } from '@/components/History';
import { FavoritesProvider, useFavorites } from '@/components/Favorites';
import { StatsProvider, StatsPanel } from '@/components/Stats';
import { QueueProvider, QueuePanel } from '@/components/Queue';
import { useKeyboardShortcuts, KeyboardShortcutsPanel } from '@/components/KeyboardShortcuts';
import { Tooltip } from '@/components/Tooltip';

// Dynamically import tools
const PikoEmpiko = dynamic(() => import('@/components/tools/PikoEmpiko'), { ssr: false });
const ImageConverter = dynamic(() => import('@/components/tools/ImageConverter'), { ssr: false });
const ProductCropper = dynamic(() => import('@/components/tools/ProductCropper'), { ssr: false });
const ExcelSplitter = dynamic(() => import('@/components/tools/ExcelSplitter'), { ssr: false });
const HtmlFixer = dynamic(() => import('@/components/tools/HtmlFixer'), { ssr: false });
const EanChecker = dynamic(() => import('@/components/tools/EanChecker'), { ssr: false });
const PerfumyHelper = dynamic(() => import('@/components/tools/PerfumyHelper'), { ssr: false });
const JsonToHtml = dynamic(() => import('@/components/tools/JsonToHtml'), { ssr: false });
const OpisToHtml = dynamic(() => import('@/components/tools/OpisToHtml'), { ssr: false });
const StrukturMatcher = dynamic(() => import('@/components/tools/StrukturMatcher'), { ssr: false });
const ExcelCompare = dynamic(() => import('@/components/tools/ExcelCompare'), { ssr: false });
const DataJoiner = dynamic(() => import('@/components/tools/DataJoiner'), { ssr: false });
const DescriptionTranslator = dynamic(() => import('@/components/tools/DescriptionTranslator'), { ssr: false });
const EmojiRemover = dynamic(() => import('@/components/tools/EmojiRemover'), { ssr: false });

import { ThemeToggle } from '@/components/Theme';
import { ThemeCustomizer } from '@/components/ThemeCustomizer';
import { GlobalDragDrop } from '@/components/GlobalDragDrop';
import { GlobalMouseTracker } from '@/components/GlobalMouseTracker';
import { Dashboard } from '@/components/Dashboard';
import { DroppedFileProvider } from '@/components/DroppedFileContext';
import { I18nProvider, LanguageSwitcher } from '@/components/I18n';
import { NotificationsProvider, NotificationBell, NotificationsPanel } from '@/components/Notifications';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import BatchRenamer from '@/components/tools/BatchRenamer';
import BatchProcessor from '@/components/tools/BatchProcessor';
import PriceCalculator from '@/components/tools/PriceCalculator';
import SeoMetaGenerator from '@/components/tools/SeoMetaGenerator';
import DesignToggle from '@/components/DesignToggle';
import { BackendStatusIndicator } from '@/hooks/useBackendStatus';
import { PresetsProvider } from '@/components/BatchPresets';
import { OnboardingModal, OnboardingTrigger } from '@/components/Onboarding';
import { SettingsExportImportPanel } from '@/components/SettingsExportImport';

type ToolId = 'dashboard' | 'piko-empiko' | 'image-converter' | 'excel-splitter' | 'html-fixer' | 'ean-checker' | 'json-html' | 'desc-html' | 'perfume' | 'cropper' | 'struktur' | 'compare' | 'joiner' | 'translator' | 'emoji-remover' | 'batch-renamer' | 'batch-processor' | 'price-calc' | 'seo-meta';

interface Tool {
  id: ToolId;
  icon: string;
  name: string;
  desc: string;
  badge?: 'Python' | 'JS';
}

const TOOLS: Tool[] = [
  { id: 'dashboard', icon: '🏠', name: 'Pulpit', desc: 'Centrum dowodzenia' },
  { id: 'image-converter', icon: '🖼️', name: 'Konwerter Obrazów', desc: 'PNG, JPG, WEBP, GIF', badge: 'JS' },
  { id: 'cropper', icon: '✂️', name: 'Kadrowanie', desc: 'Allegro, Shopify', badge: 'JS' },
  { id: 'excel-splitter', icon: '📊', name: 'Excel Splitter', desc: 'Dziel i łącz', badge: 'JS' },
  { id: 'html-fixer', icon: '📝', name: 'HTML Fixer', desc: 'Czyść kod', badge: 'JS' },
  { id: 'ean-checker', icon: '🔍', name: 'EAN Checker', desc: 'Walidacja kodów', badge: 'Python' },
  { id: 'piko-empiko', icon: '☁️', name: 'PikoEmpiko', desc: 'Cloud upload', badge: 'Python' },
  { id: 'perfume', icon: '🧴', name: 'Perfumy Helper', desc: 'Zestawy perfum', badge: 'Python' },
  { id: 'json-html', icon: '🔄', name: 'JSON → HTML', desc: 'Konwersja' },
  { id: 'desc-html', icon: '📄', name: 'Opis → HTML', desc: 'Generator' },
  { id: 'struktur', icon: '🧩', name: 'Dopasowywacz', desc: 'Struktur', badge: 'Python' },
  { id: 'compare', icon: '🔀', name: 'Porównywarka', desc: 'Znajdź różnice', badge: 'JS' },
  { id: 'joiner', icon: '🔗', name: 'Łącznik danych', desc: 'VLOOKUP', badge: 'JS' },
  { id: 'translator', icon: '🌍', name: 'Tłumacz', desc: 'Opisy produktów', badge: 'JS' },
  { id: 'emoji-remover', icon: '🧹', name: 'Usuń emotki', desc: 'Z opisów/tytułów', badge: 'JS' },
  { id: 'batch-renamer', icon: '✏️', name: 'Batch Renamer', desc: 'Zmień nazwy plików', badge: 'JS' },
  { id: 'batch-processor', icon: '⚡', name: 'Batch Processor', desc: 'Pipeline operacji', badge: 'JS' },
  { id: 'price-calc', icon: '💰', name: 'Kalkulator cen', desc: 'Marża, VAT, rabaty', badge: 'JS' },
  { id: 'seo-meta', icon: '🎯', name: 'SEO Generator', desc: 'Meta tagi, Schema', badge: 'JS' },
];

function Placeholder({ name }: { name: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '400px',
      flexDirection: 'column',
      gap: '16px'
    }}>
      <span style={{ fontSize: '64px' }}>🚧</span>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-gray)' }}>{name}</h2>
      <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>W trakcie implementacji...</p>
    </div>
  );
}

interface SidebarContentProps {
  sidebarOpen: boolean;
  activeTool: ToolId;
  filteredTools: Tool[];
  handleToolClick: (toolId: ToolId) => void;
  allTools: Tool[];
}

function SidebarContent({ sidebarOpen, activeTool, filteredTools, handleToolClick, allTools }: SidebarContentProps) {
  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  const favoriteTools = allTools.filter(t => favorites.includes(t.id));

  const renderToolItem = (tool: Tool, showStar = true) => (
    <li
      key={tool.id}
      className={`category-item ${activeTool === tool.id ? 'active' : ''}`}
      onClick={() => handleToolClick(tool.id)}
      title={tool.desc}
    >
      <span className="category-icon">{tool.icon}</span>
      <div className="category-text">
        <span className="category-name">{tool.name}</span>
      </div>
      {tool.badge && (
        <span style={{
          fontSize: '9px',
          padding: '2px 6px',
          borderRadius: '4px',
          fontWeight: 600,
          background: tool.badge === 'Python' ? 'rgba(255, 193, 7, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          color: tool.badge === 'Python' ? '#ffc107' : '#3b82f6',
        }}>
          {tool.badge === 'Python' ? 'PY' : 'JS'}
        </span>
      )}
      {showStar && (
        <button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(tool.id); }}
          className="favorite-star"
          title={isFavorite(tool.id) ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            opacity: isFavorite(tool.id) ? 1 : 0.3,
            transition: 'opacity 0.2s, transform 0.2s',
            padding: '4px',
          }}
        >
          {isFavorite(tool.id) ? '⭐' : '☆'}
        </button>
      )}
    </li>
  );

  return (
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      {/* Dashboard - Always on top */}
      <div className="sidebar-section-title" style={{ color: 'var(--accent)' }}>🏠 Strona główna</div>
      <ul className="category-list">
        {allTools.filter(t => t.id === 'dashboard').map(tool => renderToolItem(tool, false))}
      </ul>
      <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />

      {/* Favorites Section */}
      {favoriteTools.length > 0 && (
        <>
          <div className="sidebar-section-title" style={{ color: '#fbbf24' }}>⭐ Ulubione</div>
          <ul className="category-list">
            {favoriteTools.filter(t => t.id !== 'dashboard').map(tool => renderToolItem(tool, false))}
          </ul>
          <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
        </>
      )}

      {/* All Tools Section */}
      <div className="sidebar-section-title">🛠️ Narzędzia</div>
      <ul className="category-list">
        {filteredTools.filter(t => t.id !== 'dashboard').map(tool => renderToolItem(tool))}
      </ul>

      {/* Version info */}
      <div className="sidebar-footer">
        <BackendStatusIndicator />
        <div style={{ marginTop: '8px', opacity: 0.7 }}>v2.0.0 • Next.js</div>
      </div>
    </aside>
  );
}

export default function Home() {
  const [activeTool, setActiveTool] = useState<ToolId>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [spotlightSelectedIndex, setSpotlightSelectedIndex] = useState(0);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSpotlight: () => setSpotlightOpen(true),
    onStats: () => setStatsOpen(true),
    onQueue: () => setQueueOpen(true),
    onHistory: () => setHistoryOpen(true),
    onHelp: () => setShortcutsOpen(true),
    onTool: (index) => {
      const tools = TOOLS;
      if (index < tools.length) {
        setActiveTool(tools[index].id);
      }
    },
  });

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Spotlight keyboard navigation
  const spotlightResults = TOOLS.filter(t =>
    searchQuery === '' ||
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.desc.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 6);

  useEffect(() => {
    // Reset selection when search changes
    setSpotlightSelectedIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!spotlightOpen) return;

      if (e.key === 'Escape') {
        setSpotlightOpen(false);
        setSearchQuery('');
        setSpotlightSelectedIndex(0);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSpotlightSelectedIndex(prev =>
          prev < spotlightResults.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSpotlightSelectedIndex(prev =>
          prev > 0 ? prev - 1 : spotlightResults.length - 1
        );
      } else if (e.key === 'Enter' && spotlightResults.length > 0) {
        e.preventDefault();
        const selected = spotlightResults[spotlightSelectedIndex];
        if (selected) {
          setActiveTool(selected.id as ToolId);
          setSpotlightOpen(false);
          setSearchQuery('');
          setSpotlightSelectedIndex(0);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [spotlightOpen, spotlightResults, spotlightSelectedIndex]);

  const currentTool = TOOLS.find(t => t.id === activeTool);

  const filteredTools = TOOLS.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToolClick = (toolId: ToolId) => {
    setActiveTool(toolId);
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDropSelectTool = (toolId: string) => {
    setActiveTool(toolId as ToolId);
  };

  return (
    <I18nProvider>
      <PresetsProvider>
        <ToastProvider>
          <FavoritesProvider>
            <StatsProvider>
              <QueueProvider>
                <HistoryProvider>
                  <NotificationsProvider>
                    <DroppedFileProvider>
                      <div className="app-layout">
                        {/* Mobile Overlay */}
                        {
                          sidebarOpen && isMobile && (
                            <div
                              className="mobile-overlay"
                              onClick={() => setSidebarOpen(false)}
                            />
                          )
                        }

                        {/* Top Navbar */}
                        <nav className="top-navbar">
                          {/* Hamburger Menu Button (Mobile) */}
                          <button
                            className="hamburger-btn"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            aria-label="Menu"
                          >
                            <span className={`hamburger-line ${sidebarOpen ? 'open' : ''}`} />
                            <span className={`hamburger-line ${sidebarOpen ? 'open' : ''}`} />
                            <span className={`hamburger-line ${sidebarOpen ? 'open' : ''}`} />
                          </button>

                          <div className="logo">
                            <div className="logo-icon">⚡</div>
                            <div className="logo-text">ToolBox<span>Pro</span></div>
                          </div>

                          <div
                            className="navbar-search"
                            onClick={() => setSpotlightOpen(true)}
                            style={{ cursor: 'pointer' }}
                          >
                            <span className="search-icon">🔍</span>
                            <span style={{ color: 'var(--text-muted)' }}>Szukaj narzędzi...</span>
                          </div>

                          <div className="navbar-actions">
                            <Tooltip text="Kolejka (Ctrl+Q)">
                              <button className="navbar-icon" onClick={() => setQueueOpen(true)}>📋</button>
                            </Tooltip>
                            <Tooltip text="Statystyki (Ctrl+S)">
                              <button className="navbar-icon" onClick={() => setStatsOpen(true)}>📊</button>
                            </Tooltip>
                            <Tooltip text="Historia (Ctrl+H)">
                              <button className="navbar-icon" onClick={() => setHistoryOpen(true)}>📜</button>
                            </Tooltip>
                            <ThemeToggle />
                            <ThemeCustomizer />
                            <Tooltip text="Skróty (Ctrl+/)">
                              <button className="navbar-icon" onClick={() => setShortcutsOpen(true)}>⌨️</button>
                            </Tooltip>
                            <Tooltip text="Powiadomienia">
                              <NotificationBell onClick={() => setNotificationsOpen(true)} />
                            </Tooltip>
                            <Tooltip text="Język / Language">
                              <LanguageSwitcher />
                            </Tooltip>
                            <Tooltip text="Ustawienia">
                              <button className="navbar-icon" onClick={() => setSettingsOpen(true)}>⚙️</button>
                            </Tooltip>
                            <OnboardingTrigger />
                            <div className="user-avatar">👤</div>
                          </div>
                        </nav>

                        {/* Main Container */}
                        <div className="main-container">
                          {/* Sidebar */}
                          <SidebarContent
                            sidebarOpen={sidebarOpen}
                            activeTool={activeTool}
                            filteredTools={filteredTools}
                            handleToolClick={handleToolClick}
                            allTools={TOOLS}
                          />

                          <GlobalDragDrop
                            tools={TOOLS}
                            currentTool={activeTool}
                            onSelectTool={handleDropSelectTool}
                          />
                          <GlobalMouseTracker />
                          <DesignToggle />

                          {/* Content Area */}
                          <main className="content-area">
                            {/* Breadcrumbs Navigation */}
                            {activeTool !== 'dashboard' && (
                              <Breadcrumbs items={[
                                { icon: '🏠', name: 'Pulpit', onClick: () => setActiveTool('dashboard') },
                                { icon: currentTool?.icon || '', name: currentTool?.name || '' }
                              ]} />
                            )}

                            {/* Content Header */}
                            <div className="content-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '32px' }}>{currentTool?.icon}</span>
                                <div>
                                  <h1 className="content-title">{currentTool?.name || 'Narzędzie'}</h1>
                                  <p className="content-subtitle">{currentTool?.desc}</p>
                                </div>
                              </div>
                            </div>

                            {/* Tool Content */}
                            {activeTool === 'dashboard' && <Dashboard tools={TOOLS} onNavigate={handleDropSelectTool} />}
                            {activeTool === 'image-converter' && <ImageConverter />}
                            {activeTool === 'cropper' && <ProductCropper />}
                            {activeTool === 'excel-splitter' && <ExcelSplitter />}
                            {activeTool === 'html-fixer' && <HtmlFixer />}
                            {activeTool === 'ean-checker' && <EanChecker />}
                            {activeTool === 'piko-empiko' && <PikoEmpiko />}
                            {activeTool === 'perfume' && <PerfumyHelper />}
                            {activeTool === 'json-html' && <JsonToHtml />}
                            {activeTool === 'desc-html' && <OpisToHtml />}
                            {activeTool === 'struktur' && <StrukturMatcher />}
                            {activeTool === 'compare' && <ExcelCompare />}
                            {activeTool === 'joiner' && <DataJoiner />}
                            {activeTool === 'translator' && <DescriptionTranslator />}
                            {activeTool === 'emoji-remover' && <EmojiRemover />}
                            {activeTool === 'batch-renamer' && <BatchRenamer />}
                            {activeTool === 'batch-processor' && <BatchProcessor />}
                            {activeTool === 'price-calc' && <PriceCalculator />}
                            {activeTool === 'seo-meta' && <SeoMetaGenerator />}
                          </main>
                        </div>

                        {/* Spotlight Search Overlay */}
                        {
                          spotlightOpen && (
                            <div
                              className="spotlight-overlay"
                              onClick={() => {
                                setSpotlightOpen(false);
                                setSearchQuery('');
                              }}
                              style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: 'rgba(0, 0, 0, 0.8)',
                                backdropFilter: 'blur(8px)',
                                zIndex: 10000,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                paddingTop: '15vh',
                                animation: 'spotlight-fade-in 0.3s ease-out'
                              }}
                            >
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  width: '100%',
                                  maxWidth: '600px',
                                  padding: '0 1rem'
                                }}
                              >
                                {/* Search Input */}
                                <div
                                  style={{
                                    background: 'var(--bg-card)',
                                    border: '2px solid var(--accent)',
                                    borderRadius: '1rem',
                                    padding: '1.25rem 1.5rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    boxShadow: '0 0 40px var(--accent-glow), 0 20px 60px rgba(0,0,0,0.4)',
                                    animation: 'spotlight-scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
                                  }}
                                >
                                  <span style={{ fontSize: '1.5rem' }}>🔍</span>
                                  <input
                                    type="text"
                                    placeholder="Wpisz nazwę narzędzia..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      outline: 'none',
                                      color: 'var(--text-white)',
                                      fontSize: '1.25rem',
                                      width: '100%'
                                    }}
                                  />
                                  <kbd style={{
                                    background: 'var(--bg-input)',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)'
                                  }}>ESC</kbd>
                                </div>

                                {/* Search Results */}
                                <div style={{
                                  marginTop: '1rem',
                                  background: 'var(--bg-card)',
                                  borderRadius: '1rem',
                                  overflow: 'hidden',
                                  boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                                  animation: 'spotlight-slide-up 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both'
                                }}>
                                  {spotlightResults.map((tool, index) => (
                                    <div
                                      key={tool.id}
                                      onClick={() => {
                                        setActiveTool(tool.id as ToolId);
                                        setSpotlightOpen(false);
                                        setSearchQuery('');
                                        setSpotlightSelectedIndex(0);
                                      }}
                                      onMouseEnter={() => setSpotlightSelectedIndex(index)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '1rem',
                                        padding: index === spotlightSelectedIndex ? '1rem 1.5rem 1rem 2rem' : '1rem 1.5rem',
                                        cursor: 'pointer',
                                        borderBottom: '1px solid var(--border)',
                                        transition: 'all 0.2s ease',
                                        animation: `spotlight-item-in 0.3s ease-out ${index * 0.05}s both`,
                                        background: index === spotlightSelectedIndex ? 'var(--bg-card-hover)' : 'transparent',
                                        borderLeft: index === spotlightSelectedIndex ? '3px solid var(--accent)' : '3px solid transparent',
                                      }}
                                    >
                                      <span style={{ fontSize: '1.5rem' }}>{tool.icon}</span>
                                      <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-white)' }}>{tool.name}</div>
                                        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{tool.desc}</div>
                                      </div>
                                      {tool.badge && (
                                        <span style={{
                                          fontSize: '0.7rem',
                                          padding: '0.25rem 0.5rem',
                                          borderRadius: '0.25rem',
                                          background: tool.badge === 'Python' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                          color: tool.badge === 'Python' ? '#3b82f6' : '#22c55e'
                                        }}>{tool.badge}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )
                        }
                        <StatsPanel isOpen={statsOpen} onClose={() => setStatsOpen(false)} tools={TOOLS} />
                        <HistoryPanel isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />
                        <QueuePanel isOpen={queueOpen} onClose={() => setQueueOpen(false)} />
                        <KeyboardShortcutsPanel isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
                        <NotificationsPanel isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
                        <SettingsExportImportPanel isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
                        <OnboardingModal />
                      </div>
                    </DroppedFileProvider>
                  </NotificationsProvider>
                </HistoryProvider>
              </QueueProvider>
            </StatsProvider>
          </FavoritesProvider>
        </ToastProvider>
      </PresetsProvider>
    </I18nProvider>
  );
}
