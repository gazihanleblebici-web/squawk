import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

const POSITIONS_DAY = ['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'];
const POSITIONS_NIGHT = ['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'];
const POSITIONS_MORNING = ['YWU', 'PLN', 'YZA', 'YZC'];
const DAY_TEMPLATE = '1a4ce9d9-7ce0-435f-bfc8-fd74d84830b1';
const NIGHT_TEMPLATE = 'ecd9ef04-2408-439f-b729-62d93977cf53';

const firstOfMonth = '2026-01-01';
const todayStr = new Date().toISOString().split('T')[0];

function DateRange({ start, end, onChangeStart, onChangeEnd }) {
  return (
    <View style={s.dateRow}>
      <input type="date" value={start} onChange={e => onChangeStart(e.target.value)}
        style={{ flex: 1, fontSize: 11, padding: 6, borderRadius: 6, border: '0.5px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#334155' }} />
      <Text style={s.dateSep}>—</Text>
      <input type="date" value={end} onChange={e => onChangeEnd(e.target.value)}
        style={{ flex: 1, fontSize: 11, padding: 6, borderRadius: 6, border: '0.5px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#334155' }} />
    </View>
  );
}

function PillCell({ value, red }) {
  if (!value && value !== 0) return <Text style={s.cellEmpty}>—</Text>;
  return (
    <View style={[s.pill, red && s.pillRed]}>
      <Text style={[s.pillText, red && s.pillTextRed]}>{value}</Text>
    </View>
  );
}

export default function StatsScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dayRange, setDayRange] = useState({ start: firstOfMonth, end: todayStr });
  const [nightMainRange, setNightMainRange] = useState({ start: firstOfMonth, end: todayStr });
  const [nightGroupRange, setNightGroupRange] = useState({ start: firstOfMonth, end: todayStr });
  const [morningRange, setMorningRange] = useState({ start: firstOfMonth, end: todayStr });
  const [dayStats, setDayStats] = useState({});
  const [nightMainStats, setNightMainStats] = useState({});
  const [nightGroupStats, setNightGroupStats] = useState({});
  const [morningStats, setMorningStats] = useState({});
  const [nightOffStats, setNightOffStats] = useState({});
  const [nightOffRange, setNightOffRange] = useState({ start: firstOfMonth, end: todayStr });

  useEffect(() => { fetchUsers(); }, []);

  useFocusEffect(useCallback(() => {
    if (users.length) {
      fetchDayStats();
      fetchNightMainStats();
      fetchNightGroupStats();
      fetchMorningStats();
      fetchNightOffStats();
    }
  }, [users, dayRange, nightMainRange, nightGroupRange, morningRange, nightOffRange]));
  useEffect(() => { if (users.length) fetchDayStats(); }, [users, dayRange]);
  useEffect(() => { if (users.length) fetchNightMainStats(); }, [users, nightMainRange]);
  useEffect(() => { if (users.length) fetchNightGroupStats(); }, [users, nightGroupRange]);
  useEffect(() => { if (users.length) fetchMorningStats(); }, [users, morningRange]);
  useEffect(() => { if (users.length) fetchNightOffStats(); }, [users, nightOffRange]);

  async function fetchUsers() {
    const { data } = await supabase.from('users').select('id,full_name,initial,color_hex,role,is_ojti').eq('is_active', true).order('full_name');
    if (data) setUsers(data);
    setLoading(false);
  }

  function timeToMin(t) {
    if (!t) return 0;
    const clean = t.replace('+00', '').substring(0, 8);
    const parts = clean.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }

  function boardDuration(start, end) {
    let s = timeToMin(start);
    let e = timeToMin(end);
    if (e === 0) e = 24 * 60;
    if (e < s) e += 24 * 60;
    return e - s;
  }

  function minToTime(m) {
    if (!m || m === 0) return null;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return h > 0 ? `${h}:${String(min).padStart(2, '0')}` : `0:${String(min).padStart(2, '0')}`;
  }

  async function fetchDayStats() {
    const { data: schedules } = await supabase.from('schedules').select('id')
      .eq('shift_template_id', DAY_TEMPLATE).gte('schedule_date', dayRange.start).lte('schedule_date', dayRange.end);
    if (!schedules?.length) { setDayStats({}); return; }
    const ids = schedules.map(s => s.id);
    const { data: boards } = await supabase.from('boards').select('user_id, start_zulu, end_zulu, is_last_board, positions(code)').in('schedule_id', ids);
    if (!boards) return;
    const stats = {};
    users.forEach(u => { stats[u.id] = { positions: {}, lastSlot: 0 }; POSITIONS_DAY.forEach(p => stats[u.id].positions[p] = 0); });
    boards.forEach(b => {
      if (!stats[b.user_id]) return;
      const pos = b.positions?.code;
      const dur = boardDuration(b.start_zulu, b.end_zulu);
      if (pos && POSITIONS_DAY.includes(pos)) stats[b.user_id].positions[pos] += dur;
      if (b.is_last_board) stats[b.user_id].lastSlot++;
    });
    setDayStats(stats);
  }

  async function fetchNightMainStats() {
    const { data: schedules } = await supabase.from('schedules').select('id')
      .eq('shift_template_id', NIGHT_TEMPLATE).gte('schedule_date', nightMainRange.start).lte('schedule_date', nightMainRange.end);
    if (!schedules?.length) { setNightMainStats({}); return; }
    const ids = schedules.map(s => s.id);
    const { data: boards } = await supabase.from('boards').select('user_id, start_zulu, end_zulu, positions(code)').in('schedule_id', ids);
    if (!boards) return;
    const stats = {};
    users.forEach(u => { stats[u.id] = {}; POSITIONS_NIGHT.forEach(p => stats[u.id][p] = 0); });
    boards.forEach(b => {
      if (!stats[b.user_id]) return;
      const pos = b.positions?.code;
      const startMin = timeToMin(b.start_zulu);
      if (startMin < 16 * 60 || startMin >= 21 * 60) return;
      const dur = boardDuration(b.start_zulu, b.end_zulu);
      if (pos && POSITIONS_NIGHT.includes(pos)) stats[b.user_id][pos] += dur;
    });
    setNightMainStats(stats);
  }

  async function fetchNightGroupStats() {
    const { data: schedules } = await supabase.from('schedules').select('id')
      .eq('shift_template_id', NIGHT_TEMPLATE).gte('schedule_date', nightGroupRange.start).lte('schedule_date', nightGroupRange.end);
    if (!schedules?.length) { setNightGroupStats({}); return; }
    const ids = schedules.map(s => s.id);
    const { data: boards } = await supabase.from('boards').select('user_id, start_zulu, end_zulu').in('schedule_id', ids);
    if (!boards) return;
    const stats = {};
    users.forEach(u => { stats[u.id] = { gececi: 0, araci: 0 }; });
    boards.forEach(b => {
      if (!stats[b.user_id]) return;
      const startMin = timeToMin(b.start_zulu);
      const dur = boardDuration(b.start_zulu, b.end_zulu);
      if (startMin >= 21 * 60) stats[b.user_id].gececi += dur;
      else if (startMin < 2 * 60 + 30) stats[b.user_id].araci += dur;
    });
    setNightGroupStats(stats);
  }

  async function fetchNightOffStats() {
    const { data: schedules } = await supabase.from('schedules').select('id')
      .eq('shift_template_id', NIGHT_TEMPLATE).gte('schedule_date', nightOffRange.start).lte('schedule_date', nightOffRange.end);
    if (!schedules?.length) { setNightOffStats({}); return; }
    const ids = schedules.map(s => s.id);
    const { data: boards } = await supabase.from('boards').select('user_id').in('schedule_id', ids).eq('is_night_off', true);
    if (!boards) return;
    const stats = {};
    users.forEach(u => { stats[u.id] = 0; });
    boards.forEach(b => { if (stats[b.user_id] !== undefined) stats[b.user_id]++; });
    setNightOffStats(stats);
  }

  async function fetchMorningStats() {
    const { data: schedules } = await supabase.from('schedules').select('id')
      .eq('shift_template_id', NIGHT_TEMPLATE).gte('schedule_date', morningRange.start).lte('schedule_date', morningRange.end);
    if (!schedules?.length) { setMorningStats({}); return; }
    const ids = schedules.map(s => s.id);
    const { data: boards } = await supabase.from('boards').select('user_id, start_zulu, end_zulu, positions(code)').in('schedule_id', ids);
    if (!boards) return;
    const stats = {};
    users.forEach(u => { stats[u.id] = {}; POSITIONS_MORNING.forEach(p => stats[u.id][p] = 0); });
    boards.forEach(b => {
      if (!stats[b.user_id]) return;
      const startMin = timeToMin(b.start_zulu);
      if (startMin < 2 * 60 + 30 || startMin >= 6 * 60) return;
      const pos = b.positions?.code;
      const dur = boardDuration(b.start_zulu, b.end_zulu);
      if (pos && POSITIONS_MORNING.includes(pos)) stats[b.user_id][pos] += dur;
    });
    setMorningStats(stats);
  }

  const ratedUsers = users.filter(u => u.role !== 'chief' && !u.is_ojti);

  if (loading) return <ActivityIndicator color="#1a2744" style={{ marginTop: 40 }} />;

  return (
    <ScrollView style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>İSTATİSTİK</Text>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Gündüz nöbeti</Text></View>
        <DateRange start={dayRange.start} end={dayRange.end}
          onChangeStart={v => setDayRange(r => ({...r, start: v}))}
          onChangeEnd={v => setDayRange(r => ({...r, end: v}))} />
        <ScrollView horizontal style={s.tableWrap}>
          <View>
            <View style={s.tableHead}>
              <View style={[s.cell, s.cellName]}><Text style={s.headText}>Kişi</Text></View>
              {POSITIONS_DAY.map(p => <View key={p} style={s.cell}><Text style={s.headText}>{p === 'YZC_PLN' ? 'YZC_P' : p}</Text></View>)}
              <View style={s.cell}><Text style={[s.headText, { color: '#ef4444' }]}>Son</Text></View>
            </View>
            {ratedUsers.map(u => (
              <View key={u.id} style={s.tableRow}>
                <View style={[s.cell, s.cellName]}>
                  <View style={[s.avatar, { backgroundColor: u.color_hex + '33' }]}>
                    <Text style={[s.avatarText, { color: u.color_hex }]}>{u.initial}</Text>
                  </View>
                </View>
                {POSITIONS_DAY.map(p => (
                  <View key={p} style={s.cell}>
                    <PillCell value={minToTime(dayStats[u.id]?.positions?.[p])} />
                  </View>
                ))}
                <View style={s.cell}>
                  <PillCell value={dayStats[u.id]?.lastSlot || null} red={(dayStats[u.id]?.lastSlot || 0) > 0} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Gece — ana nöbet</Text></View>
        <DateRange start={nightMainRange.start} end={nightMainRange.end}
          onChangeStart={v => setNightMainRange(r => ({...r, start: v}))}
          onChangeEnd={v => setNightMainRange(r => ({...r, end: v}))} />
        <ScrollView horizontal style={s.tableWrap}>
          <View>
            <View style={s.tableHead}>
              <View style={[s.cell, s.cellName]}><Text style={s.headText}>Kişi</Text></View>
              {POSITIONS_NIGHT.map(p => <View key={p} style={s.cell}><Text style={s.headText}>{p === 'YZC_PLN' ? 'YZC_P' : p}</Text></View>)}
            </View>
            {ratedUsers.map(u => (
              <View key={u.id} style={s.tableRow}>
                <View style={[s.cell, s.cellName]}>
                  <View style={[s.avatar, { backgroundColor: u.color_hex + '33' }]}>
                    <Text style={[s.avatarText, { color: u.color_hex }]}>{u.initial}</Text>
                  </View>
                </View>
                {POSITIONS_NIGHT.map(p => (
                  <View key={p} style={s.cell}>
                    <PillCell value={minToTime(nightMainStats[u.id]?.[p])} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Gece — gececi / aracı</Text></View>
        <DateRange start={nightGroupRange.start} end={nightGroupRange.end}
          onChangeStart={v => setNightGroupRange(r => ({...r, start: v}))}
          onChangeEnd={v => setNightGroupRange(r => ({...r, end: v}))} />
        <View style={s.tableWrap}>
          <View style={s.tableHead}>
            <View style={[s.cell, s.cellName]}><Text style={s.headText}>Kişi</Text></View>
            <View style={s.cellWide}><Text style={s.headText}>Gececi</Text></View>
            <View style={s.cellWide}><Text style={s.headText}>Aracı</Text></View>
          </View>
          {ratedUsers.map(u => (
            <View key={u.id} style={s.tableRow}>
              <View style={[s.cell, s.cellName]}>
                <View style={[s.avatar, { backgroundColor: u.color_hex + '33' }]}>
                  <Text style={[s.avatarText, { color: u.color_hex }]}>{u.initial}</Text>
                </View>
              </View>
              <View style={s.cellWide}><PillCell value={minToTime(nightGroupStats[u.id]?.gececi)} /></View>
              <View style={s.cellWide}><PillCell value={minToTime(nightGroupStats[u.id]?.araci)} /></View>
            </View>
          ))}
        </View>
      </View>

      <View style={s.section}>
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Gece OFF</Text></View>
        <DateRange start={nightOffRange.start} end={nightOffRange.end}
          onChangeStart={v => setNightOffRange(r => ({...r, start: v}))}
          onChangeEnd={v => setNightOffRange(r => ({...r, end: v}))} />
        <View style={s.tableWrap}>
          <View style={s.tableHead}>
            <View style={[s.cell, s.cellName]}><Text style={s.headText}>Kişi</Text></View>
            <View style={s.cellWide}><Text style={s.headText}>OFF sayısı</Text></View>
          </View>
          {ratedUsers.sort((a, b) => (nightOffStats[a.id] || 0) - (nightOffStats[b.id] || 0)).map(u => (
            <View key={u.id} style={s.tableRow}>
              <View style={[s.cell, s.cellName]}>
                <View style={[s.avatar, { backgroundColor: u.color_hex + '33' }]}>
                  <Text style={[s.avatarText, { color: u.color_hex }]}>{u.initial}</Text>
                </View>
              </View>
              <View style={s.cellWide}>
                <PillCell value={nightOffStats[u.id] || 0} />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[s.section, { marginBottom: 100 }]}>
        <View style={s.sectionHeader}><Text style={s.sectionTitle}>Gece — sabahçı</Text></View>
        <DateRange start={morningRange.start} end={morningRange.end}
          onChangeStart={v => setMorningRange(r => ({...r, start: v}))}
          onChangeEnd={v => setMorningRange(r => ({...r, end: v}))} />
        <ScrollView horizontal style={s.tableWrap}>
          <View>
            <View style={s.tableHead}>
              <View style={[s.cell, s.cellName]}><Text style={s.headText}>Kişi</Text></View>
              {POSITIONS_MORNING.map(p => <View key={p} style={s.cell}><Text style={s.headText}>{p}</Text></View>)}
              <View style={s.cell}><Text style={s.headText}>Toplam</Text></View>
            </View>
            {ratedUsers.map(u => {
              const total = POSITIONS_MORNING.reduce((acc, p) => acc + (morningStats[u.id]?.[p] || 0), 0);
              return (
                <View key={u.id} style={s.tableRow}>
                  <View style={[s.cell, s.cellName]}>
                    <View style={[s.avatar, { backgroundColor: u.color_hex + '33' }]}>
                      <Text style={[s.avatarText, { color: u.color_hex }]}>{u.initial}</Text>
                    </View>
                  </View>
                  {POSITIONS_MORNING.map(p => (
                    <View key={p} style={s.cell}>
                      <PillCell value={minToTime(morningStats[u.id]?.[p])} />
                    </View>
                  ))}
                  <View style={s.cell}>
                    <PillCell value={minToTime(total)} />
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 2 },
  section: { margin: 16, marginBottom: 8, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 0.5, borderColor: '#e2eaf4', overflow: 'hidden' },
  sectionHeader: { backgroundColor: '#0f172a', padding: 12, paddingHorizontal: 16 },
  sectionTitle: { color: '#ffffff', fontSize: 13, fontWeight: '500' },
  tableWrap: { padding: 12 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#1a2744', paddingBottom: 6, marginBottom: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9' },
  cell: { width: 56, alignItems: 'center', justifyContent: 'center' },
  cellWide: { width: 80, alignItems: 'center', justifyContent: 'center' },
  cellName: { width: 44, alignItems: 'flex-start' },
  headText: { fontSize: 10, color: '#64748b', fontWeight: '500' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, fontWeight: '500' },
  pill: { backgroundColor: '#e2e8f0', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3 },
  pillRed: { backgroundColor: '#fee2e2' },
  pillText: { fontSize: 11, fontWeight: '500', color: '#334155' },
  pillTextRed: { color: '#991b1b' },
  cellEmpty: { fontSize: 11, color: '#cbd5e1' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, paddingBottom: 4 },
  dateSep: { color: '#94a3b8', fontSize: 12 },
});
