import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

const POSITION_ORDER = ['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'];

export default function ScheduleScreen() {
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleInfo, setScheduleInfo] = useState(null);

  useEffect(() => {
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    const today = new Date().toISOString().split('T')[0];

    const { data: schedule } = await supabase
      .from('schedules')
      .select('*, shifts(*)')
      .eq('schedule_date', today)
      .eq('status', 'approved')
      .maybeSingle();

    if (!schedule) {
      setLoading(false);
      return;
    }

    setScheduleInfo(schedule);

    const { data: boardData } = await supabase
      .from('boards')
      .select('*, positions(*), users!boards_user_id_fkey(*)')
      .eq('schedule_id', schedule.id)
      .order('start_zulu', { ascending: true });

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

  const timeSlots = [...new Set(boards.map(b => b.start_zulu))].sort();
  const positionCodes = [...new Set(boards.map(b => b.positions?.code).filter(Boolean))];
  const orderedPositions = POSITION_ORDER.filter(p => positionCodes.includes(p));

  function getBoardFor(time, posCode) {
    return boards.find(b => b.start_zulu === time && b.positions?.code === posCode);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SQUAWK</Text>
        <Text style={styles.headerSub}>
          {scheduleInfo.schedule_date} - {scheduleInfo.shifts ? scheduleInfo.shifts.name : ''} Shift
        </Text>
        <Text style={styles.headerStatus}>Onaylı Program</Text>
      </View>

      <ScrollView style={styles.tableScroll}>
        <ScrollView horizontal contentContainerStyle={styles.tableScrollContent}>
          <View style={styles.tableWrap}>
            <View style={styles.row}>
              <View style={styles.cornerCell} />
              {orderedPositions.map(pos => (
                <View key={pos} style={styles.posHeaderCell}>
                  <Text style={styles.posHeaderText}>{pos}</Text>
                </View>
              ))}
            </View>

            {timeSlots.map(time => (
              <View key={time} style={styles.row}>
                <View style={styles.timeCell}>
                  <Text style={styles.timeCellText}>{time.slice(0,5)}Z</Text>
                </View>
                {orderedPositions.map(pos => {
                  const board = getBoardFor(time, pos);
                  return (
                    <View
                      key={pos}
                      style={[
                        styles.dataCell,
                        { backgroundColor: board?.users?.color_hex || '#f1f5f9' },
                      ]}
                    >
                      <Text style={styles.dataCellText}>
                        {board?.users?.initial || ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const CELL_BORDER = '#0f1e35';

const cellShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 3,
  elevation: 3,
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 2 },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  headerStatus: { fontSize: 12, color: '#4ade80', marginTop: 6, fontWeight: '600' },
  tableScroll: { flex: 1 },
  tableScrollContent: { padding: 20, paddingBottom: 120 },
  tableWrap: {
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  row: { flexDirection: 'row' },
  cornerCell: {
    width: 56,
    height: 48,
    backgroundColor: '#1a2744',
    borderWidth: 1,
    borderColor: CELL_BORDER,
    borderTopLeftRadius: 10,
  },
  timeCell: {
    width: 56,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a2744',
    borderWidth: 1,
    borderColor: CELL_BORDER,
  },
  timeCellText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  posHeaderCell: {
    width: 76,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a2744',
    borderWidth: 1,
    borderColor: CELL_BORDER,
  },
  posHeaderText: { fontSize: 11, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  dataCell: {
    width: 76,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopColor: 'rgba(255,255,255,0.6)',
    borderLeftColor: 'rgba(255,255,255,0.6)',
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderRightColor: 'rgba(0,0,0,0.15)',
    borderBottomColor: 'rgba(0,0,0,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 4,
  },
  dataCellText: { fontSize: 15, fontWeight: '800', color: '#1a2744' },
});