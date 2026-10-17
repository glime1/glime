/* =========================================================
   GLIME DIALOG
   ---------------------------------------------------------
   GLIME-themed replacement for the browser's native
   "glime.online says" confirm / alert / prompt boxes.

   API (all return Promises):
     GLIME_DIALOG.confirm(message, {title, confirmText, cancelText, danger}) -> boolean
     GLIME_DIALOG.alert(message,   {title, okText})                          -> void
     GLIME_DIALOG.prompt(message, defaultValue, {title, confirmText, placeholder, multiline}) -> string | null

   window.alert is replaced with the themed (non-blocking) alert, so every
   existing alert(...) call is themed without any code change.
   window.confirm / window.prompt cannot be made themed without awaiting,
   so call sites use:  await GLIME_DIALOG.confirm(...)
   If this file has not loaded, call sites fall back to the native box.
   ========================================================= */
(function(){
'use strict';
if(window.GLIME_DIALOG) return;

var nativeAlert = window.alert ? window.alert.bind(window) : function(){};
var STYLE_ID = 'glimeDialogStyle';
var queue = [];
var active = false;

var CSS = [
':root{--gd-bg:#101b29;--gd-bg2:#0b1520;--gd-bd:rgba(184,222,234,.16);--gd-tx:#f4fbfd;--gd-mu:#9cabb9;--gd-cy:#52e8ff;--gd-gr:#50f5a8;--gd-rd:#ff8291}',
'.gd-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,8,12,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .16s ease}',
'.gd-ov.in{opacity:1}',
'.gd-box{width:min(420px,100%);background:var(--gd-bg);color:var(--gd-tx);border:1px solid var(--gd-bd);border-radius:20px;padding:22px 20px 18px;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Manrope,Arial,sans-serif;transform:translateY(10px) scale(.98);transition:transform .16s ease}',
'.gd-ov.in .gd-box{transform:none}',
'.gd-bar{width:38px;height:4px;border-radius:99px;background:linear-gradient(105deg,var(--gd-gr),var(--gd-cy));margin-bottom:14px}',
'.gd-box.danger .gd-bar{background:var(--gd-rd)}',
'.gd-title{font-size:1.02rem;font-weight:800;letter-spacing:-.01em;margin-bottom:7px}',
'.gd-msg{color:var(--gd-mu);font-size:.84rem;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:46vh;overflow:auto}',
'.gd-in{width:100%;margin-top:13px;background:var(--gd-bg2);color:var(--gd-tx);border:1px solid var(--gd-bd);border-radius:11px;padding:11px 12px;font:inherit;font-size:.86rem;outline:none}',
'.gd-in:focus{border-color:rgba(82,232,255,.5)}',
'textarea.gd-in{min-height:110px;resize:vertical}',
'.gd-act{display:flex;justify-content:flex-end;gap:9px;margin-top:18px;flex-wrap:wrap}',
'.gd-btn{border:1px solid var(--gd-bd);background:transparent;color:var(--gd-tx);border-radius:11px;padding:10px 16px;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;min-width:84px}',
'.gd-btn:focus-visible{outline:2px solid var(--gd-cy);outline-offset:2px}',
'.gd-btn.ok{background:linear-gradient(105deg,var(--gd-gr),var(--gd-cy));color:#031014;border:0}',
'.gd-btn.bad{background:var(--gd-rd);color:#2a0409;border:0}',
'@media(max-width:520px){.gd-ov{align-items:flex-end;padding:10px}.gd-box{border-radius:20px 20px 16px 16px}.gd-act{flex-direction:column-reverse}.gd-btn{width:100%;padding:13px 16px}}'
].join('');

function ensureStyle(){
  if(document.getElementById(STYLE_ID)) return;
  var s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  (document.head || document.documentElement).appendChild(s);
}

function el(tag, cls, text){
  var n = document.createElement(tag);
  if(cls) n.className = cls;
  if(text != null) n.textContent = text;
  return n;
}

function pump(){
  if(active || !queue.length) return;
  active = true;
  var job = queue.shift();
  show(job);
}

function show(job){
  ensureStyle();
  var prevFocus = document.activeElement;
  var ov = el('div', 'gd-ov');
  var box = el('div', 'gd-box' + (job.danger ? ' danger' : ''));
  box.setAttribute('role', job.kind === 'alert' ? 'alertdialog' : 'dialog');
  box.setAttribute('aria-modal', 'true');

  box.appendChild(el('div', 'gd-bar'));
  var titleId = 'gdT' + Date.now();
  var title = el('div', 'gd-title', job.title);
  title.id = titleId;
  box.setAttribute('aria-labelledby', titleId);
  box.appendChild(title);
  if(job.message) box.appendChild(el('div', 'gd-msg', job.message));

  var input = null;
  if(job.kind === 'prompt'){
    input = el(job.multiline ? 'textarea' : 'input', 'gd-in');
    if(!job.multiline) input.type = 'text';
    input.value = job.defaultValue == null ? '' : String(job.defaultValue);
    if(job.placeholder) input.placeholder = job.placeholder;
    box.appendChild(input);
  }

  var act = el('div', 'gd-act');
  var cancel = null;
  if(job.kind !== 'alert'){
    cancel = el('button', 'gd-btn', job.cancelText);
    cancel.type = 'button';
    act.appendChild(cancel);
  }
  var ok = el('button', 'gd-btn ' + (job.danger ? 'bad' : 'ok'), job.confirmText);
  ok.type = 'button';
  act.appendChild(ok);
  box.appendChild(act);
  ov.appendChild(box);
  document.body.appendChild(ov);
  requestAnimationFrame(function(){ ov.classList.add('in'); });

  var done = false;
  function close(result){
    if(done) return;
    done = true;
    document.removeEventListener('keydown', onKey, true);
    ov.classList.remove('in');
    setTimeout(function(){
      if(ov.parentNode) ov.parentNode.removeChild(ov);
      try{ if(prevFocus && prevFocus.focus) prevFocus.focus(); }catch(e){}
      active = false;
      job.resolve(result);
      pump();
    }, 140);
  }

  function onKey(e){
    if(e.key === 'Escape'){
      e.preventDefault(); e.stopPropagation();
      close(job.kind === 'confirm' ? false : (job.kind === 'prompt' ? null : undefined));
    }else if(e.key === 'Enter' && !(job.multiline && e.target === input) && e.target !== cancel){
      e.preventDefault(); e.stopPropagation();
      ok.click();
    }else if(e.key === 'Tab'){
      var f = box.querySelectorAll('button,input,textarea');
      if(!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  ok.addEventListener('click', function(){
    if(job.kind === 'confirm') close(true);
    else if(job.kind === 'prompt') close(input.value);
    else close(undefined);
  });
  if(cancel) cancel.addEventListener('click', function(){ close(job.kind === 'prompt' ? null : false); });
  ov.addEventListener('mousedown', function(e){
    if(e.target === ov && job.kind !== 'alert') close(job.kind === 'prompt' ? null : false);
  });

  setTimeout(function(){
    try{
      if(input){ input.focus(); input.select(); }
      else if(job.danger && cancel) cancel.focus();
      else ok.focus();
    }catch(e){}
  }, 30);
}

function enqueue(job){
  return new Promise(function(resolve){
    if(!document.body){
      /* Page not ready: fall back so a message is never lost. */
      if(job.kind === 'alert'){ nativeAlert(job.message); return resolve(); }
      if(job.kind === 'confirm') return resolve(window.confirm(job.message));
      return resolve(window.prompt(job.message, job.defaultValue));
    }
    job.resolve = resolve;
    queue.push(job);
    pump();
  });
}

function opts(o){ return o && typeof o === 'object' ? o : {}; }

window.GLIME_DIALOG = {
  confirm: function(message, o){
    o = opts(o);
    return enqueue({
      kind:'confirm', message:String(message == null ? '' : message),
      title:o.title || 'Please confirm',
      confirmText:o.confirmText || 'Confirm', cancelText:o.cancelText || 'Cancel',
      danger:!!o.danger
    });
  },
  alert: function(message, o){
    o = opts(o);
    return enqueue({
      kind:'alert', message:String(message == null ? '' : message),
      title:o.title || 'GLIME', confirmText:o.okText || 'OK'
    });
  },
  prompt: function(message, defaultValue, o){
    o = opts(o);
    return enqueue({
      kind:'prompt', message:String(message == null ? '' : message),
      title:o.title || 'Enter details', defaultValue:defaultValue,
      confirmText:o.confirmText || 'Save', cancelText:o.cancelText || 'Cancel',
      placeholder:o.placeholder, multiline:!!o.multiline
    });
  }
};

/* Every existing alert(...) call becomes themed. alert() never returns a value
   anyone depends on, so making it non-blocking is safe. */
window.alert = function(message){
  window.GLIME_DIALOG.alert(message);
};
})();
