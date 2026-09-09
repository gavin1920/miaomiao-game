#!/usr/bin/env node
/* VI 手册构建器:把真实生产精灵图以 data URL 烧进手册,
   保证手册展示的素材与生产资产零漂移、且单文件自包含(不依赖素材的存放位置)。
   v2.2 起「拾取物/道具/UI 件」的生产位置是 pixel-assets/(游戏运行时 js/art_pixel.js
   按 manifest 加载的就是它),这些 key 直接从 pixel-assets/ 读取;
   其余角色/武器/地图等仍取自 lab/pixel-remake/assets/。
   用法:node tools/gen/build_vi_manual.mjs
   输入:tools/gen/vi_manual.template.html  ({{ASSET:key}} 占位符)
   输出:docs/VI手册.html                   (自包含,可直接打开/上线) */
'use strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (p) => join(ROOT, 'lab', 'pixel-remake', 'assets', p);
const P = (p) => join(ROOT, 'pixel-assets', p);

/* key → 素材相对路径
   A() = lab/pixel-remake/assets 下;P() = pixel-assets/(生产目录)下 */
const MANIFEST = {
  // 主角大橘(48×48)
  daju_idle1: A('characters/daju/idle_1.png'),
  daju_idle2: A('characters/daju/idle_2.png'),
  daju_idle3: A('characters/daju/idle_3.png'),
  daju_walk1: A('characters/daju/walk_1.png'),
  daju_walk2: A('characters/daju/walk_2.png'),
  daju_walk3: A('characters/daju/walk_3.png'),
  daju_walk4: A('characters/daju/walk_4.png'),
  daju_hurt: A('characters/daju/hurt_1.png'),
  daju_die1: A('characters/daju/die_1.png'),
  daju_die2: A('characters/daju/die_2.png'),
  daju_die3: A('characters/daju/die_3.png'),
  // 敌人(32×32)
  rat_idle1: A('characters/rat/idle_1.png'),
  rat_idle2: A('characters/rat/idle_2.png'),
  sparrow_idle1: A('characters/sparrow/idle_1.png'),
  snail_idle1: A('characters/snail/idle_1.png'),
  goose_idle1: A('characters/goose/idle_1.png'),
  bat_idle1: A('characters/bat/idle_1.png'),
  raccoon_idle1: A('characters/raccoon/idle_1.png'),
  bulldog_idle1: A('characters/bulldog/idle_1.png'),
  pigeon_idle1: A('characters/pigeon/idle_1.png'),
  calico_idle1: A('characters/calico/idle_1.png'),
  ratking_idle1: A('characters/ratking/idle_1.png'),
  mother_idle1: A('characters/mother/idle_1.png'),
  // 拾取物(v2.2 重制,生产位置 = pixel-assets/)
  gem1: P('items/pickups/gem_1/tier_1.png'),
  gem2: P('items/pickups/gem_2/tier_1.png'),
  gem3: P('items/pickups/gem_3/tier_1.png'),
  coin: P('items/pickups/coin/coin_1.png'),
  heart: A('items/pickups/heart/idle_1.png'),
  chest: A('items/pickups/chest/closed.png'),
  chest_open: A('items/pickups/chest/open.png'),
  stamp: A('items/pickups/stamp/idle_1.png'),
  // 武器图标(24×24)+ 进化
  w_claw: A('weapons/icons/claw.png'), w_claw_evo: A('weapons/icons/claw_evo.png'),
  w_note: A('weapons/icons/note.png'), w_note_evo: A('weapons/icons/note_evo.png'),
  w_fish: A('weapons/icons/fish.png'), w_fish_evo: A('weapons/icons/fish_evo.png'),
  w_axe: A('weapons/icons/axe.png'), w_axe_evo: A('weapons/icons/axe_evo.png'),
  w_orbit: A('weapons/icons/orbit.png'), w_orbit_evo: A('weapons/icons/orbit_evo.png'),
  w_aura: A('weapons/icons/aura.png'), w_aura_evo: A('weapons/icons/aura_evo.png'),
  w_litter: A('weapons/icons/litter.png'), w_litter_evo: A('weapons/icons/litter_evo.png'),
  w_zap: A('weapons/icons/zap.png'), w_zap_evo: A('weapons/icons/zap_evo.png'),
  // 被动道具图标(v2.2 重制项取生产目录 pixel-assets/,其余仍为 lab 24×24)
  i_milk: P('items/icons/milk.png'),
  i_catnip: A('items/icons/catnip.png'),
  i_koi: A('items/icons/koi.png'),
  i_gloves: A('items/icons/gloves.png'),
  i_firework: P('items/icons/firework.png'),
  i_vacuum: P('items/icons/vacuum.png'),
  i_magnetfish: A('items/icons/magnetfish.png'),
  i_yarnball: A('items/icons/yarnball.png'),
  i_bell: A('items/icons/bell.png'),
  // UI 件(v2.2 新增,生产位置 = pixel-assets/ui/)
  gear: P('ui/gear.png'),
  // 特效 / 道具
  fx_star1: A('fx/hitstar/s1.png'),
  fx_star3: A('fx/hitstar/s3.png'),
  p_light_on: A('props/lightbox/on.png'),
  p_light_off: A('props/lightbox/off.png'),
  p_hydrant: A('props/hydrant/idle_1.png'),
  p_vending: A('props/vending/on.png'),
  // 地图底 tile
  map_oldtown: A('maps/oldtown/tile.png'),
  map_sakura: A('maps/sakura/tile.png'),
  map_harbor: A('maps/harbor/tile.png'),
  map_onsen: A('maps/onsen/tile.png'),
  map_carnival: A('maps/carnival/tile.png'),
  map_endless: A('maps/endless/tile.png'),
  // M3 新增:夜色氛围 / 城市地物 / 精英标记
  decor_moon: A('props/decor/moon.png'),
  decor_fountain: A('props/decor/fountain.png'),
  decor_skyline: A('props/decor/skyline.png'),
  prop_stall: A('maps/oldtown/props/stall.png'),
  prop_lamp: A('maps/oldtown/props/lamp_on.png'),
  prop_bench: A('maps/oldtown/props/bench.png'),
  elite_crown: join(ROOT, 'lab/pixel-remake/test/pixel-assets/ui/elite_crown.png'),
  // M4 实机截图(裁掉浏览器框的版本,由 tools/gen/battle_live_crop.png 提供)
  battle_live: join(ROOT, 'tools/gen/battle_live_crop.png'),
};
/* 非图片资源(字体等) */
const FILE_AS_DATA = {
  px: join(ROOT, 'lab/pixel-remake/test/assets/fonts/fusion-pixel-12px-monospaced-zh_hans.ttf.woff2'),
};
/* 动图证据(较大,单独列出) */
const BIG = {
  gif_dajuwalk: join(ROOT, 'lab/pixel-remake/evidence_daju_walk.gif'),
};

const dataUrl = (p) => `data:${p.endsWith('.gif') ? 'image/gif' : 'image/png'};base64,${readFileSync(p).toString('base64')}`;

const tpl = readFileSync(join(ROOT, 'tools', 'gen', 'vi_manual.template.html'), 'utf8');
let out = tpl;
let missing = [];
for (const [k, p] of Object.entries(MANIFEST)) {
  const tag = `{{ASSET:${k}}}`;
  if (!out.includes(tag)) continue; // 模板未用到的素材跳过
  try { out = out.split(tag).join(dataUrl(p)); }
  catch (e) { missing.push(`${k}: ${e.message}`); }
}
for (const [k, p] of Object.entries(FILE_AS_DATA)) {
  const tag = `{{FONT:${k}}}`;
  if (!out.includes(tag)) continue;
  try { out = out.split(tag).join(`data:font/woff2;base64,${readFileSync(p).toString('base64')}`); }
  catch (e) { missing.push(`FONT ${k}: ${e.message}`); }
}
for (const [k, p] of Object.entries(BIG)) {
  const tag = `{{ASSET:${k}}}`;
  if (!out.includes(tag)) continue;
  try { out = out.split(tag).join(dataUrl(p)); }
  catch (e) { missing.push(`${k}: ${e.message}`); }
}
const leftover = out.match(/\{\{ASSET:[^}]+\}\}/g);
if (leftover) missing.push(`模板中未解析的占位符: ${leftover.join(', ')}`);
if (missing.length) { console.error('✗ 构建失败:\n' + missing.join('\n')); process.exit(1); }

const dst = join(ROOT, 'docs', 'VI手册.html');
writeFileSync(dst, out);
console.log(`✓ 已生成 ${dst}(${(out.length / 1024).toFixed(0)} KB,内嵌 ${Object.keys(MANIFEST).length + Object.keys(BIG).length} 项素材)`);
