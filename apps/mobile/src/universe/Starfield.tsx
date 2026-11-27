/**
 * The sky behind every screen: a deep gradient, a slowly breathing nebula,
 * and three twinkling star layers that drift upward forever.
 */
import React, { useMemo } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { gradients } from './theme';
import { useLoop } from './motion';

type Star = { x: number; y: number; s: number };

function makeStars(n: number, seed: number, w: number, h: number, size: number): Star[] {
  let x = seed;
  const rnd = () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
  return Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, s: size * (0.6 + rnd() * 0.8) }));
}

function StarLayer({ stars, color, twinkleMs, driftMs, height }: { stars: Star[]; color: string; twinkleMs: number; driftMs: number; height: number }) {
  const tw = useLoop(twinkleMs, { pingPong: true, rest: 1 });
  const drift = useLoop(driftMs);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: height * 2,
          opacity: tw.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
          transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -height] }) }],
        },
      ]}
    >
      {stars.map((st, i) => (
        <View
          key={i}
          style={{ position: 'absolute', left: st.x, top: st.y, width: st.s, height: st.s, borderRadius: st.s, backgroundColor: color }}
        />
      ))}
    </Animated.View>
  );
}

function Nebula({ w, h }: { w: number; h: number }) {
  const v = useLoop(40000, { pingPong: true });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -w * 0.3,
        top: -h * 0.2,
        width: w * 1.6,
        height: h * 1.4,
        transform: [
          { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, -w * 0.08] }) },
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, h * 0.04] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '10deg'] }) },
        ],
      }}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="nv" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#7C5CFF" stopOpacity={0.38} />
            <Stop offset="1" stopColor="#7C5CFF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="nc" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#3EE6E0" stopOpacity={0.2} />
            <Stop offset="1" stopColor="#3EE6E0" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="np" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FF78AA" stopOpacity={0.17} />
            <Stop offset="1" stopColor="#FF78AA" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx="32%" cy="24%" r={w * 0.62} fill="url(#nv)" />
        <Circle cx="82%" cy="38%" r={w * 0.5} fill="url(#nc)" />
        <Circle cx="50%" cy="88%" r={w * 0.7} fill="url(#np)" />
      </Svg>
    </Animated.View>
  );
}

export function Starfield() {
  const { width: w, height: h } = useWindowDimensions();
  const layers = useMemo(
    () => ({
      a: makeStars(70, 7, w, h * 2, 1.4),
      b: makeStars(36, 29, w, h * 2, 2.2),
      c: makeStars(14, 101, w, h * 2, 2.6),
    }),
    [w, h],
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={gradients.sky as unknown as string[]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Nebula w={w} h={h} />
      <StarLayer stars={layers.a} color="rgba(255,255,255,0.85)" twinkleMs={3500} driftMs={160000} height={h} />
      <StarLayer stars={layers.b} color="rgba(170,200,255,0.9)" twinkleMs={6000} driftMs={90000} height={h} />
      <StarLayer stars={layers.c} color="rgba(255,210,170,0.95)" twinkleMs={9000} driftMs={160000} height={h} />
    </View>
  );
}

/** Full-screen space backdrop. Every Universe screen renders inside one. */
export function SpaceScreen({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.root}>
      <Starfield />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#03040B', overflow: 'hidden' } });
