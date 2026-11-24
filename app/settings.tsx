import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Accessibility,
  ArrowLeft,
  Bug,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  Info,
  Lightbulb,
  Lock,
  Monitor,
  Moon,
  PenTool,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
} from 'lucide-react-native';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { SignaturePad } from '../src/components/SignaturePad';
import {
  isGoogleOAuthConfigured,
  useGoogleDriveAuth,
} from '../src/services/sync/googleAuth';
import {
  DOWNLOAD_PAGE_URL,
  getInstalledAppInfo,
} from '../src/services/updates/updateChecker';
import { storage } from '../src/storage';
import type { StorageStats } from '../src/storage/types';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';
import type {
  FilterPreset,
  PageSizePreset,
  QualityPreset,
  ThemeMode,
} from '../src/types/models';

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: 'system' | 'light' | 'dark' }[] = [
  { value: 'system', label: 'System', icon: 'system' },
  { value: 'light', label: 'Light', icon: 'light' },
  { value: 'dark', label: 'Dark', icon: 'dark' },
];

const FILTERS: { value: FilterPreset; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'magic', label: 'Magic' },
  { value: 'bw', label: 'B&W' },
  { value: 'grayscale', label: 'Gray' },
  { value: 'lighten', label: 'Lighten' },
];

const PAGE_SIZES: { value: PageSizePreset; label: string }[] = [
  { value: 'auto', label: 'Auto Fit' },
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
];

const QUALITIES: { value: QualityPreset; label: string }[] = [
  { value: 'low', label: 'Small' },
  { value: 'medium', label: 'Balanced' },
  { value: 'high', label: 'High' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, reduceMotion, scaleFont } = useTheme();

  const settings = useAppStore((s) => s.settings);
  const signatures = useAppStore((s) => s.signatures);
  const syncState = useAppStore((s) => s.syncState);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);
  const lastSyncError = useAppStore((s) => s.lastSyncError);

  const updateSettings = useAppStore((s) => s.updateSettings);
  const saveNewSignature = useAppStore((s) => s.saveNewSignature);
  const deleteSignature = useAppStore((s) => s.deleteSignature);
  const triggerSync = useAppStore((s) => s.triggerSync);
  const clearLocalCache = useAppStore((s) => s.clearLocalCache);
  const eraseAllData = useAppStore((s) => s.eraseAllData);

  const auth = useGoogleDriveAuth();
  const oauthConfigured = isGoogleOAuthConfigured();
  const appInfo = getInstalledAppInfo();

  const [showSigPad, setShowSigPad] = useState(false);
  const [confirmDeleteSig, setConfirmDeleteSig] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showEraseModal, setShowEraseModal] = useState(false);
  const [erasePhrase, setErasePhrase] = useState('');
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const loadStats = async () => {
    try {
      if (storage.getStorageStats) {
        setStats(await storage.getStorageStats());
      }
    } catch {
      // ignore stat read failure
    }
  };

  useEffect(() => {
    void loadStats();
  }, [signatures.length, pendingSyncCount]);

  useEffect(() => {
    if (auth.token?.email && auth.token.email !== settings.googleEmail) {
      void updateSettings({ googleEmail: auth.token.email });
    }
  }, [auth.token?.email, settings.googleEmail, updateSettings]);

  const handleSignInAndSync = async () => {
    setErrorNotice(null);
    setStatusNotice(null);
    if (!oauthConfigured) {
      setErrorNotice(
        'Google OAuth Client ID is not configured in this build. Documents continue working 100% offline.',
      );
      return;
    }
    try {
      const res = await auth.signIn();
      if (res.type === 'success' && res.authentication?.accessToken) {
        await triggerSync(res.authentication.accessToken);
        setStatusNotice('Google Drive sync completed.');
      }
    } catch (e) {
      setErrorNotice(e instanceof Error ? e.message : 'Google sign-in failed');
    }
  };

  const handleSyncNow = async () => {
    setErrorNotice(null);
    setStatusNotice(null);
    if (!auth.token) {
      await handleSignInAndSync();
      return;
    }
    const res = await triggerSync(auth.token.accessToken);
    if (res) {
      setStatusNotice(`Pushed ${res.pushedDocs} and pulled ${res.pulledDocs} documents.`);
    }
  };

  const handleSignOut = () => {
    auth.signOut();
    void updateSettings({ googleEmail: undefined });
    setStatusNotice('Signed out of Google Drive.');
  };

  const handleDeleteSigRequest = (sig: { id: string; name: string }) => {
    if (settings.confirmBeforeDelete) {
      setConfirmDeleteSig(sig);
    } else {
      void deleteSignature(sig.id);
    }
  };

  const handleClearCache = async () => {
    const removed = await clearLocalCache();
    setErrorNotice(null);
    setStatusNotice(
      removed > 0
        ? `Removed ${removed} temporary cache file${removed === 1 ? '' : 's'}.`
        : 'Cache is already clean.',
    );
    await loadStats();
  };

  const handleEraseAllConfirmed = async () => {
    if (erasePhrase.trim().toUpperCase() !== 'ERASE') return;
    setShowEraseModal(false);
    setErasePhrase('');
    auth.signOut();
    await eraseAllData();
    await loadStats();
    setErrorNotice(null);
    setStatusNotice('All local documents, signatures, and sync records have been erased.');
  };

  const accessibilitySummary = `${Math.round(settings.fontScale * 100)}% text · ${
    settings.highContrast ? 'High Contrast' : 'Standard Contrast'
  }${settings.reduceMotion ? ' · Reduce Motion' : ''}`;

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
          Settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {statusNotice ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: colors.primarySoft, borderColor: colors.primary },
            ]}
          >
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: scaleFont(13) }}>
              {statusNotice}
            </Text>
          </View>
        ) : null}

        {errorNotice ? (
          <View
            accessibilityRole="alert"
            style={[
              styles.banner,
              { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
            ]}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: scaleFont(13) }}>
              {errorNotice}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          APPEARANCE & ACCESSIBILITY
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
            Theme
          </Text>
          <View style={styles.chipRow}>
            {THEME_OPTIONS.map((t) => {
              const selected = settings.theme === t.value;
              const Icon =
                t.icon === 'system' ? Monitor : t.icon === 'light' ? Sun : Moon;
              return (
                <Pressable
                  key={t.value}
                  onPress={() => void updateSettings({ theme: t.value })}
                  accessibilityRole="radio"
                  accessibilityLabel={`Theme ${t.label}`}
                  accessibilityState={{ selected, checked: selected }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Icon size={15} color={selected ? colors.primary : colors.textSecondary} />
                  <Text
                    style={{
                      color: selected ? colors.primary : colors.text,
                      fontWeight: selected ? '700' : '600',
                      fontSize: scaleFont(13),
                    }}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => router.push('/accessibility')}
            accessibilityRole="button"
            accessibilityLabel="Accessibility"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <View style={[styles.navIcon, { backgroundColor: colors.primarySoft }]}>
                <Accessibility size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                  Accessibility
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12), marginTop: 2 }}>
                  {accessibilitySummary}
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          SCAN & EXPORT DEFAULTS
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
            Default Filter
          </Text>
          <View style={styles.chipRow}>
            {FILTERS.map((f) => {
              const selected = settings.defaultFilter === f.value;
              return (
                <Pressable
                  key={f.value}
                  onPress={() => void updateSettings({ defaultFilter: f.value })}
                  accessibilityRole="radio"
                  accessibilityLabel={`Default Filter ${f.label}`}
                  accessibilityState={{ selected, checked: selected }}
                  style={[
                    styles.chip,
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
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.label,
              { color: colors.textSecondary, marginTop: 10, fontSize: scaleFont(13) },
            ]}
          >
            Default PDF Page Size
          </Text>
          <View style={styles.chipRow}>
            {PAGE_SIZES.map((p) => {
              const selected = settings.defaultPageSize === p.value;
              return (
                <Pressable
                  key={p.value}
                  onPress={() => void updateSettings({ defaultPageSize: p.value })}
                  accessibilityRole="radio"
                  accessibilityLabel={`Default Page Size ${p.label}`}
                  accessibilityState={{ selected, checked: selected }}
                  style={[
                    styles.chip,
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
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text
            style={[
              styles.label,
              { color: colors.textSecondary, marginTop: 10, fontSize: scaleFont(13) },
            ]}
          >
            Export JPEG Quality
          </Text>
          <View style={styles.chipRow}>
            {QUALITIES.map((q) => {
              const selected = settings.defaultQuality === q.value;
              return (
                <Pressable
                  key={q.value}
                  onPress={() => void updateSettings({ defaultQuality: q.value })}
                  accessibilityRole="radio"
                  accessibilityLabel={`Export Quality ${q.label}`}
                  accessibilityState={{ selected, checked: selected }}
                  style={[
                    styles.chip,
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
                    {q.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.switchRow, { borderTopColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(14) }}>
                Auto-run OCR on new scans
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(12), marginTop: 2 }}>
                Extracts searchable text immediately in background
              </Text>
            </View>
            <Switch
              value={settings.autoOcr}
              onValueChange={(val) => void updateSettings({ autoOcr: val })}
              accessibilityRole="switch"
              accessibilityLabel="Auto-run OCR on new scans"
              accessibilityState={{ checked: settings.autoOcr }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          SAVED SIGNATURES ({signatures.length})
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => setShowSigPad(true)}
            accessibilityRole="button"
            accessibilityLabel="Add Signature"
            style={[styles.smallBtn, { backgroundColor: colors.primarySoft, alignSelf: 'flex-start' }]}
          >
            <Plus size={15} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: scaleFont(13) }}>
              Add Signature
            </Text>
          </Pressable>

          {signatures.length === 0 ? (
            <View style={styles.emptySig}>
              <PenTool size={22} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(13) }}>
                No saved signatures yet
              </Text>
            </View>
          ) : (
            signatures.map((sig) => (
              <View
                key={sig.id}
                style={[styles.sigRow, { borderTopColor: colors.border }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                  {sig.name}
                </Text>
                <Pressable
                  onPress={() => handleDeleteSigRequest({ id: sig.id, name: sig.name })}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete signature ${sig.name}`}
                  style={[styles.trashBtn, { backgroundColor: colors.dangerSoft }]}
                >
                  <Trash2 size={16} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          LOCAL STORAGE & GOOGLE DRIVE SYNC
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.syncStatusRow}>
            {auth.token ? (
              <Cloud size={22} color={colors.primary} />
            ) : (
              <CloudOff size={22} color={colors.textMuted} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                {auth.token
                  ? settings.googleEmail || 'Connected to Google Drive'
                  : 'Offline Mode (Drive not connected)'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12), marginTop: 2 }}>
                {pendingSyncCount > 0
                  ? `${pendingSyncCount} item(s) waiting in local sync queue`
                  : settings.lastSyncAt
                    ? `Last synced ${new Date(settings.lastSyncAt).toLocaleString()}`
                    : 'Only app-created files under drive.file scope'}
              </Text>
            </View>
          </View>

          {lastSyncError ? (
            <Text style={{ color: colors.danger, fontSize: scaleFont(12) }}>
              Last sync error: {lastSyncError}
            </Text>
          ) : null}

          <View style={styles.btnRow}>
            {auth.token ? (
              <>
                <Pressable
                  onPress={() => void handleSyncNow()}
                  disabled={syncState === 'syncing'}
                  accessibilityRole="button"
                  accessibilityLabel="Sync Now"
                  style={[styles.primaryBtn, { flex: 1, backgroundColor: colors.primary }]}
                >
                  {syncState === 'syncing' ? (
                    <ActivityIndicator color={colors.onPrimary} size="small" />
                  ) : (
                    <RefreshCw size={16} color={colors.onPrimary} />
                  )}
                  <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: scaleFont(14) }}>
                    Sync Now
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleSignOut}
                  accessibilityRole="button"
                  accessibilityLabel="Sign Out of Google Drive"
                  style={[
                    styles.secondaryBtn,
                    { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                  ]}
                >
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                    Sign Out
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => void handleSignInAndSync()}
                accessibilityRole="button"
                accessibilityLabel={
                  oauthConfigured ? 'Sign in with Google Drive' : 'Google OAuth Not Configured'
                }
                style={[
                  styles.primaryBtn,
                  {
                    flex: 1,
                    backgroundColor: oauthConfigured ? colors.primary : colors.surfaceMuted,
                    borderWidth: oauthConfigured ? 0 : 1,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Cloud
                  size={16}
                  color={oauthConfigured ? colors.onPrimary : colors.textSecondary}
                />
                <Text
                  style={{
                    color: oauthConfigured ? colors.onPrimary : colors.text,
                    fontWeight: '700',
                    fontSize: scaleFont(14),
                  }}
                >
                  {oauthConfigured
                    ? 'Sign in with Google Drive'
                    : 'Google OAuth Not Configured'}
                </Text>
              </Pressable>
            )}
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
            {stats
              ? `Local Vault: ${stats.docCount} documents · ${stats.pageCount} pages · ${stats.signatureCount} signatures`
              : 'Calculating local vault usage...'}
          </Text>
          <View style={styles.btnRow}>
            <Pressable
              onPress={() => void handleClearCache()}
              accessibilityRole="button"
              accessibilityLabel="Clear Cache"
              style={[
                styles.secondaryBtn,
                { flex: 1, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
                Clear Cache
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setErasePhrase('');
                setShowEraseModal(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Erase All Data"
              style={[
                styles.secondaryBtn,
                { flex: 1, backgroundColor: colors.dangerSoft, borderColor: colors.danger },
              ]}
            >
              <Trash2 size={15} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: scaleFont(13) }}>
                Erase All Data
              </Text>
            </Pressable>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          SUPPORT & FEEDBACK
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push({ pathname: '/report', params: { kind: 'bug' } })}
            accessibilityRole="button"
            accessibilityLabel="Report a Bug"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <View style={[styles.navIcon, { backgroundColor: colors.primarySoft }]}>
                <Bug size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                  Report a Bug
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
                  Pre-filled GitHub report with sanitized diagnostics
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => router.push({ pathname: '/report', params: { kind: 'feature' } })}
            accessibilityRole="button"
            accessibilityLabel="Request a Feature"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <View style={[styles.navIcon, { backgroundColor: colors.primarySoft }]}>
                <Lightbulb size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                  Request a Feature
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
                  Suggest workflow improvements or new export tools
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Pressable
            onPress={() => router.push('/privacy')}
            accessibilityRole="button"
            accessibilityLabel="Privacy What Leaves Your Device"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <View style={[styles.navIcon, { backgroundColor: colors.primarySoft }]}>
                <Lock size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                  Privacy: What Leaves Your Device
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
                  Full transparency of every optional network call
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted, fontSize: scaleFont(12) }]}>
          ABOUT
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push('/app-info')}
            accessibilityRole="button"
            accessibilityLabel="App Info"
            style={styles.navRow}
          >
            <View style={styles.navLeft}>
              <View style={[styles.navIcon, { backgroundColor: colors.primarySoft }]}>
                <Info size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                  App Info
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12) }}>
                  Version {appInfo.version} (build {appInfo.versionCode}) · Updates & Licenses
                </Text>
              </View>
            </View>
            <ChevronRight size={18} color={colors.textMuted} />
          </Pressable>

          {Platform.OS === 'web' ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <Pressable
                onPress={() => void Linking.openURL(DOWNLOAD_PAGE_URL)}
                accessibilityRole="button"
                accessibilityLabel="Download Android APK"
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                <Download size={16} color={colors.onPrimary} />
                <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: scaleFont(14) }}>
                  Download Android APK
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={showSigPad}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setShowSigPad(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <SignaturePad
              onCancel={() => setShowSigPad(false)}
              onSave={async (res) => {
                await saveNewSignature({
                  name: `Signature ${signatures.length + 1}`,
                  svgPathData: res.svgPathData,
                  pngBytes: res.pngBytes,
                  width: res.width,
                  height: res.height,
                });
                setShowSigPad(false);
              }}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEraseModal}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setShowEraseModal(false)}
      >
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View
            style={[
              styles.eraseCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={{ color: colors.danger, fontWeight: '800', fontSize: scaleFont(17) }}
            >
              Erase All Local Data?
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: scaleFont(14), lineHeight: 20 }}>
              This permanently removes all folders, scanned documents, pages, saved signatures, and
              sync queue records from this device. Type ERASE below to confirm.
            </Text>
            <TextInput
              value={erasePhrase}
              onChangeText={setErasePhrase}
              placeholder="Type ERASE"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              accessibilityLabel="Confirmation phrase"
              style={[
                styles.eraseInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                  fontSize: scaleFont(14),
                },
              ]}
            />
            <View style={styles.btnRow}>
              <Pressable
                onPress={() => setShowEraseModal(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel Erase"
                style={[
                  styles.secondaryBtn,
                  { flex: 1, backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(14) }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={() => void handleEraseAllConfirmed()}
                disabled={erasePhrase.trim().toUpperCase() !== 'ERASE'}
                accessibilityRole="button"
                accessibilityLabel="Confirm Erase All Data"
                style={[
                  styles.primaryBtn,
                  {
                    flex: 1,
                    backgroundColor: colors.danger,
                    opacity: erasePhrase.trim().toUpperCase() === 'ERASE' ? 1 : 0.45,
                  },
                ]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: scaleFont(14) }}>
                  Erase Everything
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={Boolean(confirmDeleteSig)}
        title="Delete Saved Signature?"
        message={`Remove "${confirmDeleteSig?.name ?? ''}" from saved signatures?`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteSig(null)}
        onConfirm={() => {
          if (confirmDeleteSig) {
            void deleteSignature(confirmDeleteSig.id);
          }
          setConfirmDeleteSig(null);
        }}
      />
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
  banner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  label: { fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 6,
    minHeight: 48,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  emptySig: { alignItems: 'center', paddingVertical: 14, gap: 6 },
  sigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 10,
    minHeight: 48,
  },
  trashBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
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
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  navRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  navIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: 1, marginVertical: 4 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 18, padding: 16, maxHeight: '85%' },
  eraseCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  eraseInput: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
});
