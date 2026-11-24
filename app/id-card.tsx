import { isNativeScannerAvailable, scanDocumentNative } from 'cscanner-mlkit';
import { useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, CreditCard, ImagePlus } from 'lucide-react-native';
import React, { useState } from 'react';
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
import { ResolvedImage } from '../src/components/ResolvedImage';
import { composeIdCard } from '../src/services/image/processor';
import { storage } from '../src/storage';
import { useAppStore } from '../src/store/useAppStore';
import { useTheme } from '../src/theme/ThemeProvider';
import { pickImagesFromDevice } from '../src/utils/imageImport';
import { generateId } from '../src/utils/ids';

export default function IdCardScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const createDocumentWithPages = useAppStore((s) => s.createDocumentWithPages);

  const [frontUri, setFrontUri] = useState<string | null>(null);
  const [backUri, setBackUri] = useState<string | null>(null);
  const [composed, setComposed] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nativeAvailable =
    Platform.OS === 'android' && isNativeScannerAvailable();

  const captureSide = async (side: 'front' | 'back', viaImport: boolean) => {
    setError(null);
    setBusy(true);
    try {
      let uri: string | null = null;
      if (!viaImport && nativeAvailable) {
        const res = await scanDocumentNative({
          pageLimit: 1,
          galleryImportAllowed: true,
          scannerMode: 'FULL',
        });
        if (!res.cancelled && res.pages[0]) {
          uri = res.pages[0].uri;
        }
      } else {
        const picked = await pickImagesFromDevice(false);
        if (picked[0]) {
          uri = await storage.saveImageBytes(
            `idtmp_${generateId()}`,
            picked[0].bytes,
            'jpg',
          );
        }
      }
      if (uri) {
        setComposed(null);
        if (side === 'front') setFrontUri(uri);
        else setBackUri(uri);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load side');
    } finally {
      setBusy(false);
    }
  };

  const handleCompose = async () => {
    if (!frontUri || !backUri) return;
    setBusy(true);
    setError(null);
    try {
      const result = await composeIdCard({ frontUri, backUri });
      setComposed(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to compose ID sheet',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!composed) return;
    setBusy(true);
    try {
      const bytes = await storage.readImageBytes(composed.uri);
      const doc = await createDocumentWithPages({
        title: `ID Card ${new Date().toLocaleDateString()}`,
        pages: [
          {
            originalBytes: bytes,
            processedBytes: bytes,
            width: composed.width,
            height: composed.height,
            filter: 'original',
          },
        ],
      });
      router.replace({ pathname: '/doc/[id]', params: { id: doc.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          ID Card Mode
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Scan or import the front and back of your ID card to place both cleanly onto a single A4 page.
        </Text>

        {error && (
          <View style={[styles.errBox, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>
          </View>
        )}

        <View style={styles.cardsGrid}>
          {(
            [
              { side: 'front', label: '1. Front Side', uri: frontUri },
              { side: 'back', label: '2. Back Side', uri: backUri },
            ] as const
          ).map((slot) => (
            <View
              key={slot.side}
              style={[
                styles.slotCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.slotLabel, { color: colors.text }]}>
                {slot.label}
              </Text>
              <View
                style={[
                  styles.slotPreview,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                  },
                ]}
              >
                {slot.uri ? (
                  <ResolvedImage
                    uri={slot.uri}
                    style={styles.slotImg}
                    resizeMode="contain"
                  />
                ) : (
                  <CreditCard size={34} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.slotBtns}>
                {nativeAvailable && (
                  <Pressable
                    onPress={() => captureSide(slot.side, false)}
                    style={[
                      styles.slotBtn,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Camera size={15} color="#FFFFFF" />
                    <Text style={styles.slotBtnTextWhite}>Scan</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() => captureSide(slot.side, true)}
                  style={[
                    styles.slotBtn,
                    {
                      backgroundColor: nativeAvailable
                        ? colors.surfaceMuted
                        : colors.primary,
                    },
                  ]}
                >
                  <ImagePlus
                    size={15}
                    color={nativeAvailable ? colors.text : '#FFFFFF'}
                  />
                  <Text
                    style={{
                      color: nativeAvailable ? colors.text : '#FFFFFF',
                      fontWeight: '600',
                      fontSize: 13,
                    }}
                  >
                    {nativeAvailable ? 'Import' : 'Select Photo'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        {busy && <ActivityIndicator size="large" color={colors.primary} />}

        {frontUri && backUri && !composed && !busy && (
          <Pressable
            onPress={handleCompose}
            style={[styles.primaryCta, { backgroundColor: colors.primary }]}
          >
            <CreditCard size={18} color="#FFFFFF" />
            <Text style={styles.primaryCtaText}>Combine onto A4 Page</Text>
          </Pressable>
        )}

        {composed && (
          <View
            style={[
              styles.previewCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.slotLabel, { color: colors.text }]}>
              Combined A4 Sheet Preview
            </Text>
            <View style={styles.a4Frame}>
              <ResolvedImage
                uri={composed.uri}
                style={styles.slotImg}
                resizeMode="contain"
              />
            </View>
            <Pressable
              onPress={handleSave}
              style={[styles.primaryCta, { backgroundColor: colors.primary }]}
            >
              <Check size={18} color="#FFFFFF" />
              <Text style={styles.primaryCtaText}>Save ID Sheet</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
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
  backBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  body: {
    padding: 16,
    gap: 16,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  errBox: {
    padding: 12,
    borderRadius: 10,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  slotCard: {
    flex: 1,
    minWidth: 250,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  slotLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  slotPreview: {
    aspectRatio: 1.58,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotImg: {
    width: '100%',
    height: '100%',
  },
  slotBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  slotBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  slotBtnTextWhite: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  primaryCtaText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  a4Frame: {
    aspectRatio: 1240 / 1754,
    maxHeight: 420,
    alignSelf: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
});
