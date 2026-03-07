export type TickerMessage = {
  id: string;
  category: "time" | "motiv" | "dna" | "behavior" | "milestone" | "global";
  message: string;
  dynamic?: boolean;
  condition?: {
    days?: number[];
    hoursFrom?: number;
    hoursTo?: number;
  };
};

export const TICKER_MESSAGES: TickerMessage[] = [
  {
    id: "peak_open",
    category: "time",
    dynamic: true,
    condition: { hoursFrom: 20, hoursTo: 22 },
    message: "{currentTime} -- Peak window open -- Post now",
  },
  {
    id: "peak_left",
    category: "time",
    dynamic: true,
    condition: { hoursFrom: 20, hoursTo: 22 },
    message: "{minsLeft} left in your best window -- Go",
  },
  {
    id: "peak_approaching",
    category: "time",
    dynamic: true,
    condition: { hoursFrom: 19, hoursTo: 20 },
    message: "Peak window in {minsUntilPeak} -- Draft something",
  },
  {
    id: "friday_night",
    category: "time",
    condition: { days: [5], hoursFrom: 21, hoursTo: 24 },
    message: "Friday night -- Your audience is ready -- Post",
  },
  {
    id: "saturday_morning",
    category: "time",
    condition: { days: [6], hoursFrom: 8, hoursTo: 12 },
    message: "Saturday morning -- Readers have time -- Show up",
  },
  {
    id: "weekend",
    category: "time",
    condition: { days: [6, 0], hoursFrom: 10, hoursTo: 20 },
    message: "Weekend -- People scroll more -- Post something",
  },
  {
    id: "sunday_evening",
    category: "time",
    condition: { days: [0], hoursFrom: 18, hoursTo: 22 },
    message: "Sunday evening -- Reflective mood -- Post depth",
  },
  {
    id: "sunday_general",
    category: "time",
    condition: { days: [0] },
    message: "Sunday -- Make your audience think today",
  },
  {
    id: "monday_morning",
    category: "time",
    condition: { days: [1], hoursFrom: 7, hoursTo: 10 },
    message: "Monday morning -- Fresh week -- Post first",
  },
  {
    id: "midweek",
    category: "time",
    condition: { days: [3] },
    message: "Wednesday -- Give your audience something real",
  },
  {
    id: "late_night",
    category: "time",
    condition: { hoursFrom: 22, hoursTo: 24 },
    message: "Late night -- Thinkers are scrolling -- Post",
  },
  {
    id: "early_morning",
    category: "time",
    condition: { hoursFrom: 6, hoursTo: 8 },
    message: "Early readers are here -- Show up for them",
  },
  {
    id: "motiv_overthink",
    category: "motiv",
    message: "Stop overthinking -- Post it",
  },
  {
    id: "motiv_consistency",
    category: "motiv",
    message: "Consistency beats perfection -- Post the draft",
  },
  {
    id: "motiv_helped",
    category: "motiv",
    message: "Your last post helped someone -- They didn't comment",
  },
  {
    id: "motiv_algorithm",
    category: "motiv",
    message: "Algorithm rewards the consistent -- Show up",
  },
  {
    id: "motiv_compound",
    category: "motiv",
    message: "Every post compounds -- Skipped ones never do",
  },
  {
    id: "dna_top_tag_views",
    category: "dna",
    dynamic: true,
    message: "{topTag} -- {avgViews} avg views -- Post another",
  },
  {
    id: "dna_top_tag_strong",
    category: "dna",
    dynamic: true,
    message: "{topTag} is your strongest topic -- Own it",
  },
  {
    id: "dna_hook_style",
    category: "dna",
    dynamic: true,
    message: "{hookStyle} hooks get {hookMultiplier}x more replies",
  },
  {
    id: "dna_length",
    category: "dna",
    dynamic: true,
    message: "Under {optimalLength} chars -- your sweet spot",
  },
  {
    id: "dna_tag_gap",
    category: "dna",
    dynamic: true,
    message: "{topTag} -- {daysSinceTag} days quiet -- Post again",
  },
  {
    id: "dna_best_day",
    category: "dna",
    dynamic: true,
    message: "{bestDay} is your best performing day",
  },
  {
    id: "dna_cta",
    category: "dna",
    dynamic: true,
    message: "Posts with CTA get {ctaBoost}% more replies for you",
  },
  {
    id: "dna_reposts",
    category: "dna",
    dynamic: true,
    message: "{topTag} gets {repostMultiplier}x your avg reposts",
  },
  {
    id: "dna_formula",
    category: "dna",
    dynamic: true,
    message: "{topTag} at {bestHourStart} -- your winning formula",
  },
  {
    id: "dna_media_vs_no",
    category: "dna",
    dynamic: true,
    message: "{mediaWinner} posts outperform for you -- Use it",
  },
  {
    id: "dna_am_vs_pm",
    category: "dna",
    dynamic: true,
    message: "{amOrPm} posts win -- {pctDiff}% more views for you",
  },
  {
    id: "dna_question_recent",
    category: "dna",
    dynamic: true,
    message: "Your last question post -- {topReplyCount} replies",
  },
  {
    id: "behavior_12h",
    category: "behavior",
    dynamic: true,
    message: "No post in 12+ hours -- Your audience is waiting",
  },
  {
    id: "behavior_3d",
    category: "behavior",
    dynamic: true,
    message: "{daysSincePost} days since last post -- Come back",
  },
  {
    id: "behavior_streak",
    category: "behavior",
    dynamic: true,
    message: "{streakDays} day posting streak -- Keep it going",
  },
  {
    id: "behavior_weekly",
    category: "behavior",
    dynamic: true,
    message: "{postsThisWeek} posts this week -- Last week: {postsLastWeek}",
  },
  {
    id: "behavior_last_post",
    category: "behavior",
    dynamic: true,
    message: "Last post -- {lastViews} views -- {timeAgo} ago",
  },
  {
    id: "behavior_hook_repeat",
    category: "behavior",
    dynamic: true,
    message: "{streakCount} {hookStyle} posts in a row -- Mix it up",
  },
  {
    id: "behavior_never_day",
    category: "behavior",
    dynamic: true,
    message: "Never posted on {dayName} -- Untapped opportunity",
  },
  {
    id: "behavior_pace",
    category: "behavior",
    dynamic: true,
    message: "{postsThisMonth} posts this month -- {daysLeft} days left",
  },
  {
    id: "behavior_replies_back",
    category: "behavior",
    dynamic: true,
    message: "{replyCount} replies this week -- Have you replied?",
  },
  {
    id: "milestone_followers",
    category: "milestone",
    dynamic: true,
    message: "{followersToNext} away from {nextMilestone} followers",
  },
  {
    id: "milestone_dna",
    category: "milestone",
    dynamic: true,
    message: "{dnaCount}/15 DNA posts tracked -- {dnaRemaining} to go",
  },
  {
    id: "milestone_views",
    category: "milestone",
    dynamic: true,
    message: "{totalViews} total views -- Keep adding to that",
  },
  {
    id: "milestone_likes",
    category: "milestone",
    dynamic: true,
    message: "{totalLikes} likes earned -- Real people, real impact",
  },
  {
    id: "milestone_published",
    category: "milestone",
    dynamic: true,
    message: "{publishedCount} posts published -- Keep building",
  },
  {
    id: "global_top_country",
    category: "global",
    dynamic: true,
    message: "{topCountry} is your biggest audience country",
  },
  {
    id: "global_top_city",
    category: "global",
    dynamic: true,
    message: "{topCity} -- Your biggest city following",
  },
  {
    id: "global_gender",
    category: "global",
    dynamic: true,
    message: "{genderPct}% {topGender} audience",
  },
  {
    id: "global_age",
    category: "global",
    dynamic: true,
    message: "{topAge} is your top engaging age group",
  },
  {
    id: "global_country_time",
    category: "global",
    dynamic: true,
    message: "{topCountry} -- {localTime} there -- They're {awakeAsleep}",
  },
  {
    id: "global_reposts_trend",
    category: "global",
    dynamic: true,
    message: "Reposts up {repostPct}% this week -- Momentum",
  },
];

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isConditionMet(msg: TickerMessage): boolean {
  if (!msg.condition) return true;
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  if (msg.condition.days && !msg.condition.days.includes(day)) return false;
  if (msg.condition.hoursFrom !== undefined && hour < msg.condition.hoursFrom) return false;
  if (msg.condition.hoursTo !== undefined && hour >= msg.condition.hoursTo) return false;
  return true;
}

export function buildInterleavedPool(available: TickerMessage[]): TickerMessage[] {
  const result: TickerMessage[] = [];
  const categoryOrder = ["time", "motiv", "dna", "behavior", "milestone", "global"] as const;
  const pools = new Map<TickerMessage["category"], TickerMessage[]>();
  for (const category of categoryOrder) {
    const pool = shuffleArray(available.filter((item) => item.category === category));
    if (pool.length > 0) {
      pools.set(category, pool);
    }
  }

  let lastCategory: TickerMessage["category"] | null = null;
  while (pools.size > 0) {
    const sortedCategories = Array.from(pools.entries())
      .filter(([, pool]) => pool.length > 0)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([category]) => category);

    const candidate = sortedCategories.find((category) => category !== lastCategory);
    const nextCategory = candidate ?? sortedCategories[0];
    if (!nextCategory) break;

    const pool = pools.get(nextCategory);
    if (!pool || pool.length === 0) {
      pools.delete(nextCategory);
      continue;
    }

    const nextMessage = pool.shift();
    if (!nextMessage) {
      pools.delete(nextCategory);
      continue;
    }

    result.push(nextMessage);
    lastCategory = nextMessage.category;

    if (pool.length === 0) {
      pools.delete(nextCategory);
    }
  }
  return result;
}


