// ─── Player colors ───────────────────────────────────────────────────────────
export const COLORS = [
  { bg: '#7C5CFC', fg: '#fff',     name: 'purple' },
  { bg: '#FF6B6B', fg: '#fff',     name: 'coral'  },
  { bg: '#FFD93D', fg: '#5a3e00',  name: 'yellow' },
  { bg: '#6BCB77', fg: '#1a4020',  name: 'green'  },
  { bg: '#4D96FF', fg: '#fff',     name: 'blue'   },
  { bg: '#FF9F43', fg: '#fff',     name: 'orange' },
];

// ─── Default players (replace with real multiplayer data later) ──────────────
export const PLAYERS = [
  { name: 'Alex',   emoji: '🦊' },
  { name: 'Jordan', emoji: '🐸' },
  { name: 'Sam',    emoji: '🦋' },
  { name: 'Riley',  emoji: '🐙' },
];

// ─── Prompt library ──────────────────────────────────────────────────────────
export const PROMPTS = {
  'Food Wars': [
    'You can only eat one fast food chain for the rest of your life. Which do you choose?',
    'You can only eat one ethnic cuisine forever. Which cuisine wins?',
    "You're on death row. What is your last meal and why?",
    'What is the most underrated food that deserves way more respect?',
  ],
  'Bucket List': [
    'You can see any musician or band, dead or alive, live in concert. Who do you choose?',
    'You can attend any historical event as an observer. Which one?',
    'You get one superpower but can only use it twice. What do you pick?',
  ],
  'Tradeoffs': [
    'Would you take $10 million if an immortal snail is trying to reach you forever?',
    'You receive unlimited free flights but must always sit in the middle seat. Worth it?',
    "You can never use social media again — but you get $500/month. Deal?",
  ],
  'Icebreakers': [
    'What is something everyone should experience once?',
    'What do people complain about but secretly enjoy?',
    'What skill sounds boring until you meet someone amazing at it?',
    'What is an opinion you have that most people would disagree with?',
  ],
  'Hot Takes': [
    'What is an overrated thing everyone seems to love?',
    "What is the most embarrassing thing that's actually great?",
    'What hill will you die on that others think is ridiculous?',
  ],
  'Would You Rather': [
    'Would you rather always speak in rhymes or always speak in questions?',
    'Would you rather know the date of your death or the cause of your death?',
    'Would you rather fly but only 1 foot off the ground, or teleport but only 10 feet at a time?',
  ],
};

// ─── Awards ──────────────────────────────────────────────────────────────────
export const AWARDS = [
  {
    id:    'convincing',
    emoji: '🏆',
    label: 'Most Convincing',
    desc:  '"You almost changed my answer."',
    pts:   2,
  },
  {
    id:    'funniest',
    emoji: '😂',
    label: 'Funniest Defense',
    desc:  '"I couldn\'t stop laughing."',
    pts:   1,
  },
  {
    id:    'unexpected',
    emoji: '🤯',
    label: 'Most Unexpected',
    desc:  '"I never saw that coming."',
    pts:   1,
  },
  {
    id:    'steal',
    emoji: '✨',
    label: "Answer I'd Steal",
    desc:  '"If I had to switch, I\'d pick yours."',
    pts:   2,
  },
];

// ─── Fake AI answers per prompt (for single-player demo mode) ────────────────
export const FAKE_ANSWERS = {
  'You can only eat one fast food chain for the rest of your life. Which do you choose?': [
    'Chipotle — infinite customization means infinite variety. It\'s not even a question.',
    'In-N-Out. Animal style forever. It\'s simple, honest food that never gets old.',
    'Chick-fil-A. Their chicken is elite and being closed Sundays gives you a weekly reset.',
  ],
  default: [
    "I'd choose the one that gives me the most variety — you need options!",
    "Has to be the classic choice — tried and true beats trendy every time.",
    "Everyone sleeps on this option but once you think it through, it's obviously the best.",
  ],
};
