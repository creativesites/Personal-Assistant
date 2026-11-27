/**
 * A tilted star system rendered in 2.5D.
 *
 * React Native has no `transform-style: preserve-3d`, so instead of tilting a plane
 * we project each body's circular orbit onto the screen ourselves:
 *   x = r·cosθ,  y = r·sinθ·cos(tilt),  depth = sinθ  (+1 = nearest the viewer)
 * sampled at ORBIT_SAMPLES points and fed to `Animated.interpolate`, so the whole
 * orbit runs on the native driver with zero JS per frame.
 *
 * Occlusion: every body is drawn twice — once behind the centre object and once
 * in front — and each copy is only visible on its half of the orbit. Rings are
 * split into a back arc and a front arc the same way. Touch targets live in a
 * single top layer so a body is always tappable exactly once.
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Orb } from './Orb';
import { PlanetSkin } from './theme';
import { useLoop } from './motion';

const ORBIT_SAMPLES = 48;

export interface OrbitBody {
  key: string;
  radius: number;
  /** starting angle, degrees. 90 = nearest the viewer. */
  angle: number;
  size: number;
  skin: PlanetSkin;
  label?: string;
  /** whole revolutions per system period (integer keeps the loop seamless). Inner rings go faster. */
  speed?: number;
  pulse?: boolean;
  dim?: boolean;
  accessibilityLabel?: string;
}

export interface OrbitRing {
  radius: number;
  color: string;
  width?: number;
  dashed?: boolean;
}

interface Props {
  width: number;
  height: number;
  tiltDeg: number;
  periodMs: number;
  bodies: OrbitBody[];
  rings?: OrbitRing[];
  center?: React.ReactNode;
  selectedKey?: string | null;
  onPressBody?: (key: string) => void;
  /** reverse direction (counter-clockwise when seen from above) */
  reverse?: boolean;
}

function orbitTracks(t: Animated.Value, b: OrbitBody, cosT: number, reverse: boolean) {
  const input: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const sc: number[] = [];
  const front: number[] = [];
  const back: number[] = [];
  const speed = b.speed ?? 1;
  const dir = reverse ? -1 : 1;
  for (let k = 0; k <= ORBIT_SAMPLES; k++) {
    const p = k / ORBIT_SAMPLES;
    const th = (b.angle * Math.PI) / 180 + dir * 2 * Math.PI * speed * p;
    const depth = Math.sin(th);
    input.push(p);
    xs.push(b.radius * Math.cos(th));
    ys.push(b.radius * depth * cosT);
    sc.push(1 + 0.16 * depth);
    front.push(depth >= 0 ? 1 : 0);
    back.push(depth >= 0 ? 0 : 0.78);
  }
  return {
    translateX: t.interpolate({ inputRange: input, outputRange: xs }),
    translateY: t.interpolate({ inputRange: input, outputRange: ys }),
    scale: t.interpolate({ inputRange: input, outputRange: sc }),
    front: t.interpolate({ inputRange: input, outputRange: front }),
    back: t.interpolate({ inputRange: input, outputRange: back }),
  };
}

function ringArc(r: number, cosT: number, cx: number, cy: number, half: 'back' | 'front') {
  const ry = Math.max(1, r * cosT);
  // SVG y grows downward; sweep 1 from left→right passes over the top (the far side).
  return `M ${cx - r} ${cy} A ${r} ${ry} 0 0 ${half === 'back' ? 1 : 0} ${cx + r} ${cy}`;
}

function PulseRing({ size }: { size: number }) {
  const p = useLoop(1800);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -7,
        top: -7,
        width: size + 14,
        height: size + 14,
        borderRadius: size,
        borderWidth: 2,
        borderColor: '#7DF9FF',
        opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
        transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.5] }) }],
      }}
    />
  );
}

function SelectRing({ size }: { size: number }) {
  const p = useLoop(1600, { pingPong: true, rest: 1 });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -8,
        top: -8,
        width: size + 16,
        height: size + 16,
        borderRadius: size,
        borderWidth: 2,
        borderColor: '#7DF9FF',
        shadowColor: '#7DF9FF',
        shadowOpacity: 0.9,
        shadowRadius: 10,
        opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
        transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }],
      }}
    />
  );
}

export function OrbitSystem({ width, height, tiltDeg, periodMs, bodies, rings = [], center, selectedKey, onPressBody, reverse = false }: Props) {
  const t = useLoop(periodMs);
  const cosT = Math.cos((tiltDeg * Math.PI) / 180);
  const cx = width / 2;
  const cy = height / 2;
  const tracks = bodies.map((b) => orbitTracks(t, b, cosT, reverse));

  const renderBodies = (layer: 'back' | 'front') =>
    bodies.map((b, i) => {
      const tr = tracks[i];
      const opacity = layer === 'front' ? tr.front : tr.back;
      return (
        <Animated.View
          key={`${layer}-${b.key}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - b.size / 2,
            top: cy - b.size / 2,
            width: b.size,
            height: b.size,
            opacity: b.dim ? Animated.multiply(opacity, 0.2) : opacity,
            transform: [{ translateX: tr.translateX }, { translateY: tr.translateY }, { scale: tr.scale }],
          }}
        >
          <Orb size={b.size} skin={b.skin} label={b.label} />
          {b.pulse ? <PulseRing size={b.size} /> : null}
          {selectedKey === b.key ? <SelectRing size={b.size} /> : null}
        </Animated.View>
      );
    });

  const ringPaths = (half: 'back' | 'front') =>
    rings.map((r, i) => (
      <Path
        key={`${half}${i}`}
        d={ringArc(r.radius, cosT, cx, cy, half)}
        stroke={r.color}
        strokeWidth={r.width ?? 1}
        strokeDasharray={r.dashed ? '5 6' : undefined}
        fill="none"
      />
    ));

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {ringPaths('back')}
      </Svg>
      {renderBodies('back')}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.center]}>
        {center}
      </View>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        {ringPaths('front')}
      </Svg>
      {renderBodies('front')}
      {onPressBody
        ? bodies.map((b, i) => {
            const tr = tracks[i];
            const hit = Math.max(44, b.size + 8);
            return (
              <Animated.View
                key={`hit-${b.key}`}
                style={{
                  position: 'absolute',
                  left: cx - hit / 2,
                  top: cy - hit / 2,
                  width: hit,
                  height: hit,
                  transform: [{ translateX: tr.translateX }, { translateY: tr.translateY }],
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={b.accessibilityLabel ?? b.label}
                  accessibilityState={{ selected: selectedKey === b.key }}
                  onPress={() => onPressBody(b.key)}
                  style={{ flex: 1, borderRadius: hit }}
                />
              </Animated.View>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
