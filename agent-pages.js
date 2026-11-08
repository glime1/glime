/* GLIME agent pages: step-by-step animation sequencer */
(function(){
document.documentElement.classList.add('js');
var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var boxes=[].slice.call(document.querySelectorAll('[data-seq]'));
boxes.forEach(function(box){
  var items=[].slice.call(box.querySelectorAll('[data-s]'));
  var steps=[],seen={};
  items.forEach(function(e){var v=+e.getAttribute('data-s');if(!seen[v]){seen[v]=1;steps.push(v)}});
  steps.sort(function(a,b){return a-b});
  var gap=+box.getAttribute('data-gap')||1000,hold=+box.getAttribute('data-hold')||3500;
  var i=0,t=null,run=false;
  function show(n){
    items.forEach(function(e){var m=+e.getAttribute('data-s')===n;if(m)e.classList.add('on');e.classList.toggle('cur',m)});
    box.style.setProperty('--p',(steps.indexOf(n)+1)/steps.length);
  }
  function reset(){items.forEach(function(e){e.classList.remove('on','cur')});i=0;box.style.setProperty('--p',0)}
  function tick(){
    if(!run)return;
    if(i<steps.length){show(steps[i++]);t=setTimeout(tick,gap)}
    else{t=setTimeout(function(){reset();t=setTimeout(tick,500)},hold)}
  }
  if(rm||!('IntersectionObserver' in window)){items.forEach(function(e){e.classList.add('on')});box.style.setProperty('--p',1);return}
  new IntersectionObserver(function(es){
    es.forEach(function(en){
      if(en.isIntersecting&&!run){run=true;tick()}
      else if(!en.isIntersecting&&run){run=false;clearTimeout(t)}
    });
  },{threshold:.3}).observe(box);
});
})();
/* live counters: tween up, then keep ticking slowly while visible */
(function(){
var rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
[].slice.call(document.querySelectorAll('.cn')).forEach(function(el){
  var to=+el.getAttribute('data-to'),pre=el.getAttribute('data-pre')||'',suf=el.getAttribute('data-suf')||'';
  var live=el.hasAttribute('data-live'),step=+el.getAttribute('data-step')||1,p=el.getAttribute('data-p')?+el.getAttribute('data-p'):1;
  var cur=to,tm=null,vis=false,started=false;
  function fmt(v){return pre+Math.round(v).toLocaleString('en-IN')+suf}
  el.textContent=fmt(to);
  if(rm||!('IntersectionObserver' in window))return;
  function tick(){if(!vis)return;if(Math.random()<p){cur+=Math.max(1,Math.round(step*(0.6+Math.random()*0.8)));el.textContent=fmt(cur)}tm=setTimeout(tick,2200+Math.random()*2600)}
  function tween(){var t0=performance.now(),d=1600;(function f(t){var k=Math.min(1,(t-t0)/d),e=1-Math.pow(1-k,3);el.textContent=fmt(to*e);if(k<1)requestAnimationFrame(f);else{cur=to;if(live)tm=setTimeout(tick,1800)}})(t0)}
  new IntersectionObserver(function(es){es.forEach(function(en){
    if(en.isIntersecting){vis=true;if(!started){started=true;el.textContent=fmt(0);tween()}else if(live){clearTimeout(tm);tm=setTimeout(tick,1200)}}
    else{vis=false;clearTimeout(tm)}
  })},{threshold:.4}).observe(el);
});
})();
