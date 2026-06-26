import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Clipboard,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { api, Message, ReplySuggestion } from '../lib/api';
import type { RootStackParamList } from '../navigation';

type Route = RouteProp<RootStackParamList, 'Conversation'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ConversationScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { conversationId, contactName } = route.params;
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    navigation.setOptions({ title: contactName, headerShown: true });
  }, [contactName, navigation]);

  const load = useCallback(async () => {
    try {
      const data = await api.getMessages(conversationId);
      setMessages(data.messages);
      // Load suggestions for most recent contact message
      const lastContactMsg = [...data.messages].reverse().find((m) => m.senderType === 'contact');
      if (lastContactMsg?.requiresResponse) {
        const s = await api.getSuggestions(lastContactMsg.id);
        setSuggestions(s);
      }
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (suggestion: ReplySuggestion) => {
    await api.approveSuggestion(suggestion.id);
    Clipboard.setString(suggestion.body);
    Alert.alert('Copied!', 'Reply copied to clipboard and queued for send.');
    setSuggestions([]);
  };

  const handleDismiss = async (suggestion: ReplySuggestion) => {
    await api.dismissSuggestion(suggestion.id);
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6200EE" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.senderType === 'user' ? styles.mine : styles.theirs]}>
            <Text style={[styles.bubbleText, item.senderType === 'user' && styles.mineText]}>
              {item.body}
            </Text>
            <Text style={styles.timestamp}>{formatTime(item.whatsappTimestamp)}</Text>
          </View>
        )}
      />

      {suggestions.length > 0 && (
        <View style={styles.suggestionsPanel}>
          <Text style={styles.suggestionsTitle}>AI Reply Suggestions</Text>
          {suggestions.map((s) => (
            <View key={s.id} style={styles.suggestionCard}>
              <Text style={styles.suggestionTone}>{s.tone}</Text>
              <Text style={styles.suggestionBody}>{s.body}</Text>
              <View style={styles.suggestionActions}>
                <TouchableOpacity style={styles.approveBtn} onPress={() => handleApprove(s)}>
                  <Text style={styles.approveBtnText}>Copy & Send</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.dismissBtn} onPress={() => handleDismiss(s)}>
                  <Text style={styles.dismissBtnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messages: { padding: 12, gap: 8 },
  bubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: '#6200EE' },
  theirs: { alignSelf: 'flex-start', backgroundColor: '#fff', borderWidth: 1, borderColor: '#eee' },
  bubbleText: { fontSize: 15, color: '#222' },
  mineText: { color: '#fff' },
  timestamp: { fontSize: 11, color: '#999', marginTop: 4, textAlign: 'right' },
  suggestionsPanel: { backgroundColor: '#fff', padding: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  suggestionsTitle: { fontSize: 13, fontWeight: '600', color: '#6200EE', marginBottom: 8 },
  suggestionCard: { backgroundColor: '#f9f5ff', borderRadius: 8, padding: 10, marginBottom: 8 },
  suggestionTone: { fontSize: 11, color: '#9c27b0', textTransform: 'uppercase', marginBottom: 4 },
  suggestionBody: { fontSize: 14, color: '#222', marginBottom: 8 },
  suggestionActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { backgroundColor: '#6200EE', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12 },
  approveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dismissBtn: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: '#ccc' },
  dismissBtnText: { color: '#666', fontSize: 13 },
});
