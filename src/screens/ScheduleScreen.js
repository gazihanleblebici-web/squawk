import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { supabase } from '../lib/supabase';

const POSITION_ORDER = ['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'];
const DAY_NAMES = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
const MONTH_NAMES = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];

const STATUS_LABELS = {
  annual_leave: { label: 'Yillik Izin', color: '#2563eb' },
  excuse_leave: { label: 'Mazeret Izni', color: '#9333ea' },
  domestic_duty: { label: 'Yurt Ici Gorevli', color: '#0891b2' },
  abroad_duty: { label: 'Yurt Disi Gorevli', color: '#d97706' },
  sick: { label: 'Raporlu', color: '#dc2626' },
  hourly_leave: { label: 'Saatlik Izinli', color: '#db2777' },
};

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}, ${DAY_NAMES[d.getDay()]}`;
}

function sortNightAware(a, b) {
  const an = a < '06:00:00' ? 1 : 0;
  const bn = b < '06:00:00' ? 1 : 0;
  if (an !== bn) return an - bn;
  return a.localeCompare(b);
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isInRange(startZulu, blockStart, blockEnd) {
  if (blockEnd <= blockStart) {
    return startZulu >= blockStart || startZulu < blockEnd;
  }
  return startZulu >= blockStart && startZulu < blockEnd;
}

export default function ScheduleScreen() {
  const [shiftType, setShiftType] = useState('day');
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [dayStatuses, setDayStatuses] = useState([]);
  const [shiftBlocks, setShiftBlocks] = useState([]);
  const [airport, setAirport] = useState(null);

  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];
  const nowFormatted = formatDate(todayStr);

  useEffect(() => {
    fetchAirportAndBlocks();
  }, [shiftType]);

  async function fetchAirportAndBlocks() {
    setLoading(true);

    // Kullanıcının havalimanını bul
    const { data: userData } = await supabase
      .from('users')
      .select('airport_id, airports(*)')
      .not('airport_id', 'is', null)
      .limit(1)
      .maybeSingle();

    const ap = userData?.airports;
    if (ap) setAirport(ap);

    // Shift template bul
    const { data: shiftRow } = await supabase
      .from('shift_templates')
      .select('id')
      .eq('airport_id', ap?.id)
      .eq('shift_type', shiftType)
      .single();

    if (!shiftRow) {
      setShiftBlocks([]);
      setScheduleInfo(null);
      setBoards([]);
      setLoading(false);
      return;
    }

    // Shift bloklarını çek
    const { data: blocksData } = await supabase
      .from('shift_blocks')
      .select('*')
      .eq('shift_template_id', shiftRow.id)
      .order('block_order', { ascending: true });

    if (blocksData) setShiftBlocks(blocksData);

    // Schedule bul
    const { data: schedule } = await supabase
      .from('schedules')
      .select('*, shifts(*)')
      .eq('status', 'approved')
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

  function getBoardsForBlock(block) {
    return boards.filter(b => {
      const t = b.start_zulu;
      return isInRange(t, block.start_zulu, block.end_zulu);
    });
  }

  function getBoardFor(time, posCode, blockBoards) {
    return blockBoards.find(b => b.start_zulu === time && b.positions?.code === posCode);
  }

  const positionCodes = [...new Set(boards.map(b => b.positions?.code).filter(Boolean))];
  const orderedPositions = POSITION_ORDER.filter(p => positionCodes.includes(p));

  function renderOjtiCell(board, pos) {
    if (!board) return (
      <View key={pos} style={[styles.dataCell, { backgroundColor: '#f1f5f9' }]}>
        <Text style={styles.dataCellText}></Text>
      </View>
    );

    if (board.ojti) {
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
      <View key={pos} style={[styles.dataCell, { backgroundColor: board.users?.color_hex || '#f1f5f9' }]}>
        <Text style={styles.dataCellText}>{board.users?.initial || ''}</Text>
      </View>
    );
  }

  function renderHourlyTable(block) {
    const blockBoards = getBoardsForBlock(block);
    const timeSlots = [...new Set(blockBoards.map(b => b.start_zulu))].sort(
      block.start_zulu >= '06:00:00' ? undefined : sortNightAware
    );

    return (
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
                const board = getBoardFor(time, pos, blockBoards);
                return renderOjtiCell(board, pos);
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderFixedBlock(block) {
    const blockBoards = getBoardsForBlock(block);
    if (blockBoards.length === 0) return null;

    return (
      <View style={styles.simpleBlockRow}>
        {blockBoards.map(board => (
          <View key={board.id} style={[styles.simpleBlockChip, { backgroundColor: board.users?.color_hex || '#f1f5f9' }]}>
            <Text style={styles.simpleBlockPos}>{board.positions?.code}</Text>
            <Text style={styles.simpleBlockInitial}>{board.users?.initial}</Text>
          </View>
        ))}
      </View>
    );
  }

  function renderOffsetTimeline(block) {
    const blockBoards = getBoardsForBlock(block);
    if (blockBoards.length === 0) return null;

    const offsetPositions = POSITION_ORDER.filter(p =>
      blockBoards.some(b => b.positions?.code === p)
    );
    const startMin = timeToMinutes(block.start_zulu);
    const endMin = timeToMinutes(block.end_zulu === '00:00:00' ? '06:00:00' : block.end_zulu);
    const totalMin = endMin - startMin;
    const PX_PER_MIN = 2.2;
    const timelineHeight = totalMin * PX_PER_MIN;

    const hourMarkCount = Math.ceil(totalMin / 30);
    const hourMarks = [];
    for (let i = 0; i <= hourMarkCount; i++) {
      const mins = startMin + i * 30;
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      hourMarks.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }

    return (
      <ScrollView horizontal>
        <View style={styles.offsetTimelineWrap}>
          <View style={[styles.offsetTimeAxis, { height: timelineHeight + 36 }]}>
            <View style={styles.offsetTimeAxisSpacer} />
            {hourMarks.map(label => {
              const labelMin = timeToMinutes(label + ':00');
              const top = (labelMin - startMin) * PX_PER_MIN + 36;
              return (
                <View key={label} style={[styles.offsetTimeMark, { top: top - 7 }]}>
                  <Text style={styles.offsetTimeMarkText}>{label}Z</Text>
                </View>
              );
            })}
          </View>
          {offsetPositions.map(pos => (
            <View key={pos} style={styles.offsetColumn}>
              <View style={styles.offsetColumnHeader}>
                <Text style={styles.offsetColumnHeaderText}>{pos}</Text>
              </View>
              <View style={[styles.offsetColumnBody, { height: timelineHeight }]}>
                {hourMarks.map(label => {
                  const labelMin = timeToMinutes(label + ':00');
                  const top = (labelMin - startMin) * PX_PER_MIN;
                  return <View key={label} style={[styles.offsetGridLine, { top }]} />;
                })}
                {blockBoards
                  .filter(b => b.positions?.code === pos)
                  .sort((a, b) => a.start_zulu.localeCompare(b.start_zulu))
                  .map(board => {
                    const bStart = timeToMinutes(board.start_zulu);
                    const bEnd = timeToMinutes(board.end_zulu === '00:00:00' ? '06:00:00' : board.end_zulu);
                    const top = (bStart - startMin) * PX_PER_MIN;
                    const height = (bEnd - bStart) * PX_PER_MIN;
                    return (
                      <View
                        key={board.id}
                        style={[styles.offsetBlock, {
                          top,
                          height: Math.max(height, 24),
                          backgroundColor: board.users?.color_hex || '#f1f5f9',
                        }]}
                      >
                        <Text style={styles.offsetBlockInitial}>{board.users?.initial}</Text>
                      </View>
                    );
                  })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderBlock(block, idx) {
    return (
      <View key={block.id}>
        <Text style={styles.sectionLabel}>
          {block.name} ({block.start_zulu.slice(0,5)}Z - {block.end_zulu.slice(0,5)}Z)
        </Text>
        {block.display_type === 'hourly_table' && renderHourlyTable(block)}
        {block.display_type === 'fixed_block' && renderFixedBlock(block)}
        {block.display_type === 'offset_timeline' && renderOffsetTimeline(block)}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>SQUAWK</Text>
        <Text style={styles.headerSub}>{airport ? `${airport.icao_code} · ${airport.unit_name}` : 'LTAI · Approach'}</Text>
        <Text style={styles.headerDate}>Bugun: {nowFormatted}</Text>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, shiftType === 'day' && styles.toggleBtnActive]}
          onPress={() => setShiftType('day')}
        >
          <Text style={[styles.toggleText, shiftType === 'day' && styles.toggleTextActive]}>
            ☀ Gunduz
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, shiftType === 'night' && styles.toggleBtnActive]}
          onPress={() => setShiftType('night')}
        >
          <Text style={[styles.toggleText, shiftType === 'night' && styles.toggleTextActive]}>
            ☾ Gece
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
            {shiftType === 'day' ? 'Gunduz' : 'Gece'} icin onayli program yok
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.tableScroll}>
          <View style={styles.statusBar}>
            <Text style={styles.scheduleDateText}>
              Program Tarihi: {formatDate(scheduleInfo.schedule_date)}
            </Text>
            <Text style={styles.statusText}>Onayli Program</Text>
          </View>

          {shiftBlocks.map((block, idx) => renderBlock(block, idx))}

          {dayStatuses.length > 0 && (
            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Gorevde Olmayanlar</Text>
              {dayStatuses.map(item => {
                const info = STATUS_LABELS[item.status] || { label: item.status, color: '#94a3b8' };
                return (
                  <View key={item.id} style={styles.summaryRow}>
                    <View style={[styles.summaryBadge, { backgroundColor: item.users?.color_hex || '#94a3b8' }]}>
                      <Text style={styles.summaryBadgeText}>{item.users?.initial}</Text>
                    </View>
                    <Text style={styles.summaryName}>{item.users?.full_name}</Text>
                    <View style={[styles.summaryChip, { borderColor: info.color }]}>
                      <Text style={[styles.summaryChipText, { color: info.color }]}>{info.label}</Text>
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
  borderTopWidth: 1.5, borderLeftWidth: 1.5,
  borderTopColor: 'rgba(255,255,255,0.6)', borderLeftColor: 'rgba(255,255,255,0.6)',
  borderRightWidth: 1.5, borderBottomWidth: 1.5,
  borderRightColor: 'rgba(0,0,0,0.15)', borderBottomColor: 'rgba(0,0,0,0.2)',
  shadowColor: '#000', shadowOffset: { width: 1, height: 2 },
  shadowOpacity: 0.2, shadowRadius: 2, elevation: 4,
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
  sectionLabel: {
    fontSize: 12, fontWeight: '800', color: '#64748b',
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tableScroll: { flex: 1 },
  tableScrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  tableWrap: {
    borderRadius: 12, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8,
  },
  row: { flexDirection: 'row' },
  cornerCell: { width: 56, height: 48, backgroundColor: '#1a2744', borderWidth: 1, borderColor: CELL_BORDER, borderTopLeftRadius: 10 },
  timeCell: { width: 56, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2744', borderWidth: 1, borderColor: CELL_BORDER },
  timeCellText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  posHeaderCell: { width: 76, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2744', borderWidth: 1, borderColor: CELL_BORDER },
  posHeaderText: { fontSize: 11, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  dataCell: { width: 76, height: 48, alignItems: 'center', justifyContent: 'center', ...cellShadowBase },
  dataCellText: { fontSize: 15, fontWeight: '800', color: '#1a2744' },
  ojtiCell: { width: 76, height: 48, flexDirection: 'row', ...cellShadowBase, overflow: 'hidden' },
  ojtiHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ojtiBadge: { position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 14, borderRightWidth: 14, borderTopColor: '#7c3aed', borderRightColor: '#7c3aed', borderLeftWidth: 14, borderLeftColor: 'transparent', borderBottomWidth: 14, borderBottomColor: 'transparent' },
  ojtiBadgeIcon: { position: 'absolute', top: -12, right: -2, fontSize: 9 },
  simpleBlockRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  simpleBlockChip: { width: 76, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 },
  simpleBlockPos: { fontSize: 9, fontWeight: '700', color: '#1a2744', opacity: 0.7 },
  simpleBlockInitial: { fontSize: 16, fontWeight: '800', color: '#1a2744', marginTop: 2 },
  offsetTimelineWrap: { flexDirection: 'row', paddingHorizontal: 16 },
  offsetTimeAxis: { width: 50, position: 'relative' },
  offsetTimeAxisSpacer: { height: 36 },
  offsetTimeMark: { position: 'absolute', left: 0, right: 4 },
  offsetTimeMarkText: { fontSize: 9, color: '#94a3b8', fontWeight: '700', textAlign: 'right' },
  offsetColumn: { width: 80, marginLeft: 4 },
  offsetColumnHeader: { backgroundColor: '#1a2744', paddingVertical: 7, alignItems: 'center', borderRadius: 6, marginBottom: 4, height: 32, justifyContent: 'center' },
  offsetColumnHeaderText: { fontSize: 10, fontWeight: '800', color: '#ffffff' },
  offsetColumnBody: { position: 'relative', backgroundColor: '#e8eef6', borderRadius: 6, overflow: 'hidden' },
  offsetGridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(148,163,184,0.3)' },
  offsetBlock: { position: 'absolute', left: 2, right: 2, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  offsetBlockInitial: { fontSize: 14, fontWeight: '800', color: '#1a2744' },
  summarySection: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: '#1a2744', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#e8eef6' },
  summaryBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  summaryBadgeText: { fontSize: 11, fontWeight: '800', color: '#1a2744' },
  summaryName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a2744' },
  summaryChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  summaryChipText: { fontSize: 10, fontWeight: '700' },
});