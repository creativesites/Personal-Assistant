/** Concentric rings rushing toward the viewer — the Conversation backdrop ("signal tunnel"). */
import React from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useLoop } from './motion';

const RINGS = 6;

export function WarpTunnel({ centerY = 0.4 }: { centerY?: number }) {
  const { width, height } = useWindowDimensions();
  const t = useLoop(6000);
  const size = width * 0.9;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: RINGS }, (_, i) => {
        const p = Animated.modulo(Animated.add(t, i / RINGS), 1);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: width / 2 - size / 2,
              top: height * centerY - size / 2,
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: 1.5,
              borderColor: 'rgba(155,123,255,0.55)',
              shadowColor: '#9B7BFF',
              shadowOpacity: 0.6,
              shadowRadius: 18,
              opacity: p.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.6, 0.22, 0] }),
              transform: [{ scale: p.interpolate({ inputRange: [0, 0.5, 0.8, 1], outputRange: [0.05, 0.35, 0.95, 2.2] }) }],
            }}
          />
        );
      })}
    </View>
  );
}
