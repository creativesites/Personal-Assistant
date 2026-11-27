import React from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useEntrance } from './motion';

/** Entrance: fades up out of the screen plane (translateY + tilt-back), staggered by `delay`. */
export function Rise({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useEntrance(delay);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { perspective: 800 },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) },
            { rotateX: v.interpolate({ inputRange: [0, 1], outputRange: ['22deg', '0deg'] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
