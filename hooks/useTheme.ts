import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { lightColors, darkColors, ThemeColors, ThemePreference } from '../lib/theme';

const THEME_KEY = 'theme_preference';

// Module-level state shared across all hook instances
let _preference: ThemePreference = 'system';
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export async function setThemePreference(pref: ThemePreference): Promise<void> {
  _preference = pref;
  await AsyncStorage.setItem(THEME_KEY, pref);
  _notify();
}

export function useTheme(): {
  colors: ThemeColors;
  isDark: boolean;
  preference: ThemePreference;
} {
  const systemScheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(_preference);

  useEffect(() => {
    // Load persisted preference on first mount
    AsyncStorage.getItem(THEME_KEY).then((val) => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        _preference = val;
        setPreference(val);
      }
    });

    // Subscribe to in-session changes (e.g. from settings screen)
    const update = () => setPreference(_preference);
    _listeners.add(update);
    return () => { _listeners.delete(update); };
  }, []);

  const isDark =
    preference === 'dark' ||
    (preference === 'system' && systemScheme === 'dark');

  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    preference,
  };
}
