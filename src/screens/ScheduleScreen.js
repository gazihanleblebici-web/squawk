import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Modal, TextInput } from 'react-native';
import { supabase } from '../lib/supabase';
import { generateSchedule } from '../lib/scheduleAlgorithm';

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

export default function ScheduleScreen({ user }) {
  const [shiftType, setShiftType] = useState('day');
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [dayStatuses, setDayStatuses] = useState([]);
  const [shiftBlocks, setShiftBlocks] = useState([]);
  const [airport, setAirport] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newShiftType, setNewShiftType] = useState('day');
  const [creating, setCreating] = useState(false);
  const [editBoardModal, setEditBoardModal] = useState(false);
  const [editingBoard, setEditingBoard] = useState(null);
  const [editBoardUsers, setEditBoardUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [tempInitial, setTempInitial] = useState('');
  const [ojtiPairs, setOjtiPairs] = useState([]);
  const [chiefTakesBoards, setChiefTakesBoards] = useState(false);
  const [chiefBoardCount, setChiefBoardCount] = useState('2');
  const [offsetMorning, setOffsetMorning] = useState(true);
  const [selectedPositions, setSelectedPositions] = useState(['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN']);
  const [selectedMorningPositions, setSelectedMorningPositions] = useState(['YWU', 'PLN', 'YZA', 'YZC']);
  const [aitUser, setAitUser] = useState(null);

  const isChief = user?.role === 'chief';
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [calendarModal, setCalendarModal] = useState(false);
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [monthSchedules, setMonthSchedules] = useState([]);

  useEffect(() => {
    fetchAll();
  }, [shiftType, selectedDate]);

  async function fetchMonthSchedules(year, month) {
    const firstDay = `${year}-${String(month+1).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month+1, 0).toISOString().split('T')[0];
    const { data } = await supabase
      .from('schedules')
      .select('schedule_date, shift_template_id')
      .gte('schedule_date', firstDay)
      .lte('schedule_date', lastDay)
      .in('status', ['approved', 'draft']);
    if (data) setMonthSchedules(data);
  }

  async function loadSchedule() {
    if (!scheduleInfo?.id) return;
    const { data: bds } = await supabase
      .from('boards')
      .select('*, positions(*), users!boards_user_id_fkey(*), ojti:users!boards_ojti_user_id_fkey(*)')
      .eq('schedule_id', scheduleInfo.id);
    if (bds) setBoards(bds);
  }

  async function fetchAll() {
    setLoading(true);

    const { data: usersData } = await supabase.from('users').select('*').eq('is_active', true);
    if (usersData) setAllUsers(usersData);
    const { data: pairsData } = await supabase.from('ojti_pairs').select('*').eq('is_active', true);
    if (pairsData) setOjtiPairs(pairsData);

    const { data: userData } = await supabase
      .from('users')
      .select('airport_id, airports(*)')
      .not('airport_id', 'is', null)
      .limit(1)
      .maybeSingle();

    const ap = userData?.airports;
    if (ap) setAirport(ap);

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

    const { data: blocksData } = await supabase
      .from('shift_blocks')
      .select('*')
      .eq('shift_template_id', shiftRow.id)
      .order('block_order', { ascending: true });

    if (blocksData) setShiftBlocks(blocksData);

    const { data: schedule } = await supabase
      .from('schedules')
      .select('*')
      .eq('shift_template_id', shiftRow.id)
      .eq('schedule_date', selectedDate)
      .in('status', ['approved', 'draft'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!schedule) {
      setScheduleInfo(null);
      setBoards([]);
      setAitUser(null);
      setLoading(false);
      return;
    }

    setScheduleInfo(schedule);

    if (schedule.ait_user_id) {
      const { data: aitData } = await supabase
        .from('users')
        .select('*')
        .eq('id', schedule.ait_user_id)
        .single();
      if (aitData) setAitUser(aitData);
    } else {
      setAitUser(null);
    }

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

  async function createSchedule() {
    if (!newDate) { alert('Tarih girin.'); return; }
    setCreating(true);

    const { data: shiftRow } = await supabase
      .from('shift_templates')
      .select('id')
      .eq('airport_id', airport?.id)
      .eq('shift_type', newShiftType)
      .single();

    if (!shiftRow) {
      alert('Bu tip icin shift tanimi bulunamadi.');
      setCreating(false);
      return;
    }

    const { data: existing } = await supabase
      .from('schedules')
      .select('id')
      .eq('schedule_date', newDate)
      .eq('shift_template_id', shiftRow.id)
      .maybeSingle();

    if (existing) {
      alert('Bu tarih ve shift icin zaten bir program var.');
      setCreating(false);
      return;
    }

    const { data: newSchedule, error: schedErr } = await supabase
      .from('schedules')
      .insert({
        schedule_date: newDate,
        shift_template_id: shiftRow.id,
        airport_id: airport?.id,
        status: 'draft',
      })
      .select()
      .single();

    if (schedErr) {
      alert('Program kaydi olusturulamadi: ' + schedErr.message);
      setCreating(false);
      return;
    }

    if (newSchedule) {
      try {
        await generateSchedule({
          scheduleId: newSchedule.id,
          scheduleDate: newDate,
          shiftType: newShiftType,
          airportId: airport?.id,
          chiefTakesBoards,
          chiefBoardCount: parseInt(chiefBoardCount) || 0,
          isOffsetMorning: newShiftType === 'night' ? true : false,
          selectedMorningPositions: newShiftType === 'night' ? selectedMorningPositions : [],
          selectedPositions,
        });
      } catch (e) {
        alert('Algoritma hatasi: ' + e.message);
      }
    }

    setCreating(false);
    setCreateModal(false);
    setShiftType(newShiftType);
    fetchAll();
  }

  async function approveSchedule() {
    if (!scheduleInfo) return;
    if (confirm('Programi onaylamak istediginizden emin misiniz?')) {
      await supabase.from('schedules').update({ status: 'approved' }).eq('id', scheduleInfo.id);
      fetchAll();
    }
  }

  async function rejectSchedule() {
    if (!scheduleInfo) return;
    if (confirm('Programi taslaga geri almak istediginizden emin misiniz?')) {
      await supabase.from('schedules').update({ status: 'draft' }).eq('id', scheduleInfo.id);
      fetchAll();
    }
  }

  async function deleteSchedule() {
    if (!scheduleInfo) return;
    if (confirm('Programi tamamen silmek istediginizden emin misiniz? Bu islem geri alinamaz.')) {
      await supabase.from('boards').delete().eq('schedule_id', scheduleInfo.id);
      await supabase.from('schedules').delete().eq('id', scheduleInfo.id);
      fetchAll();
    }
  }

  function getBoardsForBlock(block) {
    return boards.filter(b => isInRange(b.start_zulu, block.start_zulu, block.end_zulu));
  }

  function getBoardFor(time, posCode, blockBoards) {
    return blockBoards.find(b => b.start_zulu === time && b.positions?.code === posCode);
  }

  const positionCodes = [...new Set(boards.map(b => b.positions?.code).filter(Boolean))];
  const orderedPositions = POSITION_ORDER.filter(p => positionCodes.includes(p));

  function renderCell(board, pos) {
    const onPressCell = isChief && board ? () => {
      setEditingBoard(board);
      setEditBoardModal(true);
    } : null;

    if (!board) return (
      <View key={pos} style={[styles.dataCell, { backgroundColor: '#f1f5f9' }]}>
        <Text style={styles.dataCellText}></Text>
      </View>
    );
    if (board.ojti) {
      return (
        <TouchableOpacity key={pos} onPress={onPressCell} disabled={!onPressCell} style={styles.ojtiCell}>
          <View style={[styles.ojtiHalf, { backgroundColor: board.users?.color_hex || '#f1f5f9' }]}>
            <Text style={styles.dataCellText}>{board.users?.initial || board.temp_initial || ''}</Text>
          </View>
          <View style={[styles.ojtiHalf, { backgroundColor: board.ojti?.color_hex || '#f1f5f9' }]}>
            <Text style={styles.dataCellText}>{board.ojti?.initial}</Text>
          </View>
          <View style={styles.ojtiBadge}>
            <Text style={styles.ojtiBadgeIcon}>🤝</Text>
          </View>
        </TouchableOpacity>
      );
    }
    const displayInitial = board.users?.initial || board.temp_initial || '';
    const displayColor = board.users?.color_hex || '#94a3b8';
    return (
      <TouchableOpacity key={pos} onPress={onPressCell} disabled={!onPressCell} style={[styles.dataCell, { backgroundColor: displayColor }]}>
        <Text style={styles.dataCellText}>{displayInitial}</Text>
        <View style={[styles.cellLeftStripe, { backgroundColor: displayColor }]} />
      </TouchableOpacity>
    );
  }

  function renderHourlyTable(block) {
    const blockBoards = getBoardsForBlock(block);
    if (blockBoards.length === 0) return (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyBlockText}>Board girilmemis</Text>
      </View>
    );
    const timeSlots = [...new Set(blockBoards.map(b => b.start_zulu))].sort(sortNightAware);
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
              {orderedPositions.map(pos => renderCell(getBoardFor(time, pos, blockBoards), pos))}
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderFixedBlock(block) {
    const blockBoards = getBoardsForBlock(block);
    if (blockBoards.length === 0) return (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyBlockText}>Board girilmemis</Text>
      </View>
    );
    return (
      <View style={styles.simpleBlockRow}>
        {blockBoards.map(board => (
          <TouchableOpacity key={board.id} style={styles.simpleBlockChipWrap} onPress={isChief ? () => { setEditingBoard(board); setEditBoardModal(true); } : null} disabled={!isChief}>
            {board.ojti ? (
              <View style={{ width: 110, minHeight: 85, borderRadius: 10, flexDirection: 'row', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 }}>
                <View style={{ flex: 1, backgroundColor: board.users?.color_hex || '#f1f5f9', justifyContent: 'space-between', alignItems: 'stretch', padding: 6, borderLeftWidth: 3, borderLeftColor: board.users?.color_hex || '#ccc' }}>
                  <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600' }}>{board.start_zulu?.slice(0,5)}Z</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a2744', textAlign: 'center' }}>{board.users?.initial || board.temp_initial || ''}</Text>
                  <Text style={{ fontSize: 9, color: '#1a2744', textAlign: 'right', fontWeight: '600' }}>{board.end_zulu?.slice(0,5)}Z</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: board.ojti?.color_hex || '#e2e8f0', justifyContent: 'space-between', alignItems: 'stretch', padding: 6, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.5)' }}>
                  <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600' }}>{board.start_zulu?.slice(0,5)}Z</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a2744', textAlign: 'center' }}>{board.ojti?.initial}</Text>
                  <Text style={{ fontSize: 9, color: '#1a2744', textAlign: 'right', fontWeight: '600' }}>{board.end_zulu?.slice(0,5)}Z</Text>
                </View>
                <View style={styles.ojtiBadge}><Text style={styles.ojtiBadgeIcon}>🤝</Text></View>
              </View>
            ) : (
              <View style={[styles.simpleBlockChip, { overflow: 'hidden', justifyContent: 'flex-start', alignItems: 'stretch', padding: 0 }]}>
                <View style={{ backgroundColor: '#1a2744', padding: 4, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{board.positions?.code}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: board.users?.color_hex || '#f1f5f9', justifyContent: 'space-between', alignItems: 'stretch', padding: 6 }}>
                  <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600' }}>{board.start_zulu?.slice(0,5)}Z</Text>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#1a2744', textAlign: 'center' }}>{board.users?.initial || board.temp_initial || ''}</Text>
                  <Text style={{ fontSize: 9, color: '#1a2744', textAlign: 'right', fontWeight: '600' }}>{board.end_zulu?.slice(0,5)}Z</Text>
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderOffsetTimeline(block) {
    const blockBoards = getBoardsForBlock(block);
    if (blockBoards.length === 0) return (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyBlockText}>Board girilmemis</Text>
      </View>
    );

    const offsetPositions = POSITION_ORDER.filter(p => blockBoards.some(b => b.positions?.code === p));
    const startMin = timeToMinutes(block.start_zulu);
    const endMin = timeToMinutes(block.end_zulu === '00:00:00' ? '06:00:00' : block.end_zulu);
    const totalMin = endMin - startMin;
    const PX_PER_MIN = 2.2;
    const timelineHeight = totalMin * PX_PER_MIN + 40;

    const hourMarks = [];
    const markCount = Math.ceil(totalMin / 30);
    for (let i = 0; i <= markCount; i++) {
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
              const top = (timeToMinutes(label + ':00') - startMin) * PX_PER_MIN + 36;
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
                {hourMarks.map(label => (
                  <View key={label} style={[styles.offsetGridLine, { top: (timeToMinutes(label + ':00') - startMin) * PX_PER_MIN }]} />
                ))}
                {blockBoards
                  .filter(b => b.positions?.code === pos)
                  .sort((a, b) => a.start_zulu.localeCompare(b.start_zulu))
                  .map(board => {
                    const bStart = timeToMinutes(board.start_zulu);
                    const bEnd = timeToMinutes(board.end_zulu === '00:00:00' ? '06:00:00' : board.end_zulu);
                    const top = (bStart - startMin) * PX_PER_MIN;
                    const height = (bEnd - bStart) * PX_PER_MIN;
                    return (
                      <TouchableOpacity key={board.id} onPress={isChief ? () => { setEditingBoard(board); setEditBoardModal(true); } : null} disabled={!isChief} style={[styles.offsetBlock, { top, height: Math.max(height, 48), backgroundColor: board.users?.color_hex + '33' || '#f1f5f9', overflow: 'hidden', padding: 0, flexDirection: 'column', borderLeftWidth: 3, borderLeftColor: board.users?.color_hex || '#ccc' }]}>
                        {board.ojti ? (
                          <>
                            <View style={{ flex: 1, width: '100%', justifyContent: 'space-between', alignItems: 'stretch', backgroundColor: board.users?.color_hex || '#f1f5f9' }}>
                              <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600', paddingHorizontal: 4, paddingTop: 3 }}>{board.start_zulu?.slice(0,5)}</Text>
                              <Text style={[styles.offsetBlockInitial, { textAlign: 'center' }]}>{board.users?.initial || board.temp_initial || ''}</Text>
                              <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600', textAlign: 'right', paddingHorizontal: 4, paddingBottom: 3 }}>{board.end_zulu?.startsWith('00:00') ? '06:00' : board.end_zulu?.slice(0,5)}</Text>
                            </View>
                            <View style={{ flex: 1, width: '100%', justifyContent: 'space-between', alignItems: 'stretch', backgroundColor: board.ojti?.color_hex || '#e2e8f0', borderTopWidth: 1.5, borderTopColor: 'rgba(255,255,255,0.7)' }}>
                              <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600', paddingHorizontal: 4, paddingTop: 3 }}>{board.start_zulu?.slice(0,5)}</Text>
                              <Text style={[styles.offsetBlockInitial, { textAlign: 'center' }]}>{board.ojti?.initial}</Text>
                              <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600', textAlign: 'right', paddingHorizontal: 4, paddingBottom: 3 }}>{board.end_zulu?.startsWith('00:00') ? '06:00' : board.end_zulu?.slice(0,5)}</Text>
                            </View>
                            <View style={styles.ojtiBadge}><Text style={styles.ojtiBadgeIcon}>🤝</Text></View>
                          </>
                        ) : (
                          <View style={{ flex: 1, flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch', width: '100%' }}>
                            <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600', paddingHorizontal: 4, paddingTop: 3 }}>{board.start_zulu?.slice(0,5)}</Text>
                            <Text style={[styles.offsetBlockInitial, { textAlign: 'center' }]}>{board.users?.initial || board.temp_initial || ''}</Text>
                            <Text style={{ fontSize: 9, color: '#1a2744', fontWeight: '600', textAlign: 'right', paddingHorizontal: 4, paddingBottom: 3 }}>{board.end_zulu?.startsWith('00:00') ? '06:00' : board.end_zulu?.slice(0,5)}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderBlock(block) {
    return (
      <View key={block.id}>
        <Text style={styles.sectionLabel}>
          {block.name} · {block.start_zulu.slice(0,5)}Z - {block.end_zulu.slice(0,5)}Z
        </Text>
        {block.display_type === 'hourly_table' && renderHourlyTable(block)}
        {block.display_type === 'fixed_block' && renderFixedBlock(block)}
        {block.display_type === 'offset_timeline' && renderOffsetTimeline(block)}
      </View>
    );
  }

  const isDraft = scheduleInfo?.status === 'draft';
  const isApproved = scheduleInfo?.status === 'approved';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>SQUAWK</Text>
            <Text style={styles.headerSub}>{airport ? `${airport.icao_code} · ${airport.unit_name}` : ''}</Text>
          </View>
          {isChief && (
            <TouchableOpacity style={styles.createBtn} onPress={() => { setNewDate(selectedDate); setCreateModal(true); }}>
              <Text style={styles.createBtnText}>+ Program</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8, gap: 16 }}>
          <TouchableOpacity onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setCalendarYear(new Date(selectedDate).getFullYear()); setCalendarMonth(new Date(selectedDate).getMonth()); fetchMonthSchedules(new Date(selectedDate).getFullYear(), new Date(selectedDate).getMonth()); setCalendarModal(true); }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' }}>{selectedDate}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, shiftType === 'day' && styles.toggleBtnActive]}
          onPress={() => setShiftType('day')}
        >
          <Text style={[styles.toggleText, shiftType === 'day' && styles.toggleTextActive]}>☀ Gunduz</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, shiftType === 'night' && styles.toggleBtnActive]}
          onPress={() => setShiftType('night')}
        >
          <Text style={[styles.toggleText, shiftType === 'night' && styles.toggleTextActive]}>☾ Gece</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#1a2744" size="large" /></View>
      ) : !scheduleInfo ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>Program yok</Text>
          {isChief && (
            <TouchableOpacity style={styles.createBtnLarge} onPress={() => { setNewDate(selectedDate); setCreateModal(true); }}>
              <Text style={styles.createBtnLargeText}>+ Yeni Program Olustur</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.tableScroll} contentContainerStyle={styles.scheduleScrollContent}>
          <View style={[styles.statusBar, isDraft && styles.statusBarDraft, isApproved && styles.statusBarApproved]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.scheduleDateText}>
                {formatDate(scheduleInfo.schedule_date)}
              </Text>
              <Text style={[styles.statusText, isDraft && styles.statusTextDraft, isApproved && styles.statusTextApproved]}>
                {isDraft ? '📝 Taslak — Henuz Onaylanmadi' : '✅ Onayli Program'}
              </Text>
            </View>
            {isChief && isDraft && (
              <View style={styles.statusActions}>
                <TouchableOpacity style={styles.approveBtn} onPress={approveSchedule}>
                  <Text style={styles.approveBtnText}>Onayla</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={deleteSchedule}>
                  <Text style={styles.deleteBtnText}>Sil</Text>
                </TouchableOpacity>
              </View>
            )}
            {isChief && isApproved && (
              <TouchableOpacity style={styles.rejectBtn} onPress={rejectSchedule}>
                <Text style={styles.rejectBtnText}>Taslaga Al</Text>
              </TouchableOpacity>
            )}
          </View>

          {shiftBlocks.map(block => renderBlock(block))}

          {shiftType === 'night' && boards.filter(b => b.is_night_off).length > 0 && (
            <View style={[styles.aitCard, { backgroundColor: '#f8faff', borderColor: '#e2eaf4' }]}>
              <Text style={[styles.aitLabel, { color: '#64748b' }]}>🌙 Gece OFF</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {boards.filter(b => b.is_night_off).map(b => (
                  <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[styles.aitBadge, { backgroundColor: b.users?.color_hex || '#94a3b8' }]}>
                      <Text style={styles.aitBadgeText}>{b.users?.initial || '?'}</Text>
                    </View>
                    <Text style={styles.aitName}>{b.users?.full_name || ''}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {aitUser && (
            <View style={styles.aitCard}>
              <Text style={styles.aitLabel}>📋 AIT Gorevi</Text>
              <View style={styles.aitRow}>
                <View style={[styles.aitBadge, { backgroundColor: aitUser.color_hex || '#94a3b8' }]}>
                  <Text style={styles.aitBadgeText}>{aitUser.initial}</Text>
                </View>
                <Text style={styles.aitName}>{aitUser.full_name}</Text>
                <Text style={styles.aitNote}>Shift basinda NOTAM inceler</Text>
              </View>
            </View>
          )}

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

      <Modal visible={createModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalTitle}>Yeni Program Olustur</Text>

              <Text style={styles.label}>Tarih</Text>
              <TextInput
                style={styles.input}
                value={newDate}
                onChangeText={setNewDate}
                placeholder="YYYY-MM-DD"
              />

              <Text style={styles.label}>Shift Turu</Text>
              <View style={styles.shiftTypeRow}>
                <TouchableOpacity
                  style={[styles.shiftTypeBtn, newShiftType === 'day' && styles.shiftTypeBtnActive]}
                  onPress={() => setNewShiftType('day')}
                >
                  <Text style={[styles.shiftTypeBtnText, newShiftType === 'day' && styles.shiftTypeBtnTextActive]}>☀ Gunduz</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shiftTypeBtn, newShiftType === 'night' && styles.shiftTypeBtnActive]}
                  onPress={() => setNewShiftType('night')}
                >
                  <Text style={[styles.shiftTypeBtnText, newShiftType === 'night' && styles.shiftTypeBtnTextActive]}>☾ Gece</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>Ekip Sefi (YO) board alacak mi?</Text>
              <View style={styles.shiftTypeRow}>
                <TouchableOpacity
                  style={[styles.shiftTypeBtn, !chiefTakesBoards && styles.shiftTypeBtnActive]}
                  onPress={() => setChiefTakesBoards(false)}
                >
                  <Text style={[styles.shiftTypeBtnText, !chiefTakesBoards && styles.shiftTypeBtnTextActive]}>Hayir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.shiftTypeBtn, chiefTakesBoards && styles.shiftTypeBtnActive]}
                  onPress={() => setChiefTakesBoards(true)}
                >
                  <Text style={[styles.shiftTypeBtnText, chiefTakesBoards && styles.shiftTypeBtnTextActive]}>Evet</Text>
                </TouchableOpacity>
              </View>

              {chiefTakesBoards && (
                <>
                  <Text style={styles.label}>Kac board alacak?</Text>
                  <TextInput
                    style={styles.input}
                    value={chiefBoardCount}
                    onChangeText={setChiefBoardCount}
                    keyboardType="numeric"
                    placeholder="2"
                  />
                </>
              )}

              {newShiftType === 'night' && (
                <>
                  <Text style={styles.label}>Ana nöbet pozisyonları</Text>
                  {['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'].map(pos => {
                    const isOn = selectedPositions.includes(pos);
                    return (
                      <TouchableOpacity
                        key={pos}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e2eaf4' }}
                        onPress={() => {
                          if (isOn) setSelectedPositions(selectedPositions.filter(p => p !== pos));
                          else setSelectedPositions([...selectedPositions, pos]);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOn ? '#1a2744' : '#cbd5e1' }} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: isOn ? '#1a2744' : '#94a3b8' }}>{pos}</Text>
                        </View>
                        <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: isOn ? '#1a2744' : '#e2e8f0', padding: 2, alignItems: isOn ? 'flex-end' : 'flex-start' }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' }} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <Text style={[styles.label, { marginTop: 16 }]}>Sabahçı pozisyonları</Text>
                  {['YWU', 'PLN', 'YZA', 'YZC'].map(pos => {
                    const key = 'sabahci_' + pos;
                    const isOn = selectedMorningPositions.includes(pos);
                    return (
                      <TouchableOpacity
                        key={key}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#e2eaf4' }}
                        onPress={() => {
                          if (isOn) setSelectedMorningPositions(selectedMorningPositions.filter(p => p !== pos));
                          else setSelectedMorningPositions([...selectedMorningPositions, pos]);
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOn ? '#1a2744' : '#cbd5e1' }} />
                          <Text style={{ fontSize: 14, fontWeight: '600', color: isOn ? '#1a2744' : '#94a3b8' }}>{pos}</Text>
                        </View>
                        <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: isOn ? '#1a2744' : '#e2e8f0', padding: 2, alignItems: isOn ? 'flex-end' : 'flex-start' }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' }} />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {newShiftType === 'day' && <View style={{ marginBottom: 16 }}>
                <Text style={[styles.label, { marginBottom: 10 }]}>Pozisyonlar — aç / kapa</Text>
                {['YWU', 'PLN', 'YZA', 'YZC', 'YZC_PLN'].map(pos => {
                  const isOn = selectedPositions.includes(pos);
                  return (
                    <TouchableOpacity
                      key={pos}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#e2eaf4' }}
                      onPress={() => {
                        if (isOn) {
                          setSelectedPositions(selectedPositions.filter(p => p !== pos));
                        } else {
                          setSelectedPositions([...selectedPositions, pos]);
                        }
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isOn ? '#1a2744' : '#cbd5e1' }} />
                        <Text style={{ fontSize: 14, fontWeight: '600', color: isOn ? '#1a2744' : '#94a3b8' }}>{pos}</Text>
                      </View>
                      <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: isOn ? '#1a2744' : '#e2e8f0', padding: 2, alignItems: isOn ? 'flex-end' : 'flex-start' }}>
                        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffffff' }} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateModal(false)}>
                  <Text style={styles.cancelBtnText}>Vazgec</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={createSchedule} disabled={creating}>
                  {creating
                    ? <ActivityIndicator color="#1a2744" size="small" />
                    : <Text style={styles.saveBtnText}>Olustur</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={calendarModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 340, width: '100%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <TouchableOpacity onPress={() => { const m = calendarMonth === 0 ? 11 : calendarMonth-1; const y = calendarMonth === 0 ? calendarYear-1 : calendarYear; setCalendarMonth(m); setCalendarYear(y); fetchMonthSchedules(y, m); }}>
                <Text style={{ fontSize: 20, color: '#1a2744' }}>‹</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#1a2744' }}>
                {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'][calendarMonth]} {calendarYear}
              </Text>
              <TouchableOpacity onPress={() => { const m = calendarMonth === 11 ? 0 : calendarMonth+1; const y = calendarMonth === 11 ? calendarYear+1 : calendarYear; setCalendarMonth(m); setCalendarYear(y); fetchMonthSchedules(y, m); }}>
                <Text style={{ fontSize: 20, color: '#1a2744' }}>›</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', marginBottom: 6 }}>
              {['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(d => (
                <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#94a3b8', fontWeight: '600' }}>{d}</Text>
              ))}
            </View>
            {(() => {
              const firstDow = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
              const daysInMonth = new Date(calendarYear, calendarMonth+1, 0).getDate();
              const cells = [];
              for (let i = 0; i < firstDow; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);
              const rows = [];
              for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i+7));
              return rows.map((row, ri) => (
                <View key={ri} style={{ flexDirection: 'row', marginBottom: 3 }}>
                  {row.map((day, ci) => {
                    if (!day) return <View key={ci} style={{ flex: 1, height: 34 }} />;
                    const ds = `${calendarYear}-${String(calendarMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                    const sch = monthSchedules.filter(s => s.schedule_date === ds);
                    const hasDay = sch.some(s => s.shift_template_id === '1a4ce9d9-7ce0-435f-bfc8-fd74d84830b1');
                    const hasNight = sch.some(s => s.shift_template_id === 'ecd9ef04-2408-439f-b729-62d93977cf53');
                    const isSelected = ds === selectedDate;
                    const isToday = ds === todayStr;
                    return (
                      <TouchableOpacity key={ci} style={{ flex: 1, height: 34, borderRadius: 6, margin: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: isSelected ? '#1a2744' : hasDay && hasNight ? '#7c3aed22' : hasDay ? '#ef444422' : hasNight ? '#3b82f622' : 'transparent', borderWidth: isToday ? 1.5 : 0, borderColor: '#1a2744' }}
                        onPress={() => { setSelectedDate(ds); setCalendarModal(false); }}>
                        <Text style={{ fontSize: 12, fontWeight: isSelected || isToday ? '700' : '400', color: isSelected ? '#fff' : isToday ? '#1a2744' : '#1a2744' }}>{day}</Text>
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          {hasDay && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#ef4444' }} />}
                          {hasNight && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#3b82f6' }} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ));
            })()}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' }} /><Text style={{ fontSize: 10, color: '#64748b' }}>Gündüz</Text></View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6' }} /><Text style={{ fontSize: 10, color: '#64748b' }}>Gece</Text></View>
            </View>
            <TouchableOpacity style={{ marginTop: 12, padding: 10, alignItems: 'center' }} onPress={() => setCalendarModal(false)}>
              <Text style={{ color: '#64748b', fontSize: 13 }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={editBoardModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Board Düzenle</Text>
            {editingBoard && (
              <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
                {editingBoard.positions?.code} · {editingBoard.start_zulu?.slice(0,5)}Z — {editingBoard.end_zulu?.slice(0,5)}Z
              </Text>
            )}
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#1a2744', marginBottom: 8 }}>Initial gir</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: '#e2eaf4', borderRadius: 8, padding: 10, fontSize: 16, fontWeight: '700' }}
                placeholder="örn: AB"
                maxLength={3}
                autoCapitalize="characters"
                value={tempInitial}
                onChangeText={setTempInitial}
              />
              <TouchableOpacity
                style={{ backgroundColor: '#1a2744', borderRadius: 8, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
                onPress={async () => {
                  if (!tempInitial || !editingBoard) return;
                  const matchUser = allUsers.find(u => u.initial.toUpperCase() === tempInitial.toUpperCase());
                  let updateData;
                  if (matchUser) {
                    if (matchUser.is_ojti) {
                      // OJTI girildiyse rate'lisi ile birlikte yaz
                      const ojtiPair = ojtiPairs?.find(p => p.ojti_user_id === matchUser.id);
                      updateData = { user_id: ojtiPair?.rate_user_id || matchUser.id, ojti_user_id: matchUser.id, temp_initial: null };
                    } else {
                      // Rate'li ATC girildiyse, bu kişinin OJTI'si var mı kontrol et
                      const rateOjtiPair = ojtiPairs?.find(p => p.rate_user_id === matchUser.id);
                      const ojtiUser = rateOjtiPair ? allUsers.find(u => u.id === rateOjtiPair.ojti_user_id) : null;
                      updateData = { user_id: matchUser.id, ojti_user_id: ojtiUser?.id || null, temp_initial: null };
                    }
                  } else {
                    updateData = { user_id: null, ojti_user_id: null, temp_initial: tempInitial.toUpperCase() };
                  }
                  const { error } = await supabase.from('boards').update(updateData).eq('id', editingBoard.id);
                  if (error) { alert('Hata: ' + error.message); return; }
                  // Guncellenen board'u Supabase'den cek
                  const { data: updatedBoard } = await supabase
                    .from('boards')
                    .select('*, positions(*), users!boards_user_id_fkey(*), ojti:users!boards_ojti_user_id_fkey(*)')
                    .eq('id', editingBoard.id)
                    .single();
                  if (updatedBoard) {
                    console.log('updatedBoard:', JSON.stringify(updatedBoard));
                    setBoards(prev => prev.map(b => b.id === editingBoard.id ? updatedBoard : b));
                  }
                  setTempInitial('');
                  setEditBoardModal(false);
                  setEditingBoard(null);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Kaydet</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Ekipteki biri ise otomatik eşleşir, değilse geçici olarak kaydedilir.</Text>
            <TouchableOpacity style={{ marginTop: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center' }} onPress={() => { setEditBoardModal(false); setEditingBoard(null); }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748b' }}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f7fb', gap: 16 },
  emptyText: { color: '#94a3b8', fontSize: 14 },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 2 },
  headerSub: { fontSize: 12, color: '#93c5fd', marginTop: 4 },
  createBtn: { backgroundColor: '#f59e0b', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  createBtnText: { color: '#1a2744', fontWeight: '800', fontSize: 12 },
  createBtnLarge: { backgroundColor: '#f59e0b', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  createBtnLargeText: { color: '#1a2744', fontWeight: '800', fontSize: 14 },
  toggleRow: { flexDirection: 'row', backgroundColor: '#e8eef6', margin: 12, borderRadius: 10, padding: 3 },
  toggleBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#1a2744' },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  toggleTextActive: { color: '#ffffff' },
  statusBar: { marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBarDraft: { backgroundColor: '#fffbeb', borderWidth: 1.5, borderColor: '#fcd34d', borderStyle: 'dashed' },
  statusBarApproved: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac' },
  scheduleDateText: { fontSize: 13, color: '#1a2744', fontWeight: '700', marginBottom: 2 },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusTextDraft: { color: '#d97706' },
  statusTextApproved: { color: '#16a34a' },
  statusActions: { flexDirection: 'row', gap: 6 },
  approveBtn: { backgroundColor: '#16a34a', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  approveBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 12 },
  deleteBtn: { backgroundColor: '#fef2f2', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#fecaca' },
  deleteBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 11 },
  rejectBtn: { backgroundColor: '#f4f7fb', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2eaf4' },
  rejectBtnText: { color: '#64748b', fontWeight: '700', fontSize: 11 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  tableScroll: { flex: 1 },
  tableScrollContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  tableWrap: { borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 8 },
  row: { flexDirection: 'row' },
  cornerCell: { width: 56, height: 48, backgroundColor: '#1a2744', borderWidth: 1, borderColor: CELL_BORDER, borderTopLeftRadius: 10 },
  timeCell: { width: 56, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2744', borderWidth: 1, borderColor: CELL_BORDER },
  timeCellText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  posHeaderCell: { width: 76, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2744', borderWidth: 1, borderColor: CELL_BORDER },
  posHeaderText: { fontSize: 11, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  dataCell: { width: 76, height: 48, alignItems: 'center', justifyContent: 'center', ...cellShadowBase },
  dataCellText: { fontSize: 15, fontWeight: '800', color: '#1a2744' },
  cellLeftStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: 2 },
  offsetTimeLabel: { fontSize: 9, fontWeight: '500', paddingHorizontal: 4, paddingTop: 2 },
  ojtiCell: { width: 76, height: 48, flexDirection: 'row', ...cellShadowBase, overflow: 'hidden' },
  simpleBlockChipWrap: { marginRight: 8 },
  simpleBlockOjtiHalf: { flex: 1, alignSelf: 'stretch', justifyContent: 'space-between', padding: 6, height: '100%' },
  offsetOjtiStripe: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.5)' },
  ojtiHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ojtiBadge: { position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderStyle: 'solid', borderTopWidth: 14, borderRightWidth: 14, borderTopColor: '#7c3aed', borderRightColor: '#7c3aed', borderLeftWidth: 14, borderLeftColor: 'transparent', borderBottomWidth: 14, borderBottomColor: 'transparent' },
  ojtiBadgeIcon: { position: 'absolute', top: -12, right: -2, fontSize: 9 },
  scheduleScrollContent: { paddingBottom: 300 },
  emptyBlock: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2eaf4', borderStyle: 'dashed' },
  emptyBlockText: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  simpleBlockRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  simpleBlockChip: { width: 110, minHeight: 85, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.1)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 3 },
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
  aitCard: { marginHorizontal: 16, marginTop: 24, marginBottom: 8, padding: 12, backgroundColor: '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe' },
  aitLabel: { fontSize: 11, fontWeight: '800', color: '#1e40af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  aitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aitBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  aitBadgeText: { fontSize: 12, fontWeight: '800', color: '#1a2744' },
  aitName: { fontSize: 13, fontWeight: '700', color: '#1a2744' },
  aitNote: { fontSize: 10, color: '#64748b', marginLeft: 'auto' },
  summarySection: { paddingHorizontal: 16, paddingBottom: 32 },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: '#1a2744', marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#e8eef6' },
  summaryBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  summaryBadgeText: { fontSize: 11, fontWeight: '800', color: '#1a2744' },
  summaryName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1a2744' },
  summaryChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  summaryChipText: { fontSize: 10, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a2744', marginBottom: 16 },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#f4f7fb', borderWidth: 1, borderColor: '#e2eaf4', borderRadius: 8, padding: 12, fontSize: 14, color: '#1a2744' },
  shiftTypeRow: { flexDirection: 'row', gap: 8 },
  shiftTypeBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#e2eaf4', alignItems: 'center' },
  shiftTypeBtnActive: { backgroundColor: '#1a2744', borderColor: '#1a2744' },
  shiftTypeBtnText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  shiftTypeBtnTextActive: { color: '#ffffff' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#f59e0b', alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#1a2744' },
});
