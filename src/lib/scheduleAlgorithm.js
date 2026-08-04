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

function buildRotationCore(people, positions, slots, noLastSlot, preferNoLastSlot) {
  const P = positions.length;
  const N = people.length;
  const lastIdx = slots.length - 1;

  let abstractQueue = Array.from({ length: N }, (_, i) => i);
  let lastSlotIndices = new Set();
  for (let s = 0; s <= lastIdx; s++) {
    const workers = abstractQueue.slice(0, P);
    if (s === lastIdx) lastSlotIndices = new Set(workers);
    abstractQueue = [...abstractQueue.slice(P), ...workers];
  }

  const gececiList = people.filter(p => noLastSlot.has(p.id)).sort(() => Math.random() - 0.5);
  const nonGececi = people.filter(p => !noLastSlot.has(p.id)).sort(() => Math.random() - 0.5);

  const safeIndices = [];
  const unsafeIndices = [];
  for (let i = 0; i < N; i++) {
    if (lastSlotIndices.has(i)) unsafeIndices.push(i); else safeIndices.push(i);
  }

  const initialOrder = new Array(N);
  let gi = 0, ni = 0;
  for (const idx of safeIndices) {
    if (gi < gececiList.length) initialOrder[idx] = gececiList[gi++];
  }
  const remainingIndices = [...safeIndices.filter(idx => initialOrder[idx] === undefined), ...unsafeIndices];
  for (const idx of remainingIndices) {
    if (ni < nonGececi.length) initialOrder[idx] = nonGececi[ni++];
  }
  while (gi < gececiList.length) {
    const emptyIdx = initialOrder.findIndex(x => x === undefined);
    initialOrder[emptyIdx] = gececiList[gi++];
  }

  const posCount = new Map();
  const lastWorked = new Map();
  people.forEach(p => {
    posCount.set(p.id, Object.fromEntries(positions.map(pos => [pos, 0])));
    lastWorked.set(p.id, -2);
  });

  const allPerms = permutations(positions.map((_, i) => i));
  const assignments = [];
  let queue = [...initialOrder];

  for (let s = 0; s <= lastIdx; s++) {
    const slot = slots[s];
    let workers = queue.slice(0, P);

    if (s === lastIdx) {
      const hasGececi = workers.some(w => noLastSlot.has(w.id));
      if (hasGececi) {
        for (let wi = 0; wi < workers.length; wi++) {
          if (noLastSlot.has(workers[wi].id)) {
            const currentIds = new Set(workers.map(w => w.id));
            let replacement = queue.find(p => !currentIds.has(p.id) && !noLastSlot.has(p.id) && lastWorked.get(p.id) !== s - 1);
            if (!replacement) replacement = queue.find(p => !currentIds.has(p.id) && !noLastSlot.has(p.id));
            if (replacement) workers[wi] = replacement;
          }
        }
      }

      if (preferNoLastSlot.size > 0) {
        const hasAraci = workers.some(w => preferNoLastSlot.has(w.id));
        if (hasAraci) {
          for (let wi = 0; wi < workers.length; wi++) {
            if (preferNoLastSlot.has(workers[wi].id)) {
              const currentIds = new Set(workers.map(w => w.id));
              const replacement = queue.find(p =>
                !currentIds.has(p.id) && !noLastSlot.has(p.id) && !preferNoLastSlot.has(p.id) &&
                lastWorked.get(p.id) !== s - 1
              );
              if (replacement) workers[wi] = replacement;
            }
          }
        }
      }
    }

    let bestCost = Infinity;
    let bestCostTies = [];
    for (const perm of allPerms) {
      let cost = 0;
      for (let wi = 0; wi < workers.length; wi++) {
        cost += posCount.get(workers[wi].id)[positions[perm[wi]]];
      }
      if (cost < bestCost) {
        bestCost = cost;
        bestCostTies = [perm];
      } else if (cost === bestCost) {
        bestCostTies.push(perm);
      }
    }
    const bestPerm = bestCostTies[Math.floor(Math.random() * bestCostTies.length)];

   if (s === lastIdx && preferNoLastSlot.size > 0) {
      const araciWorkers = workers.filter(w => preferNoLastSlot.has(w.id));
      const preferredPos = ['YZC_PLN', 'YZC'].filter(p => positions.includes(p));
      if (araciWorkers.length > 0 && araciWorkers.length <= preferredPos.length) {
        const finalAssign = {};
        araciWorkers.forEach((person) => {
          const usablePos = preferredPos.find(p => !finalAssign[p] && (posCount.get(person.id)[p] || 0) === 0);
          const fallbackPos = preferredPos.find(p => !finalAssign[p]);
          const assignPos = usablePos || fallbackPos;
          if (assignPos) finalAssign[assignPos] = person;
        });
        const nonAraciWorkers = workers.filter(w => !preferNoLastSlot.has(w.id));
        const remainingPos = positions.filter(p => !finalAssign[p]);
        nonAraciWorkers.forEach((person, wi) => {
          if (wi < remainingPos.length) finalAssign[remainingPos[wi]] = person;
        });
        Object.entries(finalAssign).forEach(([pos, person]) => {
          if (person) {
            assignments.push({ slot, position: pos, person });
            posCount.get(person.id)[pos]++;
            lastWorked.set(person.id, s);
          }
        });
      } else {
        workers.forEach((person, wi) => {
          const pos = positions[bestPerm[wi]];
          assignments.push({ slot, position: pos, person });
          posCount.get(person.id)[pos]++;
          lastWorked.set(person.id, s);
        });
      }
    } else {
      workers.forEach((person, wi) => {
        const pos = positions[bestPerm[wi]];
        assignments.push({ slot, position: pos, person });
        posCount.get(person.id)[pos]++;
        lastWorked.set(person.id, s);
      });
    }

    const workerIds = new Set(workers.map(w => w.id));
    queue = [...queue.filter(p => !workerIds.has(p.id)), ...workers];
  }

  return assignments;
}

function buildRotation(people, positions, slots) {
  return buildRotationCore(people, positions, slots, new Set(), new Set());
}

function buildRotationWithConstraints(people, positions, slots, noLastSlot, preferNoLastSlot) {
  return buildRotationCore(people, positions, slots, noLastSlot, preferNoLastSlot);
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
    if (u.day_only) return false; // Sadece gunduz planlanacak kisiler gece dahil degil
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

  // Sabahçı boardları - esnek süre, boşluksuz rotasyon
  const sabahciBoards = [];
  if (block4) {
    const REST = 15;
    const MIN_BOARD = 30;
    const MAX_BOARD = 75;
    const DIFF_THRESHOLD = 30;
    const START_BASE = 2 * 60 + 30;
    const END = 6 * 60;
    const YZC_OPEN = 3 * 60;
    const POS_ALL = ['YWU', 'PLN', 'YZA', 'YZC'].filter(p => positions.includes(p));

    if (isOffsetMorning && sabahcilar.length >= 5) {
      const workTime = {};
      const posUsed = {};
      const restQueue = [];
      sabahcilar.forEach(p => { workTime[p.id] = 0; posUsed[p.id] = new Set(); });

      // Baslangic: ilk 3 kisi YWU, PLN, YZA yi 02:30 da alir
      const active = { YWU: null, PLN: null, YZA: null, YZC: null };
      const startedAt = { YWU: 0, PLN: 0, YZA: 0, YZC: 0 };

      const initPos = ['YWU', 'PLN', 'YZA'];
      initPos.forEach((pos, i) => {
        const p = sabahcilar[i];
        active[pos] = p;
        startedAt[pos] = START_BASE;
        posUsed[p.id].add(pos);
      });

      // 4. kisi (D) YZC yi 03:00 da alir
      const personD = sabahcilar[3];
      // 5. kisi (E) 03:00 da bekleme kuyruğuna girer
      const personE = sabahcilar[4];

      for (let t = START_BASE + REST; t <= END; t += REST) {
        // YZC 03:00 da acilir
        if (t === YZC_OPEN && !active.YZC) {
          active.YZC = personD;
          startedAt.YZC = t;
          posUsed[personD.id].add('YZC');
        }

        // E yi 03:00 da kuyruga ekle
        if (t === YZC_OPEN && !restQueue.find(r => r.person.id === personE.id)) {
          restQueue.push({ person: personE, availableAt: t });
        }

        // Her pozisyon icin swap kontrolu
        // PLN son sirada islenir - uzun board gerekirse PLN oncelikli kalsin
        const posOrder = [...POS_ALL].sort((a, b) => {
          if (a === 'PLN') return 1;
          if (b === 'PLN') return -1;
          return 0;
        });

        for (const pos of posOrder) {
          if (!active[pos]) continue;
          const currentPerson = active[pos];
          const elapsed = t - startedAt[pos];
          if (elapsed < MIN_BOARD) continue;

          const waiting = restQueue.filter(r =>
            r.availableAt <= t &&
            !posUsed[r.person.id].has(pos) &&
            !Object.values(active).some(a => a && a.id === r.person.id)
          );
          if (waiting.length === 0) continue;

          waiting.sort((a, b) => workTime[a.person.id] - workTime[b.person.id]);

          const currentWork = workTime[currentPerson.id] + elapsed;
          const nextWork = workTime[waiting[0].person.id];
          const softMax = pos === 'PLN' ? 90 : 75;
const shouldSwap = elapsed >= softMax || (currentWork - nextWork >= DIFF_THRESHOLD);
if (!shouldSwap) continue;
if (elapsed >= 90 && waiting.length === 0) {
  const anyWaiting = sabahcilar.filter(p =>
    p.id !== currentPerson.id &&
    !Object.values(active).some(a => a && a.id === p.id)
  );
  if (anyWaiting.length > 0) {
    anyWaiting.sort((a, b) => workTime[a.id] - workTime[b.id]);
    const forcedIn = anyWaiting[0];
    sabahciBoards.push({ posCode: pos, start_zulu: minutesToTime(startedAt[pos]), end_zulu: minutesToTime(t), user_id: currentPerson.id });
    workTime[currentPerson.id] += elapsed;
    restQueue.push({ person: currentPerson, availableAt: t + REST });
    active[pos] = forcedIn; startedAt[pos] = t; posUsed[forcedIn.id].add(pos);
  }
  continue;
} (currentWork - nextWork >= DIFF_THRESHOLD);
          if (!shouldSwap) continue;

          const outPerson = currentPerson;
          const inPerson = waiting[0].person;

          sabahciBoards.push({
            posCode: pos,
            start_zulu: minutesToTime(startedAt[pos]),
            end_zulu: minutesToTime(t),
            user_id: outPerson.id,
          });
          workTime[outPerson.id] += elapsed;
          restQueue.push({ person: outPerson, availableAt: t + REST });
          restQueue.splice(restQueue.indexOf(waiting[0]), 1);

          active[pos] = inPerson;
          startedAt[pos] = t;
          posUsed[inPerson.id].add(pos);
        }
      }

      // Acik boardlari kapat
      for (const pos of POS_ALL) {
        if (active[pos]) {
          sabahciBoards.push({
            posCode: pos,
            start_zulu: minutesToTime(startedAt[pos]),
            end_zulu: minutesToTime(END),
            user_id: active[pos].id,
          });
        }
      }
    } else {
      // Kaydirmasiz mod: sabit blok
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

  // OJTI eslestirmeleri - gece Ana Nobet icin de her zaman rate ile birlikte
  const ojtiUsersNight = activeUsers.filter(u => u.is_ojti);
  const ojtiAssignmentsNight = [];
  for (const ojti of ojtiUsersNight) {
    const pair = ojtiPairs.find(p => p.ojti_user_id === ojti.id);
    if (!pair) continue;
    const rateBoards = b1Assignments.filter(a => a.person.id === pair.rate_user_id);
    rateBoards.forEach(rb => {
      ojtiAssignmentsNight.push({ ...rb, ojtiUserId: ojti.id });
    });
  }

  const boardsToInsert = [
    ...b1Assignments
      .filter(a => posMap[a.position])
      .map(a => {
        const ojtiA = ojtiAssignmentsNight.find(oa => oa.slot === a.slot && oa.position === a.position);
        return {
          schedule_id: scheduleId,
          position_id: posMap[a.position],
          user_id: a.person.id,
          ojti_user_id: ojtiA?.ojtiUserId || null,
          start_zulu: a.slot,
          end_zulu: minutesToTime(timeToMinutes(a.slot) + 60),
        };
      }),
    ...[...gececiBoards, ...araciBoards, ...sabahciBoards]
      .filter(b => posMap[b.posCode])
      .map(b => {
        const ojtiPair = ojtiPairs.find(p => p.rate_user_id === b.user_id);
        const ojtiMatch = ojtiPair ? ojtiUsersNight.find(o => o.id === ojtiPair.ojti_user_id) : null;
        return {
          schedule_id: scheduleId,
          position_id: posMap[b.posCode],
          user_id: b.user_id,
          ojti_user_id: ojtiMatch ? ojtiMatch.id : null,
          start_zulu: b.start_zulu,
          end_zulu: b.end_zulu,
        };
      }),
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