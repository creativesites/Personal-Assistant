import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

type P = { size?: number; color?: string; strokeWidth?: number };

export function ChatIcon({ size = 22, color = '#fff', strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z" />
    </Svg>
  );
}

export function OrbitIcon({ size = 26, color = '#fff', strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={3.2} />
      <Ellipse cx={12} cy={12} rx={10} ry={4.2} transform="rotate(-24 12 12)" />
      <Circle cx={20.2} cy={8.4} r={1.3} fill={color} />
    </Svg>
  );
}

export function CometIcon({ size = 22, color = '#fff', strokeWidth = 1.8 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={16.5} cy={7.5} r={3.5} />
      <Path d="M13.5 10.5 3 21M11 8 4 15M16 13l-6 6" />
    </Svg>
  );
}

export function SparkIcon({ size = 14, color = '#fff', strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
      <Path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
    </Svg>
  );
}

export function ArrowIcon({ size = 18, color = '#fff', strokeWidth = 2.2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function BackIcon({ size = 20, color = '#fff', strokeWidth = 2.2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function CheckIcon({ size = 20, color = '#fff', strokeWidth = 2.4 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12l5 5L20 6" />
    </Svg>
  );
}

export function CloseIcon({ size = 18, color = '#fff', strokeWidth = 2.2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

export function SlidersIcon({ size = 18, color = '#fff', strokeWidth = 2 }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <Circle cx={16} cy={7} r={2} />
      <Circle cx={10} cy={17} r={2} />
    </Svg>
  );
}
