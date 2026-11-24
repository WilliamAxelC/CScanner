import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Annotation, SavedSignature } from '../types/models';
import { ResolvedImage } from './ResolvedImage';

interface PageAnnotationsOverlayProps {
  annotations: Annotation[];
  signatures: SavedSignature[];
  width: number;
  height: number;
  selectedId?: string | null;
  onSelectAnnotation?: (id: string) => void;
}

export function PageAnnotationsOverlay({
  annotations,
  signatures,
  width,
  height,
  selectedId,
  onSelectAnnotation,
}: PageAnnotationsOverlayProps) {
  if (!annotations.length || width <= 0 || height <= 0) return null;

  const sigMap = new Map(signatures.map((s) => [s.id, s]));

  return (
    <View
      style={[StyleSheet.absoluteFill, { width, height, overflow: 'hidden' }]}
      pointerEvents={onSelectAnnotation ? 'box-none' : 'none'}
    >
      {annotations.map((ann) => {
        if (ann.type === 'redact') {
          const isSelected = selectedId === ann.id;
          return (
            <Pressable
              key={ann.id}
              onPress={
                onSelectAnnotation
                  ? () => onSelectAnnotation(ann.id)
                  : undefined
              }
              style={{
                position: 'absolute',
                left: ann.x * width,
                top: ann.y * height,
                width: ann.width * width,
                height: ann.height * height,
                backgroundColor: ann.color,
                borderWidth: isSelected ? 2 : 0,
                borderColor: '#14B8A6',
              }}
            />
          );
        }

        if (ann.type === 'signature') {
          const sig = sigMap.get(ann.signatureId);
          if (!sig) return null;
          const isSelected = selectedId === ann.id;
          return (
            <Pressable
              key={ann.id}
              onPress={
                onSelectAnnotation
                  ? () => onSelectAnnotation(ann.id)
                  : undefined
              }
              style={{
                position: 'absolute',
                left: ann.x * width,
                top: ann.y * height,
                width: ann.width * width,
                height: ann.height * height,
                borderWidth: isSelected ? 1.5 : 0,
                borderStyle: 'dashed',
                borderColor: '#14B8A6',
              }}
            >
              <ResolvedImage
                uri={sig.pngUri}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </Pressable>
          );
        }

        if (ann.type === 'watermark' && ann.text.trim()) {
          const cells = ann.tiled ? [0.18, 0.5, 0.82] : [0.5];
          const fontSize = ann.tiled
            ? Math.max(11, width * 0.042)
            : Math.max(18, width * 0.08);
          return (
            <View
              key={ann.id}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            >
              {cells.map((ry, rIdx) =>
                cells.map((rx, cIdx) => (
                  <View
                    key={`${rIdx}-${cIdx}`}
                    style={{
                      position: 'absolute',
                      left: rx * width - width * 0.4,
                      top: ry * height - 20,
                      width: width * 0.8,
                      alignItems: 'center',
                      transform: [{ rotate: `${-ann.angle}deg` }],
                    }}
                  >
                    <Text
                      style={{
                        color: ann.color || '#64748B',
                        opacity: ann.opacity,
                        fontSize,
                        fontWeight: '800',
                        letterSpacing: 1.5,
                      }}
                      numberOfLines={1}
                    >
                      {ann.text}
                    </Text>
                  </View>
                )),
              )}
            </View>
          );
        }

        return null;
      })}
    </View>
  );
}
