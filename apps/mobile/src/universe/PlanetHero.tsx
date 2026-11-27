/** The Ignition planet: a banded, ringed world with two moons. Login hero. */
import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop, Pattern, G } from 'react-native-svg';
import { Orb } from './Orb';
import { OrbitSystem } from './OrbitSystem';
import { useLoop } from './motion';

const PLANET_SKIN = ['#C9BBFF', '#8C6BFF', '#160C45'] as const;

function Bands({ size }: { size: number }) {
  const t = useLoop(14000);
  return (
    <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View
        style={{
          width: size * 2,
          height: size,
          opacity: 0.55,
          transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, -size] }) }, { rotate: '-10deg' }, { scale: 1.3 }],
        }}
      >
        <Svg width={size * 2} height={size}>
          <Defs>
            <Pattern id="bands" width={size * 2} height={32} patternUnits="userSpaceOnUse">
              <Rect y={14} width={size * 2} height={4} fill="rgba(125,249,255,0.28)" />
              <Rect y={20} width={size * 2} height={7} fill="rgba(255,150,210,0.2)" />
            </Pattern>
          </Defs>
          <Rect width={size * 2} height={size} fill="url(#bands)" />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="term" cx="78%" cy="82%" r="70%">
            <Stop offset="0" stopColor="#03040B" stopOpacity={0.85} />
            <Stop offset="0.6" stopColor="#03040B" stopOpacity={0.15} />
            <Stop offset="1" stopColor="#03040B" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#term)" />
      </Svg>
    </View>
  );
}

function Atmosphere({ size }: { size: number }) {
  const v = useLoop(5000, { pingPong: true, rest: 0.5 });
  const s = size * 1.7;
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: s,
        height: s,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
      }}
    >
      <Svg width={s} height={s}>
        <Defs>
          <RadialGradient id="atmo" cx="50%" cy="50%" r="50%">
            <Stop offset="0.45" stopColor="#8C6BFF" stopOpacity={0.55} />
            <Stop offset="0.7" stopColor="#3EE6E0" stopOpacity={0.15} />
            <Stop offset="1" stopColor="#3EE6E0" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <G>
          <Circle cx={s / 2} cy={s / 2} r={s / 2} fill="url(#atmo)" />
        </G>
      </Svg>
    </Animated.View>
  );
}

export function PlanetHero({ width, height = 320, size = 184 }: { width: number; height?: number; size?: number }) {
  const float = useLoop(6000, { pingPong: true, rest: 0.5 });
  return (
    <Animated.View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ transform: [{ translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -9] }) }] }}
    >
      <OrbitSystem
        width={width}
        height={height}
        tiltDeg={76}
        periodMs={17000}
        rings={[
          { radius: size * 0.98, color: 'rgba(255,255,255,0.28)', dashed: true },
          { radius: size * 0.85, color: 'rgba(125,249,255,0.6)', width: 2 },
          { radius: size * 0.72, color: 'rgba(255,170,220,0.16)', width: 9 },
        ]}
        bodies={[
          { key: 'moon', radius: size * 0.85, angle: 20, size: 18, skin: ['#FFFFFF', '#7DF9FF', '#137C8A'], speed: 2 },
          { key: 'moon2', radius: size * 0.98, angle: 200, size: 12, skin: ['#FFF4E0', '#FFB86B', '#8A4A12'], speed: 1 },
        ]}
        center={
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Atmosphere size={size} />
            <Orb size={size} skin={PLANET_SKIN} />
            <Bands size={size} />
          </View>
        }
      />
    </Animated.View>
  );
}
