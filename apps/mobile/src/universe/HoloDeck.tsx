/**
 * A fan of holographic cards in 3D. The selected card swings to the front;
 * the others angle away on either side. Used for AI reply drafts.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts, gradients } from './theme';
import { useLoop } from './motion';
import { tap } from './Kit';

export interface HoloCard {
  id: string;
  eyebrow: string;
  eyebrowColor: string;
  body: string;
  meta?: string;
}

const CARD_W = 236;
const CARD_H = 164;

function Card({ card, offset, onPress }: { card: HoloCard; offset: number; onPress: () => void }) {
  const v = useRef(new Animated.Value(offset)).current;
  const shimmer = useLoop(4000);
  useEffect(() => {
    Animated.spring(v, { toValue: offset, useNativeDriver: true, speed: 9, bounciness: 7 }).start();
  }, [offset, v]);
  const front = offset === 0;
  return (
    <Animated.View
      style={[
        styles.cardWrap,
        {
          zIndex: 10 - Math.abs(offset),
          elevation: 10 - Math.abs(offset),
          opacity: v.interpolate({ inputRange: [-2, -1, 0, 1, 2], outputRange: [0, 0.55, 1, 0.55, 0] }),
          transform: [
            { perspective: 900 },
            { translateX: v.interpolate({ inputRange: [-2, -1, 0, 1, 2], outputRange: [-230, -128, 0, 128, 230] }) },
            { rotateY: v.interpolate({ inputRange: [-2, -1, 0, 1, 2], outputRange: ['60deg', '38deg', '0deg', '-38deg', '-60deg'] }) },
            { scale: v.interpolate({ inputRange: [-2, -1, 0, 1, 2], outputRange: [0.7, 0.86, 1, 0.86, 0.7] }) },
            { rotateX: '4deg' },
          ],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: front }}
        accessibilityLabel={`${card.eyebrow} draft: ${card.body}`}
        onPress={() => {
          tap();
          onPress();
        }}
        style={{ flex: 1 }}
      >
        <LinearGradient
          colors={gradients.card as unknown as string[]}
          style={[styles.card, { borderColor: front ? 'rgba(125,249,255,0.6)' : colors.glassBorder }]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmer,
              { transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-200, CARD_W + 80] }) }, { rotate: '20deg' }] },
            ]}
          />
          <View style={styles.cardTop}>
            <Text style={[styles.eyebrow, { color: card.eyebrowColor }]}>{card.eyebrow}</Text>
            {card.meta ? <Text style={styles.meta}>{card.meta}</Text> : null}
          </View>
          <Text style={styles.body} numberOfLines={5}>
            {card.body}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export function HoloDeck({ cards, selected, onSelect }: { cards: HoloCard[]; selected: number; onSelect: (i: number) => void }) {
  const { width } = useWindowDimensions();
  // Render the selected card last so it paints on top on both platforms.
  const order = cards.map((_, i) => i).sort((a, b) => Math.abs(b - selected) - Math.abs(a - selected));
  return (
    <View style={{ width, height: CARD_H + 16 }}>
      {order.map((i) => (
        <Card key={cards[i].id} card={cards[i]} offset={i - selected} onPress={() => onSelect(i)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: { position: 'absolute', left: '50%', marginLeft: -CARD_W / 2, top: 6, width: CARD_W, height: CARD_H },
  card: { flex: 1, borderRadius: 26, padding: 16, gap: 8, borderWidth: 1, overflow: 'hidden' },
  shimmer: { position: 'absolute', top: -60, bottom: -60, width: 70, backgroundColor: 'rgba(125,249,255,0.08)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontFamily: fonts.bodyHeavy, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  meta: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.ink },
});
