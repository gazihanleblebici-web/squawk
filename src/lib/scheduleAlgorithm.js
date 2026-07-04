import { supabase } from './supabase';

function timeToMinutes(t) {
  if (!t) return 0;
  const parts = t.split(':').map(Number);
  return parts[0] * 60 + (parts[1] || 0);
}

function minutesToTime(m) {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) {
      result.push([arr[i], ...p]);
    }
  }
  return result;
}

function buildRotation(people, positions, slots) {
  const P = positions.length;
  const posCount = new Map();
  const totalCount = new Map();
  const lastWorked = new Map();

  people.forEach(p => {
    posCount.set(p.id, Object.fromEntries(positions.map(pos => [pos, 0])));
    totalCount.set(p.id, 0);
    lastWorked.set(p.id, -2);
  });

  const assignments = [];
  const allPerms = permutations(positions.map((_, i) => i));

  for (let s = 0; s < slots.length; s++) {
    const slot = slots[s];

    let eligible = people.filter(p => lastWorked.get(p.id) !== s - 1);
    if (eligible.length < P) {
      eligible = [...people].sort((a, b) => lastWorked.get(a.id) - lastWorked.get(b.id));
    }

    eligible = eligible
      .map(p => ({ p, r: Math.random() }))
      .sort((a, b) => {
        const diff = totalCount.get(a.p.id) - totalCount.get(b.p.id);
        if (diff !== 0) return diff;
        return a.r - b.r;
      })
      .map(x => x.p);

    const workers = eligible.slice(0, P);

    let bestCost = Infinity;
    let bestCostTies = [];
    for (const perm of allPerms) {
      let cost = 0;
      for (let wi = 0; wi < workers.length; wi++) {
        const pos = positions[perm[wi]];
        cost += posCount.get(workers[wi].id)[pos];
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestCostTies = [perm];
      } else if (cost === bestCost) {
        bestCostTies.push(perm);
      }
    }
    const bestPerm = bestCostTies[Math.floor(Math.random() * bestCostTies.length)];

    workers.forEach((person, wi) => {
      const pos = positions[bestPerm[wi]];
      assignments.push({ slot, position: pos, person });
      posCount.get(person.id)[pos]++;
      totalCount.set(person.id, totalCount.get(person.id) + 1);
      lastWorked.set(person.id, s);
    });
  }

  return assignments;
}

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
        if (lastSlotIdx[p.id] === s - 1) return false;
        if (isLastSlot && noLastSlot.has(p.id)) return false;
        return true;
      });

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

async function buildDaySchedule({
  scheduleId, activeUsers, ojtiPairs,
  positions, shiftBlocks, chiefTakesBoards,
}) {
  const block = shiftBlocks[0];
  if (!block) return { success: false, error: 'Blok bulunamadi' };

  const startMin = timeToMinutes(block.start_zulu);
  const endMin = timeToMinutes(block.end_zulu);
  const slotCount = Math.round((endMin - startMin) / 60);

  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    slots.push(minutesToTime(startMin + i * 60));
  }

  // Ekip şefi kuralı: rate'li ATC (şef ve OJTI haric) sayisi 10'dan azsa
  // şef de board alir (toplamda 10'a tamamlamak icin). 10 veya fazlaysa şef almaz.
  const ratedCount = activeUsers.filter(u => u.role !== 'chief' && !u.is_ojti).length;
  const autoChiefTakesBoards = ratedCount < 10;

  const boardPeople = activeUsers.filter(u => {
    if (u.role === 'chief' && !autoChiefTakesBoards) return false;
    if (u.is_ojti) return false;
    return true;
  });

  const ojtiUsers = activeUsers.filter(u => u.is_ojti);
  const assignments = buildRotation(boardPeople, positions, slots);

  // OJTI eşleştirmeleri - OJTI her zaman rate'i ile birlikte, her board'da
  const ojtiAssignments = [];
  for (const ojti of ojtiUsers) {
    const pair = ojtiPairs.find(p => p.ojti_user_id === ojti.id);
    if (!pair) continue;
    const rateBoards = assignments.filter(a => a.person.id === pair.rate_user_id);
    rateBoards.forEach(rb => {
      ojtiAssignments.push({ ...rb, ojtiUserId: ojti.id });
    });
  }

  // Pozisyon ID haritası
  const { data: positionsData } = await supabase.from('positions').select('id, code');
  const posMap = {};
  positionsData?.forEach(p => posMap[p.code] = p.id);

  const boardsToInsert = assignments
    .filter(a => posMap[a.position])
    .map(a => {
      const ojtiA = ojtiAssignments.find(oa => oa.slot === a.slot && oa.position === a.position);
      return {
        schedule_id: scheduleId,
        position_id: posMap[a.position],
        user_id: a.person.id,
        ojti_user_id: ojtiA?.ojtiUserId || null,
        start_zulu: a.slot,
        end_zulu: minutesToTime(timeToMinutes(a.slot) + 60),
      };
    });

  if (boardsToInsert.length > 0) {
    await supabase.from('boards').insert(boardsToInsert);
  }

  return { success: true, boardCount: boardsToInsert.length };
}

async function buildNightSchedule({
  scheduleId, activeUsers, ojtiPairs,
  positions, shiftBlocks, isOffsetMorning, chiefTakesBoards,
}) {
  const block1 = shiftBlocks.find(b => b.display_type === 'hourly_table');
  const block2 = shiftBlocks.find(b => b.name === 'Gececi');
  const block3 = shiftBlocks.find(b => b.name === 'Araci');
  const block4 = shiftBlocks.find(b => b.display_type === 'offset_timeline' || b.name === 'Sabahci');

  if (!block1) return { success: false, error: '1. blok bulunamadi' };

  const boardPeople = activeUsers.filter(u => {
    if (u.role === 'chief' && !chiefTakesBoards) return false;
    if (u.is_ojti) return false;
    return true;
  });
  const n = boardPeople.length;

  // Shuffle
  const shuffled = [...boardPeople].sort(() => Math.random() - 0.5);

const sabahciCount = n >= 9 ? 5 : n >= 7 ? 4 : Math.max(2, Math.floor(n * 0.4));
  const sabahcilar = shuffled.slice(0, sabahciCount);
  const gececilar = shuffled.slice(sabahciCount, sabahciCount + 2);
  const aracilar = shuffled.slice(sabahciCount + 2, sabahciCount + 4);

  const noLastSlot = new Set(gececilar.map(p => p.id));
  const preferNoLastSlot = new Set(aracilar.map(p => p.id));

  // Blok 1 slotları
  const b1Start = timeToMinutes(block1.start_zulu);
  const b1End = timeToMinutes(block1.end_zulu);
  const b1SlotCount = Math.round((b1End - b1Start) / 60);
  const b1Slots = [];
  for (let i = 0; i < b1SlotCount; i++) {
    b1Slots.push(minutesToTime(b1Start + i * 60));
  }

  const b1Assignments = buildRotationWithConstraints(
    boardPeople, positions, b1Slots, noLastSlot, preferNoLastSlot
  );

  // Gececi boardları
  const gececiBoards = [];
  const gececiPositions = ['YWU', 'PLN'].filter(p => positions.includes(p));
  if (block2) {
    gececilar.forEach((person, idx) => {
      if (idx < gececiPositions.length) {
        gececiBoards.push({
          posCode: gececiPositions[idx],
          start_zulu: block2.start_zulu,
          end_zulu: block2.end_zulu,
          user_id: person.id,
        });
      }
    });
  }

  // Aracı boardları
  const araciBoards = [];
  const araciPositions = ['YWU', 'PLN'].filter(p => positions.includes(p));
  if (block3) {
    aracilar.forEach((person, idx) => {
      if (idx < araciPositions.length) {
        araciBoards.push({
          posCode: araciPositions[idx],
          start_zulu: block3.start_zulu,
          end_zulu: block3.end_zulu,
          user_id: person.id,
        });
      }
    });
  }

  // Sabahçı boardları - 15dk offset, 45dk slot
  const sabahciBoards = [];
  if (block4) {
    const SLOT = 45;
    const OFFSET = 15;
    const START_BASE = 2 * 60 + 30;  // 02:30
    const END = 6 * 60;              // 06:00
    const POS_ALL = ['YWU', 'PLN', 'YZA', 'YZC'].filter(p => positions.includes(p));

    if (isOffsetMorning) {
      POS_ALL.forEach((pos, posIdx) => {
        let currentTime = START_BASE + posIdx * OFFSET;
        let queueIdx = posIdx;

        while (currentTime < END) {
          const person = sabahcilar[queueIdx % sabahcilar.length];
          const endTime = Math.min(currentTime + SLOT, END);
          sabahciBoards.push({
            posCode: pos,
            start_zulu: minutesToTime(currentTime),
            end_zulu: minutesToTime(endTime),
            user_id: person.id,
          });
          currentTime += SLOT;
          queueIdx++;
        }
      });
    } else {
      POS_ALL.forEach((pos, idx) => {
        if (idx < sabahcilar.length) {
          sabahciBoards.push({
            posCode: pos,
            start_zulu: block4.start_zulu,
            end_zulu: block4.end_zulu,
            user_id: sabahcilar[idx].id,
          });
        }
      });
    }
  }
  // Pozisyon haritası
  const { data: positionsData } = await supabase.from('positions').select('id, code');
  const posMap = {};
  positionsData?.forEach(p => posMap[p.code] = p.id);

  const boardsToInsert = [
    ...b1Assignments
      .filter(a => posMap[a.position])
      .map(a => ({
        schedule_id: scheduleId,
        position_id: posMap[a.position],
        user_id: a.person.id,
        ojti_user_id: null,
        start_zulu: a.slot,
        end_zulu: minutesToTime(timeToMinutes(a.slot) + 60),
      })),
    ...[...gececiBoards, ...araciBoards, ...sabahciBoards]
      .filter(b => posMap[b.posCode])
      .map(b => ({
        schedule_id: scheduleId,
        position_id: posMap[b.posCode],
        user_id: b.user_id,
        ojti_user_id: null,
        start_zulu: b.start_zulu,
        end_zulu: b.end_zulu,
      })),
  ];

  if (boardsToInsert.length > 0) {
    await supabase.from('boards').insert(boardsToInsert);
  }

  if (isOffsetMorning) {
    await supabase.from('schedules').update({ is_offset_morning: true }).eq('id', scheduleId);
  }

  return { success: true, boardCount: boardsToInsert.length };
}

export async function generateSchedule({
  scheduleId, scheduleDate, shiftType, airportId,
  chiefTakesBoards = false, chiefBoardCount = 0,
  isOffsetMorning = false,
}) {
  // Kullanıcıları çek
  const { data: allUsers } = await supabase
    .from('users')
    .select('*')
    .eq('airport_id', airportId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // Durum kayıtları
  const { data: statuses } = await supabase
    .from('user_day_status')
    .select('*')
    .eq('status_date', scheduleDate);

  const statusMap = {};
  statuses?.forEach(s => statusMap[s.user_id] = s.status);

  const activeUsers = (allUsers || []).filter(u => {
    const status = statusMap[u.id] || 'active';
    return status === 'active' || status === 'hourly_leave';
  });

  // AIT belirle
  const nonChiefUsers = activeUsers.filter(u => u.role !== 'chief' && !u.is_ojti);

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

  await supabase.from('schedules').update({ ait_user_id: aitUserId }).eq('id', scheduleId);

  // OJTI çiftleri
  const { data: ojtiPairs } = await supabase
    .from('ojti_pairs')
    .select('*')
    .eq('is_active', true);

  // Pozisyonlar
  const { data: positionsData } = await supabase
    .from('positions')
    .select('*')
    .order('id', { ascending: true });

  const positions = (positionsData || []).map(p => p.code);

  // Shift template ve bloklar
  const { data: shiftTemplate } = await supabase
    .from('shift_templates')
    .select('id')
    .eq('airport_id', airportId)
    .eq('shift_type', shiftType)
    .single();

  if (!shiftTemplate) throw new Error('Shift template bulunamadi');

  const { data: shiftBlocks } = await supabase
    .from('shift_blocks')
    .select('*')
    .eq('shift_template_id', shiftTemplate.id)
    .order('block_order', { ascending: true });

  if (shiftType === 'day') {
    return buildDaySchedule({
      scheduleId, scheduleDate, airportId,
      chiefTakesBoards, chiefBoardCount,
      activeUsers, ojtiPairs: ojtiPairs || [],
      positions, shiftBlocks: shiftBlocks || [],
      aitUserId,
    });
  } else {
    return buildNightSchedule({
      scheduleId, scheduleDate, airportId,
      activeUsers, ojtiPairs: ojtiPairs || [],
      positions, shiftBlocks: shiftBlocks || [],
      isOffsetMorning, chiefTakesBoards, aitUserId,
    });
  }
}