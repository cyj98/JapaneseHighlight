import browser from 'webextension-polyfill';
import { syncIfNeeded } from './lib/common_lib';

const listSectionNames = {
  blackList: 'black-list-section',
  whiteList: 'white-list-section',
  userVocabulary: 'vocabulary-section',
};

const deleteBlackWhiteList = async (event, listName) => {
  const key = event.target.dataset.text;
  const result = await browser.storage.local.get([listName]);
  const userList = result[listName];
  delete userList[key];
  browser.storage.local.set({ [listName]: userList });
  event.target.parentElement.remove();
};

const deleteUserDictionary = async (event) => {
  const key = event.target.dataset.text;
  const { userVocabulary, userVocabAdded, userVocabDeleted } = await browser.storage.local.get([
    'userVocabulary',
    'userVocabAdded',
    'userVocabDeleted',
  ]);
  const newState = { userVocabulary };
  delete userVocabulary[key];
  if (typeof userVocabAdded !== 'undefined') {
    delete userVocabAdded[key];
    newState.userVocabAdded = userVocabAdded;
  }
  if (typeof userVocabDeleted !== 'undefined') {
    userVocabDeleted[key] = 1;
    newState.userVocabDeleted = userVocabDeleted;
  }
  await browser.storage.local.set(newState);
  syncIfNeeded();
  event.target.parentElement.remove();
};

const createLabel = (text) => {
  const textElement = document.createElement('span');
  textElement.className = 'word-text';
  textElement.textContent = text;
  return textElement;
};

const createButton = (listName, text) => {
  const deleteButtonElement = document.createElement('input');
  deleteButtonElement.className = 'delete-button';
  deleteButtonElement.src = '../images/delete.png';
  deleteButtonElement.type = 'image';
  deleteButtonElement.dataset.text = text;
  if (listName === 'userVocabulary') {
    deleteButtonElement.addEventListener('click', (event) => {
      deleteUserDictionary(event);
    });
  } else {
    deleteButtonElement.addEventListener('click', (event) => {
      deleteBlackWhiteList(event, listName);
    });
  }
  return deleteButtonElement;
};

const showList = (listName, list) => {
  const sectionName = listSectionNames[listName];
  const sectionElement = document.getElementById(sectionName);
  if (!Object.keys(list).length) {
    sectionElement.appendChild(createLabel(browser.i18n.getMessage('emptyListError')));
    return;
  }
  Object.keys(list).forEach((key) => {
    if (key.indexOf("'") !== -1 || key.indexOf('"') !== -1) {
      return;
    }
    const divElement = document.createElement('div');
    divElement.style = 'display:flex; align-items: center;';
    divElement.appendChild(createButton(listName, key));
    divElement.appendChild(createLabel(key));
    sectionElement.appendChild(divElement);
  });
};

const processDisplay = async () => {
  let listName;
  if (document.getElementById('black-list-section')) {
    listName = 'blackList';
  } else if (document.getElementById('white-list-section')) {
    listName = 'whiteList';
  } else {
    listName = 'userVocabulary';
  }

  const result = await browser.storage.local.get([listName]);
  const userList = result[listName];
  showList(listName, userList);
};

document.addEventListener('DOMContentLoaded', () => {
  processDisplay();
});
