// tests/combat.test.js —— 闪避无敌帧边界 / 状态机打断优先级 / 闪避位移
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_PRIORITY, canTransition, isInvulnerableAt, tryDodge,
} from '../src/core/combat.js';
import { createPlayer } from '../src/core/progression.js';
import { makeState } from './helpers.js';

test('§3.5 无敌帧边界：第 0–13 tick 无敌，第 14 tick 起失效', () => {
  // invulnTicks=14 → dodgeTick ∈ [0, 14) 为真
  assert.equal(isInvulnerableAt(-1), false);
  assert.equal(isInvulnerableAt(0), true);
  assert.equal(isInvulnerableAt(1), true);
  assert.equal(isInvulnerableAt(13), true);
  assert.equal(isInvulnerableAt(14), false);
  assert.equal(isInvulnerableAt(16), false);
  assert.equal(isInvulnerableAt(17), false);
});

test('§7.2 状态优先级 dead > hurt > dodge > cast > attack > idle', () => {
  assert.ok(STATE_PRIORITY.dead > STATE_PRIORITY.hurt);
  assert.ok(STATE_PRIORITY.hurt > STATE_PRIORITY.dodge);
  assert.ok(STATE_PRIORITY.dodge > STATE_PRIORITY.cast);
  assert.ok(STATE_PRIORITY.cast > STATE_PRIORITY.attack);
  assert.ok(STATE_PRIORITY.attack > STATE_PRIORITY.idle);
});

test('§7.2 打断矩阵逐格校验', () => {
  const M = {
    idle:   { attack: true,  cast: true,  dodge: true,  hurt: true,  dead: true  },
    attack: { attack: false, cast: true,  dodge: true,  hurt: true,  dead: true  },
    cast:   { attack: false, cast: false, dodge: true,  hurt: true,  dead: true  },
    dodge:  { attack: false, cast: false, dodge: false, hurt: true,  dead: true  },
    hurt:   { attack: false, cast: false, dodge: true,  hurt: false, dead: true  },
    dead:   { attack: false, cast: false, dodge: false, hurt: false, dead: false },
  };
  for (const from of Object.keys(M)) {
    for (const to of Object.keys(M[from])) {
      assert.equal(canTransition(from, to), M[from][to], `${from} → ${to}`);
    }
  }
  // 未知状态 / 未知目标一律拒绝
  assert.equal(canTransition('unknown', 'idle'), false);
  assert.equal(canTransition('idle', 'unknown'), false);
});

test('§3.5 闪避：消耗 30 耐力、进 dodge、CD=36、位移 110px 且左右交替', () => {
  const s = makeState(0x11111111);
  s.player = createPlayer(s, 'lishi', s.meta);

  const p = s.player;
  assert.equal(p.stamina, 100);
  assert.equal(p.dodgeCount, 0);

  // 第 1 次闪避
  assert.equal(tryDodge(s), true);
  assert.equal(p.state, 'dodge');
  assert.equal(p.stamina, 70);              // 100 − 30
  assert.equal(p.dodgeCd, p.dodgeCdBase);   // 36
  assert.equal(p.dodgeCount, 1);
  const vx1 = p.dodgeVx;
  const vy1 = p.dodgeVy;
  // 位移速度 × 位移帧数 = 110px
  assert.ok(Math.abs(Math.hypot(vx1, vy1) * 10 - 110) < 1e-6);

  // 手动复位以便第 2 次闪避（不推进 tick，只验证方向交替）
  p.state = 'idle';
  p.dodgeCd = 0;
  p.stamina = 100;
  assert.equal(tryDodge(s), true);
  assert.equal(p.dodgeCount, 2);
  const vx2 = p.dodgeVx;
  const vy2 = p.dodgeVy;
  // 左右交替：两次速度方向相反
  assert.ok(vx1 * vx2 < 0 || vy1 * vy2 < 0, '两次闪避方向应左右交替');
  assert.ok(Math.abs(vx1 + vx2) < 1e-6, '两次水平速度应互为相反数');
  assert.ok(Math.abs(vy1 + vy2) < 1e-6, '两次垂直速度应互为相反数');
});

test('§3.5 闪避：耐力不足 / CD 未就绪 / 控制硬直不可受身', () => {
  const s = makeState(0x22222222);
  s.player = createPlayer(s, 'lishi', s.meta);
  const p = s.player;

  p.stamina = 29;
  assert.equal(tryDodge(s), false);       // 耐力 < 30
  p.stamina = 100;
  p.dodgeCd = 1;
  assert.equal(tryDodge(s), false);       // CD 未就绪
  p.dodgeCd = 0;
  p.state = 'hurt';
  p.stunTicks = 10;
  assert.equal(tryDodge(s), false);       // 眩晕硬直不可受身
  p.state = 'hurt';
  p.stunTicks = 0;
  assert.equal(tryDodge(s), true);        // 普通硬直可受身
});
