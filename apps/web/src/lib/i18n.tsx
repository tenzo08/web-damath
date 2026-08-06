import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'en' | 'fil';

/**
 * A real foundation, not full coverage — translates the lobby (the one screen every
 * visitor sees first) into English and Filipino as the working proof of the pattern.
 * Extending it to the rest of the app is additive: add keys here, call `t('key')`
 * wherever a string is currently hard-coded. Scoped down deliberately for this pass,
 * same reasoning as every other "minimal but real" decision this session — see
 * KNOWLEDGE.md.
 */
const DICTIONARIES: Record<Locale, Record<string, string>> = {
  en: {
    'lobby.tagline':
      "The Filipino educational board game — Dama plus Mathematics. Capture is mandatory, scoring runs through the landing square's operation, and reaching the far row promotes a chip to a Dama.",
    'lobby.playFriend.title': 'Play a Friend',
    'lobby.playFriend.description': 'Local, pass-and-play — two players, one board, any variant.',
    'lobby.playComputer.title': 'Play the Computer',
    'lobby.playComputer.description': 'Minimax with four difficulty tiers — Whole, Counting, and Integer Damath.',
    'lobby.playOnline.title': 'Play Online',
    'lobby.playOnline.description': "Matched with a real opponent, or a labelled computer if no one's waiting.",
    'lobby.learn.title': 'Learn to Play',
    'lobby.learn.description': 'An interactive, illustrated walkthrough of every rule.',
    'lobby.tournaments.title': 'Tournaments',
    'lobby.tournaments.description': 'Teacher-created brackets with a join code — create one, join one, or watch the standings.',
    'auth.signIn': 'Sign in',
    'auth.signOut': 'Sign out',
  },
  fil: {
    'lobby.tagline':
      'Ang larong pang-edukasyon ng Pilipinas — Dama at Matematika. Mandatoryo ang pagkuha kapag posible, batay sa operasyon ng patutunguhang parisukat ang puntos, at ang pag-abot sa dulong hanay ay nagpapa-Dama sa piraso.',
    'lobby.playFriend.title': 'Laro Kasama ang Kaibigan',
    'lobby.playFriend.description': 'Lokal, pasa-at-laro — dalawang manlalaro, isang board, kahit anong variant.',
    'lobby.playComputer.title': 'Laban sa Kompyuter',
    'lobby.playComputer.description': 'Minimax na may apat na antas ng hirap — Whole, Counting, at Integer Damath.',
    'lobby.playOnline.title': 'Maglaro Online',
    'lobby.playOnline.description': 'Ipapares ka sa tunay na kalaban, o sa kompyuter kung walang naghihintay.',
    'lobby.learn.title': 'Matuto Maglaro',
    'lobby.learn.description': 'Interactive na gabay na may larawan para sa bawat patakaran.',
    'lobby.tournaments.title': 'Mga Paligsahan',
    'lobby.tournaments.description': 'Mga bracket na ginawa ng guro na may join code — gumawa, sumali, o tingnan ang standings.',
    'auth.signIn': 'Mag-sign in',
    'auth.signOut': 'Mag-sign out',
  },
};

const STORAGE_KEY = 'damath.locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: keyof (typeof DICTIONARIES)['en']) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'fil' ? 'fil' : 'en';
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = (next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => DICTIONARIES[locale][key] ?? DICTIONARIES.en[key] ?? key,
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}
