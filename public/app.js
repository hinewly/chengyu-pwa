/* 成语接龙 · DaoBox 家族（v0.1.0） */
"use strict";

var APP_VERSION = "v0.2.0";
var STORE_KEY = "dbcy-save";
var CHAIN_BASE = 10;   // 接龙基础分
var CHAIN_END_BONUS = 30; // 接到底奖励
var BLANK_BASE = 5;    // 填空基础分
var STREAK_BONUS_EVERY = 5; // 每连击 5 题额外奖励
var STREAK_BONUS = 20;

var DB = (typeof CHENGYU_DB !== "undefined") ? CHENGYU_DB : [];

var mode = "chain";     // chain | blank
var scoreChain = 0, scoreBlank = 0;
var bestChain = 0, bestBlank = 0;
var streak = 0;
var currentIdiom = null;   // 接龙当前成语 {w,p}
var currentBlank = null;   // 填空当前成语 {w,p,pos}
var locked = false;        // 时长超时锁定
var answering = false;     // 结算中

function $(id) { return document.getElementById(id); }
function score() { return mode === "chain" ? scoreChain : scoreBlank; }
function best() { return mode === "chain" ? bestChain : bestBlank; }

/* ---------- 索引 ---------- */
var byFirstChar = {};  // 首字 -> [i]
var byFirstPy = {};    // 首音节 -> [i]
function buildIndex() {
  for (var i = 0; i < DB.length; i++) {
    var it = DB[i];
    var c = it.w.charAt(0);
    var py = it.p.split(" ")[0];
    (byFirstChar[c] = byFirstChar[c] || []).push(i);
    (byFirstPy[py] = byFirstPy[py] || []).push(i);
  }
}

// 尾字（或同音）可接的候选（排除自身）
function followersOf(idiom) {
  var tail = idiom.w.charAt(3);
  var tailPy = idiom.p.split(" ")[3];
  var pool = [];
  var seen = {};
  var a = byFirstChar[tail] || [], b = byFirstPy[tailPy] || [];
  for (var i = 0; i < a.length; i++) { if (a[i] !== idiom.i && !seen[a[i]]) { seen[a[i]] = 1; pool.push(a[i]); } }
  for (var j = 0; j < b.length; j++) { if (b[j] !== idiom.i && !seen[b[j]]) { seen[b[j]] = 1; pool.push(b[j]); } }
  return pool;
}

function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }
function shuffled(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = rand(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ---------- 存档 ---------- */
function saveGame() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      bestChain: bestChain, bestBlank: bestBlank
    }));
  } catch (err) {}
}
function loadGame() {
  try {
    var d = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    bestChain = d.bestChain || 0;
    bestBlank = d.bestBlank || 0;
    return true;
  } catch (err) { return false; }
}

/* ---------- 出题：接龙 ---------- */
function startChain() {
  // 优先挑可接（且接上后还能继续接）的成语做起点
  var candidates = [];
  for (var t = 0; t < 30; t++) {
    var i = rand(DB.length);
    var it = { i: i, w: DB[i].w, p: DB[i].p };
    var fs = followersOf(it);
    var withLookahead = fs.filter(function (fi) { return followersOf({ i: fi, w: DB[fi].w, p: DB[fi].p }).length > 0; });
    if (fs.length > 0) { candidates.push(it); if (withLookahead.length > 0) { candidates.push(it); } }
  }
  currentIdiom = candidates.length ? pick(candidates) : { i: rand(DB.length), w: DB[0].w, p: DB[0].p };
  $("chain-strip").innerHTML = "";
  addChainChip(currentIdiom);
  makeChainQuestion();
}

function addChainChip(idiom) {
  var strip = $("chain-strip");
  var chip = document.createElement("span");
  chip.className = "chain-chip latest";
  chip.textContent = idiom.w;
  var old = strip.querySelector(".latest");
  if (old) old.classList.remove("latest");
  strip.appendChild(chip);
  strip.scrollLeft = strip.scrollWidth;
  while (strip.children.length > 12) strip.removeChild(strip.firstChild);
}

function makeChainQuestion() {
  var tail = currentIdiom.w.charAt(3);
  var tailPy = currentIdiom.p.split(" ")[3];
  $("tail-char").textContent = tail;
  $("tail-py").textContent = "读音：" + tailPy;

  var fs = followersOf(currentIdiom);
  if (fs.length === 0) {
    // 接到底
    scoreChain += CHAIN_END_BONUS;
    earnNut(3, "接龙到底");
    showFeedback("good", "🎉 接到底啦！奖励 +" + CHAIN_END_BONUS + " · 🌰+3");
    updateHud();
    saveGame();
    setTimeout(function () { if (!locked) startChain(); }, 1400);
    return;
  }
  // 优先选接上后还能继续的，保持链条长
  var good = fs.filter(function (fi) { return followersOf({ i: fi, w: DB[fi].w, p: DB[fi].p }).length > 0; });
  var correctIdx = pick(good.length ? good : fs);

  var distractors = [];
  var guard = 0;
  while (distractors.length < 3 && guard++ < 400) {
    var k = rand(DB.length);
    if (k === correctIdx) continue;
    var w = DB[k].w, py = DB[k].p.split(" ")[0];
    if (w.charAt(0) === tail || py === tailPy) continue; // 干扰项必须明显不接
    if (distractors.indexOf(k) !== -1) continue;
    distractors.push(k);
  }

  var options = shuffled([{ i: correctIdx, ok: true }].concat(distractors.map(function (di) { return { i: di, ok: false }; })));
  renderOptions(options, DB[correctIdx]);
}

/* ---------- 出题：填空 ---------- */
function makeBlankQuestion() {
  var i = rand(DB.length);
  var it = DB[i];
  var pos = 1 + rand(3); // 隐藏第 2~4 字，保留首字方便联想
  currentBlank = { w: it.w, p: it.p, pos: pos };
  var answer = it.w.charAt(pos);
  var chars = [];
  var guard = 0;
  while (chars.length < 3 && guard++ < 500) {
    var k = rand(DB.length);
    var p2 = rand(4);
    var ch = DB[k].w.charAt(p2);
    if (ch === answer || chars.indexOf(ch) !== -1) continue;
    chars.push(ch);
  }
  var options = shuffled([{ ch: answer, ok: true }].concat(chars.map(function (c) { return { ch: c, ok: false }; })));
  var pys = it.p.split(" ");
  $("blank-idiom").innerHTML = "";
  for (var x = 0; x < 4; x++) {
    if (x > 0) $("blank-idiom").appendChild(document.createTextNode(""));
    if (x === pos) {
      var hole = document.createElement("span");
      hole.className = "hole";
      hole.textContent = "?";
      $("blank-idiom").appendChild(hole);
    } else {
      $("blank-idiom").appendChild(document.createTextNode(it.w.charAt(x)));
    }
  }
  $("blank-py").textContent = "拼音：" + pys.map(function (p, idx2) { return idx2 === pos ? "__" : p; }).join(" ");
  renderOptions(options.map(function (o) { return { ch: o.ch, ok: o.ok }; }), { w: answer });
}

/* ---------- 渲染选项 ---------- */
function renderOptions(options, correctRef) {
  var box = $("options");
  box.innerHTML = "";
  box.classList.remove("locked");
  options.forEach(function (o) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opt";
    var word = document.createElement("div");
    word.className = "opt-word";
    var py = document.createElement("div");
    py.className = "opt-py";
    if (o.i !== undefined) {
      word.textContent = DB[o.i].w;
      py.textContent = DB[o.i].p;
    } else {
      word.textContent = o.ch;
      py.textContent = "\u00a0";
    }
    btn.appendChild(word);
    btn.appendChild(py);
    btn.addEventListener("click", function () { onAnswer(btn, o, correctRef); });
    o.el = btn;
    box.appendChild(btn);
  });
}

/* ---------- 答题结算 ---------- */
function onAnswer(btn, o, correctRef) {
  if (answering || locked) return;
  answering = true;
  var box = $("options");
  box.classList.add("locked");

  if (o.ok) {
    btn.classList.add("correct");
    streak++;
    earnNut(bonus ? 2 : 1, mode === "chain" ? "接龙答对" : "填空答对");
    var gain = (mode === "chain" ? CHAIN_BASE : BLANK_BASE);
    var bonus = 0;
    if (streak > 0 && streak % STREAK_BONUS_EVERY === 0) bonus = STREAK_BONUS;
    if (mode === "chain") {
      scoreChain += gain + bonus;
      addChainChip(correctRef && correctRef.w ? { w: correctRef.w } : { w: o.el.querySelector(".opt-word").textContent });
      currentIdiom = { i: o.i, w: DB[o.i].w, p: DB[o.i].p };
      showFeedback("good", "✓ 答对了 +" + gain + (bonus ? "　🔥 连击 x" + streak + " 额外 +" + bonus : ""));
    } else {
      scoreBlank += gain + bonus;
      showFeedback("good", "✓ " + (currentBlank ? currentBlank.w : "") + " +" + gain + (bonus ? "　🔥 连击 x" + streak + " 额外 +" + bonus : ""));
    }
    updateHud();
    saveGame();
    setTimeout(function () {
      hideFeedback();
      if (locked) { answering = false; return; }
      if (mode === "chain") { makeChainQuestion(); } else { makeBlankQuestion(); }
      answering = false;
    }, 900);
  } else {
    btn.classList.add("wrong");
    streak = 0;
    // 高亮正确项，其余变暗
    var opts = box.querySelectorAll(".opt");
    opts.forEach(function (el) {
      if (el !== btn && !el.classList.contains("wrong")) el.classList.add("dim");
    });
    // 找到正确按钮标绿
    var optEls = Array.prototype.slice.call(opts);
    var correctBtn = null;
    if (o.i !== undefined) {
      correctBtn = optEls.filter(function (el) { return el.querySelector(".opt-word").textContent === (correctRef && correctRef.w); })[0];
    } else {
      correctBtn = optEls.filter(function (el) { return el.querySelector(".opt-word").textContent === correctRef.w; })[0];
    }
    if (correctBtn) correctBtn.classList.add("correct");
    var ans = correctRef && correctRef.w ? correctRef.w : (correctBtn ? correctBtn.querySelector(".opt-word").textContent : "");
    if (mode === "blank" && currentBlank) {
      ans = currentBlank.w + "（" + currentBlank.p + "）";
    }
    showFeedback("bad", "✗ 正确答案：" + ans + "　连击清零");
    updateHud();
    setTimeout(function () {
      hideFeedback();
      if (locked) { answering = false; return; }
      if (mode === "chain") {
        // 用正确答案继续接（提示已学过）
        if (correctRef && correctRef.w) {
          currentIdiom = { i: DB.findIndex(function (d) { return d.w === correctRef.w; }), w: correctRef.w, p: correctRef.p };
          addChainChip(currentIdiom);
          makeChainQuestion();
        } else { makeChainQuestion(); }
      } else { makeBlankQuestion(); }
      answering = false;
    }, 1600);
  }
}

/* ---------- 反馈 / HUD ---------- */
function showFeedback(kind, text) {
  var el = $("feedback");
  el.className = "feedback " + kind;
  el.textContent = text;
}
function hideFeedback() { $("feedback").className = "feedback hidden"; }

function updateHud() {
  $("score").textContent = score();
  $("streak").textContent = streak;
  $("best").textContent = best();
  if (score() > best()) {
    if (mode === "chain") bestChain = scoreChain; else bestBlank = scoreBlank;
    $("best").textContent = best();
    saveGame();
  }
}


/* ---------- 浣熊树林（2026-10-28 儿童奖励体系：答对赚聪明果 → 兑换浣熊盲盒 → 图鉴收集） ---------- */
var RACCOON_STORE_KEY = "dbcy_reward_v1";
var RACCOON_TYPES = [
  { key: "smart",  emoji: "💡", name: "机灵浣熊" },
  { key: "wash",   emoji: "🧼", name: "爱干净浣熊" },
  { key: "hat",    emoji: "🎩", name: "绅士浣熊" },
  { key: "scarf",  emoji: "🧣", name: "围巾浣熊" },
  { key: "hungry", emoji: "🍪", name: "饿饿浣熊" },
  { key: "sleepy", emoji: "💤", name: "瞌睡浣熊" },
  { key: "sport",  emoji: "⚽", name: "运动浣熊" },
  { key: "star",   emoji: "🌟", name: "明星浣熊" },
  { key: "rainbow",emoji: "🌈", name: "彩虹浣熊", memberOnly: true },
  { key: "diamond",emoji: "💎", name: "钻石浣熊", memberOnly: true },
];
var RACCOON_PRICE = 30;             // 30 聪明果/只
var RACCOON_FREE_LIMIT = 6;         // 游客免费额度
var RACCOON_REGISTERED_LIMIT = 30;  // 注册用户额度（会员不限）

function loadRaccoon() {
  try {
    var d = JSON.parse(localStorage.getItem(RACCOON_STORE_KEY));
    return (d && typeof d.token === "number" && d.col) ? d
      : { token: 0, tokenRecords: [], col: { total: 0, byType: {}, records: [] } };
  } catch (e) { return { token: 0, tokenRecords: [], col: { total: 0, byType: {}, records: [] } }; }
}
function saveRaccoon(d) { try { localStorage.setItem(RACCOON_STORE_KEY, JSON.stringify(d)); } catch (e) {} }

function chengyuTier() {
  try { if (window.DaoBox && DaoBox.getTimeStatus && DaoBox._cyMember === undefined) DaoBox._cyMember = false; } catch (e) {}
  var member = false;
  try { member = !!(window.DaoBox && DaoBox._cyMember); } catch (e) {}
  if (member) return "member";
  var logged = false;
  try { logged = !!(window.DaoBox && DaoBox.user); } catch (e) {}
  return logged ? "registered" : "guest";
}
// 会员状态：启动后拉一次 timeStatus
try {
  if (window.DaoBox && DaoBox.getTimeStatus) {
    DaoBox.getTimeStatus().then(function (t) { DaoBox._cyMember = !!(t && t.unlimited); }).catch(function () {});
  }
} catch (e) {}

function raccoonLimit() {
  var t = chengyuTier();
  return t === "member" ? Infinity : t === "registered" ? RACCOON_REGISTERED_LIMIT : RACCOON_FREE_LIMIT;
}

function earnNut(n, reason) {
  var d = loadRaccoon();
  d.token += n;
  var dt = new Date();
  d.tokenRecords.unshift({ date: (dt.getMonth() + 1) + "月" + dt.getDate() + "日", score: reason, n: n });
  d.tokenRecords = d.tokenRecords.slice(0, 40);
  saveRaccoon(d);
  chengyuRewardSync();
  updateRaccoonBar();
}

function exchangeRaccoon() {
  if (loadRaccoon().col.total >= raccoonLimit()) { showUnlockCy(); return; }
  var d = loadRaccoon();
  if (d.token < RACCOON_PRICE) { showFeedback("bad", "🌰 聪明果不够，还差 " + (RACCOON_PRICE - d.token) + " 个～"); return; }
  var pool = chengyuTier() === "member" ? RACCOON_TYPES : RACCOON_TYPES.filter(function (t) { return !t.memberOnly; });
  var fresh = pool.filter(function (t) { return !d.col.byType[t.key]; });
  var pickPool = fresh.length ? fresh : pool;
  var t = pickPool[Math.floor(Math.random() * pickPool.length)];
  d.token -= RACCOON_PRICE;
  var dt = new Date();
  d.tokenRecords.unshift({ date: (dt.getMonth() + 1) + "月" + dt.getDate() + "日", score: "兑换浣熊", n: -RACCOON_PRICE });
  d.tokenRecords = d.tokenRecords.slice(0, 40);
  d.col.total += 1;
  d.col.byType[t.key] = (d.col.byType[t.key] || 0) + 1;
  d.col.records.unshift({ seq: d.col.total, date: (dt.getMonth() + 1) + "月" + dt.getDate() + "日", type: t.key });
  d.col.records = d.col.records.slice(0, 60);
  saveRaccoon(d);
  chengyuRewardSync();
  updateRaccoonBar();
  showFeedback("good", "🎉 恭喜获得 " + t.emoji + t.name + "！");
}

function showUnlockCy() {
  var old = document.getElementById("cy-unlock-mask");
  if (old) old.remove();
  var mask = document.createElement("div");
  mask.id = "cy-unlock-mask";
  mask.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:999;padding:16px";
  var limit = raccoonLimit() === Infinity ? RACCOON_FREE_LIMIT : raccoonLimit();
  var accountUrl = (window.DB_HOME || "https://daobox.app") + "/account.html?src=chengyu";
  mask.innerHTML = '<div style="background:#fff;border-radius:18px;padding:22px;max-width:340px;width:100%;text-align:center">' +
    '<div style="font-size:40px">🦝</div><h3 style="margin:6px 0">免费浣熊已兑完</h3>' +
    '<p style="font-size:14px;color:#374151;line-height:1.6">宝宝已经免费兑换了 ' + limit + ' 只浣熊，做得非常棒！<br>继续答题、赚聪明果都不受影响，<br>兑换新的浣熊需要爸爸妈妈解锁～</p>' +
    '<p style="font-size:13px;color:#b45309"><b>推广价 ¥9.9 / 99 天</b>（原价 ¥19.9）<br>1 点 = 1 天 · 全家族通用</p>' +
    '<a href="' + accountUrl + '" style="display:block;background:#f59e0b;color:#fff;padding:11px;border-radius:10px;font-weight:600;text-decoration:none;margin:10px 0">去账号中心充值（支付宝）</a>' +
    '<button onclick="document.getElementById(\'cy-unlock-mask\').remove()" style="background:none;border:none;color:#6b7280;font-size:13px;cursor:pointer">先不兑换，继续攒果</button></div>';
  document.body.appendChild(mask);
  mask.addEventListener("click", function (e) { if (e.target === mask) mask.remove(); });
}

/* 云同步（app=chengyu，2026-10-28） */
var cySyncDirty = false, cySyncTimer = null;
function chengyuRewardSync() {
  cySyncDirty = true;
  clearTimeout(cySyncTimer);
  cySyncTimer = setTimeout(cyDoSync, 3000);
}
function cyDoSync() {
  var token = null;
  var hasUser = !!(window.DaoBox && DaoBox.user);
  if (!hasUser || !cySyncDirty) return;
  cySyncDirty = false;
  var d = loadRaccoon();
  var species = 0;
  RACCOON_TYPES.forEach(function (t) { if (d.col.byType[t.key]) species++; });
  var payload = {
    app: "chengyu", updated: Date.now(),
    rewards: {
      token: { key: "nut", name: "聪明果", emoji: "🌰", total: d.token },
      collection: {
        name: "浣熊树林", emoji: "🦝",
        total: d.col.total, species: species, speciesMax: RACCOON_TYPES.length,
        items: d.col.records.slice(0, 20).map(function (r) { return { species: r.type, seq: r.seq, date: r.date }; }),
      },
    },
  };
  fetch((window.DB_HOME || "https://daobox.app") + "/api/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ app: "chengyu", data: JSON.stringify(payload) }),
  }).catch(function () {});
}
function cySyncOnLogin() {
  if (!(window.DaoBox && DaoBox.user)) return;
  fetch((window.DB_HOME || "https://daobox.app") + "/api/backup?app=chengyu", { credentials: "include" })
    .then(function (r) { return r.json(); })
    .then(function (dd) {
      var cloud = dd && dd.ok && dd.data ? JSON.parse(dd.data) : null;
      var local = loadRaccoon();
      if (cloud && cloud.rewards) {
        var t = (cloud.rewards.token || {}).total || 0;
        var col = cloud.rewards.collection || {};
        if (t > local.token || (col.total || 0) > local.col.total) {
          local.token = Math.max(local.token, t);
          local.col = { total: Math.max(local.col.total, col.total || 0), byType: {}, records: [] };
          (col.items || []).forEach(function (it) { local.col.byType[it.species] = (local.col.byType[it.species] || 0) + 1; local.col.records.push(it); });
          saveRaccoon(local);
          updateRaccoonBar();
        }
      }
    }).catch(function () {});
}

/* 浣熊树林视图 */
var RACCOON_SLOTS = [[55,170],[100,176],[145,170],[190,174],[230,168],[75,135],[125,128],[172,132],[215,138],[145,95]];
function raccoonSceneSVG(d) {
  var rows = RACCOON_TYPES.map(function (t, i) {
    var n = d.col.byType[t.key] || 0;
    if (!n) return "";
    var x = RACCOON_SLOTS[i][0], y = RACCOON_SLOTS[i][1];
    var badge = n > 1 ? '<circle cx="' + (x + 15) + '" cy="' + (y - 13) + '" r="8" fill="#fff" stroke="#b45309" stroke-width="1.5"/><text x="' + (x + 15) + '" y="' + (y - 9) + '" font-size="9" text-anchor="middle" fill="#92400e" font-weight="bold">×' + n + '</text>' : "";
    return '<g class="rc-sway" style="animation-delay:' + ((i % 4) * 0.4) + 's">' +
      '<ellipse cx="' + x + '" cy="' + (y + 15) + '" rx="13" ry="4" fill="#000" opacity=".08"/>' +
      '<circle cx="' + (x - 7) + '" cy="' + (y - 12) + '" r="4.5" fill="#5b4037"/><circle cx="' + (x + 7) + '" cy="' + (y - 12) + '" r="4.5" fill="#5b4037"/>' +
      '<circle cx="' + x + '" cy="' + y + '" r="12" fill="#9ca3af" stroke="#5b4037" stroke-width="1.5"/>' +
      '<mask id="rcm' + i + '"><rect x="' + (x - 13) + '" y="' + (y - 13) + '" width="26" height="26" fill="#fff"/><ellipse cx="' + x + '" cy="' + (y - 3) + '" rx="8" ry="5" fill="#000"/></mask>' +
      '<circle cx="' + x + '" cy="' + y + '" r="12" fill="#5b4037" mask="url(#rcm' + i + ')"/>' +
      '<circle cx="' + (x - 4) + '" cy="' + (y - 2) + '" r="1.8" fill="#1f2937"/><circle cx="' + (x + 4) + '" cy="' + (y - 2) + '" r="1.8" fill="#1f2937"/>' +
      '<text x="' + x + '" y="' + (y - 19) + '" font-size="11" text-anchor="middle">' + t.emoji + '</text>' + badge + '</g>';
  }).join("");
  var tree = function (x, s) {
    return '<line x1="' + x + '" y1="228" x2="' + x + '" y2="' + (228 - 120 * s) + '" stroke="#8d6e63" stroke-width="' + (7 * s) + '" stroke-linecap="round"/>' +
      '<circle cx="' + (x - 18 * s) + '" cy="' + (108 - 10 * s) + '" r="' + (26 * s) + '" fill="#a5d6a7"/>' +
      '<circle cx="' + (x + 18 * s) + '" cy="' + (104 - 10 * s) + '" r="' + (24 * s) + '" fill="#81c784"/>' +
      '<circle cx="' + x + '" cy="' + (86 - 10 * s) + '" r="' + (22 * s) + '" fill="#a5d6a7"/>';
  };
  return '<svg viewBox="0 0 280 250" style="width:100%;max-width:420px;display:block;margin:0 auto">' +
    '<ellipse cx="140" cy="232" rx="130" ry="12" fill="#e8e0cf"/>' + tree(30, 0.9) + tree(250, 0.8) + rows + '</svg>';
}

function updateRaccoonBar() {
  var d = loadRaccoon();
  var bar = $("raccoon-bar");
  if (bar) bar.innerHTML = "🦝 浣熊树林 · 🌰 <b>" + d.token + "</b> · 浣熊 <b>" + d.col.total + "</b> 只 →";
}

function showGardenCy() {
  var d = loadRaccoon();
  var species = 0;
  RACCOON_TYPES.forEach(function (t) { if (d.col.byType[t.key]) species++; });
  var limit = raccoonLimit();
  var quota = limit === Infinity
    ? '<p style="text-align:center;font-size:13px;color:#059669">🔓 已解锁：兑换不限量，稀有浣熊也能抽到！</p>'
    : d.col.total >= limit
      ? '<p style="text-align:center;font-size:13px;color:#b45309">🎁 免费额度已用完（' + d.col.total + ' / ' + limit + ' 只）· 家长开通学习会员后不限量</p>'
      : '<p style="text-align:center;font-size:13px;color:#6b7280">🎁 免费兑换额度：' + d.col.total + ' / ' + limit + ' 只' + (chengyuTier() === "guest" ? "（登录后再送 24 只）" : "") + '</p>';
  $("mode-switch-sec").classList.add("hidden");
  $("chain-panel").classList.add("hidden");
  $("blank-panel").classList.add("hidden");
  $("options").classList.add("hidden");
  $("btn-skip-row").classList.add("hidden");
  $("tips-sec").classList.add("hidden");
  var garden = $("raccoon-garden");
  garden.classList.remove("hidden");
  var grid = RACCOON_TYPES.map(function (t) {
    var n = d.col.byType[t.key] || 0;
    var locked = t.memberOnly && chengyuTier() !== "member";
    return '<div class="rc-cell' + (n ? "" : " locked") + '">' + (n ? t.emoji + "🦝" : (t.memberOnly && chengyuTier() !== "member" ? t.emoji : "❓")) + '<small>' + (n ? t.name + (n > 1 ? " ×" + n : "") : (locked ? "🔒会员专属" : "未解锁")) + '</small></div>';
  }).join("");
  var records = d.tokenRecords.length
    ? d.tokenRecords.map(function (r) { return '<div class="rc-record"><span>' + r.date + ' · ' + r.score + '</span><b>' + (r.n > 0 ? "+" : "") + r.n + ' 🌰</b></div>'; }).join("")
    : '<p style="font-size:13px;color:#9ca3af">还没有记录，去答题赚聪明果吧！</p>';
  garden.innerHTML = '<div style="text-align:right"><button id="rc-back" class="btn" type="button">← 返回游戏</button></div>' +
    '<h2 style="text-align:center;margin:8px 0">🦝 浣熊树林</h2>' +
    '<p style="text-align:center;font-size:14px;margin:0 0 8px">🌰 聪明果 <b>' + d.token + '</b> 个 · 已收集 <b>' + species + ' / ' + RACCOON_TYPES.length + '</b> 种（共 ' + d.col.total + ' 只）</p>' +
    raccoonSceneSVG(d) + quota +
    '<div style="text-align:center;margin:10px 0"><button id="rc-ex" class="btn primary" type="button">🎁 用 ' + RACCOON_PRICE + ' 个聪明果换一只神秘浣熊</button></div>' +
    '<div class="rc-grid">' + grid + '</div>' +
    '<h3 style="font-size:14px;margin:14px 0 6px">📜 聪明果账本</h3>' + records +
    '<p style="font-size:12px;color:#9ca3af;margin-top:10px">💡 登录 DaoBox 账号后，浣熊收集自动云备份。</p>';
  $("rc-back").addEventListener("click", function () {
    garden.classList.add("hidden");
    $("mode-switch-sec").classList.remove("hidden");
    if (mode === "chain") { $("chain-panel").classList.remove("hidden"); } else { $("blank-panel").classList.remove("hidden"); }
    $("options").classList.remove("hidden");
    $("btn-skip-row").classList.remove("hidden");
    $("tips-sec").classList.remove("hidden");
  });
  $("rc-ex").addEventListener("click", exchangeRaccoon);
}

/* ---------- 模式切换 ---------- */
function switchMode(m) {
  if (mode === m) return;
  mode = m;
  answering = false;
  hideFeedback();
  $("mode-chain").classList.toggle("active", m === "chain");
  $("mode-blank").classList.toggle("active", m === "blank");
  $("chain-panel").classList.toggle("hidden", m !== "chain");
  $("blank-panel").classList.toggle("hidden", m !== "blank");
  $("best-label").textContent = m === "chain" ? "最佳" : "最佳";
  streak = 0;
  updateHud();
  if (m === "chain") startChain(); else makeBlankQuestion();
}

/* ---------- 时长体系：portal.js 超时事件 ---------- */
function applyTimeLock() {
  locked = true;
  $("time-lock").classList.remove("hidden");
}
window.addEventListener("daobox:timeexceeded", function () { applyTimeLock(); });
setTimeout(function () {
  try { if (window.DaoBox && window.DaoBox.timeExceeded) applyTimeLock(); } catch (err) {}
}, 1200);

/* ---------- 启动 ---------- */
function boot() {
  $("app-version").textContent = APP_VERSION;
  $("refresh-btn").addEventListener("click", function () {
    if ("caches" in window) {
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
      }).finally(function () { location.reload(); });
    } else { location.reload(); }
  });
  $("lock-close").addEventListener("click", function () { $("time-lock").classList.add("hidden"); });
  $("mode-chain").addEventListener("click", function () { switchMode("chain"); });
  $("mode-blank").addEventListener("click", function () { switchMode("blank"); });
  $("btn-skip").addEventListener("click", function () {
    if (answering || locked) return;
    hideFeedback();
    if (mode === "chain") { makeChainQuestion(); } else { makeBlankQuestion(); }
  });

  buildIndex();
  loadGame();
  updateHud();
  startChain();
  updateRaccoonBar();
  $('raccoon-bar').addEventListener('click', function () { showGardenCy(); });
  (function waitCyUser(n) {
    if (window.DaoBox && DaoBox.user) { cySyncOnLogin(); return; }
    if (n > 0) setTimeout(function () { waitCyUser(n - 1); }, 300);
  })(20);
}
document.addEventListener("DOMContentLoaded", boot);
