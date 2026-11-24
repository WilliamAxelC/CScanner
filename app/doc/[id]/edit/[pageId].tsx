import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Check,
  Crop,
  PenTool,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Square,
  Stamp,
  Trash2,
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { PageAnnotationsOverlay } from '../../../../src/components/PageAnnotationsOverlay';
import { QuadCropEditor } from '../../../../src/components/QuadCropEditor';
import { ResolvedImage } from '../../../../src/components/ResolvedImage';
import { SignaturePad } from '../../../../src/components/SignaturePad';
import { DEFAULT_QUAD } from '../../../../src/services/image/autoEdge';
import { useAppStore } from '../../../../src/store/useAppStore';
import { useTheme } from '../../../../src/theme/ThemeProvider';
import type { Annotation, FilterPreset, Quad } from '../../../../src/types/models';
import { generateId } from '../../../../src/utils/ids';

const FILTER_PRESETS: Array<{ id: FilterPreset; label: string }> = [
  { id: 'original', label: 'Original' },
  { id: 'magic', label: 'Magic Color' },
  { id: 'bw', label: 'Crisp B&W' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'lighten', label: 'Lighten' },
];

import { getPagesForDoc } from '../../../../src/utils/security';

export default function PageEditorScreen() {
  const { id, pageId, tab } = useLocalSearchParams<{
    id: string;
    pageId: string;
    tab?: string;
  }>();
  const router = useRouter();
  const { colors, reduceMotion } = useTheme();

  const pagesByDoc = useAppStore((s) => s.pagesByDoc);
  const signatures = useAppStore((s) => s.signatures);
  const updatePageEdits = useAppStore((s) => s.updatePageEdits);
  const saveNewSignature = useAppStore((s) => s.saveNewSignature);

  const page = getPagesForDoc(pagesByDoc, id).find((p) => p.id === pageId);

  const [activeTab, setActiveTab] = useState<'filters' | 'crop' | 'annotate'>(
    tab === 'crop' ? 'crop' : tab === 'annotate' ? 'annotate' : 'filters',
  );
  const [filter, setFilter] = useState<FilterPreset>(page?.filter ?? 'magic');
  const [brightness, setBrightness] = useState(page?.brightness ?? 0);
  const [contrast, setContrast] = useState(page?.contrast ?? 0);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(
    page?.rotation ?? 0,
  );
  const [quad, setQuad] = useState<Quad>(page?.quad ?? DEFAULT_QUAD);
  const [annotations, setAnnotations] = useState<Annotation[]>(
    page?.annotations ?? [],
  );
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);

  const [showSigPad, setShowSigPad] = useState(false);
  const [showWatermarkModal, setShowWatermarkModal] = useState(false);
  const [wmText, setWmText] = useState('CONFIDENTIAL');
  const [wmTiled, setWmTiled] = useState(true);
  const [wmOpacity, setWmOpacity] = useState(0.25);

  const [busy, setBusy] = useState(false);
  const [stageBox, setStageBox] = useState({ width: 320, height: 360 });

  const handleStageLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 10 && height > 10) setStageBox({ width, height });
  };

  const renderedRect = useMemo(() => {
    if (!page) return { width: 0, height: 0 };
    const ar = Math.max(1, page.width) / Math.max(1, page.height);
    const boxAr = stageBox.width / Math.max(1, stageBox.height);
    if (ar > boxAr) {
      const w = stageBox.width;
      return { width: w, height: w / ar };
    }
    const h = stageBox.height;
    return { width: h * ar, height: h };
  }, [page, stageBox]);

  if (!page || !id) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
      >
        <View style={styles.centerEmpty}>
          <Text style={{ color: colors.text }}>Page not found</Text>
          <Pressable
            onPress={() => router.back()}
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const handleApplyAndSave = async () => {
    setBusy(true);
    try {
      await updatePageEdits(id, page.id, {
        filter,
        brightness,
        contrast,
        rotation,
        quad: activeTab === 'crop' ? quad : page.quad,
        annotations,
        reprocessImage: true,
      });
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const handlePreviewProcess = async (next?: {
    filter?: FilterPreset;
    brightness?: number;
    contrast?: number;
    rotation?: 0 | 90 | 180 | 270;
    quad?: Quad;
  }) => {
    setBusy(true);
    try {
      await updatePageEdits(id, page.id, {
        filter: next?.filter ?? filter,
        brightness: next?.brightness ?? brightness,
        contrast: next?.contrast ?? contrast,
        rotation: next?.rotation ?? rotation,
        quad: next?.quad ?? page.quad,
        annotations,
        reprocessImage: true,
      });
    } finally {
      setBusy(false);
    }
  };

  const selectedAnn = annotations.find((a) => a.id === selectedAnnId);

  const nudgeSelected = (
    dx: number,
    dy: number,
    dScale = 0,
  ) => {
    if (!selectedAnnId) return;
    setAnnotations((prev) =>
      prev.map((a) => {
        if (a.id !== selectedAnnId || a.type === 'watermark') return a;
        const w = Math.max(0.06, Math.min(0.9, a.width + dScale));
        const h = Math.max(0.04, Math.min(0.8, a.height + dScale * 0.5));
        const x = Math.max(0, Math.min(1 - w, a.x + dx));
        const y = Math.max(0, Math.min(1 - h, a.y + dy));
        return { ...a, x, y, width: w, height: h };
      }),
    );
  };

  const addSignatureToPage = (signatureId: string) => {
    const annId = generateId();
    setAnnotations((prev) => [
      ...prev,
      {
        id: annId,
        type: 'signature',
        signatureId,
        x: 0.55,
        y: 0.72,
        width: 0.32,
        height: 0.14,
      },
    ]);
    setSelectedAnnId(annId);
  };

  const addRedactionBox = (color: '#000000' | '#FFFFFF') => {
    const annId = generateId();
    setAnnotations((prev) => [
      ...prev,
      {
        id: annId,
        type: 'redact',
        x: 0.2,
        y: 0.42,
        width: 0.45,
        height: 0.08,
        color,
      },
    ]);
    setSelectedAnnId(annId);
  };

  const addWatermark = () => {
    const cleaned = wmText.trim();
    if (!cleaned) return;
    const withoutPrev = annotations.filter((a) => a.type !== 'watermark');
    setAnnotations([
      ...withoutPrev,
      {
        id: generateId(),
        type: 'watermark',
        text: cleaned,
        opacity: wmOpacity,
        angle: -35,
        tiled: wmTiled,
        color: '#64748B',
      },
    ]);
    setShowWatermarkModal(false);
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Edit Page
        </Text>
        <Pressable
          onPress={handleApplyAndSave}
          disabled={busy}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.saveText}>Done</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Segmented Tabs */}
      <View
        style={[
          styles.tabsBar,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        {(
          [
            { id: 'filters', label: 'Filters', Icon: SlidersHorizontal },
            { id: 'crop', label: 'Crop', Icon: Crop },
            { id: 'annotate', label: 'Annotate', Icon: PenTool },
          ] as const
        ).map(({ id: tId, label, Icon }) => {
          const active = activeTab === tId;
          return (
            <Pressable
              key={tId}
              onPress={() => setActiveTab(tId)}
              style={[
                styles.tabBtn,
                active && {
                  borderBottomColor: colors.primary,
                  borderBottomWidth: 2.5,
                },
              ]}
            >
              <Icon
                size={16}
                color={active ? colors.primary : colors.textMuted}
              />
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: active ? colors.primary : colors.textMuted,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Canvas Preview */}
      {activeTab === 'crop' ? (
        <View style={styles.cropWrap}>
          <QuadCropEditor
            imageUri={page.originalUri}
            imageWidth={page.width}
            imageHeight={page.height}
            quad={quad}
            onChange={setQuad}
          />
        </View>
      ) : (
        <View style={styles.stageWrap} onLayout={handleStageLayout}>
          <View
            style={{
              width: renderedRect.width,
              height: renderedRect.height,
              backgroundColor: '#FFFFFF',
              borderRadius: 6,
              overflow: 'hidden',
              elevation: 3,
            }}
          >
            <ResolvedImage
              uri={page.processedUri}
              style={{ width: '100%', height: '100%' }}
              resizeMode="contain"
            />
            <PageAnnotationsOverlay
              annotations={annotations}
              signatures={signatures}
              width={renderedRect.width}
              height={renderedRect.height}
              selectedId={activeTab === 'annotate' ? selectedAnnId : null}
              onSelectAnnotation={
                activeTab === 'annotate' ? setSelectedAnnId : undefined
              }
            />
          </View>
        </View>
      )}

      {/* Bottom Controls Panel */}
      <View
        style={[
          styles.controlsPanel,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        {activeTab === 'filters' && (
          <View style={styles.filtersBox}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetRow}
            >
              {FILTER_PRESETS.map((p) => {
                const active = filter === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setFilter(p.id);
                      handlePreviewProcess({ filter: p.id });
                    }}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: active
                          ? colors.primary
                          : colors.surfaceMuted,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? '#FFFFFF' : colors.text,
                        fontSize: 12,
                        fontWeight: '700',
                      }}
                    >
                      {p.label}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => {
                  const nextRot = (((rotation + 90) % 360) as
                    | 0
                    | 90
                    | 180
                    | 270);
                  setRotation(nextRot);
                  handlePreviewProcess({ rotation: nextRot });
                }}
                style={[
                  styles.presetChip,
                  { backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', gap: 5 },
                ]}
              >
                <RotateCw size={13} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                  90°
                </Text>
              </Pressable>
            </ScrollView>

            {/* Brightness & Contrast Steppers */}
            <View style={styles.slidersRow}>
              <View style={styles.stepperCol}>
                <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
                  Brightness ({brightness > 0 ? `+${brightness}` : brightness})
                </Text>
                <View style={styles.stepperBtns}>
                  <Pressable
                    onPress={() => {
                      const v = Math.max(-80, brightness - 15);
                      setBrightness(v);
                      handlePreviewProcess({ brightness: v });
                    }}
                    style={[styles.stepBtn, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>-</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setBrightness(0);
                      handlePreviewProcess({ brightness: 0 });
                    }}
                    style={[styles.stepBtn, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>Reset</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const v = Math.min(80, brightness + 15);
                      setBrightness(v);
                      handlePreviewProcess({ brightness: v });
                    }}
                    style={[styles.stepBtn, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.stepperCol}>
                <Text style={[styles.sliderLabel, { color: colors.textSecondary }]}>
                  Contrast ({contrast > 0 ? `+${contrast}` : contrast})
                </Text>
                <View style={styles.stepperBtns}>
                  <Pressable
                    onPress={() => {
                      const v = Math.max(-80, contrast - 15);
                      setContrast(v);
                      handlePreviewProcess({ contrast: v });
                    }}
                    style={[styles.stepBtn, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>-</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setContrast(0);
                      handlePreviewProcess({ contrast: 0 });
                    }}
                    style={[styles.stepBtn, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>Reset</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const v = Math.min(80, contrast + 15);
                      setContrast(v);
                      handlePreviewProcess({ contrast: v });
                    }}
                    style={[styles.stepBtn, { backgroundColor: colors.surfaceMuted }]}
                  >
                    <Text style={{ color: colors.text, fontWeight: '700' }}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        )}

        {activeTab === 'crop' && (
          <View style={styles.cropFooter}>
            <Pressable
              onPress={() =>
                setQuad([
                  { x: 0.02, y: 0.02 },
                  { x: 0.98, y: 0.02 },
                  { x: 0.98, y: 0.98 },
                  { x: 0.02, y: 0.98 },
                ])
              }
              style={[styles.actionChip, { backgroundColor: colors.surfaceMuted }]}
            >
              <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>
                Full Frame
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handlePreviewProcess({ quad })}
              style={[styles.actionChip, { backgroundColor: colors.primary }]}
            >
              <Check size={15} color="#FFFFFF" />
              <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>
                Apply Crop
              </Text>
            </Pressable>
          </View>
        )}

        {activeTab === 'annotate' && (
          <View style={styles.annotatePanel}>
            {/* Signature picker row */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.presetRow}
            >
              <Pressable
                onPress={() => setShowSigPad(true)}
                style={[styles.actionChip, { backgroundColor: colors.primary }]}
              >
                <Plus size={14} color="#FFFFFF" />
                <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>
                  New Signature
                </Text>
              </Pressable>

              {signatures.map((sig) => (
                <Pressable
                  key={sig.id}
                  onPress={() => addSignatureToPage(sig.id)}
                  style={[
                    styles.actionChip,
                    { backgroundColor: colors.surfaceMuted },
                  ]}
                >
                  <PenTool size={13} color={colors.primary} />
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                    {sig.name}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                onPress={() => setShowWatermarkModal(true)}
                style={[styles.actionChip, { backgroundColor: colors.surfaceMuted }]}
              >
                <Stamp size={13} color={colors.primary} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                  Watermark
                </Text>
              </Pressable>

              <Pressable
                onPress={() => addRedactionBox('#000000')}
                style={[styles.actionChip, { backgroundColor: colors.surfaceMuted }]}
              >
                <Square size={13} color="#000000" fill="#000000" />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                  Redact Black
                </Text>
              </Pressable>

              <Pressable
                onPress={() => addRedactionBox('#FFFFFF')}
                style={[styles.actionChip, { backgroundColor: colors.surfaceMuted }]}
              >
                <Square size={13} color={colors.text} />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                  Whiteout
                </Text>
              </Pressable>
            </ScrollView>

            {/* Selected annotation positioning controls */}
            {selectedAnn && selectedAnn.type !== 'watermark' ? (
              <View style={styles.nudgeBar}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                  Position / Size:
                </Text>
                <Pressable
                  onPress={() => nudgeSelected(-0.04, 0)}
                  style={[styles.nudgeBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={{ color: colors.text }}>←</Text>
                </Pressable>
                <Pressable
                  onPress={() => nudgeSelected(0.04, 0)}
                  style={[styles.nudgeBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={{ color: colors.text }}>→</Text>
                </Pressable>
                <Pressable
                  onPress={() => nudgeSelected(0, -0.04)}
                  style={[styles.nudgeBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={{ color: colors.text }}>↑</Text>
                </Pressable>
                <Pressable
                  onPress={() => nudgeSelected(0, 0.04)}
                  style={[styles.nudgeBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={{ color: colors.text }}>↓</Text>
                </Pressable>
                <Pressable
                  onPress={() => nudgeSelected(0, 0, -0.04)}
                  style={[styles.nudgeBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={{ color: colors.text }}>-</Text>
                </Pressable>
                <Pressable
                  onPress={() => nudgeSelected(0, 0, 0.04)}
                  style={[styles.nudgeBtn, { backgroundColor: colors.surfaceMuted }]}
                >
                  <Text style={{ color: colors.text }}>+</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setAnnotations((prev) =>
                      prev.filter((a) => a.id !== selectedAnn.id),
                    );
                    setSelectedAnnId(null);
                  }}
                  style={[styles.nudgeBtn, { backgroundColor: colors.dangerSoft }]}
                >
                  <Trash2 size={14} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              annotations.some((a) => a.type === 'watermark') && (
                <View style={styles.nudgeBar}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                    Tap an overlay to move/resize, or clear watermark:
                  </Text>
                  <Pressable
                    onPress={() =>
                      setAnnotations((prev) =>
                        prev.filter((a) => a.type !== 'watermark'),
                      )
                    }
                    style={[styles.nudgeBtn, { backgroundColor: colors.dangerSoft }]}
                  >
                    <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700' }}>
                      Remove Watermark
                    </Text>
                  </Pressable>
                </View>
              )
            )}
          </View>
        )}
      </View>

      {/* Draw Signature Modal */}
      <Modal
        visible={showSigPad}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setShowSigPad(false)}
      >
        <View
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View style={{ width: '100%', maxWidth: 420 }}>
            <SignaturePad
              onCancel={() => setShowSigPad(false)}
              onSave={async (res) => {
                const saved = await saveNewSignature(res);
                setShowSigPad(false);
                addSignatureToPage(saved.id);
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Watermark Modal */}
      <Modal
        visible={showWatermarkModal}
        transparent
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={() => setShowWatermarkModal(false)}
      >
        <View
          style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]}
        >
          <View
            style={[
              styles.wmCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.wmTitle, { color: colors.text }]}>
              Watermark Text
            </Text>
            <TextInput
              value={wmText}
              onChangeText={setWmText}
              placeholder="CONFIDENTIAL / DRAFT"
              placeholderTextColor={colors.textMuted}
              style={[
                styles.wmInput,
                {
                  color: colors.text,
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}
            />
            <View style={styles.wmRow}>
              <Pressable
                onPress={() => setWmTiled((t) => !t)}
                style={[
                  styles.actionChip,
                  {
                    backgroundColor: wmTiled
                      ? colors.primarySoft
                      : colors.surfaceMuted,
                  },
                ]}
              >
                <Text
                  style={{
                    color: wmTiled ? colors.primary : colors.text,
                    fontWeight: '700',
                    fontSize: 12,
                  }}
                >
                  {wmTiled ? 'Tiled 3×3' : 'Single Center'}
                </Text>
              </Pressable>
              <Pressable
                onPress={() =>
                  setWmOpacity((o) => (o > 0.4 ? 0.18 : Number((o + 0.12).toFixed(2))))
                }
                style={[styles.actionChip, { backgroundColor: colors.surfaceMuted }]}
              >
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
                  Opacity {Math.round(wmOpacity * 100)}%
                </Text>
              </Pressable>
            </View>
            <View style={styles.wmBtns}>
              <Pressable
                onPress={() => setShowWatermarkModal(false)}
                style={[styles.actionChip, { backgroundColor: colors.surfaceMuted }]}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={addWatermark}
                style={[styles.actionChip, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centerEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  iconBtn: { padding: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  saveText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  tabsBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  cropWrap: { flex: 1 },
  stageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  controlsPanel: {
    borderTopWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  filtersBox: { gap: 12 },
  presetRow: { gap: 8, paddingHorizontal: 4, alignItems: 'center' },
  presetChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 10,
  },
  slidersRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stepperCol: { flex: 1, gap: 6 },
  sliderLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  stepperBtns: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  stepBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  cropFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  annotatePanel: { gap: 10 },
  nudgeBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nudgeBtn: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  wmCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  wmTitle: { fontSize: 16, fontWeight: '700' },
  wmInput: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  wmRow: { flexDirection: 'row', gap: 8 },
  wmBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
