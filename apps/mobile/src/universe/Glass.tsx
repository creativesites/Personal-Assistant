import React from 'react';
import { StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radii } from './theme';

/** Frosted-glass surface. Translucent gradient + hairline border; no blur (Android-safe). */
export function Glass({ style, children, radius = radii.card }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode; radius?: number }) {
  return (
    <LinearGradient
      colors={gradients.glass as unknown as string[]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.glass, { borderRadius: radius }, style]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  glass: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colors.glassBorder, overflow: 'hidden' },
});
