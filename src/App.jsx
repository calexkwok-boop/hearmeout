import { useEffect, useState } from 'react';
import './App.css';
import { AWARDS, CATEGORY_EMOJIS, COLORS, FAKE_ANSWERS, PLAYERS, PROMPTS } from './constants.js';
import { supabase, supabaseConfigError } from './lib/supabase.js';

const PHASES = {
  SETUP: 'setup',
  LOBBY: 'lobby',
  ANSWER: 'answer',
  PREDICT: 'predict',
  REVEAL: 'reveal',
  REVOTE: 'revote',
  AWARDS: 'awards',
  VOTE: 'vote',
  RESULTS: 'results',
};

const EMOJIS = ['🦊', '🐸', '🦉', '🐙', '🐼', '🐯', '🦄', '🐻'];
const DEFAULT_CATEGORY = 'Food Wars';
const RANDOM_ALL_CATEGORY = 'All Categories';
const WIN_TARGET = 20;
const PLAYER_KEY = 'hear-me-out-player';

function randomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

function sanitizeRoomCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function readStoredPlayer() {
  const fallback = {
    id: crypto.randomUUID(),
    name: '',
    emoji: EMOJIS[Math.floor(Math.random() * EMOJIS.length)],
  };

  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(PLAYER_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      id: parsed?.id || fallback.id,
      name: parsed?.name || '',
      emoji: parsed?.emoji || fallback.emoji,
    };
  } catch {
    return fallback;
  }
}

function persistPlayer(player) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
}

function promptForCategory(category) {
  if (category === RANDOM_ALL_CATEGORY) {
    const allPrompts = Object.values(PROMPTS).flat();
    return allPrompts[Math.floor(Math.random() * allPrompts.length)];
  }
  const options = PROMPTS[category] ?? PROMPTS[DEFAULT_CATEGORY];
  return options[Math.floor(Math.random() * options.length)];
}

function createEmptyRoundState(existingScores = {}) {
  return {
    scores: existingScores,
    order: [],
    predictions: {},
    votes1: {},
    revotes: {},
    awardsByVoter: {},
  };
}

function normalizeRoundState(value) {
  if (!value || Array.isArray(value)) {
    return createEmptyRoundState({});
  }

  return {
    scores: value.scores || {},
    order: value.order || [],
    predictions: value.predictions || {},
    votes1: value.votes1 || {},
    revotes: value.revotes || {},
    awardsByVoter: value.awardsByVoter || {},
  };
}

function countCompletedAwards(awardsByVoter, playerIds) {
  return playerIds.filter(playerId => {
    const selections = awardsByVoter[playerId] || {};
    return AWARDS.every(award => selections[award.id]);
  }).length;
}

function shuffle(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function scoreMapForPlayers(players, votes) {
  return players.reduce((acc, player) => {
    acc[player.id] = votes.filter(vote => vote.target_player_id === player.id).length;
    return acc;
  }, {});
}

function updateRoomUrl(code) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (code) {
    url.searchParams.set('room', code);
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url);
}

function currentOrigin() {
  if (typeof window === 'undefined') return 'https://example.com';
  return window.location.origin;
}

function avatarStyle(index) {
  const color = COLORS[index % COLORS.length];
  return { background: color.bg, color: color.fg };
}

function buildSoloDemoOpponents(prompt, round) {
  const pool = FAKE_ANSWERS[prompt] ?? FAKE_ANSWERS.default;
  return PLAYERS.slice(1, 4).map((demoPlayer, index) => ({
    id: `solo-bot-${round}-${index}`,
    name: demoPlayer.name,
    emoji: demoPlayer.emoji,
    is_host: false,
    score: 0,
    player_id: `solo-bot-${round}-${index}`,
    answer: pool[index] ?? FAKE_ANSWERS.default[index] ?? 'I am the fake answer fallback.',
  }));
}

function getOrderedAnswers(room, answers) {
  const answerByPlayerId = Object.fromEntries(answers.map(answer => [answer.player_id, answer]));
  const ordered = (normalizeRoundState(room.answer_order).order || [])
    .map(playerId => answerByPlayerId[playerId])
    .filter(Boolean);

  return ordered.length >= answers.length ? ordered : answers;
}

function SetupScreen({
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
  onCreateRoom,
  onJoinRoom,
  loading,
  suggestion,
  playerEmoji,
  onEmojiChange,
}) {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, lineHeight: 1, marginBottom: 6 }}>🗣️</div>
        <h1 className="display-font" style={{ fontSize: 46, color: '#7C5CFC', lineHeight: 1.05 }}>
          Hear Me Out
        </h1>
        <p style={{ fontSize: 15, color: '#777', marginTop: 10, lineHeight: 1.5 }}>
          Share a code. Make your case. Change minds.
        </p>
      </div>

      <div className="panel-card room-setup-card">
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <button type="button" className="emoji-picker-btn" onClick={onEmojiChange} title="Tap to change">
            {playerEmoji}
          </button>
          <p style={{ fontSize: 11, color: '#bbb' }}>tap to change</p>
        </div>
        <label className="field-label" htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          className="text-input"
          maxLength={24}
          placeholder="Alex"
          value={playerName}
          onChange={event => setPlayerName(event.target.value)}
        />

        <button className="btn btn-primary" onClick={onCreateRoom} disabled={loading}>
          {loading ? 'Creating...' : 'Create Room'}
        </button>

        <div className="divider-copy">or join a friend</div>

        <label className="field-label" htmlFor="room-code">Room code</label>
        <input
          id="room-code"
          className="text-input text-input-code"
          placeholder={suggestion || 'HMOX'}
          value={joinCode}
          onChange={event => setJoinCode(sanitizeRoomCode(event.target.value))}
        />

        <button className="btn btn-secondary" onClick={onJoinRoom} disabled={loading}>
          {loading ? 'Joining...' : 'Join Room'}
        </button>
      </div>
    </div>
  );
}

function MissingSupabaseScreen() {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="panel-card room-setup-card">
        <p className="phase-badge" style={{ background: '#ffe8e8', color: '#c04a74', marginBottom: 14 }}>
          Setup Needed
        </p>
        <h2 className="display-font" style={{ fontSize: 30, color: '#36215d', marginBottom: 10 }}>
          Supabase isn&apos;t connected yet
        </h2>
        <p style={{ color: '#7a6f90', lineHeight: 1.5, marginBottom: 16 }}>
          Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, then run the SQL in
          `supabase/schema.sql`.
        </p>
        <p style={{ fontSize: 13, color: '#a0839d' }}>{supabaseConfigError}</p>
      </div>
    </div>
  );
}

function RoomHeader({ roomCode, isHost, onLeaveRoom, connectionLabel }) {
  const inviteUrl = `${currentOrigin()}?room=${roomCode}`;

  return (
    <div className="room-header">
      <div>
        <p className="room-kicker">ROOM CODE</p>
        <div className="room-code-row">
          <h2 className="display-font room-code-display">{roomCode}</h2>
          {isHost && <span className="phase-badge">Host</span>}
        </div>
        <p className="room-share-copy">
          Share this link: <span>{inviteUrl}</span>
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
        <span className="status-pill">{connectionLabel}</span>
        <button className="btn btn-secondary btn-sm" onClick={onLeaveRoom}>
          Leave Room
        </button>
      </div>
    </div>
  );
}

function LobbyScreen({
  room,
  players,
  localPlayerId,
  category,
  onCategoryChange,
  onStartRound,
  soloMode,
}) {
  const isHost = room.host_id === localPlayerId;

  return (
    <div className="screen">
      <div>
        <PhaseBadge label="Live Lobby" bg="#4D96FF" color="#fff" />
        <h1 className="display-font" style={{ fontSize: 34, color: '#7C5CFC', marginTop: 10 }}>
          Everyone&apos;s here. Time to stir the pot.
        </h1>
        <p style={{ fontSize: 15, color: '#888', marginTop: 6 }}>
          Players join with the room code, and the host starts the next prompt.
        </p>
      </div>

      <div className="panel-card">
        <div className="section-header">
          <span>Players ({players.length})</span>
          <span style={{ color: '#9B78FF' }}>First to {WIN_TARGET} pts wins</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {players.map((player, index) => (
            <div key={player.id} className="player-row">
              <div className="avatar" style={avatarStyle(index)}>{player.emoji}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, color: '#2a2340' }}>{player.name}</p>
                <p style={{ fontSize: 12, color: '#8a839d' }}>
                  {player.id === room.host_id ? 'Host' : 'Guest'}
                  {player.id === localPlayerId ? ' • You' : ''}
                </p>
              </div>
              <span className="score-chip">{player.score ?? 0} pts</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-card">
        <div className="section-header">
          <span>Category</span>
          <span>{isHost ? 'Host chooses' : 'Waiting on host'}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
          {[RANDOM_ALL_CATEGORY, ...Object.keys(PROMPTS)].map(option => (
            <button
              key={option}
              className={`btn btn-sm ${category === option ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onCategoryChange(option)}
              disabled={!isHost}
            >
              {option === RANDOM_ALL_CATEGORY
                ? '🎲 All Categories'
                : (CATEGORY_EMOJIS[option] ? `${CATEGORY_EMOJIS[option]} ${option}` : option)}
            </button>
          ))}
        </div>

        {isHost ? (
          <>
            <button className="btn btn-primary" onClick={onStartRound}>
              {soloMode ? 'Start Solo Test Round' : 'Start Round'}
            </button>
            {soloMode && (
              <p style={{ marginTop: 10, fontSize: 13, color: '#8a839d', textAlign: 'center' }}>
                You&apos;re the only real player right now, so the app will generate fake opponents for testing.
              </p>
            )}
          </>
        ) : (
          <div className="waiting-banner">The host will start the round for everyone.<WaitingDots /></div>
        )}
      </div>
    </div>
  );
}

function AnswerScreen({
  room,
  players,
  answers,
  localPlayerId,
  answerText,
  setAnswerText,
  onSubmitAnswer,
  onAdvanceToVote,
  soloMode,
}) {
  const myAnswer = answers.find(answer => answer.player_id === localPlayerId);
  const isHost = room.host_id === localPlayerId;
  const everyoneAnswered = soloMode ? Boolean(myAnswer) : (players.length > 0 && answers.length === players.length);
  const charLen = (myAnswer?.answer ?? answerText).length;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <PhaseBadge label={`Round ${room.round || 1}`} />
        <span className="status-pill">{answers.length}/{soloMode ? 4 : players.length} answered</span>
      </div>

      <div className="prompt-card">
        <PhaseBadge
          label={room.category === RANDOM_ALL_CATEGORY ? 'Random Category' : (room.category || DEFAULT_CATEGORY)}
          bg="#ffffff"
          color="#7C5CFC"
        />
        <p className="display-font" style={{ fontSize: 26, lineHeight: 1.35, marginTop: 14 }}>
          {room.prompt}
        </p>
      </div>

      <div className="panel-card">
        <p className="field-label">Your answer</p>
        <textarea
          className="answer-textarea"
          placeholder="Make your case..."
          maxLength={200}
          value={myAnswer?.answer ?? answerText}
          onChange={event => setAnswerText(event.target.value)}
          disabled={Boolean(myAnswer)}
        />
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 3, borderRadius: 2, background: '#eee', overflow: 'hidden' }}>
            <div style={{ width: `${(charLen / 200) * 100}%`, height: '100%', borderRadius: 2, background: charLen > 170 ? '#FF6B6B' : charLen > 130 ? '#FFD93D' : '#7C5CFC', transition: 'width 0.08s, background 0.2s' }} />
          </div>
          <span style={{ fontSize: 11, color: charLen > 170 ? '#FF6B6B' : '#bbb', minWidth: 22, textAlign: 'right' }}>{200 - charLen}</span>
        </div>

        {myAnswer ? (
          <div className="waiting-banner" style={{ background: '#eef9f0', color: '#2a7a40', borderColor: '#bce8c8' }}>
            ✓ {soloMode ? 'Locked in! Fake opponents are ready.' : 'Locked in! Waiting for everyone else.'}<WaitingDots />
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onSubmitAnswer}>
            Lock In My Answer
          </button>
        )}
      </div>

      {isHost && everyoneAnswered ? (
        <button className="btn btn-green" onClick={onAdvanceToVote}>
          Everyone Answered • Start Voting
        </button>
      ) : (
        <div className="waiting-banner">
          {everyoneAnswered ? 'Waiting for the host to advance the round.' : 'Answers will open automatically once everyone is ready.'}<WaitingDots />
        </div>
      )}
    </div>
  );
}

function VoteScreen({
  room,
  players,
  answers,
  votes,
  localPlayerId,
  onCastVote,
  onAdvanceToPredict,
  soloMode,
}) {
  const orderedAnswers = getOrderedAnswers(room, answers);

  const myVote = votes.find(vote => vote.player_id === localPlayerId);
  const everyoneVoted = soloMode ? Boolean(myVote) : (players.length > 0 && votes.length === players.length);
  const isHost = room.host_id === localPlayerId;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <PhaseBadge label="Anonymous Vote" bg="#FF6B6B" color="#fff" />
          <h2 className="display-font" style={{ fontSize: 24, marginTop: 10, color: '#1a1a1a' }}>
            Pick your favorite answer right now
          </h2>
        </div>
        <span className="status-pill">{votes.length}/{soloMode ? 4 : players.length} voted</span>
      </div>

      <div style={{ background: '#f7f5ff', borderRadius: 14, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#999', marginBottom: 4 }}>PROMPT</p>
        <p style={{ fontSize: 15, color: '#333' }}>{room.prompt}</p>
      </div>

      <div className="waiting-banner" style={{ textAlign: 'left' }}>
        This vote is just your personal favorite before anyone explains their answer.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orderedAnswers.map(answer => {
          const ownAnswer = answer.player_id === localPlayerId;
          const selected = myVote?.target_player_id === answer.player_id;
          return (
            <button
              key={answer.player_id}
              className={`answer-card answer-vote-button ${selected ? 'selected' : ''}`}
              onClick={() => onCastVote(answer.player_id)}
              disabled={ownAnswer || Boolean(myVote)}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="avatar" style={avatarStyle(orderedAnswers.findIndex(item => item.player_id === answer.player_id))}>
                  ?
                </div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontSize: 15, lineHeight: 1.5, color: '#222' }}>{answer.answer}</p>
                  {ownAnswer && <p style={{ fontSize: 12, color: '#aaa', marginTop: 4 }}>Your answer</p>}
                  {selected && <p className="vote-check" style={{ fontSize: 12, color: '#7C5CFC', marginTop: 4 }}>✓ Your pick</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {myVote ? (
        <div className="waiting-banner" style={{ background: '#eef9f0', color: '#2a7a40', borderColor: '#bce8c8' }}>✓ Vote in! Waiting for everyone.<WaitingDots /></div>
      ) : (
        <div className="waiting-banner">Choose the answer you personally like most. You can&apos;t vote for your own.</div>
      )}

      {isHost && everyoneVoted ? (
        <button className="btn btn-coral" onClick={onAdvanceToPredict}>
          Everyone Voted • Predict The Winner
        </button>
      ) : everyoneVoted ? (
        <div className="waiting-banner">Waiting for the host to move to predictions.<WaitingDots /></div>
      ) : null}
    </div>
  );
}

function PredictScreen({
  room,
  players,
  answers,
  predictions,
  localPlayerId,
  onPredict,
  onAdvanceToReveal,
  soloMode,
}) {
  const orderedAnswers = getOrderedAnswers(room, answers);
  const myPrediction = predictions.find(vote => vote.player_id === localPlayerId);
  const everyonePredicted = soloMode ? Boolean(myPrediction) : (players.length > 0 && predictions.length === players.length);
  const isHost = room.host_id === localPlayerId;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <PhaseBadge label="Secret Prediction" bg="#FFD93D" color="#5a3e00" />
          <h2 className="display-font" style={{ fontSize: 24, marginTop: 10, color: '#1a1a1a' }}>
            Predict which answer will win the room later
          </h2>
        </div>
        <span className="status-pill">{predictions.length}/{soloMode ? 4 : players.length} predicted</span>
      </div>

      <div className="waiting-banner" style={{ textAlign: 'left' }}>
        This is not necessarily your favorite. Pick the answer you think everyone else will end up choosing after the debate.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orderedAnswers.map(answer => {
          const selected = myPrediction?.target_player_id === answer.player_id;
          return (
            <button
              key={answer.player_id}
              className={`answer-card answer-vote-button ${selected ? 'selected' : ''}`}
              onClick={() => onPredict(answer.player_id)}
              disabled={Boolean(myPrediction)}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div className="avatar" style={avatarStyle(orderedAnswers.findIndex(item => item.player_id === answer.player_id))}>?</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontSize: 15, lineHeight: 1.5, color: '#222' }}>{answer.answer}</p>
                  {selected && <p className="vote-check" style={{ fontSize: 12, color: '#7C5CFC', marginTop: 4 }}>✓ Prediction locked</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {myPrediction && (
        <div className="waiting-banner" style={{ background: '#fffbeb', color: '#7a5000', borderColor: '#ffe08a' }}>
          ✓ Locked in! The reveal happens after everyone predicts.<WaitingDots />
        </div>
      )}

      {isHost && everyonePredicted ? (
        <button className="btn btn-yellow" style={{ color: '#5a3e00' }} onClick={onAdvanceToReveal}>
          Start The Reveal
        </button>
      ) : !myPrediction ? null : everyonePredicted ? (
        <div className="waiting-banner">Waiting for the host to reveal the answers.<WaitingDots /></div>
      ) : null}
    </div>
  );
}

function RevealScreen({ answers, players, room, votes, onContinue, isHost }) {
  const [flipped, setFlipped] = useState([]);
  const [timeLeft, setTimeLeft] = useState(60);
  const playerById = Object.fromEntries(players.map(player => [player.id, player]));
  const orderedAnswers = getOrderedAnswers(room, answers);
  const voteCounts = (votes || []).reduce((acc, vote) => {
    acc[vote.target_player_id] = (acc[vote.target_player_id] || 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    if (timeLeft <= 0) return undefined;
    const id = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(id);
  }, [timeLeft]);

  function toggle(playerId) {
    setFlipped(prev => (prev.includes(playerId) ? prev.filter(item => item !== playerId) : [...prev, playerId]));
  }

  return (
    <div className="screen">
      <div>
        <PhaseBadge label="The Big Reveal" bg="#6BCB77" color="#1a4020" />
        <h2 className="display-font" style={{ fontSize: 24, marginTop: 10, color: '#1a1a1a' }}>
          Reveal who said what
        </h2>
        <p style={{ fontSize: 14, color: '#888', marginTop: 4 }}>
          Tap cards to flip them, then let everyone defend their answer.
        </p>
      </div>

      <div>
        <div style={{ height: 4, background: '#eee', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${(timeLeft / 60) * 100}%`,
            background: timeLeft < 10 ? '#FF6B6B' : timeLeft < 20 ? '#FFD93D' : '#6BCB77',
            transition: 'width 1s linear, background 0.3s',
          }} />
        </div>
        <p style={{ fontSize: 12, color: timeLeft < 10 ? '#FF6B6B' : '#bbb', textAlign: 'right', marginTop: 4 }}>
          {timeLeft > 0 ? `${timeLeft}s to debate` : "⏱ Time's up — wrap it up!"}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orderedAnswers.map((answer, index) => {
          const player = playerById[answer.player_id];
          const isFlipped = flipped.includes(answer.player_id);

          return (
            <div key={answer.player_id} className="flip-card" onClick={() => toggle(answer.player_id)}>
              <div className={`flip-inner ${isFlipped ? 'flipped' : ''}`} style={{ minHeight: 92 }}>
                <div className="flip-front">
                  <div style={{ textAlign: 'center' }}>
                    <p className="display-font" style={{ fontSize: 18, opacity: 0.9 }}>Tap to reveal</p>
                    <p style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>Answer {index + 1}</p>
                  </div>
                </div>
                <div className="flip-back">
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div className="avatar" style={avatarStyle(index)}>{player?.emoji ?? '?'}</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: avatarStyle(index).background, marginBottom: 4 }}>
                        {player?.name ?? 'Mystery Player'}
                      </p>
                      <p style={{ fontSize: 15, lineHeight: 1.5, color: '#222' }}>{answer.answer}</p>
                      {(voteCounts[answer.player_id] ?? 0) > 0 && (
                        <p style={{ fontSize: 12, color: '#aaa', marginTop: 6 }}>
                          {voteCounts[answer.player_id]} first vote{voteCounts[answer.player_id] !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        className="btn btn-secondary"
        onClick={() => setFlipped(orderedAnswers.map(item => item.player_id))}
      >
        Reveal All
      </button>

      {isHost ? (
        <button className="btn btn-green" onClick={onContinue}>
          Everyone's Argued • Vote Again
        </button>
      ) : (
        <div className="waiting-banner">Waiting for the host to move to the final vote.<WaitingDots /></div>
      )}
    </div>
  );
}

function RevoteScreen({
  room,
  players,
  answers,
  vote1,
  revotes,
  localPlayerId,
  onRevote,
  onAdvanceToAwards,
  soloMode,
}) {
  const playerById = Object.fromEntries(players.map(player => [player.id, player]));
  const orderedAnswers = getOrderedAnswers(room, answers);
  const myRevote = revotes.find(vote => vote.player_id === localPlayerId);
  const everyoneRevoted = soloMode ? Boolean(myRevote) : (players.length > 0 && revotes.length === players.length);
  const isHost = room.host_id === localPlayerId;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <PhaseBadge label="Change Your Mind?" bg="#4D96FF" color="#fff" />
          <h2 className="display-font" style={{ fontSize: 24, marginTop: 10, color: '#1a1a1a' }}>
            Final vote after the debate
          </h2>
        </div>
        <span className="status-pill">{revotes.length}/{soloMode ? 4 : players.length} voted</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orderedAnswers.map((answer, index) => {
          const player = playerById[answer.player_id];
          const selected = myRevote?.target_player_id === answer.player_id;
          return (
            <button
              key={answer.player_id}
              className={`answer-card answer-vote-button ${selected ? 'selected' : ''}`}
              onClick={() => onRevote(answer.player_id)}
              disabled={Boolean(myRevote)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div className="avatar" style={avatarStyle(index)}>{player?.emoji ?? '?'}</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <p style={{ fontWeight: 600, fontSize: 13, color: avatarStyle(index).background, marginBottom: 4 }}>
                    {player?.name ?? 'Mystery Player'}
                  </p>
                  <p style={{ fontSize: 15, lineHeight: 1.5, color: '#222' }}>{answer.answer}</p>
                </div>
                {vote1.find(vote => vote.player_id === localPlayerId)?.target_player_id === answer.player_id && (
                  <span style={{ fontSize: 11, background: '#f0f0f0', padding: '2px 8px', borderRadius: 999, color: '#888', flexShrink: 0 }}>
                    your first vote
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {myRevote && !isHost && !everyoneRevoted && (
        <div className="waiting-banner" style={{ background: '#eef9f0', color: '#2a7a40', borderColor: '#bce8c8' }}>
          ✓ Final vote in! Waiting for everyone.<WaitingDots />
        </div>
      )}

      {isHost && everyoneRevoted ? (
        <button className="btn btn-primary" onClick={onAdvanceToAwards}>
          Awards Time
        </button>
      ) : everyoneRevoted ? (
        <div className="waiting-banner">Waiting for the host to open the awards.<WaitingDots /></div>
      ) : !myRevote ? (
        <div className="waiting-banner">Pick your final answer after hearing the arguments.</div>
      ) : null}
    </div>
  );
}

function AwardsScreen({ players, localPlayerId, awardSelections, onPickAward, onFinish, completionCount, totalPlayers, isHost, soloMode }) {
  const mySelections = awardSelections[localPlayerId] || {};
  const everyoneFinished = soloMode ? AWARDS.every(award => mySelections[award.id]) : completionCount === totalPlayers;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <PhaseBadge label="Awards Time!" bg="#FFD93D" color="#5a3e00" />
          <h2 className="display-font" style={{ fontSize: 24, marginTop: 10, color: '#1a1a1a' }}>
            Hand out the trophies
          </h2>
        </div>
        <span className="status-pill">{completionCount}/{totalPlayers} finished</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {AWARDS.map(award => (
          <div key={award.id} className="panel-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 22 }}>{award.emoji}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontWeight: 700, color: '#2a2340' }}>{award.label}</p>
                  <span style={{ fontSize: 11, background: '#f0edff', padding: '2px 8px', borderRadius: 999, color: '#7C5CFC', fontWeight: 700 }}>+{award.pts} pts</span>
                </div>
                <p style={{ fontSize: 13, color: '#8a839d' }}>{award.desc}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {players.map((player, index) => (
                <button
                  key={player.id}
                  className={`award-pick-card ${mySelections[award.id] === player.id ? 'selected' : ''}`}
                  onClick={() => onPickAward(award.id, player.id)}
                >
                  <div className="avatar" style={{ ...avatarStyle(index), margin: '0 auto 8px' }}>{player.emoji}</div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{player.name}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {isHost && everyoneFinished ? (
        <button className="btn btn-yellow" style={{ color: '#5a3e00' }} onClick={onFinish}>
          See Final Scores
        </button>
      ) : (
        <div className="waiting-banner">
          {everyoneFinished ? 'Waiting for the host to show the final scores.' : 'Choose a winner for each award before the room can finish.'}{everyoneFinished && <WaitingDots />}
        </div>
      )}
    </div>
  );
}

function ResultsScreen({ room, players, answers, revotes, vote1, predictions, localPlayerId, onNextRound, isHost }) {
  const [confetti, setConfetti] = useState([]);
  const answerByPlayerId = Object.fromEntries(answers.map(answer => [answer.player_id, answer]));
  const rankedPlayers = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winner = rankedPlayers[0];

  const vote1Counts = (vote1 || []).reduce((acc, v) => {
    acc[v.target_player_id] = (acc[v.target_player_id] || 0) + 1;
    return acc;
  }, {});
  const revoteCounts = revotes.reduce((acc, v) => {
    acc[v.target_player_id] = (acc[v.target_player_id] || 0) + 1;
    return acc;
  }, {});
  const maxRevotes = Math.max(0, ...Object.values(revoteCounts));
  const revoteWinnerIds = maxRevotes > 0 ? Object.keys(revoteCounts).filter(id => revoteCounts[id] === maxRevotes) : [];
  const predictionMap = Object.fromEntries((predictions || []).map(p => [p.player_id, p.target_player_id]));
  const correctPredictors = Object.keys(predictionMap).filter(pid => revoteWinnerIds.includes(predictionMap[pid]));
  const iPredictedRight = localPlayerId && revoteWinnerIds.includes(predictionMap[localPlayerId]);
  const vote1Map = Object.fromEntries((vote1 || []).map(v => [v.player_id, v.target_player_id]));
  const revoteMap = Object.fromEntries(revotes.map(v => [v.player_id, v.target_player_id]));
  const mindChangerIds = Object.keys(revoteMap).filter(pid => vote1Map[pid] && vote1Map[pid] !== revoteMap[pid]);
  const topScore = Math.max(0, ...players.map(p => p.score ?? 0));

  useEffect(() => {
    const colors = ['#7C5CFC', '#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF9F43'];
    setConfetti(Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: `${5 + Math.random() * 90}%`,
      color: colors[i % colors.length],
      size: 7 + Math.random() * 7,
      delay: `${Math.random() * 1.1}s`,
      duration: `${2.2 + Math.random() * 1.2}s`,
    })));
  }, []);

  return (
    <div className="screen">
      {confetti.map(dot => (
        <div key={dot.id} className="confetti-dot" style={{ left: dot.left, top: -10, width: dot.size, height: dot.size, background: dot.color, animationDelay: dot.delay, animationDuration: dot.duration }} />
      ))}
      <div style={{ textAlign: 'center' }}>
        <PhaseBadge label="Round Results" bg="#6BCB77" color="#1a4020" />
        <h1 className="display-font" style={{ fontSize: 34, color: '#7C5CFC', marginTop: 10 }}>
          {winner ? `🏆 ${winner.name} took the room` : 'Results are in'}
        </h1>
        <p style={{ fontSize: 15, color: '#888', marginTop: 6 }}>
          The votes are in. Own it or explain yourself.
        </p>
      </div>

      {topScore >= WIN_TARGET && (
        <div style={{ background: 'linear-gradient(135deg, #7C5CFC, #9B78FF)', borderRadius: 14, padding: '16px 20px', textAlign: 'center', color: '#fff' }}>
          <p style={{ fontSize: 28 }}>🏆</p>
          <p className="display-font" style={{ fontSize: 22 }}>{rankedPlayers[0].name} wins the game!</p>
          <p style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>First to {WIN_TARGET} points — game over!</p>
        </div>
      )}

      {predictions && predictions.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #ffe08a', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🔮</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, color: '#7a5000', fontSize: 14 }}>
                {correctPredictors.length}/{predictions.length} predicted the winner
              </p>
              {predictionMap[localPlayerId] && (
                <p style={{ fontSize: 13, color: iPredictedRight ? '#2a7a40' : '#999', marginTop: 2 }}>
                  {iPredictedRight ? '✓ You called it! +2 pts' : "Your prediction didn't land this round."}
                </p>
              )}
            </div>
          </div>
          {mindChangerIds.length > 0 && (
            <p style={{ fontSize: 13, color: '#8a839d', marginTop: 8, borderTop: '1px solid #ffe08a', paddingTop: 8 }}>
              ↩ {mindChangerIds.length} player{mindChangerIds.length !== 1 ? 's' : ''} changed their mind after the debate
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rankedPlayers.map((player, index) => {
          const answer = answerByPlayerId[player.id];
          const v1 = vote1Counts[player.id] ?? 0;
          const rv = revoteCounts[player.id] ?? 0;
          const mindSwitchCount = mindChangerIds.filter(pid => revoteMap[pid] === player.id).length;
          return (
            <div key={player.id} className="panel-card result-card" style={{ animationDelay: `${index * 0.1}s` }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div className="avatar avatar-lg" style={avatarStyle(index)}>{player.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <p className="display-font" style={{ fontSize: 20, color: '#36215d' }}>{player.name}</p>
                      <p style={{ fontSize: 13, color: '#8a839d' }}>
                        {v1} → {rv} vote{rv !== 1 ? 's' : ''}
                        {mindSwitchCount > 0 && <span style={{ color: '#7C5CFC', marginLeft: 6 }}>+{mindSwitchCount} switched</span>}
                      </p>
                    </div>
                    <span className="score-chip">{player.score ?? 0} pts total</span>
                  </div>
                  <p style={{ marginTop: 10, color: '#2a2340', lineHeight: 1.5 }}>
                    {answer?.answer || 'No answer submitted this round.'}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isHost ? (
        <button className="btn btn-primary" onClick={onNextRound}>
          Back To Lobby
        </button>
      ) : (
        <div className="waiting-banner">Waiting for the host to bring the room back to the lobby.<WaitingDots /></div>
      )}
    </div>
  );
}

function PhaseBadge({ label, bg = '#7C5CFC', color = '#fff' }) {
  return (
    <span className="phase-badge" style={{ background: bg, color }}>
      {label}
    </span>
  );
}

function WaitingDots() {
  return (
    <span className="waiting-dots" aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}

export default function App() {
  const [player, setPlayer] = useState(() => readStoredPlayer());
  const [playerName, setPlayerName] = useState(() => readStoredPlayer().name);
  const [joinCode, setJoinCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const initial = new URL(window.location.href).searchParams.get('room');
    return sanitizeRoomCode(initial || '');
  });
  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window === 'undefined') return '';
    const initial = new URL(window.location.href).searchParams.get('room');
    return sanitizeRoomCode(initial || '');
  });
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [votes, setVotes] = useState([]);
  const [categoryDraft, setCategoryDraft] = useState(DEFAULT_CATEGORY);
  const [answerText, setAnswerText] = useState('');
  const [soloPlayers, setSoloPlayers] = useState([]);
  const [soloAnswers, setSoloAnswers] = useState([]);
  const [soloVotes, setSoloVotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [connectionLabel, setConnectionLabel] = useState('Offline');

  async function loadRoomSnapshot(targetCode) {
    if (!supabase || !targetCode) return;

    const code = sanitizeRoomCode(targetCode);
    setSyncing(true);

    const roomQuery = supabase
      .from('rooms')
      .select('*')
      .eq('code', code)
      .maybeSingle();

    const playersQuery = supabase
      .from('players')
      .select('*')
      .eq('room_code', code)
      .order('joined_at', { ascending: true });

    const votesQuery = supabase
      .from('votes')
      .select('*')
      .eq('room_code', code);

    const [{ data: roomData, error: roomError }, { data: playerRows, error: playerError }, { data: voteRows, error: voteError }] = await Promise.all([
      roomQuery,
      playersQuery,
      votesQuery,
    ]);

    if (roomError || playerError || voteError) {
      setError(roomError?.message || playerError?.message || voteError?.message || 'Could not load room.');
      setSyncing(false);
      return;
    }

    if (!roomData) {
      setRoom(null);
      setPlayers([]);
      setAnswers([]);
      setVotes([]);
      setRoomCode('');
      updateRoomUrl('');
      setError('That room no longer exists.');
      setSyncing(false);
      return;
    }

    const answersQuery = roomData.round > 0
      ? supabase
        .from('answers')
        .select('*')
        .eq('room_code', code)
        .eq('round', roomData.round)
      : Promise.resolve({ data: [], error: null });

    const answerResult = await answersQuery;
    if (answerResult.error) {
      setError(answerResult.error.message);
      setSyncing(false);
      return;
    }

    const normalizedRoundState = normalizeRoundState(roomData.answer_order);
    const mergedPlayers = (playerRows || []).map(playerRow => ({
      ...playerRow,
      score: normalizedRoundState.scores[playerRow.id] ?? 0,
    }));

    setRoom({ ...roomData, answer_order: normalizedRoundState });
    setPlayers(mergedPlayers);
    setAnswers(answerResult.data || []);
    setVotes((voteRows || []).filter(vote => vote.round === roomData.round));
    setCategoryDraft(roomData.category || DEFAULT_CATEGORY);
    setRoomCode(code);
    updateRoomUrl(code);
    setSyncing(false);
  }

  useEffect(() => {
    persistPlayer(player);
  }, [player]);

  useEffect(() => {
    if (!supabase || !roomCode) return undefined;

    loadRoomSnapshot(roomCode);

    const channel = supabase
      .channel(`room-sync-${roomCode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` }, () => {
        loadRoomSnapshot(roomCode);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${roomCode}` }, () => {
        loadRoomSnapshot(roomCode);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: `room_code=eq.${roomCode}` }, () => {
        loadRoomSnapshot(roomCode);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room_code=eq.${roomCode}` }, () => {
        loadRoomSnapshot(roomCode);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnectionLabel('Live');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionLabel('Realtime error');
        } else {
          setConnectionLabel('Connecting...');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  function cycleEmoji() {
    setPlayer(prev => {
      const i = EMOJIS.indexOf(prev.emoji);
      return { ...prev, emoji: EMOJIS[(i + 1) % EMOJIS.length] };
    });
  }

  function ensureName() {
    const trimmed = playerName.trim();
    if (!trimmed) {
      setError('Add your name before creating or joining a room.');
      return null;
    }

    const nextPlayer = { ...player, name: trimmed };
    setPlayer(nextPlayer);
    return nextPlayer;
  }

  async function createRoom() {
    if (!supabase) return;
    const nextPlayer = ensureName();
    if (!nextPlayer) return;

    setLoading(true);
    setError('');

    let created = false;
    let attempts = 0;

    while (!created && attempts < 8) {
      attempts += 1;
      const code = randomCode();
      const { error: roomInsertError } = await supabase.from('rooms').insert({
        code,
        host_id: nextPlayer.id,
        current_phase: PHASES.LOBBY,
        round: 0,
        category: DEFAULT_CATEGORY,
        prompt: null,
        answer_order: createEmptyRoundState({}),
      });

      if (roomInsertError) {
        if (roomInsertError.code === '23505') continue;
        setError(roomInsertError.message);
        setLoading(false);
        return;
      }

      const { error: playerInsertError } = await supabase.from('players').upsert({
        room_code: code,
        id: nextPlayer.id,
        name: nextPlayer.name,
        emoji: nextPlayer.emoji,
        is_host: true,
      });

      if (playerInsertError) {
        setError(playerInsertError.message);
        await supabase.from('rooms').delete().eq('code', code);
        setLoading(false);
        return;
      }

      created = true;
      setRoomCode(code);
      setJoinCode(code);
      await loadRoomSnapshot(code);
    }

    if (!created) {
      setError('Could not generate a unique room code. Try again.');
    }

    setLoading(false);
  }

  async function joinRoom() {
    if (!supabase) return;
    const nextPlayer = ensureName();
    if (!nextPlayer) return;

    const code = sanitizeRoomCode(joinCode || roomCode);
    if (!code) {
      setError('Enter a room code first.');
      return;
    }

    setLoading(true);
    setError('');

    const { data: existingRoom, error: roomError } = await supabase
      .from('rooms')
      .select('code')
      .eq('code', code)
      .maybeSingle();

    if (roomError || !existingRoom) {
      setError(roomError?.message || 'That room could not be found.');
      setLoading(false);
      return;
    }

    const { error: playerError } = await supabase.from('players').upsert({
      room_code: code,
      id: nextPlayer.id,
      name: nextPlayer.name,
      emoji: nextPlayer.emoji,
      is_host: false,
    });

    if (playerError) {
      setError(playerError.message);
      setLoading(false);
      return;
    }

    setRoomCode(code);
    await loadRoomSnapshot(code);
    setLoading(false);
  }

  async function leaveRoom() {
    if (!supabase || !roomCode) return;

    setLoading(true);
    setError('');

    if (room?.host_id === player.id) {
      const { error: deleteRoomError } = await supabase.from('rooms').delete().eq('code', roomCode);
      if (deleteRoomError) {
        setError(deleteRoomError.message);
        setLoading(false);
        return;
      }
    } else {
      const { error: deletePlayerError } = await supabase
        .from('players')
        .delete()
        .eq('room_code', roomCode)
        .eq('id', player.id);

      if (deletePlayerError) {
        setError(deletePlayerError.message);
        setLoading(false);
        return;
      }
    }

    setRoom(null);
    setPlayers([]);
    setAnswers([]);
    setVotes([]);
    setSoloPlayers([]);
    setSoloAnswers([]);
    setSoloVotes([]);
    setRoomCode('');
    setJoinCode('');
    setCategoryDraft(DEFAULT_CATEGORY);
    setAnswerText('');
    updateRoomUrl('');
    setLoading(false);
  }

  async function updateLobbyCategory(nextCategory) {
    if (!supabase || !room || room.host_id !== player.id) return;
    setCategoryDraft(nextCategory);
    const { error: roomError } = await supabase.from('rooms').update({ category: nextCategory }).eq('code', room.code);
    if (roomError) {
      setError(roomError.message);
      return;
    }
    await loadRoomSnapshot(room.code);
  }

  async function updateRoomRoundState(nextState, nextPhase = room.current_phase) {
    if (!supabase || !room) return;
    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        current_phase: nextPhase,
        answer_order: nextState,
      })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
      return false;
    }

    await loadRoomSnapshot(room.code);
    return true;
  }

  async function startRound() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const nextRound = (room.round || 0) + 1;
    const category = categoryDraft || DEFAULT_CATEGORY;
    const prompt = promptForCategory(category);
    const roundState = normalizeRoundState(room.answer_order);

    setError('');
    setAnswerText('');
    setSoloPlayers([]);
    setSoloAnswers([]);
    setSoloVotes([]);

    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        current_phase: PHASES.ANSWER,
        round: nextRound,
        category,
        prompt,
        answer_order: createEmptyRoundState(roundState.scores),
      })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
      return;
    }

    await loadRoomSnapshot(room.code);
  }

  async function submitAnswer() {
    if (!supabase || !room) return;
    const trimmed = answerText.trim();
    if (!trimmed) {
      setError('Write an answer before locking it in.');
      return;
    }

    const { error: answerError } = await supabase.from('answers').upsert({
      room_code: room.code,
      round: room.round,
      player_id: player.id,
      answer: trimmed,
    });

    if (answerError) {
      setError(answerError.message);
      return;
    }

    if (players.length === 1) {
      const demoOpponents = buildSoloDemoOpponents(room.prompt, room.round);
      setSoloPlayers(demoOpponents);
      setSoloAnswers(demoOpponents.map(({ player_id, answer, name, emoji }) => ({
        player_id,
        answer,
        name,
        emoji,
      })));
    }

    setAnswerText('');
    await loadRoomSnapshot(room.code);
  }

  async function advanceToVote() {
    if (!supabase || !room || room.host_id !== player.id) return;

    let nextSoloPlayers = activeSoloPlayers;
    let nextSoloAnswers = activeSoloAnswers;

    if (players.length === 1 && nextSoloAnswers.length === 0) {
      nextSoloPlayers = buildSoloDemoOpponents(room.prompt, room.round);
      nextSoloAnswers = nextSoloPlayers.map(({ player_id, answer, name, emoji }) => ({
        player_id,
        answer,
        name,
        emoji,
      }));
      setSoloPlayers(nextSoloPlayers);
      setSoloAnswers(nextSoloAnswers);
    }

    const combinedAnswerIds = [
      ...answers.map(answer => answer.player_id),
      ...nextSoloAnswers.map(answer => answer.player_id),
    ];
    const currentState = normalizeRoundState(room.answer_order);
    await updateRoomRoundState({
      ...currentState,
      order: shuffle(combinedAnswerIds),
      predictions: {},
      votes1: {},
      revotes: {},
      awardsByVoter: {},
    }, PHASES.VOTE);
  }

  async function advanceToPredict() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const currentState = normalizeRoundState(room.answer_order);
    await updateRoomRoundState(currentState, PHASES.PREDICT);
  }

  async function castVote(targetPlayerId) {
    if (!supabase || !room) return;
    if (targetPlayerId === player.id) return;
    const currentState = normalizeRoundState(room.answer_order);
    const nextVotes = { ...currentState.votes1, [player.id]: targetPlayerId };

    if (players.length === 1) {
      activeSoloPlayers.forEach((bot, index) => {
        nextVotes[bot.id] = index === 0 ? player.id : targetPlayerId;
      });
    }

    await updateRoomRoundState({ ...currentState, votes1: nextVotes }, PHASES.VOTE);
  }

  async function submitPrediction(targetPlayerId) {
    if (!supabase || !room) return;
    const currentState = normalizeRoundState(room.answer_order);
    const nextPredictions = { ...currentState.predictions, [player.id]: targetPlayerId };

    if (players.length === 1) {
      activeSoloPlayers.forEach((bot, index) => {
        nextPredictions[bot.id] = (currentState.order || [])[index] || targetPlayerId;
      });
    }

    await updateRoomRoundState({ ...currentState, predictions: nextPredictions }, PHASES.PREDICT);
  }

  async function advanceToReveal() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const currentState = normalizeRoundState(room.answer_order);
    await updateRoomRoundState(currentState, PHASES.REVEAL);
  }

  async function advanceToRevote() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const currentState = normalizeRoundState(room.answer_order);
    await updateRoomRoundState(currentState, PHASES.REVOTE);
  }

  async function submitRevote(targetPlayerId) {
    if (!supabase || !room) return;
    const currentState = normalizeRoundState(room.answer_order);
    const nextRevotes = { ...currentState.revotes, [player.id]: targetPlayerId };

    if (players.length === 1) {
      activeSoloPlayers.forEach((bot, index) => {
        nextRevotes[bot.id] = index === 0 ? player.id : targetPlayerId;
      });
    }

    await updateRoomRoundState({ ...currentState, revotes: nextRevotes }, PHASES.REVOTE);
  }

  async function advanceToAwards() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const currentState = normalizeRoundState(room.answer_order);
    const nextAwardsByVoter = { ...currentState.awardsByVoter };

    if (players.length === 1) {
      activeSoloPlayers.forEach((bot, botIndex) => {
        nextAwardsByVoter[bot.id] = AWARDS.reduce((acc, award, awardIndex) => {
          const everyone = [...players, ...activeSoloPlayers];
          const target = everyone[(botIndex + awardIndex) % everyone.length];
          acc[award.id] = target.id;
          return acc;
        }, {});
      });
    }

    await updateRoomRoundState({ ...currentState, awardsByVoter: nextAwardsByVoter }, PHASES.AWARDS);
  }

  async function pickAward(awardId, playerId) {
    if (!supabase || !room) return;
    const currentState = normalizeRoundState(room.answer_order);
    const nextAwardsByVoter = {
      ...currentState.awardsByVoter,
      [player.id]: {
        ...(currentState.awardsByVoter[player.id] || {}),
        [awardId]: playerId,
      },
    };

    await updateRoomRoundState({ ...currentState, awardsByVoter: nextAwardsByVoter }, PHASES.AWARDS);
  }

  async function finishAwards() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const currentState = normalizeRoundState(room.answer_order);
    const nextScores = { ...currentState.scores };
    const revoteCounts = Object.values(currentState.revotes).reduce((acc, targetId) => {
      acc[targetId] = (acc[targetId] || 0) + 1;
      return acc;
    }, {});
    const maxVotes = Math.max(0, ...Object.values(revoteCounts));
    const winningAnswerIds = Object.keys(revoteCounts).filter(playerId => revoteCounts[playerId] === maxVotes);

    Object.entries(currentState.revotes).forEach(([voterId, targetId]) => {
      nextScores[targetId] = (nextScores[targetId] || 0) + 2;
      if (currentState.votes1[voterId] && currentState.votes1[voterId] !== targetId) {
        nextScores[voterId] = (nextScores[voterId] || 0) + 1;
      }
    });

    Object.entries(currentState.predictions).forEach(([voterId, targetId]) => {
      if (winningAnswerIds.includes(targetId)) {
        nextScores[voterId] = (nextScores[voterId] || 0) + 2;
      }
    });

    Object.values(currentState.awardsByVoter).forEach(selections => {
      AWARDS.forEach(award => {
        const targetId = selections?.[award.id];
        if (targetId) {
          nextScores[targetId] = (nextScores[targetId] || 0) + award.pts;
        }
      });
    });

    await updateRoomRoundState({ ...currentState, scores: nextScores }, PHASES.RESULTS);
  }

  async function backToLobby() {
    if (!supabase || !room || room.host_id !== player.id) return;
    setSoloPlayers([]);
    setSoloAnswers([]);
    setSoloVotes([]);

    const currentState = normalizeRoundState(room.answer_order);
    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        current_phase: PHASES.LOBBY,
        prompt: null,
        answer_order: createEmptyRoundState(currentState.scores),
      })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
      return;
    }

    await loadRoomSnapshot(room.code);
  }

  if (!supabase) {
    return <MissingSupabaseScreen />;
  }

  const joinedPlayer = players.find(existingPlayer => existingPlayer.id === player.id);
  const soloMode = players.length === 1;
  const roundState = normalizeRoundState(room?.answer_order);
  const activeSoloPlayers = soloMode
    ? (soloPlayers.length > 0 ? soloPlayers : buildSoloDemoOpponents(room?.prompt, room?.round || 0))
    : [];
  const activeSoloAnswers = soloMode
    ? (soloAnswers.length > 0
      ? soloAnswers
      : activeSoloPlayers.map(({ player_id, answer, name, emoji }) => ({
        player_id,
        answer,
        name,
        emoji,
      })))
    : [];
  const displayPlayers = soloMode
    ? [
      ...players.map(realPlayer => ({
        ...realPlayer,
        score: roundState.scores[realPlayer.id] ?? 0,
      })),
      ...activeSoloPlayers.map(bot => ({
        id: bot.id,
        name: bot.name,
        emoji: bot.emoji,
        score: roundState.scores[bot.id] ?? 0,
        is_host: false,
      })),
    ]
    : players;
  const displayAnswers = soloMode ? [...answers, ...activeSoloAnswers] : answers;
  const displayVotes = Object.entries(roundState.votes1).map(([playerId, targetPlayerId]) => ({ player_id: playerId, target_player_id: targetPlayerId }));
  const displayPredictions = Object.entries(roundState.predictions).map(([playerId, targetPlayerId]) => ({ player_id: playerId, target_player_id: targetPlayerId }));
  const displayRevotes = Object.entries(roundState.revotes).map(([playerId, targetPlayerId]) => ({ player_id: playerId, target_player_id: targetPlayerId }));
  const awardsByVoter = roundState.awardsByVoter;
  const awardCompletionCount = countCompletedAwards(awardsByVoter, displayPlayers.map(playerItem => playerItem.id));

  if (!roomCode || !room || !joinedPlayer) {
    return (
      <div className="game-root">
        <SetupScreen
          playerName={playerName}
          setPlayerName={setPlayerName}
          joinCode={joinCode}
          setJoinCode={setJoinCode}
          onCreateRoom={createRoom}
          onJoinRoom={joinRoom}
          loading={loading}
          suggestion={roomCode}
          playerEmoji={player.emoji}
          onEmojiChange={cycleEmoji}
        />
        {error && <div className="toast-error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="game-root">
      <RoomHeader
        roomCode={roomCode}
        isHost={room.host_id === player.id}
        onLeaveRoom={leaveRoom}
        connectionLabel={syncing ? 'Syncing...' : connectionLabel}
      />

      {room.current_phase === PHASES.LOBBY && (
        <LobbyScreen
          room={room}
          players={players}
          localPlayerId={player.id}
          category={categoryDraft}
          onCategoryChange={updateLobbyCategory}
          onStartRound={startRound}
          soloMode={soloMode}
        />
      )}

      {room.current_phase === PHASES.ANSWER && (
        <AnswerScreen
          room={room}
          players={players}
          answers={answers}
          localPlayerId={player.id}
          answerText={answerText}
          setAnswerText={setAnswerText}
          onSubmitAnswer={submitAnswer}
          onAdvanceToVote={advanceToVote}
          soloMode={soloMode}
        />
      )}

      {room.current_phase === PHASES.VOTE && (
        <VoteScreen
          room={room}
          players={displayPlayers}
          answers={displayAnswers}
          votes={displayVotes}
          localPlayerId={player.id}
          onCastVote={castVote}
          onAdvanceToPredict={advanceToPredict}
          soloMode={soloMode}
        />
      )}

      {room.current_phase === PHASES.PREDICT && (
        <PredictScreen
          room={room}
          players={displayPlayers}
          answers={displayAnswers}
          predictions={displayPredictions}
          localPlayerId={player.id}
          onPredict={submitPrediction}
          onAdvanceToReveal={advanceToReveal}
          soloMode={soloMode}
        />
      )}

      {room.current_phase === PHASES.REVEAL && (
        <RevealScreen
          room={room}
          players={displayPlayers}
          answers={displayAnswers}
          votes={displayVotes}
          onContinue={advanceToRevote}
          isHost={room.host_id === player.id}
        />
      )}

      {room.current_phase === PHASES.REVOTE && (
        <RevoteScreen
          room={room}
          players={displayPlayers}
          answers={displayAnswers}
          vote1={displayVotes}
          revotes={displayRevotes}
          localPlayerId={player.id}
          onRevote={submitRevote}
          onAdvanceToAwards={advanceToAwards}
          soloMode={soloMode}
        />
      )}

      {room.current_phase === PHASES.AWARDS && (
        <AwardsScreen
          players={displayPlayers}
          localPlayerId={player.id}
          awardSelections={awardsByVoter}
          onPickAward={pickAward}
          onFinish={finishAwards}
          completionCount={awardCompletionCount}
          totalPlayers={displayPlayers.length}
          isHost={room.host_id === player.id}
          soloMode={soloMode}
        />
      )}

      {room.current_phase === PHASES.RESULTS && (
        <ResultsScreen
          room={room}
          players={displayPlayers}
          answers={displayAnswers}
          revotes={displayRevotes}
          vote1={displayVotes}
          predictions={displayPredictions}
          localPlayerId={player.id}
          onNextRound={backToLobby}
          isHost={room.host_id === player.id}
        />
      )}

      {error && <div className="toast-error">{error}</div>}
    </div>
  );
}
