import React, { useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Line, Polygon } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import type { Point, Quad } from '../types/models';
import { ResolvedImage } from './ResolvedImage';

interface QuadCropEditorProps {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  quad: Quad;
  onChange: (next: Quad) => void;
}

function clamp01(v: number): number {
  return Math.max(0.01, Math.min(0.99, v));
}

export function QuadCropEditor({
  imageUri,
  imageWidth,
  imageHeight,
  quad,
  onChange,
}: QuadCropEditorProps) {
  const { colors } = useTheme();
  const [box, setBox] = useState({ width: 320, height: 420 });

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 10 && height > 10) {
      setBox({ width, height });
    }
  };

  // Compute fitted image rectangle inside container
  const imgRect = useMemo(() => {
    const ar = Math.max(1, imageWidth) / Math.max(1, imageHeight);
    const boxAr = box.width / Math.max(1, box.height);
    let w = box.width;
    let h = box.height;
    if (ar > boxAr) {
      w = box.width - 24;
      h = w / ar;
    } else {
      h = box.height - 24;
      w = h * ar;
    }
    return {
      left: (box.width - w) / 2,
      top: (box.height - h) / 2,
      width: w,
      height: h,
    };
  }, [box, imageWidth, imageHeight]);

  const quadRef = useRef(quad);
  quadRef.current = quad;
  const rectRef = useRef(imgRect);
  rectRef.current = imgRect;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const startCornerRef = useRef<Point>({ x: 0, y: 0 });

  const responders = useMemo(
    () =>
      [0, 1, 2, 3].map((idx) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            startCornerRef.current = { ...quadRef.current[idx] };
          },
          onPanResponderMove: (_, gesture) => {
            const r = rectRef.current;
            const nx = clamp01(startCornerRef.current.x + gesture.dx / Math.max(1, r.width));
            const ny = clamp01(startCornerRef.current.y + gesture.dy / Math.max(1, r.height));
            const next = [...quadRef.current] as Quad;
            next[idx] = { x: nx, y: ny };
            onChangeRef.current(next);
          },
        }),
      ),
    [],
  );

  const pxPoints = quad.map((p) => ({
    x: p.x * imgRect.width,
    y: p.y * imgRect.height,
  }));

  const polyStr = pxPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.root} onLayout={handleLayout}>
      <View
        style={{
          position: 'absolute',
          left: imgRect.left,
          top: imgRect.top,
          width: imgRect.width,
          height: imgRect.height,
        }}
      >
        <ResolvedImage
          uri={imageUri}
          style={styles.img}
          resizeMode="stretch"
        />

        <Svg
          width={imgRect.width}
          height={imgRect.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Polygon
            points={polyStr}
            fill="rgba(20, 184, 166, 0.14)"
            stroke={colors.primary}
            strokeWidth={2.5}
          />
          {pxPoints.map((p, i) => {
            const next = pxPoints[(i + 1) % 4];
            return (
              <Line
                key={i}
                x1={p.x}
                y1={p.y}
                x2={next.x}
                y2={next.y}
                stroke={colors.primary}
                strokeWidth={2}
              />
            );
          })}
        </Svg>

        {pxPoints.map((p, idx) => (
          <View
            key={idx}
            {...responders[idx].panHandlers}
            style={[
              styles.handleHit,
              {
                left: p.x - 20,
                top: p.y - 20,
              },
            ]}
          >
            <View
              style={[
                styles.handleCircle,
                {
                  backgroundColor: colors.primary,
                  borderColor: '#FFFFFF',
                },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: '100%',
    position: 'relative',
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  handleHit: {
    position: 'absolute',
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab' as never,
  },
  handleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
});
