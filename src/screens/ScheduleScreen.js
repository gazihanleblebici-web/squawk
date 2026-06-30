import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';

const POSITION_ORDER = ['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'];

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const STATUS_LABELS = {
  annual_leave: { label: 'Yıllık İzin', color: '#2563eb' },
  excuse_leave: { label: 'Mazeret İzni', color: '#9333ea' },
  domestic_duty: { label: 'Yurt İçi Görevli', color: '#0891b2' },
  abroad_duty: { label: 'Yurt Dışı Görevli', color: '#d97706' },
  sick: { label: 'Raporlu', color: '#dc2626' },
  hourly_leave: { label: 'Saatlik İzinli', color: '#db2777' },
};

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${DAY_NAMES[d.getDay()]}`;
}

export default function ScheduleScreen() {
  const [shiftType, setShiftType] = useState('day');
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [dayStatuses, setDayStatuses] = useState([]);

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];
  const nowFormatted = formatDate(todayStr);

  useEffect(() => {
    fetchSchedule();
  }, [shiftType]);

  async function fetchSchedule() {
    setLoading(true);

    const { data: shiftRow } = await supabase
      .from('shifts')
      .select('id')
      .eq('shift_type', shiftType)
      .single();

    const { data: schedule } = await supabase
      .from('schedules')
      .select('*, shifts(*)')
      .eq('status', 'approved')
      .eq('shift_id', shiftRow.id)
      .order('schedule_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!schedule) {
      setScheduleInfo(null);
      setBoards([]);
      setLoading(false);
      return;
    }

    setScheduleInfo(schedule);

    const { data: boardData } = await supabase
      .from('boards')
      .select('*, positions(*), users!boards_user_id_fkey(*), ojti:users!boards_ojti_user_id_fkey(*)')
      .eq('schedule_id', schedule.id)
      .order('start_zulu', { ascending: true });

    if (boardData) setBoards(boardData);

    const { data: statusData } = await supabase
      .from('user_day_status')
      .select('*, users(*)')
      .eq('status_date', schedule.schedule_date)
      .neq('status', 'active');

    if (statusData) setDayStatuses(statusData);

    setLoading(false);
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
        <Text style={styles.headerSub}>LTAI - Antalya Approach</Text>
        <Text style={styles.headerDate}>Bugün: {nowFormatted}</Text>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, shiftType === 'day' && styles.toggleBtnActive]}
          onPress={() => setShiftType('day')}
        >
          <Text style={[styles.toggleText, shiftType === 'day' && styles.toggleTextActive]}>
            ☀ Gündüz 06-16Z
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, shiftType === 'night' && styles.toggleBtnActive]}
          onPress={() => setShiftType('night')}
        >
          <Text style={[styles.toggleText, shiftType === 'night' && styles.toggleTextActive]}>
            ☾ Gece 16-06Z
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#1a2744" size="large" />
        </View>
      ) : !scheduleInfo ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {shiftType === 'day' ? 'Gündüz' : 'Gece'} için onaylı program yok
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.tableScroll}>
          <View style={styles.statusBar}>
            <Text style={styles.scheduleDateText}>
              📋 Program Tarihi: {formatDate(scheduleInfo.schedule_date)}
            </Text>
            <Text style={styles.statusText}>✅ Onaylı Program</Text>
          </View>

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
                    const hasOjti = board?.ojti;

                    if (hasOjti) {
                      return (
                        <View key={pos} style={styles.ojtiCell}>
                          <View style={[styles.ojtiHalf, { backgroundColor: board.users?.color_hex || '#f1f5f9' }]}>
                            <Text style={styles.dataCellText}>{board.users?.initial}</Text>
                          </View>
                          <View style={[styles.ojtiHalf, { backgroundColor: board.ojti?.color_hex || '#f1f5f9' }]}>
                            <Text style={styles.dataCellText}>{board.ojti?.initial}</Text>
                          </View>
                          <View style={styles.ojtiBadge}>
                            <Text style={styles.ojtiBadgeIcon}>🤝</Text>
                          </View>
                        </View>
                      );
                    }

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

          {dayStatuses.length > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Görevde Olmayanlar</Text>
              {dayStatuses.map(item => {
                const info = STATUS_LABELS[item.status] || { label: item.status, color: '#94a3b8' };
                return (
                  <View key={item.id} style={styles.summaryRow}>
                    <View style={[styles.summaryBadge, { backgroundColor: item.users?.color_hex || '#94a3b8' }]}>
                      <Text style={styles.summaryBadgeText}>{item.users?.initial}</Text>
                    </View>
                    <Text style={styles.summaryName}>{item.users?.full_name}</Text>
                    <View style={[styles.summaryChip, { borderColor: info.color }]}>
                      <Text style={[styles.summaryChipText, { color: info.color }]}>
                        {info.label}
                        {item.status === 'hourly_leave' && item.hourly_leave_start === '06:00:00' ? ' (ÖÖ)' : ''}
                        {item.status === 'hourly_leave' && item.hourly_leave_start === '11:00:00' ? ' (ÖS)' : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const CELL_BORDER = '#0f1e35';

const cellShadowBase = {
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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb' },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 2 },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  headerDate: { fontSize: 11, color: '#64748b', marginTop: 6 },
  toggleRow: { flexDirection: 'row', backgroundColor: '#e8eef6', margin: 12, borderRadius: 10, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#1a2744' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  toggleTextActive: { color: '#ffffff' },
  statusBar: { paddingHorizontal: 16, paddingBottom: 4 },
  scheduleDateText: { fontSize: 13, color: '#1a2744', fontWeight: '700', marginBottom: 2 },
  statusText: { fontSize: 12, color: '#4ade80', fontWeight: '700' },
  tableScroll: { flex: 1 },
  tableScrollContent: { padding: 16, paddingBottom: 16 },
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
    ...cellShadowBase,
  },
  dataCellText: { fontSize: 15, fontWeight: '800', color: '#1a2744' },
  ojtiCell: {
    width: 76,
    height: 48,
    flexDirection: 'row',
    ...cellShadowBase,
    overflow: 'hidden',
  },
  ojtiHalf: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ojtiBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 14,
    borderRightWidth: 14,
    borderTopColor: '#7c3aed',
    borderRightColor: '#7c3aed',
    borderLeftWidth: 14,
    borderLeftColor: 'transparent',
    borderBottomWidth: 14,
    borderBottomColor: 'transparent',
  },
  ojtiBadgeIcon: {
    position: 'absolute',
    top: -12,
    right: -2,
    fontSize: 9,
  },
  summarySection: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: '#1a2744', marginBottom: 10 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e8eef6',
  },
  summaryBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  summaryBadgeText: { fontSize: 11, fontWeight: '800', color: '#1a2744' },
  summaryName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a2744' },
  summaryChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  summaryChipText: { fontSize: 10, fontWeight: '700' },
});