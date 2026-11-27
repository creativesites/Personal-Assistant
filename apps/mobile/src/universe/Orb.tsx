/**
 * A lit sphere — the atom of the universe. Every contact, the user ("sun") and
 * Zuri's own core are Orbs. Pure SVG radial gradients: a top-left highlight,
 * the body colour, and a terminator shadow bottom-right for volume.
 */
import React, { useRef } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { fonts, PlanetSkin } from './theme';

let uid = 0;

interface OrbProps {
  size: number;
  skin: PlanetSkin;
  label?: string;
  labelColor?: string;
  labelSize?: number;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Orb({ size, skin, label, labelColor = '#FFFFFF', labelSize, glow = false, style, children }: OrbProps) {
  const id = useRef(`orb${++uid}`).current;
  const [hi, body, shade] = skin;
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2 },
        glow && { shadowColor: body, shadowOpacity: 0.85, shadowRadius: size * 0.45, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
        style,
      ]}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`${id}b`} cx="32%" cy="28%" r="78%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.95} />
            <Stop offset="0.12" stopColor={hi} />
            <Stop offset="0.5" stopColor={body} />
            <Stop offset="1" stopColor={shade} />
          </RadialGradient>
          <RadialGradient id={`${id}t`} cx="80%" cy="84%" r="62%">
            <Stop offset="0" stopColor="#03040B" stopOpacity={0.6} />
            <Stop offset="1" stopColor="#03040B" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id}b)`} />
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id}t)`} />
      </Svg>
      {(label || children) && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          {label ? (
            <Text style={[styles.label, { color: labelColor, fontSize: labelSize ?? Math.max(10, size * 0.36) }]}>{label}</Text>
          ) : null}
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.display, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
});
