import { isNativeScannerAvailable, scanDocumentNative } from 'cscanner-mlkit';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QuadCropEditor } from '../src/components/QuadCropEditor';
import { ResolvedImage } from '../src/components/ResolvedImage';
import { DEFAULT_QUAD } from '../src/services/image/autoEdge';
import { autoDetectQuadFromUri } from '../src/services/image/processor';
import { useAppStore, type NewPageInput } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';
import type { Quad } from '../src/types/models';
import { pickImagesFromDevice } from '../src/utils/imageImport';
import { generateId } from '../src/utils/ids';
import { storage } from '../src/storage';

interface StagedPage {
  tempId: string;
  originalUri: string;
  width: number;
  height: number;
  quad: Quad;
  skipCrop?: boolean;
}

export default function ScanScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    documentId?: string;
    mode?: string;
    fromApp?: string;
  }>();
  const { colors } = useTheme();

  const documents = useAppStore((s) => s.documents);
  const createDocumentWithPages = useAppStore((s) => s.createDocumentWithPages);
  const appendPagesToDocument = useAppStore((s) => s.appendPagesToDocument);
  const settings = useAppStore((s) => s.settings);
  const validTargetDocId =
    params.documentId && documents.some((d) => d.id === params.documentId)
      ? params.documentId
      : undefined;

  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Queue of captured/imported pages awaiting optional 4-corner crop & save
  const [pendingQueue, setPendingQueue] = useState<StagedPage[]>([]);
  const [confirmedPages, setConfirmedPages] = useState<NewPageInput[]>([]);

  // Web live camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  const isImportMode = params.mode === 'import';
  const nativeScanSupported =
    Platform.OS === 'android' && isNativeScannerAvailable();

  const stopWebCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopWebCamera();
    };
  }, []);

  const handleNativeMlkitScan = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg('Opening Google ML Kit Document Scanner...');
    try {
      const result = await scanDocumentNative({
        pageLimit: 24,
        galleryImportAllowed: true,
        scannerMode: 'FULL',
      });
      if (result.cancelled || !result.pages.length) {
        setBusy(false);
        setStatusMsg('');
        if (!confirmedPages.length) {
          router.back();
        }
        return;
      }

      const newPages: NewPageInput[] = result.pages.map((p) => ({
        originalUri: p.uri,
        width: p.width,
        height: p.height,
        filter: settings.defaultFilter,
      }));

      if (validTargetDocId) {
        await appendPagesToDocument(validTargetDocId, newPages);
        router.replace({
          pathname: '/doc/[id]',
          params: { id: validTargetDocId },
        });
      } else {
        const doc = await createDocumentWithPages({ pages: newPages });
        router.replace({ pathname: '/doc/[id]', params: { id: doc.id } });
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'ML Kit scanner failed',
      );
      setBusy(false);
      setStatusMsg('');
    }
  };

  useEffect(() => {
    const launchedFromApp = params.fromApp === '1';
    if (launchedFromApp && isImportMode) {
      handleImportPhotos();
    } else if (launchedFromApp && nativeScanSupported) {
      handleNativeMlkitScan();
    } else if (Platform.OS === 'web') {
      startWebCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWebCamera = async () => {
    if (
      Platform.OS !== 'web' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return;
    }
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setCameraActive(false);
      setErrorMsg(
        'Camera permission denied or unavailable. You can import photos below.',
      );
    }
  };

  const captureWebFrame = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setStatusMsg('Detecting document edges...');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Capture failed'))),
          'image/jpeg',
          0.92,
        ),
      );
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const tempId = generateId();
      const origUri = await storage.saveImageBytes(`orig_${tempId}`, bytes, 'jpg');
      const quad = await autoDetectQuadFromUri(origUri).catch(
        () => DEFAULT_QUAD,
      );
      stopWebCamera();
      setPendingQueue((prev) => [
        ...prev,
        {
          tempId,
          originalUri: origUri,
          width: canvas.width,
          height: canvas.height,
          quad,
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Capture error');
    } finally {
      setBusy(false);
      setStatusMsg('');
    }
  };

  const handleImportPhotos = async () => {
    setBusy(true);
    setErrorMsg(null);
    setStatusMsg('Loading selected images...');
    try {
      const picked = await pickImagesFromDevice(true);
      if (!picked.length) {
        setBusy(false);
        setStatusMsg('');
        return;
      }
      stopWebCamera();
      const staged: StagedPage[] = [];
      for (const item of picked) {
        const tempId = generateId();
        const origUri = await storage.saveImageBytes(
          `orig_${tempId}`,
          item.bytes,
          'jpg',
        );
        const quad = await autoDetectQuadFromUri(origUri).catch(
          () => DEFAULT_QUAD,
        );
        staged.push({
          tempId,
          originalUri: origUri,
          width: item.width,
          height: item.height,
          quad,
        });
      }
      setPendingQueue((prev) => [...prev, ...staged]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not import images',
      );
    } finally {
      setBusy(false);
      setStatusMsg('');
    }
  };

  const activeStage = pendingQueue[0];

  const updateActiveQuad = (quad: Quad) => {
    setPendingQueue((prev) => {
      if (!prev.length) return prev;
      const [head, ...rest] = prev;
      return [{ ...head, quad }, ...rest];
    });
  };

  const confirmActiveStage = (skipCrop = false) => {
    if (!activeStage) return;
    const nextPage: NewPageInput = {
      originalUri: activeStage.originalUri,
      width: activeStage.width,
      height: activeStage.height,
      quad: skipCrop ? undefined : activeStage.quad,
      filter: settings.defaultFilter,
    };
    setConfirmedPages((prev) => [...prev, nextPage]);
    setPendingQueue((prev) => prev.slice(1));
  };

  const handleSaveAll = async () => {
    const pagesToSave = [...confirmedPages];
    if (activeStage) {
      pagesToSave.push({
        originalUri: activeStage.originalUri,
        width: activeStage.width,
        height: activeStage.height,
        quad: activeStage.quad,
        filter: settings.defaultFilter,
      });
    }
    if (!pagesToSave.length) return;
    setBusy(true);
    setStatusMsg('Processing & enhancing pages...');
    try {
      if (validTargetDocId) {
        await appendPagesToDocument(validTargetDocId, pagesToSave);
        router.replace({
          pathname: '/doc/[id]',
          params: { id: validTargetDocId },
        });
      } else {
        const doc = await createDocumentWithPages({ pages: pagesToSave });
        router.replace({ pathname: '/doc/[id]', params: { id: doc.id } });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
      setStatusMsg('');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: '#020617' }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        <Pressable
          onPress={() => {
            stopWebCamera();
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.topBtn}
        >
          <ArrowLeft size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.topTitle}>
          {activeStage
            ? `Adjust Corners (${pendingQueue.length} left)`
            : 'Scan or Import'}
        </Text>
        <View style={{ width: 38 }} />
      </View>

      {errorMsg && (
        <View style={styles.errBanner}>
          <Text style={styles.errText}>{errorMsg}</Text>
        </View>
      )}

      {/* Main Workspace */}
      {busy ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.statusText}>{statusMsg || 'Working...'}</Text>
        </View>
      ) : activeStage ? (
        <View style={styles.cropWorkspace}>
          <QuadCropEditor
            imageUri={activeStage.originalUri}
            imageWidth={activeStage.width}
            imageHeight={activeStage.height}
            quad={activeStage.quad}
            onChange={updateActiveQuad}
          />
          <View style={styles.cropActions}>
            <Pressable
              onPress={async () => {
                const detected = await autoDetectQuadFromUri(
                  activeStage.originalUri,
                ).catch(() => DEFAULT_QUAD);
                updateActiveQuad(detected);
              }}
              style={styles.secondaryDarkBtn}
            >
              <Sparkles size={15} color="#FFFFFF" />
              <Text style={styles.btnText}>Auto</Text>
            </Pressable>

            <Pressable
              onPress={() =>
                updateActiveQuad([
                  { x: 0.02, y: 0.02 },
                  { x: 0.98, y: 0.02 },
                  { x: 0.98, y: 0.98 },
                  { x: 0.02, y: 0.98 },
                ])
              }
              style={styles.secondaryDarkBtn}
            >
              <RotateCcw size={15} color="#FFFFFF" />
              <Text style={styles.btnText}>Full</Text>
            </Pressable>

            <Pressable
              onPress={() => confirmActiveStage(true)}
              style={styles.secondaryDarkBtn}
            >
              <Text style={styles.btnText}>Skip Crop</Text>
            </Pressable>

            <Pressable
              onPress={() => confirmActiveStage(false)}
              style={[styles.primaryDarkBtn, { backgroundColor: colors.primary }]}
            >
              <Check size={16} color="#FFFFFF" />
              <Text style={styles.btnText}>Confirm Page</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.captureArea}>
          {Platform.OS === 'web' && cameraActive ? (
            <View style={styles.videoWrap}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            </View>
          ) : (
            <View style={styles.centerBox}>
              <Camera size={46} color={colors.primary} />
              <Text style={styles.captureHint}>
                {nativeScanSupported
                  ? 'Tap Scan with ML Kit for automatic edge detection, or import photos from gallery.'
                  : 'Capture a document with your camera or import existing photos to crop & enhance.'}
              </Text>
              <View style={styles.captureChoices}>
                {nativeScanSupported ? (
                  <Pressable
                    onPress={handleNativeMlkitScan}
                    style={[
                      styles.primaryDarkBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Camera size={18} color="#FFFFFF" />
                    <Text style={styles.btnText}>Scan with ML Kit</Text>
                  </Pressable>
                ) : (
                  Platform.OS === 'web' && (
                    <Pressable
                      onPress={startWebCamera}
                      style={[
                        styles.primaryDarkBtn,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <RefreshCw size={17} color="#FFFFFF" />
                      <Text style={styles.btnText}>Start Camera</Text>
                    </Pressable>
                  )
                )}
                <Pressable
                  onPress={handleImportPhotos}
                  style={styles.secondaryDarkBtn}
                >
                  <ImagePlus size={18} color="#FFFFFF" />
                  <Text style={styles.btnText}>Import Photos</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        {Platform.OS === 'web' && cameraActive && !activeStage && (
          <View style={styles.shutterRow}>
            <Pressable
              onPress={handleImportPhotos}
              style={styles.secondaryDarkBtn}
            >
              <ImagePlus size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Import</Text>
            </Pressable>

            <Pressable onPress={captureWebFrame} style={styles.shutterBtn}>
              <View style={styles.shutterInner} />
            </Pressable>

            <View style={{ width: 76 }} />
          </View>
        )}

        {(confirmedPages.length > 0 || activeStage) && (
          <View style={styles.queueFooter}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.thumbStrip}
            >
              {confirmedPages.map((p, i) => (
                <View key={i} style={styles.miniThumb}>
                  <ResolvedImage
                    uri={p.originalUri}
                    style={styles.miniThumbImg}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>

            <View style={styles.finishRow}>
              {!activeStage && Platform.OS === 'web' && !cameraActive && (
                <Pressable
                  onPress={startWebCamera}
                  style={styles.secondaryDarkBtn}
                >
                  <Camera size={16} color="#FFFFFF" />
                  <Text style={styles.btnText}>Add Page</Text>
                </Pressable>
              )}
              {!activeStage && (
                <Pressable
                  onPress={handleImportPhotos}
                  style={styles.secondaryDarkBtn}
                >
                  <ImagePlus size={16} color="#FFFFFF" />
                  <Text style={styles.btnText}>+ Photo</Text>
                </Pressable>
              )}
              <Pressable
                onPress={handleSaveAll}
                style={[
                  styles.primaryDarkBtn,
                  { backgroundColor: colors.primary, marginLeft: 'auto' },
                ]}
              >
                <Check size={16} color="#FFFFFF" />
                <Text style={styles.btnText}>
                  Save ({confirmedPages.length + (activeStage ? 1 : 0)})
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#7F1D1D',
  },
  errText: {
    color: '#FEE2E2',
    fontSize: 13,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  statusText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  captureArea: {
    flex: 1,
  },
  videoWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  captureHint: {
    color: '#CBD5E1',
    textAlign: 'center',
    maxWidth: 340,
    fontSize: 14,
    lineHeight: 20,
  },
  captureChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 6,
  },
  cropWorkspace: {
    flex: 1,
  },
  cropActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#0F172A',
  },
  secondaryDarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#1E293B',
  },
  primaryDarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 10,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  bottomBar: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  shutterBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
  },
  queueFooter: {
    gap: 8,
  },
  thumbStrip: {
    gap: 8,
  },
  miniThumb: {
    width: 44,
    height: 58,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  miniThumbImg: {
    width: '100%',
    height: '100%',
  },
  finishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
