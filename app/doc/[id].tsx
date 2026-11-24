import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSearch,
  FolderOpen,
  PenTool,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Tag,
  Trash2,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageAnnotationsOverlay } from '../../src/components/PageAnnotationsOverlay';
import { ResolvedImage } from '../../src/components/ResolvedImage';
import { useAppStore } from '../../src/store/useAppStore';
import { useTheme } from '../../src/theme/ThemeProvider';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();

  const documents = useAppStore((s) => s.documents);
  const folders = useAppStore((s) => s.folders);
  const pagesByDoc = useAppStore((s) => s.pagesByDoc);
  const signatures = useAppStore((s) => s.signatures);

  const updateDocumentMeta = useAppStore((s) => s.updateDocumentMeta);
  const reorderPages = useAppStore((s) => s.reorderPages);
  const deletePageFromDoc = useAppStore((s) => s.deletePageFromDoc);
  const rotatePageQuick = useAppStore((s) => s.rotatePageQuick);

  const doc = documents.find((d) => d.id === id);
  const pages = useMemo(() => (id ? pagesByDoc[id] ?? [] : []), [id, pagesByDoc]);

  const [activeIdx, setActiveIdx] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc?.title ?? '');
  const [metaModal, setMetaModal] = useState<'folder' | 'tags' | 'add' | null>(
    null,
  );
  const [tagsDraft, setTagsDraft] = useState('');
  const [stageBox, setStageBox] = useState({ width: 320, height: 420 });

  const safeIdx = Math.min(activeIdx, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIdx];

  const handleStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 10 && height > 10) setStageBox({ width, height });
  };

  const renderedRect = useMemo(() => {
    if (!currentPage) return { width: 0, height: 0 };
    const ar = Math.max(1, currentPage.width) / Math.max(1, currentPage.height);
    const boxAr = stageBox.width / Math.max(1, stageBox.height);
    if (ar > boxAr) {
      const w = stageBox.width;
      return { width: w, height: w / ar };
    }
    const h = stageBox.height;
    return { width: h * ar, height: h };
  }, [currentPage, stageBox]);

  if (!doc) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
      >
        <View style={styles.emptyState}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
            Document not found
          </Text>
          <Pressable
            onPress={() => router.replace('/')}
            style={[styles.pillBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
              Back to Library
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const currentFolderName =
    folders.find((f) => f.id === doc.folderId)?.name ?? 'Unfiled';

  const movePage = async (delta: -1 | 1) => {
    const targetIdx = safeIdx + delta;
    if (targetIdx < 0 || targetIdx >= pages.length) return;
    const ids = pages.map((p) => p.id);
    const tmp = ids[safeIdx];
    ids[safeIdx] = ids[targetIdx];
    ids[targetIdx] = tmp;
    setActiveIdx(targetIdx);
    await reorderPages(doc.id, ids);
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      {/* Top Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>

        {editingTitle ? (
          <TextInput
            value={titleDraft}
            onChangeText={setTitleDraft}
            autoFocus
            onBlur={async () => {
              setEditingTitle(false);
              if (titleDraft.trim() && titleDraft.trim() !== doc.title) {
                await updateDocumentMeta(doc.id, { title: titleDraft.trim() });
              }
            }}
            onSubmitEditing={async () => {
              setEditingTitle(false);
              if (titleDraft.trim() && titleDraft.trim() !== doc.title) {
                await updateDocumentMeta(doc.id, { title: titleDraft.trim() });
              }
            }}
            style={[
              styles.titleInput,
              {
                color: colors.text,
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          />
        ) : (
          <Pressable
            onPress={() => {
              setTitleDraft(doc.title);
              setEditingTitle(true);
            }}
            style={styles.titleWrap}
          >
            <Text
              style={[styles.headerTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {doc.title}
            </Text>
            <Text style={[styles.headerSub, { color: colors.textMuted }]}>
              Page {pages.length ? safeIdx + 1 : 0} of {pages.length} • Tap title to rename
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={() =>
            router.push({ pathname: '/doc/[id]/export', params: { id: doc.id } })
          }
          style={[styles.exportTopBtn, { backgroundColor: colors.primary }]}
        >
          <Download size={15} color="#FFFFFF" />
          <Text style={styles.exportTopText}>Export</Text>
        </Pressable>
      </View>

      {/* Folder & Tag Bar */}
      <View style={[styles.metaBar, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setMetaModal('folder')}
          style={[
            styles.metaChip,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <FolderOpen size={13} color={colors.primary} />
          <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>
            {currentFolderName}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setTagsDraft(doc.tags.join(', '));
            setMetaModal('tags');
          }}
          style={[
            styles.metaChip,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Tag size={13} color={colors.primary} />
          <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>
            {doc.tags.length > 0 ? doc.tags.map((t) => `#${t}`).join(' ') : 'Add tags'}
          </Text>
        </Pressable>
      </View>

      {/* Main Page Stage */}
      <View style={styles.stageWrap} onLayout={handleStageLayout}>
        {currentPage ? (
          <View
            style={{
              width: renderedRect.width,
              height: renderedRect.height,
              backgroundColor: '#FFFFFF',
              borderRadius: 6,
              overflow: 'hidden',
              elevation: 4,
              shadowColor: '#000',
              shadowOpacity: 0.16,
              shadowRadius: 10,
            }}
          >
            <ResolvedImage
              uri={currentPage.processedUri}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
            <PageAnnotationsOverlay
              annotations={currentPage.annotations}
              signatures={signatures}
              width={renderedRect.width}
              height={renderedRect.height}
            />
          </View>
        ) : (
          <Text style={{ color: colors.textMuted }}>No pages in document</Text>
        )}

        {pages.length > 1 && (
          <>
            <Pressable
              onPress={() => setActiveIdx((i) => Math.max(0, i - 1))}
              disabled={safeIdx === 0}
              style={[
                styles.navArrow,
                styles.navLeft,
                { opacity: safeIdx === 0 ? 0.3 : 0.9 },
              ]}
            >
              <ChevronLeft size={22} color="#FFFFFF" />
            </Pressable>
            <Pressable
              onPress={() =>
                setActiveIdx((i) => Math.min(pages.length - 1, i + 1))
              }
              disabled={safeIdx >= pages.length - 1}
              style={[
                styles.navArrow,
                styles.navRight,
                { opacity: safeIdx >= pages.length - 1 ? 0.3 : 0.9 },
              ]}
            >
              <ChevronRight size={22} color="#FFFFFF" />
            </Pressable>
          </>
        )}
      </View>

      {/* Page Controls & Thumbnail Strip */}
      <View
        style={[
          styles.stripContainer,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        {currentPage && (
          <View style={styles.pageQuickTools}>
            <Pressable
              onPress={() => movePage(-1)}
              disabled={safeIdx === 0}
              style={[
                styles.miniTool,
                { opacity: safeIdx === 0 ? 0.4 : 1, backgroundColor: colors.surfaceMuted },
              ]}
            >
              <ChevronLeft size={14} color={colors.text} />
              <Text style={[styles.miniToolText, { color: colors.text }]}>
                Move
              </Text>
            </Pressable>

            <Pressable
              onPress={() => movePage(1)}
              disabled={safeIdx >= pages.length - 1}
              style={[
                styles.miniTool,
                {
                  opacity: safeIdx >= pages.length - 1 ? 0.4 : 1,
                  backgroundColor: colors.surfaceMuted,
                },
              ]}
            >
              <Text style={[styles.miniToolText, { color: colors.text }]}>
                Move
              </Text>
              <ChevronRight size={14} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={() => rotatePageQuick(doc.id, currentPage.id)}
              style={[
                styles.miniTool,
                { backgroundColor: colors.surfaceMuted },
              ]}
            >
              <RotateCw size={14} color={colors.text} />
              <Text style={[styles.miniToolText, { color: colors.text }]}>
                Rotate
              </Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                if (pages.length <= 1) return;
                await deletePageFromDoc(doc.id, currentPage.id);
                setActiveIdx((i) => Math.max(0, i - 1));
              }}
              disabled={pages.length <= 1}
              style={[
                styles.miniTool,
                {
                  opacity: pages.length <= 1 ? 0.35 : 1,
                  backgroundColor: colors.dangerSoft,
                },
              ]}
            >
              <Trash2 size={14} color={colors.danger} />
            </Pressable>
          </View>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbScroll}
        >
          {pages.map((p, idx) => {
            const active = idx === safeIdx;
            return (
              <Pressable
                key={p.id}
                onPress={() => setActiveIdx(idx)}
                style={[
                  styles.thumbItem,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    borderWidth: active ? 2.5 : 1,
                  },
                ]}
              >
                <ResolvedImage
                  uri={p.processedUri}
                  style={styles.thumbImg}
                  resizeMode="cover"
                />
                <View style={styles.thumbBadge}>
                  <Text style={styles.thumbBadgeText}>{idx + 1}</Text>
                </View>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setMetaModal('add')}
            style={[
              styles.addPageCard,
              {
                borderColor: colors.primary,
                backgroundColor: colors.primarySoft,
              },
            ]}
          >
            <Plus size={20} color={colors.primary} />
            <Text style={[styles.addPageText, { color: colors.primary }]}>
              Add
            </Text>
          </Pressable>
        </ScrollView>

        {/* Bottom Primary Toolbar */}
        <View style={[styles.bottomToolbar, { borderTopColor: colors.border }]}>
          <Pressable
            onPress={() =>
              currentPage &&
              router.push({
                pathname: '/doc/[id]/edit/[pageId]',
                params: { id: doc.id, pageId: currentPage.id, tab: 'filters' },
              })
            }
            style={styles.toolAction}
          >
            <SlidersHorizontal size={19} color={colors.text} />
            <Text style={[styles.toolLabel, { color: colors.text }]}>
              Filters & Crop
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              currentPage &&
              router.push({
                pathname: '/doc/[id]/edit/[pageId]',
                params: { id: doc.id, pageId: currentPage.id, tab: 'annotate' },
              })
            }
            style={styles.toolAction}
          >
            <PenTool size={19} color={colors.text} />
            <Text style={[styles.toolLabel, { color: colors.text }]}>
              Annotate
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({ pathname: '/doc/[id]/ocr', params: { id: doc.id } })
            }
            style={styles.toolAction}
          >
            <FileSearch size={19} color={colors.text} />
            <Text style={[styles.toolLabel, { color: colors.text }]}>
              OCR Text
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              router.push({
                pathname: '/doc/[id]/export',
                params: { id: doc.id },
              })
            }
            style={styles.toolAction}
          >
            <Download size={19} color={colors.primary} />
            <Text style={[styles.toolLabel, { color: colors.primary }]}>
              Export
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Modals for Folder, Tags, Add Page */}
      <Modal
        visible={metaModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMetaModal(null)}
      >
        <Pressable
          onPress={() => setMetaModal(null)}
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {metaModal === 'folder' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Select Folder
                </Text>
                <Pressable
                  onPress={async () => {
                    await updateDocumentMeta(doc.id, { folderId: null });
                    setMetaModal(null);
                  }}
                  style={[styles.rowItem, { borderBottomColor: colors.border }]}
                >
                  <Text
                    style={{
                      color:
                        doc.folderId === null ? colors.primary : colors.text,
                      fontWeight: doc.folderId === null ? '700' : '500',
                    }}
                  >
                    Unfiled
                  </Text>
                </Pressable>
                {folders.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={async () => {
                      await updateDocumentMeta(doc.id, { folderId: f.id });
                      setMetaModal(null);
                    }}
                    style={[
                      styles.rowItem,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          doc.folderId === f.id ? colors.primary : colors.text,
                        fontWeight: doc.folderId === f.id ? '700' : '500',
                      }}
                    >
                      {f.name}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}

            {metaModal === 'tags' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Edit Tags (comma separated)
                </Text>
                <TextInput
                  value={tagsDraft}
                  onChangeText={setTagsDraft}
                  placeholder="invoice, warranty, 2026"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <View style={styles.modalBtns}>
                  <Pressable
                    onPress={() => setMetaModal(null)}
                    style={[
                      styles.pillBtn,
                      { backgroundColor: colors.surfaceMuted },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const tags = tagsDraft
                        .split(',')
                        .map((t) => t.trim().replace(/^#/, ''))
                        .filter(Boolean);
                      await updateDocumentMeta(doc.id, {
                        tags: Array.from(new Set(tags)),
                      });
                      setMetaModal(null);
                    }}
                    style={[
                      styles.pillBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                      Save
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {metaModal === 'add' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Add Pages to Document
                </Text>
                <Pressable
                  onPress={() => {
                    setMetaModal(null);
                    router.push({
                      pathname: '/scan',
                      params: { documentId: doc.id, mode: 'camera' },
                    });
                  }}
                  style={[styles.rowItem, { borderBottomColor: colors.border }]}
                >
                  <Text style={{ color: colors.text, fontSize: 15 }}>
                    Scan with Camera
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setMetaModal(null);
                    router.push({
                      pathname: '/scan',
                      params: { documentId: doc.id, mode: 'import' },
                    });
                  }}
                  style={[styles.rowItem, { borderBottomWidth: 0 }]}
                >
                  <Text style={{ color: colors.text, fontSize: 15 }}>
                    Import Photos from Device
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 6 },
  titleWrap: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  headerSub: { fontSize: 11 },
  titleInput: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '600',
  },
  exportTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  exportTopText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  metaChipText: { fontSize: 12, fontWeight: '600' },
  stageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    position: 'relative',
  },
  navArrow: {
    position: 'absolute',
    top: '46%',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { left: 16 },
  navRight: { right: 16 },
  stripContainer: {
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 8,
  },
  pageQuickTools: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  miniTool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  miniToolText: { fontSize: 12, fontWeight: '600' },
  thumbScroll: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  thumbItem: {
    width: 48,
    height: 64,
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(15,23,42,0.75)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  thumbBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  addPageCard: {
    width: 48,
    height: 64,
    borderRadius: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPageText: { fontSize: 10, fontWeight: '700' },
  bottomToolbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  toolAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  toolLabel: { fontSize: 11, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  rowItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  pillBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
