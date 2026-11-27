/**
 * Ignition — sign in. A ringed planet hovers over the form; launching
 * the session is literally "Launch into orbit". Spec: docs/MOBILE_UNIVERSE_DESIGN.md §4.1
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { ArrowIcon, colors, fonts, Label, LaunchButton, LivePill, Rise, SpaceScreen, tap } from '../universe';
import { PlanetHero } from '../universe/PlanetHero';

export default function LoginScreen() {
  const { login } = useAuth();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password to launch.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      tap('success');
    } catch {
      setError("That didn't connect. Check your email and password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SpaceScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PlanetHero width={width} height={300} size={Math.min(184, width * 0.47)} />
          <View style={styles.body}>
            <Rise>
              <LivePill text="RELATIONSHIP OS · ONLINE" />
            </Rise>
            <Rise delay={100}>
              <Text style={styles.wordmark} accessibilityRole="header">
                Zuri
              </Text>
              <Text style={styles.tagline}>Every relationship you care about, held in orbit. Zuri reads the gravity — you decide the move.</Text>
            </Rise>
            <Rise delay={220} style={{ gap: 12, marginTop: 6 }}>
              <View style={styles.field}>
                <Label>Email</Label>
                <TextInput
                  style={[styles.input, focus === 'email' && styles.inputFocus]}
                  placeholder="you@example.com"
                  placeholderTextColor="#8F97BD"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocus('email')}
                  onBlur={() => setFocus(null)}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  accessibilityLabel="Email"
                  editable={!loading}
                />
              </View>
              <View style={styles.field}>
                <Label>Password</Label>
                <TextInput
                  style={[styles.input, focus === 'password' && styles.inputFocus]}
                  placeholder="••••••••"
                  placeholderTextColor="#8F97BD"
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocus('password')}
                  onBlur={() => setFocus(null)}
                  secureTextEntry
                  autoComplete="password"
                  accessibilityLabel="Password"
                  editable={!loading}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
              </View>
              {error ? (
                <Text style={styles.error} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              ) : null}
            </Rise>
            <Rise delay={340}>
              <LaunchButton title="Launch into orbit" onPress={handleLogin} loading={loading} icon={<ArrowIcon />} height={58} />
            </Rise>
            <Rise delay={440}>
              <Text style={styles.footnote}>Zuri advises. You stay in control.</Text>
            </Rise>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SpaceScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 28, gap: 14 },
  wordmark: {
    fontFamily: fonts.display,
    fontSize: 66,
    lineHeight: 70,
    letterSpacing: -3,
    color: '#FFFFFF',
    textShadowColor: 'rgba(155,123,255,0.7)',
    textShadowRadius: 24,
  },
  tagline: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.inkSoft, marginTop: 6 },
  field: { gap: 6 },
  input: {
    height: 52,
    borderRadius: 18,
    paddingHorizontal: 18,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  inputFocus: { borderColor: 'rgba(125,249,255,0.7)', backgroundColor: 'rgba(125,249,255,0.06)' },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.emberSoft },
  footnote: { textAlign: 'center', fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
});
