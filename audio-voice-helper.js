(function(){
'use strict';
var note=document.getElementById('audioVoiceNote');
if(!note||document.getElementById('voiceHelpBtn'))return;
var ua=navigator.userAgent||'',android=/Android/i.test(ua),ios=/iPhone|iPad|iPod/i.test(ua);
if(!document.getElementById('voiceHelpStyle')){var st=document.createElement('style');st.id='voiceHelpStyle';st.textContent='.voice-help{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6)}.voice-help[hidden]{display:none}.voice-help-card{width:min(520px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:22px;margin:0}.voice-help-card h2{margin:4px 0 8px;font-size:1.15rem}.voice-help-card p{font-size:.82rem;line-height:1.6}.voice-help-card ol{margin:10px 0 14px;padding-left:20px;line-height:1.7;font-size:.82rem}.voice-help-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.voice-help-actions a,.voice-help-actions button{text-decoration:none;display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:8px 14px;font-size:.78rem}.voice-help-count{margin:10px 0 0;font-size:.78rem;font-weight:700}';document.head.appendChild(st);}
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text)e.textContent=text;return e;}
function frCount(){var l=window.speechSynthesis&&speechSynthesis.getVoices?speechSynthesis.getVoices():[];return l.filter(function(v){return /^fr/i.test(String(v.lang||'').replace('_','-'));}).length;}
var btn=el('button','secondary-btn','🎙 Améliorer les voix');btn.type='button';btn.id='voiceHelpBtn';btn.style.marginTop='8px';
note.parentNode.insertBefore(btn,note.nextSibling);
var ov=el('div','voice-help');ov.id='voiceHelp';ov.hidden=true;ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');ov.setAttribute('aria-labelledby','voiceHelpTitle');
var card=el('div','form-panel voice-help-card');
var kick=el('p','section-kicker','VOIX NATURELLES');
var title=el('h2','','Des voix plus humaines');title.id='voiceHelpTitle';
var intro=el('p','','Les voix de lecture viennent de ton téléphone. Installe les voix françaises de haute qualité de Google : elles apparaîtront ensuite dans la liste des voix d’Aurore.');
var steps=el('ol');
var list=android?['Touche « Ouvrir les réglages vocaux » ci-dessous.','Choisis « Synthèse vocale Google » comme moteur, puis touche l’engrenage ⚙ → « Installer les données vocales » → Français.','Télécharge une voix de haute qualité (la plus complète), reviens ici et touche « Actualiser les voix ».']:(ios?['Ouvre Réglages → Accessibilité → Contenu énoncé → Voix.','Choisis Français puis une voix « Améliorée » ou « Premium » et télécharge-la.','Reviens ici et touche « Actualiser les voix ».']:['Installe des voix françaises « naturelles » dans les paramètres vocaux de ton système (Windows : Paramètres → Heure et langue → Voix).','Reviens ici et touche « Actualiser les voix ».']);
list.forEach(function(t){steps.appendChild(el('li','',t));});
var count=el('p','voice-help-count');count.setAttribute('role','status');
var actions=el('div','voice-help-actions');
if(android){var a1=el('a','primary-btn','Ouvrir les réglages vocaux');a1.href='intent:#Intent;action=com.android.settings.TTS_SETTINGS;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dcom.google.android.tts;end';a1.setAttribute('data-no-spa','1');actions.appendChild(a1);var a2=el('a','secondary-btn','Installer / mettre à jour Google Synthèse vocale');a2.href='https://play.google.com/store/apps/details?id=com.google.android.tts';a2.target='_blank';a2.rel='noopener';a2.setAttribute('data-no-spa','1');actions.appendChild(a2);}
var refresh=el('button','secondary-btn','↻ Actualiser les voix');refresh.type='button';actions.appendChild(refresh);
var close=el('button','secondary-btn','Fermer');close.type='button';actions.appendChild(close);
card.append(kick,title,intro,steps,count,actions);ov.appendChild(card);(document.querySelector('main')||document.body).appendChild(ov);
function update(){var n=frCount();count.textContent=n?n+' voix française(s) détectée(s) sur cet appareil.':'Aucune voix française détectée pour le moment.';btn.textContent=(!n&&android)?'🎙 Installer des voix françaises':'🎙 Améliorer les voix';return n;}
function open(){update();ov.hidden=false;try{localStorage.setItem('aurore-voice-help-seen','1');}catch(e){}}
function shut(){ov.hidden=true;}
btn.addEventListener('click',open);close.addEventListener('click',shut);
ov.addEventListener('click',function(e){if(e.target===ov)shut();});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&ov.isConnected)shut();});
refresh.addEventListener('click',function(){var before=frCount();try{speechSynthesis.cancel();if(typeof speechSynthesis.onvoiceschanged==='function')speechSynthesis.onvoiceschanged();}catch(e){}setTimeout(function(){var n=update();if(n<=before)count.textContent+=' Si tu viens d’installer une voix, ferme puis rouvre Aurore pour qu’elle apparaisse.';},700);});
if(window.speechSynthesis&&speechSynthesis.addEventListener)speechSynthesis.addEventListener('voiceschanged',update);
setTimeout(function(){var n=update(),seen=false;try{seen=localStorage.getItem('aurore-voice-help-seen')==='1';}catch(e){}if(android&&!n&&!seen)open();},2500);
})();
