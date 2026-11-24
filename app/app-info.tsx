import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  ArrowLeft,
  ArrowUpCircle,
  Bug,
  Check,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  HardDrive,
  Info,
  Lock,
  RefreshCw,
  Trash2,
} from 'lucide-react-native';
import {
  buildDiagnosticsReport,
  clearErrorLog,
} from '../src/services/diagnostics/errorLog';
import { copyTextToClipboard } from '../src/services/feedback/reportBuilder';
import { useAppUpdateStore } from '../src/services/updates/appUpdate';
import {
  DOWNLOAD_PAGE_URL,
  GITHUB_REPO_URL,
  isNewer,
  useUpdateStore,
} from '../src/services/updates/updateChecker';
import { storage } from '../src/storage';
import type { StorageStats } from '../src/storage/types';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';

const LICENSES = [
  { name: 'React & React Native', license: 'MIT', purpose: 'Core UI runtime' },
  { name: 'Expo SDK & Expo Router', license: 'MIT', purpose: 'Navigation, build tooling, filesystem' },
  { name: 'Google ML Kit Document Scanner', license: 'Apache-2.0', purpose: 'On-device Android edge scan & perspective capture' },
  { name: 'Tesseract.js', license: 'Apache-2.0', purpose: 'Local Web OCR worker (PWA)' },
  { name: '@cantoo/pdf-lib', license: 'MIT', purpose: 'PDF generation, OCR text layer & RC4 encryption' },
  { name: 'Zustand', license: 'MIT', purpose: 'Local state management' },
  { name: 'Lucide Icons', license: 'ISC', purpose: 'Vector iconography' },
  { name: 'idb', license: 'ISC', purpose: 'IndexedDB storage wrapper on Web' },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AppInfoScreen() {
  const router = useRouter();
  const { colors, scaleFont } = useTheme();
  const settings = useAppStore((s) => s.settings);
  const clearLocalCache = useAppStore((s) => s.clearLocalCache);

  const info = useUpdateStore((s) => s.installed);
  const latest = useUpdateStore((s) => s.latest);
  const checkedAt = useUpdateStore((s) => s.checkedAt);
  const checkingUpdate = useUpdateStore((s) => s.checking);
  const autoCheck = useUpdateStore((s) => s.enabled);
  const lastCheckFailed = useUpdateStore((s) => s.lastCheckFailed);
  const lastCheckError = useUpdateStore((s) => s.lastError);
  const checkUpdates = useUpdateStore((s) => s.check);
  const setAutoCheck = useUpdateStore((s) => s.setEnabled);
  const openUpdateSheet = useAppUpdateStore((s) => s.openSheet);

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagVersion, setDiagVersion] = useState(0);
  const [showLicenses, setShowLicenses] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const refreshStats = async () => {
    try {
      if (storage.getStorageStats) {
        const s = await storage.getStorageStats();
        setStats(s);
      }
    } catch {
      // ignore storage stat probe error
    }
  };

  useEffect(() => {
    void refreshStats();
  }, []);

  const hasNewerUpdate = isNewer(latest, info);

  const diagnosticsText = useMemo(
    () => {
      void diagVersion;
      return buildDiagnosticsReport({ settings, stats, includeErrors: true });
    },
    [settings, stats, diagVersion],
  );

  const handleCopyDiagnostics = async () => {
    const res = await copyTextToClipboard(diagnosticsText);
    setCopyNotice(
      res === 'copied'
        ? 'Diagnostics copied to clipboard.'
        : res === 'shared'
          ? 'Opened share sheet with diagnostics.'
          : 'Could not copy diagnostics on this device.',
    );
  };

  const handleClearCache = async () => {
    const removed = await clearLocalCache();
    setCacheNotice(
      removed > 0
        ? `Removed ${removed} temporary cache file${removed === 1 ? '' : 's'}.`
        : 'No temporary cache files needed cleanup.',
    );
    await refreshStats();
  };

  const handleClearLog = () => {
    clearErrorLog();
    setDiagVersion((v) => v + 1);
    setCopyNotice('Cleared in-memory error log.');
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
          App Info
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.heroRow}>
            <View style={[styles.appBadge, { backgroundColor: colors.primarySoft }]}>
              <Info size={24} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.appName, { color: colors.text, fontSize: scaleFont(18) }]}>
                {info.name}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: scaleFont(14), marginTop: 2 }}>
                Version {info.version} (build {info.versionCode})
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(12), marginTop: 2 }}>
                {info.packageId}
              </Text>
            </View>
          </View>
          <View style={[styles.metaGrid, { borderTopColor: colors.border }]}>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
              Storage: {Platform.OS === 'web' ? 'IndexedDB (Browser)' : 'SQLite + App Files'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
              PDF Engine: @cantoo/pdf-lib (on-device)
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
              OCR Engine: {Platform.OS === 'web' ? 'Tesseract.js (local worker)' : 'On-device Text Engine'}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          UPDATES
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
                Auto-Check for Updates
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12), marginTop: 2 }}>
                Checks cuang.dev version.json at most once daily on Android; SHA-256 verified before install.
              </Text>
            </View>
            <Switch
              value={autoCheck}
              onValueChange={setAutoCheck}
              accessibilityRole="switch"
              accessibilityLabel="Auto-Check for Updates"
              accessibilityState={{ checked: autoCheck }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          {checkedAt ? (
            <Text style={{ color: colors.textMuted, fontSize: scaleFont(12) }}>
              Last checked: {new Date(checkedAt).toLocaleString()}
            </Text>
          ) : null}

          <Pressable
            onPress={() => void checkUpdates({ force: true })}
            disabled={checkingUpdate}
            accessibilityRole="button"
            accessibilityLabel="Check for Updates"
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            {checkingUpdate ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <RefreshCw size={18} color={colors.onPrimary} />
            )}
            <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: scaleFont(14) }}>
              {checkingUpdate ? 'Checking...' : 'Check for Updates'}
            </Text>
          </Pressable>

          {(latest || lastCheckFailed) ? (
            <View
              style={[
                styles.statusBox,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              {lastCheckFailed ? (
                <Text style={{ color: colors.danger, fontWeight: '700', fontSize: scaleFont(14) }}>
                  Update check failed: {lastCheckError || 'Network unavailable'}
                </Text>
              ) : hasNewerUpdate && latest ? (
                <>
                  <Text style={{ color: colors.primary, fontWeight: '700', fontSize: scaleFont(14) }}>
                    Update available: v{latest.version} (build {latest.versionCode})
                    {latest.apk ? ` · ${formatBytes(latest.apk.sizeBytes)}` : ''}
                  </Text>
                  {latest.apk?.sha256 ? (
                    <Text style={{ color: colors.textMuted, fontSize: scaleFont(11), marginTop: 4 }}>
                      SHA-256: {latest.apk.sha256.slice(0, 24)}...
                    </Text>
                  ) : null}
                  {latest.notes?.length ? (
                    <View style={{ marginTop: 6, gap: 2 }}>
                      {latest.notes.slice(0, 4).map((note, idx) => (
                        <Text key={idx} style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
                          • {note}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    onPress={() => openUpdateSheet(latest)}
                    accessibilityRole="button"
                    accessibilityLabel="Update Now"
                    style={[styles.primaryBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
                  >
                    <ArrowUpCircle size={18} color={colors.onPrimary} />
                    <Text style={{ color: colors.onPrimary, fontWeight: '800', fontSize: scaleFont(14) }}>
                      Update Now
                    </Text>
                  </Pressable>
                </>
              ) : latest ? (
                <Text style={{ color: colors.success, fontWeight: '700', fontSize: scaleFont(14) }}>
                  You are up to date (v{info.version}).
                </Text>
              ) : null}

              <Pressable
                onPress={() => void Linking.openURL(latest?.url || DOWNLOAD_PAGE_URL)}
                accessibilityRole="button"
                accessibilityLabel="Open Download Page"
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border, marginTop: 8 },
                ]}
              >
                <Download size={16} color={colors.primary} />
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
                  Open APK Download Page
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => void Linking.openURL(DOWNLOAD_PAGE_URL)}
              accessibilityRole="button"
              accessibilityLabel="Open Download Page"
              style={[
                styles.secondaryBtn,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <Download size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
                Open APK Download Page
              </Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          LOCAL STORAGE & DIAGNOSTICS
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <HardDrive size={18} color={colors.primary} />
            <Text style={[styles.cardTitle, { color: colors.text, fontSize: scaleFont(15) }]}>
              Local Vault Summary
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: scaleFont(13) }}>
            {stats
              ? `${stats.docCount} documents · ${stats.pageCount} pages · ${stats.signatureCount} signatures · ${stats.pendingSyncCount} pending sync · ${formatBytes(stats.imageBytes)} stored`
              : 'Loading local storage summary...'}
          </Text>

          <View style={styles.btnRow}>
            <Pressable
              onPress={() => void handleClearCache()}
              accessibilityRole="button"
              accessibilityLabel="Clear Temp Cache"
              style={[
                styles.secondaryBtn,
                { flex: 1, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <Trash2 size={16} color={colors.text} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
                Clear Temp Cache
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setShowDiagnostics((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showDiagnostics ? 'Hide Diagnostics' : 'View Diagnostics'}
              style={[
                styles.secondaryBtn,
                { flex: 1, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <FileText size={16} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
                {showDiagnostics ? 'Hide Diagnostics' : 'View Diagnostics'}
              </Text>
            </Pressable>
          </View>

          {cacheNotice ? (
            <Text style={{ color: colors.success, fontSize: scaleFont(12), fontWeight: '600' }}>
              {cacheNotice}
            </Text>
          ) : null}

          {showDiagnostics ? (
            <View
              style={[
                styles.diagBox,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <Text
                selectable
                style={{
                  color: colors.text,
                  fontSize: scaleFont(12),
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                }}
              >
                {diagnosticsText}
              </Text>
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => void handleCopyDiagnostics()}
                  accessibilityRole="button"
                  accessibilityLabel="Copy Diagnostics"
                  style={[
                    styles.secondaryBtn,
                    { flex: 1, backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Copy size={15} color={colors.primary} />
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
                    Copy Diagnostics
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleClearLog}
                  accessibilityRole="button"
                  accessibilityLabel="Clear Error Log"
                  style={[
                    styles.secondaryBtn,
                    { flex: 1, backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                >
                  <Trash2 size={15} color={colors.danger} />
                  <Text style={{ color: colors.danger, fontWeight: '600', fontSize: scaleFont(13) }}>
                    Clear Error Log
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {copyNotice ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Check size={14} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: scaleFont(12), fontWeight: '600' }}>
                {copyNotice}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          SUPPORT & LEGAL
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push('/privacy')}
            accessibilityRole="button"
            accessibilityLabel="Privacy What Leaves Your Device"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <Lock size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                Privacy: What Leaves Your Device
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => router.push({ pathname: '/report', params: { kind: 'bug' } })}
            accessibilityRole="button"
            accessibilityLabel="Report a Bug or Feature Request"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <Bug size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                Report a Bug or Feature Request
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => void Linking.openURL(GITHUB_REPO_URL)}
            accessibilityRole="button"
            accessibilityLabel="Open Source Repository on GitHub"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <ExternalLink size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                GitHub Source Repository
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => setShowLicenses((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="Open Source Licenses"
            accessibilityState={{ expanded: showLicenses }}
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <FileText size={18} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                Open Source Licenses
              </Text>
            </View>
            <Text style={{ color: colors.primary, fontWeight: '600', fontSize: scaleFont(13) }}>
              {showLicenses ? 'Hide' : 'View'}
            </Text>
          </Pressable>

          {showLicenses ? (
            <View style={{ gap: 8, marginTop: 6 }}>
              {LICENSES.map((item) => (
                <View
                  key={item.name}
                  style={[
                    styles.licenseRow,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(13) }}>
                      {item.name}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
                      {item.purpose}
                    </Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: colors.surface }]}>
                    <Text style={{ color: colors.primary, fontWeight: '700', fontSize: scaleFont(11) }}>
                      {item.license}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
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
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  appBadge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: { fontWeight: '800' },
  metaGrid: { borderTopWidth: 1, paddingTop: 10, gap: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700' },
  primaryBtn: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtn: {
    minHeight: 46,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  diagBox: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  navRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  divider: { height: 1 },
  licenseRow: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
