import React from 'react';
import {Platform, StyleSheet, View, type ViewProps} from 'react-native';
import {useTheme} from '../theme/ThemeProvider';
import {radii, spacing} from '../theme/spacing';

interface GlassCardProps extends ViewProps {
  children: React.ReactNode;
  borderRadius?: number;
  padding?: number;
}

export function GlassCard({
  children,
  style,
  borderRadius = radii.xxl,
  padding = spacing.md,
  ...props
}: GlassCardProps) {
  const {colors} = useTheme();

  // Note: True blur requires @react-native-community/blur on iOS.
  // This provides the color/opacity fallback that works on both platforms.
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgGlass,
          borderColor: colors.bgGlassBorder,
          borderRadius,
          padding,
        },
        style,
      ]}
      {...props}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 0.5,
    overflow: 'hidden',
  },
});
