/**
 * Signal Tunnel — a single conversation. Rings rush toward you behind the chat;
 * Zuri's reply drafts hover in a 3D holographic fan above the composer.
 * Tap a side card to swing it forward, tap the front card to edit it, send to
 * approve it (the API queues it to WhatsApp). Spec: docs/MOBILE_UNIVERSE_DESIGN.md §4.3
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api, Message, ReplySuggestion } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { RootStackParamList } from '../navigation';
import {
  ArrowIcon,
  BackIcon,
  BAND_STYLE,
  CheckIcon,
  colors,
  fonts,
  Glass,
  gradients,
  healthBand,
  HoloCard,
  HoloDeck,
  initialOf,
  Label,
  LoadingOrb,
  Orb,
  Rise,
  skinFor,
  SpaceScreen,
  SparkIcon,
  tap,
  WarpTunnel,
} from '../universe';

type Route = RouteProp<RootStackParamList, 'Conversation'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const TONE_COLORS = ['#FFB3D9', colors.ionSoft, colors.starSoft, colors.auroraSoft];
const MEDIA_LABEL: Record<string, string> = {
  image: 'Photo',
  video: 'Video',
  audio: 'Voice note',
  document: 'Document',
  sticker: 'Sticker',
};

export default function ConversationScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { conversationId, contactName, contactId, healthScore } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [sel, setSel] = useState(0);
  const [text, setText] = useState('');
  const [editingFrom, setEditingFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sentFlash, setSentFlash] = useState(false);
  const [health, setHealth] = useState<number | null>(healthScore ?? null);

  const load = useCallback(async () => {
    try {
      const data = await api.getMessages(conversationId);
      setMessages(data.messages);
      if (data.contact?.healthScore != null) setHealth(data.contact.healthScore);
      const waiting = [...data.messages].reverse().find((m) => m.senderType === 'contact' && m.pendingSuggestions > 0);
      setSuggestions(waiting ? await api.getSuggestions(waiting.id) : []);
      setSel(0);
    } catch {
      // keep whatever we had; the tunnel stays calm
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
    api.markRead(conversationId).catch(() => {});
    let off: (() => void) | undefined;
    getSocket()
      .then((s) => {
        const refresh = () => load();
        s.on('message:new', refresh);
        s.on('suggestion:ready', refresh);
        off = () => {
          s.off('message:new', refresh);
          s.off('suggestion:ready', refresh);
        };
      })
      .catch(() => {});
    return () => off?.();
  }, [load, conversationId]);

  const cards: HoloCard[] = useMemo(
    () =>
      suggestions.map((s, i) => ({
        id: s.id,
        eyebrow: s.tone || `Draft ${i + 1}`,
        eyebrowColor: TONE_COLORS[i % TONE_COLORS.length],
        body: s.text,
        meta: s.needsOwner ? 'needs you' : undefined,
      })),
    [suggestions],
  );

  const reversed = useMemo(() => [...messages].reverse(), [messages]);
  const lastContact = useMemo(() => [...messages].reverse().find((m) => m.senderType === 'contact'), [messages]);
  const band = BAND_STYLE[healthBand(health)];

  const flash = () => {
    tap('success');
    setSentFlash(true);
    setTimeout(() => setSentFlash(false), 2200);
  };

  const send = async () => {
    if (sending) return;
    const typed = text.trim();
    setSending(true);
    try {
      if (editingFrom && typed) {
        await api.approveSuggestion(editingFrom, typed);
      } else if (typed) {
        await api.sendMessage(conversationId, typed);
      } else if (suggestions[sel]) {
        await api.approveSuggestion(suggestions[sel].id);
      } else {
        return;
      }
      setText('');
      setEditingFrom(null);
      setSuggestions([]);
      flash();
      setTimeout(load, 900);
    } catch {
      // leave text in place so nothing is lost
    } finally {
      setSending(false);
    }
  };

  const dismissSelected = async () => {
    const s = suggestions[sel];
    if (!s) return;
    tap();
    setSuggestions((prev) => prev.filter((x) => x.id !== s.id));
    setSel((i) => Math.max(0, Math.min(i, suggestions.length - 2)));
    if (editingFrom === s.id) setEditingFrom(null);
    api.dismissSuggestion(s.id).catch(() => {});
  };

  const canSend = !!text.trim() || suggestions.length > 0;

  return (
    <SpaceScreen>
      <WarpTunnel centerY={0.38} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 14 }}>
          <Glass radius={24} style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back to Signals" onPress={() => navigation.goBack()} style={styles.headerBtn}>
              <BackIcon />
            </Pressable>
            <Orb size={40} skin={skinFor(contactId ?? contactName)} label={initialOf(contactName)} glow />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.headerName} numberOfLines={1}>
                {contactName}
              </Text>
              <Text style={[styles.headerSub, { color: band.soft }]}>
                {health != null ? `Warmth ${health} · ${band.label.toLowerCase()}` : 'New orbit'}
              </Text>
            </View>
          </Glass>
        </View>

        {loading ? (
          <LoadingOrb caption="Opening the tunnel…" />
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={reversed}
            inverted
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 9 }}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              lastContact?.analysis?.requiresResponse && suggestions.length === 0 && !sentFlash ? (
                <View style={styles.notice}>
                  <SparkIcon color={colors.starSoft} />
                  <Text style={styles.noticeText}>Zuri noticed: this one is waiting on you</Text>
                </View>
              ) : null
            }
            renderItem={({ item, index }) => <Bubble m={item} delay={index < 10 ? index * 40 : 0} />}
          />
        )}

        {suggestions.length > 0 ? (
          <View style={{ paddingBottom: 6 }}>
            <View style={styles.deckRow}>
              <Label color={colors.nebulaSoft}>
                Zuri drafted {suggestions.length} {suggestions.length === 1 ? 'reply' : 'replies'} · your voice
              </Label>
              <Pressable accessibilityRole="button" onPress={dismissSelected} hitSlop={10} style={styles.notThis}>
                <Text style={styles.notThisText}>Not this one</Text>
              </Pressable>
            </View>
            <HoloDeck
              cards={cards}
              selected={sel}
              onSelect={(i) => {
                if (i === sel) {
                  // Tapping the front card pulls it into the composer for editing.
                  setText(suggestions[i].text);
                  setEditingFrom(suggestions[i].id);
                } else {
                  setSel(i);
                }
              }}
            />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: 14, paddingBottom: insets.bottom + 10, paddingTop: 6 }}>
          <Glass radius={28} style={styles.composer}>
            {sentFlash ? (
              <View style={styles.sent} accessibilityLiveRegion="polite">
                <CheckIcon color={colors.aurora} size={18} />
                <Text style={styles.sentText}>Sent into orbit. Zuri will watch for {contactName.split(' ')[0]}'s reply.</Text>
              </View>
            ) : (
              <TextInput
                style={styles.input}
                value={text}
                onChangeText={(v) => {
                  setText(v);
                  if (!v) setEditingFrom(null);
                }}
                placeholder={suggestions.length ? 'Send the front draft, or write your own…' : 'Write a message…'}
                placeholderTextColor="#8F97BD"
                multiline
                accessibilityLabel="Message"
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={text.trim() ? 'Send message' : 'Send the selected draft'}
              accessibilityState={{ disabled: !canSend || sending }}
              disabled={!canSend || sending}
              onPress={send}
              style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.92 : 1 }], opacity: canSend ? 1 : 0.4 }]}
            >
              <Orb size={52} skin={['#E9E3FF', '#9B7BFF', '#3B23B0']} glow>
                <ArrowIcon size={22} />
              </Orb>
            </Pressable>
          </Glass>
        </View>
      </KeyboardAvoidingView>
    </SpaceScreen>
  );
}

function Bubble({ m, delay }: { m: Message; delay: number }) {
  const mine = m.senderType === 'user';
  const body = m.body?.trim() || MEDIA_LABEL[m.messageType] || 'Message';
  const isMedia = !m.body?.trim();
  const time = new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const inner = (
    <>
      {!mine && m.senderDisplayName ? <Text style={styles.sender}>{m.senderDisplayName}</Text> : null}
      <Text style={[styles.bubbleText, isMedia && { fontStyle: 'italic', opacity: 0.85 }]}>{body}</Text>
      <Text style={styles.ts}>{time}</Text>
    </>
  );
  return (
    <Rise delay={delay} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
      {mine ? (
        <LinearGradient colors={gradients.outgoing as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, styles.mine]}>
          {inner}
        </LinearGradient>
      ) : (
        <Glass radius={22} style={[styles.bubble, styles.theirs]}>
          {inner}
        </Glass>
      )}
    </Rise>
  );
}

const styles = StyleSheet.create({
  header: { height: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, backgroundColor: 'rgba(12,12,32,0.6)' },
  headerBtn: { width: 44, height: 44, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerName: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  headerSub: { fontFamily: fonts.bodySemi, fontSize: 11.5, marginTop: 1 },
  notice: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,184,107,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,184,107,0.35)',
  },
  noticeText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.starSoft },
  bubble: { paddingVertical: 10, paddingHorizontal: 15, borderRadius: 22 },
  mine: { borderBottomRightRadius: 8, shadowColor: '#6A45FF', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
  theirs: { borderBottomLeftRadius: 8 },
  sender: { fontFamily: fonts.bodyBold, fontSize: 11, color: colors.ionSoft, marginBottom: 2 },
  bubbleText: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20.5, color: '#FFFFFF' },
  ts: { fontFamily: fonts.body, fontSize: 10.5, color: 'rgba(255,255,255,0.65)', marginTop: 4, alignSelf: 'flex-end' },
  deckRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginBottom: 2 },
  notThis: { minHeight: 32, justifyContent: 'center' },
  notThisText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.inkMuted, textDecorationLine: 'underline' },
  composer: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 18, paddingRight: 10, backgroundColor: 'rgba(12,12,32,0.65)' },
  input: { flex: 1, maxHeight: 110, fontFamily: fonts.body, fontSize: 14.5, color: '#FFFFFF', paddingVertical: 8 },
  sent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sentText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.auroraSoft },
});
