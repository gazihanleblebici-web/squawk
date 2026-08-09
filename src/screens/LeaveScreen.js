import { useEffect, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Modal, ActivityIndicator
} from 'react-native';
import { supabase } from '../lib/supabase';

const LEAVE_TYPES = [
  { value: 'annual_leave', label: 'Yıllık İzin', color: '#2563eb', bg: '#eff6ff' },
  { value: 'excuse_leave', label: 'Mazeret İzni', color: '#9333ea', bg: '#faf5ff' },
  { value: 'domestic_duty', label: 'Yurt İçi Görevli', color: '#0891b2', bg: '#ecfeff' },
  { value: 'abroad_duty', label: 'Yurt Dışı Görevli', color: '#d97706', bg: '#fffbeb' },
  { value: 'sick', label: 'Raporlu', color: '#dc2626', bg: '#fef2f2' },
];

const MONTH_NAMES = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const DAY_NAMES = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  const day = new Date(year, month, 1).getDay();
  return (day + 6) % 7; // Pazartesi = 0
}

function dateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function sendNotification(userId, message) {
  await supabase.from('notifications').insert({ user_id: userId, message });
}

export default function LeaveScreen({ user }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [leaves, setLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayModal, setDayModal] = useState(false);
  const [leaveTypeModal, setLeaveTypeModal] = useState(false);
  const [pendingModal, setPendingModal] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifModal, setNotifModal] = useState(false);
  const [shiftStartDate, setShiftStartDate] = useState(null);
  const [shiftStartType, setShiftStartType] = useState('day');

  const isChief = user?.role === 'chief';
  const [crewUsers, setCrewUsers] = useState([]);
  const [dayStatusData, setDayStatusData] = useState([]);

  useEffect(() => {
    fetchAll();
    fetchNotifications();
    fetchShiftInfo();
  }, [viewYear, viewMonth]);

  useFocusEffect(useCallback(() => {
    fetchShiftInfo();
  }, []));

  useEffect(() => {
    if (!selectedDate) return;
    supabase.from('user_day_status').select('user_id,status').eq('status_date', selectedDate).then(({ data }) => {
      if (data) setDayStatusData(data);
    });
  }, [selectedDate]);

  async function fetchShiftInfo() {
    const chiefId = await getChiefId();
    if (!chiefId) return;
    const { data } = await supabase.from('users').select('shift_start_date, shift_start_type').eq('id', chiefId).single();
    if (data) {
      setShiftStartDate(data.shift_start_date);
      setShiftStartType(data.shift_start_type || 'day');
    }
  }

  function getShiftTypeForDate(dateStr) {
    if (!shiftStartDate) return null;
    const start = new Date(shiftStartDate + 'T00:00:00');
    const target = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((target - start) / (1000 * 60 * 60 * 24));
    if (diff < 0) return null;
    const cycle = diff % 5;
    if (shiftStartType === 'day') {
      // day -> night -> off -> off -> off
      if (cycle === 0) return 'day';
      if (cycle === 1) return 'night';
      return 'off';
    } else {
      // night -> off -> off -> off -> day
      if (cycle === 0) return 'night';
      if (cycle === 1) return 'off';
      if (cycle === 2) return 'off';
      if (cycle === 3) return 'off';
      return 'day';
    }
  }

  async function fetchAll() {
    setLoading(true);
    const { data: usersData } = await supabase.from('users').select('*').eq('is_active', true).order('display_order', { ascending: true });
    if (usersData) setCrewUsers(usersData);
    if (isChief) {
      const { data } = await supabase
        .from('leave_requests')
        .select('*, users!leave_requests_user_id_fkey(*)')
        .in('status', ['pending', 'cancel_pending', 'approved', 'cancelled', 'rejected'])
        .order('start_date', { ascending: true });
      if (data) setAllLeaves(data);
    } else {
      const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
      const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${getDaysInMonth(viewYear, viewMonth)}`;
      const { data } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', user?.id)
        .gte('start_date', monthStart)
        .lte('start_date', monthEnd)
        .order('start_date', { ascending: true });
      if (data) setLeaves(data);
    }
    setLoading(false);
  }

  async function fetchNotifications() {
    if (!user?.id) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setNotifications(data);
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    fetchNotifications();
  }

  function getLeavesForDate(dateString) {
    if (isChief) return allLeaves.filter(l => l.start_date <= dateString && l.end_date >= dateString && !['rejected','cancelled'].includes(l.status));
    return leaves.filter(l => l.start_date <= dateString && l.end_date >= dateString && !['rejected','cancelled'].includes(l.status));
  }

  async function getChiefId() {
    const { data } = await supabase.from('users').select('id').eq('role', 'chief').single();
    return data?.id;
  }

  async function submitLeaveRequest(leaveType) {
    if (!selectedDate || !user) return;
    const info = LEAVE_TYPES.find(l => l.value === leaveType);
    const { error } = await supabase.from('leave_requests').insert({
      user_id: user.id,
      leave_type: leaveType,
      start_date: selectedDate,
      end_date: selectedDate,
      status: 'pending',
    });
    if (error) { alert('Hata: ' + error.message); return; }
    const chiefId = await getChiefId();
    if (chiefId) {
      const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      await sendNotification(chiefId, `${user.full_name} — ${dateLabel} için ${info?.label} talebi gönderdi.`);
    }
    setLeaveTypeModal(false);
    setDayModal(false);
    fetchAll();
  }

  async function approveLeave(leave) {
    const info = LEAVE_TYPES.find(l => l.value === leave.leave_type);
    await supabase.from('leave_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
      .eq('id', leave.id);
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      const { data: existing } = await supabase.from('user_day_status').select('id').eq('user_id', leave.user_id).eq('status_date', ds).maybeSingle();
      if (existing) {
        await supabase.from('user_day_status').update({ status: leave.leave_type }).eq('id', existing.id);
      } else {
        await supabase.from('user_day_status').insert({ user_id: leave.user_id, status_date: ds, status: leave.leave_type });
      }
    }
    const dateLabel = new Date(leave.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    await sendNotification(leave.user_id, `✅ ${dateLabel} tarihli ${info?.label} talebiniz onaylandı.`);
    setPendingModal(false);
    fetchAll();
  }

  async function rejectLeave(leave) {
    const info = LEAVE_TYPES.find(l => l.value === leave.leave_type);
    await supabase.from('leave_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
      .eq('id', leave.id);
    const dateLabel = new Date(leave.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    await sendNotification(leave.user_id, `❌ ${dateLabel} tarihli ${info?.label} talebiniz reddedildi.`);
    setPendingModal(false);
    fetchAll();
  }

  async function chiefCancelLeave(leave) {
    const info = LEAVE_TYPES.find(l => l.value === leave.leave_type);
    await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', leave.id);
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      await supabase.from('user_day_status').update({ status: 'active' }).eq('user_id', leave.user_id).eq('status_date', ds);
    }
    const dateLabel = new Date(leave.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    await sendNotification(leave.user_id, `🚫 ${dateLabel} tarihli ${info?.label} iznin ekip şefi tarafından iptal edildi.`);
    setDayModal(false);
    fetchAll();
  }

  async function cancelLeave(leave) {
    const info = LEAVE_TYPES.find(l => l.value === leave.leave_type);
    if (leave.status === 'pending') {
      await supabase.from('leave_requests').update({ status: 'cancelled' }).eq('id', leave.id);
    } else if (leave.status === 'approved') {
      await supabase.from('leave_requests').update({ status: 'cancel_pending' }).eq('id', leave.id);
      const chiefId = await getChiefId();
      if (chiefId) {
        const dateLabel = new Date(leave.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
        await sendNotification(chiefId, `🚫 ${user.full_name} — ${dateLabel} tarihli ${info?.label} için iptal talebi gönderdi.`);
      }
    }
    setDayModal(false);
    fetchAll();
  }

  async function approveCancelLeave(leave) {
    const info = LEAVE_TYPES.find(l => l.value === leave.leave_type);
    await supabase.from('leave_requests')
      .update({ status: 'cancelled', reviewed_at: new Date().toISOString(), reviewed_by: user?.id })
      .eq('id', leave.id);
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const ds = d.toISOString().split('T')[0];
      await supabase.from('user_day_status').update({ status: 'active' }).eq('user_id', leave.user_id).eq('status_date', ds);
    }
    const dateLabel = new Date(leave.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    await sendNotification(leave.user_id, `✅ ${dateLabel} tarihli ${info?.label} iptal talebiniz onaylandı.`);
    setPendingModal(false);
    fetchAll();
  }

  function getLeaveTypeInfo(value) {
    return LEAVE_TYPES.find(l => l.value === value) || { label: value, color: '#94a3b8', bg: '#f1f5f9' };
  }

  function renderDayCell(day) {
    const ds = dateStr(viewYear, viewMonth, day);
    const todayStr = today.toISOString().split('T')[0];
    const isToday = ds === todayStr;
    const dayLeaves = getLeavesForDate(ds);
    const mainLeave = dayLeaves[0];
    let cellStyle = [styles.dayCell];
    let textStyle = [styles.dayText];
    let badge = null;
    if (isToday) textStyle.push(styles.dayTextToday);
    if (mainLeave) {
      const info = getLeaveTypeInfo(mainLeave.leave_type);
      if (mainLeave.status === 'pending') {
        cellStyle.push({ backgroundColor: info.bg, borderColor: info.color, borderStyle: 'dashed', borderWidth: 1.5 });
        badge = <Text style={styles.badgeIcon}>⏳</Text>;
      } else if (mainLeave.status === 'approved') {
        cellStyle.push({ backgroundColor: info.bg, borderColor: info.color, borderStyle: 'solid', borderWidth: 1.5 });
        badge = <Text style={styles.badgeIcon}>✅</Text>;
      } else if (mainLeave.status === 'cancel_pending') {
        cellStyle.push({ backgroundColor: '#fef2f2', borderColor: '#dc2626', borderStyle: 'dashed', borderWidth: 1.5 });
        badge = <Text style={styles.badgeIcon}>🚫</Text>;
      }
    }
    const extraCount = isChief && dayLeaves.length > 1 ? dayLeaves.length : 0;
    const shiftType = getShiftTypeForDate(ds);
    if (shiftType && !mainLeave) {
      if (shiftType === 'day') cellStyle.push({ backgroundColor: '#fef2f2', borderColor: '#fca5a5', borderWidth: 1 });
      else if (shiftType === 'night') cellStyle.push({ backgroundColor: '#eff6ff', borderColor: '#93c5fd', borderWidth: 1 });
      else if (shiftType === 'off') cellStyle.push({ backgroundColor: '#f0fdf4', borderColor: '#86efac', borderWidth: 1 });
    }
    return (
      <TouchableOpacity key={day} style={cellStyle} onPress={() => { setSelectedDate(ds); }}>
        <Text style={textStyle}>{day}</Text>
        {shiftType && !mainLeave && (
          <Text style={{ fontSize: 7, color: shiftType === 'day' ? '#dc2626' : shiftType === 'night' ? '#2563eb' : '#16a34a', fontWeight: '600' }}>
            {shiftType === 'day' ? 'DAY' : shiftType === 'night' ? 'NIGHT' : 'OFF'}
          </Text>
        )}
        {badge}
        {extraCount > 1 && <Text style={styles.extraDot}>+{extraCount}</Text>}
      </TouchableOpacity>
    );
  }

  function renderCalendar() {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth);
    const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(<View key={`e-${i}`} style={styles.dayCell} />);
    for (let d = 1; d <= daysInMonth; d++) cells.push(renderDayCell(d));
    // Son satiri 7 ile tamamla
    while (cells.length % 7 !== 0) cells.push(<View key={`t-${cells.length}`} style={styles.dayCell} />);
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(<View key={i} style={styles.calendarRow}>{cells.slice(i, i + 7)}</View>);
    }
    return rows;
  }

  const pendingLeaves = isChief ? allLeaves.filter(l => l.status === 'pending' || l.status === 'cancel_pending') : [];
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const selectedDayLeaves = selectedDate ? getLeavesForDate(selectedDate) : [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Ajanda</Text>
          <View style={styles.headerBtns}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => { setNotifModal(true); markAllRead(); }}>
              <Text style={styles.notifBtnText}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.notifDot}>
                  <Text style={styles.notifDotText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            {isChief && pendingLeaves.length > 0 && (
              <TouchableOpacity style={styles.pendingBadge} onPress={() => setPendingModal(true)}>
                <Text style={styles.pendingBadgeText}>⏳ {pendingLeaves.length}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <ScrollView>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthBtn} onPress={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); }}>
            <Text style={styles.monthBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
          <TouchableOpacity style={styles.monthBtn} onPress={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); }}>
            <Text style={styles.monthBtnText}>›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.calendarRow}>
          {DAY_NAMES.map(d => <View key={d} style={styles.dayHeader}><Text style={styles.dayHeaderText}>{d}</Text></View>)}
        </View>
        {loading ? <ActivityIndicator color="#1a2744" style={{ marginTop: 40 }} /> : renderCalendar()}
        <View style={styles.legend}>
          {LEAVE_TYPES.map(lt => (
            <View key={lt.value} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: lt.color }]} />
              <Text style={styles.legendText}>{lt.label}</Text>
            </View>
          ))}
          <View style={styles.legendItem}><Text style={styles.legendText}>⏳ Onay Bekliyor</Text></View>
          <View style={styles.legendItem}><Text style={styles.legendText}>✅ Onaylandı</Text></View>
          <View style={styles.legendItem}><Text style={styles.legendText}>🚫 İptal Talebi</Text></View>
        </View>

        {selectedDate && (
          <View style={{ margin: 12, backgroundColor: '#f8faff', borderRadius: 12, borderWidth: 0.5, borderColor: '#e2eaf4', overflow: 'hidden' }}>
            <View style={{ backgroundColor: '#1a2744', padding: 10 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' })}
              </Text>
            </View>
            {isChief ? (
              crewUsers.map(u => {
                const st = dayStatusData.find(s => s.user_id === u.id);
                const status = st?.status || 'active';
                const statusInfo = { active: { label: 'Mevcut', color: '#166534', bg: '#dcfce7' }, annual_leave: { label: 'Yıllık İzin', color: '#1e40af', bg: '#dbeafe' }, excuse_leave: { label: 'Mazeret', color: '#7e22ce', bg: '#faf5ff' }, sick: { label: 'Raporlu', color: '#dc2626', bg: '#fee2e2' }, domestic_duty: { label: 'Yurt İçi Görev', color: '#0891b2', bg: '#ecfeff' }, abroad_duty: { label: 'Yurt Dışı Görev', color: '#d97706', bg: '#fffbeb' }, hourly_leave: { label: 'Saatlik İzin', color: '#d97706', bg: '#fffbeb' } }[status] || { label: status, color: '#64748b', bg: '#f1f5f9' };
                return (
                  <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#e2eaf4' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: (u.color_hex || '#94a3b8') + '33', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '600', color: u.color_hex || '#94a3b8' }}>{u.initial}</Text>
                      </View>
                      <Text style={{ fontSize: 12, color: '#1a2744' }}>{u.full_name}</Text>
                    </View>
                    <View style={{ backgroundColor: statusInfo.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                      <Text style={{ fontSize: 10, color: statusInfo.color, fontWeight: '500' }}>{statusInfo.label}</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View style={{ padding: 12 }}>
                {getLeavesForDate(selectedDate).filter(l => l.user_id === user?.id).length > 0
                  ? getLeavesForDate(selectedDate).filter(l => l.user_id === user?.id).map(l => (
                    <Text key={l.id} style={{ fontSize: 12, color: '#1a2744', marginBottom: 4 }}>
                      {({ annual_leave: 'Yıllık İzin', excuse_leave: 'Mazeret', sick: 'Raporlu', domestic_duty: 'Yurt İçi Görev', abroad_duty: 'Yurt Dışı Görev' }[l.leave_type] || l.leave_type)} — {l.status === 'pending' ? '⏳ Bekliyor' : '✅ Onaylandı'}
                    </Text>
                  ))
                  : <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>Bu gün için izin talebiniz yok.</Text>
                }
                <TouchableOpacity style={{ marginTop: 8, padding: 10, alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 8 }} onPress={() => setLeaveTypeModal(true)}>
                  <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '600' }}>+ İzin Talebi Gönder</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <Modal visible={dayModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }) : ''}
            </Text>
            {selectedDayLeaves.length === 0 ? (
              <>
                <Text style={styles.noLeaveText}>Bu gün için izin talebi yok.</Text>
                {!isChief && (
                  <TouchableOpacity style={styles.requestBtn} onPress={() => { setDayModal(false); setLeaveTypeModal(true); }}>
                    <Text style={styles.requestBtnText}>+ İzin Talebi Gönder</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              selectedDayLeaves.map(leave => {
                const info = getLeaveTypeInfo(leave.leave_type);
                return (
                  <View key={leave.id} style={[styles.leaveCard, { borderColor: info.color, borderStyle: leave.status === 'approved' ? 'solid' : 'dashed' }]}>
                    {isChief && leave.users && <Text style={styles.leaveUser}>{leave.users.full_name}</Text>}
                    <View style={styles.leaveCardRow}>
                      <View style={[styles.leaveTypeBadge, { backgroundColor: info.bg }]}>
                        <Text style={[styles.leaveTypeText, { color: info.color }]}>{info.label}</Text>
                      </View>
                      <Text style={styles.leaveStatus}>
                        {leave.status === 'pending' && '⏳ Onay Bekliyor'}
                        {leave.status === 'approved' && '✅ Onaylandı'}
                        {leave.status === 'cancel_pending' && '🚫 İptal Talebi'}
                        {leave.status === 'cancelled' && '❌ İptal Edildi'}
                        {leave.status === 'rejected' && '🚫 Reddedildi'}
                      </Text>
                    </View>
                    {!isChief && (leave.status === 'pending' || leave.status === 'approved') && (
                      <TouchableOpacity style={styles.cancelLeaveBtn} onPress={() => cancelLeave(leave)}>
                        <Text style={styles.cancelLeaveBtnText}>{leave.status === 'pending' ? 'Talebi Geri Al' : 'İptal Talebi Gönder'}</Text>
                      </TouchableOpacity>
                    )}
                    {isChief && leave.status === 'approved' && (
                      <TouchableOpacity style={[styles.cancelLeaveBtn, { borderColor: '#dc2626' }]} onPress={() => chiefCancelLeave(leave)}>
                        <Text style={[styles.cancelLeaveBtnText, { color: '#dc2626' }]}>İzni İptal Et</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
            {!isChief && selectedDayLeaves.length > 0 && selectedDayLeaves.every(l => ['cancelled', 'rejected'].includes(l.status)) && (
              <TouchableOpacity style={styles.requestBtn} onPress={() => { setDayModal(false); setLeaveTypeModal(true); }}>
                <Text style={styles.requestBtnText}>+ Yeni İzin Talebi Gönder</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setDayModal(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={leaveTypeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>İzin Türü Seç</Text>
            <Text style={styles.modalSub}>{selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) : ''}</Text>
            {LEAVE_TYPES.map(lt => (
              <TouchableOpacity key={lt.value} style={[styles.leaveTypeOption, { borderColor: lt.color, backgroundColor: lt.bg }]} onPress={() => submitLeaveRequest(lt.value)}>
                <View style={[styles.legendDot, { backgroundColor: lt.color }]} />
                <Text style={[styles.leaveTypeOptionText, { color: lt.color }]}>{lt.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setLeaveTypeModal(false)}>
              <Text style={styles.closeBtnText}>Vazgeç</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={pendingModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Bekleyen Talepler</Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {pendingLeaves.map(leave => {
                const info = getLeaveTypeInfo(leave.leave_type);
                return (
                  <View key={leave.id} style={[styles.pendingCard, { borderColor: info.color }]}>
                    <Text style={styles.pendingName}>{leave.users?.full_name}</Text>
                    <Text style={styles.pendingDate}>
                      {new Date(leave.start_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}
                      {leave.start_date !== leave.end_date && ` — ${new Date(leave.end_date + 'T00:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}`}
                    </Text>
                    <View style={[styles.leaveTypeBadge, { backgroundColor: info.bg, marginBottom: 10 }]}>
                      <Text style={[styles.leaveTypeText, { color: info.color }]}>{leave.status === 'cancel_pending' ? '🚫 İptal Talebi — ' : ''}{info.label}</Text>
                    </View>
                    <View style={styles.pendingActions}>
                      <TouchableOpacity style={styles.approveBtn} onPress={() => leave.status === 'cancel_pending' ? approveCancelLeave(leave) : approveLeave(leave)}>
                        <Text style={styles.approveBtnText}>✓ Onayla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.rejectBtn} onPress={() => rejectLeave(leave)}>
                        <Text style={styles.rejectBtnText}>✗ Reddet</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setPendingModal(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={notifModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Bildirimler</Text>
            {notifications.length === 0 ? (
              <Text style={styles.noLeaveText}>Bildirim yok.</Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {notifications.map(n => (
                  <View key={n.id} style={[styles.notifCard, !n.is_read && styles.notifCardUnread]}>
                    <Text style={styles.notifMessage}>{n.message}</Text>
                    <Text style={styles.notifTime}>
                      {new Date(n.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setNotifModal(false)}>
              <Text style={styles.closeBtnText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb', paddingBottom: 80 },
  header: { backgroundColor: '#1a2744', padding: 20, paddingTop: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', letterSpacing: 2 },
  headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10 },
  notifBtnText: { fontSize: 18 },
  notifDot: { position: 'absolute', top: -4, right: -4, backgroundColor: '#ef4444', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  notifDotText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  pendingBadge: { backgroundColor: '#f59e0b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  pendingBadgeText: { color: '#1a2744', fontWeight: '800', fontSize: 12 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  monthBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8eef6', borderRadius: 10 },
  monthBtnText: { fontSize: 22, color: '#1a2744', fontWeight: '700' },
  monthTitle: { fontSize: 18, fontWeight: '800', color: '#1a2744' },
  calendarRow: { flexDirection: 'row', paddingHorizontal: 8 },
  dayHeader: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  dayHeaderText: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  dayCell: { flex: 1, aspectRatio: 1, margin: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e8eef6' },
  dayText: { fontSize: 13, fontWeight: '600', color: '#1a2744' },
  dayTextToday: { color: '#f59e0b', fontWeight: '900' },
  badgeIcon: { fontSize: 8, marginTop: 1 },
  extraDot: { fontSize: 7, color: '#64748b', fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ffffff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#e8eef6' },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#64748b', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a2744', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  noLeaveText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginVertical: 20 },
  requestBtn: { backgroundColor: '#1a2744', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 10 },
  requestBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  leaveCard: { borderWidth: 1.5, borderRadius: 10, padding: 12, marginBottom: 10 },
  leaveUser: { fontSize: 13, fontWeight: '800', color: '#1a2744', marginBottom: 6 },
  leaveCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  leaveTypeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  leaveTypeText: { fontSize: 12, fontWeight: '700' },
  leaveStatus: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  cancelLeaveBtn: { marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#94a3b8', alignItems: 'center' },
  cancelLeaveBtnText: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  leaveTypeOption: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1.5, marginBottom: 8, gap: 10 },
  leaveTypeOptionText: { fontSize: 14, fontWeight: '700' },
  closeBtn: { marginTop: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#e2eaf4', alignItems: 'center' },
  closeBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  pendingCard: { borderWidth: 1.5, borderRadius: 10, padding: 14, marginBottom: 12 },
  pendingName: { fontSize: 15, fontWeight: '800', color: '#1a2744', marginBottom: 4 },
  pendingDate: { fontSize: 13, color: '#64748b', marginBottom: 6 },
  pendingActions: { flexDirection: 'row', gap: 8 },
  approveBtn: { flex: 1, backgroundColor: '#16a34a', padding: 10, borderRadius: 8, alignItems: 'center' },
  approveBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  rejectBtn: { flex: 1, backgroundColor: '#fef2f2', padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  rejectBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  notifCard: { padding: 12, borderRadius: 10, marginBottom: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2eaf4' },
  notifCardUnread: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  notifMessage: { fontSize: 13, fontWeight: '600', color: '#1a2744', marginBottom: 4 },
  notifTime: { fontSize: 11, color: '#94a3b8' },
});
