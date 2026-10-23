/**
 * A rough balance check of the story's missions (not a test): the hero is played by a practice bot of
 * the given difficulty — a stand-in for an average player — and every mission is run a few times from
 * different seeds; the line per mission says how often the bot won and in how long. The bot plays worse
 * than a person in one way (it fires its primary weapon at any range) and better in another (it never
 * hesitates), so read the numbers as «winnable or not», not as a win rate. The bot doesn't throw
 * grenades (it would blow itself up in the first seconds).
 *
 *   npm run story:balance -- [runs=6] [difficulty=normal] [mission id]
 */
import { BotBrain, NavGrid, STORY_MISSIONS, TICK_MS } from '@blatkom/shared';
import type { BotDifficulty } from '@blatkom/shared';
import { StorySession } from './StorySession.js';

const runs = Number(process.argv[2] ?? 6);
const difficulty = (process.argv[3] ?? 'normal') as BotDifficulty;
const only = process.argv[4];
for (const m of STORY_MISSIONS) {
  if (only && m.id !== only) continue;
  const lines: string[] = [];
  let wins = 0;
  let winMs = 0;
  for (let i = 0; i < runs; i++) {
    const s = new StorySession(m, { seed: 100 + i });
    s.world.players.get('local')!.gadget = null;
    const brain = new BotBrain('local', s.world, new NavGrid(s.world.collision), difficulty, 500 + i * 13);
    for (let t = 0; !s.outcome() && t < m.timeLimitMs + 10_000; t += TICK_MS) s.step(s.phase() === 'active' ? brain.nextInput() : null);
    const o = s.outcome();
    if (o?.result === 'win') {
      wins++;
      winMs += s.elapsedMs();
    }
    const st = s.heroStats();
    lines.push(`${o?.result ?? 'none'}${o?.reason ? `/${o.reason}` : ''}@${Math.round(s.elapsedMs() / 1000)}s k${st.kills}d${st.deaths}`);
  }
  const goal = 'limit' in m.objective ? `${m.objective.kind} ${m.objective.limit}` : m.objective.kind;
  console.log(`${m.id} (${goal}): ${wins}/${runs} won${wins ? `, ${Math.round(winMs / wins / 1000)} s on average` : ''} | ${lines.join(' ')}`);
}
