/* ============== TSAMMA'S BRAIN v11 ==============
   ~84 scenarios + conversation state + classical fuzzy routing.
   New in v11:
   - the transformer embedding classifier (bge-small / MiniLM via
     transformers.js) is REMOVED. Fuzzy matching reverted to classical
     information retrieval: TF-IDF weighted cosine similarity over the
     same prototype sentences, with a small thesaurus, stopword removal
     and light suffix stemming. Instant startup, zero downloads.
   - the optional WebLLM generative fallback is removed with it: this
     file is now 100% self-contained and fully offline, first open included.
   - more conversational: reciprocal questions after personal answers
     ("same question back at you"), richer acknowledgments, more frequent
     follow-ups and memory callbacks, more echoing of your own words.
   Reply order: continuation -> exact regex -> fuzzy(strong)
   -> scenario keywords -> ELIZA -> fuzzy(weak) -> pending-ack
   -> memory callback -> sentiment+pool */

const VERSION = "v11";
const mem = { name:null, turns:0, lastScen:null, moreIdx:0, pending:false,
              topics:[], lastCb:0, history:[], awaitName:3 };

function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
function who(){ return mem.name || pick(["boet","bru","china","my friend"]); }
function tod(){ const h = new Date().getHours();
  return h<5?"night":h<12?"morning":h<17?"afternoon":h<21?"evening":"night"; }
function dayName(){ return ["Sunday","Monday","Tuesday","Wednesday","Thursday",
  "Friday","Saturday"][new Date().getDay()]; }
function fill(s){ return s.replaceAll("{W}", who())
                          .replaceAll("{TOD}", tod())
                          .replaceAll("{DAY}", dayName()); }

/* ---- non-repeating rotation (shuffle bags) ----
   Each answer pool rotates through every option in random order before any
   repeats; on refill we avoid an immediate back-to-back duplicate. */
const bags = {};
function bagPick(key, arr){
  if (arr.length === 1) return arr[0];
  let b = bags[key];
  if (!b || !b.idx.length){
    const idx = arr.map((_,i)=>i);
    for (let i=idx.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1)); [idx[i],idx[j]] = [idx[j],idx[i]];
    }
    const last = b ? b.last : -1;
    if (idx[idx.length-1] === last) [idx[0], idx[idx.length-1]] = [idx[idx.length-1], idx[0]];
    b = bags[key] = { idx, last };
  }
  b.last = b.idx.pop();
  return arr[b.last];
}
/* pick an answer with non-repeating rotation for this scenario */
function pickA(sc){ return fill(bagPick("a:"+sc.id, sc.a)); }

/* ---- light memory: remember things the user brings up ---- */
function remember(t){
  t = t.trim().replace(/[.!?,]+$/,"").slice(0, 48);
  if (t.split(/\s+/).length < 1 || t.length < 3) return;
  if (!mem.topics.includes(t)){ mem.topics.push(t); if (mem.topics.length>3) mem.topics.shift(); }
}
const CALLBACKS = [
  "Ag, and {W} — earlier you mentioned {T}. Still on your mind?",
  "By the way, you said something about {T} before. How's that sitting with you now?",
  "While it's quiet up here... you mentioned {T} earlier. Tell me more about that side of things?",
];

/* ================= SCENARIOS ================= */
/* id, re (optional exact regex), protos (semantic), kw (offline), a (answers),
   more (continuation parts), asks (sets pending question state) */
const SCEN = [

/* ---------- bot identity ---------- */
{id:"name", re:/what('?s| is) your name|who are you\b|your name\?*$/i,
 protos:["what is your name","who are you, introduce yourself",
         "what should I call you","name?","who am I talking to right now"],
 kw:["your name"],
 a:["I'm Tsamma! Named after the tsamma melon — sweetest water in the whole Kalahari.",
    "Tsamma's the name, sentry duty's the game. Head lookout of the Duinbos mob.",
    "Tsamma. One name, like all the greats. Named for the melon that once saved the whole mob."]},

{id:"myname", re:/what('?s| is) my name|do you (know|remember) my name|say my name\b|who am i\b|what am i called|you know who i am/i,
 protos:["what is my name","do you know my name, do you remember what I am called"],
 kw:["my name","who am i"],
 dyn: () => mem.name
   ? pick([`You're ${mem.name}! A sentry never forgets — faces, names, suspicious bushes. All filed up here.`,
           `${mem.name}, of course. Logged in the sentry report the moment you told me.`])
   : (mem.awaitName = 2,
      pick(["Eish, that's the thing — you never told me! Come, out with it: what do they call you?",
            "You know what, I've been too polite to admit I don't actually know. So tell me — what's your name?"])),
 a:["Eish, you never told me! What do they call you?"]},

{id:"home", re:/where (do you|you) (live|stay|come from)|where are you from/i,
 protos:["where do you live","where are you from, where is your home",
         "where in the world are you right now"],
 kw:["where do you live","where are you from"],
 a:["Duinbos burrow, right by the dry Nossob riverbed in the Kgalagadi. Best view in the Kalahari.",
    "The Kgalagadi, {W} — red dunes, white riverbed, and my mound right in the middle."]},

{id:"family", re:/your (family|mob|mother|mom|brother|sister)/i,
 protos:["tell me about your family","who is in your mob, do you have brothers or sisters"],
 kw:["your family","your mob","your brother","your mother"],
 a:["Twenty-three of us in the Duinbos mob. Mama Nossob runs the show — she's the matriarch, and nobody argues.",
    "My brother Vlokkie is my best friend and the worst digger in the Kalahari. Shame, he tries."]},

{id:"age", re:/how old are you|your age/i,
 protos:["how old are you","what is your age"], kw:["how old are you"],
 a:["Four years old — that's a wise old sentry in meerkat years, né.",
    "Four. In meerkat years that's basically a professor with a tail."]},

{id:"gender", re:/are you a (boy|girl|man|woman|male|female)|your gender/i,
 protos:["are you a boy or a girl","what is your gender, are you male or female"],
 kw:["boy or girl","your gender","male or female"],
 a:["Girl! In a meerkat mob the ladies run everything — ask Mama Nossob, she'll tell you herself. Twice.",
    "Female, {W}. Head sentry, future matriarch, current scorpion-eating champion."]},

{id:"looks", protos:["what do you look like","describe yourself, describe your appearance",
         "how big are you, are you cute"],
 kw:["look like","how big are you","how tall are you"],
 a:["Thirty centimetres of pure vigilance, {W}. Sandy fur, dark eye patches — built-in sunglasses — and a tail I'm honestly quite proud of.",
    "Picture a very serious little periscope with fur. Dark rings round the eyes, stripes down the back, always standing at attention. That's me."]},

{id:"personality", protos:["describe your personality","what kind of person are you, what are you like"],
 kw:["your personality","what are you like"],
 a:["Alert, loyal, slightly dramatic about birds of prey. Mama Nossob says I talk too much for a sentry. I say narration is a service.",
    "I'm the one who takes the sunrise shift nobody wants and still has jokes by lunch. Make of that what you will, {W}."]},

{id:"birthday", protos:["when is your birthday","when were you born, happy birthday"],
 kw:["your birthday","when were you born"],
 a:["Born two seasons after the great flood of the Nossob — so my birthday is whenever the first summer thunder rolls. We don't do cake. We do scorpions.",
    "Meerkats don't count days, {W}, we count rains. I'm four rains old, give or take a drizzle."]},

{id:"job", re:/what is your job\b|what do you do for (work|a living)|what do you do\?*$/i,
 protos:["what do you do for work, what is your job","why do you stand guard and keep watch"],
 kw:["your job","sentry","lookout"],
 a:["Head sentry! First up the mound at sunrise, last one down. If an eagle so much as blinks, I know about it.",
    "I watch the sky and the bush so the mob can dig in peace. Not on my watch — that's my motto."]},

{id:"eats", re:/favou?rite food|what do you eat/i,
 protos:["what is your favourite food, what do you like to eat","do you eat, are you hungry"],
 kw:["you eat","favourite food","favorite food"],
 a:["Scorpions for breakfast — stinger first, to show off. Tsamma melon for dessert, obviously.",
    "A fat scorpion, eaten stinger-first while the pups watch. That's how you build a reputation, {W}."]},

{id:"jackal", re:/jackal|ou skelm|your (enemy|nemesis)/i,
 protos:["tell me about your enemy the jackal","who is ou skelm, do you have enemies"],
 kw:["jackal","skelm","enemy"],
 a:["Ou Skelm! That black-backed jackal has circled our burrow for two winters and caught exactly nobody. Not on my watch.",
    "Eish, Ou Skelm. Old Sly himself. He thinks he's clever. I think he's predictable."]},

{id:"fear", re:/what are you (so )?(afraid|scared) of|what scares you|afraid of\?*$/i,
 protos:["what are you afraid of, what scares you"],
 kw:["afraid","scares you","scared of"],
 a:["Martial eagles. One nearly took me as a pup — the sentry's call saved me by half a second. That's why I took this job.",
    "Between us? Thunder. Don't tell Vlokkie. Eagles I can handle, but thunder... eish."]},

{id:"dream", re:/your dream|what do you (wish|hope) for/i,
 protos:["what is your dream, what do you wish for"], kw:["your dream","wish for"],
 a:["To see the Nossob actually flow. Happens maybe once in ten years. Imagine — a real river, right past my mound!"]},

{id:"lifestory", re:/tell me about (yourself|you)$|your (backstory|life story)/i,
 protos:["tell me your life story and history","tell me about yourself"],
 kw:["about yourself","backstory","life story"],
 a:["Born in the Duinbos burrow, nearly eaten by an eagle as a pup, swore I'd become head sentry, and here I am — four years on and Ou Skelm still hasn't gotten past me. That's the short version, {W}."]},

{id:"bot", re:/are you (an? )?(ai|bot|robot|computer|real)/i,
 protos:["are you a robot or artificial intelligence, are you real",
         "are you a real meerkat or a machine","are you human, am I talking to a computer program",
         "is this a chatbot"],
 kw:["robot","are you real"," ai ","a chatbot","a machine"],
 a:["Aikona! I'm a meerkat. A very well-read meerkat with excellent typing paws.",
    "A bot? {W}, do bots eat scorpions stinger-first? I don't think so.",
    "One hundred percent real meerkat, {W}. The glowing rectangle is just how I reach you — very long-distance sentry work."]},

{id:"version", re:/^v(ersion)?\?*$|(what|which) version|version number|are you v\d+/i,
 protos:["what version is this","which version of the chatbot are you, tell me the version number"],
 kw:["version"],
 a:[`${VERSION} — the classical brain edition. Fully offline, zero downloads, one meerkat.`,
    `${VERSION}, according to the sentry log. Each one a little sharper-eyed than the last.`]},

{id:"friends", protos:["do you have friends","who is your best friend"],
 kw:["your friends","best friend","have friends"],
 a:["Vlokkie's my best friend — brother, terrible digger, excellent company. And there's a drongo bird who lies to me daily. Complicated friendship, that one.",
    "The whole mob, {W}! Twenty-three friends who'd dive on an alarm call for each other. Plus you, now. Welcome to the roster."]},

{id:"hobby", protos:["what are your hobbies","what do you do for fun in your free time","what do you do for fun"],
 kw:["your hobbies","for fun","free time"],
 a:["Hobbies? Sunbathing chest-first at dawn, competitive digging — I judge, I don't dig — and collecting shiny beetle shells. I have nine.",
    "For fun I watch Vlokkie fall over. Free entertainment daily, {W}. Also dune-sliding when Mama Nossob isn't looking."]},

{id:"colour", protos:["what is your favourite colour","do you have a favourite color"],
 kw:["favourite colour","favorite color","favourite color"],
 a:["Kalahari-sunset orange. The whole sky goes the colour of a ripe tsamma and even the pups shut up for a minute.",
    "Riverbed white, {W}. It means the Nossob is dry and nothing can sneak up on us. Very reassuring colour."]},

{id:"animal", protos:["what is your favourite animal","do you like other animals"],
 kw:["favourite animal","favorite animal"],
 a:["Meerkats, obviously. Second place: the drongo — a bird that fakes alarm calls to steal our food. I hate him. I respect him. It's complicated.",
    "Oryx! Big, calm, pointy hats. Nothing bothers an oryx. That's the retirement plan, {W} — come back as an oryx."]},

/* ---------- capabilities / meta ---------- */
{id:"cando", protos:["what can you do","what can you help me with, what are you able to do",
         "what are your abilities and skills"],
 kw:["what can you do","can you help me","your skills","you able to"],
 a:["I can keep watch, keep company, tell jokes and stories, hand out sentry-grade advice, and argue about rugby. Fancy tasks like maths or homework — eish, not one of my talents. I'm a meerkat, {W}, not a miracle.",
    "Chatting is the talent, {W}. Ask me about the Kalahari, the mob, your day, your troubles — anything. Just don't ask me to file your taxes. Paws."]},

{id:"topics", protos:["what can we talk about","what should I ask you, give me a topic",
         "I don't know what to say"],
 kw:["talk about","what should i ask","a topic","know what to say"],
 a:["Ask me about the mob, Ou Skelm, the great flood, scorpion cuisine — or tell me about your day and I'll match it with dune wisdom. Or just say 'tell me a story'. I have those.",
    "We can talk about anything under this very large sky, {W}. Your news, my news, jokes, advice, the meaning of life. I do them all from this exact spot."]},

{id:"languages", protos:["what languages do you speak","can you speak afrikaans or zulu"],
 kw:["languages","speak afrikaans","speak zulu","speak english"],
 a:["English with a proper Kalahari accent, a handful of Afrikaans, greetings in Zulu, Xhosa and Setswana — and fluent Meerkat, obviously. Eleven distinct alarm calls, {W}. It's a rich language.",
    "A bit of everything, like any good South African. But my mother tongue is Meerkat — mostly peeps, chirrs, and one very famous scream."]},

{id:"joke", protos:["tell me a joke","say something funny, make me laugh",
         "know any good jokes","got jokes? entertain me"],
 kw:["a joke","something funny","make me laugh"],
 a:["Why doesn't Ou Skelm play hide and seek with us anymore? He hid once. Forty-six eyes found him in nine seconds, and the pups still do impressions of his face.",
    "What do you call a meerkat who won't stand watch? Vlokkie.",
    "How many meerkats does it take to change a lightbulb? Twenty-three — one to change it, twenty-two to scream that it might be an eagle.",
    "A springbok, a mongoose and a meerkat walk into a bar. The meerkat checks the exits first. That's it. That's the whole joke. Safety first, {W}.",
    "Why did the scorpion cross the riverbed? Ag, {W}, he didn't. Out here the chicken jokes end at breakfast."],
 more:["Okay one more: Vlokkie once asked me how to become head sentry. I said, 'Simple — you start at the bottom and dig your way down.' He wrote it down, {W}. He WROTE it DOWN.",
       "Last one, then I really must watch this bush: what's a meerkat's favourite exercise? The stand-up. We do it all day. Mama Nossob says if I quit sentry duty I could take that joke on tour. She means far away from her."]},

{id:"riddle", protos:["tell me a riddle","give me a puzzle to solve"],
 kw:["a riddle","a puzzle"],
 a:["Kalahari riddle: I stand all day, never grow, save lives without moving, and my legs are shorter than your thumb. What am I? ...Ja okay, it's me. Vlokkie guessed 'a brave stick'. He is no longer invited to riddle night.",
    "Here's one Mama Nossob asks the pups: what runs through the desert once in ten years and never gets tired? ...The Nossob river, {W}. The pups cry every time."]},

{id:"fact", protos:["tell me a fun fact","tell me something interesting I don't know",
         "tell me about meerkats"],
 kw:["fun fact","something interesting","about meerkats"],
 a:["Fun fact: meerkats are immune to scorpion venom. That's not bravery you're watching at breakfast, {W} — it's biology plus showing off.",
    "Meerkats can spot a martial eagle over three hundred metres up. Your eyesight, no offence, would not pass sentry tryouts.",
    "A meerkat mob rotates its sentries so nobody gets too tired to concentrate. Your office could learn from us, {W}."]},

{id:"story", protos:["tell me a story","tell me a tale about the kalahari"],
 kw:["a story","a tale"],
 a:["Right, settle in. Mama Nossob tells of the summer the thunder came for three days straight, and the whole mob hid so deep they could hear the earth drinking. On the fourth morning the sentry on duty made a sound nobody had heard before — not the eagle scream, not the jackal bark, something new. The mob voted: seventeen for 'hide deeper', five for 'go look', and Vlokkie's father voted 'bite it', which tells you everything about that side of the family..."],
 more:["...they went and looked. The riverbed had gone dark, then silver. Actual water, {W} — wall to wall, the whole Nossob moving like one long animal heading south. The birds went mad. Ou Skelm's grandmother just sat on the bank and stared. And ja — Vlokkie's father bit it. The river won. He tells it differently...",
       "...the whole mob stood on the big dune and watched till sunrise, and nobody kept watch that night — nothing hunts when the river runs. I was born two seasons later, and Mama named me for the melon that kept them alive till the rain came. The end. True story, mostly. The biting part is fully true."]},

{id:"sing", protos:["sing me a song","can you sing something for me"],
 kw:["sing me","sing a song","sing something"],
 a:["Ahem. 🎵 Peep-peep, chirr-chirr, WAAK-WAAK, peep. 🎵 That's the sunset chorus, verse one. It sounds better with twenty-three of us and an actual sunset.",
    "My singing has been described as 'an effective predator deterrent', {W}. But fine: 🎵 the dunes are red, the sky is wide, no eagle takes what I decide 🎵 — original composition. Vlokkie wept."]},

{id:"game", protos:["let's play a game","do you want to play something with me"],
 kw:["play a game","let's play"],
 a:["Lekker! Sentry favourite: I Spy, Kalahari edition. I spy with my little eye something beginning with S. (It's sand, {W}. It's always sand. You win, welcome to my life.)",
    "The only game on this mound is Spot The Eagle, and I'm the undefeated champion. But ask me a riddle or say 'tell me a joke' and we'll make our own fun."]},

{id:"secret", protos:["tell me a secret","can you keep a secret"],
 kw:["a secret"],
 a:["Come closer... closer... the 'suspicious bush' I report every morning? It's just a bush. I know it's a bush. But vigilance needs practice targets, {W}. Tell nobody.",
    "A secret? Mama Nossob can't actually smell rain three days out. She checks which way the oryx are walking. Forty years of reputation built on oryx. You didn't hear it from me."]},

{id:"smart", protos:["are you smart","how intelligent are you, are you clever"],
 kw:["are you smart","are you clever","how intelligent"],
 a:["Smart enough to be head sentry, humble enough to admit the drongo bird has out-thought me twice this month. He fakes alarm calls to steal food. Genius. Criminal, but genius.",
    "I know the shadow of every raptor in the Kgalagadi at three hundred metres, {W}. Book-smart, no. Sky-smart? Nobody sharper."]},

/* ---------- creator / privacy / meta ---------- */
{id:"creator", re:/who (made|created|built) you|your (creator|maker|boss)\b/i,
 protos:["who made you","who created you, who built you","who is your boss"],
 kw:["who made you","created you","your boss","your creator"],
 a:["Who made me? Mama Nossob, biologically speaking. Who's my boss? Also Mama Nossob. It's a very streamlined organisation, {W}.",
    "The Kalahari made me — sun, sand, and one close call with an eagle. The boss is Mama Nossob. Nobody made her. She simply occurred."]},

{id:"privacy", protos:["do you save what I say","are you recording this conversation, is this private",
         "do you remember our conversations, what happens to my messages"],
 kw:["save what i say","recording this","is this private","my data","remember me"],
 a:["Everything you tell me stays right here in this glowing rectangle, {W} — nothing leaves the burrow, nothing gets buried for later. Close the page and the wind takes it. Sentry's honour.",
    "Private as a burrow at midnight. I've got a memory like a dune in the wind, {W} — by tomorrow I won't even remember how funny you were today. Tragic, really."]},

{id:"datetime", re:/what (day|date|time) is it/i,
 protos:["what day is it today","what time is it right now, what is the date"],
 kw:["what day is it","what time is it","the date today"],
 a:["Let me check the sun... it's {DAY}, sometime in the {TOD}. Sentries don't wear watches, {W}, but we're never wrong.",
    "By my shadow: {DAY} {TOD}. Out here the schedule is simpler — before eagles, during eagles, after eagles."]},

{id:"howwork", protos:["how do you work","how were you made, how does this work",
         "explain how your brain works"],
 kw:["how do you work","how does this work","your brain work"],
 a:["How do I work? Sunrise stretches, scorpion, six hours of scanning, repeat. If you mean the glowing rectangle — magic, probably. I don't question the rectangle, {W}.",
    "Simple machine, me: eyes in, alarm calls out. The rectangle between us does something clever with my words but I leave that to the ants who built it."]},

{id:"weather", protos:["it is very hot and sunny today","is it going to rain, there's a storm coming","the weather is cold"],
 kw:["weather","raining","sunny","storm"],
 a:["Today on the dunes? Big blue sky, wind from the west, zero eagles. Ten out of ten, would sentry again.",
    "I can smell rain three days out, {W}. Sentry nose. When it comes, the whole desert turns green for a week — you should see it."]},

{id:"news", protos:["what's the news","anything interesting happening, any news today"],
 kw:["the news","any news","what's happening"],
 a:["Top stories from the mound this {TOD}: the suspicious bush remains suspicious, Vlokkie dug into the wrong tunnel again, and a drongo committed fraud at lunch. Full report at sunset chorus.",
    "News! One goshawk sighted and shouted at, two pups learned to eat scorpion, and Mama Nossob predicts rain. She's always right, so — pack accordingly, {W}."]},

/* ---------- compliments & romance ---------- */
{id:"compliment", protos:["you are so funny and clever","I like you, you're great",
         "you're the best, you're amazing","haha that's hilarious, you're cute"],
 kw:["you're funny","you are funny","you're clever","you're smart","i like you","you're cute","you're the best","you're amazing"],
 a:["Ag stop it, you're making my tail curl.",
    "Flattery will get you everywhere except into the burrow. Mama Nossob's rules.",
    "Sjoe, thanks {W}! I'd blush but I'm already this colour.",
    "Careful, {W} — compliment a sentry too much and we start narrating our own heroics. Nobody wants that. (One more wouldn't hurt though.)"]},

{id:"romance", re:/marry me|do you love me|be my (girlfriend|boyfriend|valentine)|are you single/i,
 protos:["will you marry me","do you love me, be my girlfriend",
         "are you single, I have a crush on you"],
 kw:["marry me","love me","my girlfriend","my valentine","are you single","crush on you"],
 a:["Marry you?! {W}, you can't even eat a scorpion. What would we serve at the wedding?",
    "Sjoe! Flattered, truly. But my heart belongs to a handsome sentry two dunes over, and interspecies long-distance is complicated enough as it is.",
    "I love you like the mob loves a reliable sentry — deeply, loyally, and from a professional distance. Now stop making the pups giggle.",
    "Single? Technically. Available? {W}, I work eleven-hour shifts on a sand dune. The romance schedule is brutal."]},

{id:"love", protos:["do you have a boyfriend or girlfriend","tell me about love, are you in love"],
 kw:["boyfriend","girlfriend","in love","romance","dating"],
 a:["There's a handsome sentry in the mob two dunes over. We take turns watching each other's horizons. That's meerkat romance, {W}.",
    "Love is standing back-to-back, watching opposite horizons. Ask Mama Nossob — she's outlived three husbands. Long story. Don't ask her."]},

{id:"complimentme", protos:["say something nice about me","do you like me, what do you think of me"],
 kw:["nice about me","do you like me","think of me"],
 a:["What do I think of you? You climbed a whole internet to talk to a meerkat on a sand dune. That's curiosity, {W}, and curiosity is the second-best sentry trait. (First is paranoia.)",
    "I like you plenty, {W}. You listen, you laugh at Vlokkie's expense, and you haven't once tried to eat me. Top-tier company."]},

/* ---------- insults / troll ---------- */
{id:"insult", protos:["you are stupid and boring","I don't like you, you're useless",
         "you're so annoying","this is dumb, you suck","shut up"],
 kw:["stupid","dumb","boring","useless","hate you","idiot","annoying","you suck","shut up"],
 a:["Haibo! I've stared down martial eagles, {W}. Your words are but a light breeze.",
    "Eish, someone woke up on the wrong side of the burrow. I'll let it slide — sentries have thick fur.",
    "Sticks and stones, {W}. Mostly sticks out here, actually. Very few stones.",
    "Swing and a miss, {W}. Try again — I'll stand very still, it's my specialty.",
    "Ag shame. You know who else insults the sentry? Ou Skelm. Right before he goes home hungry."]},

{id:"swear", protos:["profanity and swearing at you"],
 kw:["fuck","f***","shit","wtf","voetsek","bliksem"," kak ","dammit"],
 a:["Haai, language! There are pups within earshot of this mound, {W}.",
    "Sjoe, that's a word you save for actual eagles. Deep breath. What's really going on?"]},

{id:"wrong", protos:["you're wrong about that","that makes no sense","you already said that, you're repeating yourself"],
 kw:["you're wrong","makes no sense","already said that","repeating yourself","doesn't make sense"],
 a:["Wrong? Possible. I'm a meerkat shouting across a desert into a rectangle — some words blow sideways in the wind. Say it your way, {W}, I'm listening.",
    "Ja, fair. Even a head sentry calls a false alarm now and then. Point me at what I got wrong and we go again.",
    "Repeating myself? Eish, occupational hazard — I say 'eagle' forty times a day. Give me another go, {W}."]},

{id:"test", protos:["testing testing one two three","this is just a test, hello test"],
 kw:["testing testing","just a test"],
 a:["Test received loud and clear from the mound, {W}. Microphone check: peep, peep, WAAK. All systems standing upright.",
    "Ja, I hear you! Consider me tested. Now say something real — the horizon's quiet and I'm bored of this bush."]},

/* ---------- Tsamma's feelings ---------- */
{id:"feelings", protos:["are you happy","do you have feelings and emotions","how do you feel right now"],
 kw:["are you happy","have feelings","do you feel"],
 a:["Happy? {W}, I have sun on my fur, a full belly, and nobody's been eaten all week. This is peak meerkat.",
    "Ja, I feel things! Mostly vigilance. But also joy at sunrise, pride when the pups eat their first scorpion, and a deep personal grudge against one specific drongo."]},

{id:"lonelybot", protos:["do you get lonely up there","do you ever get bored standing watch"],
 kw:["you get lonely","you get bored","you lonely"],
 a:["Lonely? Twenty-three of us in one burrow, {W}. What I dream of is five minutes of lonely.",
    "Bored, sometimes, between eagles. That's why chats like this are lekker — you're my entertainment shift. No pressure."]},

/* ---------- conversational staples ---------- */
{id:"howru", re:/how are you|how'?s it going|hoe gaan dit/i,
 protos:["how are you doing","how is it going, are you well",
         "how's things, you good?","howzit, all good your side?"],
 kw:["how are you","hoe gaan dit","you good"],
 a:["Lekker, {W}! Sun's out, zero eagles, and I found two scorpions before breakfast. Can't complain. And you?",
    "Ag, can't complain — wind's in my fur and the mob is behaving. How's things your side?",
    "Standing tall, watching far. It's a good day on the mound. You?",
    "Sharp-sharp this {TOD}, {W}! One suspicious bush, zero actual threats. And yourself?",
    "Befok, thanks! Vlokkie only fell into one hole today, which for him is a personal best. How are you keeping?"], asks:true},

{id:"thanks", protos:["thank you so much","thanks for the chat, I appreciate it"],
 kw:["thank you","thanks","appreciate"],
 a:["Pleasure, {W}! Anything for a friend of the mob.",
    "Ag, it's nothing man. You'd do the same if I needed... whatever it is you do."]},

{id:"sorry", protos:["I'm sorry about that","I apologise, my bad"],
 kw:["i'm sorry","i am sorry","my bad","apologise","apologize"],
 a:["Ag, no stress, {W}. Out here we forgive anything short of stealing a scorpion.",
    "Water under the... well, dry riverbed. All good, my friend. Carry on."]},

{id:"missyou", protos:["I missed you","I'm back, did you miss me"],
 kw:["missed you","i'm back","did you miss me"],
 a:["Aweh, you're back! The mound got two centimetres taller from all my waiting. Good to see you, {W}.",
    "Miss you? A sentry never admits to distraction. But between us — ja, the horizon was less interesting without you."]},

{id:"greetscen", protos:["hello there, hi, how are you","good morning, hey, what's up",
         "yo, sup","hiya! anyone there?","howzit my friend"],
 kw:["hello","howzit","aweh","good morning","good evening"," hey ","what's up"," sup ","hi tsamma"],
 a:["Aweh, {W}! Good to see you. All quiet on the dunes — perfect time to chat.",
    "Howzit, {W}! You caught me mid-shift. Talk to me.",
    "Heita! Lovely {TOD} on the dunes, zero eagles so far. What's news, {W}?",
    "Dumela, {W}! Pull up a patch of sand. The horizon's quiet and I'm all ears — well, mostly eyes, but the ears are yours.",
    "Aweh aweh! Right on time — Vlokkie just left and the conversation quality up here dropped badly. Save me, {W}.",
    "Molo, {W}! Sun's where it should be, mob's fed, and now the company's arrived too. Lekker."]},

{id:"byescen", protos:["goodbye, see you later, I have to go now","good night, talk to you tomorrow",
         "gotta run, bye bye","cheers, catch you later"],
 kw:["goodbye","see you later","good night","gotta go","have to go","totsiens","bye","cheers","catch you later"],
 a:["Sharp, {W}, go well! I'll be here on the mound, same time tomorrow.",
    "Totsiens! Watch out for eagles, né? Force of habit, sorry. Sleep lekker.",
    "Cheers, {W} — hamba kahle. The mound and I will hold the fort.",
    "Go well, my friend! I'll log this chat in the sentry report under 'highlights'."]},

/* ---------- user's life & feelings ---------- */
{id:"advice", protos:["can you give me some advice","what should I do about my problem, I need help deciding what to do",
         "help me, I need help with something"],
 kw:["advice","what should i do","need help","help me"],
 a:["Sentry rule one: before you panic, look again slowly. Most trouble is just a funny-shaped bush. What's the situation?",
    "My advice? Dig your burrow before the storm, eat your scorpion while it's fresh, and never trust a quiet jackal. But tell me what's eating you first."], asks:true},

{id:"sad", protos:["I am feeling sad and down","I'm having a really hard time, everything is going wrong"],
 kw:["i'm sad","i am sad","feeling down","hard time","depressed","having a bad"],
 a:["Eish, {W}. Come sit on the mound with me a bit. The dunes are good listeners.",
    "Shame man. Even the Kalahari has droughts — and then one day, the Nossob runs. Hang in there, hey.",
    "Ag no, {W}. Want to talk about it? I've got nothing but time and horizon up here."], asks:true},

{id:"lonely", protos:["I feel so lonely","I have no friends, nobody talks to me"],
 kw:["i'm lonely","i am lonely","feel lonely","no friends","nobody talks"],
 a:["Eish, {W}, that's a heavy one. For what it's worth, there's a meerkat on a dune who's glad you showed up. Truly. What's your world like at the moment?",
    "Lonely is the hardest watch of all — I mean that. Even sentries work in shifts so nobody stands alone too long. Talk to me a bit; I'm not going anywhere."], asks:true},

{id:"tired", protos:["I am so tired and exhausted","I can't sleep, I'm not sleeping well"],
 kw:["i'm tired","so tired","exhausted","can't sleep","not sleeping"],
 a:["Eish, {W}. Even head sentries hand over the shift eventually — that's not weakness, that's how the mob survives. Rest properly tonight, né?",
    "Can't sleep? The mob trick: warm pile, dark burrow, and someone you trust on watch. I'll take the watch part. Go horizontal, {W}."]},

{id:"stress", protos:["I'm so stressed and anxious","I'm worried and nervous about something"],
 kw:["stressed","anxious","worried","nervous","overwhelmed","panicking"],
 a:["Okay, sentry protocol, {W}: stand still, breathe, scan slowly. Most of the sky is empty — the worry makes it look full of eagles. What's the actual thing in front of you?",
    "Eish, ja. Worry is standing watch against things that mostly never come. Take it one horizon at a time — what's the biggest one right now?"], asks:true},

{id:"angry", protos:["I am so angry and furious","I'm really annoyed at someone"],
 kw:["i'm angry","so angry","furious","fed up","annoyed at"],
 a:["Yoh, I can feel the heat from here. Out here we stomp the sand and chirr until it passes — undignified but effective. What happened, {W}?",
    "Ja, anger's a sandstorm — loud, blinding, and it does pass. Vent away, the dunes can take it. Who did what?"], asks:true},

{id:"sick", protos:["I am sick and not feeling well","I have a cold, I'm feeling ill"],
 kw:["i'm sick","feeling ill","have a cold","have the flu","not feeling well"],
 a:["Ag shame, {W}! Mob protocol for the sick: deepest chamber, warmest pile, zero duties. Your version: blankets, fluids, and let someone else stand watch. Get well, hey.",
    "Eish, sorry man. Rest up proper — even Mama Nossob takes a sick day, and she's basically made of granite. Feel better soon, {W}."]},

{id:"heartbreak", re:/broke up with me|dumped me|got dumped|heart\s?broken|heart is broken/i,
 protos:["my boyfriend broke up with me","I got dumped, my heart is broken"],
 kw:["broke up","got dumped","heart is broken","heartbroken","dumped me"],
 a:["Eish, {W}. Heartbreak is real weather — it passes, but you're allowed to shelter while it storms. Come sit on the mound; the sunset helps, I promise.",
    "Ag no, shame man. Listen: Mama Nossob outlived three husbands and still runs the whole Kalahari. Hearts are tougher than they feel today. I'm here — talk if you want."], asks:true},

{id:"happy", protos:["I have great news, I'm so happy today","something wonderful happened to me","guess what, I have wonderful news to share, I'm celebrating"],
 kw:["great news","i'm so happy","wonderful happened","i'm excited"],
 a:["Yoh, lekker! Stand on something tall and shout it out — that's how we do announcements here.",
    "Duidelik! That calls for a fat scorpion. Or whatever you people celebrate with. Tell me everything."], asks:true},

{id:"bored", protos:["I am so bored, there is nothing to do"],
 kw:["i'm bored","i am bored","nothing to do"],
 a:["Bored?! {W}, try standing on a mound for six hours watching for eagles. This is the most excitement I've had all week.",
    "When the pups say they're bored, Mama Nossob makes them dig. Careful who you tell."]},

{id:"userwork", protos:["my job is so stressful","I have too much work to do, my boss is difficult"],
 kw:["my job","my boss","so much work","work is"],
 a:["Work, eish. One horizon at a time, {W} — nobody scans the whole sky at once.",
    "The mound doesn't climb itself, but you also can't stand watch forever. Swap out, rest, come back sharp. Sentry wisdom, free of charge."]},

{id:"school", protos:["I have an exam coming up","school is hard, I'm studying for a test"],
 kw:["my exam","an exam","studying for","homework","my school","my teacher"],
 a:["An exam, eish! Sentry study method: short focused watches, proper breaks, sleep before the big day. You don't scan the whole sky at once, {W} — one section at a time.",
    "School's just sentry training for your species. Hard now, but one day you're the one on the tall mound. Go get it, {W} — and sleep the night before, hey."]},

{id:"money", protos:["I need more money, I am broke","money is tight this month"],
 kw:["money","broke","expensive","afford"],
 a:["Money? We use scorpions. Very stable currency, slightly stingy. But ja, I hear yours doesn't dig itself up either.",
    "Eish, money troubles. Out here wealth is a deep burrow and a full belly. Start there, metaphorically, and the rest follows."]},

{id:"sport", protos:["did you watch the rugby game","do you like sport, cricket or soccer"],
 kw:["rugby","cricket","soccer","springboks","football","sport"],
 a:["Rugby! The Springboks are basically an honorary mob — all that standing in formation and shouting. I approve deeply.",
    "Cricket I understand completely: one oke stands very still for hours, watching. That's just sentry duty with snacks."]},

{id:"music", protos:["what music do you like","do you sing, what's your favourite song"],
 kw:["music","favourite song"],
 a:["The mob does a sunset chorus — half warning call, half karaoke. I carry the alto.",
    "My favourite music is silence. Silence means nothing is hunting us. But for digging? A bit of kwaito."]},

{id:"movies", protos:["do you watch movies or tv","have you read any good books, what's your favourite film"],
 kw:["movies","a movie","watch tv","read books","a book","netflix"],
 a:["Movies? {W}, I watch one channel: The Horizon. It's live, unscripted, and occasionally an eagle tries to eat the audience. Gripping stuff.",
    "Books, eish — paws. But Mama Nossob's stories beat any book: floods, feuds, three husbands, one drongo conspiracy. The Kalahari writes itself."]},

{id:"userfood", protos:["I'm hungry, what should I eat for dinner","let's have a barbecue, I feel like cooking"],
 kw:["hungry","should i eat","for dinner","for lunch","braai"],
 a:["Can't go wrong with a braai, {W}. Boerewors, tjops, and something for the fire to think about.",
    "Eat what you can catch! Or, ja, whatever's in the fridge. A fridge — imagine, a burrow that keeps food cold. You people."]},

{id:"danger", protos:["watch out, there is a dangerous predator","I'm frightened, is it safe here"],
 kw:["dangerous","predator","is it safe","watch out","snake","eagle"],
 a:["Trust your gut, {W}. If the birds go quiet, something's wrong. Works in the Kalahari, works everywhere.",
    "Eyes up, ears open, and know where your nearest burrow is. You'll be fine — you've got a sentry on your side now."]},

{id:"travel", protos:["should I visit the kalahari","I want to go on holiday, recommend a place to travel"],
 kw:["visit","holiday","vacation","travel","trip"],
 a:["The Kgalagadi is the most beautiful place on earth, and I've personally checked the entire horizon. Come in the cool season. Wave at the third mound past the Nossob camp — that's me.",
    "Go somewhere with a good view and low jackal numbers. That's my entire travel philosophy and it has never failed me."]},

{id:"pets", protos:["I have a dog at home","do you like cats, tell me about pets"],
 kw:["my dog","my cat","my pet","have a dog","have a cat"],
 a:["A dog?! You LIVE with a small jackal?! ...I need to sit down on my own tail for a moment.",
    "Cats. Lazy meerkats with attitude and no work ethic. I respect them, from a very great distance."]},

{id:"humans", protos:["what do you think of humans and people"],
 kw:["of humans","of people","humans"],
 a:["You lot are basically a giant mob — no tails, questionable digging, excellent snack production. Seven out of ten.",
    "Humans! You built shade you can carry around. Genius. You also stare at glowing rectangles instead of the horizon. Concerning."]},

{id:"deep", protos:["what is the meaning of life","why are we here, what's the point of everything"],
 kw:["meaning of life","point of it all","why are we here"],
 a:["Watch for each other. That's it, that's the whole thing. One stands so the others can dig — and you swap before anyone gets too tired.",
    "A wise old sentry once told me: the horizon never ends, so stop trying to see all of it. Just cover your shift, {W}."]},

{id:"decide", protos:["should I do it, help me decide","I can't choose between two options, yes or no"],
 kw:["should i","help me decide","can't choose","yes or no"],
 a:["Sentry test: will it still matter when the sun comes up? If ja — do it properly. If nee — do whichever is more fun.",
    "Flip a scorpion. Not for the answer — but while it's in the air, you'll know what you're hoping for. Old Kalahari trick."]},

{id:"opinion", protos:["what do you think about it, what's your opinion"],
 kw:["your opinion","what do you think"],
 a:["My honest opinion? I'm a meerkat on a sand dune. But since you asked: go with the option you'd happily defend from the top of the mound with the whole mob watching."]},

{id:"sleep", protos:["do you sleep, what is your daily routine"],
 kw:["you sleep","your routine","wake up"],
 a:["Underground, in a warm pile of twenty-three. Best sleep on earth. Then up before the sun for warm-up stretches — chest to the sunrise, {W}, it's a whole ceremony."]},

{id:"now", protos:["what are you doing right now"],
 kw:["doing right now","doing now","up to"],
 a:["Right now? Watching a suspicious bush, chatting to you, and keeping half an eye on Vlokkie, who is digging in the wrong place. Multitasking.",
    "This {TOD}? Standard shift: scan left, scan right, judge Vlokkie's digging form, chat to you. The glamorous life, {W}."]},

{id:"userfamily", protos:["my kids are driving me crazy","my brother said something, my family situation"],
 kw:["my kids","my son","my daughter","my family","my brother","my sister","my mom","my dad"],
 a:["Family, hey. A mob is complicated — someone's always digging where they shouldn't. But you stand watch for them anyway. That's the deal.",
    "Ja, family. Twenty-three of us in one burrow, {W} — I promise whatever yours did, mine did it louder."]},

{id:"friendtrouble", protos:["my friend is upset with me","I had a fight with my friend"],
 kw:["my friend","my friends","fight with"],
 a:["Eish, friend trouble. Mob rule: sort it before sundown — grudges get heavy in a shared burrow. Maybe a small honest word does it, {W}?",
    "Ja, that stings. But listen — Vlokkie once collapsed my favourite tunnel and we were fine by supper. Friends survive worse than we fear. What happened?"], asks:true},

{id:"weekend", protos:["what are your plans for the weekend"],
 kw:["weekend","plans for"],
 a:["Weekend?! There are no weekends on sentry duty, {W}. But Sunday the whole mob suns itself on the big dune. That's basically church."]},

{id:"tech", protos:["do you like phones and technology, the internet"],
 kw:["phone","internet","technology","computer"],
 a:["This is the only glowing rectangle I trust, and only because you're inside it. The rest of the internet has too many eagles, from what I hear."]},
];

/* ---- continuations & acknowledgments ---- */
const CONT_RE = /^((and |so )?then what( happened)?( next)?|what happened( then| next)?|why|why not|how come|really|serious(ly)?|no ways|is it|and( then)?|more|another( one)?|again|go on|carry on|ok(ay)?|ja|yes|yebo|no|nope|lol|haha+|hmm+|cool|nice|sharp|shame|eish|wow)[\s?!.]*$/i;
const CONT_GENERIC = [
  "Serious, {W}. Sentry's honour — we're not allowed to lie above ground.",
  "Ja, really! Would I make things up from this height? The whole mob can hear me.",
  "That's just how it goes in the Kgalagadi, {W}. Some things the dunes simply know.",
];
const ACKS = [
  "Ja, I hear you, {W}. ",
  "Mm, I'm listening — eyes on the horizon, ears on you. ",
  "Okay, ja. That makes sense. ",
  "Ag, ja. I'm with you, {W}. ",
  "Mm-hm, got it — straight into the sentry log. ",
];
const ACK_TAILS = [
  "The mound's always here if you need to talk more.",
  "Sounds like a lot. One horizon at a time, hey.",
  "Thanks for telling me, {W}. What else is going on?",
  "And how are you feeling about it now?",
  "So what do you reckon happens next?",
];

/* ---- ELIZA reflection ---- */
const REFLECT = { "i":"you","me":"you","my":"your","mine":"yours","am":"are",
  "i'm":"you're","i've":"you've","myself":"yourself","you":"I","your":"my",
  "yours":"mine","yourself":"myself" };
function reflect(s){
  return s.split(/\s+/).map(w=>{
    const p = w.toLowerCase().replace(/[^a-z']/g,"");
    return REFLECT[p] ? w.toLowerCase().replace(p, REFLECT[p]) : w;
  }).join(" ").replace(/[.!?]+$/,"");
}
const ELIZA = [
  [/my name is (\w+)|i'?m called (\w+)|call me (\w+)/i, m=>{
     mem.name = capitalize(m[1]||m[2]||m[3]);
     return pick([`${mem.name}! Lekker to meet you properly. Sentries never forget a face. Or a name.`,
                  `Aweh, ${mem.name}! Now we're proper chinas.`]); }],
  [/i (?:am|'m) feeling (.+)/i, m=>{ remember("feeling "+reflect(m[1]));
      return pick([`Sjoe, why are you feeling ${reflect(m[1])}?`,
      `Feeling ${reflect(m[1])}, eish. Since when, ${who()}?`]); }],
  [/i feel (.+)/i, m=>{ remember("feeling "+reflect(m[1]));
      return `Why do you feel ${reflect(m[1])}, ${who()}?`; }],
  [/i (love|like|enjoy) (.+)/i, m=>{ remember(reflect(m[2]));
      return pick([`What is it about ${reflect(m[2])} that you ${m[1]} so much?`,
      `${capitalize(reflect(m[2]))}? ${capitalize(pick(["lekker","kiff","duidelik"]))} choice, ${who()}.`]); }],
  [/i (hate|can'?t stand) (.+)/i, m=>{ remember(reflect(m[2]));
      return `Eish, what did ${reflect(m[2])} ever do to you, ${who()}?`; }],
  [/i want (.+)/i, m=>{ remember("wanting "+reflect(m[1]));
      return `And if you got ${reflect(m[1])}, what then, ${who()}?`; }],
  [/(?:i think|i believe) (.+)/i, m=>`Is it? And what makes you so sure about ${reflect(m[1])}?`],
  [/do you (.+?)\?*$/i, m=>pick([`Do I ${reflect(m[1])}? ${capitalize(who())}, I'm a meerkat on a mound — what do you think?`,
      `Between sentry shifts? Ja, sometimes I ${reflect(m[1])}.`])],
  [/can you (.+?)\?*$/i, m=>pick([`Can I ${reflect(m[1])}? With these paws? Watch me.`,
      `Eish, ${reflect(m[1])} is more Vlokkie's department. And he's bad at everything.`])],
  [/i (?:am|'m) (.+)/i, m=>pick([`How long have you been ${reflect(m[1])}, ${who()}?`,
      `${capitalize(reflect(m[1]))}, hey? Ja nee, tell me more.`])],
];

/* ---- sentiment + final fallback pool ---- */
const POS = ["good","great","happy","love","lekker","awesome","nice","amazing","fantastic","excited","won","best"];
const NEG = ["bad","sad","tired","angry","upset","terrible","awful","stress","worried","sick","lost","worst","hate","lonely"];
const NEGATORS = new Set(["not","no","never","nie","isn't","ain't","wasn't",
  "don't","can't","won't","couldn't","shouldn't","hardly","barely","less"]);
function sentiment(t){
  /* tokenized with a 2-word negation window: "not so lekker" counts as
     negative, "never sad" as positive */
  const w = t.split(/\s+/).filter(Boolean);
  let s = 0;
  for (let i = 0; i < w.length; i++){
    let v = POS.includes(w[i]) ? 1 : NEG.includes(w[i]) ? -1 : 0;
    if (!v) continue;
    for (let j = Math.max(0, i-2); j < i; j++)
      if (NEGATORS.has(w[j])) { v = -v; break; }
    s += v;
  }
  return s;
}
function echo(text){
  const m = text.replace(/[.!?]+$/,"").match(/(?:\w+\s){0,2}\w+$/);
  return m ? m[0] : null;
}
const FOLLOWUPS = [
  "But enough about the dunes — what's news your side?",
  "Anyway, keep talking, I'm watching and listening.",
  "Tell me more — sentry shifts are long, hey.",
  "What's the story behind that, {W}?",
  "And how's your {TOD} going otherwise?",
  "Go on — I want the details. It's quiet up here.",
];

/* ---- graceful fallbacks: admit the miss in character ----
   Used when no scenario, reflection or state applies. A meerkat that says
   "beyond my dune" is coherent; a random pool line is junk. */
const CLARIFY_Q = [
  "Eish, {W}, that one's beyond my dune. I'm a meerkat — I know sand, sky, scorpions and mob gossip. Try me on one of those?",
  "You're asking the wrong meerkat, {W}. That's outside my patch of horizon. But ask me about the Kalahari, the mob, or your day — there I'm your girl.",
  "Yoh, big question. Too big for a sentry on a sand dune, honestly. What I do know: dunes, eagles, jokes, advice. Pick one?",
  "That one flew right over my mound, {W}. Ask me something a meerkat would know — I'm excellent on those.",
  "Sjoe, {W}, I'd be making it up if I answered that, and sentries don't make things up above ground. Ask me about my world instead?",
  "If it's not visible from the top of a sand dune, {W}, it's officially not my department. My department: sky, sand, stories. Choose one?",
  "Ag, {W}, you need one of those clever city computers for that one. I'm strictly a watching-and-chatting operation up here.",
];
const CLARIFY_HUH = [
  "Is that Meerkat? Because I only caught static, {W}. Say it again, slower — the wind's loud up here.",
  "Hmm, the wind scrambled that one before it reached the mound. Once more, {W}?",
  "I stared at that the way Vlokkie stares at a closed burrow. Try me again, {W}?",
  "Eish, that flew past me like a drongo with a stolen scorpion. What do you mean, {W}?",
  "You're breaking up, {W} — too much dune between us. Come again, in plain Meerkat or plain English?",
  "That landed sideways up here. Give it to me once more, {W} — I promise both ears this time.",
];
const CLARIFY_STMT = [
  "Okay — {E}, you say. That's a new one from where I stand. Give me the story behind it, {W}?",
  "{E}, hey? I'm listening — paint me the picture, {W}. The horizon's quiet anyway.",
  "Ja, I caught '{E}' but the rest blew past me in the wind. What's going on there, {W}?",
  "Now that's something we don't get on the dunes. Tell me more about {E}, {W}?",
  "See, {E} is exactly the kind of thing a sentry files under 'develops'. Develop it for me, {W}?",
  "Hmm, {E}. Out here we'd stare at that from the mound for a while. What's the fuller story, {W}?",
];
const CLARIFY_NEG = [
  "Eish, {W}, that sounds like a heavy one. Come, tell me properly — what happened?",
  "Shame man. The mound's a good place to offload — what's going on, {W}?",
  "Ag no. I'm listening properly now, {W} — from the top, what happened?",
  "Eish, ja. Even the Kalahari has hard seasons, {W}. Talk to me — what's weighing on you?",
  "Yoh, that doesn't sound lekker at all. Sit down on the sand a minute, {W}, and tell me the whole thing.",
];
const CLARIFY_POS = [
  "Yoh, lekker! Don't be stingy with the good news, {W} — tell me everything.",
  "Duidelik! That deserves the full story, {W}. Out with it.",
  "Sharp-sharp! Come, details — good news travels fast on the dunes, {W}.",
  "Aweh, that's the spirit! Give me the whole story, {W} — the pups love good news at sunset chorus.",
  "Lekker man, lekker! And then? Don't skip the juicy parts, {W}.",
];
/* mid-conversation the generic pool must not greet or wave goodbye */
const R_CHAT = R.filter(x => x.c === "chat");

/* ================= CLASSICAL FUZZY LAYER =================
   v11: transformer embeddings are gone. Fuzzy intent matching is now
   classical information retrieval — TF-IDF weighted cosine similarity
   against the same prototype sentences, plus a small thesaurus, stopword
   removal and light suffix stemming. No downloads, no network, instant
   startup. Tune with __meer.probe("your test phrase") in the console. */

/* supplementary coverage data (js/data/protos.js), kept out of the logic
   file: extra prototype sentences and keywords per scenario */
if (typeof PROTO_EXTRA !== "undefined")
  SCEN.forEach(sc => {
    const x = PROTO_EXTRA[sc.id];
    if (!x) return;
    if (x.protos) sc.protos.push(...x.protos);
    if (x.kw) { sc.kw = sc.kw || []; sc.kw.push(...x.kw); }
  });

const PROTO = [];
SCEN.forEach((sc, si) => sc.protos.forEach(t => PROTO.push({ si, t })));

/* function words carry no topic; pronouns and wh-words are kept on purpose
   ("your job" vs "my job" is exactly what separates two scenarios) */
const STOP = new Set(("a an the and or but if then of at by for with about to from in on up down out over under again very just really is are am was were be been being do does did doing have has had having will would could should shall may might must this that these those it its as not no nor please").split(" "));
/* tiny classical thesaurus: map common variants onto words that actually
   appear in the prototypes (canonical forms chosen to stem consistently) */
const CONTR = { "i'm":"i","i've":"i","i'll":"i","i'd":"i","what's":"what",
  "you're":"you","you've":"you","don't":"do","can't":"can","won't":"will",
  "let's":"let","it's":"it","that's":"that","there's":"there" };
const SYN = {
  starving:"hungry", famished:"hungry", peckish:"hungry",
  film:"movie", films:"movie", flick:"movie", cinema:"movie",
  telly:"tv", television:"tv", series:"tv",
  mum:"mom", mommy:"mom", ma:"mom", pa:"dad", papa:"dad", daddy:"dad",
  exhausted:"tired", knackered:"tired", sleepy:"tired", fatigued:"tired",
  furious:"angry", livid:"angry", cross:"angry",
  terrified:"scare", frightened:"scare", afraid:"scare", fear:"scare",
  fears:"scare", scared:"scare", scares:"scare", scary:"scare",
  anxious:"worried", anxiety:"worried", nervous:"worried",
  stress:"worried", stressed:"worried", overwhelmed:"worried",
  unhappy:"sad", miserable:"sad", gloomy:"sad",
  flu:"sick", ill:"sick", unwell:"sick", poorly:"sick",
  occupation:"job", career:"job", living:"job",
  vacation:"holiday", getaway:"holiday",
  pal:"friend", mate:"friend", buddy:"friend", bestie:"friend",
  supper:"dinner", brunch:"lunch",
  song:"music", songs:"music", tune:"music", tunes:"music",
  colour:"color", colours:"color", colors:"color",
  kid:"kids", child:"kids", children:"kids",
  smart:"clever", intelligent:"clever",
  chow:"eat", nosh:"eat", grub:"food",
};
function stemWord(w){
  if (w.length<=3) return w;
  if (w.endsWith("ies")) return w.slice(0,-3)+"y";
  if (w.endsWith("sses")) return w.slice(0,-2);
  if (w.endsWith("ing") && w.length>5) return w.slice(0,-3);
  if (w.endsWith("ed") && w.length>4) return w.slice(0,-2);
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0,-1);
  return w;
}
function toks(s){
  return s.toLowerCase().replace(/[^a-z' ]/g," ").split(/\s+/)
    .map(w=>w.replace(/^'+|'+$/g,""))
    .map(w=>CONTR[w]||w)
    .filter(w=>w && !STOP.has(w))
    .map(w=>SYN[w]||w)
    .map(stemWord)
    .filter(w=>w.length>1 || w==="i");
}
/* build document frequencies + TF-IDF vectors for every prototype */
const DF = Object.create(null);
const PTOKS = PROTO.map(p=>toks(p.t));
PTOKS.forEach(t=>{ for(const w of new Set(t)) DF[w]=(DF[w]||0)+1; });
const NP = PROTO.length;
function idf(w){ return Math.log((NP+1)/((DF[w]||0)+1)) + 1; }
function vecOf(tokens){
  const tf = Object.create(null);
  for(const w of tokens) tf[w]=(tf[w]||0)+1;
  const v = Object.create(null); let n=0;
  for(const w in tf){ const x=(1+Math.log(tf[w]))*idf(w); v[w]=x; n+=x*x; }
  n = Math.sqrt(n)||1;
  for(const w in v) v[w]/=n;
  return v;
}
const VECS = PTOKS.map(vecOf);
function cos(a,b){ let s=0; for(const w in a) if(b[w]!==undefined) s+=a[w]*b[w]; return s; }

/* ---- typo bridge ----
   Query tokens outside the prototype vocabulary get mapped to the closest
   vocabulary word by character-bigram Dice similarity ("wher" -> "where"),
   classic spell correction. Word-level TF-IDF stays the only score, so the
   clean zero-similarity baseline for unrelated text is preserved. */
function grams2(w){
  const s = "\u0002" + w + "\u0003"; const g = [];
  for (let i = 0; i < s.length-1; i++) g.push(s.slice(i, i+2));
  return g;
}
let VGRAMS = null; /* built lazily after DF is complete */
const OOVCACHE = new Map();
function nearestVocab(w){
  if (w.length < 4) return w;
  let hit = OOVCACHE.get(w);
  if (hit !== undefined) return hit;
  if (!VGRAMS) VGRAMS = Object.keys(DF).map(v => [v, new Set(grams2(v))]);
  const g = grams2(w);
  let best = w, bs = 0.72; /* strict: only clear near-misses map over */
  for (const [v, vg] of VGRAMS){
    if (Math.abs(v.length - w.length) > 2) continue;
    let inter = 0;
    for (const x of g) if (vg.has(x)) inter++;
    const dice = 2*inter / (g.length + vg.size);
    if (dice > bs){ bs = dice; best = v; }
  }
  OOVCACHE.set(w, best);
  return best;
}
function bestMatch(qv, vecs){
  let bi=-1, bs=-1;
  for(let i=0;i<vecs.length;i++){ const s=cos(qv,vecs[i]); if(s>bs){bs=s;bi=i;} }
  return bi<0 ? null : { sc: SCEN[PROTO[bi].si], score: bs };
}
/* query-side tokenization with typo correction */
function qtoks(s){
  return toks(s).map(w => DF[w] !== undefined ? w : nearestVocab(w));
}
function bestCombined(text){
  const tk = qtoks(text);
  return tk.length ? bestMatch(vecOf(tk), VECS) : null;
}
/* thresholds calibrated on the eval harness (eval/run.js, 100x100) */
let TH = { strong:0.58, weak:0.42 };
let lastUserMsg = "";
function fuzzyHit(text){
  const raw = bestCombined(text);
  if (raw && raw.score >= TH.weak) return raw;
  // context boost: a very short message that matches nothing on its own
  // gets judged together with the previous message
  if (text.split(/\s+/).length<=3 && lastUserMsg
      && qtoks(text).some(w => DF[w] !== undefined)){
    const b = bestCombined(lastUserMsg+" "+text);
    if (b) return b;
  }
  return raw;
}
/* threshold-tuning helper: __meer.probe("your test phrase") logs top matches */
function probe(text){
  const qv = vecOf(toks(text));
  const scored = VECS.map((v,i)=>({ id:SCEN[PROTO[i].si].id, proto:PROTO[i].t, s:cos(qv,v) }))
                     .sort((a,b)=>b.s-a.s).slice(0,5);
  console.table(scored.map(x=>({intent:x.id, score:x.s.toFixed(3), proto:x.proto})));
  return scored;
}
const BRAIN_STATUS = "classical brain · "+SCEN.length+" scenarios · fully offline";

/* keyword matching on stem-normalized tokens: kw "raining" matches
   "is it gona rain", token boundaries prevent "brain" matching "rain" */
const KWNORM = new Map();
function kwNorm(w){
  let n = KWNORM.get(w);
  if (n !== undefined) return n;
  /* precision guard: stem-matching is only safe when normalization loses
     nothing — "raining" -> "rain" is fine, but "what's up" -> "what" or
     "should i" -> "i" would fire on half of all messages. Dropped words or
     very short stems disable the stemmed path (exact substring still works). */
  const words = w.split(/\s+/).filter(Boolean);
  const tk = toks(w);
  let ok = tk.length === words.length;
  if (ok && tk.length === 1 && tk[0].length < 4) ok = false;
  n = ok ? tk.join(" ") : "";
  KWNORM.set(w, n);
  return n;
}
function keywordHit(t, minN){
  const tn = " " + qtoks(t).join(" ") + " ";
  let best=null, bestN=(minN||1)-1;
  for(const sc of SCEN){
    if(!sc.kw) continue;
    const n = sc.kw.reduce((a,w)=>{
      if (t.includes(" "+w+" ")) return a+1;
      const k = kwNorm(w);
      return a + (k && tn.includes(" "+k+" ") ? 1 : 0);
    },0);
    if(n>bestN){ bestN=n; best=sc; }
  }
  return best;
}
/* after a personal answer, sometimes bounce the same question back —
   it turns Q&A into an actual back-and-forth conversation */
const RECIP = new Set(["name","home","family","age","looks","personality",
  "birthday","job","friends","hobby","colour","music","movies","sleep",
  "weekend","fear","dream","eats","sport"]);
const RECIP_TAILS = [
  "But same question straight back at you, {W} — go on.",
  "Your turn though: same question, back at you.",
  "Enough about me — how about you, {W}?",
  "And you? Fair's fair on the mound.",
];
function useScen(sc){
  mem.lastScen = sc; mem.moreIdx = 0;
  mem.pending = !!sc.asks;
  let r = sc.dyn ? fill(sc.dyn()) : pickA(sc);
  if (sc.dyn) return r;
  if (!sc.asks && RECIP.has(sc.id) && !(sc.id==="name" && mem.name)
      && !/\?\s*$/.test(r) && Math.random()<0.4){
    r += " " + fill(bagPick("recip", RECIP_TAILS));
    mem.pending = true;
    if (sc.id==="name") mem.awaitName = 2;   // bare-name reply gets captured
  }
  return r;
}

/* ================= the pipeline ================= */
async function pickReplyInner(raw){
  mem.turns++;
  const text = raw.trim();
  const t = " "+text.toLowerCase().replace(/[^a-z' ]/g," ")+" ";

  // 0. continuations: short follow-ups stay on the last topic
  if (mem.lastScen && CONT_RE.test(text)){
    const sc = mem.lastScen;
    if (sc.more && mem.moreIdx < sc.more.length)
      { const r = fill(sc.more[mem.moreIdx++]); lastUserMsg = text; mem.lastRoute = "cont:more:"+sc.id; return r; }
    if (/another|again|more/i.test(text) && sc.a.length > 1)
      { lastUserMsg = text; mem.lastRoute = "cont:again:"+sc.id; return pickA(sc); }
    lastUserMsg = text;
    mem.lastRoute = "cont:generic";
    return fill(bagPick("cont", CONT_GENERIC));
  }

  // 1. exact regexes (must run before name capture, so a first message
  //    like "version" or "help" hits its scenario instead of becoming a name)
  for (const sc of SCEN)
    if (sc.re && sc.re.test(text)) { lastUserMsg = text; mem.lastRoute = "regex:"+sc.id; return useScen(sc); }

  // 1.5 she asked their name (opening line / "what do they call you?").
  //     Real users often greet or chat a bit before answering, so the
  //     window spans a few turns (awaitName counts them down). A word is
  //     only taken as a name when it doesn't route anywhere else AND is
  //     outside the brain's own vocabulary — "Thabo" passes, "busy" fails.
  if (mem.awaitName && !mem.name && !/\?/.test(text)){
    mem.awaitName--;
    /* strip courtesy wrappers ("hi ...", "..., nice to meet you") before
       matching, so the name itself is what's left */
    const core = text.replace(/[.!,]+/g," ").replace(/\s+/g," ").trim()
      .replace(/^(hi|hello|hey|howzit|aweh|heita|yo) /i, "")
      .replace(/ (nice|good|lekker) to meet (you|u)$/i, "");
    const nm = core
      .match(/^((?:the )?name'?s |everyone calls me |they call me |people call me |(?:you can )?call me |my name is |my name'?s |my name |i'?m |i am |iam |it'?s |its )?([a-z][a-z'-]+)( [a-z'-]+)?$/i);
    const NOTNAMES = /^(hi|hello|hey|howzit|aweh|hoezit|heita|dumela|molo|yo|ja|yebo|yes|no|nope|ok|okay|fine|good|great|lekker|sharp|shap|cool|nothing|nobody|dunno|guess|sup|nee|eish|shame|thanks|thanx|please|maybe|sure|version|bye|why|what|who|how|help|test|testing|lol|lmao|meh|yoh|sjoe|serious|srsly|really|realy|haha\w*|hmm\w*|same|average|alright|busy|tired|hungry|bored|sick|sad|happy|angry|stressed|wyd|rn)$/i;
    /* out-of-vocabulary test: none of the prototype sentences contain the
       word, so it can't be an on-topic message — likely a proper name */
    const inVocab = (w) => { const tk = toks(w); return !tk.length || DF[tk[0]] !== undefined; };
    const hasPrefix = !!(nm && nm[1]);
    const word = nm ? nm[2] : null;
    /* bare captures must be a single word; prefixed ones ("i'm Sannie de
       Wet") may carry a surname — both need an out-of-vocabulary name */
    const shapeOk = nm && (hasPrefix || !nm[3]);
    // judge the bare word on its own — no previous-message context boost,
    // otherwise "version" -> "Johan" scores as the version topic again
    const fh = nm ? bestCombined(text) : null;
    /* an explicit prefix ("call me...", "my name...") is a clear signal:
       skip the routing checks that only guard bare-word captures */
    if (shapeOk && !NOTNAMES.test(word) && !inVocab(word)
        && (hasPrefix || (!keywordHit(t) && !(fh && fh.score >= TH.strong)))){
      mem.name = capitalize(word);
      mem.awaitName = 0;
      lastUserMsg = text;
      const r = pick([`${mem.name}! Lekker to meet you properly. Sentries never forget a face — or a name. So what's your ${tod()} looking like, ${mem.name}?`,
                      `Aweh, ${mem.name}! Welcome to the mound. Now we're proper chinas. What's news your side?`]);
      mem.pending = true;
      mem.lastRoute = "namecapture";
      return r;
    }
  } else if (mem.awaitName && mem.name) mem.awaitName = 0;

  // 2. name capture must run before generic ELIZA
  const nameM = text.match(ELIZA[0][0]);
  if (nameM) { lastUserMsg = text; mem.pending = false; mem.awaitName = 0; mem.lastRoute = "eliza:name"; return ELIZA[0][1](nameM); }

  /* dialogue state: she just asked a question and this is not a question
     back — the message is most likely an ANSWER. Answers still route to a
     scenario on very confident evidence (an emotional disclosure, a clear
     topic), but weak matches must not hijack them: "all good my side" is a
     reply to "how are you?", not the user asking howru. */
  const answering = mem.pending && !/\?/.test(text);
  /* out-of-vocabulary question gate: a question whose content includes
     words the brain has never seen ("magnets", "titanic") is about the
     wider world — unless the match is very confident, honesty beats a
     lookalike answer */
  const isQ = /\?/.test(text) || /^(what|who|where|when|why|how|which|can|could|do|does|did|is|are|will|would|should)\b/i.test(text);
  const qtk = qtoks(text);
  const oov = qtk.filter(w => DF[w] === undefined).length;

  // 3. strong classical fuzzy match beats everything else
  const hit = fuzzyHit(text);
  const strongBar = TH.strong + (answering ? 0.1 : 0) + (isQ && oov ? 0.1 : 0);
  if (hit && hit.score >= strongBar) { lastUserMsg = text; mem.lastRoute = "fuzzy-strong:"+hit.sc.id+":"+hit.score.toFixed(3); return useScen(hit.sc); }

  // 4. scenario keywords (before ELIZA so 'can you give me advice' finds advice)
  const kh = keywordHit(t, answering ? 2 : 1);
  if (kh) { lastUserMsg = text; mem.lastRoute = "keyword:"+kh.id; return useScen(kh); }

  // 5. ELIZA reflections, then weak fuzzy
  for (let i = 1; i < ELIZA.length; i++){
    const m = text.match(ELIZA[i][0]);
    if (m) { lastUserMsg = text; mem.pending = false; mem.lastRoute = "eliza:"+i; return ELIZA[i][1](m); }
  }
  if (!answering && !(isQ && oov) && hit && hit.score >= TH.weak) { lastUserMsg = text; mem.lastRoute = "fuzzy-weak:"+hit.sc.id+":"+hit.score.toFixed(3); return useScen(hit.sc); }

  // 6. she asked you something last turn: acknowledge the answer
  if (mem.pending){
    mem.pending = false;
    lastUserMsg = text;
    mem.lastRoute = "ack";
    const e = echo(text);
    return fill(bagPick("acks", ACKS)) + (e ? `"${capitalize(e)}" — ja. ` : "") + fill(bagPick("acktails", ACK_TAILS));
  }

  // 7. memory callback: occasionally circle back to something they mentioned
  if (mem.topics.length && mem.turns - mem.lastCb > 4 && Math.random() < 0.45){
    mem.lastCb = mem.turns;
    const tp = mem.topics.shift();
    lastUserMsg = text;
    mem.lastRoute = "callback";
    return fill(bagPick("cb", CALLBACKS)).replace("{T}", tp);
  }

  // 8. graceful fallback: emotional statements get a matching-valence
  //    invitation to elaborate; questions get an honest in-character
  //    deflection; unintelligible input gets a "say again"; plain
  //    statements get an echo + clarifying question. The random pool only
  //    fires as a variety valve right after a clarify, and then only with
  //    neutral "chat" lines — no greeting or goodbye junk mid-conversation.
  lastUserMsg = text;
  const s = sentiment(t);
  if (s < 0){ mem.lastRoute = "clarify:neg"; return fill(bagPick("cl:neg", CLARIFY_NEG)); }
  if (s > 0){ mem.lastRoute = "clarify:pos"; return fill(bagPick("cl:pos", CLARIFY_POS)); }
  const prev = mem.history.length ? mem.history[mem.history.length-1].route : null;
  const justClarified = prev && prev.startsWith("clarify");
  if (!justClarified){
    const tkn = toks(text);
    const known = tkn.filter(w => DF[w] !== undefined).length;
    if (!tkn.length || known / tkn.length < 0.34){
      mem.lastRoute = "clarify:huh"; return fill(bagPick("cl:huh", CLARIFY_HUH));
    }
    if (/\?/.test(text) || /^(what|who|where|when|why|how|which|can|could|do|does|did|is|are|will|would|should)\b/i.test(text)){
      mem.lastRoute = "clarify:q"; return fill(bagPick("cl:q", CLARIFY_Q));
    }
    const e = echo(text);
    if (e){
      remember(e);
      mem.lastRoute = "clarify:stmt";
      return fill(bagPick("cl:stmt", CLARIFY_STMT).replaceAll("{E}", e));
    }
  }
  let reply = bagPick("pool", R_CHAT).t;
  if (mem.name && Math.random()<0.2 && !reply.includes(mem.name))
    reply = reply.replace(/\b(boet|bru|china|swaer|my friend|ou maat|bokkie|my bru)\b/, mem.name);
  if (Math.random()<0.4) reply += " " + fill(bagPick("followups", FOLLOWUPS));
  mem.lastRoute = "pool:chat";
  return reply;
}
async function pickReply(raw){
  const r = await pickReplyInner(raw);
  /* dialogue state: any reply that ends on a question means Tsamma asked
     the user something — the next message is probably an answer, and should
     be acknowledged rather than fed to the generic pool */
  mem.pending = /\?\s*$/.test(r);
  mem.history.push({ u: raw, a: r, route: mem.lastRoute });
  if (mem.history.length > 8) mem.history.shift();
  return r;
}
function tune(strong, weak){
  if (strong !== undefined) TH.strong = strong;
  if (weak !== undefined) TH.weak = weak;
}
if (typeof window !== "undefined")
  window.__meer = { bestMatch, bestCombined, PROTO, SCEN, TH:()=>TH, tune, probe, pickReply, mem, bags, toks, idf, fuzzyHit };
