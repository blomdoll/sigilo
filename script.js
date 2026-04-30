const supabaseUrl = '[https://mgzbmpcirzeaqfzrpiro.supabase.co](https://mgzbmpcirzeaqfzrpiro.supabase.co)';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1nemJtcGNpcnplYXFmenJwaXJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NzQzNTgsImV4cCI6MjA5MzE1MDM1OH0.igJ1MqmbOSGCICdzWSqcl58zP7OTMQr3zF_g6t0F_1I';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

const S={
  users:[], 
  posts:[],
  me:null,
  page:'feed',
  ptab:'posts',
  puid:null,
  modal:false,
  coOpen:{},
  cat:'todos',
  menu:null
};
const CATS=['todos','decoraciones','letras','símbolos','biografías','usernames','nombres'];
const uid=()=>'x'+Math.random().toString(36).slice(2);
const ago=ts=>{const d=Date.now()-ts;return d<60000?'ahora':d<3600000?~~(d/60000)+'m':d<86400000?~~(d/3600000)+'h':~~(d/86400000)+'d';};
const esc=s=>s?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):'';
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2000);}

function stab(tab){
  document.getElementById('lf').style.display=tab==='login'?'block':'none';
  document.getElementById('rf').style.display=tab==='register'?'block':'none';
  document.getElementById('tl').className='atab'+(tab==='login'?' on':'');
  document.getElementById('tr').className='atab'+(tab==='register'?' on':'');
  document.getElementById('le').textContent='';
  document.getElementById('ree').textContent='';
}

async function login() {
  const email = document.getElementById('lu').value.trim(); // Nota: Supabase usa email por defecto
  const password = document.getElementById('lp').value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    document.getElementById('le').textContent = 'Error: ' + error.message;[cite: 2]
  } else {
    S.me = data.user;
    boot();[cite: 2]
  }
}

async function register() {
  const email = document.getElementById('re').value.trim();
  const password = document.getElementById('rp').value;
  const username = document.getElementById('ru').value.trim();

  // Supabase se encarga de crear el usuario y validar el correo
  const { data, error } = await supabase.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { display_name: username } // Guardamos el username en los metadatos
    }
  });

  if (error) {
    document.getElementById('ree').textContent = error.message;[cite: 2]
  } else {
    toast('¡Cuenta creada! Revisa tu correo de confirmación.');
    S.me = data.user; 
    boot();[cite: 2]
  }
}

function boot(){
  document.getElementById('auth').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('app').style.flexDirection='column';
  document.getElementById('app').style.minHeight='100%';
  gofeed();
}

async function fetchPosts() {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (!error) {
    S.posts = data; // Llenamos nuestro estado local con los datos reales
    render();[cite: 2]
  }
}

function logout(){
  S.me=null;
  document.getElementById('app').style.display='none';
  document.getElementById('auth').style.display='flex';
  document.getElementById('lu').value='';document.getElementById('lp').value='';
  stab('login');
}

function gofeed(){S.page='feed';S.puid=null;S.menu=null;nav();render();}
function goprofile(){S.page='profile';S.puid=S.me.id;S.ptab='posts';S.menu=null;nav();render();}
function vprof(id){S.page='profile';S.puid=id;S.ptab='posts';S.menu=null;nav();render();}
function nav(){
  ['nf','np'].forEach(id=>document.getElementById(id).className='nbtn');
  const active=S.page==='feed'?'nf':'np';
  document.getElementById(active).className='nbtn on';
}

function avEl(user,big=false){
  const cls=big?'pav':'av';
  const ini=user&&user.name?user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2):'?';
  if(user&&user.av)return `<div class="${cls}"><img src="${user.av}" alt=""/>${big?'<div class="pavov">cambiar</div>':''}</div>`;
  return `<div class="${cls}">${ini}${big?'<div class="pavov">cambiar</div>':''}</div>`;
}

function render(){
  const mc=document.getElementById('mc');
  mc.innerHTML=S.page==='feed'?rfeed():rprofile();
}

function rfeed(){
  const posts=(S.cat==='todos'?[...S.posts]:S.posts.filter(p=>p.cat===S.cat)).sort((a,b)=>b.t-a.t);
  return`
  <div class="ftitle">inicio</div>
  <div class="fsub">comparte decoraciones, letras, símbolos y más ✦</div>
  <div class="ccard">
    <div class="ctop">${avEl(S.me)}<textarea class="ctxt" id="ct" placeholder="comparte algo bonito... ✦"></textarea></div>
    <div class="cbot">
      <select class="csel" id="cc">${CATS.slice(1).map(c=>`<option>${c}</option>`).join('')}</select>
      <button class="pbtn" onclick="post()">publicar ✦</button>
    </div>
  </div>
  <div class="cats">${CATS.map(c=>`<button class="catb${S.cat===c?' on':''}" onclick="setcat('${c}')">${c}</button>`).join('')}</div>
  ${posts.length===0?`<div class="empty"><div class="ei">🌸</div><div class="el">aún no hay publicaciones aquí</div></div>`:posts.map(rpost).join('')}`;
}

function rpost(p){
  const author=S.users.find(x=>x.id===p.uid)||{name:p.un,username:p.un,av:null};
  const liked=p.likes.includes(S.me.id);
  const saved=p.saved.includes(S.me.id);
  const own=p.uid===S.me.id;
  const mopen=S.menu===p.id;
  const copen=S.coOpen[p.id];
  return`
  <div class="pcard">
    <div class="phead">
      ${avEl(author)}
      <div style="flex:1">
        <div class="puname" onclick="vprof('${p.uid}')">${esc(author.username)}</div>
        <div class="ptime">${ago(p.t)}</div>
      </div>
      <span class="pbadge">${esc(p.cat)}</span>
      ${own?`<div class="mwrap">
        <button class="dotsbtn" onclick="tmenu('${p.id}',event)">···</button>
        ${mopen?`<div class="pmenu">
          <button class="mi" onclick="tocol('${p.id}')">⊞&nbsp;guardar en colección</button>
          <button class="mi del" onclick="dpost('${p.id}')">✕&nbsp;eliminar publicación</button>
        </div>`:''}
      </div>`:''}
    </div>
    <div class="pcontent">${esc(p.body)}</div>
    <div class="pacts">
      <button class="abtn${liked?' liked':''}" onclick="tlike('${p.id}')">♡ ${p.likes.length}</button>
      <button class="abtn" onclick="tcmt('${p.id}')">◌ ${p.cmts.length}</button>
      <button class="abtn${saved?' sav':''}" onclick="tsave('${p.id}')">◈ ${saved?'guardado':'guardar'}</button>
    </div>
    ${copen?`<div class="csec">
      <div class="crow">
        <input class="cinput" id="ci${p.id}" placeholder="escribe un comentario..." onkeydown="if(event.key==='Enter')scmt('${p.id}')"/>
        <button class="sendbtn" onclick="scmt('${p.id}')">↑</button>
      </div>
      ${p.cmts.map(c=>{
        const ca=S.users.find(x=>x.id===c.uid)||{username:c.un,av:null,name:c.un};
        return`<div class="cm">${avEl(ca)}<div class="cmb"><div class="cma">${esc(ca.username)}</div><div class="cmt">${esc(c.txt)}</div></div></div>`;
      }).join('')}
    </div>`:''}
  </div>`;
}

function rprofile(){
  const user=S.users.find(x=>x.id===S.puid)||S.me;
  const own=user.id===S.me.id;
  const tab=S.ptab;
  const myp=S.posts.filter(p=>p.uid===user.id).sort((a,b)=>b.t-a.t);
  const svd=S.posts.filter(p=>p.saved.includes(S.me.id)).sort((a,b)=>b.t-a.t);
  const col=S.posts.filter(p=>p.uid===S.me.id&&p.col).sort((a,b)=>b.t-a.t);
  return`
  <div class="ppage">
    <div class="pavwrap">
      <div class="pav" ${own?'onclick="upavatar()"':''} style="${own?'cursor:pointer':'cursor:default'}">
        ${user.av?`<img src="${user.av}" alt=""/>`:(user.name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2))}
        ${own?'<div class="pavov">cambiar foto</div>':''}
      </div>
    </div>
    <input type="file" id="avup" accept="image/*" style="display:none" onchange="havatar(event)"/>
    <div class="pinfo">
      <div class="pname">${esc(user.name)}</div>
      ${user.bio?`<div class="pbio">${esc(user.bio)}</div>`:`<div class="pbio" style="color:var(--tx3);font-style:italic">sin biografía aún</div>`}
      ${own?`<button class="editbtn" onclick="openmod()">editar perfil</button>`:''}
    </div>
    <div class="ptabs">
      <button class="ptab${tab==='posts'?' on':''}" onclick="stptab('posts')">publicaciones</button>
      ${own?`<button class="ptab${tab==='saved'?' on':''}" onclick="stptab('saved')">guardados</button>
      <button class="ptab${tab==='col'?' on':''}" onclick="stptab('col')">colecciones</button>`:''}
    </div>
    ${tab==='posts'?(myp.length?myp.map(rpost).join(''):`<div class="empty"><div class="ei">✦</div><div class="el">aún no hay publicaciones</div></div>`):''}
    ${tab==='saved'?(svd.length?svd.map(rpost).join(''):`<div class="empty"><div class="ei">◈</div><div class="el">aún no guardaste nada</div></div>`):''}
    ${tab==='col'?(col.length?col.map(rpost).join(''):`<div class="empty"><div class="ei">⊞</div><div class="el">usa el menú ··· de tus publicaciones para guardar en colecciones</div></div>`):''}
  </div>
  ${S.modal?`<div class="mov" onclick="mclose(event)">
    <div class="mdl">
      <div class="mdlt">editar perfil</div>
      <div class="field"><label>Nombre</label><input id="en" value="${esc(user.name)}"/></div>
      <div class="field"><label>Biografía</label><textarea id="eb" placeholder="cuéntanos de ti...">${esc(user.bio)}</textarea></div>
      <div class="macts">
        <button class="cancelbtn" onclick="closemod()">cancelar</button>
        <button class="savebtn" onclick="savemod()">guardar</button>
      </div>
    </div>
  </div>`:''}`;
}

function setcat(c){S.cat=c;S.menu=null;render();}
function stptab(t){S.ptab=t;render();}
function tmenu(id,e){e.stopPropagation();S.menu=S.menu===id?null:id;render();}
document.addEventListener('click',()=>{if(S.menu){S.menu=null;render();}});

async function post() {
  const txt = document.getElementById('ct').value.trim();[cite: 2]
  const cat = document.getElementById('cc').value;[cite: 2]

  if (!txt) {
    toast('escribe algo primero ✦');[cite: 2]
    return;
  }

  const { data, error } = await supabase
    .from('posts')
    .insert([
      { 
        body: txt, 
        category: cat, 
        user_id: S.me.id 
      }
    ]);

  if (error) {
    toast('Error al publicar');
  } else {
    document.getElementById('ct').value = ''; // Limpiar textarea
    render(); // Refrescar la vista
    toast('publicado en la nube ✦');
  }
}
  
function tlike(id){
  const p=S.posts.find(x=>x.id===id);if(!p)return;
  const i=p.likes.indexOf(S.me.id);
  if(i>-1)p.likes.splice(i,1);else p.likes.push(S.me.id);
  render();
}

function tsave(id){
  const p=S.posts.find(x=>x.id===id);if(!p)return;
  const i=p.saved.indexOf(S.me.id);
  if(i>-1){p.saved.splice(i,1);toast('eliminado de guardados');}
  else{p.saved.push(S.me.id);toast('guardado ◈');}
  render();
}

function tocol(id){
  const p=S.posts.find(x=>x.id===id);if(!p)return;
  p.col=!p.col;S.menu=null;
  toast(p.col?'añadido a colección ⊞':'eliminado de colección');render();
}

function dpost(id){
  S.posts=S.posts.filter(x=>x.id!==id);S.menu=null;
  toast('publicación eliminada');render();
}

function tcmt(id){S.coOpen[id]=!S.coOpen[id];render();}

function scmt(id){
  const inp=document.getElementById('ci'+id);if(!inp)return;
  const txt=inp.value.trim();if(!txt)return;
  const p=S.posts.find(x=>x.id===id);if(!p)return;
  p.cmts.push({id:uid(),uid:S.me.id,un:S.me.username,txt,t:Date.now()});
  render();
}

function upavatar(){document.getElementById('avup').click();}
function havatar(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();
  r.onload=ev=>{
    S.me.av=ev.target.result;
    const u=S.users.find(x=>x.id===S.me.id);if(u)u.av=ev.target.result;
    render();toast('foto actualizada ✦');
  };
  r.readAsDataURL(f);
}

function openmod(){S.modal=true;render();}
function closemod(){S.modal=false;render();}
function mclose(e){if(e.target===e.currentTarget)closemod();}
function savemod(){
  const n=document.getElementById('en').value.trim();
  const b=document.getElementById('eb').value.trim();
  if(!n)return;
  S.me.name=n;S.me.bio=b;
  const u=S.users.find(x=>x.id===S.me.id);if(u){u.name=n;u.bio=b;}
  S.modal=false;render();toast('perfil actualizado ✦');
}
