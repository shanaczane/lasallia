# Phase 6 — Taglish handling and retrieval evaluation results

Run at 2026-09-19T11:49:47.106558+00:00 against 50 questions (evals\queries\chatbot_eval_v1.json).

## Retrieval hit-rate@5 (catalog + policy, automated & objective)

### baseline

- overall: 33/35 (94%)
- english: 13/13 (100%)
- taglish: 11/12 (92%)
- filipino: 9/10 (90%)

### translated

- overall: 35/35 (100%)
- english: 13/13 (100%)
- taglish: 12/12 (100%)
- filipino: 10/10 (100%)

## Answer-accuracy proxy (automated substring match — NOT human-verified, see caveat below)

By language:
- english: 11/12 (92%)
- taglish: 10/11 (91%)
- filipino: 6/6 (100%)

By capability:
- policy: 17/17 (100%)
- book_details: 5/7 (71%)
- account: 5/5 (100%)

### Full transcript (question / reply / automated verdict)

**cat-ai-en** (english, catalog) [N/A]
- Q: books about artificial intelligence
- A: I found three books on artificial intelligence:

1. **Artificial intelligence and knowledge processing: improved decision-making and prediction** by Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, and Valentina Emilia Balas, available in Aisle 1.
   
2. **Artificial intelligence in games** by Paul Roberts, available in Aisle 3.
   
3. **Introduction to artificial intelligence** 

**cat-ai-tgl** (taglish, catalog) [N/A]
- Q: may libro ba kayo tungkol sa artificial intelligence?
- A: I found several books on artificial intelligence:

1. "Artificial Intelligence and Knowledge Processing: Improved Decision-Making and Prediction"
2. "Artificial Intelligence in Games"
3. "Introduction to Artificial Intelligence"

The first two are located in Aisle 1 and Aisle 3 respectively, while the last one is in Aisle 12. All are currently available.

**cat-ai-fil** (filipino, catalog) [N/A]
- Q: may aklat po ba kayo tungkol sa artificial intelligence?
- A: Yes, I found three books on artificial intelligence:

1. "Artificial intelligence and knowledge processing: improved decision-making and prediction" by Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, and Valentina Emilia Balas. It's available in Aisle 1.

2. "Artificial intelligence in games" by Paul Roberts. It's available in Aisle 3.

3. "Introduction to artificial intelligenc

**cat-cyber-en** (english, catalog) [N/A]
- Q: do you have anything on cybersecurity
- A: I found several books on cybersecurity:

1. **Navigating the Cybersecurity Career Path** by Helen E. Patton - Available in Aisle 1.
2. **Introduction to Cybersecurity** by Jake R. Pomperada and Jason V. Castellano - Available in Aisle 12.
3. **Information Assurance and Security 1 & 2** by Marmelo V. Abante - Available in Aisle 12.
4. **Cloud Native Security** by Chris Binnie and Rory McCune - Avai

**cat-cyber-tgl** (taglish, catalog) [N/A]
- Q: meron ba kayong libro about cybersecurity?
- A: I found several books about cybersecurity:

1. "Navigating the Cybersecurity Career Path" by Helen E. Patton - available in Aisle 1.
2. "Introduction to Cybersecurity" by Jake R. Pomperada and Jason V. Castellano - available in Aisle 12.
3. "Information Assurance and Security 1 & 2" by Marmelo V. Abante - available in Aisle 12.
4. "Cloud Native Security" by Chris Binnie and Rory McCune - available

**cat-cyber-fil** (filipino, catalog) [N/A]
- Q: mayroon po ba kayong aklat tungkol sa cybersecurity?
- A: I found several books on cybersecurity. Here are a few:

1. **Navigating the Cybersecurity Career Path** by Helen E. Patton - available in Aisle 1.
2. **Introduction to Cybersecurity** by Jake R. Pomperada and Jason V. Castellano - available in Aisle 12.
3. **Information Assurance and Security 1 & 2** by Marmelo V. Abante - available in Aisle 12.
4. **Cloud Native Security** by Chris Binnie and Ro

**cat-cloud-en** (english, catalog) [N/A]
- Q: looking for a book on cloud security
- A: I found several books related to cloud security:

1. **Cloud Native Security** by Chris Binnie and Rory McCune - Available in Aisle 1.
2. **Introduction to Cybersecurity** by Jake R. Pomperada and Jason V. Castellano - Available in Aisle 12.
3. **Navigating the Cybersecurity Career Path** by Helen E. Patton - Available in Aisle 1.
4. **Information Assurance and Security 1 & 2** by Marmelo V. Abant

**cat-cloud-tgl** (taglish, catalog) [N/A]
- Q: may libro ba kayo about cloud security?
- A: I found several books related to cloud security and cybersecurity. The first one is "Cloud Native Security" by Chris Binnie and Rory McCune. You can find it in Aisle 1. The other titles are also relevant to cybersecurity:

1. "Introduction to Cybersecurity" by Jake R. Pomperada and Jason V. Castellano (Aisle 12).
2. "Navigating the Cybersecurity Career Path" by Helen E. Patton (Aisle 1).
3. "Infor

**cat-cloud-fil** (filipino, catalog) [N/A]
- Q: hinahanap ko po sana ang librong tungkol sa cloud security
- A: I found several books related to cloud security:

1. **Cloud native security** by Chris Binnie and Rory McCune - Available in Aisle 1.
2. **Introduction to cybersecurity** by Jake R. Pomperada and Jason V. Castellano - Available in Aisle 12.
3. **Navigating the cybersecurity career path** by Helen E. Patton - Available in Aisle 1.
4. **Information assurance and security 1 & 2** by Marmelo V. Abant

**cat-aigames-en** (english, catalog) [N/A]
- Q: is there a book about AI in video games
- A: I found several books related to AI and video games:

1. **Artificial Intelligence in Games** by Paul Roberts - Available at Aisle 3.
2. **Artificial Intelligence and Knowledge Processing: Improved Decision-Making and Prediction** by Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, and Valentina Emilia Balas - Available at Aisle 1.
3. **Introduction to Artificial Intelligence** b

**cat-aigames-tgl** (taglish, catalog) [N/A]
- Q: meron ba kayong libro tungkol sa AI sa mga games
- A: I found several books related to AI in games:

1. **Artificial Intelligence in Games** by Paul Roberts
2. **Artificial Intelligence and Knowledge Processing: Improved Decision-Making and Prediction** by Hemachandran K et al.
3. **Introduction to Artificial Intelligence** by Jake R. Pomperada and Jason V. Castellano.

You can check them out in their respective shelf locations.

**cat-aigames-fil** (filipino, catalog) [N/A]
- Q: mayroon po ba kayong aklat tungkol sa artificial intelligence sa mga laro?
- A: I found several books related to artificial intelligence and games:

1. "Artificial intelligence in games" by Paul Roberts is available in Aisle 3.
2. "Artificial intelligence and knowledge processing: improved decision-making and prediction" by Hemachandran K, Raul Villamarin Rodriguez, Umashankar Subramaniam, and Valentina Emilia Balas can be found in Aisle 1.
3. "Introduction to artificial inte

**cat-matlab-en** (english, catalog) [N/A]
- Q: book about MATLAB for engineers
- A: I found a relevant book: "MATLAB programming for engineers. Seventh edition" by Stephen J. Chapman. It's available at Aisle 2. If you're interested in it, you can check the catalog for more details or reserve it.

**cat-matlab-tgl** (taglish, catalog) [N/A]
- Q: may libro ba tungkol sa MATLAB para sa mga engineers
- A: I found a relevant book on MATLAB: "MATLAB programming for engineers" by Stephen J. Chapman. It's available on the shelf in Aisle 2.

**cat-matlab-fil** (filipino, catalog) [N/A]
- Q: mayroon po ba kayong aklat tungkol sa MATLAB para sa mga inhinyero?
- A: I found a book titled "MATLAB programming for engineers" by Stephen J. Chapman. It is available in Aisle 2. If you're interested in other engineering-related topics, there are also several other books available in the same aisle.

**cat-knuth-en** (english, catalog) [N/A]
- Q: the art of computer programming
- A: I found a book titled "The art of computer programming: volume 4b" by Donald E. Knuth, which is available on the shelf in Aisle 1.

**cat-marketing-en** (english, catalog) [N/A]
- Q: books on business marketing
- A: I found several books on business marketing:

1. "Business Marketing" by Grayfield T. Bajao & Rene D. Osorno - Available in Aisle 10.
2. "Business Marketing Management in a Business-to-Business Context" by Dharam Paul Warne - Available (shelf location unassigned).
3. "Strategic Marketing Management: Simplified Moves for Rookies" by Girly H. Naval - Available in Aisle 10.
4. "Social Media Mobile Ma

**cat-marketing-tgl** (taglish, catalog) [N/A]
- Q: may libro ba tungkol sa marketing ng business?
- A: I found several books on business marketing:

1. "Business marketing management in a business-to-business context" by Dharam Paul Warne.
2. "Business marketing" by Grayfield T. Bajao & Rene D. Osorno.
3. "Strategic marketing management: simplified moves for rookies" by Girly H. Naval.
4. "Social media mobile marketing: new age of commercially lucrative relationships" by Kavita Singh.
5. "Advertisi

**cat-tourism-en** (english, catalog) [N/A]
- Q: book about entrepreneurship in tourism and hospitality
- A: I found some books related to entrepreneurship in tourism and hospitality. Here are a couple of notable ones:

1. **Entrepreneurship in Tourism and Hospitality Industry** by Chester Dave G. Arenas - Available in Aisle 10.
   
2. **Entrepreneurship. 2022 Edition** by Solita A. Frias & Cristina B. Banastao - Available in Aisle 10.

You might also be interested in **Quality Service Management in Tour

**cat-tourism-tgl** (taglish, catalog) [N/A]
- Q: may libro po ba tungkol sa entrepreneurship sa tourism at hospitality?
- A: I found several books related to entrepreneurship in the context of tourism and hospitality:

1. "Entrepreneurship in tourism and hospitality industry" by Chester Dave G. Arenas - Available in Aisle 10.
2. "Entrepreneurship. 2022 edition" by Solita A. Frias & Cristina B. Banastao - Available in Aisle 10.
3. "Entrepreneurial mindset" by Aida O. Camilar-Serrano - Available in Aisle 10.
4. "Entrepren

**cat-tourism-fil** (filipino, catalog) [N/A]
- Q: may aklat po ba tungkol sa negosyo sa larangan ng turismo?
- A: I found several books related to business in the field of tourism:

1. **Tourism policy planning and development** by Juliepear Brion, Nikoliena M. Diño, and Ramon A. Tiongco, Jr. - Available at Aisle 12.
2. **Legal aspects in tourism and hospitality** by Melinda Bascos - Available at Aisle 12.
3. **Entrepreneurship in tourism and hospitality industry** by Chester Dave G. Arenas - Available at Ais

**pol-genfine-en** (english, policy) [HIT]
- Q: how much is the fine for a late book?
- A: According to the Loan Policies section:
Non-Reserve/ General Php 5.00 per item per school day

**pol-genfine-tgl** (taglish, policy) [HIT]
- Q: magkano yung fine kapag late mag-return ng libro?
- A: According to the Loan Policies section:
Non-Reserve/ General Php 5.00 per item per school day

**pol-genfine-fil** (filipino, policy) [HIT]
- Q: magkano po ang multa kapag naantala ang pagsauli ng libro?
- A: According to the Loan Policies section:
Non-Reserve/ General Php 5.00 per item per school day

**pol-hourlyfine-en** (english, policy) [HIT]
- Q: what's the fine rate for a reserve book or the Bible per hour?
- A: According to the Loan Policies section:
Reserve books Php 2.00 per library hour

**pol-hourlyfine-tgl** (taglish, policy) [HIT]
- Q: magkano po per hour yung fine ng reserve books?
- A: According to the Loan Policies section:
Reserve books Php 2.00 per library hour

**pol-hourlyfine-fil** (filipino, policy) [HIT]
- Q: magkano po ang multa bawat oras para sa reserve books?
- A: According to the Loan Policies section:
Reserve books Php 2.00 per library hour

**pol-lostfine-en** (english, policy) [HIT]
- Q: how much do I pay if I lose or damage a library book?
- A: According to the Loan Policies section:
Lost and/or Damaged Php 50.00 processing fee. (Library materials will be paid for or replaced with the same or with a related or updated title plus processing fee.)

**pol-lostfine-tgl** (taglish, policy) [HIT]
- Q: magkano babayaran ko kung nawala o nasira yung libro?
- A: According to the Loan Policies section:
Lost and/or Damaged Php 50.00 processing fee. (Library materials will be paid for or replaced with the same or with a related or updated title plus processing fee.)

**pol-lostfine-fil** (filipino, policy) [HIT]
- Q: magkano po ang babayaran ko kapag nawala o nasira ang aklat?
- A: According to the Loan Policies section:
Lost and/or Damaged Php 50.00 processing fee. (Library materials will be paid for or replaced with the same or with a related or updated title plus processing fee.)

**pol-hours-en** (english, policy) [HIT]
- Q: what time does the LRC open on weekdays?
- A: According to the Hours of Service section:
Monday-Friday (IS): 7:00 am-5:00 pm
Wednesday (SMILES) Per reservation (IS): Wednesday (SMILES) Per reservation
Monday-Friday (COLLEGE) Saturday: 7:00 am-6:00 pm 8:00 am-5:00 pm

**pol-hours-tgl** (taglish, policy) [HIT]
- Q: anong oras magbukas yung library sa weekdays?
- A: According to the Hours of Service section:
Monday-Friday (IS): 7:00 am-5:00 pm
Wednesday (SMILES) Per reservation (IS): Wednesday (SMILES) Per reservation
Monday-Friday (COLLEGE) Saturday: 7:00 am-6:00 pm 8:00 am-5:00 pm

**pol-hours-fil** (filipino, policy) [HIT]
- Q: anong oras po bumubukas ang aklatan tuwing Lunes hanggang Biyernes?
- A: According to the Hours of Service section, the library is open from 7:00 am to 5:00 pm, Monday to Friday.

**pol-hourssat-en** (english, policy) [HIT]
- Q: is the library open on Saturday, and what time?
- A: According to the Hours of Service section:
Monday-Friday (IS): 7:00 am-5:00 pm
Wednesday (SMILES) Per reservation (IS): Wednesday (SMILES) Per reservation
Monday-Friday (COLLEGE) Saturday: 7:00 am-6:00 pm 8:00 am-5:00 pm

**pol-hourssat-tgl** (taglish, policy) [HIT]
- Q: bukas ba yung LRC tuwing Sabado, anong oras?
- A: According to the Hours of Service section:
Monday-Friday (IS): 7:00 am-5:00 pm
Wednesday (SMILES) Per reservation (IS): Wednesday (SMILES) Per reservation
Monday-Friday (COLLEGE) Saturday: 7:00 am-6:00 pm 8:00 am-5:00 pm

**pol-visitor-en** (english, policy) [HIT]
- Q: what do outside visitors need to bring to use the library?
- A: According to the GUIDELINES FOR VISITING USERS for NOCEI and DLSL Alumni section:
5.1. Visiting schedules:
Alumni Mondays to 8:00 am – 5:00 pm
Saturdays
Outside Saturday only 8:00 am - 5:00 pm
researchers

**pol-visitor-tgl** (taglish, policy) [HIT]
- Q: ano po kailangan dalhin ng outside visitor para makapasok sa library?
- A: According to the GUIDELINES FOR VISITING USERS for NOCEI and DLSL Alumni section:
5.1. Visiting schedules:
Alumni Mondays to 8:00 am – 5:00 pm
Saturdays
Outside Saturday only 8:00 am - 5:00 pm
researchers

**pol-visitor-fil** (filipino, policy) [HIT]
- Q: ano po ang kailangang dalhin ng panauhin mula sa labas upang makagamit ng aklatan?
- A: According to the guidelines for visiting users, guests from outside need to present a referral letter or endorsement and a valid ID. Additionally, there is a fee of Php 50.00 per person to use the library. Please note that walk-in researchers are not allowed. For further details, it’s best to check directly with a librarian at the Users and Information Services Counter.

**det-cloud-en** (english, book_details) [HIT]
- Q: what is Cloud native security about?
- A: "Cloud Native Security" by Chris Binnie and Rory McCune provides a detailed examination of how to minimize attack surfaces in cloud native infrastructure. It includes hands-on examples, teaching methods to mitigate threats and address areas of concern leading to security compromises. The book is essential for security professionals aiming to operate secure and reliable cloud native environments. 


**det-cloud-tgl** (taglish, book_details) [HIT]
- Q: ano po ba yung tungkol sa librong Cloud native security?
- A: The book "Cloud Native Security" by Chris Binnie and Rory McCune focuses on minimizing attack surfaces in cloud native infrastructure. It includes hands-on examples to help mitigate threats and address areas that may lead to security issues. The book provides essential information for security professionals to manage secure and reliable cloud native environments. It is available in the General col

**det-java-en** (english, book_details) [HIT]
- Q: tell me about the book Job ready java
- A: "Job Ready Java" by Haythem Balti offers a comprehensive approach to learning Java, making it useful for real-world applications. Based on the Software Guild Java Bootcamp, it covers essential and advanced concepts necessary for entry-level positions in Java development. 

The book is currently available in the library at Aisle 1.

**det-java-tgl** (taglish, book_details) [HIT]
- Q: ano po tungkol dun sa librong Job ready java?
- A: The book "Job Ready Java" by Haythem Balti provides a comprehensive approach to Java that's applicable in real-world scenarios. It is based on the Software Guild Java Bootcamp: Object Oriented Programming course and covers both basic and advanced Java concepts essential for entry-level positions. It is available in the library's General collection on Aisle 1.

**det-java-fil** (filipino, book_details) [HIT]
- Q: ano po ba ang nilalaman ng aklat na Job ready java?
- A: The book "Job Ready Java" by Haythem Balti provides a comprehensive foundational approach to Java, which is immediately applicable in real-world environments. It is based on a well-regarded Java Bootcamp course and covers both basic and advanced Java concepts needed for entry-level Java positions. The book is available in the LRC's General collection on Aisle 1.

**det-notincatalog-en** (english, book_details) [MISS]
- Q: do you have Harry Potter and the Philosopher's Stone?
- A: I'm sorry, but I couldn't find "Harry Potter and the Philosopher's Stone" in the catalog. You might want to try different phrasing or ask a librarian for assistance.

**det-notincatalog-tgl** (taglish, book_details) [MISS]
- Q: meron ba kayong Harry Potter and the Philosopher's Stone?
- A: I'm sorry, but I couldn't find any entries for "Harry Potter and the Philosopher's Stone" in the catalog. You might want to try searching with different phrasing or ask a librarian for assistance.

**acc-due-en** (english, account) [HIT]
- Q: when is my book due?
- A: You currently have one book checked out: "Banking laws of the Philippines annotated," which is due on September 26, 2026. You can see more details in "My Library" in the sidebar.

**acc-due-tgl** (taglish, account) [HIT]
- Q: kailan po due yung libro ko?
- A: Your book "Banking laws of the Philippines annotated" is due on September 26, 2026. You can check "My Library" in the sidebar for further details.

**acc-fines-en** (english, account) [HIT]
- Q: do I have any unpaid fines?
- A: You currently have no unpaid fines. You can check your account details in "My Library" in the sidebar for more information.

**acc-fines-tgl** (taglish, account) [HIT]
- Q: may fine ba ako na hindi pa bayad?
- A: You currently have no outstanding fines. You can check "My Library" in the sidebar for more details.

**acc-history-en** (english, account) [HIT]
- Q: what books have I borrowed and returned before?
- A: You have previously borrowed and returned the following book:

- **Title:** Advanced production and operations management.
- **Author:** Dr. Marmelo V. Abante and Melchor S. Julianes
- **Borrowed on:** August 20, 2026
- **Due date:** September 3, 2026
- **Returned on:** September 2, 2026

For more details, you can check "My Library" in the sidebar.
