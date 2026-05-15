import type { DailyTask, Exercise, FoodChoice, HealthEntry } from "./types";

const DB_NAME = "immersive-health-pwa";
const STORE = "entries";
const DB_VERSION = 1;

const todayKey = () => new Date().toISOString().slice(0, 10);

export function createDefaultTasks(): DailyTask[] {
  return [
    {
      id: "wake-water",
      kind: "water",
      title: "起床喝水 500ml",
      detail: "温水或常温水，唤醒代谢",
      time: "07:10",
      completed: false,
      optional: true
    },
    {
      id: "lunch",
      kind: "meal",
      title: "午餐：蛋白质 + 大量蔬菜",
      detail: "主食控制在 1 碗以内",
      time: "12:00",
      completed: false,
      highlight: true
    },
    {
      id: "after-lunch-walk",
      kind: "walk",
      title: "饭后快走 10-20 分钟",
      detail: "降低饭后困和血糖波动",
      time: "12:40",
      completed: false
    },
    {
      id: "snack",
      kind: "meal",
      title: "加餐可选：无糖酸奶/鸡蛋/坚果",
      detail: "饿了再吃，避免饼干蛋糕奶茶",
      time: "15:30",
      completed: false,
      optional: true
    },
    {
      id: "dinner",
      kind: "meal",
      title: "晚餐 7:30 前结束",
      detail: "优先蛋白质和蔬菜，少主食或不吃主食",
      time: "19:30",
      completed: false,
      highlight: true
    },
    {
      id: "after-dinner-walk",
      kind: "walk",
      title: "晚饭后快走 20-40 分钟",
      detail: "这是改善饭后困和肚子鼓的关键动作",
      time: "20:00",
      completed: false
    },
    {
      id: "sleep",
      kind: "sleep",
      title: "12 点前睡觉",
      detail: "睡眠是减肚子计划的底层条件",
      time: "23:30",
      completed: false
    }
  ];
}

export function createFoodChoices(): FoodChoice[] {
  return [
    { id: "lunch-protein", meal: "lunch", label: "鸡胸/牛肉/鱼/鸡蛋", selected: false },
    { id: "lunch-veggie", meal: "lunch", label: "绿叶菜/菌菇/西兰花", selected: false },
    { id: "lunch-carb", meal: "lunch", label: "糙米/玉米/红薯少量", selected: false },
    { id: "snack-yogurt", meal: "snack", label: "无糖酸奶", selected: false },
    { id: "snack-egg", meal: "snack", label: "水煮蛋", selected: false },
    { id: "snack-nuts", meal: "snack", label: "坚果一小把", selected: false },
    { id: "dinner-protein", meal: "dinner", label: "鸡胸/虾/豆腐", selected: false },
    { id: "dinner-veggie", meal: "dinner", label: "青菜/菌菇/黄瓜", selected: false },
    { id: "dinner-light", meal: "dinner", label: "不吃夜宵和油炸", selected: false }
  ];
}

export function createExercises(): Exercise[] {
  return [
    { id: "squat", name: "深蹲", reps: "15 次 x 4 组", tip: "膝盖朝脚尖方向", completed: false },
    { id: "pushup", name: "俯卧撑", reps: "10-15 次 x 4 组", tip: "可做跪姿版本", completed: false },
    { id: "plank", name: "平板支撑", reps: "40 秒 x 4 组", tip: "收紧腹部，不塌腰", completed: false },
    { id: "deadbug", name: "死虫式", reps: "15 次 x 3 组", tip: "对腹直肌特别重要", completed: false }
  ];
}

export function createDefaultEntry(date = todayKey()): HealthEntry {
  return {
    date,
    tasks: createDefaultTasks(),
    foodChoices: createFoodChoices(),
    exercises: createExercises(),
    waterMl: 0,
    waterTargetMet: false,
    waistCm: null,
    baselineWaistCm: null,
    weightKg: 72.5,
    sleepTargetMet: false,
    notes: []
  };
}

function normalizeEntry(entry: HealthEntry): HealthEntry {
  const defaults = createDefaultEntry(entry.date);
  const knownTasks = new Set(defaults.tasks.map((task) => task.id));
  const taskById = new Map(entry.tasks?.map((task) => [task.id, task]) || []);
  return {
    ...defaults,
    ...entry,
    tasks: defaults.tasks.map((task) => ({
      ...task,
      completed: taskById.get(task.id)?.completed ?? task.completed,
      note: taskById.get(task.id)?.note ?? "",
      optional: task.optional
    })).filter((task) => knownTasks.has(task.id)),
    foodChoices: defaults.foodChoices.map((choice) => ({
      ...choice,
      selected: entry.foodChoices?.find((item) => item.id === choice.id)?.selected ?? choice.selected
    })),
    exercises: defaults.exercises.map((exercise) => ({
      ...exercise,
      completed: entry.exercises?.find((item) => item.id === exercise.id)?.completed ?? exercise.completed
    })),
    waterMl: 0,
    waterTargetMet: entry.waterTargetMet ?? false,
    waistCm: entry.baselineWaistCm ? entry.waistCm ?? null : null,
    baselineWaistCm: entry.baselineWaistCm ?? null
  };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "date" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function getTodayEntry(): Promise<HealthEntry> {
  const date = todayKey();
  const existing = await tx<HealthEntry | undefined>("readonly", (store) => store.get(date));
  if (existing) return normalizeEntry(existing);
  const entry = createDefaultEntry(date);
  await saveEntry(entry);
  return entry;
}

export async function saveEntry(entry: HealthEntry): Promise<void> {
  await tx<IDBValidKey>("readwrite", (store) => store.put(entry));
}

export async function getAllEntries(): Promise<HealthEntry[]> {
  const entries = await tx<HealthEntry[]>("readonly", (store) => store.getAll());
  return entries.map(normalizeEntry).sort((a, b) => a.date.localeCompare(b.date));
}

export function exportEntries(entries: HealthEntry[]) {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `health-data-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
