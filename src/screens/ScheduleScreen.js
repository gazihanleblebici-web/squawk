import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const [ojtiUsers, setOjtiUsers] = useState([]);
  const [rateUsers, setRateUsers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data: allUsers } = await supabase.from('users').select('*');
    if (allUsers) {
      setOjtiUsers(allUsers.filter(u => u.is_ojti));
      setRateUsers(allUsers.filter(u => !u.is_ojti && u.role !== 'chief'));
    }

    const { data: pairData } = await supabase
      .from('ojti_pairs')
      .select('*, ojti:users!ojti_pairs_ojti_user_id_fkey(*), rate:users!ojti_pairs_rate_user_id_fkey(*)')
      .eq('is_active', true);

    if (pairData) setPairs(pairData);
    setLoading(false);
  }

  async function updatePair(ojtiUserId, newRateUserId) {
    const existing = pairs.find(p => p.ojti_user_id === ojtiUserId);

    if (existing) {
      await supabase
        .from('ojti_pairs')
        .update({ rate_user_id: newRateUserId })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('ojti_pairs')
        .insert({ ojti_user_id: ojtiUserId, rate_user_id: newRateUserId });
    }

    setOpenDropdown(null);
    fetchData();
  }

  function getCurrentRate(ojtiUserId) {
    const pair = pairs.find(p => p.ojti_user_id === ojtiUserId);
    return pair ? pair.rate : null;
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
        <Text style={styles.headerTitle}>⚙️ Ayarlar</Text>
        <Text style={styles.headerSub}>OJTI Eşleştirme Yönetimi</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>OJTI - Rate'li ATC Eşleştirmeleri</Text>
        <Text style={styles.sectionSub}>Her OJTI için sabit asıl/yedek rate'li ATC seçin</Text>

        {ojtiUsers.map(ojti => {
          const currentRate = getCurrentRate(ojti.id);
          const isOpen = openDropdown === ojti.id;

          return (
            <View key={ojti.id} style={styles.pairCard}>
              <View style={styles.pairHeader}>
                <View style={[styles.badge, { backgroundColor: ojti.color_hex }]}>
                  <Text style={styles.badgeText}>{ojti.initial}</Text>
                </View>
                <View style={styles.pairInfo}>
                  <Text style={styles.pairName}>{ojti.full_name}</Text>
                  <Text style={styles.pairMeta}>OJTI</Text>
                </View>
              </View>

              <Text style={styles.arrow}>↓ eşleşti</Text>

              <TouchableOpacity
                style={styles.selector}
                onPress={() => setOpenDropdown(isOpen ? null : ojti.id)}
              >
                {currentRate ? (
                  <View style={styles.selectedRow}>
                    <View style={[styles.badge, styles.badgeSmall, { backgroundColor: currentRate.color_hex }]}>
                      <Text style={styles.badgeTextSmall}>{currentRate.initial}</Text>
                    </View>
                    <Text style={styles.selectedName}>{currentRate.full_name}</Text>
                  </View>
                ) : (
                  <Text style={styles.placeholderText}>Rate'li ATC seçin...</Text>
                )}
                <Text style={styles.chevron}>{isOpen ? '▲' : '▼'}</Text>
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.dropdown}>
                  {rateUsers.map(rate => (
                    <TouchableOpacity
                      key={rate.id}
                      style={styles.dropdownItem}
                      onPress={() => updatePair(ojti.id, rate.id)}
                    >
                      <View style={[styles.badge, styles.badgeSmall, { backgroundColor: rate.color_hex }]}>
                        <Text style={styles.badgeTextSmall}>{rate.initial}</Text>
                      </View>
                      <Text style={styles.dropdownText}>{rate.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  content: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1a2744', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#94a3b8', marginBottom: 16 },
  pairCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8eef6',
  },
  pairHeader: { flexDirection: 'row', alignItems: 'center' },
  badge: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  badgeText: { fontSize: 13, fontWeight: '800', color: '#1a2744' },
  badgeSmall: { width: 28, height: 28, borderRadius: 7, marginRight: 8 },
  badgeTextSmall: { fontSize: 11, fontWeight: '800', color: '#1a2744' },
  pairInfo: { flex: 1 },
  pairName: { fontSize: 14, fontWeight: '700', color: '#1a2744' },
  pairMeta: { fontSize: 11, color: '#9d174d', fontWeight: '600', marginTop: 1 },
  arrow: { fontSize: 11, color: '#94a3b8', textAlign: 'center', marginVertical: 8 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f4f7fb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2eaf4',
  },
  selectedRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  selectedName: { fontSize: 13, fontWeight: '600', color: '#1a2744' },
  placeholderText: { fontSize: 13, color: '#94a3b8' },
  chevron: { fontSize: 10, color: '#94a3b8' },
  dropdown: {
    marginTop: 6,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2eaf4',
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownText: { fontSize: 13, fontWeight: '600', color: '#1a2744' },
});