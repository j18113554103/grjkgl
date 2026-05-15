import {
  Activity,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ClipboardList,
  Download,
  Dumbbell,
  Home,
  Loader2,
  MessageCircle,
  Moon,
  Send,
  Settings,
  Sparkles,
  TrendingDown,
  Waves
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  exportEntries,
  getAllEntries,
  getTodayEntry,
  saveEntry
} from "./db";
import type { AiConfig, AiSummary, DailyTask, HealthEntry, ViewId } from "./types";

const views: { id: ViewId; label: string; icon: typeof Home; hue: number }[] = [
  { id: "today", label: "今日", icon: Home, hue: 160 },
  { id: "training", label: "训练", icon: Dumbbell, hue: 150 },
  { id: "progress", label: "趋势", icon: Activity, hue: 178 },
  { id: "coach", label: "AI", icon: Bot, hue: 35 },
  { id: "settings", label: "设置", icon: Settings, hue: 220 }
];

const defaultAiConfig: AiConfig = {
  provider: "openai-compatible",
  model: "deepseek-v4-pro",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: ""
};

function loadAiConfig(): AiConfig {
  try {
    return { ...defaultAiConfig, ...JSON.parse(localStorage.getItem("health-ai-config") || "{}") };
  } catch {
    return defaultAiConfig;
  }
}

const fallbackSummary: AiSummary = {
  title: "今日复盘",
  completion: 0,
  highlights: ["先完成当前时间段任务，计划会比完美更重要。"],
  risks: ["模型或密钥未配置时，会使用本地规则建议。"],
  nextAction: "先完成最近的一项待办，并把真实情况写在备注里。"
};

function completionOf(entry: HealthEntry) {
  const requiredTasks = entry.tasks.filter((task) => !task.optional);
  const taskScore =
    requiredTasks.length > 0
      ? requiredTasks.filter((task) => task.completed).length / requiredTasks.length
      : 0;
  const exerciseScore = entry.exercises.filter((exercise) => exercise.completed).length / entry.exercises.length;
  return Math.round((taskScore * 0.75 + exerciseScore * 0.25) * 100);
}

function yesterdayAdvice(entries: HealthEntry[]) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = sorted.find((entry) => entry.date !== today);
  if (!yesterday) {
    return "还没有昨天的数据。今天先认真记录午餐、晚餐、饭后走路和训练，明天这里会按昨天表现给你具体建议。";
  }
  const score = completionOf(yesterday);
  if (score >= 85 && yesterday.waterTargetMet) {
    return `昨天完成度 ${score}%，饮水也达标，做得很好。今天不用加码，继续保持同样节奏，避免因为状态好而奖励性加餐。`;
  }
  const missed = yesterday.tasks.filter((task) => !task.optional && !task.completed).map((task) => task.title);
  const firstMissed = missed[0] ?? "训练或饭后走路";
  return `昨天完成度 ${score}%，主要短板是${firstMissed}。今天的弥补策略：午晚餐主食减半，饭后快走至少 20 分钟，训练不用补量但要完成标准动作。`;
}

function streakOf(entries: HealthEntry[]) {
  let streak = 0;
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  for (const entry of sorted) {
    if (completionOf(entry) >= 60) streak += 1;
    else break;
  }
  return streak || 1;
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function EnergyCanvas({ hue, completion, paused }: { hue: number; completion: number; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let raf = 0;
    const points = Array.from({ length: 42 }, (_, index) => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0018,
      vy: (Math.random() - 0.5) * 0.0018,
      r: 0.8 + (index % 5) * 0.24
    }));

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      ctx.clearRect(0, 0, width, height);

      const base = ctx.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, `hsl(${hue}, 78%, 94%)`);
      base.addColorStop(0.52, `hsl(${hue + 26}, 70%, 96%)`);
      base.addColorStop(1, `hsl(${hue + 58}, 64%, 95%)`);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);

      const waveAlpha = 0.14 + completion / 900;
      for (let line = 0; line < 5; line += 1) {
        ctx.beginPath();
        const yBase = height * (0.18 + line * 0.18);
        for (let x = 0; x <= width; x += 12) {
          const y = yBase + Math.sin(x * 0.018 + frame * 0.018 + line) * (10 + line * 2);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${hue + line * 10}, 70%, 44%, ${waveAlpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const density = paused ? 16 : 26 + Math.floor(completion / 5);
      points.slice(0, density).forEach((point) => {
        if (!paused) {
          point.x += point.vx;
          point.y += point.vy;
          if (point.x < 0) point.x = 1;
          if (point.x > 1) point.x = 0;
          if (point.y < 0) point.y = 1;
          if (point.y > 1) point.y = 0;
        }
        const x = point.x * width;
        const y = point.y * height;
        ctx.beginPath();
        ctx.arc(x, y, point.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, 78%, 34%, 0.24)`;
        ctx.fill();
      });

      points.slice(0, density).forEach((a, index) => {
        points.slice(index + 1, density).forEach((b) => {
          const ax = a.x * width;
          const ay = a.y * height;
          const bx = b.x * width;
          const by = b.y * height;
          const distance = Math.hypot(ax - bx, ay - by);
          if (distance < 82) {
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.strokeStyle = `hsla(${hue}, 70%, 38%, ${0.1 * (1 - distance / 82)})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        });
      });

      frame += 1;
      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [completion, hue, paused]);

  return <canvas className="energy-canvas" ref={ref} aria-hidden="true" />;
}

function StatusBar() {
  const [clock, setClock] = useState("09:41");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
    };
    tick();
    const timer = window.setInterval(tick, 10_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="status-bar">
      <span>{clock}</span>
      <span className="status-icons">5G 88%</span>
    </div>
  );
}

function TodayView({
  entry,
  entries,
  onToggleTask,
  onToggleWater,
  onTaskNote,
  onSleepReminder
}: {
  entry: HealthEntry;
  entries: HealthEntry[];
  onToggleTask: (id: string) => void;
  onToggleWater: () => void;
  onTaskNote: (id: string, note: string) => void;
  onSleepReminder: () => void;
}) {
  const completion = completionOf(entry);
  const ringOffset = 239 - (239 * completion) / 100;
  const current = entry.tasks.find((task) => !task.optional && !task.completed);
  const waistValue =
    entry.baselineWaistCm && entry.waistCm
      ? `${(entry.waistCm - entry.baselineWaistCm).toFixed(1)} cm`
      : "待记录";

  return (
    <section className="screen active-screen">
      <ScreenTag icon={Sparkles} label="今日执行" />

      <div className="hero-metrics">
        <svg className="progress-ring" viewBox="0 0 96 96" aria-label={`今日完成 ${completion}%`}>
          <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(0,200,150,.12)" strokeWidth="8" />
          <circle
            cx="48"
            cy="48"
            r="38"
            fill="none"
            stroke="url(#ringGradient)"
            strokeDasharray="239"
            strokeDashoffset={ringOffset}
            strokeLinecap="round"
            strokeWidth="8"
            transform="rotate(-90 48 48)"
          />
          <defs>
            <linearGradient id="ringGradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#00e8a8" />
              <stop offset="100%" stopColor="#009965" />
            </linearGradient>
          </defs>
          <text x="48" y="45" textAnchor="middle" className="ring-value">{completion}%</text>
          <text x="48" y="58" textAnchor="middle" className="ring-label">今日完成</text>
        </svg>
        <div className="metric-stack">
          <MiniMetric label="饮水标准" value={entry.waterTargetMet ? "已完成" : "未完成"} strong={entry.waterTargetMet} />
          <MiniMetric label="连续打卡" value={`第 ${streakOf(entries)} 天`} />
          <MiniMetric label="较初始腰围" value={waistValue} strong={Boolean(entry.baselineWaistCm && entry.waistCm)} />
        </div>
      </div>

      <div className="quick-actions">
        <button type="button" onClick={onToggleWater}>
          <Waves size={15} />{entry.waterTargetMet ? "饮水已达标" : "标记饮水达标"}
        </button>
        <button type="button" onClick={() => current && onToggleTask(current.id)}><Check size={15} />完成当前</button>
      </div>

      <div className="task-list">
        {entry.tasks.map((task) => (
          <div
            className={`task-card ${task.completed ? "done" : ""} ${task.id === current?.id ? "now" : ""}`}
            key={task.id}
          >
            <button className="task-card-main" onClick={() => onToggleTask(task.id)} type="button">
              <span className={`task-dot ${task.completed ? "ok" : task.id === current?.id ? "go" : ""}`} />
              <span className="task-copy">
                <span>{task.title}{task.optional && <em>可选提示</em>}</span>
                <small>{task.detail}</small>
              </span>
              <span className="task-time">{task.completed ? "已完成" : task.time}</span>
            </button>
            <textarea
              aria-label={`${task.title} 备注`}
              onChange={(event) => onTaskNote(task.id, event.target.value)}
              placeholder="记录真实情况，AI 会用于复盘：比如蛋白质和蔬菜吃了，米饭吃了两碗。"
              value={task.note ?? ""}
            />
            {task.id === "sleep" && (
              <button className="reminder-button" onClick={onSleepReminder} type="button">
                <Bell size={14} /> 23:30 睡觉提醒
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function TrainingView({ entry, onToggleExercise }: { entry: HealthEntry; onToggleExercise: (id: string) => void }) {
  const done = entry.exercises.filter((exercise) => exercise.completed).length;
  const days = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <section className="screen active-screen">
      <ScreenTag icon={Dumbbell} label="本周训练" />
      <div className="training-top">
        <span>每周 3 次 · 每次 30 分钟</span>
        <b>{done} / {entry.exercises.length} 动作</b>
      </div>
      <div className="week-row">
        {days.map((day, index) => (
          <span className={index === 0 || index === 2 ? "trained" : index === 4 ? "today" : ""} key={day}>{day}</span>
        ))}
      </div>
      <div className="exercise-list">
        {entry.exercises.map((exercise, index) => (
          <button
            className={`exercise-card ${exercise.completed ? "complete" : ""}`}
            key={exercise.id}
            onClick={() => onToggleExercise(exercise.id)}
            type="button"
          >
            <span className="exercise-index">{index + 1}</span>
            <span className="exercise-main">
              <b>{exercise.name}</b>
              <small>{exercise.reps} · {exercise.tip}</small>
              <i><em style={{ width: exercise.completed ? "100%" : index === done ? "48%" : "0%" }} /></i>
            </span>
            <span className="check-box">{exercise.completed && <Check size={13} />}</span>
          </button>
        ))}
      </div>
      <div className="trainer-note">
        <Moon size={16} />
        饭后训练至少间隔 60 分钟；如果腹部不舒服，优先快走和拉伸。
      </div>
    </section>
  );
}

function ProgressView({
  entry,
  entries,
  onWaistChange
}: {
  entry: HealthEntry;
  entries: HealthEntry[];
  onWaistChange: (field: "baselineWaistCm" | "waistCm", value: number | null) => void;
}) {
  const uniqueEntries = [...entries, entry]
    .filter((item, index, array) => array.findIndex((other) => other.date === item.date) === index)
    .sort((a, b) => a.date.localeCompare(b.date));
  const lastSeven = uniqueEntries.slice(-7);
  const lastThirty = uniqueEntries.slice(-30);
  const average = (items: HealthEntry[]) =>
    items.length ? Math.round(items.reduce((sum, item) => sum + completionOf(item), 0) / items.length) : 0;
  const weekAverage = average(lastSeven);
  const monthAverage = average(lastThirty);
  const weekWater = lastSeven.filter((item) => item.waterTargetMet).length;
  const monthGoodDays = lastThirty.filter((item) => completionOf(item) >= 60).length;
  const checkinDays = lastThirty.length;
  const weekTraining = lastSeven.reduce(
    (sum, item) => sum + (item.exercises.some((exercise) => exercise.completed) ? 1 : 0),
    0
  );
  const waistRecords = lastThirty.filter((item) => item.waistCm && item.baselineWaistCm);

  return (
    <section className="screen active-screen">
      <ScreenTag icon={TrendingDown} label="统计" />
      <div className="stats-grid">
        <div className="stat-tile">
          <small>本周平均完成</small>
          <b>{weekAverage}%</b>
        </div>
        <div className="stat-tile">
          <small>本周饮水达标</small>
          <b>{weekWater}/7</b>
        </div>
        <div className="stat-tile">
          <small>本周训练天数</small>
          <b>{weekTraining}/3</b>
        </div>
        <div className="stat-tile">
          <small>打卡天数</small>
          <b>{checkinDays}/30</b>
        </div>
      </div>

      <div className="daily-ai-advice">
        <div>
          <Bot size={16} />
          <b>今日 AI 建议</b>
        </div>
        <p>{yesterdayAdvice(uniqueEntries)}</p>
      </div>

      <div className="progress-card">
        <div className="progress-head">
          <span><CalendarDays size={15} /> 周统计</span>
          <small>最近 7 天执行质量</small>
        </div>
        <Bar label="平均" value={weekAverage} />
        <Bar label="饮水" value={Math.round((weekWater / 7) * 100)} />
        <Bar label="训练" value={Math.min(100, Math.round((weekTraining / 3) * 100))} />
        <div className="calendar-grid">
          {Array.from({ length: 7 }, (_, index) => {
            const item = lastSeven[index];
            const value = item ? completionOf(item) : 0;
            return (
              <span className={value >= 70 ? "ok" : value >= 40 ? "mid" : ""} key={index}>
                <small>{item?.date.slice(5) ?? "-"}</small>
                <b>{item ? value : "-"}</b>
              </span>
            );
          })}
        </div>
      </div>

      <div className="progress-card">
        <div className="progress-head">
          <span><TrendingDown size={15} /> 月统计</span>
          <small>最近 30 天长期习惯</small>
        </div>
        <Bar label="平均" value={monthAverage} />
        <Bar label="达标" value={lastThirty.length ? Math.round((monthGoodDays / lastThirty.length) * 100) : 0} />
        <div className="month-summary">
          <span>腰围记录：{waistRecords.length} 次</span>
          <span>
            腰围变化：
            {waistRecords.length >= 2
              ? `${((waistRecords.at(-1)?.waistCm ?? 0) - (waistRecords[0]?.waistCm ?? 0)).toFixed(1)} cm`
              : "记录两次后计算"}
          </span>
        </div>
        <div className="waist-form">
          <label>
            初始腰围
            <input
              inputMode="decimal"
              onChange={(event) => onWaistChange("baselineWaistCm", event.target.value ? Number(event.target.value) : null)}
              placeholder="cm"
              type="number"
              value={entry.baselineWaistCm ?? ""}
            />
          </label>
          <label>
            今日腰围
            <input
              inputMode="decimal"
              onChange={(event) => onWaistChange("waistCm", event.target.value ? Number(event.target.value) : null)}
              placeholder="cm"
              type="number"
              value={entry.waistCm ?? ""}
            />
          </label>
        </div>
      </div>

      <div className="month-rhythm">
        {["第 1 周：适应饥饿感，减少饭后困", "第 2 周：稳定饭后走路和晚餐时间", "第 3 周：观察衣服、腹胀和腰围变化", "第 4 周：复盘最有效的习惯并保留"].map((text) => (
          <div key={text}><span>{text}</span></div>
        ))}
      </div>
    </section>
  );
}

function CoachView({
  entry,
  summary,
  chat,
  loading,
  streaming,
  onRefreshSummary,
  onEvaluateToday,
  onSubmitChat
}: {
  entry: HealthEntry;
  summary: AiSummary;
  chat: { role: "user" | "assistant"; content: string }[];
  loading: boolean;
  streaming: boolean;
  onRefreshSummary: () => void;
  onEvaluateToday: () => void;
  onSubmitChat: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    setMessage("");
    onSubmitChat(text);
  };

  return (
    <section className="screen active-screen">
      <ScreenTag icon={Bot} label="AI 教练" />
      <div className="ai-card">
        <div className="ai-card-head">
          <span><Sparkles size={14} />{summary.title}</span>
          <button type="button" onClick={onRefreshSummary} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : "刷新"}
          </button>
        </div>
        <p>今日完成度 <b>{summary.completion || completionOf(entry)}%</b></p>
        {summary.highlights.map((item) => <p key={item}>{item}</p>)}
        {summary.risks.map((item) => <p className="risk" key={item}>{item}</p>)}
        <strong>{summary.nextAction}</strong>
      </div>

      <button className="wide-command coach-command" type="button" onClick={onEvaluateToday} disabled={loading || streaming}>
        <Bot size={16} /> 评价今天表现
      </button>

      <div className="chat-thread">
        {chat.map((item, index) => (
          <div className={`bubble ${item.role}`} key={`${item.role}-${index}`}>{item.content}</div>
        ))}
        {streaming && <div className="bubble assistant soft"><Loader2 size={13} className="spin" /> 正在生成...</div>}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <MessageCircle size={15} />
        <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="问饮食、训练或今天怎么调整" />
        <button type="submit" disabled={streaming}><Send size={15} /></button>
      </form>
    </section>
  );
}

function SettingsView({
  onExport,
  apiState,
  aiConfig,
  onAiConfigChange
}: {
  onExport: () => void;
  apiState: string;
  aiConfig: AiConfig;
  onAiConfigChange: (config: AiConfig) => void;
}) {
  const update = (patch: Partial<AiConfig>) => onAiConfigChange({ ...aiConfig, ...patch });

  return (
    <section className="screen active-screen">
      <ScreenTag icon={Settings} label="设置" />
      <div className="settings-list">
        <div className="ai-config-panel">
          <div className="ai-config-title"><Bot size={16} />AI 模型配置</div>
          <label>
            模型
            <input value={aiConfig.model} onChange={(event) => update({ model: event.target.value })} placeholder="gpt-5" />
          </label>
          <label>
            API Key
            <input
              value={aiConfig.apiKey}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder="sk-..."
              type="password"
            />
          </label>
          <label>
            Base URL
            <input
              value={aiConfig.baseUrl}
              onChange={(event) => update({ baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <div className="setting-hint">
            当前状态：{apiState}。配置会保存在本机浏览器，AI 请求会优先使用这里填写的模型、Key 和 Base URL；未填写 Key 时使用 Vercel 环境变量。
          </div>
        </div>
        <button className="setting-row command-row" type="button" onClick={onExport}>
          <span><Download size={16} />导出本地数据</span>
          <b>JSON</b>
        </button>
        <div className="install-note">
          <ClipboardList size={18} />
          在手机浏览器菜单中选择“添加到主屏幕”，即可像 App 一样打开。
        </div>
        <div className="disclaimer">
          AI 输出仅用于生活方式记录和一般建议，不能替代医疗诊断、用药建议或医生判断。
        </div>
      </div>
    </section>
  );
}

function ScreenTag({ icon: Icon, label }: { icon: typeof Home; label: string }) {
  return <div className="screen-tag"><Icon size={14} /><span>{label}</span></div>;
}

function MiniMetric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div><small>{label}</small><b className={strong ? "strong" : ""}>{value}</b></div>;
}

function Pill({ icon, text }: { icon: string; text: string }) {
  return <span><b>{icon}</b>{text}</span>;
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bar-row">
      <span>{label}</span>
      <i><em style={{ width: `${value}%` }} /></i>
      <b>{value}%</b>
    </div>
  );
}

async function scheduleSleepReminder() {
  const notify = () => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("该准备睡觉了", {
        body: "23:30 到了，睡眠是减肚子计划的底层条件。",
        icon: "/icons/icon.svg"
      });
    } else {
      window.alert("已到 23:30，该准备睡觉了。");
    }
  };

  if ("Notification" in window && Notification.permission === "default") {
    await Notification.requestPermission();
  }

  const now = new Date();
  const target = new Date();
  target.setHours(23, 30, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  window.setTimeout(notify, target.getTime() - now.getTime());
  window.alert("已设置 23:30 睡觉提醒。PWA 打开或在后台可用时会提醒。");
}

function App() {
  const systemReduced = usePrefersReducedMotion();
  const [view, setView] = useState<ViewId>("today");
  const [entry, setEntry] = useState<HealthEntry | null>(null);
  const [entries, setEntries] = useState<HealthEntry[]>([]);
  const [summary, setSummary] = useState<AiSummary>(fallbackSummary);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([
    { role: "assistant", content: "我会根据你的打卡、饮食和训练记录给建议。比如：晚上饿了怎么办？" }
  ]);
  const [aiState, setAiState] = useState("未连接");
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    Promise.all([getTodayEntry(), getAllEntries()]).then(([today, all]) => {
      setEntry(today);
      setEntries(all);
      setSummary((current) => ({ ...current, completion: completionOf(today) }));
    });
  }, []);

  const persist = async (next: HealthEntry) => {
    setEntry(next);
    await saveEntry(next);
    setEntries(await getAllEntries());
  };

  const completion = entry ? completionOf(entry) : 0;
  const hue = views.find((item) => item.id === view)?.hue ?? 160;
  const motionPaused = systemReduced;

  const compactPayload = useMemo(() => {
    if (!entry) return null;
    return {
      today: entry,
      aiConfig,
      completion,
      recent: entries.slice(-7).map((item) => ({
        date: item.date,
        completion: completionOf(item),
        waterTargetMet: item.waterTargetMet,
        waistCm: item.waistCm,
        baselineWaistCm: item.baselineWaistCm,
        weightKg: item.weightKg
      }))
    };
  }, [aiConfig, completion, entries, entry]);

  const refreshSummary = async () => {
    if (!compactPayload) return;
    setSummaryLoading(true);
    setAiState("连接中");
    try {
      const response = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compactPayload)
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as AiSummary;
      setSummary(data);
      setAiState("已连接");
    } catch (error) {
      console.warn(error);
      setAiState("本地降级");
      setSummary({
        title: "本地复盘",
        completion,
        highlights: ["AI 代理暂不可用，先使用本地规则继续执行。"],
        risks: completion < 50 ? ["今天完成度偏低，先抓一个最容易完成的动作。"] : [],
        nextAction: entry?.tasks.find((task) => !task.completed)?.title ?? "保持节奏，记录今晚睡眠。"
      });
    } finally {
      setSummaryLoading(false);
    }
  };

  const evaluateToday = async () => {
    if (!compactPayload) return;
    setView("coach");
    setSummaryLoading(true);
    try {
      const response = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compactPayload)
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as AiSummary;
      setSummary(data);
      const line =
        data.completion >= 80
          ? `今天完成度 ${data.completion}%，做得很好。${data.nextAction}`
          : `今天完成度 ${data.completion}%，需要调整。${data.nextAction}`;
      setChat((items) => [...items, { role: "assistant", content: line }]);
      setAiState("已连接");
    } catch (error) {
      console.warn(error);
      setAiState("本地降级");
      const required = entry?.tasks.filter((task) => !task.optional) ?? [];
      const missed = required.filter((task) => !task.completed).map((task) => task.title);
      const score = entry ? completionOf(entry) : 0;
      setChat((items) => [
        ...items,
        {
          role: "assistant",
          content:
            score >= 80
              ? `今天完成度 ${score}%，做得不错。继续保持晚餐不过量和饭后走路，不需要额外加码。`
              : `今天完成度 ${score}%。主要没完成：${missed.slice(0, 2).join("、") || "训练/饭后走路"}。今天先补一个关键动作：饭后快走 20 分钟，晚餐主食减半。`
        }
      ]);
    } finally {
      setSummaryLoading(false);
    }
  };

  const submitChat = async (message: string) => {
    if (!compactPayload) return;
    setStreaming(true);
    setChat((items) => [...items, { role: "user", content: message }, { role: "assistant", content: "" }]);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, context: compactPayload })
      });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        setChat((items) => {
          const next = [...items];
          next[next.length - 1] = { role: "assistant", content: buffer };
          return next;
        });
      }
      setAiState("已连接");
    } catch (error) {
      console.warn(error);
      setAiState("本地降级");
      setChat((items) => {
        const next = [...items];
        next[next.length - 1] = { role: "assistant", content: "AI 代理暂时不可用。按本地计划看：优先喝水、控制晚餐主食、饭后快走，不要因为一次没做到就放弃整天。" };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  };

  if (!entry) {
    return <main className="loading-page">正在启动健康计划...</main>;
  }

  return (
    <main className="app-shell">
      <EnergyCanvas hue={hue} completion={completion} paused={motionPaused} />
      <div className="phone-frame">
        <StatusBar />
        <div className="screen-wrap">
          {view === "today" && (
            <TodayView
              entry={entry}
              entries={entries}
              onToggleTask={(id) => {
                const next = { ...entry, tasks: entry.tasks.map((task) => task.id === id ? { ...task, completed: !task.completed } : task) };
                persist(next);
              }}
              onToggleWater={() => persist({ ...entry, waterTargetMet: !entry.waterTargetMet })}
              onTaskNote={(id, note) => {
                const next = { ...entry, tasks: entry.tasks.map((task) => task.id === id ? { ...task, note } : task) };
                persist(next);
              }}
              onSleepReminder={() => scheduleSleepReminder()}
            />
          )}
          {view === "training" && (
            <TrainingView
              entry={entry}
              onToggleExercise={(id) => {
                const next = { ...entry, exercises: entry.exercises.map((exercise) => exercise.id === id ? { ...exercise, completed: !exercise.completed } : exercise) };
                persist(next);
              }}
            />
          )}
          {view === "progress" && (
            <ProgressView
              entry={entry}
              entries={entries}
              onWaistChange={(field, value) => persist({ ...entry, [field]: value })}
            />
          )}
          {view === "coach" && (
            <CoachView
              entry={entry}
              summary={summary}
              chat={chat}
              loading={summaryLoading}
              streaming={streaming}
              onRefreshSummary={refreshSummary}
              onEvaluateToday={evaluateToday}
              onSubmitChat={submitChat}
            />
          )}
          {view === "settings" && (
            <SettingsView
              apiState={aiState}
              aiConfig={aiConfig}
              onAiConfigChange={(config) => {
                setAiConfig(config);
                localStorage.setItem("health-ai-config", JSON.stringify(config));
              }}
              onExport={async () => exportEntries(await getAllEntries())}
            />
          )}
        </div>
        <nav className="bottom-nav" aria-label="主要导航">
          {views.map((item) => {
            const Icon = item.icon;
            return (
              <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} type="button">
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </main>
  );
}

export default App;
