export type ViewId = "today" | "training" | "progress" | "coach" | "settings";

export type TaskKind = "fasting" | "meal" | "walk" | "training" | "water" | "sleep";

export type DailyTask = {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string;
  time: string;
  completed: boolean;
  highlight?: boolean;
  note?: string;
  optional?: boolean;
};

export type FoodChoice = {
  id: string;
  meal: "lunch" | "snack" | "dinner";
  label: string;
  selected: boolean;
};

export type Exercise = {
  id: string;
  name: string;
  reps: string;
  tip: string;
  completed: boolean;
};

export type HealthEntry = {
  date: string;
  tasks: DailyTask[];
  foodChoices: FoodChoice[];
  exercises: Exercise[];
  waterMl: number;
  waterTargetMet: boolean;
  waistCm: number | null;
  baselineWaistCm: number | null;
  weightKg: number;
  sleepTargetMet: boolean;
  notes: string[];
};

export type AiSummary = {
  title: string;
  completion: number;
  highlights: string[];
  risks: string[];
  nextAction: string;
};

export type AiConfig = {
  provider: "openai" | "openai-compatible";
  model: string;
  baseUrl: string;
  apiKey: string;
};
