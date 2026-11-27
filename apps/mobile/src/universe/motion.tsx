/**
 * Motion system. One app-wide speed setting (calm / cosmic / hyper) scales every
 * ambient loop; the OS "reduce motion" setting freezes them entirely.
 * All loops run on the native driver — never animate layout props here.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type MotionLevel = 'calm' | 'cosmic' | 'hyper';
export const MOTION_LEVELS: MotionLevel[] = ['calm', 'cosmic', 'hyper'];
const MULTIPLIER: Record<MotionLevel, number> = { calm: 1.9, cosmic: 1, hyper: 0.45 };
const KEY = 'zuri_motion_level';

interface MotionState {
  level: MotionLevel;
  setLevel: (l: MotionLevel) => void;
  /** Multiply any ambient duration by this. */
  m: number;
  reduced: boolean;
}

const MotionContext = createContext<MotionState>({ level: 'cosmic', setLevel: () => {}, m: 1, reduced: false });

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [level, setLevelState] = useState<MotionLevel>('cosmic');
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync(KEY).then((v) => {
      if (v === 'calm' || v === 'cosmic' || v === 'hyper') setLevelState(v);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  const value = useMemo<MotionState>(
    () => ({
      level,
      reduced,
      m: MULTIPLIER[level],
      setLevel: (l) => {
        setLevelState(l);
        SecureStore.setItemAsync(KEY, l).catch(() => {});
      },
    }),
    [level, reduced],
  );
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useMotion() {
  return useContext(MotionContext);
}

/**
 * A 0→1 value that loops forever over `baseMs × motion multiplier`.
 * `pingPong` runs 0→1→0. Frozen at `rest` when reduce-motion is on.
 */
export function useLoop(baseMs: number, opts: { pingPong?: boolean; rest?: number; delayMs?: number } = {}) {
  const { m, reduced } = useMotion();
  const v = useRef(new Animated.Value(opts.rest ?? 0)).current;

  useEffect(() => {
    if (reduced) {
      v.setValue(opts.rest ?? 0);
      return;
    }
    const d = baseMs * m;
    const ease = opts.pingPong ? Easing.inOut(Easing.sin) : Easing.linear;
    const forward = Animated.timing(v, { toValue: 1, duration: d, easing: ease, useNativeDriver: true });
    const seq = opts.pingPong
      ? Animated.sequence([forward, Animated.timing(v, { toValue: 0, duration: d, easing: ease, useNativeDriver: true })])
      : forward;
    v.setValue(0);
    const loop = Animated.loop(seq, { resetBeforeIteration: !opts.pingPong });
    const start = setTimeout(() => loop.start(), opts.delayMs ?? 0);
    return () => {
      clearTimeout(start);
      loop.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseMs, m, reduced, opts.pingPong, opts.delayMs]);

  return v;
}

/** One-shot entrance: 0→1 on mount (the "rise" used by cards and copy). */
export function useEntrance(delayMs = 0, durationMs = 800) {
  const { reduced } = useMotion();
  const v = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  useEffect(() => {
    if (reduced) return;
    Animated.timing(v, {
      toValue: 1,
      duration: durationMs,
      delay: delayMs,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [v, delayMs, durationMs, reduced]);
  return v;
}
