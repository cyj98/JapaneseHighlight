import browser from 'webextension-polyfill';
import { saveAs } from 'file-saver';
import { makeHlStyle, localizeHtmlPage } from './lib/common_lib';
import { initContextMenus, makeDefaultOnlineDicts } from './lib/context_menu_lib';

let highlightSettings = null;
let hoverSettings = null;
let onlineDicts = null;
let ttsEnabled = false;

const wcRbIds = ['wc1', 'wc2', 'wc3', 'wc4', 'wc5'];
// const icRbIds = ['ic1', 'ic2', 'ic3', 'ic4', 'ic5'];
const wbRbIds = ['wb1', 'wb2', 'wb3', 'wb4', 'wb5'];
// const ibRbIds = ['ib1', 'ib2', 'ib3', 'ib4', 'ib5'];

const hoverPopupTypes = ['never', 'key', 'always'];
const targetTypes = ['hl', 'ow'];

const displaySyncInterface = async () => {
  const { lastSyncError, syncEnabled, lastSyncTime } = await browser.storage.local.get([
    'syncEnabled',
    'lastSyncError',
    'lastSyncTime',
  ]);
  if (!syncEnabled) {
    document.getElementById('gd-stop-sync-button').style.display = 'none';
    document.getElementById('sync-status-feedback').style.display = 'none';
    return;
  }
  document.getElementById('gd-stop-sync-button').style.display = 'inline-block';
  document.getElementById('sync-status-feedback').style.display = 'inline';
  if (lastSyncError != null) {
    document.getElementById('sync-status-feedback').textContent = `Error: ${lastSyncError}`;
  } else {
    document.getElementById('sync-status-feedback').textContent = 'Synchronized.';
  }
  if (typeof lastSyncTime !== 'undefined') {
    const curDate = new Date();
    let secondsPassed = (curDate.getTime() - lastSyncTime) / 1000;
    const pDays = Math.floor(secondsPassed / (3600 * 24));
    secondsPassed %= 3600 * 24;
    const pHours = Math.floor(secondsPassed / 3600);
    secondsPassed %= 3600;
    const pMinutes = Math.floor(secondsPassed / 60);
    const pSeconds = Math.floor(secondsPassed % 60);
    let passedTimeMsg = '';
    if (pDays > 0) passedTimeMsg += `${pDays} days, `;
    if (pHours > 0 || pDays > 0) passedTimeMsg += `${pHours} hours, `;
    if (pMinutes > 0 || pHours > 0 || pDays > 0) passedTimeMsg += `${pMinutes} minutes, `;
    passedTimeMsg += `${pSeconds} seconds since the last sync.`;
    const syncDateLabel = document.getElementById('last-sync-date');
    syncDateLabel.style.display = 'inline';
    syncDateLabel.textContent = passedTimeMsg;
  }
};

const synchronizeNow = async () => {
  browser.runtime.onMessage.addListener((request) => {
    if (request.sync_feedback) {
      displaySyncInterface();
    }
  });
  document.getElementById('sync-status-feedback').style.display = 'inline';
  document.getElementById('sync-status-feedback').textContent = 'Synchronization started...';
  await browser.storage.local.set({ syncEnabled: true });
  browser.runtime.sendMessage({ wdmRequest: 'gd_sync', interactiveMode: true });
};

const requestPermissionsAndSync = async () => {
  const granted = await browser.permissions.request({ origins: ['https://*/*'] });
  if (!granted) return;
  synchronizeNow();
};

const stopSynchronization = async () => {
  await browser.storage.local.set({ syncEnabled: false });
  displaySyncInterface();
};

const processTestWarnings = () => {
  browser.management.getPermissionWarningsByManifest(prompt(), console.log);
};

const processGetDbg = async () => {
  const storageKey = document.getElementById('get-from-storage-key').value;
  const result = await browser.storage.local.get([storageKey]);
  const storageValue = result[storageKey];
  console.log(`key: ${storageKey}; value: ${JSON.stringify(storageValue)}`);
};

const processSetDbg = async () => {
  console.log('processing dbg');
  const storageKey = document.getElementById('set-to-storage-key').value;
  let storageValue = document.getElementById('set-to-storage-val').value;
  if (storageValue === 'undefined') {
    storageValue = undefined;
  } else {
    storageValue = JSON.parse(storageValue);
  }
  console.log(`storage_key:${storageKey}, storage_value:${storageValue}`);
  await browser.storage.local.set({ [storageKey]: storageValue });
  const { lastError } = browser.runtime;
  console.log(`last_error:${lastError}`);
  console.log('finished setting value');
};

const processExport = async () => {
  const { userVocabulary } = await browser.storage.local.get(['userVocabulary']);
  const keys = [];
  // for (const key in user_vocabulary) {
  Object.keys(userVocabulary).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(userVocabulary, key)) {
      keys.push(key);
    }
  });
  const fileContent = keys.join('\r\n');
  const blob = new Blob([fileContent], {
    type: 'text/plain;charset=utf-8',
  });
  saveAs(blob, 'japanese_user_vocabulary.txt');
};

const processImport = () => {
  browser.tabs.create({
    url: browser.runtime.getURL('../html/import.html'),
  });
};

const highlightExampleText = (hlParams, textId, lqId, rqId) => {
  document.getElementById(lqId).textContent = '';
  document.getElementById(rqId).textContent = '';
  document.getElementById(lqId).style = undefined;
  document.getElementById(rqId).style = undefined;
  document.getElementById(textId).style = makeHlStyle(hlParams);
};

const showRbStates = (ids, color) => {
  for (let i = 0; i < ids.length; i += 1) {
    const docElement = document.getElementById(ids[i]);
    if (docElement.label.style.backgroundColor === color) {
      docElement.checked = true;
    }
  }
};

const processTestOldDict = (e) => {
  const button = e.target;
  const btnId = button.id;
  if (!btnId.startsWith('test-dict-btn_')) return;
  const btnNo = parseInt(btnId.split('_')[1], 10);
  const url = `${onlineDicts[btnNo].url}test`;
  browser.tabs.create({ url });
};

const processDeleteOldDict = (event) => {
  const button = event.target;
  const btnId = button.id;
  if (!btnId.startsWith('del-dict-btn_')) return;
  const btnNo = parseInt(btnId.split('_')[1], 10);
  onlineDicts.splice(btnNo, 1);
  browser.storage.local.set({ onlineDicts });
  initContextMenus(onlineDicts);
  event.target.parentElement.remove();
  // showUserDicts();
};

const showUserDicts = () => {
  const dictsBlock = document.getElementById('existing-dicts-block');
  while (dictsBlock.firstChild) {
    dictsBlock.removeChild(dictsBlock.firstChild);
  }
  const dictPairs = onlineDicts;
  for (let i = 0; i < dictPairs.length; i += 1) {
    const dictBlock = document.createElement('div');
    dictBlock.className = 'dict-block';
    const nameSpan = document.createElement('div');
    nameSpan.className = 'dict-name';
    nameSpan.textContent = dictPairs[i].title;
    dictBlock.appendChild(nameSpan);

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'dict-url';
    urlInput.value = dictPairs[i].url;
    urlInput.readOnly = true;
    dictBlock.appendChild(urlInput);

    const testButton = document.createElement('button');
    testButton.className = 'short-button';
    testButton.id = `test-dict-btn_${i}`;
    testButton.textContent = 'Test';
    testButton.addEventListener('click', processTestOldDict);
    dictBlock.appendChild(testButton);

    const deleteButton = document.createElement('input');
    deleteButton.className = 'img-button';
    deleteButton.src = '../images/delete.png';
    deleteButton.type = 'image';
    deleteButton.id = `del-dict-btn_${i}`;
    deleteButton.addEventListener('click', processDeleteOldDict);
    dictBlock.appendChild(deleteButton);

    dictsBlock.appendChild(dictBlock);
  }
};

const processAddDict = () => {
  let dictName = document.getElementById('add-dict-name').value;
  let dictUrl = document.getElementById('add-dict-url').value;
  dictName = dictName.trim();
  dictUrl = dictUrl.trim();
  if (!dictName || !dictUrl) return;
  onlineDicts.push({ title: dictName, url: dictUrl });
  browser.storage.local.set({ onlineDicts });
  initContextMenus(onlineDicts);
  showUserDicts();
  document.getElementById('add-dict-name').value = '';
  document.getElementById('add-dict-url').value = '';
};

const processTestNewDict = () => {
  let dictUrl = document.getElementById('add-dict-url').value;
  dictUrl = dictUrl.trim();
  if (!dictUrl) return;
  const url = `${dictUrl}test`;
  browser.tabs.create({ url });
};

const showInternalState = () => {
  const { wordParams } = highlightSettings;

  document.getElementById('words-enabled').checked = wordParams.enabled;
  // document.getElementById('idioms-enabled').checked = idiomParams.enabled;
  document.getElementById('words-block').style.display = wordParams.enabled ? 'block' : 'none';
  // document.getElementById('idioms-block').style.display = idiomParams.enabled ? 'block' : 'none';

  document.getElementById('words-bold').checked = wordParams.bold;
  // document.getElementById('idioms-bold').checked = idiomParams.bold;

  document.getElementById('words-background').checked = wordParams.useBackground;
  // document.getElementById('idioms-background').checked = idiomParams.useBackground;

  document.getElementById('words-color').checked = wordParams.useColor;
  // document.getElementById('idioms-color').checked = idiomParams.useColor;

  document.getElementById('pronunciation-enabled').checked = ttsEnabled;

  document.getElementById('wc-radio-block').style.display = wordParams.useColor ? 'block' : 'none';
  showRbStates(wcRbIds, wordParams.color);
  // document.getElementById('ic-radio-block').style.display = idiomParams.useColor ? 'block' : 'none';
  // showRbStates(icRbIds, idiomParams.color);
  document.getElementById('wb-radio-block').style.display = wordParams.useBackground
    ? 'block'
    : 'none';
  showRbStates(wbRbIds, wordParams.backgroundColor);
  // document.getElementById('ib-radio-block').style.display = idiomParams.useBackground
  //   ? 'block'
  //   : 'none';
  // showRbStates(ibRbIds, idiomParams.backgroundColor);

  for (let t = 0; t < targetTypes.length; t += 1) {
    const ttype = targetTypes[t];
    for (let i = 0; i < hoverPopupTypes.length; i += 1) {
      const isHit = hoverPopupTypes[i] === hoverSettings[`${ttype}_hover`];
      document.getElementById(`${ttype}b-${hoverPopupTypes[i]}`).checked = isHit;
    }
  }

  highlightExampleText(wordParams, 'word-hl-text', 'wql', 'wqr');
  // highlightExampleText(idiomParams, 'idiom-hl-text', 'iql', 'iqr');
  showUserDicts();
};

/* eslint-disable no-param-reassign */
const addCbEventListener = (id, dstParams, dstKey) => {
  document.getElementById(id).addEventListener('click', () => {
    const checkboxElem = document.getElementById(id);
    if (checkboxElem.checked) {
      dstParams[dstKey] = true;
    } else {
      dstParams[dstKey] = false;
    }
    showInternalState();
  });
};

const processRb = (dstParams, dstKey, ids) => {
  for (let i = 0; i < ids.length; i += 1) {
    const docElement = document.getElementById(ids[i]);
    if (docElement.checked) {
      dstParams[dstKey] = docElement.label.style.backgroundColor;
    }
  }
  showInternalState();
};

const handleRbLoop = (ids, dstParams, dstKey) => {
  for (let i = 0; i < ids.length; i += 1) {
    document.getElementById(ids[i]).addEventListener('click', () => {
      processRb(dstParams, dstKey, ids);
    });
  }
};

const assignBackLabels = () => {
  const labels = document.getElementsByTagName('LABEL');
  for (let i = 0; i < labels.length; i += 1) {
    if (labels[i].htmlFor !== '') {
      const elem = document.getElementById(labels[i].htmlFor);
      if (elem) elem.label = labels[i];
    }
  }
};

const hoverRbHandler = () => {
  for (let t = 0; t < targetTypes.length; t += 1) {
    const ttype = targetTypes[t];
    for (let i = 0; i < hoverPopupTypes.length; i += 1) {
      const elementId = `${ttype}b-${hoverPopupTypes[i]}`;
      const paramKey = `${ttype}_hover`;
      const rbElem = document.getElementById(elementId);
      if (rbElem.checked) {
        hoverSettings[paramKey] = hoverPopupTypes[i];
      }
    }
  }
  browser.storage.local.set({ hoverSettings });
};

const addHoverRbListeners = () => {
  for (let t = 0; t < targetTypes.length; t += 1) {
    for (let i = 0; i < hoverPopupTypes.length; i += 1) {
      const elementId = `${targetTypes[t]}b-${hoverPopupTypes[i]}`;
      document.getElementById(elementId).addEventListener('click', hoverRbHandler);
    }
  }
};

const processDisplay = async () => {
  // window.onload = () => {
  const result = await browser.storage.local.get([
    'highlightSettings',
    'hoverSettings',
    'onlineDicts',
    'developerModeEnabled',
    'ttsEnabled',
  ]);
  assignBackLabels();
  ({ highlightSettings, hoverSettings, onlineDicts, ttsEnabled } = result);

  const { developerModeEnabled } = result;
  const { wordParams } = highlightSettings;

  // TODO fix this monstrosity using this wrapper-function hack:
  // http://stackoverflow.com/questions/7053965/when-using-callbacks-inside-a-loop-in-javascript-is-there-any-way-to-save-a-var
  handleRbLoop(wcRbIds, wordParams, 'color');
  // handleRbLoop(icRbIds, idiomParams, 'color');
  handleRbLoop(wbRbIds, wordParams, 'backgroundColor');
  // handleRbLoop(ibRbIds, idiomParams, 'backgroundColor');

  addCbEventListener('words-enabled', wordParams, 'enabled');
  // addCbEventListener('idioms-enabled', idiomParams, 'enabled');
  addCbEventListener('words-bold', wordParams, 'bold');
  // addCbEventListener('idioms-bold', idiomParams, 'bold');
  addCbEventListener('words-background', wordParams, 'useBackground');
  // addCbEventListener('idioms-background', idiomParams, 'useBackground');
  addCbEventListener('words-color', wordParams, 'useColor');
  // addCbEventListener('idioms-color', idiomParams, 'useColor');

  addHoverRbListeners();

  if (developerModeEnabled) {
    document.getElementById('debug-control').style.display = 'block';
  }

  document.getElementById('gd-sync-button').addEventListener('click', requestPermissionsAndSync);
  document.getElementById('gd-stop-sync-button').addEventListener('click', stopSynchronization);

  document.getElementById('save-vocab').addEventListener('click', processExport);
  document.getElementById('load-vocab').addEventListener('click', processImport);

  document.getElementById('get-from-storage-btn').addEventListener('click', processGetDbg);
  document.getElementById('set-to-storage-btn').addEventListener('click', processSetDbg);

  document
    .getElementById('test-manifest-warnings-btn')
    .addEventListener('click', processTestWarnings);

  document.getElementById('add-dict').addEventListener('click', processAddDict);
  document.getElementById('test-new-dict').addEventListener('click', processTestNewDict);

  document.getElementById('more-info-link').href = browser.runtime.getURL('../html/sync_help.html');

  document.getElementById('save-visuals').addEventListener('click', () => {
    browser.storage.local.set({ highlightSettings });
  });

  document.getElementById('default-dicts').addEventListener('click', () => {
    onlineDicts = makeDefaultOnlineDicts();
    browser.storage.local.set({ onlineDicts });
    initContextMenus(onlineDicts);
    showUserDicts();
  });

  document.getElementById('pronunciation-enabled').addEventListener('click', (e) => {
    ttsEnabled = e.target.checked;
    browser.storage.local.set({ ttsEnabled });
  });

  displaySyncInterface();
  showInternalState();
};

document.addEventListener('DOMContentLoaded', () => {
  localizeHtmlPage();
  processDisplay();
});
