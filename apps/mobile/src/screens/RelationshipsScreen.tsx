import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  ScrollView,
} from 'react-native';
import { api, Contact } from '../lib/api';

function HealthBar({ score }: { score: number | null }) {
  const pct = score ?? 0;
  const color = pct >= 70 ? '#4CAF50' : pct >= 40 ? '#FF9800' : '#F44336';
  return (
    <View style={styles.healthBar}>
      <View style={[styles.healthFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function RelationshipsScreen() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Contact | null>(null);

  useEffect(() => {
    api.getContacts().then(setContacts).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6200EE" />
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.displayName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.name}>{item.displayName}</Text>
                <Text style={styles.tier}>Tier {item.importanceTier}</Text>
              </View>
              <Text style={styles.score}>{item.healthScore ?? '—'}</Text>
            </View>
            <HealthBar score={item.healthScore} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No contacts yet</Text>
          </View>
        }
      />

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selected.displayName}</Text>
              <TouchableOpacity onPress={() => setSelected(null)}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <HealthBar score={selected.healthScore} />
              <Text style={styles.scoreLabel}>
                Health Score: {selected.healthScore ?? 'Unknown'}
              </Text>
              <Text style={styles.sectionTitle}>AI Profile</Text>
              <Text style={styles.profileText}>
                {selected.summary ?? 'No profile generated yet.'}
              </Text>
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  list: { padding: 12, gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6200EE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  tier: { fontSize: 12, color: '#999' },
  score: { fontSize: 20, fontWeight: 'bold', color: '#6200EE' },
  healthBar: { height: 6, backgroundColor: '#eee', borderRadius: 3, overflow: 'hidden' },
  healthFill: { height: '100%', borderRadius: 3 },
  emptyText: { color: '#999', fontSize: 16 },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  closeBtn: { fontSize: 22, color: '#666', padding: 4 },
  modalBody: { padding: 16 },
  scoreLabel: { fontSize: 16, color: '#6200EE', marginTop: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  profileText: { fontSize: 14, color: '#444', lineHeight: 22 },
});
