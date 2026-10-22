// ==UserScript==
// @name         OFF-AIR 틱두 자동 새로고침
// @namespace    offair-league
// @version      1.0
// @description  tikdo.kr 탭을 열어두면 저녁 20시~24시엔 5분마다, 그 외엔 30분마다 자동 새로고침 → 기존 "틱두 컷 → GitHub" 스크립트가 매번 다시 실행됨
// @match        https://tikdo.kr/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  const hour = new Date().getHours();
  const minutes = hour >= 20 ? 5 : 30;
  setTimeout(function () { location.reload(); }, minutes * 60 * 1000);
})();
