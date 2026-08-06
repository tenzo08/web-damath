import { useEffect, useState } from 'react';

/** True while `query` matches — used for structural layout decisions (sidebar vs. top bar) that inline styles/flex-wrap alone can't express. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Below this, the rail can't afford to be a persistent sidebar next to the board. */
export const NARROW_QUERY = '(max-width: 900px)';
