import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Modal, ScrollView
} from 'react-native';
import { supabase } from '../lib/supabase';

const COLOR_PALETTE = [
  '#fde68a', '#bbf7d0', '#bfdbfe', '#e9d5ff', '#fecdd3',
  '#fed7aa', '#a5f3fc', '#d9f99d', '#fb923c', '#fda4af',
  '#6ee7b7', '#f0abfc', '#fbbf24', '#94a3b8', '#c4b5fd',
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Mevcut', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'annual_leave', label: 'Yıllık İzin', color: '#2563eb', bg: '#eff6ff' },
  { value: 'excuse_leave', label: 'Mazeret İzni', color: '#9333ea', bg: '#faf5ff' },
  { value: 'domestic_duty', label: 'Yurt İçi Görevli', color: '#0891b2', bg: '#ecfeff' },
  { value: 'abroad_duty', label: 'Yurt Dışı Görevli', color: '#d97706', bg: '#fffbeb' },
  { value: 'sick', label: 'Raporlu', color: '#dc2626', bg: '#fef2f2' },
  { value: 'hourly_leave', label: 'Saatlik İzinli', color: '#db2777', bg: '#fdf2f8' },
];

export default function CrewScreen({ user }) {
  const [users, setUsers] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [dayStatuses, setDayStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [statusModalUser, setStatusModalUser] = useState(null);

  const [formName, setFormName] = useState('');
  const [formInitial, setFormInitial] = useState('');
  const [formSicil, setFormSicil] = useState('');
  const [formIsOjti, setFormIsOjti] = useState(false);
  const [formDayOnly, setFormDayOnly] = useState(false);

  const today = new Date().toISOString().split('T')[0];
const isChief = user?.role === 'chief';

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const { data: allUsers } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)
      .order('sicil_no', { ascending: true });
    if (allUsers) setUsers(allUsers);

    const { data: pairData } = await supabase
      .from('ojti_pairs')
      .select('*, ojti:users!ojti_pairs_ojti_user_id_fkey(*), rate:users!ojti_pairs_rate_user_id_fkey(*)')
      .eq('is_active', true);
    if (pairData) setPairs(pairData);

    const { data: statusData } = await supabase
      .from('user_day_status')
      .select('*')
      .eq('status_date', today);

    if (statusData) {
      const map = {};
      statusData.forEach(s => { map[s.user_id] = s; });
      setDayStatuses(map);
    }

    setLoading(false);
  }

  function getStatus(userId) {
    return dayStatuses[userId]?.status || 'active';
  }

  function getStatusInfo(statusValue) {
    return STATUS_OPTIONS.find(s => s.value === statusValue) || STATUS_OPTIONS[0];
  }

  async function setUserStatus(userId, status, hourlyPeriod = null) {
    const existing = dayStatuses[userId];

    const payload = {
      user_id: userId,
      status_date: today,
      status,
    };

    if (status === 'hourly_leave' && hourlyPeriod) {
      if (hourlyPeriod === 'morning') {
        payload.hourly_leave_start = '06:00:00';
        payload.hourly_leave_end = '11:00:00';
      } else {
        payload.hourly_leave_start = '11:00:00';
        payload.hourly_leave_end = '16:00:00';
      }
    } else {
      payload.hourly_leave_start = null;
      payload.hourly_leave_end = null;
    }

    if (existing) {
      await supabase.from('user_day_status').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('user_day_status').insert(payload);
    }

    setStatusModalUser(null);
    fetchAll();
  }

  function openAddModal() {
    setEditingUser(null);
    setFormName('');
    setFormInitial('');
    setFormSicil('');
    setFormIsOjti(false);
    setFormDayOnly(false);
    setModalVisible(true);
  }

  function openEditModal(user) {
    setEditingUser(user);
    setFormName(user.full_name);
    setFormInitial(user.initial);
    setFormSicil(user.sicil_no);
    setFormIsOjti(user.is_ojti);
    setFormDayOnly(user.day_only || false);
    setModalVisible(true);
  }

  async function saveUser() {
    if (!formName || !formInitial || !formSicil) {
      alert('Lütfen tüm alanları doldurun.');
      return;
    }
    if (formInitial.length !== 2) {
      alert('Initial 2 harf olmalı.');
      return;
    }

    const usedColors = new Set(users.map(u => u.color_hex));
    const availableColors = COLOR_PALETTE.filter(c => !usedColors.has(c));
    const colorPool = availableColors.length > 0 ? availableColors : COLOR_PALETTE;
    const randomColor = colorPool[Math.floor(Math.random() * colorPool.length)];

    if (editingUser) {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: formName,
          initial: formInitial.toUpperCase(),
          sicil_no: formSicil,
          is_ojti: formIsOjti,
          day_only: formDayOnly,
        })
        .eq('id', editingUser.id);
      if (error) {
        alert('Hata: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('users')
        .insert({
          full_name: formName,
          initial: formInitial.toUpperCase(),
          sicil_no: formSicil,
          is_ojti: formIsOjti,
          day_only: formDayOnly,
          role: 'atc',
          password: '1234',
          color_hex: randomColor,
          is_active: true,
          airport_id: user?.airport_id || null,
        });
      if (error) {
        alert('Hata: ' + error.message);
        return;
      }
    }

    setModalVisible(false);
    fetchAll();
  }

  function confirmDelete(user) {
    if (confirm(`${user.full_name} ekipten çıkarılsın mı? (Geçmiş kayıtları korunur)`)) {
      deleteUser(user);
    }
  }

  async function deleteUser(user) {
    const { error } = await supabase.from('users').update({ is_active: false }).eq('id', user.id);
    if (error) {
      alert('Çıkarılamadı: ' + error.message);
      return;
    }
    fetchAll();
  }

  async function updatePair(ojtiUserId, newRateUserId) {
    const existing = pairs.find(p => p.ojti_user_id === ojtiUserId);
    if (existing) {
      await supabase.from('ojti_pairs').update({ rate_user_id: newRateUserId }).eq('id', existing.id);
    } else {
      await supabase.from('ojti_pairs').insert({ ojti_user_id: ojtiUserId, rate_user_id: newRateUserId });
    }
    setOpenDropdown(null);
    fetchAll();
  }

  function getCurrentRate(ojtiUserId) {
    const pair = pairs.find(p => p.ojti_user_id === ojtiUserId);
    return pair ? pair.rate : null;
  }

  function getRoleLabel(user) {
    if (user.role === 'chief') return 'Ekip Şefi';
    if (user.is_ojti) return 'Asistan ATC';
    return "Rate'li ATC";
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1a2744" size="large" />
      </View>
    );
  }

  const rateUsers = users.filter(u => !u.is_ojti && u.role !== 'chief');
  const ojtiUsers = users.filter(u => u.is_ojti);
  const activeCount = users.filter(u => getStatus(u.id) === 'active').length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Ekip Listesi</Text>
            <Text style={styles.headerSub}>{users.length} kişi · Bugün {activeCount} mevcut</Text>
          </View>
          {isChief && (
            <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
              <Text style={styles.addButtonText}>+ Ekle</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.todayLabel}>📅 Bugünkü Durum — Plandan Önce Doldurulmalı</Text>

        {users.map(item => {
          const statusVal = getStatus(item.id);
          const statusInfo = getStatusInfo(statusVal);
          const dayStatus = dayStatuses[item.id];

          return (
            <View key={item.id} style={styles.row}>
              <TouchableOpacity style={styles.rowMain} onPress={() => openEditModal(item)}>
                <View style={[styles.badge, { backgroundColor: item.color_hex }]}>
                  <Text style={styles.badgeText}>{item.initial}</Text>
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.full_name}</Text>
                  <Text style={styles.meta}>{getRoleLabel(item)}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statusChip, { backgroundColor: statusInfo.bg, borderColor: statusInfo.color }]}
                onPress={() => setStatusModalUser(item)}
              >
                <Text style={[styles.statusChipText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                  {statusVal === 'hourly_leave' && dayStatus?.hourly_leave_start === '06:00:00' ? ' (ÖÖ)' : ''}
                  {statusVal === 'hourly_leave' && dayStatus?.hourly_leave_start === '11:00:00' ? ' (ÖS)' : ''}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {ojtiUsers.length > 0 && (
          <View style={styles.ojtiSection}>
            <Text style={styles.sectionTitle}>Asistan ATC Eşleştirmeleri</Text>
            <Text style={styles.sectionSub}>Her asistan için sabit rate'li ATC seçin</Text>

            {ojtiUsers.map(ojti => {
              const currentRate = getCurrentRate(ojti.id);
              const isOpen = openDropdown === ojti.id;

              return (
                <View key={ojti.id} style={styles.pairCard}>
                  <View style={styles.pairHeader}>
                    <View style={[styles.badge, styles.badgeSmall, { backgroundColor: ojti.color_hex }]}>
                      <Text style={styles.badgeTextSmall}>{ojti.initial}</Text>
                    </View>
                    <Text style={styles.pairName}>{ojti.full_name}</Text>
                  </View>

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
          </View>
        )}
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingUser ? 'Kişiyi Düzenle' : 'Yeni Kişi Ekle'}
            </Text>

            <Text style={styles.label}>Ad Soyad</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Ad Soyad" />

            <Text style={styles.label}>Initial (2 harf)</Text>
            <TextInput
              style={styles.input}
              value={formInitial}
              onChangeText={(t) => setFormInitial(t.toUpperCase().slice(0, 2))}
              placeholder="GL"
              autoCapitalize="characters"
            />

            <Text style={styles.label}>Sicil No</Text>
            <TextInput style={styles.input} value={formSicil} onChangeText={setFormSicil} placeholder="001" keyboardType="numeric" />

            <Text style={styles.label}>Tip</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeButton, !formIsOjti && styles.typeButtonActive]}
                onPress={() => { setFormIsOjti(false); }}
              >
                <Text style={[styles.typeButtonText, !formIsOjti && styles.typeButtonTextActive]}>Rate'li ATC</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeButton, formIsOjti && styles.typeButtonActive]}
                onPress={() => { setFormIsOjti(true); setFormDayOnly(false); }}
              >
                <Text style={[styles.typeButtonText, formIsOjti && styles.typeButtonTextActive]}>Asistan ATC</Text>
              </TouchableOpacity>
            </View>
            {!formIsOjti && (
              <View style={[styles.typeRow, { marginTop: 8 }]}>
                <TouchableOpacity
                  style={[styles.typeButton, !formDayOnly && styles.typeButtonActive]}
                  onPress={() => setFormDayOnly(false)}
                >
                  <Text style={[styles.typeButtonText, !formDayOnly && styles.typeButtonTextActive]}>Ekip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeButton, formDayOnly && styles.typeButtonActive]}
                  onPress={() => setFormDayOnly(true)}
                >
                  <Text style={[styles.typeButtonText, formDayOnly && styles.typeButtonTextActive]}>Sadece Gündüz</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={saveUser}>
                <Text style={styles.saveButtonText}>Kaydet</Text>
              </TouchableOpacity>
            </View>

            {editingUser && isChief && (
  <TouchableOpacity
    style={styles.deleteLink}
    onPress={() => {
      setModalVisible(false);
      confirmDelete(editingUser);
    }}
  >
    <Text style={styles.deleteLinkText}>Bu kişiyi ekipten çıkar</Text>
  </TouchableOpacity>
)}
          </View>
        </View>
      </Modal>

      <Modal visible={!!statusModalUser} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {statusModalUser?.full_name} — Bugünkü Durum
            </Text>

            {STATUS_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.statusOption, { borderColor: opt.color }]}
                onPress={() => {
                  if (opt.value !== 'hourly_leave') {
                    setUserStatus(statusModalUser.id, opt.value);
                  }
                }}
              >
                <View style={[styles.statusDot, { backgroundColor: opt.color }]} />
                <Text style={styles.statusOptionText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}

            <View style={styles.hourlyRow}>
              <TouchableOpacity
                style={styles.hourlyButton}
                onPress={() => setUserStatus(statusModalUser.id, 'hourly_leave', 'morning')}
              >
                <Text style={styles.hourlyButtonText}>Saatlik - Öğleden Önce (06-11Z)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.hourlyButton}
                onPress={() => setUserStatus(statusModalUser.id, 'hourly_leave', 'afternoon')}
              >
                <Text style={styles.hourlyButtonText}>Saatlik - Öğleden Sonra (11-16Z)</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={() => setStatusModalUser(null)}>
              <Text style={styles.cancelButtonText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb', paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  addButton: { backgroundColor: '#ffffff', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addButtonText: { color: '#1a2744', fontWeight: '800', fontSize: 13 },
  scrollContent: { padding: 12 },
  todayLabel: { fontSize: 12, fontWeight: '700', color: '#1a2744', marginBottom: 10, backgroundColor: '#fef3c7', padding: 8, borderRadius: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8eef6',
  },
  rowMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  badge: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  badgeText: { fontSize: 13, fontWeight: '800', color: '#1a2744' },
  badgeSmall: { width: 30, height: 30, borderRadius: 8, marginRight: 8 },
  badgeTextSmall: { fontSize: 11, fontWeight: '800', color: '#1a2744' },
  info: { flex: 1 },
  name: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  meta: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  statusChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  statusChipText: { fontSize: 10, fontWeight: '700' },
  ojtiSection: { marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1a2744', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#94a3b8', marginBottom: 12 },
  pairCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e8eef6' },
  pairHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  pairName: { fontSize: 14, fontWeight: '700', color: '#1a2744' },
  selector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f4f7fb', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e2eaf4',
  },
  selectedRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  selectedName: { fontSize: 13, fontWeight: '600', color: '#1a2744' },
  placeholderText: { fontSize: 13, color: '#94a3b8' },
  chevron: { fontSize: 10, color: '#94a3b8' },
  dropdown: { marginTop: 6, backgroundColor: '#ffffff', borderRadius: 8, borderWidth: 1, borderColor: '#e2eaf4', overflow: 'hidden' },
  dropdownItem: { flexDirection: 'row', alignItems: 'center', padding: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  dropdownText: { fontSize: 13, fontWeight: '600', color: '#1a2744' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a2744', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#f4f7fb', borderWidth: 1, borderColor: '#e2eaf4', borderRadius: 8, padding: 12, fontSize: 14, color: '#1a2744' },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeButton: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center' },
  typeButtonActive: { backgroundColor: '#1a2744', borderColor: '#1a2744' },
  typeButtonText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  typeButtonTextActive: { color: '#ffffff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelButton: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center' },
  cancelButtonText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  saveButton: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: '#f59e0b', alignItems: 'center' },
  saveButtonText: { fontSize: 14, fontWeight: '800', color: '#1a2744' },
  deleteLink: { marginTop: 16, alignItems: 'center' },
  deleteLinkText: { fontSize: 13, color: '#dc2626', fontWeight: '600' },
  statusOption: { flexDirection: 'row', alignItems: 'center', padding: 12, borderWidth: 1, borderRadius: 8, marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  statusOptionText: { fontSize: 14, fontWeight: '600', color: '#1a2744' },
  hourlyRow: { marginTop: 8, marginBottom: 8 },
  hourlyButton: { backgroundColor: '#f4f7fb', padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#e2eaf4' },
  hourlyButtonText: { fontSize: 13, fontWeight: '600', color: '#1a2744', textAlign: 'center' },
});