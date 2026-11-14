'use strict';
// 렌더러에 필요한 함수만 노출한다. ipcRenderer 자체는 넘기지 않는다.
const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => (...args) => ipcRenderer.invoke(`skillpick:${name}`, ...args);
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const check = (id) => { if (!ID.test(String(id))) throw new Error('id 형식이 올바르지 않아요'); return id; };

contextBridge.exposeInMainWorld('skillpick', {
  platform: process.platform,
  preflight: call('preflight'),
  listSkills: call('listSkills'),
  previewSkill: call('previewSkill'),
  addSkill: call('addSkill'),
  capture: call('capture'),
  startRun: call('startRun'),
  stopRun: call('stopRun'),
  readLog: (runId, skillId) => call('readLog')(check(runId), check(skillId)),
  listRuns: call('listRuns'),
  loadRun: call('loadRun'),
  clearRuns: call('clearRuns'),
  getSettings: call('getSettings'),
  setSettings: call('setSettings'),
  copyText: call('copyText'),
  openExternal: call('openExternal'),
  openHistoryFolder: call('openHistoryFolder'),
  openFolder: call('openFolder'),
  saveHtml: call('saveHtml'),
  exportSteering: call('exportSteering'),
  onRunEvent(cb) {
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on('skillpick:run-event', listener);
    return () => ipcRenderer.removeListener('skillpick:run-event', listener);
  },
  // 시안·캡처는 전용 프로토콜로 서빙된다 (CSP 헤더를 서버 쪽에서 붙이기 위해)
  variantUrl: (runId, skillId) => `skillpick-variant://${check(runId)}/${check(skillId)}/index.html`,
  assetUrl: (runId, who, kind) => `skillpick-asset://${check(runId)}/${who === 'original' ? 'original' : check(who)}/${kind === 'mobile' ? 'mobile' : 'desktop'}`,
});
