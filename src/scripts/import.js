import browser from 'webextension-polyfill';
import { syncIfNeeded, localizeHtmlPage } from './lib/common_lib';

const parseVocabulary = (text) => {
  const lines = text.split('\n');
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    let word = lines[i];
    if (i + 1 === lines.length && word.length <= 1) break;
    if (word.slice(-1) === '\r') {
      word = word.slice(0, -1);
    }
    found.push(word);
  }
  return found;
};

const addNewWords = async (newWords) => {
  const { userVocabulary, userVocabAdded, userVocabDeleted } = await browser.storage.local.get([
    'userVocabulary',
    'userVocabAdded',
    'userVocabDeleted',
  ]);
  let numAdded = 0;
  const newState = { userVocabulary };
  for (let i = 0; i < newWords.length; i += 1) {
    const word = newWords[i];
    if (!Object.prototype.hasOwnProperty.call(userVocabulary, word)) {
      userVocabulary[word] = 1;
      numAdded += 1;
      if (typeof userVocabAdded !== 'undefined') {
        userVocabAdded[word] = 1;
        newState.userVocabAdded = userVocabAdded;
      }
      if (typeof userVocabDeleted !== 'undefined') {
        delete userVocabDeleted[word];
        newState.userVocabDeleted = userVocabDeleted;
      }
    }
  }
  const numSkipped = newWords.length - numAdded;
  document.getElementById('added-info').textContent = `Added ${numAdded} new words.`;
  document.getElementById('skipped-info').textContent = `Skipped ${numSkipped} existing words.`;
  if (numAdded) {
    await browser.storage.local.set(newState);
    syncIfNeeded();
  }
};

const processChange = () => {
  const inputElem = document.getElementById('do-load-vocab');
  const baseName = inputElem.files[0].name;
  document.getElementById('frame-preview').textContent = baseName;
};

const processSubmit = () => {
  // TODO add a radio button with two options: 1. merge vocabulary [default]; 2. replace vocabulary
  const inputElem = document.getElementById('do-load-vocab');
  const file = inputElem.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    const newWords = parseVocabulary(reader.result);
    addNewWords(newWords);
  };
  reader.readAsText(file);
};

const initControls = () => {
  window.onload = () => {
    localizeHtmlPage();
    document.getElementById('vocab-submit').addEventListener('click', processSubmit);
    document.getElementById('do-load-vocab').addEventListener('change', processChange);
  };
};

initControls();
