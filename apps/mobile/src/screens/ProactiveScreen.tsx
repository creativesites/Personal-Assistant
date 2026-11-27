/**
 * Missions — proactive nudges as a 3D deck. "Launch message" sends the draft
 * for real (POST /api/proactive/:id/send) and the card flies off like a comet;
 * "Not now" swings it away (dismissed). When the deck is empty: "Orbit clear".
 * Spec: docs/MOBILE_UNIVERSE_DESIGN.md §4.5
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api, ProactiveItem } from '../lib/api';
import {
  CLEAR_SKIN,
  colors,
  CometIcon,
  fonts,
  GhostButton,
  gradients,
  initialOf,
  Label,
  LaunchButton,
  LoadingOrb,
  Orb,
  skinFor,
  SpaceScreen,
  SparkIcon,
  tap,
  Title,
  useDockClearance,
  useLoop,
  useMotion,
} from '../universe';

type Fate = 'launch' | 'skip';

const TYPE_STYLE: Record<string, { label: string; color: string; fill: string }> = {
  check_in: { label: 'Check in', color: colors.starSoft, fill: 'rgba(255,184,107,0.16)' },
  reconnect: { label: 'Reconnect', color: colors.emberSoft, fill: 'rgba(255,150,110,0.16)' },
  birthday: { label: 'Celebrate', color: colors.auroraSoft, fill: 'rgba(91,245,176,0.15)' },
  milestone: { label: 'Celebrate', color: colors.auroraSoft, fill: 'rgba(91,245,176,0.15)' },
  follow_up: { label: 'Follow up', color: colors.ionSoft, fill: 'rgba(125,249,255,0.13)' },
};
function typeStyle(t: string) {
  return TYPE_STYLE[t] ?? { label: t.replace(/_/g, ' '), color: colors.nebulaSoft, fill: 'rgba(155,123,255,0.18)' };
}

function Comet({ x, y, delay }: { x: number; y: number; delay: number }) {
  const t = useLoop(7000, { delayMs: delay });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 150,
        height: 2,
        opacity: t.interpolate({ inputRange: [0, 0.06, 0.3, 1], outputRange: [0, 1, 0, 0] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -340, -340] }) },
          { translateY: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 212, 212] }) },
          { rotate: '-32deg' },
        ],
      }}
    >
      <LinearGradient colors={['transparent', 'rgba(255,255,255,0.9)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 2 }} />
      <View style={styles.cometHead} />
    </Animated.View>
  );
}

function MissionCard({
  item,
  depth,
  fate,
  onLaunch,
  onSkip,
  busy,
}: {
  item: ProactiveItem;
  depth: number;
  fate: Fate | undefined;
  onLaunch: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  const { reduced } = useMotion();
  const d = useRef(new Animated.Value(depth)).current;
  const fly = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(d, { toValue: Math.max(0, depth), useNativeDriver: true, speed: 10, bounciness: 6 }).start();
  }, [depth, d]);

  useEffect(() => {
    if (!fate) return;
    Animated.timing(fly, {
      toValue: fate === 'launch' ? 1 : -1,
      duration: reduced ? 1 : 750,
      easing: Easing.bezier(0.5, 0, 0.75, 0.2),
      useNativeDriver: true,
    }).start();
  }, [fate, fly, reduced]);

  const ts = typeStyle(item.suggestionType);
  const front = depth === 0 && !fate;
  return (
    <Animated.View
      pointerEvents={front ? 'auto' : 'none'}
      importantForAccessibility={front ? 'auto' : 'no-hide-descendants'}
      accessibilityElementsHidden={!front}
      style={[
        styles.cardWrap,
        {
          zIndex: 20 - depth,
          elevation: 20 - depth,
          opacity: Animated.multiply(
            d.interpolate({ inputRange: [0, 1, 2, 3], outputRange: [1, 0.72, 0.44, 0], extrapolate: 'clamp' }),
            fly.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
          ),
          transform: [
            { perspective: 1100 },
            { translateX: fly.interpolate({ inputRange: [-1, 0, 1], outputRange: [-520, 0, 240] }) },
            { translateY: Animated.add(d.interpolate({ inputRange: [0, 3], outputRange: [0, -66] }), fly.interpolate({ inputRange: [-1, 0, 1], outputRange: [60, 0, -760] })) },
            { rotateZ: fly.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-22deg', '0deg', '34deg'] }) },
            { rotateX: d.interpolate({ inputRange: [0, 3], outputRange: ['0deg', '15deg'] }) },
            { scale: Animated.multiply(d.interpolate({ inputRange: [0, 3], outputRange: [1, 0.88] }), fly.interpolate({ inputRange: [-1, 0, 1], outputRange: [1, 1, 0.7] })) },
          ],
        },
      ]}
    >
      <LinearGradient colors={gradients.card as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={styles.card}>
        <View style={styles.cardHead}>
          <Orb size={48} skin={skinFor(item.contact.id)} label={initialOf(item.contact.name)} glow />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {item.contact.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {item.contact.relationshipType}
            </Text>
          </View>
          <View style={[styles.type, { backgroundColor: ts.fill }]}>
            <Text style={[styles.typeText, { color: ts.color }]}>{ts.label}</Text>
          </View>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={4}>
          {item.body}
        </Text>
        {item.draftMessage ? (
          <View style={styles.draft}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SparkIcon color={colors.ionSoft} />
              <Text style={styles.draftLabel}>Draft in your voice</Text>
            </View>
            <Text style={styles.draftText} numberOfLines={4}>
              {item.draftMessage}
            </Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GhostButton title="Not now" onPress={onSkip} />
          <LaunchButton
            title={item.draftMessage ? 'Launch message' : 'Mark done'}
            onPress={onLaunch}
            loading={busy}
            icon={<CometIcon size={18} />}
            height={52}
            style={{ flex: 1 }}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

export default function ProactiveScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const breathe = useLoop(5000, { pingPong: true, rest: 0.5 });
  const [items, setItems] = useState<ProactiveItem[]>([]);
  const [cur, setCur] = useState(0);
  const [fate, setFate] = useState<Record<string, Fate>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.getProactive());
      setCur(0);
      setFate({});
      setError(null);
    } catch {
      setError("Couldn't reach mission control. Pull down to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (item: ProactiveItem, f: Fate) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (f === 'launch') {
        if (item.draftMessage) await api.sendProactive(item.id);
        else await api.updateProactive(item.id, 'approved');
        tap('success');
      } else {
        await api.updateProactive(item.id, 'dismissed');
        tap();
      }
      setFate((prev) => ({ ...prev, [item.id]: f }));
      setTimeout(() => setCur((c) => c + 1), 420);
    } catch {
      setError(f === 'launch' ? "That message didn't launch. Is WhatsApp connected?" : "Couldn't update that mission.");
    } finally {
      setBusy(false);
    }
  };

  const left = Math.max(0, items.length - cur);
  const launched = Object.values(fate).filter((f) => f === 'launch').length;
  const done = !loading && cur >= items.length;
  const dots = items.slice(0, 8);

  if (loading) {
    return (
      <SpaceScreen>
        <LoadingOrb caption="Contacting mission control…" />
      </SpaceScreen>
    );
  }

  return (
    <SpaceScreen>
      <Comet x={width - 40} y={140} delay={0} />
      <Comet x={width + 40} y={420} delay={3200} />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: clearance, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={done || items.length === 0}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.ion}
            colors={[colors.nebula]}
            progressBackgroundColor="#140F33"
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={{ paddingHorizontal: 22 }}>
          <Label>Mission control</Label>
          <Title>Missions</Title>
          <Text style={styles.sub}>{left > 0 ? `${left} ${left === 1 ? 'nudge' : 'nudges'} in orbit` : 'Every orbit tended to'}</Text>
          {dots.length > 1 ? (
            <View style={styles.dots} accessibilityLabel={`Mission ${Math.min(cur + 1, items.length)} of ${items.length}`}>
              {dots.map((it, i) => {
                const f = fate[it.id];
                const bg = i < cur ? (f === 'launch' ? colors.aurora : '#6B7194') : i === cur ? colors.ion : 'rgba(255,255,255,0.18)';
                return (
                  <React.Fragment key={it.id}>
                    <View style={[styles.dot, { backgroundColor: bg, shadowColor: bg, shadowOpacity: i === cur ? 1 : 0 }]} />
                    {i < dots.length - 1 ? <View style={styles.dotLine} /> : null}
                  </React.Fragment>
                );
              })}
            </View>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {done ? (
          <View style={styles.clear}>
            <Animated.View style={{ transform: [{ scale: breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
              <Orb size={120} skin={CLEAR_SKIN} glow />
            </Animated.View>
            <Text style={styles.clearTitle} accessibilityRole="header">
              Orbit clear
            </Text>
            <Text style={styles.clearBody}>
              {items.length > 0
                ? `${launched} of ${items.length} messages launched. Zuri will watch for replies and bring anything new back to you.`
                : 'No nudges right now. Zuri will surface the next relationship that needs you.'}
            </Text>
            <GhostButton title="Check again" onPress={load} />
          </View>
        ) : (
          <View style={styles.stage}>
            {items.map((item, i) => {
              const depth = i - cur;
              if (depth > 3 || depth < -1) return null;
              return (
                <MissionCard
                  key={item.id}
                  item={item}
                  depth={Math.max(0, depth)}
                  fate={fate[item.id]}
                  busy={busy && depth === 0}
                  onLaunch={() => act(item, 'launch')}
                  onSkip={() => act(item, 'skip')}
                />
              );
            })}
          </View>
        )}
      </ScrollView>
    </SpaceScreen>
  );
}

const CARD_H = 470;

const styles = StyleSheet.create({
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  dots: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  dot: { width: 12, height: 12, borderRadius: 6, shadowRadius: 7, shadowOffset: { width: 0, height: 0 } },
  dotLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.emberSoft, marginTop: 10 },
  stage: { height: CARD_H + 80, marginTop: 8 },
  cardWrap: { position: 'absolute', left: 16, right: 16, top: 60, height: CARD_H },
  card: {
    flex: 1,
    borderRadius: 32,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 24 },
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, textTransform: 'capitalize' },
  type: { height: 26, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center' },
  typeText: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: 25, lineHeight: 29, letterSpacing: -0.7, color: colors.ink, marginTop: 4 },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: '#C3C8E6' },
  draft: { marginTop: 'auto', borderRadius: 20, padding: 14, backgroundColor: 'rgba(125,249,255,0.06)', borderWidth: 1, borderColor: 'rgba(125,249,255,0.22)', gap: 6 },
  draftLabel: { fontFamily: fonts.bodyHeavy, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.ionSoft },
  draftText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink },
  cometHead: { position: 'absolute', right: -3, top: -3, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', shadowColor: colors.ion, shadowOpacity: 1, shadowRadius: 8 },
  clear: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40, paddingTop: 60 },
  clearTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.ink, letterSpacing: -0.8, marginTop: 8 },
  clearBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.inkSoft, textAlign: 'center' },
});
