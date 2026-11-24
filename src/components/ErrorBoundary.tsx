import React from 'react';
import { AlertTriangle, Copy, RotateCcw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { redactSensitiveText, recordError } from '../services/diagnostics/errorLog';
import { copyTextToClipboard } from '../services/feedback/reportBuilder';
import { useTheme } from '../theme/ThemeProvider';

interface ErrorBoundaryState {
  hasError: boolean;
  errorText: string;
  copied: boolean;
}

function ErrorFallback({
  errorText,
  copied,
  onCopy,
  onReset,
}: {
  errorText: string;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
}) {
  const { colors, scaleFont } = useTheme();
  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.card,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <View
          style={[styles.iconCircle, { backgroundColor: colors.dangerSoft }]}
        >
          <AlertTriangle size={28} color={colors.danger} />
        </View>
        <Text
          style={[styles.title, { color: colors.text, fontSize: scaleFont(18) }]}
          accessibilityRole="header"
        >
          Something went wrong
        </Text>
        <Text
          style={[
            styles.desc,
            { color: colors.textSecondary, fontSize: scaleFont(14) },
          ]}
        >
          Your local documents and scans are safe on this device. Try reloading
          the screen or copy the sanitized error details for a bug report.
        </Text>
        <View
          style={[
            styles.codeBox,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}
        >
          <Text
            style={{ color: colors.textMuted, fontSize: scaleFont(12) }}
            selectable
          >
            {errorText}
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={onReset}
            accessibilityRole="button"
            accessibilityLabel="Reload CScanner screen"
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
          >
            <RotateCcw size={16} color={colors.onPrimary} />
            <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>
              Try Again
            </Text>
          </Pressable>
          <Pressable
            onPress={onCopy}
            accessibilityRole="button"
            accessibilityLabel="Copy sanitized error details"
            style={[
              styles.secondaryBtn,
              {
                backgroundColor: colors.surfaceMuted,
                borderColor: colors.border,
              },
            ]}
          >
            <Copy size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {copied ? 'Copied' : 'Copy Error'}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorText: '',
    copied: false,
  };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      errorText: redactSensitiveText(error),
      copied: false,
    };
  }

  componentDidCatch(error: unknown): void {
    recordError('UIErrorBoundary', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          errorText={this.state.errorText}
          copied={this.state.copied}
          onReset={() =>
            this.setState({ hasError: false, errorText: '', copied: false })
          }
          onCopy={() => {
            void copyTextToClipboard(this.state.errorText).then((res) => {
              if (res !== 'failed') {
                this.setState({ copied: true });
              }
            });
          }}
        />
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    gap: 12,
    alignItems: 'center',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontWeight: '800', textAlign: 'center' },
  desc: { textAlign: 'center', lineHeight: 20 },
  codeBox: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 12,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
});
