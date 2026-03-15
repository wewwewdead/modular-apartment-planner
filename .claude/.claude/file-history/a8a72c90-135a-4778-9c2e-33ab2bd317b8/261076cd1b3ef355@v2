import {useMemo} from 'react';
import {StyleSheet} from 'react-native';
import {useTheme} from './ThemeProvider';
import type {Palette} from './tokens';

type NamedStyles<T> = {[P in keyof T]: any};

export function useThemeStyles<T extends NamedStyles<T>>(
  makeStyles: (colors: Palette) => T,
): T {
  const {colors, theme} = useTheme();
  return useMemo(
    () => StyleSheet.create(makeStyles(colors)) as unknown as T,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme],
  );
}
