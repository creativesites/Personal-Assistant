/** Small shared atoms: pills, chips, labels, buttons, the pressable 3D card, loading orb. */
import React, { useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Orb } from './Orb';
import { colors, CORE_SKIN, fonts, gradients, radii } from './theme';
import { useLoop } from './motion';

export function tap(style: 'light' | 'medium' | 'success' = 'light') {
  if (style === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(style === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function Label({ children, color = colors.inkMuted, style }: { children: React.ReactNode; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, { color }, style]}>{children}</Text>;
}

export function Title({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]} accessibilityRole="header">{children}</Text>;
}

export function LiveDot({ color = colors.aurora }: { color?: string }) {
  const v = useLoop(800, { pingPong: true, rest: 1 });
  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: color,
        shadowColor: color,
        shadowOpacity: 1,
        shadowRadius: 6,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
      }}
    />
  );
}

export function LivePill({ text, color }: { text: string; color?: string }) {
  return (
    <View style={styles.livePill}>
      <LiveDot color={color} />
      <Text style={styles.livePillText}>{text}</Text>
    </View>
  );
}

export function Chip({ text, color, fill, icon }: { text: string; color: string; fill: string; icon?: React.ReactNode }) {
  return (
    <View style={[styles.chip, { backgroundColor: fill }]}>
      {icon}
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** Primary CTA: violet→cyan gradient with a slow sheen sweeping across. */
export function LaunchButton({
  title,
  onPress,
  loading,
  icon,
  disabled,
  style,
  height = 56,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  const sheen = useLoop(3200);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        tap('medium');
        onPress();
      }}
      style={({ pressed }) => [{ opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }, style]}
    >
      <LinearGradient
        colors={gradients.launch as unknown as string[]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[styles.launch, { height }]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sheen,
            { transform: [{ translateX: sheen.interpolate({ inputRange: [0, 1], outputRange: [-160, 460] }) }, { rotate: '18deg' }] },
          ]}
        />
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            {icon}
            <Text style={styles.launchText}>{title}</Text>
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({ title, onPress, style }: { title: string; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [styles.ghost, { opacity: pressed ? 0.7 : 1 }, style]}
    >
      <Text style={styles.ghostText}>{title}</Text>
    </Pressable>
  );
}

/** A card that physically tilts back into the screen when pressed. */
export function TiltPressable({
  onPress,
  children,
  style,
  accessibilityLabel,
}: {
  onPress: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = useRef(new Animated.Value(0)).current;
  const to = (n: number) => Animated.spring(v, { toValue: n, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPressIn={() => to(1)}
      onPressOut={() => to(0)}
      onPress={() => {
        tap();
        onPress();
      }}
    >
      <Animated.View
        style={[
          style,
          {
            transform: [
              { perspective: 700 },
              { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.965] }) },
              { rotateX: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '7deg'] }) },
            ],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/** Loading state: Zuri's core breathing in the dark. */
export function LoadingOrb({ caption }: { caption?: string }) {
  const v = useLoop(1400, { pingPong: true, rest: 0.5 });
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={caption ?? 'Loading'}>
      <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }] }}>
        <Orb size={72} skin={CORE_SKIN} glow />
      </Animated.View>
      {caption ? <Text style={styles.loadingText}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: 38, letterSpacing: -1.5, color: colors.ink, lineHeight: 44 },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radii.chip,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  livePillText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.nebulaSoft },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 22, paddingHorizontal: 9, borderRadius: radii.chip },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  launch: {
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    overflow: 'hidden',
    shadowColor: '#6A45FF',
    shadowOpacity: 0.55,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  sheen: { position: 'absolute', top: -40, bottom: -40, width: 60, backgroundColor: 'rgba(255,255,255,0.22)' },
  launchText: { fontFamily: fonts.display, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.3 },
  ghost: {
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  ghostText: { fontFamily: fonts.bodyBold, fontSize: 14, color: '#C9CEEA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 },
  loadingText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.inkMuted },
});
