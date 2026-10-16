(function(){
  var d=document;
  var items=d.querySelectorAll('.reveal');
  var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if(!('IntersectionObserver' in window)){
    items.forEach(function(el){el.classList.add('in')});
    d.documentElement.classList.add('no-io');
  }else{
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}});
    },{threshold:.15});
    items.forEach(function(el){io.observe(el)});
  }

  /* Udyam counter */
  var n=d.getElementById('msme-num');
  if(n&&!reduced&&'IntersectionObserver' in window){
    var target=8.84,start=null;
    var co=new IntersectionObserver(function(es){
      if(!es[0].isIntersecting)return;co.disconnect();
      function step(t){
        if(!start)start=t;
        var p=Math.min((t-start)/1400,1);
        n.textContent=(target*(1-Math.pow(1-p,3))).toFixed(2);
        if(p<1)requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    co.observe(n);
  }

  /* what-if calculator */
  var f=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
  function v(id){return +d.getElementById(id).value}
  function calc(){
    var enq=v('i-enq'),late=v('i-late'),conv=v('i-conv'),aov=v('i-aov'),rec=v('i-rec');
    d.getElementById('o-enq').textContent=enq.toLocaleString('en-IN');
    d.getElementById('o-late').textContent=late+'%';
    d.getElementById('o-conv').textContent=conv+'%';
    d.getElementById('o-aov').textContent=f.format(aov);
    d.getElementById('o-rec').textContent=rec+'%';
    var orders=enq*late/100*conv/100;
    var risk=orders*aov;
    d.getElementById('r-orders').textContent=Math.round(orders).toLocaleString('en-IN');
    d.getElementById('r-risk').textContent=f.format(risk);
    d.getElementById('r-win').textContent=f.format(risk*rec/100);
  }
  ['i-enq','i-late','i-conv','i-aov','i-rec'].forEach(function(id){
    var el=d.getElementById(id);if(el)el.addEventListener('input',calc);
  });
  if(d.getElementById('i-enq'))calc();
})();
