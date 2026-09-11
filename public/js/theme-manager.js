/**
 * ChronicAI — Universal Platform Theme Manager (theme-manager.js)
 * Synchronizes Day Mode & Night Mode across all sections, sub-pages, and tabs.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'chronicai-theme';
  const DEFAULT_THEME = 'dark';

  function getSavedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (e) {
      return DEFAULT_THEME;
    }
  }

  function applyTheme(theme) {
    const isLight = theme === 'light';
    const effectiveTheme = isLight ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', effectiveTheme);
    if (document.body) {
      document.body.setAttribute('data-theme', effectiveTheme);
    }

    try {
      localStorage.setItem(STORAGE_KEY, effectiveTheme);
    } catch (e) {}

    updateToggleButtons(effectiveTheme);

    // If a page provides a custom map updater (e.g. index.html)
    if (typeof window.setDisasterMapTheme === 'function') {
      try {
        window.setDisasterMapTheme(effectiveTheme);
      } catch (e) {}
    }

    // Broadcast event for custom page widgets & listeners
    const eventDetail = { theme: effectiveTheme, isLight };
    window.dispatchEvent(new CustomEvent('chronic-theme-change', { detail: eventDetail }));
    document.dispatchEvent(new CustomEvent('chronic-theme-change', { detail: eventDetail }));
  }

  function updateToggleButtons(theme) {
    const isLight = theme === 'light';
    const dayButtons = document.querySelectorAll('#segDayBtn, .btn-theme-day');
    const nightButtons = document.querySelectorAll('#segNightBtn, .btn-theme-night');

    dayButtons.forEach((btn) => {
      btn.classList.toggle('active', isLight);
      btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
    });

    nightButtons.forEach((btn) => {
      btn.classList.toggle('active', !isLight);
      btn.setAttribute('aria-pressed', !isLight ? 'true' : 'false');
    });
  }

  // 1. Immediate synchronous execution to prevent FOUC / flash of dark/light theme
  const initialTheme = getSavedTheme();
  document.documentElement.setAttribute('data-theme', initialTheme);

  // 2. Expose global controls on window
  window.getChronicTheme = () => document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  window.setChronicTheme = (theme) => applyTheme(theme);
  window.toggleChronicTheme = () => {
    const current = window.getChronicTheme();
    applyTheme(current === 'light' ? 'dark' : 'light');
  };

  // 3. Document event delegation for segmented switches
  document.addEventListener('click', (e) => {
    const target = e.target.closest('#segDayBtn, #segNightBtn, .btn-theme-day, .btn-theme-night, #themeToggleBtn');
    if (!target) return;

    if (target.id === 'segDayBtn' || target.classList.contains('btn-theme-day')) {
      applyTheme('light');
    } else if (target.id === 'segNightBtn' || target.classList.contains('btn-theme-night')) {
      applyTheme('dark');
    } else if (target.id === 'themeToggleBtn') {
      window.toggleChronicTheme();
    }
  });

  // 4. Sync button UI on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      updateToggleButtons(getSavedTheme());
    });
  } else {
    updateToggleButtons(initialTheme);
  }

  // 5. Cross-tab synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      applyTheme(e.newValue);
    }
  });
})();
