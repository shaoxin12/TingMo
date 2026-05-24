import React, { useEffect, useState } from 'react';
import { I18nProvider } from './i18n/context';
import { useSettingsStore } from './store/settings';
import { FloatingWindow } from './components/FloatingWindow';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SettingsWindow } from './components/Settings/SettingsWindow';
import { OnboardingWizard } from './components/Settings/OnboardingWizard';

const AppInner: React.FC = () => {
  const hash = window.location.hash;
  const isSettings = hash.startsWith('#/settings');
  const isOnboarding = hash === '#/onboarding';
  const [onboardDone, setOnboardDone] = useState(false);

  if (isOnboarding && !onboardDone) {
    return (
      <OnboardingWizard onComplete={() => {
        setOnboardDone(true);
        window.location.hash = '#/settings';
      }} />
    );
  }

  if (isSettings || (isOnboarding && onboardDone)) {
    return <SettingsWindow />;
  }

  return <FloatingWindow />;
};

export const App: React.FC = () => {
  const setUiLanguage = useSettingsStore((s) => s.setUiLanguage);
  const hydrate = useSettingsStore((s) => s.hydrate);

  useEffect(() => {
    hydrate().then(() => {
      // Only auto-detect locale on first launch (no saved settings)
      window.tingmo?.loadAppSettings().then((saved) => {
        if (saved && Object.keys(saved).length > 0) return;
        window.tingmo?.getSystemLocale().then((locale) => {
          if (locale) setUiLanguage(locale as any);
        }).catch(() => {});
      }).catch(() => {});
    });
  }, [hydrate, setUiLanguage]);

  return (
    <ErrorBoundary>
      <I18nProvider>
        <AppInner />
      </I18nProvider>
    </ErrorBoundary>
  );
};
