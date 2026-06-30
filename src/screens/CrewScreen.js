import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function CrewScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('sicil_no', { ascending: true });

    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  }

  function getRoleLabel(user) {
    if (user.role === 'chief') return '👑 Ekip Şefi';
    if (user.is_ojti) return '🎓 OJTI';
    return '✅ Rate\'li ATC';
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1a2744" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ekip Listesi</Text>
        <Text style={styles.headerSub}>{users.length} kişi · Sicil sırasına göre</Text>
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={[styles.badge, { backgroundColor: item.color_hex }]}>
              <Text style={styles.badgeText}>{item.initial}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.full_name}</Text>
              <Text style={styles.meta}>Sicil: {item.sicil_no} · {getRoleLabel(item)}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  list: { padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8eef6',
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  badgeText: { fontSize: 14, fontWeight: '800', color: '#1a2744' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: '#1a2744' },
  meta: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
});