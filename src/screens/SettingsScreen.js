import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, ActivityIndicator
} from 'react-native';
import { supabase } from '../lib/supabase';

const DISPLAY_TYPES = [
  { value: 'hourly_table', label: 'Saatlik Tablo', desc: 'Her saat rotasyon (gunduz/ana nobet)', color: '#bfdbfe' },
  { value: 'fixed_block', label: 'Sabit Blok', desc: 'Tek blok, birkas kisi (gececi/araci)', color: '#bbf7d0' },
  { value: 'offset_timeline', label: 'Kaydirmali', desc: 'Farkli sure bloklar (sabahci yaz modu)', color: '#fde68a' },
];

export default function SettingsScreen({ user, onLogout }) {
  const [allAirports, setAllAirports] = useState([]);
  const [selectedAirport, setSelectedAirport] = useState(null);
  const [shiftTemplates, setShiftTemplates] = useState([]);
  const [shiftStartDate, setShiftStartDate] = useState('');
  const [shiftStartType, setShiftStartType] = useState('day');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [airportModal, setAirportModal] = useState(false);
  const [blockModal, setBlockModal] = useState(false);
  const [createShiftModal, setCreateShiftModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);
  const [newShiftType, setNewShiftType] = useState('day');
  const [newShiftStart, setNewShiftStart] = useState('06:00');
  const [newShiftEnd, setNewShiftEnd] = useState('16:00');

  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formType, setFormType] = useState('hourly_table');

  useEffect(() => {
    fetchData();
    if (user?.role === 'chief') {
      setShiftStartDate(user.shift_start_date || '');
      setShiftStartType(user.shift_start_type || 'day');
    }
  }, []);

  async function fetchData() {
    setLoading(true);

    const { data: airports } = await supabase
      .from('airports')
      .select('*')
      .order('icao_code', { ascending: true });
    if (airports) setAllAirports(airports);

    const { data: userData } = await supabase
      .from('users')
      .select('airport_id, airports(*)')
      .not('airport_id', 'is', null)
      .limit(1)
      .maybeSingle();

    const currentAirport = userData?.airports || airports?.[0];
    if (currentAirport) {
      setSelectedAirport(currentAirport);
      await fetchTemplates(currentAirport.id);
    }

    setLoading(false);
  }

  async function fetchTemplates(airportId) {
    const { data: templates } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('airport_id', airportId)
      .order('shift_type', { ascending: true });

    if (templates && templates.length > 0) {
      setShiftTemplates(templates);
      setSelectedTemplate(templates[0]);
      await fetchBlocks(templates[0].id);
    } else {
      setShiftTemplates([]);
      setSelectedTemplate(null);
      setBlocks([]);
    }
  }

  async function fetchBlocks(templateId) {
    const { data } = await supabase
      .from('shift_blocks')
      .select('*')
      .eq('shift_template_id', templateId)
      .order('block_order', { ascending: true });
    if (data) setBlocks(data);
  }

  async function selectAirport(airport) {
    setSelectedAirport(airport);
    await supabase.from('users').update({ airport_id: airport.id });
    await fetchTemplates(airport.id);
    setAirportModal(false);
  }

  async function createShiftTemplate() {
    if (!newShiftStart || !newShiftEnd) {
      alert('Lutfen baslangic ve bitis saatlerini girin.');
      return;
    }

    const { data: template } = await supabase
      .from('shift_templates')
      .insert({
        airport_id: selectedAirport.id,
        shift_type: newShiftType,
        start_zulu: newShiftStart + ':00',
        end_zulu: newShiftEnd + ':00',
        name: newShiftType === 'day' ? 'Gunduz' : 'Gece',
      })
      .select()
      .single();

    if (template) {
      await supabase.from('shift_blocks').insert({
        shift_template_id: template.id,
        block_order: 1,
        name: newShiftType === 'day' ? 'Ana Nobet' : '1. Blok',
        start_zulu: newShiftStart + ':00',
        end_zulu: newShiftEnd + ':00',
        display_type: 'hourly_table',
        always_open_positions: ['YWU', 'PLN'],
      });

      setCreateShiftModal(false);
      await fetchTemplates(selectedAirport.id);
    }
  }

  function openAddBlock() {
    setEditingBlock(null);
    setFormName('');
    setFormStart('');
    setFormEnd('');
    setFormType('hourly_table');
    setBlockModal(true);
  }

  function openEditBlock(block) {
    setEditingBlock(block);
    setFormName(block.name);
    setFormStart(block.start_zulu.slice(0, 5));
    setFormEnd(block.end_zulu.slice(0, 5));
    setFormType(block.display_type);
    setBlockModal(true);
  }

  async function saveBlock() {
    if (!formName || !formStart || !formEnd) {
      alert('Lutfen tum alanlari doldurun.');
      return;
    }

    const payload = {
      shift_template_id: selectedTemplate.id,
      name: formName,
      start_zulu: formStart + ':00',
      end_zulu: formEnd + ':00',
      display_type: formType,
      block_order: editingBlock ? editingBlock.block_order : blocks.length + 1,
      always_open_positions: ['YWU', 'PLN'],
    };

    if (editingBlock) {
      await supabase.from('shift_blocks').update(payload).eq('id', editingBlock.id);
    } else {
      await supabase.from('shift_blocks').insert(payload);
    }

    setBlockModal(false);
    fetchBlocks(selectedTemplate.id);
  }

  async function deleteBlock(block) {
    if (confirm(`"${block.name}" blogunu sil?`)) {
      await supabase.from('shift_blocks').delete().eq('id', block.id);
      fetchBlocks(selectedTemplate.id);
    }
  }

  function getTypeInfo(value) {
    return DISPLAY_TYPES.find(t => t.value === value) || DISPLAY_TYPES[0];
  }

  function renderTimeline() {
    if (blocks.length === 0) return null;
    const isNight = selectedTemplate?.shift_type === 'night';
    const totalHours = isNight ? 14 : 10;

    function getPercent(timeStr) {
      const [h, m] = timeStr.slice(0, 5).split(':').map(Number);
      const startH = isNight ? 16 : 6;
      let mins = (h * 60 + m) - (startH * 60);
      if (mins < 0) mins += 24 * 60;
      return (mins / (totalHours * 60)) * 100;
    }

    function getWidth(startStr, endStr) {
      const [sh, sm] = startStr.slice(0, 5).split(':').map(Number);
      const [eh, em] = endStr.slice(0, 5).split(':').map(Number);
      let startMins = sh * 60 + sm;
      let endMins = eh * 60 + em;
      if (endMins <= startMins) endMins += 24 * 60;
      return ((endMins - startMins) / (totalHours * 60)) * 100;
    }

    const colors = { hourly_table: '#bfdbfe', fixed_block: '#bbf7d0', offset_timeline: '#fde68a' };

    return (
      <View style={styles.timelineWrap}>
        <View style={styles.timelineBar}>
          {blocks.map(block => {
            const left = getPercent(block.start_zulu);
            const width = getWidth(block.start_zulu, block.end_zulu);
            return (
              <View
                key={block.id}
                style={[styles.timelineBlock, {
                  left: `${left}%`,
                  width: `${Math.max(width, 5)}%`,
                  backgroundColor: colors[block.display_type] || '#e2e8f0',
                }]}
              >
                <Text style={styles.timelineBlockText} numberOfLines={1}>{block.name}</Text>
              </View>
            );
          })}
        </View>
        <View style={styles.timelineLabels}>
          <Text style={styles.timelineLabel}>{isNight ? '16Z' : '06Z'}</Text>
          <Text style={styles.timelineLabel}>{isNight ? '21Z' : '11Z'}</Text>
          <Text style={styles.timelineLabel}>{isNight ? '00Z' : '16Z'}</Text>
          {isNight && <Text style={styles.timelineLabel}>06Z</Text>}
        </View>
      </View>
    );
  }

  const groupedAirports = allAirports.reduce((acc, ap) => {
    if (!acc[ap.icao_code]) acc[ap.icao_code] = [];
    acc[ap.icao_code].push(ap);
    return acc;
  }, {});

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1a2744" size="large" />
      </View>
    );
  }

  if (user?.role !== 'chief') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Ayarlar</Text>
          <Text style={styles.headerSub}>{user?.full_name}</Text>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Kişisel Bilgiler</Text>
          <View style={styles.airportCard}>
            <Text style={{ fontSize: 13, color: '#64748b' }}>Ad Soyad</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1a2744', marginTop: 2 }}>{user?.full_name}</Text>
          </View>
          <View style={[styles.airportCard, { marginTop: 8 }]}>
            <Text style={{ fontSize: 13, color: '#64748b' }}>Sicil No</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1a2744', marginTop: 2 }}>{user?.sicil_no || '-'}</Text>
          </View>
          <View style={[styles.airportCard, { marginTop: 8 }]}>
            <Text style={{ fontSize: 13, color: '#64748b' }}>Tip</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#1a2744', marginTop: 2 }}>{user?.is_ojti ? 'Asistan ATC' : user?.day_only ? "Rate'li ATC (Sadece Gündüz)" : "Rate'li ATC"}</Text>
          </View>
          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Oturum</Text>
          <TouchableOpacity style={[styles.airportCard, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]} onPress={onLogout}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#dc2626' }}>Çıkış Yap</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ayarlar</Text>
        <Text style={styles.headerSub}>Havalimani & Shift Yapilandirmasi</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        <Text style={styles.sectionTitle}>Aktif Havalimani</Text>
        <TouchableOpacity style={styles.airportCard} onPress={() => setAirportModal(true)}>
          <View style={styles.airportLeft}>
            <Text style={styles.airportIcao}>{selectedAirport?.icao_code || '---'}</Text>
            <View>
              <Text style={styles.airportName}>{selectedAirport?.name || 'Havalimani secin'}</Text>
              <Text style={styles.airportUnit}>{selectedAirport?.unit_name || ''}</Text>
            </View>
          </View>
          <Text style={styles.changeBtn}>Degistir ›</Text>
        </TouchableOpacity>

        {shiftTemplates.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Shift Yapilandirmasi</Text>
            <View style={styles.templateTabs}>
              {shiftTemplates.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.templateTab, selectedTemplate?.id === t.id && styles.templateTabActive]}
                  onPress={() => {
                    setSelectedTemplate(t);
                    fetchBlocks(t.id);
                  }}
                >
                  <Text style={[styles.templateTabText, selectedTemplate?.id === t.id && styles.templateTabTextActive]}>
                    {t.shift_type === 'day' ? '☀ Gunduz' : '☾ Gece'}
                  </Text>
                  <Text style={[styles.templateTabTime, selectedTemplate?.id === t.id && styles.templateTabTimeActive]}>
                    {t.start_zulu.slice(0,5)}Z - {t.end_zulu.slice(0,5)}Z
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={styles.addShiftTab} onPress={() => setCreateShiftModal(true)}>
                <Text style={styles.addShiftTabText}>+ Shift</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.subTitle}>Zaman Cizelgesi</Text>
            {renderTimeline()}

            <View style={styles.blockListHeader}>
              <Text style={styles.subTitle}>Bloklar</Text>
              <TouchableOpacity style={styles.addBlockBtn} onPress={openAddBlock}>
                <Text style={styles.addBlockBtnText}>+ Blok Ekle</Text>
              </TouchableOpacity>
            </View>

            {blocks.map((block, idx) => {
              const typeInfo = getTypeInfo(block.display_type);
              return (
                <View key={block.id} style={styles.blockCard}>
                  <View style={[styles.blockColorBar, { backgroundColor: typeInfo.color }]} />
                  <View style={styles.blockContent}>
                    <View style={styles.blockTop}>
                      <Text style={styles.blockName}>{idx + 1}. {block.name}</Text>
                      <View style={styles.blockActions}>
                        <TouchableOpacity onPress={() => openEditBlock(block)}>
                          <Text style={styles.blockEdit}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteBlock(block)}>
                          <Text style={styles.blockDelete}>🗑</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.blockMeta}>
                      <Text style={styles.blockTime}>
                        {block.start_zulu.slice(0,5)}Z → {block.end_zulu.slice(0,5)}Z
                      </Text>
                      <View style={[styles.typeBadge, { backgroundColor: typeInfo.color }]}>
                        <Text style={styles.typeBadgeText}>{typeInfo.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.blockDesc}>{typeInfo.desc}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {shiftTemplates.length === 0 && selectedAirport && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Bu havalimani icin henuz shift tanimlanmamis</Text>
            <Text style={styles.emptySubText}>Asagidan gunduz ve gece shiftlerini olusturun</Text>
            <TouchableOpacity style={styles.createShiftBtn} onPress={() => setCreateShiftModal(true)}>
              <Text style={styles.createShiftBtnText}>+ Shift Olustur</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* KULLANICI BİLGİSİ */}
        {user && (
          <View style={styles.userCard}>
            <View style={[styles.userBadge, { backgroundColor: user.color_hex || '#94a3b8' }]}>
              <Text style={styles.userBadgeText}>{user.initial}</Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user.full_name}</Text>
              <Text style={styles.userRole}>
                {user.role === 'chief' ? 'Ekip Sefi' : user.is_ojti ? 'Asistan ATC' : "Rate'li ATC"}
              </Text>
            </View>
          </View>
        )}

        {user?.role === 'chief' && (
          <View style={styles.shiftCalSection}>
            <Text style={styles.sectionTitle}>Vardiya Takvimi</Text>
            <Text style={styles.shiftCalDesc}>Ekibinizin vardiya döngüsünü tanımlayın. Ajanda ekranında görünecektir.</Text>
            <View style={styles.shiftCalCard}>
              <Text style={styles.shiftCalLabel}>Başlangıç tarihi</Text>
              <input
                type="date"
                value={shiftStartDate}
                onChange={async e => {
                  setShiftStartDate(e.target.value);
                  await supabase.from('users').update({ shift_start_date: e.target.value }).eq('id', user.id);
                }}
                style={{ width: '100%', fontSize: 14, padding: 8, borderRadius: 8, border: '0.5px solid #e2e8f0', marginTop: 4, marginBottom: 12 }}
              />
              <Text style={styles.shiftCalLabel}>İlk gün türü</Text>
              <View style={styles.shiftTypeRow}>
                <TouchableOpacity
                  style={[styles.shiftTypeBtn, shiftStartType === 'day' && styles.shiftTypeBtnActive]}
                  onPress={async () => {
                    setShiftStartType('day');
                    await supabase.from('users').update({ shift_start_type: 'day' }).eq('id', user.id);
                  }}>
                  <Text style={[styles.shiftTypeBtnText, shiftStartType === 'day' && styles.shiftTypeBtnTextActive]}>☀ Gündüz</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shiftTypeBtn, shiftStartType === 'night' && styles.shiftTypeBtnActive]}
                  onPress={async () => {
                    setShiftStartType('night');
                    await supabase.from('users').update({ shift_start_type: 'night' }).eq('id', user.id);
                  }}>
                  <Text style={[styles.shiftTypeBtnText, shiftStartType === 'night' && styles.shiftTypeBtnTextActive]}>☾ Gece</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.shiftCalPreview}>Döngü: Gündüz → Gece → Off → Off → Off → ...</Text>
              <TouchableOpacity style={styles.shiftSaveBtn} onPress={async () => {
                await supabase.from('users').update({ shift_start_date: shiftStartDate, shift_start_type: shiftStartType }).eq('id', user.id);
                alert('Vardiya takvimi kaydedildi!');
              }}>
                <Text style={styles.shiftSaveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ÇIKIŞ BUTONU */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => {
            if (confirm('Oturumu kapatmak istediginizden emin misiniz?')) {
              onLogout();
            }
          }}
        >
          <Text style={styles.logoutBtnText}>🚪 Oturumu Kapat</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* HAVALİMANI SEÇİM MODAL */}
      <Modal visible={airportModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Havalimani Sec</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {Object.entries(groupedAirports).map(([icao, airports]) => (
                <View key={icao}>
                  <Text style={styles.icaoGroupLabel}>{icao}</Text>
                  {airports.map(ap => (
                    <TouchableOpacity
                      key={ap.id}
                      style={[styles.airportOption, selectedAirport?.id === ap.id && styles.airportOptionActive]}
                      onPress={() => selectAirport(ap)}
                    >
                      <View>
                        <Text style={styles.airportOptionName}>{ap.name}</Text>
                        <Text style={styles.airportOptionUnit}>{ap.unit_name}</Text>
                      </View>
                      {selectedAirport?.id === ap.id && <Text style={styles.selectedCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAirportModal(false)}>
              <Text style={styles.cancelBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SHIFT OLUŞTUR MODAL */}
      <Modal visible={createShiftModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Shift Olustur</Text>
            <Text style={styles.label}>Shift Turu</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[styles.templateTab, newShiftType === 'day' && styles.templateTabActive, { flex: 1 }]}
                onPress={() => { setNewShiftType('day'); setNewShiftStart('06:00'); setNewShiftEnd('16:00'); }}
              >
                <Text style={[styles.templateTabText, newShiftType === 'day' && styles.templateTabTextActive]}>☀ Gunduz</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.templateTab, newShiftType === 'night' && styles.templateTabActive, { flex: 1 }]}
                onPress={() => { setNewShiftType('night'); setNewShiftStart('16:00'); setNewShiftEnd('06:00'); }}
              >
                <Text style={[styles.templateTabText, newShiftType === 'night' && styles.templateTabTextActive]}>☾ Gece</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Baslangic (Z)</Text>
                <TextInput style={styles.input} value={newShiftStart} onChangeText={setNewShiftStart} placeholder="06:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Bitis (Z)</Text>
                <TextInput style={styles.input} value={newShiftEnd} onChangeText={setNewShiftEnd} placeholder="16:00" />
              </View>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateShiftModal(false)}>
                <Text style={styles.cancelBtnText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={createShiftTemplate}>
                <Text style={styles.saveBtnText}>Olustur</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* BLOK EKLE/DÜZENLE MODAL */}
      <Modal visible={blockModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingBlock ? 'Bloku Duzenle' : 'Yeni Blok Ekle'}
            </Text>
            <Text style={styles.label}>Blok Adi</Text>
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="Ana Nobet, Gececi..." />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Baslangic (Z)</Text>
                <TextInput style={styles.input} value={formStart} onChangeText={setFormStart} placeholder="16:00" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Bitis (Z)</Text>
                <TextInput style={styles.input} value={formEnd} onChangeText={setFormEnd} placeholder="21:00" />
              </View>
            </View>
            <Text style={styles.label}>Gorunum Tipi</Text>
            {DISPLAY_TYPES.map(type => (
              <TouchableOpacity
                key={type.value}
                style={[styles.typeOption, formType === type.value && styles.typeOptionActive, { borderColor: type.color }]}
                onPress={() => setFormType(type.value)}
              >
                <View style={[styles.typeDot, { backgroundColor: type.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeOptionLabel}>{type.label}</Text>
                  <Text style={styles.typeOptionDesc}>{type.desc}</Text>
                </View>
                {formType === type.value && <Text style={{ color: '#1a2744', fontSize: 16 }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setBlockModal(false)}>
                <Text style={styles.cancelBtnText}>Vazgec</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveBlock}>
                <Text style={styles.saveBtnText}>Kaydet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff' },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  content: { padding: 16, paddingBottom: 100 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#1a2744', marginBottom: 10, marginTop: 8 },
  subTitle: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  airportCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#e8eef6', justifyContent: 'space-between' },
  airportLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  airportIcao: { fontSize: 18, fontWeight: '800', color: '#1a2744' },
  airportName: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  airportUnit: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  changeBtn: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  templateTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  templateTab: { flex: 1, backgroundColor: '#ffffff', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#e2eaf4' },
  templateTabActive: { backgroundColor: '#1a2744', borderColor: '#1a2744' },
  templateTabText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  templateTabTextActive: { color: '#ffffff' },
  templateTabTime: { fontSize: 10, color: '#94a3b8', marginTop: 2 },
  templateTabTimeActive: { color: '#93c5fd' },
  addShiftTab: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#86efac', justifyContent: 'center', minWidth: 60 },
  addShiftTabText: { fontSize: 12, fontWeight: '800', color: '#16a34a' },
  timelineWrap: { marginBottom: 16 },
  timelineBar: { height: 44, backgroundColor: '#e2eaf4', borderRadius: 8, overflow: 'hidden', position: 'relative' },
  timelineBlock: { position: 'absolute', top: 3, bottom: 3, borderRadius: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  timelineBlockText: { fontSize: 8, fontWeight: '700', color: '#1a2744' },
  timelineLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timelineLabel: { fontSize: 9, color: '#94a3b8', fontWeight: '700' },
  blockListHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  addBlockBtn: { backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  addBlockBtnText: { color: '#1a2744', fontWeight: '800', fontSize: 11 },
  blockCard: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 10, marginBottom: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e8eef6' },
  blockColorBar: { width: 6 },
  blockContent: { flex: 1, padding: 12 },
  blockTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  blockName: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  blockActions: { flexDirection: 'row', gap: 8 },
  blockEdit: { fontSize: 14 },
  blockDelete: { fontSize: 14 },
  blockMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  blockTime: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 9, fontWeight: '700', color: '#1a2744' },
  blockDesc: { fontSize: 10, color: '#94a3b8' },
  emptyCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#e8eef6' },
  emptyText: { fontSize: 13, fontWeight: '700', color: '#1a2744', textAlign: 'center' },
  emptySubText: { fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  createShiftBtn: { backgroundColor: '#f59e0b', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 12 },
  createShiftBtnText: { color: '#1a2744', fontWeight: '800', fontSize: 13 },
  userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#e8eef6' },
  userBadge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  userBadgeText: { fontSize: 14, fontWeight: '800', color: '#1a2744' },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '700', color: '#1a2744' },
  userRole: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  shiftCalSection: { marginBottom: 16 },
  shiftCalDesc: { fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  shiftCalCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, borderWidth: 0.5, borderColor: '#e2eaf4' },
  shiftCalLabel: { fontSize: 12, fontWeight: '600', color: '#1a2744', marginBottom: 4 },
  shiftCalPreview: { fontSize: 11, color: '#94a3b8', marginTop: 12, fontStyle: 'italic' },
  shiftTypeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  shiftTypeBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center', backgroundColor: '#f8fafc' },
  shiftTypeBtnActive: { backgroundColor: '#1a2744', borderColor: '#1a2744' },
  shiftTypeBtnText: { fontSize: 13, fontWeight: '600', color: '#64748b' },
  shiftTypeBtnTextActive: { color: '#ffffff' },
  shiftSaveBtn: { backgroundColor: '#1a2744', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 12 },
  shiftSaveBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  logoutBtn: { margin: 16, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#fecaca', alignItems: 'center', marginTop: 12, backgroundColor: '#fff5f5' },
  logoutBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a2744', marginBottom: 16 },
  icaoGroupLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', paddingVertical: 6, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 1 },
  airportOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 10, marginBottom: 6, backgroundColor: '#f4f7fb', borderWidth: 1, borderColor: '#e2eaf4' },
  airportOptionActive: { backgroundColor: '#eff6ff', borderColor: '#1a2744' },
  airportOptionName: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  airportOptionUnit: { fontSize: 11, color: '#94a3b8', marginTop: 1 },
  selectedCheck: { fontSize: 16, color: '#1a2744', fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#f4f7fb', borderWidth: 1, borderColor: '#e2eaf4', borderRadius: 8, padding: 12, fontSize: 14, color: '#1a2744' },
  typeOption: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 8, borderWidth: 1.5, marginBottom: 8, backgroundColor: '#f4f7fb' },
  typeOptionActive: { backgroundColor: '#f8fafc' },
  typeDot: { width: 12, height: 12, borderRadius: 3, flexShrink: 0 },
  typeOptionLabel: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  typeOptionDesc: { fontSize: 10, color: '#94a3b8', marginTop: 1 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#f59e0b', alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#1a2744' },
});