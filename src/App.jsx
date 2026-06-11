import { useEffect, useState } from 'react';
import './App.css';
import { COLORS, PROMPTS } from './constants.js';
import { supabase, supabaseConfigError } from './lib/supabase.js';

const PHASES = {
  SETUP: 'setup',
  LOBBY: 'lobby',
  ANSWER: 'answer',
  VOTE: 'vote',
  RESULTS: 'results',
};

const EMOJIS = ['🦊', '🐸', '🦉', '🐙', '🐼', '🐯', '🦄', '🐻'];
const DEFAULT_CATEGORY = 'Food Wars';
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
  const options = PROMPTS[category] ?? PROMPTS[DEFAULT_CATEGORY];
  return options[Math.floor(Math.random() * options.length)];
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

function SetupScreen({
  playerName,
  setPlayerName,
  joinCode,
  setJoinCode,
  onCreateRoom,
  onJoinRoom,
  loading,
  suggestion,
}) {
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 className="display-font" style={{ fontSize: 44, color: '#7C5CFC', lineHeight: 1 }}>
          Hear Me Out
        </h1>
        <p style={{ fontSize: 15, color: '#888', marginTop: 8 }}>
          Create a live room, share a code, and play together in real time.
        </p>
      </div>

      <div className="panel-card room-setup-card">
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
}) {
  const isHost = room.host_id === localPlayerId;

  return (
    <div className="screen">
      <div>
        <p className="phase-badge">Live Lobby</p>
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
          <span>{players.length < 2 ? 'Need 2+ players' : 'Ready to play'}</span>
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
          {Object.keys(PROMPTS).map(option => (
            <button
              key={option}
              className={`btn btn-sm ${category === option ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => onCategoryChange(option)}
              disabled={!isHost}
            >
              {option}
            </button>
          ))}
        </div>

        {isHost ? (
          <button className="btn btn-primary" onClick={onStartRound} disabled={players.length < 2}>
            Start Round
          </button>
        ) : (
          <div className="waiting-banner">The host will start the round for everyone.</div>
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
}) {
  const myAnswer = answers.find(answer => answer.player_id === localPlayerId);
  const isHost = room.host_id === localPlayerId;
  const everyoneAnswered = players.length > 0 && answers.length === players.length;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <PhaseBadge label={`Round ${room.round || 1}`} />
        <span className="status-pill">{answers.length}/{players.length} answered</span>
      </div>

      <div className="prompt-card">
        <PhaseBadge label={room.category || DEFAULT_CATEGORY} bg="#ffffff" color="#7C5CFC" />
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
        <p style={{ textAlign: 'right', fontSize: 12, color: '#bbb', marginTop: 4 }}>
          {(myAnswer?.answer ?? answerText).length}/200
        </p>

        {myAnswer ? (
          <div className="waiting-banner">Answer locked in. Waiting for everyone else...</div>
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
          {everyoneAnswered ? 'Waiting for the host to advance the round.' : 'Answers will open automatically once everyone is ready.'}
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
  onRevealResults,
}) {
  const answerByPlayerId = Object.fromEntries(answers.map(answer => [answer.player_id, answer]));
  const orderedAnswers = (room.answer_order || [])
    .map(playerId => answerByPlayerId[playerId])
    .filter(Boolean);

  const myVote = votes.find(vote => vote.player_id === localPlayerId);
  const everyoneVoted = players.length > 0 && votes.length === players.length;
  const isHost = room.host_id === localPlayerId;

  return (
    <div className="screen">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <PhaseBadge label="Anonymous Vote" bg="#FF6B6B" color="#fff" />
          <h2 className="display-font" style={{ fontSize: 24, marginTop: 10, color: '#1a1a1a' }}>
            Pick the best answer
          </h2>
        </div>
        <span className="status-pill">{votes.length}/{players.length} voted</span>
      </div>

      <div style={{ background: '#f7f5ff', borderRadius: 14, padding: '14px 16px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: '#999', marginBottom: 4 }}>PROMPT</p>
        <p style={{ fontSize: 15, color: '#333' }}>{room.prompt}</p>
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
                  {selected && <p style={{ fontSize: 12, color: '#7C5CFC', marginTop: 4 }}>Your vote</p>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {myVote ? (
        <div className="waiting-banner">Vote submitted. Waiting for the room to finish.</div>
      ) : (
        <div className="waiting-banner">You can&apos;t vote for your own answer.</div>
      )}

      {isHost && everyoneVoted ? (
        <button className="btn btn-coral" onClick={onRevealResults}>
          Reveal Results
        </button>
      ) : everyoneVoted ? (
        <div className="waiting-banner">Waiting for the host to reveal the results.</div>
      ) : null}
    </div>
  );
}

function ResultsScreen({ room, players, answers, votes, onNextRound, isHost }) {
  const answerByPlayerId = Object.fromEntries(answers.map(answer => [answer.player_id, answer]));
  const rankedPlayers = [...players].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const winner = rankedPlayers[0];

  return (
    <div className="screen">
      <div style={{ textAlign: 'center' }}>
        <PhaseBadge label="Round Results" bg="#6BCB77" color="#1a4020" />
        <h1 className="display-font" style={{ fontSize: 34, color: '#7C5CFC', marginTop: 10 }}>
          {winner ? `${winner.name} took the room` : 'Results are in'}
        </h1>
        <p style={{ fontSize: 15, color: '#888', marginTop: 6 }}>
          Votes are now live for everyone in the room.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rankedPlayers.map((player, index) => {
          const answer = answerByPlayerId[player.id];
          const roundVotes = votes.filter(vote => vote.target_player_id === player.id).length;
          return (
            <div key={player.id} className="panel-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div className="avatar avatar-lg" style={avatarStyle(index)}>{player.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <p className="display-font" style={{ fontSize: 20, color: '#36215d' }}>{player.name}</p>
                      <p style={{ fontSize: 13, color: '#8a839d' }}>{roundVotes} round vote{roundVotes === 1 ? '' : 's'}</p>
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
        <div className="waiting-banner">Waiting for the host to bring the room back to the lobby.</div>
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

    const scoreMap = scoreMapForPlayers(playerRows || [], voteRows || []);
    const mergedPlayers = (playerRows || []).map(playerRow => ({
      ...playerRow,
      score: scoreMap[playerRow.id] ?? 0,
    }));

    setRoom(roomData);
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
        answer_order: [],
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
    await supabase.from('rooms').update({ category: nextCategory }).eq('code', room.code);
  }

  async function startRound() {
    if (!supabase || !room || room.host_id !== player.id) return;
    const nextRound = (room.round || 0) + 1;
    const category = categoryDraft || DEFAULT_CATEGORY;
    const prompt = promptForCategory(category);

    setError('');
    setAnswerText('');

    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        current_phase: PHASES.ANSWER,
        round: nextRound,
        category,
        prompt,
        answer_order: [],
      })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
      return;
    }
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

    setAnswerText('');
  }

  async function advanceToVote() {
    if (!supabase || !room || room.host_id !== player.id) return;

    const order = shuffle(answers.map(answer => answer.player_id));
    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        current_phase: PHASES.VOTE,
        answer_order: order,
      })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
    }
  }

  async function castVote(targetPlayerId) {
    if (!supabase || !room) return;
    if (targetPlayerId === player.id) return;

    const { error: voteError } = await supabase.from('votes').upsert({
      room_code: room.code,
      round: room.round,
      player_id: player.id,
      target_player_id: targetPlayerId,
    });

    if (voteError) {
      setError(voteError.message);
    }
  }

  async function revealResults() {
    if (!supabase || !room || room.host_id !== player.id) return;

    const { error: roomError } = await supabase
      .from('rooms')
      .update({ current_phase: PHASES.RESULTS })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
    }
  }

  async function backToLobby() {
    if (!supabase || !room || room.host_id !== player.id) return;

    const { error: roomError } = await supabase
      .from('rooms')
      .update({
        current_phase: PHASES.LOBBY,
        prompt: null,
        answer_order: [],
      })
      .eq('code', room.code);

    if (roomError) {
      setError(roomError.message);
    }
  }

  if (!supabase) {
    return <MissingSupabaseScreen />;
  }

  const joinedPlayer = players.find(existingPlayer => existingPlayer.id === player.id);

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
        />
      )}

      {room.current_phase === PHASES.VOTE && (
        <VoteScreen
          room={room}
          players={players}
          answers={answers}
          votes={votes}
          localPlayerId={player.id}
          onCastVote={castVote}
          onRevealResults={revealResults}
        />
      )}

      {room.current_phase === PHASES.RESULTS && (
        <ResultsScreen
          room={room}
          players={players}
          answers={answers}
          votes={votes}
          onNextRound={backToLobby}
          isHost={room.host_id === player.id}
        />
      )}

      {error && <div className="toast-error">{error}</div>}
    </div>
  );
}
