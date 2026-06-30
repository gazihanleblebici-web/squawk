import { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

export default function ScheduleScreen() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleInfo, setScheduleInfo] = useState(null);

  useEffect(() => {
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    const today = new Date().toISOString().split('T')[0];

    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select('*, shifts(*)')
      .eq('schedule_date', today)
      .eq('status', 'approved')
      .maybeSingle();

    if (scheduleError || !schedule) {
      setLoading(false);
      return;
    }

    setScheduleInfo(schedule);

    const { data: boardData, error: boardError } = await supabase
      .from('boards')
      .select('*, positions(*), users!boards_user_id_fkey(*)')
      .eq('schedule_id', schedule.id)
      .order('start_zulu', { ascending: true });

    if (boardError) {
      console.log('Board error:', boardError);
    }

    if (boardData) setBoards(boardData);
    setLoading(false);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1a2744" size="large" />
      </View>
    );
  }

  if (!scheduleInfo) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Bugün için onaylı program yok</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SQUAWK</Text>
        <Text style={styles.headerSub}>
          {scheduleInfo.schedule_date} - {scheduleInfo.shifts ? scheduleInfo.shifts.name : 'Bilinmiyor'} Shift
        </Text>
        <Text style={styles.headerStatus}>Onayli Program ({boards.length} board)</Text>
      </View>

      <FlatList
        data={boards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.timeBox}>
              <Text style={styles.timeText}>{item.start_zulu ? item.start_zulu.slice(0,5) : ''}Z</Text>
            </View>
            <View style={styles.posBox}>
              <Text style={styles.posText}>{item.positions ? item.positions.code : ''}</Text>
            </View>
            <View style={[styles.personBox, { backgroundColor: item.users ? item.users.color_hex : '#94a3b8' }]}>
              <Text style={styles.personText}>{item.users ? item.users.initial : ''}</Text>
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
  emptyText: { color: '#94a3b8', fontSize: 14 },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 2 },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  headerStatus: { fontSize: 12, color: '#4ade80', marginTop: 6, fontWeight: '600' },
  list: { padding: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8eef6',
  },
  timeBox: { width: 50 },
  timeText: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  posBox: { flex: 1 },
  posText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  personBox: {
    width: 40,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personText: { fontSize: 13, fontWeight: '800', color: '#1a2744' },
});