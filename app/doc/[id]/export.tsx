import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Download, Lock, Share2 } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { exportAndShareDocument } from '../../../src/services/pdf/shareExport';
import { useAppStore } from '../../../src/store/useAppStore';
import { useTheme } from '../../../src/theme/ThemeProvider';
import type { PageSizePreset, QualityPreset } from '../../../src/types/models';
import { formatBytes } from '../../../src/utils/format';

import { getPagesForDoc } from '../../../src/utils/security';

export default function ExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const documents = useAppStore((s) => s.documents);
  const pagesByDoc = useAppStore((s) => s.pagesByDoc);
  const settings = useAppStore((s) => s.settings);

  const doc = documents.find((d) => d.id === id);
  const pages = doc ? getPagesForDoc(pagesByDoc, doc.id) : [];

  const [format, setFormat] = useState<'pdf' | 'jpeg'>('pdf');
  const [pageSize, setPageSize] = useState<PageSizePreset>(
    settings.defaultPageSize,
  );
  const [quality, setQuality] = useState<QualityPreset>(settings.defaultQuality);
  const [includeOcrLayer, setIncludeOcrLayer] = useState(true);
  const [protectPdf, setProtectPdf] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  if (!doc) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
      >
        <View style={styles.centerEmpty}>
          <Text style={{ color: colors.text }}>Document not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleExport = async () => {
    setError(null);
    setDoneMsg(null);
    if (pages.length === 0) {
      setError('Document has no pages to export.');
      return;
    }
    if (format === 'pdf' && protectPdf) {
      if (!password.trim()) {
        setError('Please enter a password to encrypt the PDF.');
        return;
      }
      if (password !== confirmPw) {
        setError('Passwords do not match.');
        return;
      }
    }

    setBusy(true);
    try {
      const res = await exportAndShareDocument(doc, pages, {
        format,
        pageSize,
        quality,
        includeOcrLayer,
        password: format === 'pdf' && protectPdf ? password : undefined,
      });
      setDoneMsg(`Exported ${res.fileName} (${formatBytes(res.byteLength)})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
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
          Export & Share
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            {doc.title}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            {pages.length} {pages.length === 1 ? 'page' : 'pages'} ready to export
          </Text>
        </View>

        {/* Format */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            Output Format
          </Text>
          <View style={styles.segRow}>
            {(
              [
                { id: 'pdf', label: 'PDF Document' },
                { id: 'jpeg', label: 'JPEG Images' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => setFormat(opt.id)}
                style={[
                  styles.segBtn,
                  {
                    backgroundColor:
                      format === opt.id ? colors.primary : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color: format === opt.id ? '#FFFFFF' : colors.text,
                    fontWeight: '700',
                    fontSize: 13,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Page Size (PDF only) */}
        {format === 'pdf' && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              PDF Page Size
            </Text>
            <View style={styles.segRow}>
              {(
                [
                  { id: 'auto', label: 'Auto' },
                  { id: 'a4', label: 'A4' },
                  { id: 'letter', label: 'Letter' },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.id}
                  onPress={() => setPageSize(opt.id)}
                  style={[
                    styles.segBtn,
                    {
                      backgroundColor:
                        pageSize === opt.id
                          ? colors.primary
                          : colors.surfaceMuted,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: pageSize === opt.id ? '#FFFFFF' : colors.text,
                      fontWeight: '700',
                      fontSize: 13,
                    }}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Quality / File Size */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionLabel, { color: colors.text }]}>
            Compression & File Size
          </Text>
          <View style={styles.segRow}>
            {(
              [
                { id: 'low', label: 'Small (Low)' },
                { id: 'medium', label: 'Balanced' },
                { id: 'high', label: 'High Quality' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => setQuality(opt.id)}
                style={[
                  styles.segBtn,
                  {
                    backgroundColor:
                      quality === opt.id ? colors.primary : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color: quality === opt.id ? '#FFFFFF' : colors.text,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* PDF Features: Searchable OCR + AES-256 Encryption */}
        {format === 'pdf' && (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.sectionLabel, { color: colors.text }]}>
                  Searchable OCR Text Layer
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Embeds invisible selectable text from on-device OCR
                </Text>
              </View>
              <Switch
                value={includeOcrLayer}
                onValueChange={setIncludeOcrLayer}
                accessibilityRole="switch"
                accessibilityLabel="Searchable OCR Text Layer"
                trackColor={{ true: colors.primary }}
              />
            </View>

            <View
              style={[
                styles.divider,
                { backgroundColor: colors.border },
              ]}
            />

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Lock size={14} color={colors.primary} />
                  <Text style={[styles.sectionLabel, { color: colors.text }]}>
                    Password Protect (AES-256)
                  </Text>
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  Encrypt PDF before sharing or saving
                </Text>
              </View>
              <Switch
                value={protectPdf}
                onValueChange={setProtectPdf}
                accessibilityRole="switch"
                accessibilityLabel="Password Protect PDF"
                trackColor={{ true: colors.primary }}
              />
            </View>

            {protectPdf && (
              <View style={{ gap: 8, marginTop: 6 }}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="Enter PDF password"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <TextInput
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  secureTextEntry
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                />
              </View>
            )}
          </View>
        )}

        {error && (
          <View style={[styles.msgBox, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {doneMsg && (
          <View style={[styles.msgBox, { backgroundColor: colors.primarySoft }]}>
            <Text
              style={{
                color: colors.primary,
                fontSize: 13,
                fontWeight: '600',
              }}
            >
              {doneMsg}
            </Text>
          </View>
        )}

        <Pressable
          onPress={handleExport}
          disabled={busy}
          style={[styles.exportCta, { backgroundColor: colors.primary }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              {format === 'pdf' ? (
                <Share2 size={18} color="#FFFFFF" />
              ) : (
                <Download size={18} color="#FFFFFF" />
              )}
              <Text style={styles.exportCtaText}>
                {format === 'pdf' ? 'Export & Share PDF' : 'Export JPEG Images'}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
    gap: 12,
    maxWidth: 640,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  sectionLabel: { fontSize: 14, fontWeight: '700' },
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  divider: { height: 1, marginVertical: 4 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  msgBox: {
    padding: 12,
    borderRadius: 10,
  },
  exportCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 4,
  },
  exportCtaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
