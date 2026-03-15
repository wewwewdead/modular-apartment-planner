import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Avatar} from './Avatar';
import {useTheme} from '../theme/ThemeProvider';
import {fonts} from '../theme/typography';
import {spacing, radii} from '../theme/spacing';
import type {OpinionItem} from '../lib/api/opinionsApi';

interface OpinionCardProps {
  opinion: OpinionItem;
  onPress?: () => void;
  onAuthorPress?: () => void;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function OpinionCard({opinion, onPress, onAuthorPress}: OpinionCardProps) {
  const {colors} = useTheme();

  return (
    <Pressable
      style={[styles.card, {backgroundColor: colors.bgCard, borderColor: colors.borderCard}]}
      onPress={onPress}>
      <Pressable style={styles.authorRow} onPress={onAuthorPress}>
        <Avatar
          uri={opinion.users?.image_url}
          name={opinion.users?.name}
          size={36}
          badge={opinion.users?.badge as any}
        />
        <View style={styles.authorInfo}>
          <Text style={[styles.authorName, {color: colors.textPrimary}]}>
            {opinion.users?.name || 'User'}
          </Text>
          <Text style={[styles.time, {color: colors.textMuted}]}>
            {timeAgo(opinion.created_at)}
          </Text>
        </View>
      </Pressable>
      <Text style={[styles.opinionText, {color: colors.textPrimary}]}>
        {opinion.opinion}
      </Text>
      {(opinion.reply_count ?? 0) > 0 && (
        <Text style={[styles.replyCount, {color: colors.textMuted}]}>
          {opinion.reply_count} {opinion.reply_count === 1 ? 'reply' : 'replies'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authorName: {
    fontFamily: fonts.ui.semiBold,
    fontSize: 14,
  },
  time: {
    fontFamily: fonts.ui.regular,
    fontSize: 12,
  },
  opinionText: {
    fontFamily: fonts.ui.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  replyCount: {
    fontFamily: fonts.ui.medium,
    fontSize: 12,
  },
});
