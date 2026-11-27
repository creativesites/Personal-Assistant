/**
 * Signals — the inbox as a constellation. You are the sun; your most recent
 * conversations orbit you (unread ones pulse), and the list below rises in on
 * glass cards that tilt under your thumb. Spec: docs/MOBILE_UNIVERSE_DESIGN.md §4.2
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, ConversationSummary } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useAuth } from '../hooks/useAuth';
import type { RootStackParamList } from '../navigation';
import {
  BAND_STYLE,
  Chip,
  colors,
  ControlDeck,
  fonts,
  Glass,
  greeting,
  healthBand,
  initialOf,
  Label,
  LivePill,
  LoadingOrb,
  Orb,
  OrbitBody,
  OrbitSystem,
  relativeTime,
  Rise,
  skinFor,
  SlidersIcon,
  SpaceScreen,
  SUN_SKIN,
  tap,
  TiltPressable,
  Title,
  useDockClearance,
} from '../universe';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const RINGS = [
  { radius: 75, speed: 3 },
  { radius: 116, speed: 2 },
  { radius: 158, speed: 1 },
];

export default function InboxScreen() {
  const navigation = useNavigation<Nav>();
  const { logout } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [deckOpen, setDeckOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setConversations(await api.getConversations());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    let off: (() => void) | undefined;
    getSocket()
      .then((socket) => {
        const onNew = () => load();
        socket.on('message:new', onNew);
        socket.on('conversation:upsert', onNew);
        off = () => {
          socket.off('message:new', onNew);
          socket.off('conversation:upsert', onNew);
        };
      })
      .catch(() => {});
    return () => off?.();
  }, [load]);

  const totalUnread = conversations.reduce((n, c) => n + (c.unreadCount ?? 0), 0);

  // The six most relevant chats become planets: first ring = top two, etc.
  const bodies: OrbitBody[] = useMemo(
    () =>
      conversations.slice(0, 6).map((c, i) => {
        const ring = RINGS[Math.floor(i / 2)];
        return {
          key: c.id,
          radius: ring.radius,
          speed: ring.speed,
          angle: (i % 2) * 180 + Math.floor(i / 2) * 70 + 30,
          size: [34, 30, 30, 26, 24, 22][i],
          skin: skinFor(c.contact.id),
          label: initialOf(c.contact.name),
          pulse: c.unreadCount > 0,
          accessibilityLabel: `Open chat with ${c.contact.name}`,
        };
      }),
    [conversations],
  );

  const open = (c: ConversationSummary) =>
    navigation.navigate('Conversation', { conversationId: c.id, contactName: c.contact.name, contactId: c.contact.id, healthScore: c.healthScore });

  const sysW = width;
  const sysH = 260;

  const header = (
    <View>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View>
          <Label>{greeting()}</Label>
          <Title>Signals</Title>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open control deck"
            onPress={() => {
              tap();
              setDeckOpen(true);
            }}
            style={styles.iconBtn}
          >
            <SlidersIcon color={colors.nebulaSoft} />
          </Pressable>
          <LivePill text={totalUnread > 0 ? `${totalUnread} unread` : 'All quiet'} color={totalUnread > 0 ? colors.ion : colors.aurora} />
        </View>
      </View>
      <View style={{ height: sysH, marginTop: 4, marginHorizontal: -16 }}>
        <OrbitSystem
          width={sysW}
          height={sysH}
          tiltDeg={68}
          periodMs={42000}
          rings={[
            { radius: 75, color: 'rgba(255,255,255,0.14)' },
            { radius: 116, color: 'rgba(125,249,255,0.22)', dashed: true },
            { radius: 158, color: 'rgba(255,170,220,0.16)' },
          ]}
          bodies={bodies}
          onPressBody={(id) => {
            const c = conversations.find((x) => x.id === id);
            if (c) open(c);
          }}
          center={
            <Pressable accessibilityRole="button" accessibilityLabel="You — open control deck" onPress={() => setDeckOpen(true)}>
              <Orb size={62} skin={SUN_SKIN} label="YOU" labelColor="#3A1200" labelSize={12} glow />
            </Pressable>
          }
        />
      </View>
      <View style={styles.sectionRow}>
        <Label>In orbit</Label>
        <Text style={styles.sectionHint}>Pulsing = waiting on you</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <SpaceScreen>
        <LoadingOrb caption="Tuning into your signals…" />
      </SpaceScreen>
    );
  }

  return (
    <SpaceScreen>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: clearance, paddingHorizontal: 16, gap: 10 }}
        showsVerticalScrollIndicator={false}
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
        renderItem={({ item, index }) => <SignalRow c={item} index={index} onPress={() => open(item)} />}
        ListEmptyComponent={
          <Glass radius={30} style={styles.empty}>
            <Text style={styles.emptyTitle}>{error ? 'Lost the signal' : 'A quiet sky'}</Text>
            <Text style={styles.emptyBody}>
              {error
                ? "Couldn't reach Zuri just now. Pull down to try again."
                : 'Link WhatsApp from the Zuri web app and your conversations will start orbiting here.'}
            </Text>
          </Glass>
        }
      />
      <ControlDeck
        visible={deckOpen}
        onClose={() => setDeckOpen(false)}
        onSignOut={() => {
          setDeckOpen(false);
          logout();
        }}
      />
    </SpaceScreen>
  );
}

function SignalRow({ c, index, onPress }: { c: ConversationSummary; index: number; onPress: () => void }) {
  const band = healthBand(c.healthScore);
  const bs = BAND_STYLE[band];
  return (
    <Rise delay={index < 8 ? 120 + index * 70 : 0}>
      <TiltPressable onPress={onPress} accessibilityLabel={`${c.contact.name}. ${c.unreadCount} unread. ${c.lastMessagePreview ?? ''}`}>
        <Glass style={styles.row}>
          <Orb size={46} skin={skinFor(c.contact.id)} label={initialOf(c.contact.name)} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <View style={styles.rowTop}>
              <Text style={styles.name} numberOfLines={1}>
                {c.contact.name}
              </Text>
              <Text style={styles.time}>{relativeTime(c.lastMessageAt)}</Text>
            </View>
            <Text style={styles.preview} numberOfLines={1}>
              {c.lastMessagePreview || 'No messages yet'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
              {c.contact.isGroup ? (
                <Chip text="Group" color={colors.ionSoft} fill="rgba(125,249,255,0.12)" />
              ) : (
                <Chip text={bs.label} color={bs.soft} fill={bs.fill} />
              )}
              {c.isPinned ? <Chip text="Pinned" color={colors.nebulaSoft} fill="rgba(155,123,255,0.18)" /> : null}
            </View>
          </View>
          {c.unreadCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{c.unreadCount}</Text>
            </View>
          ) : null}
        </Glass>
      </TiltPressable>
    </Rise>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 8, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginTop: 4, marginBottom: 6 },
  sectionHint: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, minHeight: 76 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted },
  preview: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft },
  badge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ion,
    shadowColor: colors.ion,
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  badgeText: { fontFamily: fonts.bodyHeavy, fontSize: 12, color: '#06121A' },
  empty: { padding: 26, alignItems: 'center', gap: 8, marginTop: 8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkSoft, textAlign: 'center' },
});
