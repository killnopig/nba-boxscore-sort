// ==UserScript==
// @name         NBA Box Score 欄位置前與排序
// @name:en      NBA Box Score Column Pin & Sort
// @namespace    https://github.com/killnopig
// @version      2.0.0
// @description  在 NBA.com box score 頁面加入兩個按鈕：選擇欄位移到最前、依該欄數字排序
// @description:en  Adds two buttons to NBA.com box score pages: pin any stat column first, and sort players by it
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

  const state = { front: null, dir: null }; // dir: null | 'desc' | 'asc'
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
      const si =
