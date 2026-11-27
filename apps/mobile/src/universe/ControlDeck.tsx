/** Bottom sheet opened from the user's "sun": motion speed + sign out. */
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MOTION_LEVELS, MotionLevel, useMotion } from './motion';
import { colors, fonts, gradients } from './theme';
import { GhostButton, Label, tap } from './Kit';

const COPY: Record<MotionLevel, string> = {
  calm: 'Slow drift. Easy on the eyes.',
  cosmic: 'The default universe.',
  hyper: 'Everything at warp speed.',
};

export function ControlDeck({ visible, onClose, onSignOut }: { visible: boolean; onClose: () => void; onSignOut: () => void }) {
  const { level, setLevel, reduced } = useMotion();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close control deck" />
      <LinearGradient colors={gradients.card as unknown as string[]} style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.grip} />
        <Text style={styles.title}>Control deck</Text>
        <Label style={{ marginTop: 18 }}>Universe motion</Label>
        <View style={styles.row} accessibilityRole="radiogroup">
          {MOTION_LEVELS.map((l) => {
            const on = l === level;
            return (
              <Pressable
                key={l}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  tap();
                  setLevel(l);
                }}
                style={[styles.opt, on && styles.optOn]}
              >
                <Text style={[styles.optTitle, on && { color: '#FFFFFF' }]}>{l[0].toUpperCase() + l.slice(1)}</Text>
                <Text style={styles.optCopy}>{COPY[l]}</Text>
              </Pressable>
            );
          })}
        </View>
        {reduced ? <Text style={styles.note}>Reduce Motion is on in your device settings, so the universe is holding still.</Text> : null}
        <GhostButton title="Sign out" onPress={onSignOut} style={{ marginTop: 22 }} />
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(3,4,11,0.6)' },
  sheet: { borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 22, paddingTop: 12, borderWidth: 1, borderColor: colors.glassBorder },
  grip: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)', marginBottom: 16 },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.ink, letterSpacing: -0.6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  opt: { flex: 1, minHeight: 92, borderRadius: 20, padding: 12, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  optOn: { backgroundColor: 'rgba(125,249,255,0.12)', borderColor: 'rgba(125,249,255,0.6)' },
  optTitle: { fontFamily: fonts.display, fontSize: 15, color: '#C9CEEA' },
  optCopy: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 16 },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.starSoft, marginTop: 12 },
});
