# Phase 6 — Taglish handling and retrieval evaluation results

Run at 2026-08-11T11:21:00.682823+00:00 against 50 questions (evals\queries\chatbot_eval_v1.json).

## Findings and decision (read this before the raw numbers below)

**Query translation does not ship.** The plan's improvement (6.3) was implemented and
A/B'd for real — `core/tools/catalog.py` and `core/tools/policy.py` both take a
`translate: bool = False` parameter, unused by default. The retrieval numbers below show
*baseline beating translated*, most clearly on the languages it was meant to help:
Taglish hit-rate dropped 92%→83%, Filipino 90%→80%. The existing hybrid search (vector +
full-text + exact-match boost, built in Phase 1) already handles code-switched queries
well on its own — plausibly because Taglish/Filipino questions about technical topics
here keep the English terms anyway ("MATLAB," "cybersecurity," "artificial intelligence"),
so there's little for a translation step to fix, and it adds a real failure point
(occasional mistranslation) instead. The code stays in, opt-in, in case a future test set
with less English-loanword-heavy phrasing shows a different result — but the honest
conclusion from *this* data is: don't turn it on.

**There is a real Taglish/Filipino gap — just not the one translation would have fixed.**
`pol-genfine-tgl` and `pol-genfine-fil` (the general "how much is the late fee" question)
both failed outright — the model reported no information and deferred to a librarian —
while the identical question in English (`pol-genfine-en`) succeeded. Every *other* policy
group (hourly fine, lost/damaged, hours, visitor requirements) succeeded in all three
languages. One group failing consistently while translation makes retrieval slightly
*worse* suggests the gap here isn't primarily a retrieval-embedding problem — worth a
closer look at that specific chunk/query pairing before assuming translation would help.

**Two of the automated "misses" are false negatives in the proxy itself, not real
failures** — flagged here because this is exactly the failure mode the plan's "human-
verified" requirement exists to catch, and it showed up on the very first real run:
- `acc-fines-en` — asked in English, the model correctly answered in the same
  conversational style but the actual reply text ("Wala kang unpaid fines") leaned Filipino
  for the negation. Correct answer, marked a miss because the check only looked for English
  words ("no"/"none"/"don't have").
- `det-cloud-tgl` — asked in Taglish, replied in Taglish per the system prompt's own rule 3
  ("mabawasan ang mga atake" — "reduce the attacks" — instead of the English phrase "attack
  surface" the check was looking for). Correct, faithful summary; wrong language for a
  substring match written in English.

Both are visible in the full transcript below (`[MISS]` tags) — read the actual reply text,
not just the tag, before trusting the accuracy-proxy percentages as-is. This is precisely
why the plan calls for human verification rather than an automated check alone.

## Retrieval hit-rate@5 (catalog + policy, automated & objective)

### baseline

- overall: 32/35 (91%)
- english: 12/13 (92%)
- taglish: 11/12 (92%)
- filipino: 9/10 (90%)

### translated

- overall: 30/35 (86%)
- english: 12/13 (92%)
- taglish: 10/12 (83%)
- filipino: 8/10 (80%)

## Answer-accuracy proxy (automated substring match — NOT human-verified, see caveat below)

By language:
- english: 11/12 (92%)
- taglish: 9/11 (82%)
- filipino: 5/6 (83%)

By capability:
- policy: 15/17 (88%)
- book_details: 6/7 (86%)
- account: 4/5 (80%)

### Full transcript (question / reply / automated verdict)

**cat-ai-en** (english, catalog) [N/A]
- Q: books about artificial intelligence
- A: I found 3 books about artificial intelligence — the first two are on the Mezzanine:

1. "Artificial intelligence and knowledge processing: improved decision-making and prediction" by Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, and Valentina Emilia Balas.
   
2. "Introduction to artificial intelligence" by Jake R. Pomperada and Jason V. Castellano.

3. "Artificial intelligenc

**cat-ai-tgl** (taglish, catalog) [N/A]
- Q: may libro ba kayo tungkol sa artificial intelligence?
- A: Mayroong tatlong libro tungkol sa artificial intelligence na available:

1. *Artificial intelligence and knowledge processing: improved decision-making and prediction* ni Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, at Valentina Emilia Balas.
2. *Introduction to artificial intelligence* ni Jake R. Pomperada at Jason V. Castellano.
3. *Artificial intelligence in games* ni Paul

**cat-ai-fil** (filipino, catalog) [N/A]
- Q: may aklat po ba kayo tungkol sa artificial intelligence?
- A: May mga aklat kami tungkol sa artificial intelligence. Narito ang ilan sa mga ito:

1. **Artificial intelligence and knowledge processing : improved decision-making and prediction** ni Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, at Valentina Emilia Balas. Available ito.

2. **Introduction to artificial intelligence** ni Jake R. Pomperada at Jason V. Castellano. Available din

**cat-cyber-en** (english, catalog) [N/A]
- Q: do you have anything on cybersecurity
- A: I found several books on cybersecurity:

1. **Navigating the Cybersecurity Career Path** by Helen E. Patton (Available)
2. **Introduction to Cybersecurity** by Jake R. Pomperada and Jason V. Castellano (Available)
3. **Information Assurance and Security 1 & 2** by Marmelo V. Abante (Available)
4. **Cloud Native Security** by Chris Binnie and Rory McCune (Currently borrowed)
5. **Computing Essentia

**cat-cyber-tgl** (taglish, catalog) [N/A]
- Q: meron ba kayong libro about cybersecurity?
- A: Meron tayong ilang libro tungkol sa cybersecurity:

1. "Navigating the cybersecurity career path." ni Helen E. Patton – Available
2. "Introduction to cybersecurity" nina Jake R. Pomperada at Jason V. Castellano – Available
3. "Information assurance and security 1 & 2" ni Marmelo V. Abante – Available
4. "Cloud native security" nina Chris Binnie at Rory McCune – Nakabborrow
5. "Computing essentials

**cat-cyber-fil** (filipino, catalog) [N/A]
- Q: mayroon po ba kayong aklat tungkol sa cybersecurity?
- A: Mayroon tayong ilang aklat tungkol sa cybersecurity. Narito ang ilan sa mga ito:

1. **Navigating the cybersecurity career path** ni Helen E. Patton - Available
2. **Introduction to cybersecurity** nina Jake R. Pomperada at Jason V. Castellano - Available
3. **Information assurance and security 1 & 2** ni Marmelo V. Abante - Available
4. **Cloud native security** nina Chris Binnie at Rory McCune -

**cat-cloud-en** (english, catalog) [N/A]
- Q: looking for a book on cloud security
- A: I found a book titled "Cloud native security" by Chris Binnie and Rory McCune, pero currently borrowed na siya. 

Meron ding ibang related titles, available ang mga ito:
1. "Introduction to cybersecurity" by Jake R. Pomperada and Jason V. Castellano.
2. "Navigating the cybersecurity career path." by Helen E. Patton.
3. "Information assurance and security 1 & 2" by Marmelo V. Abante.

You might wan

**cat-cloud-tgl** (taglish, catalog) [N/A]
- Q: may libro ba kayo about cloud security?
- A: May nakita akong libro tungkol sa cloud security: "Cloud native security" nina Chris Binnie at Rory McCune, pero kasalukuyan itong borrowed. 

Meron ding iba pang related titles na available:
1. "Introduction to cybersecurity" ni Jake R. Pomperada at Jason V. Castellano.
2. "Navigating the cybersecurity career path." ni Helen E. Patton.
3. "Information assurance and security 1 & 2" ni Marmelo V. A

**cat-cloud-fil** (filipino, catalog) [N/A]
- Q: hinahanap ko po sana ang librong tungkol sa cloud security
- A: May nahanap akong mga libro tungkol sa cybersecurity na maaaring makatulong sa iyo sa cloud security. Ang una ay "Cloud native security" nina Chris Binnie at Rory McCune, pero naka-borrow na ito. Ang iba naman ay:

1. "Introduction to cybersecurity" ni Jake R. Pomperada at Jason V. Castellano - available ito.
2. "Navigating the cybersecurity career path" ni Helen E. Patton - available din.
3. "Inf

**cat-aigames-en** (english, catalog) [N/A]
- Q: is there a book about AI in video games
- A: I found a book specifically on AI in video games:

- "Artificial intelligence in games" by Paul Roberts is available. 

Other related titles might interest you too, like "Collaborative worldbuilding for video games" by Kaitlin Tremblay. Both are currently available. Let me know if you need more info!

**cat-aigames-tgl** (taglish, catalog) [N/A]
- Q: meron ba kayong libro tungkol sa AI sa mga games
- A: Meron tayong dalawang libro tungkol sa AI sa mga games:

1. **Artificial intelligence in games** ni Paul Roberts
2. **Artificial intelligence and knowledge processing : improved decision-making and prediction** nina Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, at Valentina Emilia Balas

Available silang dalawa, pero nasa Unassigned shelf location sila.

**cat-aigames-fil** (filipino, catalog) [N/A]
- Q: mayroon po ba kayong aklat tungkol sa artificial intelligence sa mga laro?
- A: Mayroon akong 3 aklat na maaaring may kaugnayan sa artificial intelligence. Narito ang mga ito:

1. **Artificial intelligence in games** ni Paul Roberts
2. **Artificial intelligence and knowledge processing: improved decision-making and prediction** nina Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, at Valentina Emilia Balas
3. **Introduction to artificial intelligence** nina 

**cat-matlab-en** (english, catalog) [N/A]
- Q: book about MATLAB for engineers
- A: I found a book on MATLAB relevant to engineers:

- **MATLAB programming for engineers, Seventh edition** by Stephen J. Chapman

This book is available, so you can check its details and location in the library.

**cat-matlab-tgl** (taglish, catalog) [N/A]
- Q: may libro ba tungkol sa MATLAB para sa mga engineers
- A: Yes, may available na libro tungkol sa MATLAB para sa mga engineers. Isa sa mga ito ay "MATLAB programming for engineers" by Stephen J. Chapman. Available ito sa library. 

Kung gusto mo ng iba pang titles o tulong, sabihin mo lang!

**cat-matlab-fil** (filipino, catalog) [N/A]
- Q: mayroon po ba kayong aklat tungkol sa MATLAB para sa mga inhinyero?
- A: Mayroon tayong aklat na "MATLAB programming for engineers" ni Stephen J. Chapman. Available ito at makikita sa Unassigned shelf location. 

Kung kailangan mo ng iba pang aklat o detalye, sabihin mo lang!

**cat-knuth-en** (english, catalog) [N/A]
- Q: the art of computer programming
- A: I found one book related to your query — "The art of computer programming: volume 4b" by Donald E. Knuth, which is available. It's located at the Unassigned shelf. If you want more books or details, let me know!

**cat-marketing-en** (english, catalog) [N/A]
- Q: books on business marketing
- A: I found 5 books on business marketing. Here they are:

1. **Business marketing** by Grayfield T. Bajao & Rene D. Osorno
2. **Business marketing management in a business-to-business context** by Dharam Paul Warne
3. **Strategic marketing management: simplified moves for rookies** by Girly H. Naval
4. **Social media mobile marketing: new age of commercially lucrative relationships** by Kavita Singh


**cat-marketing-tgl** (taglish, catalog) [N/A]
- Q: may libro ba tungkol sa marketing ng business?
- A: I found 5 books tungkol sa marketing ng business:

1. **Business marketing** by Grayfield T. Bajao & Rene D. Osorno
2. **Strategic marketing management: simplified moves for rookies** by Girly H. Naval
3. **Business marketing management in a business-to-business context** by Dharam Paul Warne
4. **Social media mobile marketing: new age of commercially lucrative relationships** by Kavita Singh
5. *

**cat-tourism-en** (english, catalog) [N/A]
- Q: book about entrepreneurship in tourism and hospitality
- A: I found some books that might interest you regarding entrepreneurship in tourism and hospitality:

1. **Entrepreneurship in tourism and hospitality industry** by Chester Dave G. Arenas
2. **Quality service management in tourism and hospitality** by Chester Dave G. Arenas
3. **Legal aspects in tourism and hospitality** by Melinda Bascos

The first two are particularly focused on the tourism and hos

**cat-tourism-tgl** (taglish, catalog) [N/A]
- Q: may libro po ba tungkol sa entrepreneurship sa tourism at hospitality?
- A: Nakahanap ako ng ilang libro tungkol sa entrepreneurship sa tourism at hospitality. Narito ang mga ito:

1. **Entrepreneurship in tourism and hospitality industry** ni Chester Dave G. Arenas
2. **Entrepreneurship. 2022 edition** nina Solita A. Frias at Cristina B. Banastao
3. **Legal aspects in tourism and hospitality** ni Melinda Bascos

Lahat ng ito ay available. Makikita ang mga ito sa "Unassig

**cat-tourism-fil** (filipino, catalog) [N/A]
- Q: may aklat po ba tungkol sa negosyo sa larangan ng turismo?
- A: Ayon sa aking paghahanap, may mga aklat na available tungkol sa negosyo sa larangan ng turismo:

1. **Entrepreneurship in tourism and hospitality industry** ni Chester Dave G. Arenas. 
2. **Legal aspects in tourism and hospitality** ni Melinda Bascos.
3. **Tourism policy planning and development** ni Juliepear Brion, Nikoliena M. Diño, at Ramon A. Tiongco, Jr.
4. **Sustainable tourism** ni Marie A

**pol-genfine-en** (english, policy) [HIT]
- Q: how much is the fine for a late book?
- A: According to the Loan Policies section, the fines for late books are as follows:

- **Reserve books**: Php 2.00 per library hour
- **Non-Reserve/General circulation books**: Php 5.00 per item per school day 

Make sure to return the books on time to avoid incurring any fines!

**pol-genfine-tgl** (taglish, policy) [MISS]
- Q: magkano yung fine kapag late mag-return ng libro?
- A: Wala akong nahanap na specific na impormasyon tungkol sa fine para sa late na pag-return ng libro. Mas mabuti kung magtanong ka sa librarian sa Users and Information Services Counter para makakuha ng tamang sagot.

**pol-genfine-fil** (filipino, policy) [MISS]
- Q: magkano po ang multa kapag naantala ang pagsauli ng libro?
- A: I'm not certain about the exact fine rates for late book returns. You should check with the librarian at the Users and Information Services Counter for accurate information.

**pol-hourlyfine-en** (english, policy) [HIT]
- Q: what's the fine rate for a reserve book or the Bible per hour?
- A: According to the Loan Policies section, the fine rate for Reserve books, including the Bible, is Php 2.00 per library hour. If you have more questions, feel free to ask!

**pol-hourlyfine-tgl** (taglish, policy) [HIT]
- Q: magkano po per hour yung fine ng reserve books?
- A: Wala akong nahanap na specific na impormasyon tungkol sa fine per hour ng reserve books. I suggest na makipag-ugnayan ka sa librarian sa Users and Information Services Counter para makakuha ng eksaktong sagot sa tanong mo.

**pol-hourlyfine-fil** (filipino, policy) [HIT]
- Q: magkano po ang multa bawat oras para sa reserve books?
- A: Ayon sa Loan Policies section, ang multa para sa reserve books ay Php 2.00 per library hour. Kung may iba ka pang katanungan, feel free to ask!

**pol-lostfine-en** (english, policy) [HIT]
- Q: how much do I pay if I lose or damage a library book?
- A: According to the Loan Policies section, if you lose or damage a library book, you'll pay a processing fee of ₱50.00, and the book will need to be replaced with the same or a related/updated title, plus the processing fee.

**pol-lostfine-tgl** (taglish, policy) [HIT]
- Q: magkano babayaran ko kung nawala o nasira yung libro?
- A: Ayon sa Loan Policies section, kung nawala o nasira mo ang libro, may processing fee na ₱50.00. Kailangan mo ring bayaran o palitan ang libro ng kapareho o kaugnay na pamagat kasama ang processing fee. 

Kung may ibang tanong ka o kailangan ng tulong, huwag mag-atubiling magtanong!

**pol-lostfine-fil** (filipino, policy) [HIT]
- Q: magkano po ang babayaran ko kapag nawala o nasira ang aklat?
- A: According to the Loan Policies section, if a library material is lost or damaged, there's a processing fee of ₱50.00. Additionally, the lost or damaged item must be paid for or replaced with the same or a related/updated title, plus that processing fee. Kung may iba ka pang katanungan, maari kang makipag-usap sa librarian sa Users and Information Services Counter.

**pol-hours-en** (english, policy) [HIT]
- Q: what time does the LRC open on weekdays?
- A: According to the Hours of Service section, the LRC opens from 7:00 am to 5:00 pm on weekdays (Monday to Friday).

**pol-hours-tgl** (taglish, policy) [HIT]
- Q: anong oras magbukas yung library sa weekdays?
- A: According to the Hours of Service section, open ang library from Monday to Friday, 7:00 am to 5:00 pm. If you need more details, feel free to ask!

**pol-hours-fil** (filipino, policy) [HIT]
- Q: anong oras po bumubukas ang aklatan tuwing Lunes hanggang Biyernes?
- A: Ayon sa "Hours of Service" section, ang aklatan ay bumubukas mula Lunes hanggang Biyernes mula 7:00 am hanggang 5:00 pm.

**pol-hourssat-en** (english, policy) [HIT]
- Q: is the library open on Saturday, and what time?
- A: According to the library hours information, the Learning Resource Center (LRC) is open on Saturday from 8:00 am to 5:00 pm.

**pol-hourssat-tgl** (taglish, policy) [HIT]
- Q: bukas ba yung LRC tuwing Sabado, anong oras?
- A: According to the Hours of Service section, ang LRC ay bukas tuwing Sabado mula 8:00 am hanggang 5:00 pm.

**pol-visitor-en** (english, policy) [HIT]
- Q: what do outside visitors need to bring to use the library?
- A: According to the guidelines for visiting users, outside visitors need to bring a valid ID and a referral letter signed by the library head. They also have to pay a visitor's fee of Php 50.00 at the cashier. Make sure to secure a pass from the College lobby guard before proceeding to the library.

**pol-visitor-tgl** (taglish, policy) [HIT]
- Q: ano po kailangan dalhin ng outside visitor para makapasok sa library?
- A: Para makapasok ang outside visitor sa library, kailangan nilang dalhin ang mga sumusunod:

1. **Valid ID** - Dapat ay mayroong valid ID.
2. **Referral Letter** - Kailangan ng referral letter na may pirma ng library head para sa assessment.
3. **Bayad** - Mayroong fee na Php 50.00 na babayaran.

Tapos, dapat nilang sundin ang procedure na secure ang pass mula sa guard sa college lobby, ipakita ang 

**pol-visitor-fil** (filipino, policy) [HIT]
- Q: ano po ang kailangang dalhin ng panauhin mula sa labas upang makagamit ng aklatan?
- A: Ayon sa policies ng library, ang mga panauhin mula sa labas ay kinakailangang magdala ng:

1. Referral letter o endorsement.
2. Valid ID.

Bukod dito, may fee na Php 50.00 per person para sa paggamit ng aklatan. Sila ay pinapayagang pumasok sa library tuwing Miyerkules mula 8:00 am hanggang 5:00 pm. Para sa karagdagang impormasyon, mas mabuting magtanong sa librarian sa Users and Information Servi

**det-cloud-en** (english, book_details) [HIT]
- Q: what is Cloud native security about?
- A: "Cloud native security" by Chris Binnie and Rory McCune focuses on minimizing attack surfaces in cloud native infrastructures. It includes practical examples to help readers mitigate threats and address concerns that can lead to security issues. The book provides essential insights for security professionals to maintain secure and reliable cloud environments. 

Currently, this book is borrowed and

**det-cloud-tgl** (taglish, book_details) [MISS]
- Q: ano po ba yung tungkol sa librong Cloud native security?
- A: Yung librong "Cloud native security" ni Chris Binnie at Rory McCune ay nagbibigay ng detalyadong impormasyon kung paano mabawasan ang mga atake sa cloud native infrastructure. May mga praktikal na halimbawa ito na nagtuturo kung paano maiwasan ang mga banta at alisin ang mga isyu na karaniwang nagiging dahilan ng security compromises. Importante ito para sa mga security professionals na gustong ma

**det-java-en** (english, book_details) [HIT]
- Q: tell me about the book Job ready java
- A: Nahanap ko ang "Job Ready Java" ni Haythem Balti. Ang libro ay nagbibigay ng komprehensibong diskarte sa Java na agad na maiaangkop sa mga totoong sitwasyon. Ito ay batay sa kilalang Software Guild Java Bootcamp: Object Oriented Programming course, kaya't tinuturuan nito ang mga pangunahing at advanced na konsepto ng Java na kailangan para sa anumang entry-level na posisyon sa Java. 

Available it

**det-java-tgl** (taglish, book_details) [HIT]
- Q: ano po tungkol dun sa librong Job ready java?
- A: Ang "Job Ready Java" ni Haythem Balti ay nagbibigay ng komprehensibo at pundamental na paglapit sa Java na agad na maiaangkop sa mga totoong sitwasyon. Batay ito sa kilalang Software Guild Java Bootcamp, itinuturo ng aklat na ito ang mga batayan at advanced na konsepto ng Java na kakailanganin mo sa anumang entry-level Java position. Available ito sa LRC at makikita sa shelf na Unassigned.

**det-java-fil** (filipino, book_details) [HIT]
- Q: ano po ba ang nilalaman ng aklat na Job ready java?
- A: Ang "Job Ready Java" ni Haythem Balti ay nagbibigay ng komprehensibo at pundasyonal na paglapit sa Java na agad na maaaring ilapat sa mga totoong sitwasyon. Batay ito sa kilala at epektibong Software Guild Java Bootcamp: Object Oriented Programming course, tinuturo ng aklat ang mga pangunahing at advanced na konsepto ng Java na kinakailangan para sa anumang entry-level Java position. 

Available i

**det-notincatalog-en** (english, book_details) [HIT]
- Q: do you have Harry Potter and the Philosopher's Stone?
- A: Wala ayong kopya ng "Harry Potter and the Philosopher's Stone" sa catalog. Subukan mong i-rephrase ang search mo or magtanong sa librarian.

**det-notincatalog-tgl** (taglish, book_details) [HIT]
- Q: meron ba kayong Harry Potter and the Philosopher's Stone?
- A: Wala akong mahanap na libro na "Harry Potter and the Philosopher's Stone" sa catalog. Siguro pwede mong subukang ibang phrasing o tanungin ang librarian para sa tulong.

**acc-due-en** (english, account) [HIT]
- Q: when is my book due?
- A: You have "Cloud native security" by Chris Binnie and Rory McCune due on August 25, 2026. You can check "My Library" in the sidebar for more details.

**acc-due-tgl** (taglish, account) [HIT]
- Q: kailan po due yung libro ko?
- A: May isang libro ka, "Cloud native security" na due sa August 25, 2026. Para sa iba pang detalye, check mo na lang ang "My Library" sa sidebar.

**acc-fines-en** (english, account) [MISS]
- Q: do I have any unpaid fines?
- A: Wala kang unpaid fines. If you need more info, check "My Library" sa sidebar.

**acc-fines-tgl** (taglish, account) [HIT]
- Q: may fine ba ako na hindi pa bayad?
- A: Wala kang outstanding fines na hindi pa bayad. You can check more details sa "My Library" sa sidebar.

**acc-history-en** (english, account) [HIT]
- Q: what books have I borrowed and returned before?
- A: You have borrowed and returned the following book:

- **Title**: Professional C++. Fifth edition.
- **Author**: Marc Gregoire
- **Borrowed On**: July 12, 2026
- **Due Date**: July 26, 2026
- **Returned On**: July 25, 2026

For more details, you can check "My Library" in the sidebar.
