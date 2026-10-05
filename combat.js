export const RULES = Object.freeze({ end: 48, speed: 4.1, attackWindup: .19, attackRecover: .46, parryWindow: .48, guardCooldown: .8 });
const rounds = [{ z: 10, hp: 72, windup: 1.05, damage: 20, label: 'O peregrino', pattern: 'corte' }, { z: 25, hp: 104, windup: .83, damage: 23, label: 'A sentinela', pattern: 'investida' }, { z: 40, hp: 144, windup: 1.25, damage: 29, label: 'Guardião do eclipse', pattern: 'pesado' }];
export function createGame() {
  return { hero: { x: 0, z: 0, hp: 130, stamina: 100, guard: false, parry: 0, guardCooldown: 0, attack: 0, attackHit: false, attackId: 0, dodge: 0, dodgeX: 0, dodgeZ: 0, hurt: 0 }, enemy: null, round: 0, kills: 0, coins: 0, damage: 32, upgraded: false, auto: false, paused: true, status: 'playing', time: 0, events: [] };
}
function emit(g, type, extras = {}) { g.events.push({ type, ...extras }); }
export function clearControls(g) { g.auto = false; g.hero.guard = false; g.hero.parry = 0; }
export function setPaused(g, paused) { g.paused = paused; if (paused) clearControls(g); }
export function guard(g, down) {
  if (!down) { g.hero.guard = false; return; }
  const h = g.hero;
  if (g.paused || g.status !== 'playing' || h.guard || h.dodge > 0 || h.attack > 0) return;
  h.guard = true;
  if (h.guardCooldown <= 0 && h.stamina >= 18) { h.stamina -= 18; h.parry = RULES.parryWindow; h.guardCooldown = RULES.guardCooldown; emit(g, 'guard'); }
}
export function attack(g) {
  const h = g.hero;
  if (g.paused || g.status !== 'playing' || h.attack > 0 || h.dodge > 0 || h.stamina < 16) return false;
  h.attack = RULES.attackWindup + RULES.attackRecover; h.attackHit = false; h.attackId++; h.stamina -= 16; h.guard = false; h.parry = 0; emit(g, 'swing'); return true;
}
export function dodge(g, x = 0, z = 0) {
  const h = g.hero;
  if (g.paused || g.status !== 'playing' || h.dodge > 0 || h.attack > .36 || h.stamina < 23) return false;
  if (Math.hypot(x, z) < .15) { x = h.x > 0 ? -1 : 1; z = 0; }
  const length = Math.hypot(x, z);
  h.dodgeX = x / length; h.dodgeZ = z / length; h.dodge = .48; h.stamina -= 23; h.guard = false; h.parry = 0; emit(g, 'dodge'); return true;
}
export function upgrade(g) {
  if (g.coins < 25 || g.upgraded || g.status !== 'playing' || g.enemy) return false;
  g.coins -= 25; g.upgraded = true; g.damage = 40; emit(g, 'upgrade'); return true;
}
function death(g) { g.status = 'dead'; clearControls(g); emit(g, 'dead'); }
function kill(g) {
  const e = g.enemy;
  g.coins += 25; g.kills++; g.round++; g.hero.hp = Math.min(130, g.hero.hp + 32); g.hero.stamina = 100;
  emit(g, 'kill', { x: e.x, z: e.z }); g.enemy = null;
  emit(g, g.round < rounds.length ? 'rest' : 'gate');
}
export function step(g, delta, movement = { x: 0, z: 0 }) {
  if (g.paused || g.status !== 'playing') return;
  const dt = Math.max(0, Math.min(delta, 1 / 30));
  g.time += dt;
  const h = g.hero;
  h.parry = Math.max(0, h.parry - dt); h.guardCooldown = Math.max(0, h.guardCooldown - dt); h.hurt = Math.max(0, h.hurt - dt);
  const attackBefore = h.attack;
  h.attack = Math.max(0, h.attack - dt);
  h.stamina = Math.min(100, h.stamina + dt * (h.guard ? 12 : h.attack > 0 || h.dodge > 0 ? 0 : 27));
  let x = movement.x || 0, z = movement.z || 0;
  if (z < -.12) g.auto = false;
  if (g.auto && z >= -.12) z = 1;
  const norm = Math.max(1, Math.hypot(x, z)); x /= norm; z /= norm;
  if (h.dodge > 0) { h.x += h.dodgeX * dt * 9; h.z += h.dodgeZ * dt * 9; h.dodge = Math.max(0, h.dodge - dt); }
  else { const speed = RULES.speed * (h.guard ? .5 : h.attack > 0 ? .3 : 1); h.x += x * dt * speed; h.z += z * dt * speed; }
  h.x = Math.max(-3.3, Math.min(3.3, h.x));
  const limit = g.enemy ? rounds[g.round].z + 3.2 : g.round < rounds.length ? rounds[g.round].z + 3.2 : RULES.end;
  h.z = Math.max(0, Math.min(limit, h.z));
  if (!g.enemy && g.round < rounds.length && h.z >= rounds[g.round].z - 6) {
    const r = rounds[g.round]; g.enemy = { ...r, x: g.round % 2 ? 1 : -.5, z: r.z, maxHp: r.hp, phase: 'approach', timer: .5, attackHit: false, aimX: h.x, aimZ: h.z, hurt: 0 }; emit(g, 'encounter', { name: r.label });
    if (g.auto) { g.auto = false; emit(g, 'autoStop'); }
  }
  const e = g.enemy;
  if (e) {
    e.hurt = Math.max(0, e.hurt - dt);
    const dx = h.x - e.x, dz = h.z - e.z, distance = Math.hypot(dx, dz);
    if (attackBefore > RULES.attackRecover && h.attack <= RULES.attackRecover && !h.attackHit) {
      h.attackHit = true;
      if (distance <= 2.45) { e.hp -= g.damage; e.hurt = .22; emit(g, 'hit', { x: e.x, z: e.z }); if (e.hp <= 0) { kill(g); return; } }
      else emit(g, 'miss');
    }
    e.timer -= dt;
    if (e.phase === 'approach') {
      if (distance > 1.8) { e.x += dx / distance * dt * (g.round === 1 ? 2.65 : 2.1); e.z += dz / distance * dt * 2.3; }
      if (distance < 2.2 && e.timer <= 0) { e.phase = 'windup'; e.timer = e.windup; e.aimX = h.x; e.aimZ = h.z; e.attackHit = false; emit(g, 'tell', { pattern: e.pattern }); }
    } else if (e.phase === 'windup') {
      if (e.pattern === 'investida') { const n = Math.max(.01, distance); e.x -= dx / n * dt * .65; e.z -= dz / n * dt * .65; }
      if (e.timer <= 0) { e.phase = 'strike'; e.timer = .27; emit(g, 'enemySwing'); }
    } else if (e.phase === 'strike') {
      if (e.pattern === 'investida' && e.timer > .12) { const ax = e.aimX - e.x, az = e.aimZ - e.z, n = Math.max(.01, Math.hypot(ax, az)); e.x += ax / n * dt * 9; e.z += az / n * dt * 9; }
      if (e.timer <= .12 && !e.attackHit) {
        e.attackHit = true;
        const range = e.pattern === 'pesado' ? 3.1 : 2.65;
        const inRange = Math.hypot(h.x - e.x, h.z - e.z) < range;
        const inAim = Math.hypot(h.x - e.aimX, h.z - e.aimZ) < (e.pattern === 'pesado' ? 2.8 : 1.8);
        if (inRange && inAim && h.dodge <= 0) {
          if (h.parry > 0) { e.phase = 'stunned'; e.timer = 1.55; e.hp -= 12; h.stamina = Math.min(100, h.stamina + 22); h.parry = 0; emit(g, 'parry', { x: (e.x + h.x) / 2, z: (e.z + h.z) / 2 }); if (e.hp <= 0) { kill(g); return; } }
          else if (h.guard && h.stamina >= 22) { h.stamina -= 22; emit(g, 'block', { x: h.x, z: h.z }); }
          else { h.hp -= e.damage; h.hurt = .4; if (h.guard) { h.guard = false; h.stamina = 0; emit(g, 'guardBreak'); } emit(g, 'damage', { x: h.x, z: h.z }); if (h.hp <= 0) { death(g); return; } }
        } else emit(g, 'evade');
      }
      if (e.timer <= 0 && e.phase === 'strike') { e.phase = 'recover'; e.timer = e.pattern === 'pesado' ? 1.25 : .95; }
    } else if (e.timer <= 0) { e.phase = 'approach'; e.timer = .2; }
    e.x = Math.max(-3.5, Math.min(3.5, e.x));
  }
  if (g.kills === rounds.length && h.z >= RULES.end - .15) { g.status = 'won'; clearControls(g); emit(g, 'won'); }
}
