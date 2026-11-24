import { FileText, MoreVertical } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import type { Document, Page } from '../types/models';
import { formatShortDate } from '../utils/format';
import { ResolvedImage } from './ResolvedImage';

interface DocumentCardProps {
  doc: Document;
  firstPage?: Page;
  viewMode: 'grid' | 'list';
  onPress: () => void;
  onMenuPress: () => void;
}

export function DocumentCard({
  doc,
  firstPage,
  viewMode,
  onPress,
  onMenuPress,
}: DocumentCardProps) {
  const { colors } = useTheme();
  const syncColor =
    doc.syncStatus === 'synced'
      ? colors.success
      : doc.syncStatus === 'conflict'
        ? colors.danger
        : colors.warning;

  const hasOcr = doc.ocrFullText.trim().length > 0;

  if (viewMode === 'list') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.listCard,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        <View
          style={[
            styles.listThumbWrap,
            { backgroundColor: colors.surfaceMuted },
          ]}
        >
          {firstPage ? (
            <ResolvedImage
              uri={firstPage.processedUri}
              style={styles.listThumb}
              resizeMode="cover"
            />
          ) : (
            <FileText size={24} color={colors.textMuted} />
          )}
        </View>

        <View style={styles.listBody}>
          <Text
            style={[styles.title, { color: colors.text }]}
            numberOfLines={1}
          >
            {doc.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.metaText, { color: colors.textMuted }]}>
              {doc.pageIds.length}{' '}
              {doc.pageIds.length === 1 ? 'page' : 'pages'} •{' '}
              {formatShortDate(doc.updatedAt)}
            </Text>
            {hasOcr && (
              <View
                style={[styles.badge, { backgroundColor: colors.primarySoft }]}
              >
                <Text style={[styles.badgeText, { color: colors.primary }]}>
                  OCR
                </Text>
              </View>
            )}
            <View style={[styles.syncDot, { backgroundColor: syncColor }]} />
          </View>
          {doc.tags.length > 0 && (
            <View style={styles.tagRow}>
              {doc.tags.slice(0, 3).map((t) => (
                <Text
                  key={t}
                  style={[
                    styles.tagChip,
                    {
                      color: colors.textSecondary,
                      backgroundColor: colors.surfaceMuted,
                    },
                  ]}
                  numberOfLines={1}
                >
                  #{t}
                </Text>
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onMenuPress();
          }}
          hitSlop={10}
          style={styles.menuBtn}
        >
          <MoreVertical size={18} color={colors.textMuted} />
        </Pressable>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.gridCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.gridThumbWrap,
          { backgroundColor: colors.surfaceMuted },
        ]}
      >
        {firstPage ? (
          <ResolvedImage
            uri={firstPage.processedUri}
            style={styles.gridThumb}
            resizeMode="cover"
          />
        ) : (
          <FileText size={32} color={colors.textMuted} />
        )}
        <View style={[styles.pagePill, { backgroundColor: colors.overlay }]}>
          <Text style={styles.pagePillText}>{doc.pageIds.length}</Text>
        </View>
        {hasOcr && (
          <View
            style={[
              styles.ocrCornerBadge,
              { backgroundColor: colors.primary },
            ]}
          >
            <Text style={styles.ocrCornerText}>OCR</Text>
          </View>
        )}
      </View>

      <View style={styles.gridFooter}>
        <View style={styles.gridTitleRow}>
          <Text
            style={[styles.title, { color: colors.text, flex: 1 }]}
            numberOfLines={1}
          >
            {doc.title}
          </Text>
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onMenuPress();
            }}
            hitSlop={10}
          >
            <MoreVertical size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: colors.textMuted }]}>
            {formatShortDate(doc.updatedAt)}
          </Text>
          <View style={[styles.syncDot, { backgroundColor: syncColor }]} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  gridThumbWrap: {
    aspectRatio: 0.78,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridThumb: {
    width: '100%',
    height: '100%',
  },
  pagePill: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  pagePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  ocrCornerBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ocrCornerText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  gridFooter: {
    padding: 10,
    gap: 4,
  },
  gridTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 10,
    gap: 12,
  },
  listThumbWrap: {
    width: 54,
    height: 70,
    borderRadius: 8,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listThumb: {
    width: '100%',
    height: '100%',
  },
  listBody: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  syncDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  tagChip: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  menuBtn: {
    padding: 4,
  },
});
