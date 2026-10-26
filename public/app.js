/* 成语接龙 · DaoBox 家族（v0.1.0） */
"use strict";

var APP_VERSION = "v0.1.2";
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
    showFeedback("good", "🎉 接到底啦！奖励 +" + CHAIN_END_BONUS);
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
}
document.addEventListener("DOMContentLoaded", boot);
