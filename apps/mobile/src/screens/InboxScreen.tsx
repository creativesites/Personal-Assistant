import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, ConversationSummary } from '../lib/api';
import { getSocket } from '../lib/socket';
import type { RootStackParamList } from '../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function HealthDot({ score }: { score: number | null }) {
  const color = score == null ? '#ccc' : score >= 70 ? '#4CAF50' : score >= 40 ? '#FF9800' : '#F44336';
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

export default function InboxScreen() {
  const navigation = useNavigation<Nav>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.getConversations();
      setConversations(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    getSocket().then((socket) => {
      socket.on('message:new', () => load());
      return () => socket.off('message:new');
    });
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6200EE" />
      </View>
    );
  }

  return (
    <FlatList
      data={conversations}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.row}
          onPress={() => navigation.navigate('Conversation', { conversationId: item.id, contactName: item.contactName })}
        >
          <View style={styles.rowLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.contactName.charAt(0).toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.rowContent}>
            <View style={styles.rowHeader}>
              <Text style={styles.name} numberOfLines={1}>{item.contactName}</Text>
              <Text style={styles.time}>{formatTime(item.lastMessageAt)}</Text>
            </View>
            <View style={styles.rowFooter}>
              <Text style={styles.preview} numberOfLines={1}>{item.lastMessagePreview}</Text>
              <View style={styles.rowBadges}>
                <HealthDot score={item.healthScore} />
                {item.unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No conversations yet</Text>
        </View>
      }
    />
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  separator: { height: 1, backgroundColor: '#f0f0f0', marginLeft: 76 },
  row: { flexDirection: 'row', padding: 12, backgroundColor: '#fff' },
  rowLeft: { marginRight: 12 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#6200EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  rowContent: { flex: 1, justifyContent: 'center' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '600', flex: 1, marginRight: 8 },
  time: { fontSize: 12, color: '#999' },
  preview: { fontSize: 14, color: '#666', flex: 1, marginRight: 8 },
  rowBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: {
    backgroundColor: '#6200EE',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  emptyText: { color: '#999', fontSize: 16 },
});
