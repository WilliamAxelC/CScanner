import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUpCircle } from 'lucide-react-native';
import { useAppUpdateStore } from '../services/updates/appUpdate';
import { getInstalledAppInfo } from '../services/updates/updateChecker';
import { useTheme } from '../theme/ThemeProvider';

const formatMb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export function UpdateSheet() {
  const { colors, reduceMotion, scaleFont } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    status,
    progress,
    error,
    start,
    install,
    openPermissionSettings,
    cancel,
    sheet: manifest,
    closeSheet,
  } = useAppUpdateStore();
  const installed = getInstalledAppInfo();

  useEffect(() => {
    if (status !== 'needs-permission') return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') install();
    });
    return () => sub.remove();
  }, [status, install]);

  if (!manifest) return null;

  const busy = status === 'downloading' || status === 'verifying';
  const pct = Math.round(progress * 100);

  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={closeSheet}
    >
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          testID="update-sheet"
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom + 14, 18),
            },
          ]}
        >
          <View style={styles.head}>
            <ArrowUpCircle size={26} color={colors.primary} />
            <Text
              accessibilityRole="header"
              style={{
                color: colors.text,
                fontWeight: '800',
                fontSize: scaleFont(18),
                flex: 1,
              }}
            >
              CScanner {manifest.version}
            </Text>
          </View>

          <Text style={{ color: colors.textMuted, fontSize: scaleFont(13) }}>
            You have v{installed.version} (build {installed.versionCode}).
            {manifest.apk ? ` Download: ${formatMb(manifest.apk.sizeBytes)}.` : ''}
          </Text>

          {manifest.notes?.length ? (
            <View style={styles.notes}>
              {manifest.notes.map((n) => (
                <Text
                  key={n}
                  style={{ color: colors.text, fontSize: scaleFont(14), lineHeight: scaleFont(20) }}
                >
                  • {n}
                </Text>
              ))}
            </View>
          ) : null}

          {busy ? (
            <View style={styles.progressWrap}>
              <View
                style={[styles.bar, { backgroundColor: colors.border }]}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: 100, now: pct }}
              >
                <View
                  style={[
                    styles.fill,
                    { width: `${pct}%`, backgroundColor: colors.primary },
                  ]}
                />
              </View>
              <Text style={{ color: colors.textMuted, fontSize: scaleFont(13) }}>
                {status === 'verifying'
                  ? 'Verifying SHA-256 & package signature...'
                  : `Downloading... ${pct}%`}
              </Text>
            </View>
          ) : null}

          {status === 'needs-permission' ? (
            <Text style={[styles.message, { color: colors.text, fontSize: scaleFont(14) }]}>
              Android needs permission once: allow CScanner to install unknown apps, then return
              here. Only SHA-256 verified updates for {installed.packageId} are permitted.
            </Text>
          ) : null}

          {status === 'installing' ? (
            <Text style={[styles.message, { color: colors.text, fontSize: scaleFont(14) }]}>
              Android's installer is open. Tap Update there — all your local scans and PDFs remain
              untouched.
            </Text>
          ) : null}

          {status === 'error' && error ? (
            <Text
              accessibilityRole="alert"
              style={[styles.message, { color: colors.danger, fontSize: scaleFont(14) }]}
            >
              {error}
            </Text>
          ) : null}

          <View style={styles.buttons}>
            <Pressable
              onPress={busy ? () => void cancel() : closeSheet}
              accessibilityRole="button"
              accessibilityLabel={busy ? 'Cancel download' : 'Later'}
              style={[styles.btn, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}
            >
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(14) }}>
                {busy ? 'Cancel' : 'Later'}
              </Text>
            </Pressable>

            <Pressable
              disabled={busy}
              onPress={() => {
                if (status === 'needs-permission') openPermissionSettings();
                else if (status === 'installing') install();
                else void start(manifest);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                status === 'needs-permission'
                  ? 'Allow installing'
                  : status === 'installing'
                    ? 'Open installer again'
                    : 'Update now'
              }
              style={[
                styles.btn,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.primary,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text
                  style={{
                    color: colors.onPrimary,
                    fontWeight: '800',
                    fontSize: scaleFont(14),
                  }}
                >
                  {status === 'needs-permission'
                    ? 'Allow'
                    : status === 'installing'
                      ? 'Open installer'
                      : status === 'error'
                        ? 'Try again'
                        : 'Update now'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notes: {
    gap: 4,
    marginTop: 6,
  },
  progressWrap: {
    gap: 6,
    marginTop: 8,
  },
  bar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  message: {
    marginTop: 8,
    lineHeight: 20,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
