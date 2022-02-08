import browser from 'webextension-polyfill';
import PQueue from 'p-queue';
import { makeHlStyle, addLexeme } from './lib/common_lib';
import { getDictDefinitionUrl } from './lib/context_menu_lib';
import contentScriptStyle from '../styles/content_script.css';

const queue = new PQueue({ concurrency: 20 });

const classNamePrefix = 'wdautohlja';
const JapaneseRegex = /[ぁ-んァ-ン一-龠]/;
let dictWords;

let userVocabulary = [];
let minimunRank = 1;
let highlightSettings = null;
let hoverSettings = null;
let onlineDicts = null;
let ttsEnabled = null;

let currentLexeme = '';
// use to find node to render popup
let currentNodeId = 1;

let functionKeyIsPressed = false;
let renderedNodeId = null;
let nodeToRenderId = null;

const formatOriginalWord = (word) => {
  if (!word) return word;
  const maxLen = 20;
  const newWord = word.replace(/-/g, ' ');
  if (newWord.length <= maxLen) return newWord;
  return `${newWord.slice(0, maxLen)}...`;
};

const getHeatColorPoint = (freqPercentOld) => {
  let freqPercent = freqPercentOld;
  if (!freqPercent) freqPercent = 0;
  freqPercent = Math.max(0, Math.min(100, freqPercent));
  const hue = 100 - freqPercent;
  return `hsl(${hue}, 100%, 50%)`;
};

const goodTagsList = [
  'P',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'B',
  'SMALL',
  'STRONG',
  'Q',
  'DIV',
  'SPAN',
  'TABLE',
  'TBODY',
  'TR',
  'TD',
];

const goodNodeFilter = (node) => {
  if (goodTagsList.indexOf(node.parentNode.tagName) !== -1) return NodeFilter.FILTER_ACCEPT;
  return NodeFilter.FILTER_SKIP;
};

const textToHlNodes = async (textNode) => {
  const { parentElement, textContent } = textNode;

  const response = await queue.add(() => browser.runtime.sendMessage({ textContent }));
  if (!response) return;
  const tokenizeOther = hoverSettings.ow_hover !== 'never';
  let wordBeginIndex = 0;
  const lines = response.split('\n');

  let newTextNode = textNode;
  let lastEndPos = 0;
  let specialFlag = false;
  let oldIndex;
  // length - 2 because last 2 lines always are "EOS" ""
  for (let i = 0; i < lines.length - 2; i += 1) {
    let className;
    let textStyle;
    const textArr = lines[i].split('\t');
    const originalWord = textArr[0];
    if (originalWord.match(JapaneseRegex)) {
      const lemma = textArr[3];
      let match;
      if (
        highlightSettings.wordParams.enabled &&
        !Object.prototype.hasOwnProperty.call(userVocabulary, lemma)
      ) {
        const wordFound = dictWords[lemma];
        if (wordFound && wordFound.rank >= minimunRank) {
          match = originalWord;
          textStyle = makeHlStyle(highlightSettings.wordParams);
          className = `${lemma}_${originalWord}_${wordFound.rank}`;
        }
      }
      if (tokenizeOther && !match) {
        match = originalWord;
        textStyle = 'font:inherit;display:inline;color:inherit;background-color:inherit;';
        className = match;
      }
      if (match) {
        const span = document.createElement('span');
        span.textContent = match;
        span.id = `${classNamePrefix}_${currentNodeId}`;
        span.className = `${classNamePrefix}_${className}`;
        span.style = textStyle;
        currentNodeId += 1;
        newTextNode = newTextNode.splitText(wordBeginIndex - lastEndPos);
        lastEndPos = wordBeginIndex + match.length;
        if (newTextNode.textContent) {
          newTextNode.deleteData(0, match.length);
          parentElement.insertBefore(span, newTextNode);
        }
      }
      wordBeginIndex += originalWord.length;
    } else if (originalWord.includes('�')) {
      // mecab sometimes will show two consecutive lines includes � instead of 1 normal line
      if (specialFlag && wordBeginIndex === oldIndex) {
        wordBeginIndex += 1;
      }
      oldIndex = wordBeginIndex;
      specialFlag = !specialFlag;
    } else if (originalWord !== 'EOS') {
      wordBeginIndex += originalWord.length;
    }
  }
};

const doHighlightText = (textNode) => {
  if (textNode.nodeType !== Node.TEXT_NODE || dictWords === null || minimunRank === null) return;
  const { parentElement, textContent } = textNode;
  if (!parentElement) return;
  if (!textContent) return;
  if (!textContent.match(JapaneseRegex)) return;
  if (
    typeof parentElement.className === 'string' &&
    parentElement.className.includes(classNamePrefix)
  )
    return;
  parentElement.classList.add(classNamePrefix);
  textToHlNodes(textNode);
};

const textNodesUnder = (node) => {
  if (!node.nodeType === Node.ELEMENT_NODE && !node.nodeType === Node.TEXT_NODE) return;
  if (node.id && node.id.startsWith(classNamePrefix)) return;
  const nodeList = [];
  const treeWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, goodNodeFilter, false);
  let currentNode = treeWalker.nextNode();
  while (currentNode) {
    if (
      currentNode.nodeType === Node.ELEMENT_NODE &&
      currentNode.getAttribute('contenteditable') === 'true'
    )
      break;
    nodeList.push(currentNode);
    currentNode = treeWalker.nextNode();
  }
  nodeList.forEach((textNode) => doHighlightText(textNode));
};

const unhighlight = (lemma) => {
  const hlNodes = document.querySelectorAll(
    `[class^=${classNamePrefix}_${lemma.replace(/ /g, '-')}]`,
  );
  hlNodes.forEach((hlNode) => {
    hlNode.removeAttribute('style');
    hlNode.setAttribute('class', `${classNamePrefix}_none_none`);
  });
};

const bubbleHandleTts = (lexeme) => {
  const utterance = new SpeechSynthesisUtterance(lexeme);
  utterance.lang = 'ja';
  speechSynthesis.speak(utterance);
};

const bubbleHandleAddResult = (report, lemma) => {
  if (report === 'ok' || report === 'exists') {
    unhighlight(lemma);
  }
};

const searchDict = (e) => {
  const dictUrl = e.target.dataset.dictionaryReferenceUrl;
  const newTabUrl = getDictDefinitionUrl(dictUrl, currentLexeme);
  browser.runtime.sendMessage({ wdmNewTabUrl: newTabUrl });
};

const hideBubble = (force) => {
  const bubbleDOM = document
    .getElementById('wd-selection-bubble-container-ja')
    .shadowRoot.getElementById('wd-selection-bubble');
  if (force || !bubbleDOM || (!bubbleDOM.wdMouseOn && nodeToRenderId !== renderedNodeId)) {
    bubbleDOM.style.display = 'none';
    renderedNodeId = null;
  }
};

const createBubble = () => {
  const bubbleDOMContainer = document.createElement('div');
  const shadow = bubbleDOMContainer.attachShadow({ mode: 'open' });
  bubbleDOMContainer.id = 'wd-selection-bubble-container-ja';
  const bubbleDOM = document.createElement('div');
  const style = document.createElement('style');
  [[, style.textContent]] = contentScriptStyle;
  shadow.prepend(style);
  shadow.append(bubbleDOM);

  bubbleDOM.id = 'wd-selection-bubble';

  const infoSpan = document.createElement('span');
  infoSpan.id = 'wd-selection-bubble-text';
  bubbleDOM.appendChild(infoSpan);

  const freqSpan = document.createElement('span');
  freqSpan.id = 'wd-selection-bubble-freq';
  freqSpan.textContent = 'n/a';
  bubbleDOM.appendChild(freqSpan);

  const addButton = document.createElement('button');
  addButton.className = 'wd-add-button';
  addButton.textContent = browser.i18n.getMessage('menuItem');
  addButton.style.marginBottom = '4px';
  addButton.addEventListener('click', () => {
    addLexeme(currentLexeme, bubbleHandleAddResult).then((result) => {
      if (result === true) userVocabulary[currentLexeme] = 1;
    });
  });
  bubbleDOM.appendChild(addButton);

  const speakButton = document.createElement('button');
  speakButton.className = 'wd-add-button';
  speakButton.textContent = 'Audio';
  speakButton.style.marginBottom = '4px';
  speakButton.addEventListener('click', () => {
    bubbleHandleTts(currentLexeme);
  });
  bubbleDOM.appendChild(speakButton);

  const dictPairs = onlineDicts;
  for (let i = 0; i < dictPairs.length; i += 1) {
    const dictButton = document.createElement('button');
    dictButton.className = 'wd-add-button';
    dictButton.textContent = dictPairs[i].title;
    dictButton.dataset.dictionaryReferenceUrl = dictPairs[i].url;
    dictButton.addEventListener('click', searchDict);
    bubbleDOM.appendChild(dictButton);
  }

  bubbleDOM.addEventListener('mouseleave', () => {
    bubbleDOM.wdMouseOn = false;
    hideBubble(false);
  });
  bubbleDOM.addEventListener('mouseenter', () => {
    bubbleDOM.wdMouseOn = true;
  });

  return bubbleDOMContainer;
};

const renderBubble = () => {
  if (!nodeToRenderId) return;
  if (nodeToRenderId === renderedNodeId) return;

  const nodeToRender = document.getElementById(nodeToRenderId);
  if (!nodeToRender || nodeToRender.nodeType !== Node.ELEMENT_NODE) return;

  const { className } = nodeToRender;
  const isHighlighted = className !== `${classNamePrefix}_none_none`;
  const paramKey = isHighlighted ? 'hl_hover' : 'ow_hover';
  const paramValue = hoverSettings[paramKey];
  if (paramValue === 'never' || (paramValue === 'key' && !functionKeyIsPressed)) {
    return;
  }

  const shadow = document.getElementById('wd-selection-bubble-container-ja').shadowRoot;
  const bubbleDOM = shadow.getElementById('wd-selection-bubble');
  const bubbleText = shadow.getElementById('wd-selection-bubble-text');
  const bubbleFreq = shadow.getElementById('wd-selection-bubble-freq');
  const [, lexeme, , rankAndCount] = className.split('_');
  currentLexeme = formatOriginalWord(lexeme);
  bubbleText.textContent = currentLexeme;
  if (rankAndCount) {
    bubbleFreq.textContent = rankAndCount;
    const [rank] = bubbleFreq.textContent.split(':');
    bubbleFreq.style.backgroundColor = getHeatColorPoint((rank / dictWords.length) * 100);
    bubbleFreq.style.visibility = 'visible';
  } else {
    bubbleFreq.style.visibility = 'hidden';
  }
  const bcr = nodeToRender.getBoundingClientRect();
  bubbleDOM.style.top = `${bcr.bottom}px`;
  bubbleDOM.style.left = `${Math.max(5, Math.floor((bcr.left + bcr.right) / 2) - 100)}px`;
  bubbleDOM.style.display = 'block';
  renderedNodeId = nodeToRenderId;

  if (ttsEnabled) {
    const utterance = new SpeechSynthesisUtterance(currentLexeme);
    utterance.lang = 'ja';
    speechSynthesis.speak(utterance);
  }
};

const processHlLeave = () => {
  nodeToRenderId = null;
  setTimeout(() => {
    if (renderedNodeId) hideBubble(false);
  }, 300);
};

const processMouse = (e) => {
  const hitNode = document.elementFromPoint(e.clientX, e.clientY);
  if (!hitNode || hitNode.nodeType !== Node.ELEMENT_NODE) {
    processHlLeave();
    return;
  }
  const { className } = hitNode;
  if (!className || typeof className !== 'string' || !className.startsWith(`${classNamePrefix}_`)) {
    processHlLeave();
    return;
  }

  nodeToRenderId = hitNode.id;
  renderBubble();
};

const getVerdict = (isEnabled, blackList, whiteList, hostname) => {
  if (Object.prototype.hasOwnProperty.call(blackList, hostname)) {
    return 'site in "Skip List"';
  }
  if (Object.prototype.hasOwnProperty.call(whiteList, hostname)) {
    return 'highlight';
  }
  return isEnabled ? 'highlight' : 'site is not in "Favorites List"';
};

const initForPage = async () => {
  if (!document.body) return;

  const result = await browser.storage.local.get([
    'dictWords',
    'onlineDicts',
    'hoverSettings',
    'enabledMode',
    'userVocabulary',
    'highlightSettings',
    'blackList',
    'whiteList',
    'ttsEnabled',
    'minimunRank',
  ]);
  const { enabledMode, blackList, whiteList } = result;
  const { hostname } = window.location;
  // window.location document.URL document.location.href
  const verdict = getVerdict(enabledMode, blackList, whiteList, hostname);
  // to change icon
  browser.runtime.sendMessage({ wdmVerdict: verdict });
  if (verdict !== 'highlight') return;
  ({
    dictWords,
    userVocabulary,
    onlineDicts,
    ttsEnabled,
    hoverSettings,
    highlightSettings,
    minimunRank,
  } = result);

  textNodesUnder(document.body);
  const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      Array.from(mutation.addedNodes).forEach((node) => {
        textNodesUnder(node);
      });
    });
  });
  observer.observe(document.body, { subtree: true, childList: true });

  browser.runtime.onMessage.addListener((request) => {
    if (request.wdm_unhighlight) {
      const lemma = request.wdm_unhighlight;
      unhighlight(lemma);
    }
  });

  const bubbleDOM = createBubble();
  document.body.appendChild(bubbleDOM);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Control') {
      functionKeyIsPressed = true;
      renderBubble();
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.key === 'Control') {
      functionKeyIsPressed = false;
    }
  });
  document.addEventListener('mousemove', processMouse, false);
  window.addEventListener('scroll', () => processHlLeave());
};

document.addEventListener('DOMContentLoaded', () => {
  initForPage();
});
window.onbeforeunload = () => queue.clear();
