import React, { useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Accessibility as AccessibilityIcon,
  ArrowLeft,
  Eye,
  ShieldCheck,
  Smartphone,
  Type,
  ZapOff,
} from 'lucide-react-native';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';
import type { FontScalePreset } from '../src/types/models';

const FONT_SCALE_OPTIONS: { value: FontScalePreset; label: string; hint: string }[] = [
  { value: 0.9, label: 'Compact', hint: '90%' },
  { value: 1.0, label: 'Default', hint: '100%' },
  { value: 1.15, label: 'Large', hint: '115%' },
  { value: 1.3, label: 'Largest', hint: '130%' },
];

export default function AccessibilitySettingsScreen() {
  const router = useRouter();
  const { colors, scaleFont, osReduceMotion } = useTheme();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const openSystemAccessibility = async () => {
    try {
      if (Platform.OS === 'android') {
        await Linking.sendIntent('android.settings.ACCESSIBILITY_SETTINGS');
        return;
      }
      await Linking.openSettings();
    } catch {
      try {
        await Linking.openSettings();
      } catch {
        setStatusMessage('Unable to open system accessibility settings on this device.');
      }
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right', 'bottom']}
    >
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={6}
          style={[styles.backBtn, { backgroundColor: colors.surfaceMuted }]}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: colors.text, fontSize: scaleFont(18) }]}
        >
          Accessibility
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          TEXT & DISPLAY
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <Type size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
              App Text Size
            </Text>
          </View>
          <Text style={[styles.cardSub, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
            Scales CScanner headings, labels, and lists independently alongside your system font size.
          </Text>
          <View style={styles.chipRow}>
            {FONT_SCALE_OPTIONS.map((opt) => {
              const selected = settings.fontScale === opt.value;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => void updateSettings({ fontScale: opt.value })}
                  accessibilityRole="radio"
                  accessibilityLabel={`Text size ${opt.label} ${opt.hint}`}
                  accessibilityState={{ selected, checked: selected }}
                  style={[
                    styles.scaleChip,
                    {
                      backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: selected ? colors.primary : colors.text,
                      fontWeight: selected ? '700' : '600',
                      fontSize: scaleFont(13),
                    }}
                  >
                    {opt.label}
                  </Text>
                  <Text
                    style={{
                      color: selected ? colors.primary : colors.textMuted,
                      fontSize: scaleFont(11),
                      marginTop: 2,
                    }}
                  >
                    {opt.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <View style={styles.inlineTitle}>
                <Eye size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
                  High Contrast Mode
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
                Strengthens borders, foreground ink, and interactive controls for better legibility.
              </Text>
            </View>
            <Switch
              value={settings.highContrast}
              onValueChange={(val) => void updateSettings({ highContrast: val })}
              accessibilityRole="switch"
              accessibilityLabel="High Contrast Mode"
              accessibilityState={{ checked: settings.highContrast }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          MOTION & INTERACTION
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <View style={styles.inlineTitle}>
                <ZapOff size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
                  Reduce Motion
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
                Disables modal fade transitions and non-essential animations across the app.
              </Text>
              {osReduceMotion ? (
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: scaleFont(12),
                    fontWeight: '600',
                    marginTop: 4,
                  }}
                >
                  System Reduce Motion is currently active on your device.
                </Text>
              ) : null}
            </View>
            <Switch
              value={settings.reduceMotion}
              onValueChange={(val) => void updateSettings({ reduceMotion: val })}
              accessibilityRole="switch"
              accessibilityLabel="Reduce Motion"
              accessibilityState={{ checked: settings.reduceMotion }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <View style={styles.inlineTitle}>
                <ShieldCheck size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
                  Confirm Before Delete
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
                Always asks for confirmation before deleting documents, pages, folders, or signatures.
              </Text>
            </View>
            <Switch
              value={settings.confirmBeforeDelete}
              onValueChange={(val) => void updateSettings({ confirmBeforeDelete: val })}
              accessibilityRole="switch"
              accessibilityLabel="Confirm Before Delete"
              accessibilityState={{ checked: settings.confirmBeforeDelete }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          LIVE PREVIEW
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.previewHeader}>
            <Text style={[styles.previewTitle, { color: colors.text, fontSize: scaleFont(16) }]}>
              Scanned Invoice - Nov 2026
            </Text>
            <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: scaleFont(11) }}>
                OCR Ready
              </Text>
            </View>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13), lineHeight: scaleFont(19) }}>
            Sample preview reflecting your chosen text scale ({Math.round(settings.fontScale * 100)}%)
            and contrast palette.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          DEVICE ASSISTIVE TOOLS
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {Platform.OS === 'android' ? (
            <>
              <View style={styles.cardHeaderRow}>
                <Smartphone size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
                  Android Accessibility Settings
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
                Configure TalkBack screen reader, Display size, Color correction, or Switch Access.
              </Text>
              <Pressable
                onPress={openSystemAccessibility}
                accessibilityRole="button"
                accessibilityLabel="Open Android Accessibility Settings"
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                <AccessibilityIcon size={18} color={colors.onPrimary} />
                <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: scaleFont(14) }}>
                  Open Android Accessibility Settings
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.cardHeaderRow}>
                <AccessibilityIcon size={18} color={colors.primary} />
                <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
                  Screen Reader & Keyboard Support
                </Text>
              </View>
              <Text style={[styles.cardSub, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
                All CScanner buttons, toggles, and modals expose semantic roles and labels for TalkBack,
                VoiceOver, NVDA, and keyboard Tab navigation. Use your browser zoom controls alongside
                the App Text Size preset above when needed.
              </Text>
            </>
          )}
          {statusMessage ? (
            <Text style={{ color: colors.danger, fontSize: scaleFont(13), marginTop: 8 }}>
              {statusMessage}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '800' },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionLabel: {
    fontWeight: '700',
    letterSpacing: 0.7,
    marginTop: 6,
    marginLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTitle: { fontWeight: '700' },
  cardSub: { lineHeight: 19 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  scaleChip: {
    minWidth: 72,
    flexGrow: 1,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  switchCopy: { flex: 1 },
  divider: { height: 1, marginVertical: 6 },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewTitle: { fontWeight: '700', flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
});
