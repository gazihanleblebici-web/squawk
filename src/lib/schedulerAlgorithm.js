// SQUAWK - Otomatik Program Oluşturma Algoritması
// Gündüz ve Gece Shift Desteği

import { supabase } from './supabase';

// ─── YARDIMCI FONKSİYONLAR ───────────────────────────────────────────────────

function timeToMinutes(t) {
  const [h, m] = t.replace(':00', '').split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
}

// Rotasyon: her kişi her pozisyonda eşit süre geçirir
function buildRotation(people, positions, slots) {
  const assignments = []; // [{slot, position, person}]
  const posCount = {}; // kişi başı pozisyon sayısı
  const lastSlot = {}; // kişinin son board aldığı slot index'i

  people.forEach(p => {
    posCount[p.id] = {};
    positions.forEach(pos => posCount[p.id][pos] = 0);
    lastSlot[p.id] = -2; // başlangıçta 2 slot önce çalıştı gibi
  });

  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    const assigned = new Set(); // bu slotta atanan kişiler

    for (const pos of positions) {
      // Bu pozisyon için uygun kişileri bul
      const candidates = people.filter(p => {
        if (assigned.has(p.id)) return false; // bu slotta başka pozisyonda
        if (lastSlot[p.id] === s - 1) return false; // arka arkaya board
        return true;
      });

      if (candidates.length === 0) continue;

      // En az bu pozisyonda çalışmış kişiyi seç
      candidates.sort((a, b) => {
        const diff = (posCount[a.id][pos] || 0) - (posCount[b.id][pos] || 0);
        if (diff !== 0) return diff;
        // Eşitse toplam board sayısı az olanı tercih et
        const totalA = Object.values(posCount[a.id]).reduce((x,y) => x+y, 0);
        const totalB = Object.values(posCount[b.id]).reduce((x,y) => x+y, 0);
        return totalA - totalB;
      });

      const person = candidates[0];
      assignments.push({ slot, position: pos, person });
      assigned.add(person.id);
      posCount[person.id][pos] = (posCount[person.id][pos] || 0) + 1;
      lastSlot[person.id] = s;
    }
  }

  return assignments;
}

// ─── GÜNDÜZ ALGORİTMASI ──────────────────────────────────────────────────────

async function buildDaySchedule({
  scheduleId,
  scheduleDate,
  airportId,
  chiefTakesBoards,
  chiefBoardCount,
  activeUsers,
  ojtiPairs,
  positions,
  shiftBlocks,
  aitUserId,
}) {
  const block = shiftBlocks[0]; // Gündüz tek blok
  const startMin = timeToMinutes(block.start_zulu); // 06:00
  const endMin = timeToMinutes(block.end_zulu);     // 16:00
  const slotCount = (endMin - startMin) / 60;       // 10 saat

  // Saat slotları
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push(minutesToTime(startMin + i * 60));
  }

  // Board alacak kişileri belirle
  let boardPeople = activeUsers.filter(u => {
    if (u.role === 'chief' && !chiefTakesBoards) return false;
    if (u.is_ojti) return false; // OJTI'lar ayrı ele alınır
    return true;
  });

  // Şef board alacaksa slotları sınırla
  if (chiefTakesBoards) {
    // Şef sadece belirtilen sayıda board alacak — algoritma kendisi dağıtır
  }

  // OJTI kişilerini bul ve eşleştir
  const ojtiUsers = activeUsers.filter(u => u.is_ojti);

  // Rotasyon oluştur
  const assignments = buildRotation(boardPeople, positions, slots);

  // OJTI atamalarını ekle
  const ojtiAssignments = [];
  for (const ojti of ojtiUsers) {
    const pair = ojtiPairs.find(p => p.ojti_user_id === ojti.id);
    if (!pair) continue;

    // OJTI'nın eşi olan rate'li kişinin board'larını bul
    const rateBoards = assignments.filter(a => a.person.id === pair.rate_user_id);

    // Her rate boarduna OJTI'yı eşleştir (ama arka arkaya olmasın)
    rateBoards.forEach((rb, idx) => {
      if (idx % 2 === 0) { // her iki boardda bir OJTI ile çalışsın
        ojtiAssignments.push({
          ...rb,
          ojtiUserId: ojti.id,
        });
      }
    });
  }

  // Veritabanına kaydet
  const boardsToInsert = [];

  for (const a of assignments) {
    const startZulu = a.slot;
    const endZulu = minutesToTime(timeToMinutes(startZulu) + 60);
    const ojtiAssignment = ojtiAssignments.find(
      oa => oa.slot === a.slot && oa.position === a.position
    );

    // Pozisyon ID'sini bul
    const { data: posData } = await supabase
      .from('positions')
      .select('id')
      .eq('code', a.position)
      .single();

    if (!posData) continue;

    boardsToInsert.push({
      schedule_id: scheduleId,
      position_id: posData.id,
      user_id: a.person.id,
      ojti_user_id: ojtiAssignment?.ojtiUserId || null,
      start_zulu: startZulu,
      end_zulu: endZulu,
    });
  }

  if (boardsToInsert.length > 0) {
    await supabase.from('boards').insert(boardsToInsert);
  }

  return { success: true, boardCount: boardsToInsert.length };
}

// ─── GECE ALGORİTMASI ────────────────────────────────────────────────────────

async function buildNightSchedule({
  scheduleId,
  scheduleDate,
  airportId,
  activeUsers,
  ojtiPairs,
  positions,
  shiftBlocks,
  isOffsetMorning,
  aitUserId,
}) {
  const block1 = shiftBlocks.find(b => b.display_type === 'hourly_table');
  const block2 = shiftBlocks.find(b => b.name === 'Gececi');
  const block3 = shiftBlocks.find(b => b.name === 'Araci');
  const block4 = shiftBlocks.find(b => b.display_type === 'offset_timeline' || b.name === 'Sabahci');

  const boardPeople = activeUsers.filter(u => !u.is_ojti);

  // ── BLOK 1: 16-21Z Saatlik rotasyon ──
  const b1Start = timeToMinutes(block1.start_zulu);
  const b1End = timeToMinutes(block1.end_zulu);
  const b1SlotCount = (b1End - b1Start) / 60;
  const b1Slots = [];
  for (let i = 0; i < b1SlotCount; i++) {
    b1Slots.push(minutesToTime(b1Start + i * 60));
  }
  const lastSlotTime = b1Slots[b1Slots.length - 1]; // 20:00

  // Rol atamaları: gececi, aracı, sabahçı
  // Toplam kişi sayısına göre dağıt
  const n = boardPeople.length;
  const shuffled = [...boardPeople].sort(() => Math.random() - 0.5);

  // Sabahçı: 2-3 kişi (1. blok son saatine girebilir)
  const sabahciCount = Math.max(2, Math.min(3, Math.floor(n * 0.25)));
  const sabahcilar = shuffled.slice(0, sabahciCount);

  // Gececi: 2 kişi (son saate giremez)
  const gececilar = shuffled.slice(sabahciCount, sabahciCount + 2);

  // Aracı: 2 kişi (tercihen son saate girmesin)
  const aracilar = shuffled.slice(sabahciCount + 2, sabahciCount + 4);

  // 1. blok son saatine giremeyecek kişiler
  const noLastSlot = new Set([...gececilar.map(p => p.id)]);
  const preferNoLastSlot = new Set([...aracilar.map(p => p.id)]);

  // 1. blok rotasyonu — son slot kısıtlamalı
  const b1Assignments = buildRotationWithConstraints(
    boardPeople, positions, b1Slots, noLastSlot, preferNoLastSlot
  );

  // ── BLOK 2: Gececi 21-00Z ──
  const gececiBoards = [];
  const gececiPositions = ['YWU', 'PLN'].filter(p => positions.includes(p));
  gececilar.forEach((person, idx) => {
    if (idx < gececiPositions.length) {
      gececiBoards.push({
        slot: block2.start_zulu,
        endSlot: block2.end_zulu,
        position: gececiPositions[idx],
        person,
      });
    }
  });

  // ── BLOK 3: Aracı 00-02:30Z ──
  const araciBoards = [];
  const araciPositions = ['YWU', 'PLN'].filter(p => positions.includes(p));
  aracilar.forEach((person, idx) => {
    if (idx < araciPositions.length) {
      araciBoards.push({
        slot: block3.start_zulu,
        endSlot: block3.end_zulu,
        position: araciPositions[idx],
        person,
      });
    }
  });

  // ── BLOK 4: Sabahçı 02:30-06Z ──
  const sabahciBoards = [];
  if (block4) {
    const b4Start = timeToMinutes(block4.start_zulu);
    const b4End = 6 * 60; // 06:00
    const b4Total = b4End - b4Start; // 210 dakika
    const perPerson = Math.floor(b4Total / sabahcilar.length);
    const b4Positions = positions.slice(0, Math.min(positions.length, sabahcilar.length + 1));

    if (isOffsetMorning) {
      // Kaydırmalı: her pozisyon için sabahçıları dağıt
      b4Positions.forEach((pos, posIdx) => {
        sabahcilar.forEach((person, personIdx) => {
          const startMin = b4Start + personIdx * perPerson;
          const endMin = personIdx === sabahcilar.length - 1 ? b4End : startMin + perPerson;
          sabahciBoards.push({
            slot: minutesToTime(startMin),
            endSlot: minutesToTime(endMin),
            position: pos,
            person: sabahcilar[(personIdx + posIdx) % sabahcilar.length],
          });
        });
      });
    } else {
      // Sabit: tek blok her pozisyon için bir kişi
      b4Positions.forEach((pos, idx) => {
        if (idx < sabahcilar.length) {
          sabahciBoards.push({
            slot: block4.start_zulu,
            endSlot: block4.end_zulu,
            position: pos,
            person: sabahcilar[idx],
          });
        }
      });
    }
  }

  // ── VERİTABANINA KAYDET ──
  const allBoards = [
    ...b1Assignments.map(a => ({
      schedule_id: scheduleId,
      start_zulu: a.slot,
      end_zulu: minutesToTime(timeToMinutes(a.slot) + 60),
      posCode: a.position,
      user_id: a.person.id,
    })),
    ...gececiBoards.map(b => ({
      schedule_id: scheduleId,
      start_zulu: b.slot,
      end_zulu: b.endSlot,
      posCode: b.position,
      user_id: b.person.id,
    })),
    ...araciBoards.map(b => ({
      schedule_id: scheduleId,
      start_zulu: b.slot,
      end_zulu: b.endSlot,
      posCode: b.position,
      user_id: b.person.id,
    })),
    ...sabahciBoards.map(b => ({
      schedule_id: scheduleId,
      start_zulu: b.slot,
      end_zulu: b.endSlot,
      posCode: b.position,
      user_id: b.person.id,
    })),
  ];

  // Pozisyon ID'lerini çek
  const { data: positionsData } = await supabase
    .from('positions')
    .select('id, code');

  const posMap = {};
  positionsData?.forEach(p => posMap[p.code] = p.id);

  const boardsToInsert = allBoards
    .filter(b => posMap[b.posCode])
    .map(b => ({
      schedule_id: b.schedule_id,
      position_id: posMap[b.posCode],
      user_id: b.user_id,
      start_zulu: b.start_zulu,
      end_zulu: b.end_zulu,
      ojti_user_id: null,
    }));

  if (boardsToInsert.length > 0) {
    await supabase.from('boards').insert(boardsToInsert);
  }

  // Schedule'a is_offset_morning kaydet
  await supabase.from('schedules').update({ is_offset_morning: isOffsetMorning }).eq('id', scheduleId);

  return { success: true, boardCount: boardsToInsert.length };
}

// ─── KISITLAMALI ROTASYON ─────────────────────────────────────────────────────

function buildRotationWithConstraints(people, positions, slots, noLastSlot, preferNoLastSlot) {
  const assignments = [];
  const posCount = {};
  const lastSlotIdx = {};

  people.forEach(p => {
    posCount[p.id] = {};
    positions.forEach(pos => posCount[p.id][pos] = 0);
    lastSlotIdx[p.id] = -2;
  });

  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];
    const isLastSlot = s === slots.length - 1;
    const assigned = new Set();

    for (const pos of positions) {
      let candidates = people.filter(p => {
        if (assigned.has(p.id)) return false;
        if (lastSlotIdx[p.id] === s - 1) return false; // arka arkaya
        if (isLastSlot && noLastSlot.has(p.id)) return false; // gececi son slota giremez
        return true;
      });

      // Son slotta aracıları tercih etme
      if (isLastSlot && candidates.length > 2) {
        const preferred = candidates.filter(p => !preferNoLastSlot.has(p.id));
        if (preferred.length > 0) candidates = preferred;
      }

      if (candidates.length === 0) continue;

      candidates.sort((a, b) => {
        const diff = (posCount[a.id][pos] || 0) - (posCount[b.id][pos] || 0);
        if (diff !== 0) return diff;
        const totalA = Object.values(posCount[a.id]).reduce((x,y) => x+y, 0);
        const totalB = Object.values(posCount[b.id]).reduce((x,y) => x+y, 0);
        return totalA - totalB;
      });

      const person = candidates[0];
      assignments.push({ slot, position: pos, person });
      assigned.add(person.id);
      posCount[person.id][pos] = (posCount[person.id][pos] || 0) + 1;
      lastSlotIdx[person.id] = s;
    }
  }

  return assignments;
}

// ─── ANA FONKSİYON ───────────────────────────────────────────────────────────

export async function generateSchedule({
  scheduleId,
  scheduleDate,
  shiftType,
  airportId,
  chiefTakesBoards = false,
  chiefBoardCount = 0,
  isOffsetMorning = false,
}) {
  // Aktif kullanıcıları çek
  const { data: allUsers } = await supabase
    .from('users')
    .select('*')
    .eq('airport_id', airportId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // Bugünkü durum kayıtlarını çek
  const { data: statuses } = await supabase
    .from('user_day_status')
    .select('*')
    .eq('status_date', scheduleDate);

  const statusMap = {};
  statuses?.forEach(s => statusMap[s.user_id] = s.status);

  // Aktif kişileri filtrele (izinli, raporlu vs. çıkar)
  const activeUsers = allUsers?.filter(u => {
    const status = statusMap[u.id] || 'active';
    return status === 'active' || status === 'hourly_leave';
  }) || [];

  // AIT kişisini belirle (ekip şefi hariç, display_order'a göre sırayla)
  const nonChiefUsers = activeUsers.filter(u => u.role !== 'chief' && !u.is_ojti);

  // Önceki AIT'yi bul — kim sırada
  const { data: lastAit } = await supabase
    .from('schedules')
    .select('ait_user_id')
    .eq('airport_id', airportId)
    .not('ait_user_id', 'is', null)
    .order('schedule_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  let aitUserId = null;
  if (nonChiefUsers.length > 0) {
    if (!lastAit?.ait_user_id) {
      aitUserId = nonChiefUsers[0].id;
    } else {
      const lastIdx = nonChiefUsers.findIndex(u => u.id === lastAit.ait_user_id);
      aitUserId = nonChiefUsers[(lastIdx + 1) % nonChiefUsers.length].id;
    }
  }

  // AIT'yi schedule'a kaydet
  await supabase.from('schedules').update({ ait_user_id: aitUserId }).eq('id', scheduleId);

  // OJTI çiftlerini çek
  const { data: ojtiPairs } = await supabase
    .from('ojti_pairs')
    .select('*')
    .eq('is_active', true);

  // Pozisyonları çek
  const { data: positionsData } = await supabase
    .from('positions')
    .select('*')
    .order('id', { ascending: true });

  const positions = positionsData?.map(p => p.code) || [];

  // Shift bloklarını çek
  const { data: shiftTemplate } = await supabase
    .from('shift_templates')
    .select('id')
    .eq('airport_id', airportId)
    .eq('shift_type', shiftType)
    .single();

  const { data: shiftBlocks } = await supabase
    .from('shift_blocks')
    .select('*')
    .eq('shift_template_id', shiftTemplate.id)
    .order('block_order', { ascending: true });

  if (shiftType === 'day') {
    return buildDaySchedule({
      scheduleId, scheduleDate, airportId,
      chiefTakesBoards, chiefBoardCount,
      activeUsers, ojtiPairs,
      positions, shiftBlocks, aitUserId,
    });
  } else {
    return buildNightSchedule({
      scheduleId, scheduleDate, airportId,
      activeUsers, ojtiPairs,
      positions, shiftBlocks,
      isOffsetMorning, aitUserId,
    });
  }
}