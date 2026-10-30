// ==UserScript==
// @name         NBA Box Score 欄位置前與排序
// @name:en      NBA Box Score Column Pin & Sort
// @namespace    https://github.com/killnopig
// @version      2.1.0
// @description  在 NBA.com box score 頁面加入按鈕：選擇欄位移到最前、依該欄數字排序、一鍵套用預設配置
// @description:en  Adds buttons to NBA.com box score pages: pin any stat column first, sort players by it, and apply presets
// @author       killnopig
// @license      MIT
// @match        https://www.nba.com/game/*
// @grant        none
// @run-at       document-idle
// @homepageURL  https://github.com/killnopig/nba-boxscore-sort
// @supportURL   https://github.com/killnopig/nba-boxscore-sort/issues
// @updateURL    https://raw.githubusercontent.com/killnopig/nba-boxscore-sort/main/nba-boxscore-sort.user.js
// @downloadURL  https://raw.githubusercontent.com/killnopig/nba-boxscore-sort/main/nba-boxscore-sort.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 儲存 ----------
  const LS_PRESETS = 'nba-bs-presets';
  const LS_LAST = 'nba-bs-last';

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { /* 忽略儲存失敗 */ }
  }

  // ---------- 內建預設配置 ----------
  const BUILTIN = [
    { name: '得分王', front: 'PTS', dir: 'desc' },
    { name: '籃板王', front: 'REB', dir: 'desc' },
    { name: '助攻王', front: 'AST', dir: 'desc' },
    { name: '抄截王', front: 'STL', dir: 'desc' },
    { name: '火鍋王', front: 'BLK', dir: 'desc' },
    { name: '三分王', front: '3PM', dir: 'desc' },
    { name: '正負值', front: '+/-', dir: 'desc' },
    { name: '上場時間', front: 'MIN', dir: 'desc' },
    { name: '原始順序', front: null, dir: null },
  ];

  // ---------- 狀態 ----------
  const last = load(LS_LAST, {});
  const state = {
    front: typeof last.front === 'string' ? last.front : null,
    dir: last.dir === 'desc' || last.dir === 'asc' ? last.dir : null, // null | 'desc' | 'asc'
  };
  const origLabels = new WeakMap(); // table -> 原始欄位順序
  const origRows = new WeakMap();   // tbody -> 原始列順序

  const txt = el => (el ? el.textContent.trim() : '');
  const isTotals = r => /^TOTALS?$/i.test(txt(r.children[0]));

  function parseVal(s) {
    s = s.replace('−', '-');
    if (s.includes(':')) {
      const [m, sec] = s.split(':').map(Number);
      return m + (sec || 0) / 60;
    }
    return parseFloat(s);
  }

  // ---------- 表格處理 ----------
  function fix(table) {
    const headRow = table.querySelector('thead tr:last-child');
    if (!headRow) return;

    let labels = [...headRow.children].map(txt);
    if (!labels.includes('FGM')) return; // 不是 box score 表格

    if (!origLabels.has(table)) origLabels.set(table, labels.slice());
    const orig = origLabels.get(table);

    // 1. 欄位重排
    const desired = state.front && orig.includes(state.front)
      ? [orig[0], state.front, ...orig.slice(1).filter(l => l !== state.front)]
      : orig;

    if (desired.join('|') !== labels.join('|')) {
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [...tr.children];
        if (cells.length !== labels.length) return;
        desired.map(l => cells[labels.indexOf(l)]).forEach(c => tr.appendChild(c));
      });
      labels = desired.slice();
    }

    // 2. 排序
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    const rows = [...tbody.querySelectorAll('tr')];
    if (!origRows.has(tbody) || origRows.get(tbody).some(r => !r.isConnected)) {
      origRows.set(tbody, rows.slice());
    }

    const players = rows.filter(r => !isTotals(r));
    const totals = rows.filter(isTotals);
    const base = origRows.get(tbody).filter(r => players.includes(r));

    let target = base;
    if (state.dir) {
      const si = labels.indexOf(state.front || 'PTS');
      if (si === -1) return;
      const val = r => parseVal(txt(r.children[si]));
      target = base.slice().sort((a, b) => {
        const va = val(a), vb = val(b);
        const na = Number.isNaN(va), nb = Number.isNaN(vb);
        if (na && nb) return 0;
        if (na) return 1;   // 沒數字的永遠排最後
        if (nb) return -1;
        return state.dir === 'desc' ? vb - va : va - vb;
      });
    }

    if (target.every((r, i) => r === players[i])) return;
    [...target, ...totals].forEach(r => tbody.appendChild(r));
  }

  // ---------- 監聽與執行 ----------
  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 200);
  });

  function run() {
    observer.disconnect();
    try {
      document.querySelectorAll('table').forEach(fix);
      updateButtons();
    } catch (e) {
      console.error('[NBA script]', e);
    }
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function commit(front, dir) {
    state.front = front;
    state.dir = dir;
    save(LS_LAST, { front, dir });
    run();
  }

  // ---------- 按鈕介面 ----------
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:fixed;left:20px;bottom:20px;z-index:99999;display:flex;gap:8px;font:14px sans-serif;';

  const btnStyle =
    'padding:8px 14px;border:none;border-radius:8px;background:#1d428a;color:#fff;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.3);font-size:14px;';
  const menuBase =
    'display:none;position:absolute;bottom:44px;left:0;background:#fff;color:#000;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.35);padding:6px;gap:4px;';

  const btnFront = document.createElement('button');
  btnFront.style.cssText = btnStyle;

  const btnSort = document.createElement('button');
  btnSort.style.cssText = btnStyle;

  const btnPreset = document.createElement('button');
  btnPreset.style.cssText = btnStyle;
  btnPreset.textContent = '⭐ 預設配置';

  const menuFront = document.createElement('div');
  menuFront.style.cssText = menuBase + 'max-width:260px;flex-wrap:wrap;';

  const menuPreset = document.createElement('div');
  menuPreset.style.cssText = menuBase + 'min-width:220px;flex-direction:column;';

  const wrapFront = document.createElement('div');
  wrapFront.style.position = 'relative';
  wrapFront.append(menuFront, btnFront);

  const wrapPreset = document.createElement('div');
  wrapPreset.style.position = 'relative';
  wrapPreset.append(menuPreset, btnPreset);

  panel.append(wrapFront, btnSort, wrapPreset);
  document.body.appendChild(panel);

  function closeMenus() {
    menuFront.style.display = 'none';
    menuPreset.style.display = 'none';
  }
  document.addEventListener('click', e => {
    if (!panel.contains(e.target)) closeMenus();
  });

  function describe(front, dir) {
    const arrow = dir === 'desc' ? '▼' : dir === 'asc' ? '▲' : '—';
    return (front || '預設') + ' ' + arrow;
  }

  function updateButtons() {
    btnFront.textContent = '📌 排第一：' + (state.front || '預設');
    const arrow = state.dir === 'desc' ? '▼ 高→低' : state.dir === 'asc' ? '▲ 低→高' : '未排序';
    btnSort.textContent = '⇅ 依數字排序（' + arrow + '）';
  }

  // ----- 選擇欄位選單 -----
  function buildFrontMenu() {
    const table = [...document.querySelectorAll('table')].find(t => origLabels.has(t));
    if (!table) return;
    const labels = origLabels.get(table).slice(1); // 去掉 PLAYER
    menuFront.innerHTML = '';

    const mk = (label, value) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText =
        'padding:5px 9px;border:1px solid #ccc;border-radius:6px;background:' +
        (state.front === value ? '#ffd54f' : '#f5f5f5') +
        ';color:#000;cursor:pointer;font-size:13px;';
      b.onclick = () => {
        closeMenus();
        commit(value, state.dir);
      };
      menuFront.appendChild(b);
    };

    mk('還原預設', null);
    labels.forEach(l => mk(l, l));
  }

  // ----- 預設配置選單 -----
  function sectionTitle(text) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'font-size:12px;color:#666;padding:4px 6px 0;';
    return d;
  }

  function presetRow(p, customIndex) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:4px;align-items:stretch;';

    const active = state.front === p.front && state.dir === p.dir;
    const b = document.createElement('button');
    b.textContent = p.name + '　' + describe(p.front, p.dir);
    b.style.cssText =
      'flex:1;text-align:left;padding:6px 10px;border:1px solid #ccc;border-radius:6px;background:' +
      (active ? '#ffd54f' : '#f5f5f5') +
      ';color:#000;cursor:pointer;font-size:13px;';
    b.onclick = () => {
      closeMenus();
      commit(p.front, p.dir);
    };
    row.appendChild(b);

    if (customIndex !== undefined) {
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = '刪除這個配置';
      del.style.cssText =
        'padding:0 9px;border:1px solid #ccc;border-radius:6px;background:#fff;color:#c00;cursor:pointer;font-size:13px;';
      del.onclick = e => {
        e.stopPropagation();
        const list = load(LS_PRESETS, []);
        list.splice(customIndex, 1);
        save(LS_PRESETS, list);
        buildPresetMenu();
      };
      row.appendChild(del);
    }
    return row;
  }

  function buildPresetMenu() {
    menuPreset.innerHTML = '';

    menuPreset.appendChild(sectionTitle('內建配置'));
    BUILTIN.forEach(p => menuPreset.appendChild(presetRow(p)));

    const custom = load(LS_PRESETS, []);
    if (custom.length) {
      menuPreset.appendChild(sectionTitle('我的配置'));
      custom.forEach((p, i) => menuPreset.appendChild(presetRow(p, i)));
    }

    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 儲存目前配置為我的配置';
    saveBtn.style.cssText =
      'margin-top:4px;padding:7px 10px;border:1px dashed #1d428a;border-radius:6px;background:#fff;color:#1d428a;cursor:pointer;font-size:13px;';
    saveBtn.onclick = () => {
      const name = prompt('為目前配置取個名字：', describe(state.front, state.dir));
      if (!name || !name.trim()) return;
      const list = load(LS_PRESETS, []).filter(p => p.name !== name.trim());
      list.push({ name: name.trim(), front: state.front, dir: state.dir });
      save(LS_PRESETS, list);
      buildPresetMenu();
    };
    menuPreset.appendChild(saveBtn);
  }

  // ----- 按鈕事件 -----
  btnFront.onclick = () => {
    const open = menuFront.style.display !== 'none';
    closeMenus();
    if (!open) {
      buildFrontMenu();
      menuFront.style.display = 'flex';
    }
  };

  btnPreset.onclick = () => {
    const open = menuPreset.style.display !== 'none';
    closeMenus();
    if (!open) {
      buildPresetMenu();
      menuPreset.style.display = 'flex';
    }
  };

  btnSort.onclick = () => {
    closeMenus();
    const next = state.dir === null ? 'desc' : state.dir === 'desc' ? 'asc' : null;
    commit(state.front, next);
  };

  updateButtons();
  run();
})();
