(function(){
"use strict";
if(window.AuroreScienceKeyboard)return;
var SQ="\\square",REC="aurore-science-recent-v1",CATK="aurore-science-cat-v1";
function store(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
function div(c,t){var n=document.createElement("div");if(c)n.className=c;if(t!=null)n.textContent=t;return n}
function letters(up){var o=[];for(var i=0;i<26;i++){var c=String.fromCharCode((up?65:97)+i);o.push([c,c,"Lettre "+c])}return o}

/* ---------- Tableau périodique : 118 éléments ---------- */
var EL_RAW="H:Hydrogène,He:Hélium,Li:Lithium,Be:Béryllium,B:Bore,C:Carbone,N:Azote,O:Oxygène,F:Fluor,Ne:Néon,Na:Sodium,Mg:Magnésium,Al:Aluminium,Si:Silicium,P:Phosphore,S:Soufre,Cl:Chlore,Ar:Argon,K:Potassium,Ca:Calcium,Sc:Scandium,Ti:Titane,V:Vanadium,Cr:Chrome,Mn:Manganèse,Fe:Fer,Co:Cobalt,Ni:Nickel,Cu:Cuivre,Zn:Zinc,Ga:Gallium,Ge:Germanium,As:Arsenic,Se:Sélénium,Br:Brome,Kr:Krypton,Rb:Rubidium,Sr:Strontium,Y:Yttrium,Zr:Zirconium,Nb:Niobium,Mo:Molybdène,Tc:Technétium,Ru:Ruthénium,Rh:Rhodium,Pd:Palladium,Ag:Argent,Cd:Cadmium,In:Indium,Sn:Étain,Sb:Antimoine,Te:Tellure,I:Iode,Xe:Xénon,Cs:Césium,Ba:Baryum,La:Lanthane,Ce:Cérium,Pr:Praséodyme,Nd:Néodyme,Pm:Prométhium,Sm:Samarium,Eu:Europium,Gd:Gadolinium,Tb:Terbium,Dy:Dysprosium,Ho:Holmium,Er:Erbium,Tm:Thulium,Yb:Ytterbium,Lu:Lutécium,Hf:Hafnium,Ta:Tantale,W:Tungstène,Re:Rhénium,Os:Osmium,Ir:Iridium,Pt:Platine,Au:Or,Hg:Mercure,Tl:Thallium,Pb:Plomb,Bi:Bismuth,Po:Polonium,At:Astate,Rn:Radon,Fr:Francium,Ra:Radium,Ac:Actinium,Th:Thorium,Pa:Protactinium,U:Uranium,Np:Neptunium,Pu:Plutonium,Am:Américium,Cm:Curium,Bk:Berkélium,Cf:Californium,Es:Einsteinium,Fm:Fermium,Md:Mendélévium,No:Nobélium,Lr:Lawrencium,Rf:Rutherfordium,Db:Dubnium,Sg:Seaborgium,Bh:Bohrium,Hs:Hassium,Mt:Meitnérium,Ds:Darmstadtium,Rg:Roentgenium,Cn:Copernicium,Nh:Nihonium,Fl:Flérovium,Mc:Moscovium,Lv:Livermorium,Ts:Tennesse,Og:Oganesson";
var F_NONMETAL=[1,6,7,8,15,16,34],F_NOBLE=[2,10,18,36,54,86,118],F_HALO=[9,17,35,53,85,117],F_ALK=[3,11,19,37,55,87],F_ALKE=[4,12,20,38,56,88],F_META=[5,14,32,33,51,52],F_POST=[13,31,49,50,81,82,83,84,113,114,115,116];
function family(z){if(F_NONMETAL.indexOf(z)>=0)return"nonmetal";if(F_NOBLE.indexOf(z)>=0)return"noble";if(F_HALO.indexOf(z)>=0)return"halogen";if(F_ALK.indexOf(z)>=0)return"alkali";if(F_ALKE.indexOf(z)>=0)return"alkaline";if(F_META.indexOf(z)>=0)return"metalloid";if(F_POST.indexOf(z)>=0)return"post";if(z>=57&&z<=71)return"lanthanide";if(z>=89&&z<=103)return"actinide";return"transition"}
function place(z){if(z===1)return[1,1];if(z===2)return[1,18];if(z<=4)return[2,z-2];if(z<=10)return[2,z+8];if(z<=12)return[3,z-10];if(z<=18)return[3,z];if(z<=36)return[4,z-18];if(z<=54)return[5,z-36];if(z<=56)return[6,z-54];if(z<=71)return[9,z-54];if(z<=86)return[6,z-68];if(z<=88)return[7,z-86];if(z<=103)return[10,z-86];return[7,z-100]}
var ELS=EL_RAW.split(",").map(function(s,i){var p=s.split(":"),z=i+1,pos=place(z);return{z:z,s:p[0],n:p[1],f:family(z),r:pos[0],c:pos[1]}});

/* ---------- Catégories de symboles ---------- */
var CATS=[
{id:"recent",icon:"🕘",name:"Récents",keys:null},
{id:"num",icon:"123",name:"Nombres",num:1,keys:[
["7","7","Sept"],["8","8","Huit"],["9","9","Neuf"],["(","(","Parenthèse ouvrante"],[")",")","Parenthèse fermante"],
["4","4","Quatre"],["5","5","Cinq"],["6","6","Six"],["[","[","Crochet ouvrant"],["]","]","Crochet fermant"],
["1","1","Un"],["2","2","Deux"],["3","3","Trois"],["+","+","Plus"],["-","−","Moins"],
["0","0","Zéro"],["{,}",",","Virgule décimale"],[".",".","Point"],["\\times","×","Multiplication"],["\\div","÷","Division"],
["=","=","Égal"],["<","<","Inférieur"],[">",">","Supérieur"],["\\leq","≤","Inférieur ou égal"],["\\geq","≥","Supérieur ou égal"],
["/","/","Barre oblique"],["^{\\square}","xⁿ","Exposant"],["_{\\square}","xₙ","Indice"],["|","|","Barre verticale"],["!","!","Factorielle"],
["\\{","{","Accolade ouvrante"],["\\}","}","Accolade fermante"],[",",",","Virgule"],[";",";","Point-virgule"],[":",":","Deux-points"],
["\\%","%","Pourcentage"],["'","′","Apostrophe (prime)"],["\\infty","∞","Infini"],["\\pi","π","Pi"],["\\mathrm{e}","e","Nombre e"]
]},
{id:"calc",icon:"∑",name:"Calcul",keys:[
["\\frac{\\square}{\\square}","a⁄b","Fraction"],
["\\sqrt{\\square}","√","Racine carrée"],
["\\sqrt[\\square]{\\square}","ⁿ√","Racine n-ième"],
["\\square^{\\square}","xⁿ","Puissance"],
["\\square_{\\square}","xₙ","Indice"],
["\\square_{\\square}^{\\square}","xₙᵖ","Indice et exposant"],
["^{2}","x²","Au carré"],["^{3}","x³","Au cube"],["^{-1}","x⁻¹","Exposant moins un"],["\\times10^{\\square}","×10ⁿ","Notation scientifique"],
["\\left(\\square\\right)","( )","Parenthèses ajustées"],
["\\left[\\square\\right]","[ ]","Crochets ajustés"],
["\\left\\{\\square\\right\\}","{ }","Accolades ajustées"],
["\\left|\\square\\right|","| |","Valeur absolue"],
["\\left\\|\\square\\right\\|","‖ ‖","Norme"],
["\\left\\lfloor\\square\\right\\rfloor","⌊ ⌋","Partie entière"],
["\\left\\lceil\\square\\right\\rceil","⌈ ⌉","Arrondi supérieur"],
["\\sum_{\\square}^{\\square}\\square","∑","Somme"],
["\\prod_{\\square}^{\\square}\\square","∏","Produit"],
["\\int_{\\square}^{\\square}\\square\\,\\mathrm{d}\\square","∫","Intégrale définie"],
["\\int\\square\\,\\mathrm{d}\\square","∫□","Primitive"],
["\\iint","∬","Intégrale double"],["\\iiint","∭","Intégrale triple"],["\\oint","∮","Intégrale sur un contour"],
["\\lim_{\\square\\to\\square}\\square","lim","Limite"],
["\\frac{\\mathrm{d}\\square}{\\mathrm{d}\\square}","d/dx","Dérivée"],
["\\frac{\\partial\\square}{\\partial\\square}","∂/∂x","Dérivée partielle"],
["f'(\\square)","f′","Dérivée f′"],["f''(\\square)","f″","Dérivée seconde f″"],
["\\partial","∂","Symbole de dérivée partielle"],["\\nabla","∇","Nabla, gradient"],["\\Delta","Δ","Delta, variation"],
["\\infty","∞","Infini"],["\\binom{\\square}{\\square}","(ⁿₖ)","Coefficient binomial"],["\\square!","n!","Factorielle"],["\\%","%","Pourcentage"],
["\\cdots","⋯","Points de suspension centrés"],["\\ldots","…","Points de suspension"],["\\vdots","⋮","Points verticaux"],["\\ddots","⋱","Points diagonaux"]
]},
{id:"fn",icon:"f(x)",name:"Fonctions",keys:[
["f(\\square)","f(x)","Fonction f"],["g(\\square)","g(x)","Fonction g"],["f^{-1}(\\square)","f⁻¹","Fonction réciproque"],["f\\circ g","f∘g","Composée"],["\\mapsto","↦","Associe"],
["\\sin","sin","Sinus"],["\\cos","cos","Cosinus"],["\\tan","tan","Tangente"],["\\cot","cot","Cotangente"],["\\sec","sec","Sécante"],["\\csc","csc","Cosécante"],
["\\arcsin","arcsin","Arc sinus"],["\\arccos","arccos","Arc cosinus"],["\\arctan","arctan","Arc tangente"],
["\\sinh","sh","Sinus hyperbolique"],["\\cosh","ch","Cosinus hyperbolique"],["\\tanh","th","Tangente hyperbolique"],
["\\ln","ln","Logarithme népérien"],["\\log","log","Logarithme décimal"],["\\log_{\\square}(\\square)","logₐ","Logarithme de base a"],["\\exp","exp","Exponentielle"],["\\mathrm{e}^{\\square}","eˣ","e puissance x"],
["\\max","max","Maximum"],["\\min","min","Minimum"],["\\sup","sup","Borne supérieure"],["\\inf","inf","Borne inférieure"],
["\\det","det","Déterminant"],["\\dim","dim","Dimension"],["\\ker","ker","Noyau"],["\\gcd","pgcd","PGCD"],["\\operatorname{ppcm}","ppcm","PPCM"],["\\bmod","mod","Modulo"],["\\pmod{\\square}","(mod n)","Congruence"],
["\\arg","arg","Argument"],["\\Re","ℜ","Partie réelle"],["\\Im","ℑ","Partie imaginaire"],["\\operatorname{Card}","Card","Cardinal"],["\\operatorname{Id}","Id","Identité"],["\\operatorname{sgn}","sgn","Signe"]
]},
{id:"ops",icon:"±",name:"Opérations",keys:[
["+","+","Plus"],["-","−","Moins"],["\\pm","±","Plus ou moins"],["\\mp","∓","Moins ou plus"],["\\times","×","Multiplication"],["\\div","÷","Division"],["\\cdot","·","Point de multiplication"],["\\ast","∗","Astérisque"],["\\circ","∘","Rond"],["/","/","Barre oblique"],
["=","=","Égal"],["\\neq","≠","Différent"],["\\approx","≈","Environ égal"],["\\equiv","≡","Identique, congru"],["\\simeq","≃","Asymptotiquement égal"],["\\sim","∼","Équivalent à"],["\\cong","≅","Isométrique"],["\\propto","∝","Proportionnel à"],
["<","<","Inférieur"],[">",">","Supérieur"],["\\leq","≤","Inférieur ou égal"],["\\geq","≥","Supérieur ou égal"],["\\ll","≪","Très inférieur"],["\\gg","≫","Très supérieur"],["\\leqslant","⩽","Inférieur ou égal (penché)"],["\\geqslant","⩾","Supérieur ou égal (penché)"],
["\\mid","∣","Divise"],["\\nmid","∤","Ne divise pas"],["\\parallel","∥","Parallèle"],["\\perp","⊥","Perpendiculaire"],["\\oplus","⊕","Somme directe"],["\\otimes","⊗","Produit tensoriel"],["\\bullet","•","Puce"],
["\\therefore","∴","Donc"],["\\because","∵","Car"],["\\dagger","†","Dague"],["\\star","⋆","Étoile"]
]},
{id:"greek",icon:"αβ",name:"Grecs",keys:[
["#","Minuscules"],
["\\alpha","α","Alpha"],["\\beta","β","Bêta"],["\\gamma","γ","Gamma"],["\\delta","δ","Delta"],["\\epsilon","ϵ","Epsilon"],["\\varepsilon","ε","Epsilon (variante)"],["\\zeta","ζ","Zêta"],["\\eta","η","Êta"],["\\theta","θ","Thêta"],["\\vartheta","ϑ","Thêta (variante)"],["\\iota","ι","Iota"],["\\kappa","κ","Kappa"],["\\lambda","λ","Lambda"],["\\mu","μ","Mu"],["\\nu","ν","Nu"],["\\xi","ξ","Xi"],["\\pi","π","Pi"],["\\rho","ρ","Rhô"],["\\sigma","σ","Sigma"],["\\tau","τ","Tau"],["\\upsilon","υ","Upsilon"],["\\phi","ϕ","Phi"],["\\varphi","φ","Phi (variante)"],["\\chi","χ","Khi"],["\\psi","ψ","Psi"],["\\omega","ω","Oméga"],
["#","Majuscules"],
["\\Gamma","Γ","Gamma majuscule"],["\\Delta","Δ","Delta majuscule"],["\\Theta","Θ","Thêta majuscule"],["\\Lambda","Λ","Lambda majuscule"],["\\Xi","Ξ","Xi majuscule"],["\\Pi","Π","Pi majuscule"],["\\Sigma","Σ","Sigma majuscule"],["\\Upsilon","Υ","Upsilon majuscule"],["\\Phi","Φ","Phi majuscule"],["\\Psi","Ψ","Psi majuscule"],["\\Omega","Ω","Oméga majuscule"]
]},
{id:"abc",icon:"abc",name:"Lettres",keys:letters(false)},
{id:"ABC",icon:"ABC",name:"Majuscules",keys:letters(true)},
{id:"sets",icon:"ℝ",name:"Ensembles",keys:[
["\\mathbb{N}","ℕ","Entiers naturels"],["\\mathbb{Z}","ℤ","Entiers relatifs"],["\\mathbb{D}","𝔻","Nombres décimaux"],["\\mathbb{Q}","ℚ","Nombres rationnels"],["\\mathbb{R}","ℝ","Nombres réels"],["\\mathbb{C}","ℂ","Nombres complexes"],["\\mathbb{K}","𝕂","Corps K"],["\\mathbb{R}^{*}","ℝ*","Réels non nuls"],["\\mathbb{R}_{+}","ℝ₊","Réels positifs"],["\\mathbb{N}^{*}","ℕ*","Entiers non nuls"],
["\\in","∈","Appartient à"],["\\notin","∉","N'appartient pas à"],["\\ni","∋","Contient l'élément"],["\\subset","⊂","Inclus dans"],["\\subseteq","⊆","Inclus ou égal"],["\\not\\subset","⊄","Non inclus"],["\\supset","⊃","Contient (ensemble)"],["\\supseteq","⊇","Contient ou égal"],
["\\cup","∪","Union"],["\\cap","∩","Intersection"],["\\setminus","∖","Privé de"],["\\emptyset","∅","Ensemble vide"],["\\overline{\\square}","Ā","Complémentaire"],["\\mathcal{P}(\\square)","𝒫","Ensemble des parties"],["\\bigcup_{\\square}","⋃","Union indexée"],["\\bigcap_{\\square}","⋂","Intersection indexée"],
["\\left\\{\\square\\mid\\square\\right\\}","{x|…}","Ensemble défini par une propriété"],
["\\left[\\square\\,;\\square\\right]","[a;b]","Intervalle fermé"],["\\left]\\square\\,;\\square\\right[","]a;b[","Intervalle ouvert"],["\\left[\\square\\,;\\square\\right[","[a;b[","Intervalle semi-ouvert à droite"],["\\left]\\square\\,;\\square\\right]","]a;b]","Intervalle semi-ouvert à gauche"],["\\llbracket\\square\\,;\\square\\rrbracket","⟦a;b⟧","Entiers de a à b"],
["#","Logique"],
["\\forall","∀","Pour tout"],["\\exists","∃","Il existe"],["\\nexists","∄","Il n'existe pas"],["\\exists!","∃!","Il existe un unique"],["\\neg","¬","Non"],["\\land","∧","Et"],["\\lor","∨","Ou"],["\\Rightarrow","⇒","Implique"],["\\Leftarrow","⇐","Est impliqué par"],["\\Leftrightarrow","⇔","Équivaut à"],["\\implies","⟹","Implique (long)"],["\\iff","⟺","Si et seulement si"],["\\vdash","⊢","Démontre"],["\\models","⊨","Satisfait"],["\\top","⊤","Vrai"],["\\bot","⊥","Faux"],["\\blacksquare","■","Fin de démonstration"],["\\square","□","Case à remplir"]
]},
{id:"arrows",icon:"→",name:"Flèches",keys:[
["\\rightarrow","→","Flèche droite"],["\\leftarrow","←","Flèche gauche"],["\\leftrightarrow","↔","Double sens"],["\\uparrow","↑","Flèche haut"],["\\downarrow","↓","Flèche bas"],["\\updownarrow","↕","Haut et bas"],["\\nearrow","↗","Flèche montante"],["\\searrow","↘","Flèche descendante"],["\\nwarrow","↖","Nord-ouest"],["\\swarrow","↙","Sud-ouest"],
["\\Rightarrow","⇒","Implique"],["\\Leftarrow","⇐","Est impliqué par"],["\\Leftrightarrow","⇔","Équivaut"],["\\Uparrow","⇑","Double flèche haut"],["\\Downarrow","⇓","Double flèche bas"],
["\\longrightarrow","⟶","Longue flèche droite"],["\\longleftarrow","⟵","Longue flèche gauche"],["\\longleftrightarrow","⟷","Longue double flèche"],["\\Longrightarrow","⟹","Longue implication"],["\\Longleftarrow","⟸","Longue réciproque"],["\\Longleftrightarrow","⟺","Longue équivalence"],
["\\mapsto","↦","Associe"],["\\longmapsto","⟼","Associe (long)"],["\\hookrightarrow","↪","Injection"],["\\twoheadrightarrow","↠","Surjection"],["\\to","→","Tend vers"],["\\rightsquigarrow","⇝","Flèche ondulée"],
["\\rightleftharpoons","⇌","Équilibre"],["\\leftrightharpoons","⇋","Équilibre inversé"],["\\rightharpoonup","⇀","Harpon droit"],["\\leftharpoonup","↼","Harpon gauche"],
["\\xrightarrow{\\square}","–→","Flèche avec texte dessus"],["\\xleftarrow{\\square}","←–","Flèche gauche avec texte"],["\\xrightarrow[\\square]{\\square}","→□","Flèche avec texte dessus et dessous"],["\\overset{\\square}{\\longrightarrow}","⟶̂","Flèche surmontée"],["\\circlearrowright","↻","Rotation horaire"],["\\circlearrowleft","↺","Rotation antihoraire"],["\\curvearrowright","↷","Flèche courbe"]
]},
{id:"geo",icon:"△",name:"Géométrie",cap:1,keys:[
["#","Vecteurs"],
["\\overrightarrow{\\square}","AB⃗","Vecteur AB"],["\\vec{\\square}","u⃗","Vecteur u"],["\\vec{i}","i⃗","Vecteur i"],["\\vec{j}","j⃗","Vecteur j"],["\\vec{k}","k⃗","Vecteur k"],["\\overrightarrow{\\square}\\cdot\\overrightarrow{\\square}","u⃗·v⃗","Produit scalaire"],["\\overrightarrow{\\square}\\wedge\\overrightarrow{\\square}","u⃗∧v⃗","Produit vectoriel"],["\\left\\|\\overrightarrow{\\square}\\right\\|","‖u⃗‖","Norme d'un vecteur"],
["#","Figures"],
["\\overline{\\square}","AB̅","Longueur du segment"],["\\left[\\square\\right]","[AB]","Segment"],["\\left(\\square\\right)","(AB)","Droite"],["\\left[\\square\\right)","[AB)","Demi-droite"],["\\widehat{\\square}","ABC^","Angle"],["\\angle","∠","Angle (symbole)"],["\\measuredangle","∡","Angle mesuré"],["\\overset{\\frown}{\\square}","⌒","Arc de cercle"],
["\\triangle","△","Triangle"],["\\triangle ABC","△ABC","Triangle ABC"],["\\Box","□","Carré"],["\\bigcirc","○","Cercle"],["\\diamond","◇","Losange"],
["\\perp","⊥","Perpendiculaire"],["\\parallel","∥","Parallèle"],["\\nparallel","∦","Non parallèle"],["\\cong","≅","Congruent"],["\\sim","∼","Semblable"],
["#","Angles et trigonométrie"],
["^{\\circ}","°","Degré"],["{}'","′","Minute d'arc"],["{}''","″","Seconde d'arc"],["\\pi","π","Pi"],["\\text{rad}","rad","Radian"],["\\sin\\widehat{\\square}","sin Â","Sinus d'un angle"],["\\cos\\widehat{\\square}","cos Â","Cosinus d'un angle"],["\\tan\\widehat{\\square}","tan Â","Tangente d'un angle"],
["\\mathcal{C}","𝒞","Cercle (nom)"],["\\mathcal{D}","𝒟","Droite (nom)"],["\\mathcal{P}","𝒫","Plan (nom)"]
]},
{id:"mat",icon:"▦",name:"Matrices",cap:1,wide:1,keys:[
["\\begin{pmatrix}\\square&\\square\\\\\\square&\\square\\end{pmatrix}","(▦)","Matrice 2×2"],
["\\begin{bmatrix}\\square&\\square\\\\\\square&\\square\\end{bmatrix}","[▦]","Matrice 2×2 (crochets)"],
["\\begin{vmatrix}\\square&\\square\\\\\\square&\\square\\end{vmatrix}","|▦|","Déterminant 2×2"],
["\\begin{pmatrix}\\square&\\square&\\square\\\\\\square&\\square&\\square\\\\\\square&\\square&\\square\\end{pmatrix}","(▦)₃","Matrice 3×3"],
["\\begin{vmatrix}\\square&\\square&\\square\\\\\\square&\\square&\\square\\\\\\square&\\square&\\square\\end{vmatrix}","|▦|₃","Déterminant 3×3"],
["\\begin{pmatrix}\\square\\\\\\square\\end{pmatrix}","⦅□□⦆","Vecteur colonne (2)"],
["\\begin{pmatrix}\\square\\\\\\square\\\\\\square\\end{pmatrix}","⦅□□□⦆","Vecteur colonne (3)"],
["\\begin{pmatrix}\\square&\\square&\\square\\end{pmatrix}","(□□□)","Vecteur ligne"],
["\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}","I₂","Matrice identité 2×2"],
["\\begin{pmatrix}1&0&0\\\\0&1&0\\\\0&0&1\\end{pmatrix}","I₃","Matrice identité 3×3"],
["{}^{t}\\!\\square","ᵗA","Transposée"],["\\square^{-1}","A⁻¹","Inverse"],["\\operatorname{tr}","tr","Trace"],["\\operatorname{rg}","rg","Rang"],
["\\left\\{\\begin{aligned}\\square&=\\square\\\\\\square&=\\square\\end{aligned}\\right.","{=\n=","Système de 2 équations"],
["\\left\\{\\begin{aligned}\\square&=\\square\\\\\\square&=\\square\\\\\\square&=\\square\\end{aligned}\\right.","{=\n=\n=","Système de 3 équations"],
["\\begin{cases}\\square&\\text{si }\\square\\\\\\square&\\text{sinon}\\end{cases}","{si…","Fonction définie par morceaux"],
["\\begin{cases}\\square&\\text{si }\\square\\\\\\square&\\text{si }\\square\\\\\\square&\\text{sinon}\\end{cases}","{si…si…","Trois cas"],
["\\begin{aligned}\\square&=\\square\\\\&=\\square\\end{aligned}","=\n=","Calcul sur plusieurs lignes"],
["\\begin{array}{c|c}\\square&\\square\\\\\\hline\\square&\\square\\end{array}","┼","Tableau 2×2"],
["\\begin{array}{c|ccc}x&\\square&\\square&\\square\\\\\\hline f(x)&\\square&\\square&\\square\\end{array}","x|f(x)","Tableau de valeurs"],
["\\substack{\\square\\\\\\square}","⁝","Deux lignes sous un symbole"],["\\\\","↵","Retour à la ligne"],["&","&","Séparateur de colonne"],["\\hline","―","Trait horizontal"]
]},
{id:"stat",icon:"P",name:"Probabilités",cap:1,keys:[
["\\mathbb{P}(\\square)","P(A)","Probabilité"],["\\mathbb{P}(\\square\\mid\\square)","P(A|B)","Probabilité conditionnelle"],["\\mathbb{P}_{\\square}(\\square)","P_B(A)","Probabilité conditionnelle indicée"],["\\mathbb{E}(\\square)","E(X)","Espérance"],["\\operatorname{Var}(\\square)","V(X)","Variance"],["\\sigma(\\square)","σ(X)","Écart type"],["\\operatorname{Cov}(\\square,\\square)","Cov","Covariance"],
["\\overline{x}","x̄","Moyenne"],["\\overline{\\square}","Ā","Événement contraire"],["\\hat{p}","p̂","Fréquence observée"],["\\mu","μ","Moyenne théorique"],["\\sigma^{2}","σ²","Variance théorique"],
["\\binom{n}{k}","(ⁿₖ)","Combinaisons"],["\\mathrm{C}_{\\square}^{\\square}","Cₙᵏ","Combinaisons (notation française)"],["\\mathrm{A}_{\\square}^{\\square}","Aₙᵏ","Arrangements"],["n!","n!","Factorielle"],
["\\mathcal{B}(\\square,\\square)","ℬ(n,p)","Loi binomiale"],["\\mathcal{N}(\\square,\\square)","𝒩(μ,σ²)","Loi normale"],["\\mathcal{U}([\\square,\\square])","𝒰","Loi uniforme"],["\\mathcal{P}(\\square)","𝒫(λ)","Loi de Poisson"],["\\mathcal{E}(\\square)","ℰ(λ)","Loi exponentielle"],["\\sim","∼","Suit la loi"],
["\\sum_{i=1}^{n}\\square_{i}","Σᵢ","Somme indexée"],["\\frac{1}{n}\\sum_{i=1}^{n}\\square_{i}","x̄=…","Moyenne arithmétique"],["\\chi^{2}","χ²","Khi-deux"],["\\Omega","Ω","Univers"],["\\cap","∩","Intersection d'événements"],["\\cup","∪","Union d'événements"],["\\emptyset","∅","Événement impossible"]
]},
{id:"phys",icon:"⚛",name:"Physique",cap:1,keys:[
["#","Grandeurs et vecteurs"],
["\\vec{F}","F⃗","Force"],["\\vec{v}","v⃗","Vitesse"],["\\vec{a}","a⃗","Accélération"],["\\vec{E}","E⃗","Champ électrique"],["\\vec{B}","B⃗","Champ magnétique"],["\\vec{g}","g⃗","Pesanteur"],["\\sum\\vec{F}=m\\vec{a}","ΣF=ma","Deuxième loi de Newton"],
["\\Delta","Δ","Variation"],["\\dot{\\square}","ẋ","Dérivée par rapport au temps"],["\\ddot{\\square}","ẍ","Dérivée seconde"],["\\frac{\\mathrm{d}\\square}{\\mathrm{d}t}","d/dt","Dérivée temporelle"],["\\hbar","ℏ","Constante de Planck réduite"],["\\varepsilon_{0}","ε₀","Permittivité du vide"],["\\mu_{0}","μ₀","Perméabilité du vide"],["\\lambda","λ","Longueur d'onde"],["\\nu","ν","Fréquence"],["\\omega","ω","Pulsation"],["\\rho","ρ","Masse volumique"],["\\tau","τ","Constante de temps"],
["#","Unités"],
["\\mathrm{m}","m","Mètre"],["\\mathrm{kg}","kg","Kilogramme"],["\\mathrm{g}","g","Gramme"],["\\mathrm{s}","s","Seconde"],["\\mathrm{A}","A","Ampère"],["\\mathrm{K}","K","Kelvin"],["\\mathrm{mol}","mol","Mole"],["\\mathrm{cd}","cd","Candela"],
["\\mathrm{N}","N","Newton"],["\\mathrm{J}","J","Joule"],["\\mathrm{W}","W","Watt"],["\\mathrm{Pa}","Pa","Pascal"],["\\mathrm{Hz}","Hz","Hertz"],["\\mathrm{V}","V","Volt"],["\\mathrm{C}","C","Coulomb"],["\\mathrm{F}","F","Farad"],["\\mathrm{H}","H","Henry"],["\\mathrm{T}","T","Tesla"],["\\mathrm{Wb}","Wb","Weber"],["\\Omega","Ω","Ohm"],["\\mathrm{eV}","eV","Électronvolt"],["\\mathrm{L}","L","Litre"],["^{\\circ}\\mathrm{C}","°C","Degré Celsius"],
["\\mathrm{m\\cdot s^{-1}}","m·s⁻¹","Mètre par seconde"],["\\mathrm{m\\cdot s^{-2}}","m·s⁻²","Mètre par seconde carrée"],["\\mathrm{km\\cdot h^{-1}}","km·h⁻¹","Kilomètre par heure"],["\\mathrm{kg\\cdot m^{-3}}","kg·m⁻³","Kilogramme par mètre cube"],["\\mathrm{N\\cdot m}","N·m","Newton-mètre"],["\\mathrm{mol\\cdot L^{-1}}","mol·L⁻¹","Mole par litre"],
["#","Préfixes"],
["\\mu","µ","Préfixe micro"],["\\mathrm{m}","m","Préfixe milli"],["\\mathrm{c}","c","Préfixe centi"],["\\mathrm{k}","k","Préfixe kilo"],["\\mathrm{M}","M","Préfixe méga"],["\\mathrm{G}","G","Préfixe giga"],["\\mathrm{n}","n","Préfixe nano"],["\\mathrm{p}","p","Préfixe pico"]
]},
{id:"chem",icon:"H₂",name:"Chimie",cap:1,keys:[
["#","Molécules"],
["\\mathrm{H_2O}","H₂O","Eau"],["\\mathrm{CO_2}","CO₂","Dioxyde de carbone"],["\\mathrm{O_2}","O₂","Dioxygène"],["\\mathrm{H_2}","H₂","Dihydrogène"],["\\mathrm{N_2}","N₂","Diazote"],["\\mathrm{NH_3}","NH₃","Ammoniac"],["\\mathrm{CH_4}","CH₄","Méthane"],["\\mathrm{NaCl}","NaCl","Chlorure de sodium"],["\\mathrm{HCl}","HCl","Chlorure d'hydrogène"],["\\mathrm{NaOH}","NaOH","Hydroxyde de sodium"],["\\mathrm{H_2SO_4}","H₂SO₄","Acide sulfurique"],["\\mathrm{HNO_3}","HNO₃","Acide nitrique"],["\\mathrm{CaCO_3}","CaCO₃","Carbonate de calcium"],["\\mathrm{C_6H_{12}O_6}","C₆H₁₂O₆","Glucose"],["\\mathrm{CH_3COOH}","CH₃COOH","Acide éthanoïque"],["\\mathrm{C_2H_5OH}","C₂H₅OH","Éthanol"],
["#","Ions et électrons"],
["\\mathrm{H^{+}}","H⁺","Ion hydrogène"],["\\mathrm{H_3O^{+}}","H₃O⁺","Ion oxonium"],["\\mathrm{HO^{-}}","HO⁻","Ion hydroxyde"],["\\mathrm{Na^{+}}","Na⁺","Ion sodium"],["\\mathrm{Cl^{-}}","Cl⁻","Ion chlorure"],["\\mathrm{Ca^{2+}}","Ca²⁺","Ion calcium"],["\\mathrm{Fe^{2+}}","Fe²⁺","Ion fer II"],["\\mathrm{Fe^{3+}}","Fe³⁺","Ion fer III"],["\\mathrm{Cu^{2+}}","Cu²⁺","Ion cuivre II"],["\\mathrm{Ag^{+}}","Ag⁺","Ion argent"],["\\mathrm{SO_4^{2-}}","SO₄²⁻","Ion sulfate"],["\\mathrm{NO_3^{-}}","NO₃⁻","Ion nitrate"],["\\mathrm{CO_3^{2-}}","CO₃²⁻","Ion carbonate"],["\\mathrm{MnO_4^{-}}","MnO₄⁻","Ion permanganate"],["\\mathrm{e^{-}}","e⁻","Électron"],
["#","Réactions"],
["\\longrightarrow","⟶","Réaction totale"],["\\rightleftharpoons","⇌","Équilibre chimique"],["\\xrightarrow{\\square}","–→","Réaction avec conditions"],["\\uparrow","↑","Dégagement gazeux"],["\\downarrow","↓","Précipité"],["\\Delta","Δ","Chauffage"],["+","+","Plus"],["\\text{ (aq)}","(aq)","En solution aqueuse"],["\\text{ (s)}","(s)","Solide"],["\\text{ (l)}","(l)","Liquide"],["\\text{ (g)}","(g)","Gaz"],
["#","Notations"],
["\\mathrm{\\square_{\\square}}","Xₙ","Élément avec indice"],["\\mathrm{\\square^{\\square}}","Xⁿ⁺","Élément avec charge"],["{}^{\\square}_{\\square}\\mathrm{\\square}","ᴬ_ZX","Notation d'un noyau"],["\\left[\\mathrm{\\square}\\right]","[X]","Concentration molaire"],["\\mathrm{pH}","pH","pH"],["\\mathrm{p}K_{\\mathrm{a}}","pKa","pKa"],["K_{\\mathrm{e}}","Ke","Produit ionique de l'eau"],["\\mathrm{mol\\cdot L^{-1}}","mol·L⁻¹","Concentration"],["\\Delta_{\\mathrm{r}}H","ΔrH","Enthalpie de réaction"],["\\Delta G","ΔG","Enthalpie libre"],["\\alpha","α","Rayonnement alpha"],["\\beta^{-}","β⁻","Radioactivité bêta moins"],["\\beta^{+}","β⁺","Radioactivité bêta plus"],["\\gamma","γ","Rayonnement gamma"]
]},
{id:"elem",icon:"Fe",name:"Éléments",keys:null},
{id:"deco",icon:"x̂",name:"Accents",cap:1,keys:[
["\\vec{\\square}","v⃗","Vecteur"],["\\overrightarrow{\\square}","AB⃗","Vecteur long"],["\\hat{\\square}","x̂","Chapeau"],["\\widehat{\\square}","ÂB̂","Chapeau large"],["\\bar{\\square}","x̄","Barre"],["\\overline{\\square}","x̅","Barre longue"],["\\underline{\\square}","x̲","Souligné"],["\\tilde{\\square}","x̃","Tilde"],["\\widetilde{\\square}","x̃","Tilde large"],["\\dot{\\square}","ẋ","Un point"],["\\ddot{\\square}","ẍ","Deux points"],["\\check{\\square}","x̌","Caron"],["\\acute{\\square}","x́","Accent aigu"],["\\grave{\\square}","x̀","Accent grave"],["\\mathring{\\square}","x̊","Rond"],["\\cancel{\\square}","x̸","Barré"],["\\boxed{\\square}","▭","Encadré"],["\\underbrace{\\square}_{\\square}","⏟","Accolade dessous"],["\\overbrace{\\square}^{\\square}","⏞","Accolade dessus"],["\\overset{\\square}{\\square}","ᵃ□","Texte au-dessus"],["\\underset{\\square}{\\square}","□ₐ","Texte en dessous"],["\\stackrel{\\square}{=}","=ᵃ","Égal surmonté"],
["#","Styles de caractères"],
["\\mathbf{\\square}","𝐀","Gras"],["\\boldsymbol{\\square}","𝝰","Gras (symboles)"],["\\mathit{\\square}","𝐴","Italique"],["\\mathrm{\\square}","A","Droit"],["\\mathcal{\\square}","𝒜","Calligraphique"],["\\mathbb{\\square}","𝔸","Double barre"],["\\mathfrak{\\square}","𝔄","Gothique"],["\\mathsf{\\square}","A","Sans empattement"],["\\mathtt{\\square}","𝙰","Machine à écrire"],["\\text{texte}","Tx","Texte dans une formule","texte"],["\\textbf{texte}","Tx","Texte en gras","texte"],
["#","Espaces"],
["\\,","⎵","Espace fine"],["\\;","⎵⎵","Espace moyenne"],["\\quad","⟷","Espace large"],["\\qquad","⟺","Espace très large"],["\\!","⇤","Espace négatif"],["\\\\","↵","Retour à la ligne"]
]}
];
function byId(id){for(var i=0;i<CATS.length;i++)if(CATS[i].id===id)return CATS[i];return null}
function loadRec(){try{var a=JSON.parse(store(REC)||"[]");return Array.isArray(a)?a.filter(function(x){return Array.isArray(x)&&typeof x[0]==="string"&&typeof x[1]==="string"}).slice(0,24):[]}catch(e){return[]}}
function remember(it){var a=loadRec().filter(function(x){return x[0]!==it[0]});a.unshift([it[0],it[1],it[2]||"",it[3]||""]);store(REC,JSON.stringify(a.slice(0,24)))}
function tick(){try{if(navigator.vibrate)navigator.vibrate(5)}catch(e){}}

function create(opts){
opts=opts||{};
var field=null,undo=[],lastOp="",lastT=0,hold=null,pv=null,cur=[],rendered=false;
var catId=store(CATK)||"calc";if(!byId(catId))catId="calc";
var el=document.createElement("section");el.className="asd";el.id="auroreScienceDock";el.hidden=true;el.setAttribute("aria-label","Clavier scientifique");
el.innerHTML='<div class="asd-grip" aria-hidden="true"></div><div class="asd-top"><div class="asd-preview" aria-live="polite"><span class="asd-preview-empty">Aperçu de la formule</span><div class="asd-preview-math"></div><span class="asd-badge" hidden>□ cases à remplir</span></div><button type="button" class="asd-chip" data-a="native" aria-label="Utiliser le clavier normal" title="Clavier normal">ABC</button><button type="button" class="asd-chip" data-a="close" aria-label="Masquer le clavier scientifique" title="Masquer">⌄</button></div><div class="asd-tabs" role="tablist" aria-label="Catégories de symboles"></div><div class="asd-body"><div class="asd-keys" role="group" aria-label="Symboles"></div></div><div class="asd-foot"><button type="button" data-a="undo" aria-label="Annuler" title="Annuler">↶</button><button type="button" data-a="left" aria-label="Curseur à gauche" title="Curseur à gauche">◀</button><button type="button" data-a="right" aria-label="Curseur à droite" title="Curseur à droite">▶</button><button type="button" data-a="next" aria-label="Case suivante" title="Case suivante">□→</button><button type="button" data-a="space" aria-label="Espace" title="Espace">␣</button><button type="button" data-a="del" aria-label="Effacer" title="Effacer (maintenir pour répéter)">⌫</button><button type="button" class="asd-done" data-a="done" aria-label="Terminer" title="Terminer">✓</button></div>';
document.body.appendChild(el);
var tabsEl=el.querySelector(".asd-tabs"),keysEl=el.querySelector(".asd-keys"),bodyEl=el.querySelector(".asd-body"),pvBox=el.querySelector(".asd-preview-math"),pvEmpty=el.querySelector(".asd-preview-empty"),badge=el.querySelector(".asd-badge");
CATS.forEach(function(c){var b=document.createElement("button");b.type="button";b.className="asd-tab";b.setAttribute("role","tab");b.setAttribute("data-c",c.id);b.setAttribute("aria-label",c.name);b.title=c.name;var i=document.createElement("span");i.className="asd-tab-i";i.textContent=c.icon;var n=document.createElement("span");n.className="asd-tab-n";n.textContent=c.name;b.appendChild(i);b.appendChild(n);tabsEl.appendChild(b)});

function keyBtn(it,cat){var b=document.createElement("button");b.type="button";b.className="asd-key";b.setAttribute("data-i",String(cur.push(it)-1));b.title=it[2]||it[1];b.setAttribute("aria-label",it[2]||it[1]);var g=document.createElement("span");g.className="asd-glyph";g.textContent=it[1];b.appendChild(g);if(cat&&cat.cap&&it[2]){var c=document.createElement("span");c.className="asd-cap";c.textContent=it[2];b.appendChild(c)}return b}
function renderElements(){var grid=div("asd-pt");ELS.forEach(function(e){var it=["\\mathrm{"+e.s+"}",e.s,e.n+" (Z = "+e.z+")"];var b=document.createElement("button");b.type="button";b.className="asd-el el-"+e.f;b.style.gridColumn=String(e.c);b.style.gridRow=String(e.r);b.setAttribute("data-i",String(cur.push(it)-1));b.title=it[2];b.setAttribute("aria-label",it[2]);var n=document.createElement("i");n.textContent=String(e.z);var s=document.createElement("b");s.textContent=e.s;b.appendChild(n);b.appendChild(s);grid.appendChild(b)});keysEl.appendChild(grid)}
function renderKeys(){var cat=byId(catId)||CATS[2];keysEl.className="asd-keys"+(cat.num?" is-num":"")+(cat.cap?" has-cap":"")+(cat.wide?" is-wide":"")+(cat.id==="elem"?" is-elements":"");keysEl.innerHTML="";cur=[];rendered=true;
if(cat.id==="elem"){renderElements();return}
var list=cat.id==="recent"?loadRec():cat.keys;
if(!list||!list.length){var p=document.createElement("p");p.className="asd-empty";p.textContent="Les symboles que tu utilises apparaîtront ici pour les retrouver plus vite.";keysEl.appendChild(p);return}
list.forEach(function(it){if(it[0]==="#"){keysEl.appendChild(div("asd-sep",it[1]));return}keysEl.appendChild(keyBtn(it,cat))})}
function markTabs(){Array.prototype.forEach.call(tabsEl.querySelectorAll(".asd-tab"),function(b){var on=b.getAttribute("data-c")===catId;b.classList.toggle("is-active",on);b.setAttribute("aria-selected",on?"true":"false");if(on){try{var l=b.offsetLeft-(tabsEl.clientWidth-b.offsetWidth)/2;tabsEl.scrollLeft=Math.max(0,l)}catch(e){}}})}
function setCat(id){if(!byId(id))return;catId=id;store(CATK,id);markTabs();renderKeys();bodyEl.scrollTop=0;bodyEl.scrollLeft=0}

function snap(op){var now=Date.now();if(op&&op===lastOp&&now-lastT<700){lastT=now;return}lastOp=op||"";lastT=now;undo.push({v:field.value,s:field.selectionStart,e:field.selectionEnd});if(undo.length>80)undo.shift()}
function commit(){field.dispatchEvent(new Event("input",{bubbles:true}))}
function setSel(a,b){try{field.setSelectionRange(a,b)}catch(e){}if(document.activeElement!==field){try{field.focus({preventScroll:true})}catch(e){}}}
function insert(tpl,sel){if(!field)return;snap("");var v=field.value,st=field.selectionStart||0,en=field.selectionEnd||st,cut=v.slice(st,en),wasPh=cut===SQ,wrap=!!cut&&!wasPh,text=tpl;
if(wrap&&text.indexOf(SQ)>=0)text=text.replace(SQ,function(){return cut});
field.setRangeText(text,st,en,"end");
var a,b,i=text.indexOf(SQ);
if(i>=0){a=st+i;b=a+SQ.length}
else if(sel&&text.indexOf(sel)>=0){a=st+text.indexOf(sel);b=a+sel.length}
else{a=b=st+text.length;if(wasPh){var n=field.value.indexOf(SQ,a);if(n<0)n=field.value.indexOf(SQ);if(n>=0){a=n;b=n+SQ.length}}}
setSel(a,b);commit();tick()}
function del(){if(!field)return;var v=field.value,st=field.selectionStart||0,en=field.selectionEnd||st;if(st===en){if(st===0)return;var before=v.slice(0,st),m=before.match(/\\[A-Za-z]+$/),n=m?m[0].length:1;if(!m&&before.slice(-1)==="{"&&v.charAt(st)==="}"){en=st+1;n=1}st=st-n}snap("del");field.setRangeText("",st,en,"end");setSel(st,st);commit();tick()}
function move(d){if(!field)return;var v=field.value,p=d<0?(field.selectionStart||0):(field.selectionEnd||0);if(d<0){if(p<=0)return;var m=v.slice(0,p).match(/\\[A-Za-z]+$/);p-=m?m[0].length:1}else{if(p>=v.length)return;var m2=v.slice(p).match(/^\\[A-Za-z]+/);p+=m2?m2[0].length:1}setSel(p,p);tick()}
function nextPh(){if(!field)return;var from=field.selectionEnd||0,i=field.value.indexOf(SQ,from);if(i<0)i=field.value.indexOf(SQ);if(i<0)return;setSel(i,i+SQ.length);tick()}
function undoOp(){if(!field||!undo.length)return;var u=undo.pop();field.value=u.v;lastOp="";setSel(u.s,u.e);commit();tick()}

function updatePreview(){pv=null;if(!field){return}var raw=field.value,v=raw.trim();badge.hidden=raw.indexOf(SQ)<0;if(!v){pvBox.textContent="";pvEmpty.hidden=false;return}pvEmpty.hidden=true;pvBox.textContent=opts.toSource?opts.toSource(raw):"\\["+v+"\\]";if(typeof window.renderAuroreMath==="function"){try{window.renderAuroreMath(pvBox)}catch(e){}}}
function schedulePreview(){if(pv)clearTimeout(pv);pv=setTimeout(updatePreview,60)}
function bind(){if(field)field.addEventListener("input",schedulePreview)}
function unbind(){if(field)field.removeEventListener("input",schedulePreview)}
function measure(){if(!el.hidden)document.documentElement.style.setProperty("--asd-h",el.offsetHeight+"px")}
if(window.ResizeObserver){try{new ResizeObserver(measure).observe(el)}catch(e){}}

function clearHold(){if(hold){clearTimeout(hold.t);clearInterval(hold.i);hold=null}}
function startHold(fn){clearHold();fn();hold={t:setTimeout(function(){if(hold)hold.i=setInterval(fn,70)},380)}}
if(window.__asdClear){["pointerup","pointercancel"].forEach(function(t){document.removeEventListener(t,window.__asdClear,true)})}
window.__asdClear=clearHold;["pointerup","pointercancel"].forEach(function(t){document.addEventListener(t,clearHold,true)});

function show(f){if(!f)return;var changed=field!==f||el.hidden;if(field&&field!==f){unbind();undo=[]}field=f;bind();el.hidden=false;document.body.classList.add("science-keyboard-open");if(!rendered){markTabs();renderKeys()}updatePreview();measure();if(changed){var ff=f;setTimeout(function(){try{ff.scrollIntoView({block:"center",behavior:"smooth"})}catch(e){}},90)}}
function hide(){clearHold();unbind();el.hidden=true;field=null;document.body.classList.remove("science-keyboard-open")}
function finish(){var f=field;hide();if(opts.onClose)opts.onClose(f)}

el.addEventListener("pointerdown",function(e){var b=e.target.closest("button");if(!b)return;e.preventDefault();var a=b.getAttribute("data-a");if(a==="del")startHold(del);else if(a==="left")startHold(function(){move(-1)});else if(a==="right")startHold(function(){move(1)})});
el.addEventListener("contextmenu",function(e){e.preventDefault()});
el.addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;var a=b.getAttribute("data-a");
if(b.hasAttribute("data-c")){setCat(b.getAttribute("data-c"));return}
if(b.hasAttribute("data-i")){var it=cur[Number(b.getAttribute("data-i"))];if(it){insert(it[0],it[3]);remember(it)}return}
if(a==="del"||a==="left"||a==="right"){if(e.detail===0){if(a==="del")del();else move(a==="left"?-1:1)}return}
if(a==="undo")undoOp();else if(a==="next")nextPh();else if(a==="space")insert(" ");
else if(a==="native"){var f=field;hide();if(opts.onNative)opts.onNative(f)}
else if(a==="close"||a==="done")finish()});

markTabs();
return{show:show,hide:hide,contains:function(n){return el.contains(n)},refresh:updatePreview,el:el};
}
window.AuroreScienceKeyboard={create:create};
})();
