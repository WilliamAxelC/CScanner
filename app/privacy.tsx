import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Globe, HardDrive, Lock, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../src/theme/ThemeProvider';

const NETWORK_ENDPOINTS = [
  {
    host: 'cuang.dev/projects/cscanner/download/version.json',
    when: 'At most once daily on Android when Auto-Check Updates is on, or manually in App Info.',
    data: 'Plain GET request returning latest APK version, release notes, and SHA-256 checksum. Any downloaded in-app update APK is verified against its SHA-256 checksum and com.cscanner.app signature before handing to Android Installer.',
  },
  {
    host: 'oauth2.googleapis.com & www.googleapis.com/drive/v3',
    when: 'Only when you explicitly sign in with Google Drive and trigger sync.',
    data: 'App-created files under Google Drive drive.file scope only; access tokens stay in RAM and are never saved to web localStorage.',
  },
  {
    host: 'github.com/WilliamAxelC/CScanner/issues/new',
    when: 'Only when you tap Open Pre-filled GitHub Issue on the Report screen.',
    data: 'The title, description, and optional sanitized diagnostics you previewed before opening.',
  },
  {
    host: 'Tesseract language CDN (Web PWA only)',
    when: 'First time you run OCR in a browser tab.',
    data: 'Downloads English WASM OCR worker files into local browser storage. Android OCR runs offline.',
  },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { colors, scaleFont } = useTheme();

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
          Privacy & Data Policy
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.titleRow}>
            <HardDrive size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(16) }]}>
              Offline-First Local Vault
            </Text>
          </View>
          <Text style={[styles.body, { color: colors.textSecondary, fontSize: scaleFont(14) }]}>
            Your scanned pages, crop adjustments, redactions, signatures, OCR text, and PDFs live locally
            on this device (private app files + SQLite on Android; IndexedDB in your browser). CScanner
            includes zero analytics, zero advertising SDKs, and no CScanner backend servers.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          EVERY NETWORK REQUEST THIS APP CAN MAKE
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {NETWORK_ENDPOINTS.map((ep, idx) => (
            <View key={ep.host}>
              {idx > 0 ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
              <View style={styles.epItem}>
                <View style={styles.titleRow}>
                  <Globe size={15} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(13), flex: 1 }}>
                    {ep.host}
                  </Text>
                </View>
                <Text style={{ color: colors.primary, fontSize: scaleFont(12), fontWeight: '600' }}>
                  Trigger: {ep.when}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13), lineHeight: 19 }}>
                  {ep.data}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          WHAT NEVER LEAVES YOUR DEVICE
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.titleRow}>
            <Lock size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
              Strictly Local Controls
            </Text>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13) }}>
              • Scanned images, signatures, and OCR text never upload unless you explicitly enable Google Drive Sync.
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13) }}>
              • PDF encryption passwords are used solely in memory during local PDF export and never persisted.
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13) }}>
              • Redactions burn opaque pixel rectangles into exported JPEGs/PDFs and remove underlying OCR text blocks.
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13) }}>
              • Android manifest explicitly blocks RECORD_AUDIO permission and disables cloud ADB allowBackup.
            </Text>
          </View>
        </View>

        <View style={[styles.banner, { backgroundColor: colors.primarySoft }]}>
          <ShieldCheck size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600', fontSize: scaleFont(13), flex: 1 }}>
            Need to wipe this device? Use Settings → Local Storage & Sync → Erase All Data.
          </Text>
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
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700' },
  body: { lineHeight: 20 },
  epItem: { gap: 4, paddingVertical: 4 },
  divider: { height: 1, marginVertical: 8 },
  banner: {
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
