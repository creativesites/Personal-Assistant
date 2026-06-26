import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Clipboard,
  Alert,
} from 'react-native';
import { api, ProactiveItem } from '../lib/api';

export default function ProactiveScreen() {
  const [items, setItems] = useState<ProactiveItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const data = await api.getProactive();
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async (item: ProactiveItem, status: 'approved' | 'dismissed') => {
    if (status === 'approved' && item.draftMessage) {
      Clipboard.setString(item.draftMessage);
      Alert.alert('Copied!', 'Draft message copied to clipboard.');
    }
    await api.updateProactive(item.id, status);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6200EE" />
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.contactName}>{item.contactName}</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeText}>{item.suggestionType.replace('_', ' ')}</Text>
            </View>
          </View>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.body}>{item.body}</Text>
          {item.draftMessage && (
            <View style={styles.draftBox}>
              <Text style={styles.draftLabel}>Draft message</Text>
              <Text style={styles.draftText}>{item.draftMessage}</Text>
            </View>
          )}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.approveBtn}
              onPress={() => handleAction(item, 'approved')}
            >
              <Text style={styles.approveBtnText}>
                {item.draftMessage ? 'Copy Draft' : 'Done'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={() => handleAction(item, 'dismissed')}
            >
              <Text style={styles.dismissBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>You're all caught up!</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 12, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  contactName: { fontSize: 16, fontWeight: '700', color: '#222' },
  typeBadge: { backgroundColor: '#f3e5f5', borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  typeText: { fontSize: 11, color: '#9c27b0', textTransform: 'capitalize' },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  body: { fontSize: 14, color: '#555', marginBottom: 10, lineHeight: 20 },
  draftBox: { backgroundColor: '#f9f5ff', borderRadius: 8, padding: 10, marginBottom: 10 },
  draftLabel: { fontSize: 11, color: '#9c27b0', fontWeight: '600', marginBottom: 4 },
  draftText: { fontSize: 14, color: '#333', lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, backgroundColor: '#6200EE', borderRadius: 8, padding: 10, alignItems: 'center' },
  approveBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  dismissBtn: { flex: 1, borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  dismissBtnText: { color: '#666', fontSize: 14 },
});
