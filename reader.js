const key = 'flow-reader-v1';
const get = id => document.getElementById(id);
const reader = get('reader'), track = get('track'), works = get('works');
const scene = get('scene');
const prev = get('prev'), next = get('next');
let state = {active:samples[0].id,custom:[],progress:{}};
try { state = JSON.parse(localStorage.getItem(key)) ?? state; } catch {}
let sentences, progress, rows, starts, sourceEnds, activeWork;
function split(text) {
  return (text.match(/[^。！？!?\n]+[。！？!?]*[」』）】”’]*|[。！？!?]+[」』）】”’]*/g) ?? []).map(s => s.trim()).filter(Boolean);
}
function groupDialogue(lines) {
  const groups = [];
  let depth = 0;
  for (const [index,line] of lines.entries()) {
    const previous = groups.at(-1);
    const attribution = previous?.text.match(/[」』]$/) && /^(?:と|って)[^「『」』]{1,16}[。！？!?]$/.test(line);
    if (depth>0 || attribution) {
      previous.text += line;
      previous.end = index+1;
    } else groups.push({text:line,end:index+1});
    for (const char of line) {
      if ('「『'.includes(char)) depth++;
      if ('」』'.includes(char)) depth = Math.max(0,depth-1);
    }
  }
  return groups;
}
function splitLong(sentence) {
  const parts = [];
  while (sentence.length>56) {
    const cut = sentence.lastIndexOf('、',Math.min(55,sentence.length-21))+1;
    if (cut<20) break;
    parts.push(sentence.slice(0,cut));
    sentence = sentence.slice(cut);
  }
  return [...parts,sentence];
}
function pageIndex() {
  return starts[progress.index]+(progress.part ?? 0);
}
function save() {
  try { localStorage.setItem(key,JSON.stringify(state)); return true; } catch { return false; }
}
function center(offset = 0, pullingPreview = false) {
  scene.style.setProperty('--drag-glow',Math.min(1,Math.abs(offset)/64));
  if (offset) scene.style.setProperty('--glow-x',pullingPreview || offset<0 ? '0%' : '100%');
  const row = rows[pageIndex()];
  track.style.transform = 'translateX(' + (reader.clientWidth/2-track.offsetLeft-row.offsetLeft-row.offsetWidth/2+offset) + 'px)';
}
let positionAnimations = [];
function updatePosition() {
  const number = get('position-number');
  const old = get('position-old');
  const value = String(pageIndex()+1);
  get('position').setAttribute('aria-label',value+'ページ。ページへ移動');
  const before = number.textContent;
  if (before===value) return;
  positionAnimations.forEach(animation => animation.cancel());
  number.textContent = value;
  if (!before || reducedMotion.matches) return;
  const direction = Number(value)>Number(before) ? 1 : -1;
  old.textContent = before;
  const timing = {duration:230,easing:'cubic-bezier(.2,.8,.25,1)'};
  positionAnimations = [
    old.animate([{translate:'0 0',opacity:1},{translate:'0 '+(-direction*100)+'%',opacity:0}],timing),
    number.animate([{translate:'0 '+(direction*100)+'%',opacity:0},{translate:'0 0',opacity:1}],timing)
  ];
}
function render() {
  const page = pageIndex();
  const lastPage = page===rows.length-1;
  rows.forEach((row,i) => {
    row.toggleAttribute('data-previous',i===page-1);
    row.toggleAttribute('data-preview',i===page+1);
    if (i===page+1) row.setAttribute('aria-hidden','true');
    else row.removeAttribute('aria-hidden');
    if (i===page) row.setAttribute('aria-current','true');
    else row.removeAttribute('aria-current');
  });
  prev.disabled = page===0;
  next.setAttribute('aria-label',lastPage ? '読了' : '次の文');
  get('next-label').textContent = lastPage ? '読了 ✓' : '← あと一文だけ♡';
  updatePosition();
  const parts = starts[progress.index+1]-starts[progress.index];
  const cursor = lastPage && progress.read===sentences.length ? sentences.length : progress.index+(progress.part ?? 0)/parts;
  const sectionStart = Math.max(0,Math.ceil(cursor/8)-1)*8;
  const sectionLength = Math.min(8,sentences.length-sectionStart);
  const sectionRead = cursor-sectionStart;
  get('progress').setAttribute('aria-valuemax',sectionLength);
  get('progress').setAttribute('aria-valuenow',sectionRead);
  get('progressFill').style.transform = 'scaleX('+(sectionRead/sectionLength)+')';
  const hue = 218 + 36*progress.index/Math.max(1,sentences.length-1);
  const frame = scene.parentElement;
  frame.style.setProperty('--hue',hue);
  scene.style.setProperty('--scene-hue',218+(page%12)*24);
  scene.style.setProperty('--glow-x','0%');
  get('position').title = save() ? '' : 'このブラウザでは進捗を保存できません';
  center();
}
function load() {
  const library = [...samples,...state.custom];
  const work = library.find(item => item.id===state.active) ?? library[0];
  state.active = work.id;
  activeWork = work;
  works.replaceChildren(...library.map(item => new Option(item.level ? 'Lv.'+item.level+' · '+item.title : item.title,item.id)));
  works.value = work.id;
  const groups = groupDialogue(split(work.text));
  sentences = groups.map(group => group.text);
  sourceEnds = groups.map(group => group.end);
  progress = state.progress[work.id] ??= {index:0,read:0};
  if (!progress.groupedDialogue) {
    if (groups.length!==sourceEnds.at(-1)) {
      progress.index = sourceEnds.findIndex(end => end>progress.index);
      progress.read = sourceEnds.filter(end => end<=progress.read).length;
      progress.part = 0;
    }
    progress.groupedDialogue = true;
  }
  starts = [0];
  const pages = sentences.flatMap(sentence => {
    const parts = splitLong(sentence);
    starts.push(starts.at(-1)+parts.length);
    return parts;
  });
  rows = pages.map(text => {
    const row = document.createElement('p');
    row.className = 'sentence';
    row.textContent = text;
    return row;
  });
  track.replaceChildren(...rows);
  track.style.transition = 'none';
  render();
  track.getBoundingClientRect();
  track.style.transition = '';
}
const finish = get('finish');
get('finish-copy').onclick = async () => {
  const params = new URL(get('finish-share').href).searchParams;
  const text = [params.get('text'),params.get('url')].filter(Boolean).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    get('copy-status').textContent = 'コピーしました';
  } catch {
    get('copy-status').textContent = text;
  }
};
for (let i=0;i<16;i++) {
  const piece = document.createElement('span');
  const angle = i*Math.PI/8;
  piece.className = 'confetti';
  piece.setAttribute('aria-hidden','true');
  piece.style.setProperty('--x',Math.cos(angle)*145+'px');
  piece.style.setProperty('--y',Math.sin(angle)*108+'px');
  piece.style.setProperty('--color',i*47);
  finish.append(piece);
}
function move(direction) {
  const previousPage = pageIndex();
  const previousRead = progress.read;
  const finishing = direction===1 && pageIndex()===rows.length-1;
  const index = progress.index;
  const part = progress.part ?? 0;
  const lastPart = starts[index+1]-starts[index]-1;
  if (direction===1) {
    if (part<lastPart) progress.part = part+1;
    else {
      progress.read = Math.max(progress.read,index+1);
      if (index<sentences.length-1) {
        progress.index++;
        progress.part = 0;
      }
    }
  } else if (part>0) progress.part = part-1;
  else if (index>0) {
    progress.index--;
    progress.part = starts[index]-starts[index-1]-1;
  }
  render();
  if (direction===1 && pageIndex()!==previousPage && !reducedMotion.matches) {
    if (progress.read>previousRead && progress.read%8===0) {
      get('progress').animate(
        [{boxShadow:'0 0 0 #d9e1ff00'},{boxShadow:'0 0 16px 3px #b9caffbb'},{boxShadow:'0 0 0 #d9e1ff00'}],
        {duration:480,easing:'ease-out'}
      );
    }
  }
  if (finishing) {
    get('finish-count').textContent = sentences.length+' 文';
    const share = new URL('https://twitter.com/intent/tweet');
    const title = activeWork.shareTitle ?? activeWork.title;
    const punchline = 'あと一文だけ、のつもりが「'+title+'」を読了。';
    get('finish-joke').textContent = punchline;
    share.searchParams.set('text','DopaBooksで「'+title+'」を読了しました！！\n'+punchline);
    if (location.protocol==='https:') share.searchParams.set('url',location.origin+location.pathname);
    get('finish-share').href = share.href;
    get('copy-status').textContent = '';
    finish.showModal();
  }
}
const jumpDialog = get('jump-dialog');
const jumpPage = get('jump-page');
get('position').onclick = () => {
  jumpPage.max = rows.length;
  get('position-total').textContent = '（全'+rows.length+'ページ）';
  jumpPage.value = pageIndex()+1;
  jumpDialog.showModal();
};
get('jump-cancel').onclick = () => jumpDialog.close();
get('jump-form').onsubmit = event => {
  event.preventDefault();
  const page = Number(jumpPage.value)-1;
  if (!Number.isInteger(page) || page<0 || page>=rows.length) return;
  progress.index = starts.findIndex(start => start>page)-1;
  progress.part = page-starts[progress.index];
  track.style.transition = 'none';
  render();
  track.getBoundingClientRect();
  track.style.transition = '';
  jumpDialog.close();
};
const recapDialog = get('recap-dialog');
get('recap').onclick = () => {
  const page = pageIndex();
  const end = sourceEnds[progress.index-Number(page!==starts[progress.index+1]-1)] ?? 0;
  const workRecap = recaps[activeWork.id];
  const beats = workRecap?.filter(([line]) => line<=end) ?? [];
  get('recap-title').textContent = workRecap ? 'ここまでのあらすじ' : '直近の本文';
  get('recap-text').textContent = beats.length
    ? beats.slice(-3).map(([,text]) => text).join('\n')
    : workRecap ? 'まだ始まったところ。'
      : rows.slice(Math.max(0,page-2),page+1).map(row => row.textContent).join('\n');
  get('recap-credit').hidden = !activeWork.credit;
  if (activeWork.credit) {
    get('credit-text').textContent = activeWork.credit;
    get('credit-source').href = activeWork.source;
    get('credit-license').href = activeWork.license;
  }
  recapDialog.showModal();
};
prev.onclick = () => move(-1);
next.onclick = () => move(1);
works.onchange = () => { state.active = works.value; load(); };
document.addEventListener('keydown',event => {
  if (finish.open || recapDialog.open || jumpDialog.open || event.altKey || event.ctrlKey || event.metaKey || event.target.closest('select')) return;
  const direction = {ArrowRight:-1,ArrowLeft:1,PageUp:-1,PageDown:1}[event.key];
  if (!direction) return;
  event.preventDefault();
  if (!event.repeat) move(direction);
});
let touch;
reader.addEventListener('pointerdown',event => {
  if (!event.isPrimary) return;
  const page = pageIndex();
  const preview = rows[page+1]?.getBoundingClientRect();
  const pullingPreview = Boolean(preview && event.clientX>=preview.left && event.clientX<=preview.right);
  if (event.pointerType==='mouse') {
    if (!pullingPreview || event.button!==0) return;
    event.preventDefault();
  }
  touch = {id:event.pointerId,x:event.clientX,y:event.clientY,pullingPreview};
  reader.setPointerCapture(event.pointerId);
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
reader.addEventListener('pointermove',event => {
  if (touch?.id!==event.pointerId) return;
  const dx = event.clientX-touch.x, dy = event.clientY-touch.y;
  if (Math.hypot(dx,dy)>9) touch.dragged = true;
  if (reducedMotion.matches || !touch.dragged) return;
  track.style.transition = 'none';
  const offset = touch.pullingPreview ? Math.max(0,Math.min(reader.clientWidth/2,dx)) : Math.max(-64,Math.min(64,dx));
  center(Math.abs(dx)>Math.abs(dy) ? offset : 0,touch.pullingPreview);
});
reader.addEventListener('pointerup',event => {
  if (touch?.id!==event.pointerId) return;
  const dx = event.clientX-touch.x, dy = event.clientY-touch.y;
  const pullingPreview = touch.pullingPreview;
  const tapped = !touch.dragged && Math.hypot(dx,dy)<=9;
  touch = null;
  track.style.transition = '';
  if (tapped) move(1);
  else if (pullingPreview && dx>=42 && dx>Math.abs(dy)) move(1);
  else if (!pullingPreview && Math.abs(dx)>=32 && Math.abs(dx)>Math.abs(dy)) move(dx<0 ? 1 : -1);
  else center();
});
reader.addEventListener('lostpointercapture',() => {
  if (!touch) return;
  touch = null;
  track.style.transition = '';
  center();
});
load();
new ResizeObserver(() => center()).observe(reader);
