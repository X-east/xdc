(function(){
var S={"theme":{"kind":"theme","default":"dark"},"edit":{"kind":"edit","default":"off"}};   /* 设置注册表：kind 决定生效方式，键名不写死在这里 */
var DEF='1.0';    /* 默认字号倍率，来自 FS_DEFAULT */
var BAR={"dark": "#0b1119", "light": "#f5f6f8", "sepia": "#f3e9d2"};      /* 主题 → 状态栏底色，来自 THEME_BAR */
var DARK='dark';  /* 深色主题的取值，来自 THEME_DARK */
function def(k){return (S[k]&&S[k].default)||''}
function read(k){try{return localStorage.getItem('mp:'+k);}catch(e){return null;}}
function eqv(a,b){var fa=parseFloat(a),fb=parseFloat(b);
 return (!isNaN(fa)&&!isNaN(fb))?fa===fb:(a===b);}
/* 当前生效值：存储里没有（或空串 —— 历史版本用空串表示深色留下的残值）就回默认。
   注意回默认**不等于**把默认写回存储：等于默认值时 store() 会删键，避免把默认值固化成第二份真相。 */
function val(k){var v=read(k);return (v===null||v==='')?def(k):v;}
function store(k,v){try{if(!v||eqv(v,def(k)))localStorage.removeItem('mp:'+k);
 else localStorage.setItem('mp:'+k,v);}catch(e){}}
function barOf(t){return BAR[t]||BAR[DARK];}   /* 未知主题名回落深色 */
/* 环境快照推给原生壳（A5）：主题 / 让位区底色 / 字号档位**一次**带齐，原生只解析一份 JSON。
   别在这里自己去摸 window.MoneyNative —— 原生那一侧的唯一入口是 back_kit 的 MPB.env
   （它按「拿不到就入队」处理，见 back_kit 的登记顺序注释，故本脚本可以比它先执行）。 */
function mpenv(t){
 var v=(t===undefined||t===null||t==='')?val('theme'):t;
 var o={theme:v,bar:barOf(v),fs:val('fs')};
 var f=window.__mpEnv;if(f){try{f(o);}catch(e){}return;}
 (window.__mpEnvQ=window.__mpEnvQ||[]).push(o);
}
window.mpSyncBar=function(t){try{mpenv(t);}catch(e){}};
/* 深色在 DOM 上表现为「无 data-theme」：:root 就是深色默认值，浅/暖色才由属性覆盖。
   于是 html[data-theme]{…} 那批只在浅/暖色生效的规则照旧，深色渲染逐值不变。 */
function theme(v){v=(v===null||v==='')?DARK:v;var r=document.documentElement;
 if(v===DARK)r.removeAttribute('data-theme');else r.setAttribute('data-theme',v);
 return v;}
function fs(v){if(!v)return;document.documentElement.style.setProperty('--mp-fs',v);}
function toggle(k,on){document.documentElement.classList.toggle('mp-hide-'+k,!on);}
function apply(k,v){var kind=S[k]&&S[k].kind;if(!kind)return;
 if(kind==='theme')theme(v);
 else if(kind==='fs')fs(v);
 else if(kind==='toggle')toggle(k,v!=='off');
 else if(kind==='edit'){try{window.dispatchEvent(new CustomEvent('mp-edit-set',
   {detail:{on:v!=='off'}}));}catch(e){}}
 try{if(window.MP_REPAINT_CHARTS)window.MP_REPAINT_CHARTS();}catch(e){}
 try{if(kind==='theme')document.dispatchEvent(new CustomEvent('mp:themechange',{detail:{theme:v||DARK}}));
 else if(kind==='fs')document.dispatchEvent(new CustomEvent('mp:fontsizechange',{detail:{fs:v}}));}catch(e){}
 /* 环境快照**只在这一处**推给原生（每次用户动作一次），别在 theme()/fs() 里各推一份 */
 try{mpenv();}catch(e){}}
function applyAll(o){if(!o)return;for(var k in o)apply(k,o[k]);}
function snapshot(){var o={},k;for(k in S)o[k]=val(k);return o;}
/* 首绘前还原（注入在 <head>，故不会先闪一下默认样子）；不广播、不落盘，只把已存的值摆好。 */
function boot(){try{
 for(var k in S){var kind=S[k].kind,v=val(k);
  if(kind==='theme')theme(v);else if(kind==='fs')fs(v);else if(kind==='toggle')toggle(k,v!=='off');}
 }catch(e){}
 /* 首绘后一次环境快照：原生冷启动那两条让位区的底色靠它对齐（与切主题走同一条路） */
 try{mpenv();}catch(e){}}
window.__mpCfg={S:S,DEF:DEF,DARK:DARK,BAR:BAR,def:def,read:read,val:val,store:store,eqv:eqv,
 barOf:barOf,theme:theme,fs:fs,apply:apply,applyAll:applyAll,snapshot:snapshot,boot:boot};
window.__mpCfg.boot();   /* 首绘前还原已存的主题/字号/开关（本脚本在 <head>，不会先闪默认样子） */
})();

(function(){window.MP_MAP_THEME={"dark": {"pal": ["#4a9eff", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa", "#22d3ee", "#94a3b8"], "colors": ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd", "#1d4ed8", "#1e40af"], "nps": ["#b45309", "#d97706", "#f59e0b", "#fbbf24", "#92400e", "#78350f"], "qrev": ["#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"], "qnp": ["#b45309", "#d97706", "#f59e0b", "#fbbf24"], "geo": {"sea": "#080d15", "area": "#1d2a44", "border": "#436399", "provBorder": "#2f4a70", "emphasis": "#283a54"}, "other": {"marker": "#3d4c66", "emphasis": "#5c6c88", "border": "#141d2e"}, "thermal": {"ramp": ["rgb(30,41,59)", "rgb(69,26,32)", "rgb(127,44,40)", "rgb(180,65,40)", "rgb(214,92,40)", "rgb(239,68,68)"], "end": "#ef4444", "base0": "#1d2a44", "baseMid": "#0d1420"}, "accent": "#4a9eff", "onAccent": "#0b1119", "amber": "#f59e0b", "warn": "#fbbf24", "link": "#8fc2ff", "violet": "#a78bfa", "violet2": "#8b6fd4", "violetLt": "#c4b5fd", "green2": "#22c55e", "hydroLine": "#7fb2ff", "hydroLbl": "#9fc4ff", "pos": "#34d399", "neg": "#f87171", "tx": "#e8eef7", "tx2": "#9fb0c8", "flabelFg": "#9fb0c8", "tx3": "#7e93af", "line": "#2f3d54", "lineSoft": "#1c2637", "panel": "#0e1725", "panel2": "#16202f", "bg0": "#0d1420", "bg1": "#16223a", "bg2": "#0a0f18", "white": "#ffffff", "bd3": "#3a4a63", "tipBg": "rgba(13,20,32,.96)", "tipBg2": "rgba(13,20,32,.97)", "sliderFill": "rgba(74,158,255,.14)", "sliderSel": "rgba(74,158,255,.2)", "ov07": "rgba(255,255,255,.07)", "ov14": "rgba(255,255,255,.14)", "revBar": "rgba(74,158,255,.55)", "sliderTrack": "rgba(74,158,255,.12)", "lblBg": "rgba(13,20,32,.92)", "ptBorder": "rgba(4,8,14,.85)", "warnBorder": "rgba(245,158,11,.35)", "warnFill": "rgba(245,158,11,.08)", "axTipBg": "rgba(15,23,42,.95)", "tipTx": "#cbd5e1", "warnWash": "rgba(251,191,36,.09)", "warnGlow": "rgba(251,191,36,.32)", "noteTx": "#e8d9a8", "invAxis": "#9fb0c5", "invLine": "#22304a", "invGold": "#f0b429", "invGoldSoft": "rgba(240,180,41,.14)", "invAccentSoft": "rgba(77,163,255,.5)", "invHeader": "rgba(11,17,25,.92)", "invMuted": "#8fa0b8", "invUp": "#e24b4a", "invDown": "#3fb950", "invGoldAlt": "#e0a94a", "invBg": "#0b1119", "cate": {"precious": "#f59e0b", "nonfer": "#38bdf8", "ferrous": "#94a3b8", "newene": "#10b981", "coal": "#a78bfa", "oilgas": "#f43f5e", "enchem": "#fb923c", "chem": "#22d3ee", "hydro": "#2563eb", "nuclear": "#f59e0b", "thermal": "#ef4444", "pumped": "#a78bfa", "renew": "#2dd4bf"}}, "light": {"pal": ["#1d6fe8", "#c98a00", "#0e9f78", "#e11d48", "#7c3aed", "#0e7490", "#64748b"], "colors": ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa", "#1d4ed8", "#1e3a8a"], "nps": ["#92400e", "#b45309", "#c98a00", "#d97706", "#78350f", "#5b2f08"], "qrev": ["#1d4ed8", "#2563eb", "#3b82f6", "#60a5fa"], "qnp": ["#92400e", "#b45309", "#c98a00", "#d97706"], "geo": {"sea": "#c3d3e6", "area": "#fbfdff", "border": "#8299b8", "provBorder": "#b3c4d8", "emphasis": "#dfe9f5"}, "other": {"marker": "#cdd6e2", "emphasis": "#64748b", "border": "#9aa7bd"}, "thermal": {"ramp": ["rgb(203,214,226)", "rgb(200,150,150)", "rgb(214,160,150)", "rgb(225,120,110)", "rgb(235,140,120)", "rgb(225,29,72)"], "end": "#e11d48", "base0": "#fbfdff", "baseMid": "#eef1f6"}, "accent": "#1a64d1", "onAccent": "#ffffff", "amber": "#c98a00", "warn": "#d97706", "link": "#1d6fe8", "violet": "#7c3aed", "violet2": "#7c3aed", "violetLt": "#a78bfa", "green2": "#0e9f78", "hydroLine": "#1d6fe8", "hydroLbl": "#1d6fe8", "pos": "#10b981", "neg": "#ef4444", "tx": "#1b2431", "tx2": "#5a6b80", "flabelFg": "#9fb0c8", "tx3": "#5f6b7a", "line": "#c6cfdc", "lineSoft": "#dbe1ea", "panel": "#eef1f6", "panel2": "#e6ebf1", "bg0": "#eef1f6", "bg1": "#e6ebf1", "bg2": "#f2f4f8", "white": "#1b2431", "bd3": "#c6cfdc", "tipBg": "rgba(255,255,255,.96)", "tipBg2": "rgba(255,255,255,.97)", "sliderFill": "rgba(29,111,232,.14)", "sliderSel": "rgba(29,111,232,.2)", "ov07": "rgba(0,0,0,.07)", "ov14": "rgba(0,0,0,.14)", "revBar": "rgba(74,158,255,.55)", "sliderTrack": "rgba(74,158,255,.12)", "lblBg": "rgba(13,20,32,.92)", "ptBorder": "rgba(4,8,14,.85)", "warnBorder": "rgba(245,158,11,.35)", "warnFill": "rgba(245,158,11,.08)", "axTipBg": "rgba(15,23,42,.95)", "tipTx": "#cbd5e1", "warnWash": "rgba(251,191,36,.09)", "warnGlow": "rgba(251,191,36,.32)", "noteTx": "#e8d9a8", "invAxis": "#5a6b80", "invLine": "#c9d3e0", "invGold": "#c98a00", "invGoldSoft": "rgba(176,112,0,.14)", "invAccentSoft": "rgba(29,111,232,.45)", "invHeader": "rgba(255,255,255,.92)", "invMuted": "#6b7686", "invUp": "#e11d48", "invDown": "#10b981", "invGoldAlt": "#c98a00", "invBg": "#f5f6f8", "cate": {"precious": "#c98a00", "nonfer": "#0e7490", "ferrous": "#64748b", "newene": "#0e9f78", "coal": "#7c3aed", "oilgas": "#e11d48", "enchem": "#c2410c", "chem": "#0e7490", "hydro": "#1d4ed8", "nuclear": "#c98a00", "thermal": "#e11d48", "pumped": "#7c3aed", "renew": "#0d9488"}}, "sepia": {"pal": ["#8a4b12", "#8a4b12", "#0b7f60", "#b0174f", "#5b3fc4", "#0b6070", "#9c8e72"], "colors": ["#0b6f8f", "#0b7a9a", "#3a8aa8", "#6ba3bb", "#0b5f7a", "#0a4f66"], "nps": ["#6b3a0a", "#7a440f", "#8a4b12", "#9a5a18", "#5b2f08", "#4a2806"], "qrev": ["#0b6f8f", "#0b7a9a", "#3a8aa8", "#6ba3bb"], "qnp": ["#6b3a0a", "#7a440f", "#8a4b12", "#9a5a18"], "geo": {"sea": "#dbcbaa", "area": "#fcf7ea", "border": "#a08a5c", "provBorder": "#cbb78d", "emphasis": "#ecdfc4"}, "other": {"marker": "#d8c9a8", "emphasis": "#9c8e72", "border": "#b6a988"}, "thermal": {"ramp": ["rgb(216,201,168)", "rgb(210,170,150)", "rgb(216,180,150)", "rgb(200,130,120)", "rgb(190,150,140)", "rgb(176,23,79)"], "end": "#b0174f", "base0": "#fcf7ea", "baseMid": "#f3ead4"}, "accent": "#8a4b12", "onAccent": "#fffdf7", "amber": "#8a4b12", "warn": "#9a5a18", "link": "#8a4b12", "violet": "#5b3fc4", "violet2": "#5b3fc4", "violetLt": "#b9a6e6", "green2": "#0b7f60", "hydroLine": "#8a4b12", "hydroLbl": "#8a4b12", "pos": "#0b7f60", "neg": "#b0174f", "tx": "#3a3021", "tx2": "#6b7686", "flabelFg": "#9fb0c8", "tx3": "#6b5c3d", "line": "#d8c9a8", "lineSoft": "#e8dcc4", "panel": "#f3ead4", "panel2": "#efe6d2", "bg0": "#f3ead4", "bg1": "#efe6d2", "bg2": "#eee4cf", "white": "#3a3021", "bd3": "#d8c9a8", "tipBg": "rgba(251,244,226,.96)", "tipBg2": "rgba(251,244,226,.97)", "sliderFill": "rgba(11,96,112,.14)", "sliderSel": "rgba(11,96,112,.2)", "ov07": "rgba(58,48,33,.09)", "ov14": "rgba(58,48,33,.16)", "revBar": "rgba(74,158,255,.55)", "sliderTrack": "rgba(74,158,255,.12)", "lblBg": "rgba(13,20,32,.92)", "ptBorder": "rgba(4,8,14,.85)", "warnBorder": "rgba(245,158,11,.35)", "warnFill": "rgba(245,158,11,.08)", "axTipBg": "rgba(15,23,42,.95)", "tipTx": "#cbd5e1", "warnWash": "rgba(251,191,36,.09)", "warnGlow": "rgba(251,191,36,.32)", "noteTx": "#e8d9a8", "invAxis": "#6b7686", "invLine": "#d9c9a3", "invGold": "#8a4b12", "invGoldSoft": "rgba(138,75,18,.14)", "invAccentSoft": "rgba(11,96,112,.5)", "invHeader": "rgba(251,244,226,.92)", "invMuted": "#7a6a4e", "invUp": "#b0174f", "invDown": "#0b7f60", "invGoldAlt": "#8a4b12", "invBg": "#f3e9d2", "cate": {"precious": "#8a4b12", "nonfer": "#0b6070", "ferrous": "#9c8e72", "newene": "#0b7f60", "coal": "#5b3fc4", "oilgas": "#b0174f", "enchem": "#7a440f", "chem": "#0b6070", "hydro": "#0b6f8f", "nuclear": "#8a4b12", "thermal": "#b0174f", "pumped": "#5b3fc4", "renew": "#0b6f6a"}}, "cateCn": {"precious": {"n": "贵金属", "d": "金 · 银 · 铂族"}, "nonfer": {"n": "有色金属", "d": "铜 · 铝 · 铅锌 · 锡钨钼锑"}, "ferrous": {"n": "黑色金属", "d": "铁 · 锰 · 钒钛"}, "newene": {"n": "新能源金属", "d": "锂 · 稀土 · 镍钴 · 石墨"}, "coal": {"n": "煤炭", "d": "动力煤 · 炼焦煤"}, "oilgas": {"n": "石油天然气", "d": "海上油气 · 陆上油气"}, "enchem": {"n": "能源化工", "d": "炼油 · 乙烯 · 煤化工"}, "chem": {"n": "化工矿产", "d": "磷 · 钾盐 · 磷化工"}, "hydro": {"n": "水电", "d": "常规水电 · 梯级电站"}, "nuclear": {"n": "核电", "d": "在运 · 在建"}, "thermal": {"n": "火电", "d": "煤电 · 气电（省级口径）"}, "pumped": {"n": "抽水蓄能", "d": "在运 · 在建"}, "renew": {"n": "新能源发电", "d": "风电 · 光伏 · 储能"}}};})();

(function(){
/* 地图/投资者画布配色翻译表：由 app/build_content.py 的 MAP_PALETTE 单一真相源在构建期生成，
   覆盖 geo 结构色 + 数据系列 + 分类标记点 + 火电色阶 + 轴文字 + tooltip，切主题时即时翻译。
   改地图色 / 加主题只动 MAP_PALETTE 一处，硬资产/电力两图与投资者图表自动同步。 */
var PAL={"light": {"#4a9eff": "#1a64d1", "#f59e0b": "#c98a00", "#10b981": "#0e9f78", "#f43f5e": "#e11d48", "#a78bfa": "#7c3aed", "#22d3ee": "#0e7490", "#94a3b8": "#64748b", "#2563eb": "#1d4ed8", "#3b82f6": "#2563eb", "#60a5fa": "#3b82f6", "#93c5fd": "#60a5fa", "#1d4ed8": "#1d4ed8", "#1e40af": "#1e3a8a", "#b45309": "#92400e", "#d97706": "#b45309", "#fbbf24": "#d97706", "#92400e": "#78350f", "#78350f": "#5b2f08", "#080d15": "#c3d3e6", "#1d2a44": "#fbfdff", "#436399": "#8299b8", "#2f4a70": "#b3c4d8", "#283a54": "#dfe9f5", "#3d4c66": "#cdd6e2", "#5c6c88": "#64748b", "#141d2e": "#9aa7bd", "rgb(30,41,59)": "rgb(203,214,226)", "rgb(69,26,32)": "rgb(200,150,150)", "rgb(127,44,40)": "rgb(214,160,150)", "rgb(180,65,40)": "rgb(225,120,110)", "rgb(214,92,40)": "rgb(235,140,120)", "rgb(239,68,68)": "rgb(225,29,72)", "#ef4444": "#e11d48", "#0d1420": "#eef1f6", "#0b1119": "#f5f6f8", "#8fc2ff": "#1d6fe8", "#8b6fd4": "#7c3aed", "#c4b5fd": "#a78bfa", "#22c55e": "#0e9f78", "#7fb2ff": "#1d6fe8", "#9fc4ff": "#1d6fe8", "#34d399": "#10b981", "#f87171": "#ef4444", "#e8eef7": "#1b2431", "#9fb0c8": "#9fb0c8", "#7e93af": "#5f6b7a", "#2f3d54": "#c6cfdc", "#1c2637": "#dbe1ea", "#0e1725": "#eef1f6", "#16202f": "#e6ebf1", "#16223a": "#e6ebf1", "#0a0f18": "#f2f4f8", "#ffffff": "#1b2431", "#3a4a63": "#c6cfdc", "rgba(13,20,32,.96)": "rgba(255,255,255,.96)", "rgba(13,20,32,.97)": "rgba(255,255,255,.97)", "rgba(74,158,255,.14)": "rgba(29,111,232,.14)", "rgba(74,158,255,.2)": "rgba(29,111,232,.2)", "rgba(255,255,255,.07)": "rgba(0,0,0,.07)", "rgba(255,255,255,.14)": "rgba(0,0,0,.14)", "rgba(74,158,255,.55)": "rgba(74,158,255,.55)", "rgba(74,158,255,.12)": "rgba(74,158,255,.12)", "rgba(13,20,32,.92)": "rgba(13,20,32,.92)", "rgba(4,8,14,.85)": "rgba(4,8,14,.85)", "rgba(245,158,11,.35)": "rgba(245,158,11,.35)", "rgba(245,158,11,.08)": "rgba(245,158,11,.08)", "rgba(15,23,42,.95)": "rgba(15,23,42,.95)", "#cbd5e1": "#cbd5e1", "rgba(251,191,36,.09)": "rgba(251,191,36,.09)", "rgba(251,191,36,.32)": "rgba(251,191,36,.32)", "#e8d9a8": "#e8d9a8", "#9fb0c5": "#5a6b80", "#22304a": "#c9d3e0", "#f0b429": "#c98a00", "rgba(240,180,41,.14)": "rgba(176,112,0,.14)", "rgba(77,163,255,.5)": "rgba(29,111,232,.45)", "rgba(11,17,25,.92)": "rgba(255,255,255,.92)", "#8fa0b8": "#6b7686", "#e24b4a": "#e11d48", "#3fb950": "#10b981", "#e0a94a": "#c98a00", "#38bdf8": "#0e7490", "#fb923c": "#c2410c", "#2dd4bf": "#0d9488"}, "sepia": {"#4a9eff": "#8a4b12", "#f59e0b": "#8a4b12", "#10b981": "#0b7f60", "#f43f5e": "#b0174f", "#a78bfa": "#5b3fc4", "#22d3ee": "#0b6070", "#94a3b8": "#9c8e72", "#2563eb": "#0b6f8f", "#3b82f6": "#0b7a9a", "#60a5fa": "#3a8aa8", "#93c5fd": "#6ba3bb", "#1d4ed8": "#0b5f7a", "#1e40af": "#0a4f66", "#b45309": "#6b3a0a", "#d97706": "#7a440f", "#fbbf24": "#9a5a18", "#92400e": "#5b2f08", "#78350f": "#4a2806", "#080d15": "#dbcbaa", "#1d2a44": "#fcf7ea", "#436399": "#a08a5c", "#2f4a70": "#cbb78d", "#283a54": "#ecdfc4", "#3d4c66": "#d8c9a8", "#5c6c88": "#9c8e72", "#141d2e": "#b6a988", "rgb(30,41,59)": "rgb(216,201,168)", "rgb(69,26,32)": "rgb(210,170,150)", "rgb(127,44,40)": "rgb(216,180,150)", "rgb(180,65,40)": "rgb(200,130,120)", "rgb(214,92,40)": "rgb(190,150,140)", "rgb(239,68,68)": "rgb(176,23,79)", "#ef4444": "#b0174f", "#0d1420": "#f3ead4", "#0b1119": "#f3e9d2", "#8fc2ff": "#8a4b12", "#8b6fd4": "#5b3fc4", "#c4b5fd": "#b9a6e6", "#22c55e": "#0b7f60", "#7fb2ff": "#8a4b12", "#9fc4ff": "#8a4b12", "#34d399": "#0b7f60", "#f87171": "#b0174f", "#e8eef7": "#3a3021", "#9fb0c8": "#9fb0c8", "#7e93af": "#6b5c3d", "#2f3d54": "#d8c9a8", "#1c2637": "#e8dcc4", "#0e1725": "#f3ead4", "#16202f": "#efe6d2", "#16223a": "#efe6d2", "#0a0f18": "#eee4cf", "#ffffff": "#3a3021", "#3a4a63": "#d8c9a8", "rgba(13,20,32,.96)": "rgba(251,244,226,.96)", "rgba(13,20,32,.97)": "rgba(251,244,226,.97)", "rgba(74,158,255,.14)": "rgba(11,96,112,.14)", "rgba(74,158,255,.2)": "rgba(11,96,112,.2)", "rgba(255,255,255,.07)": "rgba(58,48,33,.09)", "rgba(255,255,255,.14)": "rgba(58,48,33,.16)", "rgba(74,158,255,.55)": "rgba(74,158,255,.55)", "rgba(74,158,255,.12)": "rgba(74,158,255,.12)", "rgba(13,20,32,.92)": "rgba(13,20,32,.92)", "rgba(4,8,14,.85)": "rgba(4,8,14,.85)", "rgba(245,158,11,.35)": "rgba(245,158,11,.35)", "rgba(245,158,11,.08)": "rgba(245,158,11,.08)", "rgba(15,23,42,.95)": "rgba(15,23,42,.95)", "#cbd5e1": "#cbd5e1", "rgba(251,191,36,.09)": "rgba(251,191,36,.09)", "rgba(251,191,36,.32)": "rgba(251,191,36,.32)", "#e8d9a8": "#e8d9a8", "#9fb0c5": "#6b7686", "#22304a": "#d9c9a3", "#f0b429": "#8a4b12", "rgba(240,180,41,.14)": "rgba(138,75,18,.14)", "rgba(77,163,255,.5)": "rgba(11,96,112,.5)", "rgba(11,17,25,.92)": "rgba(251,244,226,.92)", "#8fa0b8": "#7a6a4e", "#e24b4a": "#b0174f", "#3fb950": "#0b7f60", "#e0a94a": "#8a4b12", "#38bdf8": "#0b6070", "#fb923c": "#7a440f", "#2dd4bf": "#0b6f6a"}};
function norm(s){return String(s).replace(/\s+/g,'');}
function palOf(){var t=document.documentElement.getAttribute('data-theme');return PAL[t]||null;}
function tr(v){if(typeof v!=='string')return v;var p=palOf();if(!p)return v;
 var m=norm(v);return (m in p)?p[m]:v;}
function fsFactor(){try{var v=getComputedStyle(document.documentElement).getPropertyValue('--mp-fs');
 var n=parseFloat(v);return (isNaN(n)||!n)?1:n;}catch(e){return 1;}}
function deep(v,k){if(typeof v==='string')return tr(v);
 if(v&&typeof v==='object'){if(Array.isArray(v))return v.map(function(x){return deep(x,k);});
  var o={},kk;for(kk in v){if(Object.prototype.hasOwnProperty.call(v,kk))o[kk]=deep(v[kk],kk);}return o;}
 if(typeof v==='number'&&/^fontsize$/i.test(k||'')){var f=fsFactor();if(f!==1)return v*f;}
 return v;}
var INSTS=[];
/* 累加「原始（深色字面量）option」（260926 修）：源页会连续多次**增量** setOption
   （地图 app.js 有几十处，如 chart.setOption({geo:{center,zoom}})），原先只记最后一次的
   参数 → 切主题时只能重放最后一小块，整张画布留在旧主题上（实测电力图切主题后画布亮度
   逐值不变，硬资产碰巧最后一发是大 option 才跟着变，所以只在部分页暴露）。
   这里按 echarts 的合并语义自己累加：普通对象逐键递归、数组按同下标递归合并；
   重放时 notMerge=true 一次落定，得到与切换前逐值一致的图。 */
function mpMerge(a,b){if(!a)return b;if(!b)return a;
 if(typeof a!=='object'||typeof b!=='object')return b;
 if(Array.isArray(a)||Array.isArray(b)){
  if(!Array.isArray(a)||!Array.isArray(b))return b;
  /* 数组**按同下标合并**（260930 修）：echarts 的 setOption 对数组本就是「同下标项逐个合并」，
     整体替换会把「只下发了一部分项」的增量 option 里没提到的项整块丢掉 ——
     地图的 setGeo() 每次都只发 geo:[主 geo 残片, 省界层]，残片里**没有 map**；
     整体替换后切主题重放 geo[0] 便丢了 map，主底图整块消失（异常还会被静默吞掉）。 */
  var n=Math.max(a.length,b.length),out=[],i;
  for(i=0;i<n;i++)out[i]=(i<b.length)?mpMerge(a[i],b[i]):a[i];
  return out;}
 var o={},k;for(k in a)o[k]=a[k];for(k in b)o[k]=mpMerge(a[k],b[k]);return o;}
function wrapInst(c){if(c.__mpInst)return;c.__mpInst=true;INSTS.push(c);var _set=c.setOption;
 c.__mpSet=_set;
 c.setOption=function(opt,notMerge){
  var nm=(notMerge===true)||(notMerge&&notMerge.notMerge===true);   /* echarts 允许传 {notMerge:true} */
  try{
   if(opt&&typeof opt==='object'){c.__mpRaw=nm?opt:mpMerge(c.__mpRaw,opt);_set.call(c,deep(opt,null),notMerge);return;}
  }catch(e){}
  _set.call(c,opt,notMerge);};
 var _clr=c.clear;if(_clr)c.clear=function(){c.__mpRaw=null;return _clr.apply(this,arguments);};}
function wrapEc(ec){if(!ec||ec.__mpWrap)return;var _init=ec.init;
 ec.init=function(){var c=_init.apply(this,arguments);try{wrapInst(c);}catch(e){}return c;};
 ec.__mpWrap=true;}
try{if(window.echarts&&window.echarts.init)wrapEc(window.echarts);}catch(e){}
try{var _ec=window.echarts;Object.defineProperty(window,'echarts',{configurable:true,
 get:function(){if(_ec&&!_ec.__mpWrap&&_ec.init)wrapEc(_ec);return _ec;},
 set:function(v){_ec=v;}});
}catch(e){try{if(window.echarts&&window.echarts.init)wrapEc(window.echarts);}catch(e){}}
window.MP_REPAINT_CHARTS=function(){
 INSTS.slice().forEach(function(c){try{
  if(c&&c.__mpRaw&&typeof c.__mpSet==='function'&&!(c.isDisposed&&c.isDisposed()))
   c.__mpSet.call(c,deep(c.__mpRaw,null),true);   /* 用累加出来的整份原始 option 整体重放 */
 }catch(e){}});};
})();

(function(){
function C(){return window.__mpCfg;}
window.addEventListener('message',function(e){try{var d=e.data;
 if(!d||typeof d!=='object')return;
 if(d.mp==='cfg'&&d.cfg)C().applyAll(d.cfg);
 else if(d.mp==='theme')C().apply('theme',d.theme||C().DARK);
 else if(d.mp==='fs')C().apply('fs',d.fs);
}catch(x){}});
window.__mpApplyCfg=function(o){C().applyAll(o);};   /* 供本页脚本（设置面板）复用同一套生效逻辑 */
})();

(function(){
  function wrap(){
    var ts=document.querySelectorAll('table');
    for(var i=0;i<ts.length;i++){
      var t=ts[i], p=t.parentNode;
      if(!p || (p.classList && p.classList.contains('mp-table-scroll'))) continue;
      if(t.closest('[data-mp-table-native]')) continue;
      var w=document.createElement('div');
      w.className='mp-table-scroll';
      w.setAttribute('data-mp-table-wrap','1');
      p.insertBefore(w,t);
      w.appendChild(t);
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',wrap);
  else wrap();
})();

