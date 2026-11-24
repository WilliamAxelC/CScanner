import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Bug,
  Check,
  Copy,
  ExternalLink,
  Lightbulb,
  ShieldCheck,
} from 'lucide-react-native';
import { buildDiagnosticsReport } from '../src/services/diagnostics/errorLog';
import {
  buildGitHubIssueUrl,
  buildReportMarkdown,
  copyTextToClipboard,
  validateReport,
  type ReportKind,
} from '../src/services/feedback/reportBuilder';
import { storage } from '../src/storage';
import type { StorageStats } from '../src/storage/types';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string }>();
  const { colors, scaleFont } = useTheme();
  const settings = useAppStore((s) => s.settings);

  const initialKind: ReportKind =
    params.kind === 'feature' ? 'feature' : 'bug';
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    storage.getStorageStats?.().then(setStats).catch(() => {});
  }, []);

  const diagnostics = useMemo(
    () =>
      includeDiagnostics
        ? buildDiagnosticsReport({ settings, stats, includeErrors: true })
        : undefined,
    [includeDiagnostics, settings, stats],
  );

  const markdownPreview = useMemo(
    () =>
      buildReportMarkdown({
        kind,
        title: title || '(Enter summary title)',
        description: description || '(Enter details)',
        diagnostics,
      }),
    [kind, title, description, diagnostics],
  );

  const handleOpenGitHub = async () => {
    setNotice(null);
    const err = validateReport({ kind, title, description });
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    const url = buildGitHubIssueUrl({ kind, title, description, diagnostics });
    try {
      await Linking.openURL(url);
      setNotice('Opened pre-filled GitHub issue form in your browser.');
    } catch {
      const copied = await copyTextToClipboard(
        buildReportMarkdown({ kind, title, description, diagnostics }),
      );
      setErrorMsg(
        copied === 'copied'
          ? 'Could not launch browser directly; report Markdown was copied to your clipboard.'
          : 'Unable to open browser on this device.',
      );
    }
  };

  const handleCopyMarkdown = async () => {
    const err = validateReport({ kind, title, description });
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg(null);
    const md = buildReportMarkdown({ kind, title, description, diagnostics });
    const res = await copyTextToClipboard(md);
    if (res === 'failed') {
      setErrorMsg('Unable to copy report to clipboard on this device.');
    } else {
      setNotice(
        res === 'copied'
          ? 'Report Markdown copied to clipboard.'
          : 'Opened share sheet with report Markdown.',
      );
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
          Bug Report & Feature Request
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
            Feedback Type
          </Text>
          <View style={styles.segmentRow}>
            <Pressable
              onPress={() => {
                setKind('bug');
                setErrorMsg(null);
              }}
              accessibilityRole="radio"
              accessibilityLabel="Bug Report"
              accessibilityState={{ selected: kind === 'bug', checked: kind === 'bug' }}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: kind === 'bug' ? colors.primarySoft : colors.surfaceMuted,
                  borderColor: kind === 'bug' ? colors.primary : colors.border,
                },
              ]}
            >
              <Bug size={16} color={kind === 'bug' ? colors.primary : colors.textSecondary} />
              <Text
                style={{
                  color: kind === 'bug' ? colors.primary : colors.text,
                  fontWeight: '700',
                  fontSize: scaleFont(14),
                }}
              >
                Bug Report
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setKind('feature');
                setErrorMsg(null);
              }}
              accessibilityRole="radio"
              accessibilityLabel="Feature Request"
              accessibilityState={{ selected: kind === 'feature', checked: kind === 'feature' }}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: kind === 'feature' ? colors.primarySoft : colors.surfaceMuted,
                  borderColor: kind === 'feature' ? colors.primary : colors.border,
                },
              ]}
            >
              <Lightbulb
                size={16}
                color={kind === 'feature' ? colors.primary : colors.textSecondary}
              />
              <Text
                style={{
                  color: kind === 'feature' ? colors.primary : colors.text,
                  fontWeight: '700',
                  fontSize: scaleFont(14),
                }}
              >
                Feature Request
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
            Summary Title
          </Text>
          <TextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder={
              kind === 'bug'
                ? 'e.g., Export PDF fails with large gallery image'
                : 'e.g., Add batch tag editor on main library'
            }
            placeholderTextColor={colors.textMuted}
            maxLength={140}
            accessibilityLabel="Summary Title"
            style={[
              styles.input,
              {
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                fontSize: scaleFont(14),
              },
            ]}
          />

          <Text style={[styles.label, { color: colors.textSecondary, fontSize: scaleFont(13) }]}>
            {kind === 'bug' ? 'Steps to Reproduce & What Happened' : 'Use Case & Details'}
          </Text>
          <TextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              if (errorMsg) setErrorMsg(null);
            }}
            placeholder={
              kind === 'bug'
                ? '1. Tap Scan...\n2. Expected vs actual behavior...'
                : 'Describe how this would improve your scanning workflow...'
            }
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={4000}
            textAlignVertical="top"
            accessibilityLabel="Report Details"
            style={[
              styles.textarea,
              {
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
                fontSize: scaleFont(14),
              },
            ]}
          />
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(15) }}>
                Attach Sanitized Diagnostics
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: scaleFont(12), marginTop: 2 }}>
                Includes app version, platform, display settings, store counts, and redacted recent error messages.
              </Text>
            </View>
            <Switch
              value={includeDiagnostics}
              onValueChange={setIncludeDiagnostics}
              accessibilityRole="switch"
              accessibilityLabel="Attach Sanitized Diagnostics"
              accessibilityState={{ checked: includeDiagnostics }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.privacyNote, { backgroundColor: colors.primarySoft }]}>
            <ShieldCheck size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: scaleFont(12), flex: 1, fontWeight: '600' }}>
              Scan images, document titles, OCR text, and Google tokens are never included. Tokens, emails, and file paths are automatically scrubbed.
            </Text>
          </View>

          <Pressable
            onPress={() => setShowPreview((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showPreview ? 'Hide Payload Preview' : 'Show Payload Preview'}
            style={[
              styles.secondaryBtn,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
            ]}
          >
            <Text style={{ color: colors.text, fontWeight: '600', fontSize: scaleFont(13) }}>
              {showPreview ? 'Hide Payload Preview' : 'Preview Exact Report Payload'}
            </Text>
          </Pressable>

          {showPreview ? (
            <View
              style={[
                styles.previewBox,
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
                {markdownPreview}
              </Text>
            </View>
          ) : null}
        </View>

        {errorMsg ? (
          <View
            accessibilityRole="alert"
            style={[styles.alertBox, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: scaleFont(13) }}>
              {errorMsg}
            </Text>
          </View>
        ) : null}

        {notice ? (
          <View
            style={[styles.alertBox, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Check size={16} color={colors.primary} />
              <Text style={{ color: colors.primary, fontWeight: '700', fontSize: scaleFont(13), flex: 1 }}>
                {notice}
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={() => void handleOpenGitHub()}
          accessibilityRole="button"
          accessibilityLabel="Open Pre-filled GitHub Issue"
          style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
        >
          <ExternalLink size={18} color={colors.onPrimary} />
          <Text style={{ color: colors.onPrimary, fontWeight: '700', fontSize: scaleFont(15) }}>
            Open Pre-filled GitHub Issue
          </Text>
        </Pressable>

        <Pressable
          onPress={() => void handleCopyMarkdown()}
          accessibilityRole="button"
          accessibilityLabel="Copy Report Markdown"
          style={[
            styles.secondaryBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 48 },
          ]}
        >
          <Copy size={16} color={colors.primary} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(14) }}>
            Copy Report Markdown
          </Text>
        </Pressable>
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
  headerTitle: { fontWeight: '800', flex: 1 },
  scroll: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  label: { fontWeight: '700', marginTop: 4 },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segmentBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  textarea: {
    minHeight: 130,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 48,
  },
  privacyNote: {
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  alertBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
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
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
});
