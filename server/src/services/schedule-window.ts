// Da li je raspored (bedtime) aktivan u datom trenutku — na serveru.
//
// Isti račun postoji i u panelu (src/app/core/services/schedule.ts).
// Namjerno je prepisan, a ne dijeljen: panel i server su dva zasebna
// TypeScript projekta sa svojim tsconfig-om, pa bi dijeljenje tražilo
// zajednički paket. Za POC je to više posla nego koristi, ali JESTE
// dupliranje i tako ga treba tretirati — ako se pravila rasporeda
// promijene, mijenjaju se na dva mjesta. Ako raspored dobije još
// pravila, ovo je prvo što treba izdvojiti u zajednički paket.
//
// Jedina stvarna razlika prema verziji u panelu: ovdje se vrijeme
// računa u vremenskoj zoni naloga, jer server ne živi u istoj zoni
// kao porodica (vidi migraciju 012).

export interface ScheduleDay {
  label: string;
  selected: boolean;
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
}

export interface DeviceSchedule {
  enabled: boolean;
  mode: 'sameEveryDay' | 'perDay';
  startHour: string;
  startMinute: string;
  endHour: string;
  endMinute: string;
  days: ScheduleDay[];
}

interface DayWindow {
  start: number;
  end: number;
}

/** Redoslijed odgovara Date.getDay() i `weekday: 'short'` u en-US. */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toMinutes(hour: string, minute: string): number {
  return Number(hour) * 60 + Number(minute);
}

/**
 * Dan u sedmici i minuta u danu, u zadatoj vremenskoj zoni.
 *
 * Nepoznata zona (npr. pregledač koji je poslao nešto neočekivano)
 * ne smije oboriti zahtjev, pa se pada nazad na vrijeme servera.
 */
export function localParts(at: Date, timeZone: string): { dayIndex: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(at);
  } catch {
    return {
      dayIndex: at.getDay(),
      minutes: at.getHours() * 60 + at.getMinutes(),
    };
  }

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  const dayIndex = DAY_LABELS.indexOf(value('weekday'));

  // `hour12: false` zna vratiti 24 umjesto 00 za ponoć.
  const hour = Number(value('hour')) % 24;

  return {
    dayIndex: dayIndex === -1 ? at.getDay() : dayIndex,
    minutes: hour * 60 + Number(value('minute')),
  };
}

function windowForDay(schedule: DeviceSchedule, dayLabel: string): DayWindow | null {
  const day = schedule.days?.find((item) => item.label === dayLabel);

  if (!day || !day.selected) {
    return null;
  }

  if (schedule.mode === 'perDay') {
    return {
      start: toMinutes(day.startHour, day.startMinute),
      end: toMinutes(day.endHour, day.endMinute),
    };
  }

  return {
    start: toMinutes(schedule.startHour, schedule.startMinute),
    end: toMinutes(schedule.endHour, schedule.endMinute),
  };
}

/**
 * Da li je internet pauziran rasporedom u datom trenutku, po lokalnom
 * vremenu naloga.
 */
export function isPausedAt(schedule: unknown, at: Date, timeZone: string): boolean {
  if (!isSchedule(schedule) || !schedule.enabled) {
    return false;
  }

  const { dayIndex, minutes } = localParts(at, timeZone);

  const today = windowForDay(schedule, DAY_LABELS[dayIndex]!);

  if (today) {
    if (today.start < today.end && minutes >= today.start && minutes < today.end) {
      return true;
    }

    // Raspored koji prelazi ponoć, a počeo je danas.
    if (today.start > today.end && minutes >= today.start) {
      return true;
    }
  }

  // Raspored koji je počeo jučer i još traje.
  const previous = windowForDay(schedule, DAY_LABELS[(dayIndex + 6) % 7]!);

  if (previous && previous.start > previous.end && minutes < previous.end) {
    return true;
  }

  return false;
}

/**
 * Raspored dolazi iz jsonb kolone, dakle iz nečega što je nekada
 * upisao klijent. Zato se provjerava oblik prije računanja, umjesto
 * da se vjeruje tipu.
 */
function isSchedule(value: unknown): value is DeviceSchedule {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DeviceSchedule>;

  return typeof candidate.enabled === 'boolean' && Array.isArray(candidate.days);
}

/** Da li je zona koju je klijent poslao uopšte poznata ovom Node-u. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });

    return true;
  } catch {
    return false;
  }
}
