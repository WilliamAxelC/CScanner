import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = true,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const { colors, reduceMotion, scaleFont } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={onCancel}
        accessibilityLabel="Dismiss dialog"
        style={[styles.backdrop, { backgroundColor: colors.overlay }]}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.card,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <Text
            style={[styles.title, { color: colors.text, fontSize: scaleFont(17) }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          <Text
            style={[
              styles.message,
              { color: colors.textSecondary, fontSize: scaleFont(14) },
            ]}
          >
            {message}
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={[
                styles.btn,
                {
                  backgroundColor: colors.surfaceMuted,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontWeight: '600',
                  fontSize: scaleFont(14),
                }}
              >
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={confirmLabel}
              style={[
                styles.btn,
                {
                  backgroundColor: destructive ? colors.danger : colors.primary,
                  borderColor: 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: destructive ? '#FFFFFF' : colors.onPrimary,
                  fontWeight: '700',
                  fontSize: scaleFont(14),
                }}
              >
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 12,
  },
  title: { fontWeight: '700' },
  message: { lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
  },
  btn: {
    minHeight: 48,
    minWidth: 92,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
