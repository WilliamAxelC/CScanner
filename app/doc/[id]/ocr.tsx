import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Copy, RefreshCw } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '../../../src/store/useAppStore';
import { useTheme } from '../../../src/theme/ThemeProvider';

import { copyTextToClipboard } from '../../../src/services/feedback/reportBuilder';
import { getPagesForDoc } from '../../../src/utils/security';

export default function OcrScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const documents = useAppStore((s) => s.documents);
  const pagesByDoc = useAppStore((s) => s.pagesByDoc);
  const runOcrForDocument = useAppStore((s) => s.runOcrForDocument);
  const updatePageOcrText = useAppStore((s) => s.updatePageOcrText);

  const doc = documents.find((d) => d.id === id);
  const pages = doc ? getPagesForDoc(pagesByDoc, doc.id) : [];

  const [selectedPageIdx, setSelectedPageIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);

  const currentPage = pages[Math.min(selectedPageIdx, Math.max(0, pages.length - 1))];

  useEffect(() => {
    setDraft(currentPage?.ocrText ?? '');
  }, [currentPage?.id, currentPage?.ocrText]);

  const handleRunOcr = async () => {
    if (!id) return;
    setRunning(true);
    try {
      await runOcrForDocument(id);
    } finally {
      setRunning(false);
    }
  };

  const handleCopyAll = async () => {
    const text = doc?.ocrFullText || draft;
    if (!text) return;
    await copyTextToClipboard(text);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  const handleSaveText = async () => {
    if (!id || !currentPage) return;
    await updatePageOcrText(id, currentPage.id, draft);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.iconBtn}
        >
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text
          accessibilityRole="header"
          style={[styles.headerTitle, { color: colors.text }]}
        >
          On-Device OCR
        </Text>
        <Pressable
          onPress={handleCopyAll}
          accessibilityRole="button"
          accessibilityLabel="Copy OCR text"
          style={[styles.pillBtn, { backgroundColor: colors.surfaceMuted }]}
        >
          <Copy size={14} color={colors.text} />
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
            {copiedMsg ? 'Copied!' : 'Copy'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Page tabs + Run OCR */}
        <View style={styles.topControls}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pageChips}
          >
            {pages.map((p, idx) => (
              <Pressable
                key={p.id}
                onPress={() => setSelectedPageIdx(idx)}
                style={[
                  styles.pageChip,
                  {
                    backgroundColor:
                      idx === selectedPageIdx
                        ? colors.primary
                        : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      idx === selectedPageIdx ? '#FFFFFF' : colors.textSecondary,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  Page {idx + 1}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={handleRunOcr}
            disabled={running}
            style={[styles.runBtn, { backgroundColor: colors.primary }]}
          >
            {running ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <RefreshCw size={14} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '700' }}>
                  Run OCR
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Recognized text is indexed for instant offline search and embedded invisibly when exporting Searchable PDFs. You can edit any typos below:
        </Text>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          multiline
          textAlignVertical="top"
          placeholder={
            running
              ? 'Recognizing text on-device...'
              : 'Tap "Run OCR" to extract text from this page, or type notes manually.'
          }
          placeholderTextColor={colors.textMuted}
          style={[
            styles.editor,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        />

        <Pressable
          onPress={handleSaveText}
          style={[styles.saveCta, { backgroundColor: colors.primary }]}
        >
          <Check size={17} color="#FFFFFF" />
          <Text style={styles.saveCtaText}>
            {savedMsg ? 'Saved to Search Index!' : 'Save Edited OCR Text'}
          </Text>
        </Pressable>
      </View>
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
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 10,
  },
  body: {
    flex: 1,
    padding: 16,
    gap: 12,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  topControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageChips: { gap: 8 },
  pageChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  runBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  hint: { fontSize: 12, lineHeight: 17 },
  editor: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    lineHeight: 22,
  },
  saveCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveCtaText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
