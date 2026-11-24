import { RotateCcw, Trash2 } from 'lucide-react-native';
import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import {
  renderSignaturePng,
  strokesToSvgPath,
  type StrokePoint,
} from '../utils/signaturePng';

interface SignaturePadProps {
  onSave: (result: {
    name: string;
    svgPathData: string;
    pngBytes: Uint8Array;
    width: number;
    height: number;
  }) => void;
  onCancel: () => void;
}

const INK_COLORS = ['#0F172A', '#1D4ED8', '#DC2626'];

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const { colors } = useTheme();
  const [name, setName] = useState('My Signature');
  const [inkColor, setInkColor] = useState(INK_COLORS[0]);
  const [strokes, setStrokes] = useState<StrokePoint[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<StrokePoint[]>([]);
  const [canvasSize, setCanvasSize] = useState({ width: 320, height: 180 });

  const sizeRef = useRef(canvasSize);
  sizeRef.current = canvasSize;
  const activeStrokeRef = useRef<StrokePoint[]>([]);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 10 && height > 10) {
      setCanvasSize({ width, height });
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const s = sizeRef.current;
          const pt = {
            x: Math.max(0, Math.min(1, locationX / Math.max(1, s.width))),
            y: Math.max(0, Math.min(1, locationY / Math.max(1, s.height))),
          };
          activeStrokeRef.current = [pt];
          setCurrentStroke([pt]);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const s = sizeRef.current;
          const pt = {
            x: Math.max(0, Math.min(1, locationX / Math.max(1, s.width))),
            y: Math.max(0, Math.min(1, locationY / Math.max(1, s.height))),
          };
          activeStrokeRef.current = [...activeStrokeRef.current, pt];
          setCurrentStroke(activeStrokeRef.current);
        },
        onPanResponderRelease: () => {
          if (activeStrokeRef.current.length > 0) {
            const finished = activeStrokeRef.current;
            setStrokes((prev) => [...prev, finished]);
          }
          activeStrokeRef.current = [];
          setCurrentStroke([]);
        },
      }),
    [],
  );

  const allStrokes = currentStroke.length
    ? [...strokes, currentStroke]
    : strokes;
  const svgD = useMemo(
    () => strokesToSvgPath(allStrokes, canvasSize.width, canvasSize.height),
    [allStrokes, canvasSize],
  );

  const handleSave = () => {
    if (strokes.length === 0) return;
    const pngW = 480;
    const pngH = 220;
    const pngBytes = renderSignaturePng(strokes, inkColor, pngW, pngH);
    const svgPathData = strokesToSvgPath(strokes, pngW, pngH);
    onSave({
      name: name.trim() || 'Signature',
      svgPathData,
      pngBytes,
      width: pngW,
      height: pngH,
    });
  };

  return (
    <View
      style={[
        styles.wrapper,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.heading, { color: colors.text }]}>
        Draw Signature
      </Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Signature label"
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

      <View style={styles.toolbar}>
        <View style={styles.colorsRow}>
          {INK_COLORS.map((hex) => (
            <Pressable
              key={hex}
              onPress={() => setInkColor(hex)}
              style={[
                styles.swatch,
                {
                  backgroundColor: hex,
                  borderColor:
                    inkColor === hex ? colors.primary : colors.border,
                  borderWidth: inkColor === hex ? 3 : 1,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.toolBtns}>
          <Pressable
            onPress={() => setStrokes((s) => s.slice(0, -1))}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceMuted }]}
          >
            <RotateCcw size={16} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => setStrokes([])}
            style={[styles.iconBtn, { backgroundColor: colors.surfaceMuted }]}
          >
            <Trash2 size={16} color={colors.danger} />
          </Pressable>
        </View>
      </View>

      <View
        onLayout={handleLayout}
        {...panResponder.panHandlers}
        style={styles.padBox}
      >
        <Svg width={canvasSize.width} height={canvasSize.height}>
          {svgD ? (
            <Path
              d={svgD}
              stroke={inkColor}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ) : null}
        </Svg>
        {allStrokes.length === 0 && (
          <Text style={styles.hintText}>Sign inside this white area</Text>
        )}
      </View>

      <View style={styles.footer}>
        <Pressable
          onPress={onCancel}
          style={[styles.btn, { backgroundColor: colors.surfaceMuted }]}
        >
          <Text style={{ color: colors.text, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          disabled={strokes.length === 0}
          style={[
            styles.btn,
            {
              backgroundColor:
                strokes.length === 0 ? colors.border : colors.primary,
            },
          ]}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
            Save Signature
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  colorsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  toolBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
    borderRadius: 8,
  },
  padBox: {
    height: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintText: {
    position: 'absolute',
    color: '#94A3B8',
    fontSize: 13,
    pointerEvents: 'none',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
});
