import { useRouter } from 'expo-router';
import {
  Camera,
  Cloud,
  CloudOff,
  FolderPlus,
  ImagePlus,
  LayoutGrid,
  List,
  Moon,
  RefreshCw,
  Search,
  Settings,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DocumentCard } from '../src/components/DocumentCard';
import { ScanFab } from '../src/components/ScanFab';
import { loadStoredToken } from '../src/services/sync/googleAuth';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';
import type { Document } from '../src/types/models';

export default function LibraryScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { colors, isDark } = useTheme();

  const folders = useAppStore((s) => s.folders);
  const documents = useAppStore((s) => s.documents);
  const pagesByDoc = useAppStore((s) => s.pagesByDoc);
  const settings = useAppStore((s) => s.settings);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const selectedFolderId = useAppStore((s) => s.selectedFolderId);
  const selectedTag = useAppStore((s) => s.selectedTag);
  const viewMode = useAppStore((s) => s.viewMode);
  const syncState = useAppStore((s) => s.syncState);
  const pendingSyncCount = useAppStore((s) => s.pendingSyncCount);

  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setSelectedFolderId = useAppStore((s) => s.setSelectedFolderId);
  const setSelectedTag = useAppStore((s) => s.setSelectedTag);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const createFolder = useAppStore((s) => s.createFolder);
  const deleteFolder = useAppStore((s) => s.deleteFolder);
  const updateDocumentMeta = useAppStore((s) => s.updateDocumentMeta);
  const deleteDocument = useAppStore((s) => s.deleteDocument);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const triggerSync = useAppStore((s) => s.triggerSync);

  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [menuDoc, setMenuDoc] = useState<Document | null>(null);
  const [renameText, setRenameText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [modalMode, setModalMode] = useState<
    'actions' | 'rename' | 'move' | 'tags'
  >('actions');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const d of documents) {
      for (const t of d.tags) set.add(t);
    }
    return Array.from(set).sort();
  }, [documents]);

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      if (selectedFolderId === 'unfiled' && d.folderId !== null) return false;
      if (
        selectedFolderId !== 'all' &&
        selectedFolderId !== 'unfiled' &&
        d.folderId !== selectedFolderId
      ) {
        return false;
      }
      if (selectedTag && !d.tags.includes(selectedTag)) return false;
      return true;
    });
  }, [documents, selectedFolderId, selectedTag]);

  const numColumns =
    viewMode === 'list' ? 1 : width >= 960 ? 4 : width >= 620 ? 3 : 2;

  const hasToken = Boolean(loadStoredToken());

  const handleSyncBadgePress = async () => {
    if (!hasToken) {
      router.push('/settings');
      return;
    }
    await triggerSync();
  };

  const openDocMenu = (doc: Document) => {
    setMenuDoc(doc);
    setRenameText(doc.title);
    setTagsText(doc.tags.join(', '));
    setModalMode('actions');
  };

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    await createFolder(trimmed);
    setNewFolderName('');
    setNewFolderModal(false);
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top', 'left', 'right']}
    >
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View
            style={[styles.logoMark, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.logoMarkText}>CS</Text>
          </View>
          <View>
            <Text style={[styles.brandTitle, { color: colors.text }]}>
              CScanner
            </Text>
            <Text style={[styles.brandSub, { color: colors.textMuted }]}>
              Ad-free • Offline-first
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {Platform.OS === 'web' && (
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
              style={[
                styles.syncPill,
                {
                  backgroundColor: colors.primarySoft,
                  borderColor: colors.primary,
                },
              ]}
              accessibilityLabel="Download Android APK"
            >
              <Smartphone size={14} color={colors.primary} />
              <Text style={[styles.syncLabel, { color: colors.primary }]}>
                APK
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handleSyncBadgePress}
            style={[
              styles.syncPill,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            {syncState === 'syncing' ? (
              <RefreshCw size={14} color={colors.primary} />
            ) : hasToken ? (
              <Cloud size={14} color={colors.primary} />
            ) : (
              <CloudOff size={14} color={colors.textMuted} />
            )}
            <Text
              style={[
                styles.syncLabel,
                {
                  color:
                    syncState === 'error'
                      ? colors.danger
                      : colors.textSecondary,
                },
              ]}
            >
              {syncState === 'syncing'
                ? 'Syncing'
                : !hasToken
                  ? 'Local'
                  : pendingSyncCount > 0
                    ? `Sync (${pendingSyncCount})`
                    : 'Synced'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              updateSettings({ theme: isDark ? 'light' : 'dark' })
            }
            style={[
              styles.iconButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityLabel="Toggle theme"
          >
            {isDark ? (
              <Sun size={18} color={colors.text} />
            ) : (
              <Moon size={18} color={colors.text} />
            )}
          </Pressable>

          <Pressable
            onPress={() => router.push('/settings')}
            style={[
              styles.iconButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            accessibilityLabel="Settings"
          >
            <Settings size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Search + View Toggle */}
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchBox,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Search size={17} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search titles, #tags, or OCR text..."
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <Pressable
          onPress={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          style={[
            styles.iconButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
          accessibilityLabel="Toggle layout"
        >
          {viewMode === 'grid' ? (
            <List size={18} color={colors.text} />
          ) : (
            <LayoutGrid size={18} color={colors.text} />
          )}
        </Pressable>
      </View>

      {/* Folder & Tag Chips */}
      <View style={styles.chipsSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {[
            { id: 'all', label: 'All Docs' },
            { id: 'unfiled', label: 'Unfiled' },
            ...folders.map((f) => ({ id: f.id, label: f.name })),
          ].map((item) => {
            const active = selectedFolderId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedFolderId(item.id)}
                onLongPress={() => {
                  if (item.id !== 'all' && item.id !== 'unfiled') {
                    deleteFolder(item.id);
                  }
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.primary : colors.surface,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={() => setNewFolderModal(true)}
            style={[
              styles.chip,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <FolderPlus size={14} color={colors.primary} />
            <Text style={[styles.chipText, { color: colors.primary }]}>
              Folder
            </Text>
          </Pressable>
        </ScrollView>

        {allTags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsScroll}
          >
            {allTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <Pressable
                  key={tag}
                  onPress={() => setSelectedTag(active ? null : tag)}
                  style={[
                    styles.tagFilterChip,
                    {
                      backgroundColor: active
                        ? colors.primarySoft
                        : colors.surface,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: active ? colors.primary : colors.textMuted,
                    }}
                  >
                    #{tag}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Document Grid / List */}
      {filteredDocs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View
            style={[
              styles.emptyCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Camera size={38} color={colors.primary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              {searchQuery.trim()
                ? 'No matching scans found'
                : 'Your ad-free scanner is ready'}
            </Text>
            <Text style={[styles.emptySub, { color: colors.textMuted }]}>
              {searchQuery.trim()
                ? 'Try another search term or clear your folder/tag filter.'
                : 'Scan multi-page documents, ID cards, or import existing photos. Everything stays offline on your device unless you enable Google Drive sync.'}
            </Text>
            {!searchQuery.trim() && (
              <View style={styles.emptyBtns}>
                <Pressable
                  onPress={() => router.push('/scan')}
                  style={[
                    styles.emptyPrimaryBtn,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Camera size={16} color="#FFFFFF" />
                  <Text style={styles.emptyPrimaryText}>Scan Now</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push({ pathname: '/scan', params: { mode: 'import' } })
                  }
                  style={[
                    styles.emptySecondaryBtn,
                    {
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <ImagePlus size={16} color={colors.text} />
                  <Text style={{ color: colors.text, fontWeight: '600' }}>
                    Import Photo
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : (
        <FlatList
          key={`${viewMode}-${numColumns}`}
          data={filteredDocs}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={
            numColumns > 1 ? { gap: 12 } : undefined
          }
          renderItem={({ item }) => {
            const pages = pagesByDoc[item.id] ?? [];
            return (
              <View
                style={
                  numColumns > 1 ? { flex: 1 / numColumns } : { width: '100%' }
                }
              >
                <DocumentCard
                  doc={item}
                  firstPage={pages[0]}
                  viewMode={viewMode}
                  onPress={() =>
                    router.push({
                      pathname: '/doc/[id]',
                      params: { id: item.id },
                    })
                  }
                  onMenuPress={() => openDocMenu(item)}
                />
              </View>
            );
          }}
        />
      )}

      {/* Floating Scan FAB */}
      <ScanFab
        onScan={() => router.push('/scan')}
        onImport={() =>
          router.push({ pathname: '/scan', params: { mode: 'import' } })
        }
        onIdCard={() => router.push('/id-card')}
      />

      {/* New Folder Modal */}
      <Modal
        visible={newFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setNewFolderModal(false)}
      >
        <View
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Create Folder
            </Text>
            <TextInput
              value={newFolderName}
              onChangeText={setNewFolderName}
              placeholder="e.g., Receipts, Tax 2026, Contracts"
              placeholderTextColor={colors.textMuted}
              autoFocus
              style={[
                styles.modalInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setNewFolderModal(false)}
                style={[
                  styles.modalBtn,
                  { backgroundColor: colors.surfaceMuted },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleCreateFolder}
                style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                  Create
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Document Actions Modal */}
      <Modal
        visible={Boolean(menuDoc)}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuDoc(null)}
      >
        <Pressable
          onPress={() => setMenuDoc(null)}
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.modalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {menuDoc && modalMode === 'actions' && (
              <>
                <Text
                  style={[styles.modalTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {menuDoc.title}
                </Text>
                {[
                  {
                    label: 'Open Document',
                    onPress: () => {
                      const id = menuDoc.id;
                      setMenuDoc(null);
                      router.push({ pathname: '/doc/[id]', params: { id } });
                    },
                  },
                  {
                    label: 'Rename',
                    onPress: () => setModalMode('rename'),
                  },
                  {
                    label: 'Move to Folder',
                    onPress: () => setModalMode('move'),
                  },
                  {
                    label: 'Edit Tags',
                    onPress: () => setModalMode('tags'),
                  },
                  {
                    label: 'Export PDF / JPEG',
                    onPress: () => {
                      const id = menuDoc.id;
                      setMenuDoc(null);
                      router.push({
                        pathname: '/doc/[id]/export',
                        params: { id },
                      });
                    },
                  },
                ].map((opt) => (
                  <Pressable
                    key={opt.label}
                    onPress={opt.onPress}
                    style={[
                      styles.sheetRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <Text style={{ color: colors.text, fontSize: 15 }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  onPress={async () => {
                    const id = menuDoc.id;
                    setMenuDoc(null);
                    await deleteDocument(id);
                  }}
                  style={[styles.sheetRow, { borderBottomWidth: 0 }]}
                >
                  <Trash2 size={16} color={colors.danger} />
                  <Text
                    style={{
                      color: colors.danger,
                      fontSize: 15,
                      fontWeight: '600',
                    }}
                  >
                    Delete Document
                  </Text>
                </Pressable>
              </>
            )}

            {menuDoc && modalMode === 'rename' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Rename Document
                </Text>
                <TextInput
                  value={renameText}
                  onChangeText={setRenameText}
                  autoFocus
                  style={[
                    styles.modalInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setModalMode('actions')}
                    style={[
                      styles.modalBtn,
                      { backgroundColor: colors.surfaceMuted },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      await updateDocumentMeta(menuDoc.id, {
                        title: renameText.trim() || menuDoc.title,
                      });
                      setMenuDoc(null);
                    }}
                    style={[
                      styles.modalBtn,
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

            {menuDoc && modalMode === 'tags' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Edit Tags (comma separated)
                </Text>
                <TextInput
                  value={tagsText}
                  onChangeText={setTagsText}
                  placeholder="receipt, tax, work"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                  style={[
                    styles.modalInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.surfaceMuted,
                      borderColor: colors.border,
                    },
                  ]}
                />
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setModalMode('actions')}
                    style={[
                      styles.modalBtn,
                      { backgroundColor: colors.surfaceMuted },
                    ]}
                  >
                    <Text style={{ color: colors.text }}>Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      const tags = tagsText
                        .split(',')
                        .map((t) => t.trim().replace(/^#/, ''))
                        .filter(Boolean);
                      await updateDocumentMeta(menuDoc.id, {
                        tags: Array.from(new Set(tags)),
                      });
                      setMenuDoc(null);
                    }}
                    style={[
                      styles.modalBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
                      Save Tags
                    </Text>
                  </Pressable>
                </View>
              </>
            )}

            {menuDoc && modalMode === 'move' && (
              <>
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Move to Folder
                </Text>
                <Pressable
                  onPress={async () => {
                    await updateDocumentMeta(menuDoc.id, { folderId: null });
                    setMenuDoc(null);
                  }}
                  style={[styles.sheetRow, { borderBottomColor: colors.border }]}
                >
                  <Text
                    style={{
                      color:
                        menuDoc.folderId === null
                          ? colors.primary
                          : colors.text,
                      fontWeight: menuDoc.folderId === null ? '700' : '400',
                    }}
                  >
                    Unfiled
                  </Text>
                </Pressable>
                {folders.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={async () => {
                      await updateDocumentMeta(menuDoc.id, { folderId: f.id });
                      setMenuDoc(null);
                    }}
                    style={[
                      styles.sheetRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          menuDoc.folderId === f.id
                            ? colors.primary
                            : colors.text,
                        fontWeight: menuDoc.folderId === f.id ? '700' : '400',
                      }}
                    >
                      {f.name}
                    </Text>
                  </Pressable>
                ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  brandSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  syncLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  chipsSection: {
    gap: 6,
    marginBottom: 8,
  },
  chipsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tagFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 110,
    gap: 12,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 90,
  },
  emptyCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  emptyBtns: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
  },
  emptyPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
