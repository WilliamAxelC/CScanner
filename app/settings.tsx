import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Cloud,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Smartphone,
  Trash2,
} from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ResolvedImage } from '../src/components/ResolvedImage';
import { SignaturePad } from '../src/components/SignaturePad';
import { useGoogleDriveAuth } from '../src/services/sync/googleAuth';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';
import type {
  FilterPreset,
  PageSizePreset,
  QualityPreset,
  ThemeMode,
} from '../src/types/models';
import { formatDateTime } from '../src/utils/format';

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const settings = useAppStore((s) => s.settings);
  const signatures = useAppStore((s) => s.signatures);
  const syncState = useAppStore((s) => s.syncState);
  const lastSyncError = useAppStore((s) => s.lastSyncError);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);

  const updateSettings = useAppStore((s) => s.updateSettings);
  const triggerSync = useAppStore((s) => s.triggerSync);
  const saveNewSignature = useAppStore((s) => s.saveNewSignature);
  const deleteSignature = useAppStore((s) => s.deleteSignature);

  const { configured, requestReady, token, signIn, signOut } =
    useGoogleDriveAuth();

  const [authMsg, setAuthMsg] = useState<string | null>(null);
  const [showSigPad, setShowSigPad] = useState(false);

  const handleSignIn = async () => {
    setAuthMsg(null);
    try {
      const res = await signIn();
      if (res?.type === 'success' && res.authentication?.accessToken) {
        await triggerSync(res.authentication.accessToken);
      }
    } catch (err) {
      setAuthMsg(err instanceof Error ? err.message : 'Sign-in failed');
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Settings
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Google Drive Sync */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowBetween}>
            <View style={styles.titleIconRow}>
              <Cloud size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Google Drive Sync
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              drive.file
            </Text>
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
            Offline-first sync stores PDFs visibly in My Drive/CScanner/ and lossless page metadata in My Drive/CScanner/.cscanner-meta/.
          </Text>

          {!configured && (
            <View
              style={[
                styles.infoBox,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 17 }}>
                OAuth client IDs are not configured in this build (.env). CScanner works 100% offline locally without an account. To enable Google Drive sync, set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID.
              </Text>
            </View>
          )}

          {token ? (
            <>
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600' }}>
                Connected{token.email ? `: ${token.email}` : ''}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Pending changes: {pendingSyncCount} • Last synced:{' '}
                {settings.lastSyncAt
                  ? formatDateTime(settings.lastSyncAt)
                  : 'Never'}
              </Text>
              {lastSyncError && (
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {lastSyncError}
                </Text>
              )}
              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => triggerSync(token.accessToken)}
                  disabled={syncState === 'syncing'}
                  style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
                >
                  {syncState === 'syncing' ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <RefreshCw size={15} color="#FFFFFF" />
                      <Text style={styles.btnWhite}>Sync Now</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={signOut}
                  style={[
                    styles.secondaryBtn,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <LogOut size={15} color={colors.text} />
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                    Sign Out
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              onPress={handleSignIn}
              disabled={!configured || !requestReady}
              style={[
                styles.primaryBtn,
                {
                  backgroundColor:
                    configured && requestReady
                      ? colors.primary
                      : colors.border,
                },
              ]}
            >
              <LogIn size={16} color="#FFFFFF" />
              <Text style={styles.btnWhite}>Connect Google Drive</Text>
            </Pressable>
          )}

          {authMsg && (
            <Text style={{ color: colors.danger, fontSize: 12 }}>{authMsg}</Text>
          )}
        </View>

        {/* Scan & Export Defaults */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Scan & Export Defaults
          </Text>

          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                Auto-run On-Device OCR
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                Index text automatically after scanning pages
              </Text>
            </View>
            <Switch
              value={settings.autoOcr}
              onValueChange={(v) => updateSettings({ autoOcr: v })}
              trackColor={{ true: colors.primary }}
            />
          </View>

          <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
            Default Filter Preset
          </Text>
          <View style={styles.wrapRow}>
            {(
              [
                'original',
                'magic',
                'bw',
                'grayscale',
                'lighten',
              ] as FilterPreset[]
            ).map((f) => (
              <Pressable
                key={f}
                onPress={() => updateSettings({ defaultFilter: f })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      settings.defaultFilter === f
                        ? colors.primary
                        : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      settings.defaultFilter === f ? '#FFFFFF' : colors.text,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
            Default PDF Size
          </Text>
          <View style={styles.wrapRow}>
            {(['auto', 'a4', 'letter'] as PageSizePreset[]).map((sz) => (
              <Pressable
                key={sz}
                onPress={() => updateSettings({ defaultPageSize: sz })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      settings.defaultPageSize === sz
                        ? colors.primary
                        : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      settings.defaultPageSize === sz ? '#FFFFFF' : colors.text,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {sz.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
            Default Compression Quality
          </Text>
          <View style={styles.wrapRow}>
            {(['low', 'medium', 'high'] as QualityPreset[]).map((q) => (
              <Pressable
                key={q}
                onPress={() => updateSettings({ defaultQuality: q })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      settings.defaultQuality === q
                        ? colors.primary
                        : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      settings.defaultQuality === q ? '#FFFFFF' : colors.text,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {q}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Appearance */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Appearance
          </Text>
          <View style={styles.wrapRow}>
            {(['system', 'light', 'dark'] as ThemeMode[]).map((m) => (
              <Pressable
                key={m}
                onPress={() => updateSettings({ theme: m })}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      settings.theme === m
                        ? colors.primary
                        : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color: settings.theme === m ? '#FFFFFF' : colors.text,
                    fontSize: 12,
                    fontWeight: '700',
                  }}
                >
                  {m.charAt(0).toUpperCase() + m.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Saved Signatures */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <View style={styles.rowBetween}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Saved Signatures
            </Text>
            <Pressable
              onPress={() => setShowSigPad(true)}
              style={[styles.chip, { backgroundColor: colors.primary }]}
            >
              <Plus size={14} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                Add
              </Text>
            </Pressable>
          </View>

          {signatures.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              No saved signatures yet.
            </Text>
          ) : (
            signatures.map((sig) => (
              <View
                key={sig.id}
                style={[
                  styles.sigRow,
                  { borderColor: colors.border },
                ]}
              >
                <View style={styles.sigThumb}>
                  <ResolvedImage
                    uri={sig.pngUri}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
                <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>
                  {sig.name}
                </Text>
                <Pressable onPress={() => deleteSignature(sig.id)}>
                  <Trash2 size={17} color={colors.danger} />
                </Pressable>
              </View>
            ))
          )}
        </View>

        {Platform.OS === 'web' && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.titleIconRow}>
              <Smartphone size={18} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Android App (APK)
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              Want native Google ML Kit edge detection, document scanning, and SQLite FTS5 on Android? Grab the sideloadable APK directly from the download page.
            </Text>
            <Pressable
              onPress={() => {
                const base = (process.env.EXPO_PUBLIC_BASE_URL || '').replace(
                  /\/+$/,
                  '',
                );
                if (typeof window !== 'undefined') {
                  window.location.assign(`${base}/download/`);
                }
              }}
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            >
              <Smartphone size={16} color="#FFFFFF" />
              <Text style={styles.btnWhite}>Download Android APK</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showSigPad}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSigPad(false)}
      >
        <View
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View style={{ width: '100%', maxWidth: 420 }}>
            <SignaturePad
              onCancel={() => setShowSigPad(false)}
              onSave={async (res) => {
                await saveNewSignature(res);
                setShowSigPad(false);
              }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 6 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: {
    padding: 16,
    gap: 14,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 40,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  subLabel: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
  },
  infoBox: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
  },
  btnWhite: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  sigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sigThumb: {
    width: 80,
    height: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    overflow: 'hidden',
    padding: 2,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
});
