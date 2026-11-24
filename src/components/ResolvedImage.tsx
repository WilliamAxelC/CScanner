import React, { useEffect, useState } from 'react';
import { Image, type ImageProps, View } from 'react-native';
import { resolveDisplayUri } from '../storage';
import { useTheme } from '../theme/ThemeProvider';

interface ResolvedImageProps extends Omit<ImageProps, 'source'> {
  uri?: string | null;
}

export function ResolvedImage({ uri, style, ...rest }: ResolvedImageProps) {
  const { colors } = useTheme();
  const [resolved, setResolved] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!uri) {
      setResolved('');
      return;
    }
    if (!uri.startsWith('idb-blob://')) {
      setResolved(uri);
      return;
    }
    resolveDisplayUri(uri)
      .then((u) => {
        if (active) setResolved(u);
      })
      .catch(() => {
        if (active) setResolved('');
      });
    return () => {
      active = false;
    };
  }, [uri]);

  if (!resolved) {
    return (
      <View
        style={[
          style,
          { backgroundColor: colors.surfaceMuted },
        ]}
      />
    );
  }

  return <Image source={{ uri: resolved }} style={style} {...rest} />;
}
