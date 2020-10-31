import browser from 'webextension-polyfill';

export const requestUnhighlight = async (lemma) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  browser.tabs.sendMessage(tabs[0].id, { wdm_unhighlight: lemma });
};

// export function make_id_suffix(text) {
// const before = btoa(text);
// return before.replace(/\+/g, '_').replace(/\//g, '-').replace(/=/g, '_')
// return after;
// }

export const syncIfNeeded = async () => {
  const { lastSyncTime, syncEnabled, lastSyncError } = await browser.storage.local.get([
    'lastSyncTime',
    'syncEnabled',
    'lastSyncError',
  ]);
  if (!syncEnabled || lastSyncError !== null) {
    return;
  }
  const curDate = new Date();
  const minsPassed = (curDate.getTime() - lastSyncTime) / (60 * 1000);
  const syncPeriodMins = 30;
  if (minsPassed >= syncPeriodMins) {
    browser.runtime.sendMessage({
      wdmRequest: 'gd_sync',
      interactiveMode: false,
    });
  }
};

export const readFile = (_path) =>
  new Promise((resolve, reject) => {
    fetch(_path)
      .then((_res) => _res.blob())
      .then((_blob) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(_blob);
      })
      .catch((error) => {
        reject(error);
      });
  });

export const addLexeme = async (lexemeOld, resultHandler) => {
  const {
    dictWords,
    userVocabulary,
    userVocabAdded,
    userVocabDeleted,
  } = await browser.storage.local.get([
    'userVocabulary',
    'userVocabAdded',
    'userVocabDeleted',
    'dictWords',
  ]);
  if (lexemeOld.length > 100) {
    resultHandler('bad', undefined);
    return;
  }
  const lexeme = lexemeOld.trim();
  if (!lexeme) {
    resultHandler('bad', undefined);
    return;
  }

  const wordFound = dictWords[lexeme];
  if (!wordFound) {
    resultHandler('bad', lexeme);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(userVocabulary, lexeme)) {
    resultHandler('exists', lexeme);
    return;
  }

  const newState = { userVocabulary };

  userVocabulary[lexeme] = 1;
  if (typeof userVocabAdded !== 'undefined') {
    userVocabAdded[lexeme] = 1;
    newState.userVocabAdded = userVocabAdded;
  }
  if (typeof userVocabDeleted !== 'undefined') {
    delete userVocabDeleted[lexeme];
    newState.userVocabDeleted = userVocabDeleted;
  }

  await browser.storage.local.set(newState);
  syncIfNeeded();
  resultHandler('ok', lexeme);
};

export const makeHlStyle = (hlParams) => {
  if (!hlParams.enabled) return undefined;
  let result = '';
  if (hlParams.bold) result += 'font-weight:bold;';
  if (hlParams.useBackground) result += `background-color:${hlParams.backgroundColor};`;
  if (hlParams.useColor) result += `color:${hlParams.color};`;
  if (!result) return undefined;
  result += 'font-size:inherit;display:inline;';
  return result;
};

export const localizeHtmlPage = () => {
  // Localize by replacing __MSG_***__ meta tags
  const objects = document.getElementsByTagName('html');
  for (let j = 0; j < objects.length; j += 1) {
    const obj = objects[j];
    const valStrH = obj.innerHTML.toString();
    const valNewH = valStrH.replace(/__MSG_(\w+)__/g, (match, v1) =>
      v1 ? browser.i18n.getMessage(v1) : '',
    );
    if (valNewH !== valStrH) {
      obj.innerHTML = valNewH;
    }
  }
};

export const spformat = (src, ...args) => {
  // const args = Array.prototype.slice.call(arguments, 1);
  return src.replace(/{(\d+)}/g, (match, number) =>
    typeof args[number] !== 'undefined' ? args[number] : match,
  );
};
