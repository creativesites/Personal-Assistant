/**
 * The orbit dock — a floating glass tab bar. Signals and Missions sit on the
 * wings; Orbits (relationships) is the raised, pulsing core in the middle.
 */
import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Glass } from './Glass';
import { Orb } from './Orb';
import { ChatIcon, CometIcon, OrbitIcon } from './Icons';
import { colors, CORE_SKIN, fonts } from './theme';
import { useLoop } from './motion';
import { tap } from './Kit';

export const DOCK_HEIGHT = 74;

const META: Record<string, { label: string; Icon: typeof ChatIcon }> = {
  Inbox: { label: 'Signals', Icon: ChatIcon },
  Relationships: { label: 'Orbits', Icon: OrbitIcon },
  Proactive: { label: 'Missions', Icon: CometIcon },
};

function CoreButton({ focused, onPress }: { focused: boolean; onPress: () => void }) {
  const p = useLoop(2800);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel="Orbits — relationships"
      accessibilityState={{ selected: focused }}
      onPress={onPress}
      style={styles.coreWrap}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.coreHalo,
          {
            opacity: p.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0.7, 0, 0] }),
            transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
          },
        ]}
      />
      <View style={styles.coreRing}>
        <Orb size={60} skin={CORE_SKIN} glow>
          <OrbitIcon size={26} color="#FFFFFF" />
        </Orb>
      </View>
    </Pressable>
  );
}

export function Dock({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 6 }]}>
      <Glass radius={30} style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const go = () => {
            tap();
            const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
          };
          if (route.name === 'Relationships') return <CoreButton key={route.key} focused={focused} onPress={go} />;
          const meta = META[route.name];
          const c = focused ? '#FFFFFF' : colors.inkMuted;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={meta.label}
              accessibilityState={{ selected: focused }}
              onPress={go}
              style={styles.tab}
            >
              <meta.Icon color={c} />
              <Text style={[styles.tabLabel, { color: c }]}>{meta.label}</Text>
              <View style={[styles.dot, { opacity: focused ? 1 : 0 }]} />
            </Pressable>
          );
        })}
      </Glass>
    </View>
  );
}

/** Extra bottom padding screens need so content clears the floating dock. */
export function useDockClearance() {
  const insets = useSafeAreaInsets();
  return DOCK_HEIGHT + Math.max(insets.bottom, 12) + 24;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 18, right: 18 },
  bar: {
    height: DOCK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    overflow: 'visible',
    backgroundColor: 'rgba(12,12,32,0.72)',
  },
  tab: { minWidth: 72, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 0.2 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.ion, shadowColor: colors.ion, shadowOpacity: 1, shadowRadius: 5 },
  coreWrap: { width: 76, height: 76, marginTop: -40, alignItems: 'center', justifyContent: 'center' },
  coreRing: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(5,6,15,0.92)', alignItems: 'center', justifyContent: 'center' },
  coreHalo: { position: 'absolute', width: 66, height: 66, borderRadius: 33, borderWidth: 3, borderColor: 'rgba(155,123,255,0.8)' },
});
