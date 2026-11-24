import { Camera, CreditCard, ImagePlus, Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ScanFabProps {
  onScan: () => void;
  onImport: () => void;
  onIdCard: () => void;
}

export function ScanFab({ onScan, onImport, onIdCard }: ScanFabProps) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {expanded && (
        <View style={styles.actionsList}>
          <Pressable
            onPress={() => {
              setExpanded(false);
              onIdCard();
            }}
            style={[
              styles.miniAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <CreditCard size={18} color={colors.primary} />
            <Text style={[styles.miniLabel, { color: colors.text }]}>
              ID Card
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setExpanded(false);
              onImport();
            }}
            style={[
              styles.miniAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <ImagePlus size={18} color={colors.primary} />
            <Text style={[styles.miniLabel, { color: colors.text }]}>
              Import Photos
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setExpanded(false);
              onScan();
            }}
            style={[
              styles.miniAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          >
            <Camera size={18} color={colors.primary} />
            <Text style={[styles.miniLabel, { color: colors.text }]}>
              Scan Document
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.fabRow}>
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel="More scan options"
          accessibilityState={{ expanded }}
          style={[
            styles.secondaryFab,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          {expanded ? (
            <X size={20} color={colors.text} />
          ) : (
            <Plus size={20} color={colors.text} />
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setExpanded(false);
            onScan();
          }}
          accessibilityRole="button"
          accessibilityLabel="Scan document"
          style={({ pressed }) => [
            styles.primaryFab,
            {
              backgroundColor: colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Camera size={22} color={colors.onPrimary} />
          <Text style={[styles.fabText, { color: colors.onPrimary }]}>
            Scan
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    alignItems: 'flex-end',
    gap: 12,
  },
  actionsList: {
    gap: 8,
    alignItems: 'flex-end',
  },
  miniAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  miniLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  fabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryFab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  primaryFab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 54,
    paddingHorizontal: 20,
    borderRadius: 27,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
