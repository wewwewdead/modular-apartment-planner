import React, {useEffect} from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import {useTheme} from '../theme/ThemeProvider';
import {radii} from '../theme/spacing';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLoader({
  width = '100%',
  height = 16,
  borderRadius = radii.sm,
  style,
}: SkeletonLoaderProps) {
  const {colors} = useTheme();
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, {duration: 1200}), -1, true);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.3, 0.7]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.bgSecondary,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function PostCardSkeleton() {
  const {colors} = useTheme();
  return (
    <View
      style={[
        skeletonStyles.card,
        {backgroundColor: colors.bgCard, borderColor: colors.borderCard},
      ]}>
      <SkeletonLoader height={160} borderRadius={0} />
      <View style={skeletonStyles.content}>
        <View style={skeletonStyles.authorRow}>
          <SkeletonLoader width={22} height={22} borderRadius={11} />
          <SkeletonLoader width={100} height={14} />
        </View>
        <SkeletonLoader width="80%" height={18} />
        <SkeletonLoader width="100%" height={14} />
        <SkeletonLoader width="60%" height={14} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  content: {
    padding: 16,
    gap: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
