/**
 * Orbits — relationships as a gravity map. Distance from your core encodes
 * health (closer = healthier), planet size encodes importance tier, and the
 * dashed outer band is where relationships drift. Tap a planet (or a chip in
 * the strip) to open its profile sheet. Spec: docs/MOBILE_UNIVERSE_DESIGN.md §4.4
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { api, Contact } from '../lib/api';
import type { RootStackParamList } from '../navigation';
import {
  BAND_STYLE,
  ChatIcon,
  Chip,
  colors,
  CometIcon,
  fonts,
  Glass,
  healthBand,
  HealthBand,
  initialOf,
  Label,
  LaunchButton,
  LoadingOrb,
  Orb,
  OrbitBody,
  OrbitSystem,
  Rise,
  skinFor,
  SpaceScreen,
  SUN_SKIN,
  tap,
  Title,
  useDockClearance,
} from '../universe';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Filter = 'all' | 'attention' | 'dormant';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All orbits' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'dormant', label: 'Dormant' },
];
const MAP_BODIES = 10;
const TIER_SIZE: Record<number, number> = { 1: 44, 2: 36, 3: 30 };

function matches(f: Filter, b: HealthBand) {
  if (f === 'all') return true;
  if (f === 'attention') return b === 'drifting';
  return b === 'dormant';
}

export default function RelationshipsScreen() {
  const navigation = useNavigation<Nav>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const clearance = useDockClearance();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chatByContact, setChatByContact] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selId, setSelId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [cs, convos] = await Promise.all([api.getContacts(), api.getConversations().catch(() => [])]);
      setContacts(cs);
      const map: Record<string, string> = {};
      for (const c of convos) map[c.contact.id] = c.id;
      setChatByContact(map);
      setSelId((cur) => cur ?? cs[0]?.id ?? null);
    } catch {
      // empty state covers it
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => contacts.filter((c) => matches(filter, healthBand(c.relationship.healthScore))), [contacts, filter]);

  const mapW = width;
  const mapH = 300;
  const maxR = Math.min(width / 2 - 26, 160);

  const bodies: OrbitBody[] = useMemo(
    () =>
      visible.slice(0, MAP_BODIES).map((c, i) => {
        const h = c.relationship.healthScore ?? 10;
        const tier = Math.min(3, Math.max(1, c.relationship.importanceTier || 3));
        return {
          key: c.id,
          // closer to the core = healthier bond
          radius: 30 + ((100 - Math.max(0, Math.min(100, h))) / 100) * (maxR - 30),
          angle: (i * 137.5) % 360, // golden angle: even spread, no clumping
          size: TIER_SIZE[tier],
          skin: skinFor(c.id),
          label: initialOf(c.name),
          accessibilityLabel: `${c.name}, health ${c.relationship.healthScore ?? 'unknown'}`,
        };
      }),
    [visible, maxR],
  );

  const selected = contacts.find((c) => c.id === selId) ?? visible[0] ?? null;

  if (loading) {
    return (
      <SpaceScreen>
        <LoadingOrb caption="Mapping your orbits…" />
      </SpaceScreen>
    );
  }

  return (
    <SpaceScreen>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: clearance }}
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
      >
        <View style={styles.pad}>
          <Label>Relationship gravity</Label>
          <Title>Orbits</Title>
          <Text style={styles.sub}>Closer to your core = a healthier bond</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  tap();
                  setFilter(f.key);
                }}
                style={[styles.filter, on && styles.filterOn]}
              >
                <Text style={[styles.filterText, on && { color: '#FFFFFF' }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ height: mapH }}>
          <OrbitSystem
            width={mapW}
            height={mapH}
            tiltDeg={64}
            periodMs={80000}
            rings={[
              { radius: maxR * 0.42, color: 'rgba(91,245,176,0.4)' },
              { radius: maxR * 0.7, color: 'rgba(125,249,255,0.25)' },
              { radius: maxR, color: 'rgba(255,150,110,0.45)', dashed: true, width: 1.5 },
            ]}
            bodies={bodies}
            selectedKey={selected?.id}
            onPressBody={(id) => {
              tap();
              setSelId(id);
            }}
            center={<Orb size={56} skin={SUN_SKIN} label="YOU" labelColor="#3A1200" labelSize={11} glow />}
          />
          <View style={styles.legend} pointerEvents="none">
            <LegendDot color={colors.aurora} label="THRIVING" />
            <LegendDot color={colors.ion} label="STEADY" />
            <LegendDot color={colors.ember} label="DRIFTING" dashed />
          </View>
        </View>

        {visible.length > MAP_BODIES ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {visible.map((c) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                accessibilityState={{ selected: c.id === selected?.id }}
                onPress={() => {
                  tap();
                  setSelId(c.id);
                }}
                style={[styles.stripItem, c.id === selected?.id && styles.stripOn]}
              >
                <Orb size={38} skin={skinFor(c.id)} label={initialOf(c.name)} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.pad}>
          {selected ? (
            <ProfileSheet
              key={selected.id}
              c={selected}
              onChat={chatByContact[selected.id] ? () => navigation.navigate('Conversation', {
                conversationId: chatByContact[selected.id],
                contactName: selected.name,
                contactId: selected.id,
                healthScore: selected.relationship.healthScore,
              }) : undefined}
              onNudge={() => navigation.navigate('Main', { screen: 'Proactive' })}
            />
          ) : (
            <Glass radius={30} style={styles.empty}>
              <Text style={styles.emptyTitle}>{contacts.length ? 'Nothing in this orbit' : 'An empty sky'}</Text>
              <Text style={styles.emptyBody}>
                {contacts.length ? 'Nobody matches this filter right now — that is good news.' : 'Contacts appear here once WhatsApp is linked from the web app.'}
              </Text>
            </Glass>
          )}
        </View>
      </ScrollView>
    </SpaceScreen>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dashed ? 'transparent' : color, borderWidth: dashed ? 1.5 : 0, borderColor: color, borderStyle: 'dashed' }} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function HealthRing({ score, color }: { score: number | null; color: string }) {
  const size = 60;
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Health ${score ?? 'unknown'}`}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={30} cy={30} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={5} fill="#0B0C1E" />
        <Circle
          cx={30}
          cy={30}
          r={r}
          stroke={color}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ * pct} ${circ}`}
          transform="rotate(-90 30 30)"
        />
      </Svg>
      <Text style={styles.ringNum}>{score ?? '—'}</Text>
    </View>
  );
}

function ProfileSheet({ c, onChat, onNudge }: { c: Contact; onChat?: () => void; onNudge: () => void }) {
  const band = healthBand(c.relationship.healthScore);
  const bs = BAND_STYLE[band];
  const trend = c.relationship.healthTrend;
  const role = [c.jobTitle, c.company].filter(Boolean).join(' · ');
  return (
    <Rise>
      <Glass radius={30} style={styles.sheet}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <HealthRing score={c.relationship.healthScore} color={bs.color} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.sheetName} numberOfLines={1}>
              {c.name}
            </Text>
            {role ? (
              <Text style={styles.role} numberOfLines={1}>
                {role}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <Chip text={`Tier ${c.relationship.importanceTier}`} color="#D3D7F0" fill="rgba(255,255,255,0.08)" />
              <Chip text={bs.label} color={bs.soft} fill={bs.fill} />
              {trend && trend !== 'stable' ? (
                <Chip
                  text={trend === 'improving' ? 'Warming ↑' : trend === 'declining' ? 'Cooling ↓' : trend}
                  color={trend === 'improving' ? colors.auroraSoft : colors.emberSoft}
                  fill="rgba(255,255,255,0.06)"
                />
              ) : null}
            </View>
          </View>
        </View>
        <Text style={styles.profile}>{c.profile?.personalitySummary ?? 'Zuri is still getting to know this person — their profile fills in as you talk.'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {onChat ? (
            <Pressable accessibilityRole="button" onPress={onChat} style={styles.chatBtn}>
              <ChatIcon size={18} color={colors.ink} />
              <Text style={styles.chatText}>Open chat</Text>
            </Pressable>
          ) : null}
          <LaunchButton title="Missions" onPress={onNudge} icon={<CometIcon size={18} />} height={48} style={{ flex: 1 }} />
        </View>
      </Glass>
    </Rise>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  filters: { gap: 8, paddingHorizontal: 20, paddingVertical: 14 },
  filter: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  filterOn: { backgroundColor: 'rgba(125,249,255,0.16)', borderColor: 'rgba(125,249,255,0.6)' },
  filterText: { fontFamily: fonts.bodyBold, fontSize: 13, color: '#C9CEEA' },
  legend: { position: 'absolute', right: 20, bottom: 4, gap: 4 },
  legendText: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 0.8, color: colors.inkMuted },
  strip: { gap: 6, paddingHorizontal: 20, paddingVertical: 10 },
  stripItem: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  stripOn: { borderColor: colors.ion },
  sheet: { padding: 16, gap: 12, marginTop: 6, backgroundColor: 'rgba(12,12,32,0.55)' },
  sheetName: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  role: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 1 },
  ringNum: { fontFamily: fonts.display, fontSize: 18, color: '#FFFFFF' },
  profile: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: '#C3C8E6' },
  chatBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  chatText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
  empty: { padding: 26, alignItems: 'center', gap: 8, marginTop: 8 },
  emptyTitle: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  emptyBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkSoft, textAlign: 'center' },
});
