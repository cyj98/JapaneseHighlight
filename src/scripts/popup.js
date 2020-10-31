import browser from 'webextension-polyfill';
import { requestUnhighlight, addLexeme, localizeHtmlPage } from './lib/common_lib';

// var dict_size = null;
let enabledMode = true;

const displayMode = async () => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const url = new URL(tabs[0].url);
  const domain = url.hostname;
  document.getElementById('add-host-name').textContent = domain;
  if (enabledMode) {
    document.getElementById('mode-header').textContent = browser.i18n.getMessage(
      'enabledDescription',
    );
    document.getElementById('add-to-list-label').textContent = browser.i18n.getMessage(
      'addSkippedLabel',
    );
    document.getElementById('add-to-list-label').href = browser.runtime.getURL(
      '../html/black_list.html',
    );
    const { blackList } = await browser.storage.local.get(['blackList']);
    document.getElementById('add-to-list').checked = Object.prototype.hasOwnProperty.call(
      blackList,
      domain,
    );
  } else {
    document.getElementById('mode-header').textContent = browser.i18n.getMessage(
      'disabledDescription',
    );
    document.getElementById('add-to-list-label').textContent = browser.i18n.getMessage(
      'addFavoritesLabel',
    );
    document.getElementById('add-to-list-label').href = browser.runtime.getURL(
      '../html/white_list.html',
    );
    const { whiteList } = await browser.storage.local.get(['whiteList']);
    document.getElementById('add-to-list').checked = Object.prototype.hasOwnProperty.call(
      whiteList,
      domain,
    );
  }
};

const processCheckbox = async () => {
  const checkboxElem = document.getElementById('add-to-list');
  const listName = enabledMode ? 'blackList' : 'whiteList';

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const domain = new URL(tabs[0].url).hostname;
  document.getElementById('add-host-name').textContent = domain;
  const result = await browser.storage.local.get([listName]);
  const siteList = result[listName];
  if (checkboxElem.checked) {
    siteList[domain] = 1;
  } else {
    delete siteList[domain];
  }
  await browser.storage.local.set({ [listName]: siteList });
  displayMode();
};

const processModeSwitch = () => {
  enabledMode = !enabledMode;
  browser.storage.local.set({ enabledMode });
  displayMode();
};

const processShow = () => {
  browser.tabs.create({
    url: browser.runtime.getURL('../html/display.html'),
  });
};

const processHelp = () => {
  browser.tabs.create({ url: browser.runtime.getURL('../html/help.html') });
};

const processAdjust = () => {
  browser.tabs.create({
    url: browser.runtime.getURL('../html/options.html'),
  });
};

const displayVocabularySize = async () => {
  const { userVocabulary } = await browser.storage.local.get(['userVocabulary']);
  const vocabSize = Object.keys(userVocabulary).length;
  document.getElementById('vocab-indicator').textContent = vocabSize;
};

const popupHandleAddResult = (report, lemma) => {
  if (report === 'ok') {
    requestUnhighlight(lemma);
    displayVocabularySize();
    document.getElementById('add-text').value = '';
    document.getElementById('add-op-result').textContent = browser.i18n.getMessage('addSuccess');
  } else if (report === 'exists') {
    document.getElementById('add-op-result').textContent = browser.i18n.getMessage('addErrorDupp');
  } else {
    document.getElementById('add-op-result').textContent = browser.i18n.getMessage('addErrorBad');
  }
};

const processAddWord = () => {
  const lexeme = document.getElementById('add-text').value;
  if (lexeme === 'dev-mode-on') {
    browser.storage.local.set({ developerModeEnabled: true });
    document.getElementById('add-text').value = '';
    return;
  }
  if (lexeme === 'dev-mode-off') {
    browser.storage.local.set({ developerModeEnabled: false });
    document.getElementById('add-text').value = '';
    return;
  }
  addLexeme(lexeme, popupHandleAddResult);
};

const processRate = async (increase) => {
  const { minimunRank } = await browser.storage.local.get(['minimunRank']);
  const newMinimunRank = minimunRank + increase > 0 ? minimunRank + increase : 0;
  // minimunRank += increase;
  // minimunRank = Math.min(100, Math.max(0, show_percents));
  // display_percents(minimunRank);
  document.getElementById('count-indicator').textContent = newMinimunRank;
  browser.storage.local.set({ minimunRank: newMinimunRank });
};

const processRateM100 = () => {
  processRate(-100);
};
const processRateM1000 = () => {
  processRate(-1000);
};
const processRateP100 = () => {
  processRate(100);
};
const processRateP1000 = () => {
  processRate(1000);
};

// function display_percents(show_percents) {
//     var not_showing_cnt = Math.floor((dict_size / 100.0) * show_percents);
//     document.getElementById("rateIndicator1").textContent = show_percents + "%";
//     document.getElementById("rateIndicator2").textContent = show_percents + "%";
//     document.getElementById("count-indicator").textContent = not_showing_cnt;
// }

const initControls = async () => {
  document.getElementById('add-to-list').addEventListener('click', processCheckbox);
  document.getElementById('adjust').addEventListener('click', processAdjust);
  document.getElementById('show-vocab').addEventListener('click', processShow);
  document.getElementById('get-help').addEventListener('click', processHelp);
  document.getElementById('add-word').addEventListener('click', processAddWord);
  document.getElementById('rank-m1000').addEventListener('click', processRateM1000);
  document.getElementById('rank-m100').addEventListener('click', processRateM100);
  document.getElementById('rank-p100').addEventListener('click', processRateP100);
  document.getElementById('rank-p1000').addEventListener('click', processRateP1000);
  document.getElementById('change-mode').addEventListener('click', processModeSwitch);

  document.getElementById('add-text').addEventListener('keyup', (event) => {
    event.preventDefault();
    if (event.key === 'Enter') {
      processAddWord();
    }
  });

  displayVocabularySize();

  const result = await browser.storage.local.get(['minimunRank', 'enabledMode']);
  // var show_percents = result.wd_show_percents;
  enabledMode = result.enabledMode;
  // dict_size = result.wd_word_max_rank;
  document.getElementById('count-indicator').textContent = result.minimunRank;
  // display_percents(show_percents);
  displayMode();
};

document.addEventListener('DOMContentLoaded', () => {
  localizeHtmlPage();
  initControls();
});
