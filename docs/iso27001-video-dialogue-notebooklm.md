# ISO 27001 Awareness Videos — Dialogue, Scenarios and Production Guide

**A knowledge source for NotebookLM and for video production.**

This document contains everything needed to produce the ten ISO/IEC 27001:2022 security awareness videos, plus six short videos on threats the platform cannot simulate. For each video it gives the topic, the spoken narration (voiceover dialogue), a real-life dramatised conversation, an AI video-generation prompt, on-screen text, and the single habit the viewer should keep.

It is written to be read by a person, by a video producer, and by NotebookLM.

---

## How to use this file

### If you are a video producer

Go to Part 2 for the ten topic videos and Part 3 for the six threat videos. Each section is self-contained: narration, conversation, visual prompt, on-screen text and takeaway. Part 1 is the production bible — tone, structure, casting and accessibility. Read Part 1 first, once.

### If you are using NotebookLM

Add this document as a source, then ask for what you need. Useful prompts:

- "Create an Audio Overview of the ten awareness video topics, as a conversation between a security lead and a sceptical employee."
- "Turn the section *Physical Security & Tailgating* into a two-host discussion about why holding a door open is a security risk."
- "Write a Study Guide covering the five checks for spotting phishing, with one worked example per check."
- "Summarise all ten topics as a one-page briefing for a line manager who has five minutes."
- "Based on the *Reporting Security Incidents* section, create a briefing document about no-blame reporting culture."

For a short, focused audio piece, ask NotebookLM to work from **one** topic section at a time rather than the whole file.

### If you are building training in the platform

Each topic video below matches a training module already in the shared library by title. The narration is written to the module's existing duration, so it can be recorded without re-cutting the module.

| # | Module title (as stored) | Duration |
|---|---|---|
| 1 | Spotting Phishing & Social Engineering | 4 min |
| 2 | Strong Passwords & MFA | 3 min 30 |
| 3 | Clear Desk, Clear Screen & Acceptable Use | 3 min |
| 4 | Classifying & Handling Information | 3 min 30 |
| 5 | Working Securely Remotely & On Mobile | 3 min 30 |
| 6 | Physical Security & Tailgating | 3 min |
| 7 | Reporting Security Incidents | 3 min |
| 8 | Malware, Ransomware & Safe Downloads | 3 min 30 |
| 9 | Removable Media & Safe Data Transfer | 3 min |
| 10 | Protecting Personal Data & Privacy | 3 min 30 |

---

# Part 1 — Video content guide

## 1.1 What these videos are for

They exist to change one behaviour each. Not to teach a standard, not to list controls, and not to make anyone feel stupid. A viewer who finishes a video should be able to do one specific thing differently the next morning.

Every video therefore ends on a single, repeatable habit. If a script does not end on a habit, it is not finished.

## 1.2 Who is watching

Staff across every department, in offices and at home, with widely different technical confidence. Most are busy, many have been through awareness training before, and a few are quietly convinced that security is somebody else's job.

Write for the busiest, least technical person in the room — and never write down to them. The person who clicks a phishing email is not foolish. They are competent, hurried, and doing four things at once. That is the truth the videos must respect, because a viewer who feels accused stops listening.

## 1.3 The six-beat structure

Every video uses the same shape. Keeping the shape identical across all ten means viewers learn the rhythm and can follow even when the topic is unfamiliar.

| Beat | Time | What happens |
|---|---|---|
| 1. Hook | 0:00–0:15 | A real moment, mid-action. No logo, no music sting, no "welcome to this module". |
| 2. Pressure | 0:15–0:45 | The attacker applies pressure — urgency, authority or curiosity. The viewer should feel the pull. |
| 3. The turn | 0:45–1:15 | Something is slightly wrong. The camera and the character both notice. Do not reveal it yet. |
| 4. The red flags | 1:15–2:15 | Name the specific warning signs, one at a time, on screen. This is the teaching beat. |
| 5. The right move | 2:15–3:15 | Show the correct action, performed calmly and without drama. Verification is boring on purpose. |
| 6. The habit | 3:15–end | One sentence. Repeat it in the same words used elsewhere in the programme. |

## 1.4 Tone rules

- **Calm, not alarming.** Fear produces avoidance, not vigilance. No sirens, no red flashing screens, no ominous drone under the narration.
- **Show competence, not victimhood.** The person who nearly clicks is good at their job. They are simply moving quickly.
- **Never blame.** No scene should imply the viewer is careless. When a character errs, another character responds with understanding, not a lecture.
- **No jargon without a plain-English gloss.** If a word like *phishing*, *ransomware* or *multi-factor authentication* appears, it is explained the first time it is used in that video, in the narration, not in a caption.
- **Local detail is colour, not the lesson.** A `.ng` domain, a payroll run, a dispatch rider or a port clearance notice makes the story real. The security principle must always be the thing being taught.
- **Boring is fine at the end.** The correct action is meant to look unremarkable. Verification is a two-minute phone call, and it should look like one.

## 1.5 The recurring cast

Using the same characters across all sixteen videos builds recognition and cuts casting cost. A viewer who has met Amina in the finance video recognises her instantly in the executive-fraud video.

| Character | Role | Used for |
|---|---|---|
| **Amina Yusuf** | Accounts payable officer, mid-level, capable and busy | Payment fraud, invoice lures, verification |
| **Tunde Balogun** | IT service desk analyst | Password, MFA, VPN and malware scenarios |
| **Ngozi Eze** | HR and payroll administrator | Payroll lures, CV attachments, personal data |
| **Emeka Nwosu** | Operations and logistics coordinator | Courier, port clearance and delivery lures |
| **Bola Adeyemi** | Line manager | Escalation, no-blame culture, supporting a colleague |
| **Mr. Adeyemi** | Chief Financial Officer | Authority impersonation and approval pressure |
| **Chidi Okeke** | Graduate trainee, three months in | The newest person in the room; asks the questions viewers are thinking |
| **The narrator** | Voice of the awareness programme | The single voice that names the red flags and the habit |

Keep the narrator consistent across all videos. That voice is the programme.

## 1.6 Visual language

- **Show the screen.** Phishing lands because it looks ordinary. Record real interfaces at readable size rather than drawing stylised mock-ups.
- **Blur every credential.** Any password field shows greyed placeholder text. Never show a real-looking password on screen.
- **Use the shoulder-height camera.** Over-the-shoulder framing makes the viewer read the email with the character, which is exactly the skill being trained.
- **Hold a beat on the wrong detail.** When a domain is misspelled or a link does not match its text, give the viewer two seconds to spot it before the narrator says it.
- **Warm light for the correct action.** Visually reward verification. Wrong turns are cooler, flatter and faster-cut.
- **No stock footage of hooded figures.** Attackers in these stories are plausible emails and polite phone calls, not silhouettes in a dark room.

## 1.7 AI video-generation prompts

Each video section includes a visual prompt written for a text-to-video tool. Use it as a starting shot list, not a final edit. Prompts are written to avoid generating recognisable real people, real logos or real credentials.

Practical guidance for these tools:

- Generate **3–5 second shots**, then assemble. Long generated clips drift and change faces.
- Keep the same character description in every prompt for a given character, or their face will change between shots.
- Generate screen-content shots separately from people shots. Text-to-video tools render readable email text poorly; screen recordings are better for anything a viewer must read.
- Never generate a shot that shows a real password, a real bank logo or a real colleague's name.

## 1.8 Accessibility

- **Burned-in captions** on every video, plus a transcript.
- **Narration carries the teaching.** A viewer listening with no picture must still get every red flag and the habit.
- **Never rely on colour alone** to indicate danger. Use shape, position and text.
- **Contrast ratio of at least 4.5:1** for all on-screen text.
- Keep on-screen text under **seven words** and on screen for at least **two seconds**.

## 1.9 Localisation and reuse

- Only the **pressure beat** and the **lure** need localising. The red flags and the habit stay the same worldwide.
- Swap the lure, the currency, the authority and the deadline; keep the structure identical.
- Each topic video has a **60-second cutdown** for induction decks and LMS banners. Cut from beats 4 and 6 only — never cut the red flags or the habit.

## 1.10 What these videos must never do

- Never use a real colleague, client or vendor as the villain in a scenario.
- Never gamify a failure. No scores, no leaderboards, no naming who clicked.
- Never present a simulation as if it were a real breach that already happened.
- Never end without the habit.
- Never let the narrator blame the viewer. The line is always "this is what to look for", never "you should have known".

---

# Part 2 — The ten topic videos

---

## Video 1 — Spotting Phishing & Social Engineering

**ISO/IEC 27001:2022:** A.6.3, A.5.7, A.8.7 · **Runtime:** 4 min · **Audience:** all staff
**Learning objective:** After this video, the viewer can name the three pressure tactics and perform the five checks on any suspicious message.

### Voiceover dialogue

**0:00 — Hook.** *[Calm, close, unhurried.]* "This is the most expensive click most organisations will ever make. It looked completely ordinary. That is the whole point."

**0:15 — Pressure.** "Amina works in accounts payable. It is the twenty-eighth of the month, the invoice run closes tomorrow, and she has forty-one unread emails. One of them says an invoice is overdue, and that service will be suspended in twenty-four hours. Nothing in that message is true. But everything in it is designed to feel familiar."

**0:45 — The three pressures.** "Almost every phishing email pushes one of three buttons. **Urgency** — act now, or lose access. **Authority** — it appears to come from your bank, your regulator, or your IT department. **Curiosity** — a confidential document, a salary review, something you were not expecting. Learn the three buttons and you will recognise the shape of the attack before you read a single word."

**1:15 — The five checks.** "Now, five checks that catch almost everything. **One:** does the sender address match who it claims to be? The name can say anything; the address is the truth. **Two:** hover over the link without clicking. Does the destination match the text you are being shown? **Three:** is there pressure to act right now? **Four:** were you expecting this request at all? **Five:** is there an attachment you did not ask for? If any check fails, stop. That is not rudeness. That is your job."

**2:15 — The right move.** "Here is what stopping looks like. Amina does not reply to the email, because replying tells the attacker the address is live. She does not forward it to a colleague to check, because that moves the problem sideways. She opens her contacts, finds the number she already has for that supplier, and she calls it. The supplier has sent no such invoice. The whole thing takes two minutes."

**3:15 — The habit.** "Stop. Check. Verify through a channel you already trust — never one supplied in the email. And if you do click, say so immediately. Reporting fast is how the next person is protected."

### Scenario conversation — "The twenty-eighth"

> **Amina:** *[typing, phone wedged against her ear]* "Forty-one emails. Of course there are."
>
> **Narrator:** "The message says it is from the supplier's accounts team. The display name is right. The logo is right. But the address ends in a domain she has never seen."
>
> **Amina:** *[to herself]* "Twenty-four hours. Suspended service." *[beat]* "Since when do they give twenty-four hours?"
>
> **Chidi:** *[walking past]* "Everything alright?"
>
> **Amina:** "Invoice marked overdue. Says we'll be suspended tomorrow."
>
> **Chidi:** "Is it real?"
>
> **Amina:** *[hovering over the link]* "That's the thing. Look at this. The button says *view invoice*. It actually goes to a different address entirely."
>
> **Chidi:** "So it's fake?"
>
> **Amina:** "Probably. But I'm not going to guess with money." *[picks up the desk phone]* "I've got their number in the supplier file. I'll call them."
>
> **Narrator:** "The supplier had sent no invoice. Ninety seconds, and the whole attack was closed — not just for Amina, but for everyone, because she reported it straight afterwards."
>
> **Amina:** *[hanging up, already typing]* "Tunde. Sending you a phishing report. Don't let anyone pay invoice four-eight-two-one."

### On-screen text

- `Urgency · Authority · Curiosity`
- `Check the address, not the name`
- `Hover the link. Read the destination.`
- `Verify on a number you already have`

### Visual prompt (AI video generation)

> "Interior, open-plan African corporate office, late afternoon, warm window light. A woman in her mid-thirties in a smart blouse sits at a desk crowded with papers, typing quickly, a landline handset balanced between shoulder and ear. Camera over her shoulder, shallow focus, her laptop screen softly out of focus behind her. She pauses, frowns slightly, and leans closer to the screen. Colleagues move in the background, slightly blurred. Realistic, naturalistic lighting, documentary style, no text visible on screens. 4 seconds."

### The one habit

**Stop, check, verify through a channel you already trust.**

---

## Video 2 — Strong Passwords & MFA

**ISO/IEC 27001:2022:** A.5.17, A.8.5 · **Runtime:** 3 min 30 · **Audience:** all staff
**Learning objective:** The viewer understands why length beats complexity, why passwords must be unique, and why a one-time code is never shared with anyone.

### Voiceover dialogue

**0:00 — Hook.** "Tunde has worked on the service desk for six years. He has never once asked a member of staff for their one-time code. This morning, someone did — and it was not Tunde."

**0:15 — Pressure.** "The call is calm and competent. The man says there have been failed sign-in attempts on the account, that he can fix it in two minutes, and that a code is on its way to the phone. All he needs is for her to read it back. It sounds exactly like help. That is why it works."

**0:45 — Length beats complexity.** "Let us deal with passwords first. A short password with a capital letter and a number feels secure. It usually is not. Length is what resists guessing. **river-copper-lantern-88** is far stronger than **Cat7!** and considerably easier to remember. Better still, let a password manager generate and store them, so you never reuse one."

**1:15 — Why uniqueness matters.** "One password for every account means one breach unlocks everything. When a website is compromised, those credentials are tried everywhere else automatically. Unique passwords turn a disaster into an inconvenience."

**1:45 — MFA and the fatigue attack.** "Multi-factor authentication — a second, separate proof of identity beyond your password — blocks most account takeovers. But it has one weakness, and it is a human one. If you approve a prompt you did not start, or read out a code to someone who rang you, you have handed over the second factor yourself. **A code is not information to share. It is a key. You would not post your house key to a stranger who asked politely.**"

**2:30 — The right move.** "So: if a prompt appears that you did not start, deny it and report it, because it means somebody already has your password. If someone rings asking for a code, hang up and call the service desk on the number published internally. A genuine service desk will never object to being verified."

**3:00 — The habit.** "Long, unique, and never approved on someone else's behalf. If you did not start it, deny it."

### Scenario conversation — "The helpful caller"

> *[Phone rings. Ngozi answers.]*
>
> **Caller:** "Good morning, this is Daniel from IT service desk. Am I speaking with Ngozi?"
>
> **Ngozi:** "Speaking."
>
> **Caller:** "We're seeing failed sign-in attempts on your account from outside the country. I can lock it down for you right now. It'll take two minutes."
>
> **Ngozi:** *[concerned]* "Failed attempts? Is my account compromised?"
>
> **Caller:** "Not yet — that's why I'm calling. I'm sending a verification code to your phone now. Read it back to me and I'll reset the session."
>
> **Ngozi:** *[pause]* "You're sending me a code... to give back to you?"
>
> **Caller:** "It's just to confirm it's really you. Standard procedure."
>
> **Ngozi:** *[flat]* "Then it's not confirming anything, is it. I'll call the service desk myself."
>
> **Caller:** "Ma'am, if you hang up the account will be locked—"
>
> *[She hangs up. Dials the published internal number.]*
>
> **Tunde:** "Service desk, Tunde speaking."
>
> **Ngozi:** "Tunde, it's Ngozi. Someone just called claiming to be your team and asked me for a code. And he knew my name."
>
> **Tunde:** "You did exactly the right thing. We never ask for a code — we can see the systems ourselves. I'll get that number blocked and log it. Are you alright?"
>
> **Ngozi:** "I nearly read it out to him."
>
> **Tunde:** "Everyone nearly does. That's why he's still trying."

### On-screen text

- `Length beats complexity`
- `One password per account`
- `A code is a key, not a fact`
- `Never approve a prompt you did not start`

### Visual prompt (AI video generation)

> "Interior, modern office corridor, mid-morning. Close-up of a Black woman in her forties in professional dress holding a mobile phone to her ear, listening intently, slight frown. In the background, out of focus, a service desk and monitors. She lowers the phone slowly and looks at it, thinking. Camera at chest height, natural light from a window on the left. Realistic, documentary style, no text visible. 4 seconds."

### The one habit

**If you did not start it, deny it — and never read out a code.**

---

## Video 3 — Clear Desk, Clear Screen & Acceptable Use

**ISO/IEC 27001:2022:** A.7.7, A.5.10 · **Runtime:** 3 min · **Audience:** all staff, especially office-based
**Learning objective:** The viewer locks their screen whenever they leave it, secures paper records, and keeps work data on approved systems.

### Voiceover dialogue

**0:00 — Hook.** "Nobody plans to leave customer records on a desk. It happens in the four minutes you went to get water."

**0:15 — Who can actually see.** "Here is the uncomfortable part. It is not only colleagues. It is visitors waiting at reception, contractors working on the air conditioning, cleaners after hours, and the person who takes the lift to the wrong floor. None of them are attackers. Any of them can read a screen or photograph a page."

**0:45 — The screen.** "Locking your screen takes one keypress — on Windows, the Windows key plus L; on a Mac, Control, Command and Q. Do it every single time you stand up, even for a moment, even at home, even when nobody else is in. The habit is what protects you, not the judgement call about who might walk past."

**1:15 — The desk.** "Printed documents holding personal data do not belong face down on a desk. Face down is not hidden. They go in a locked drawer or cabinet when not in use, and they are shredded or placed in confidential waste when finished — never the general bin."

**1:45 — Acceptable use.** "Company equipment is provided for work, using approved software. That is not bureaucracy. Unapproved software is one of the most common ways malware gets in, and a shared login destroys the one thing an audit trail depends on: knowing who did what."

**2:15 — The right move.** "So the routine at the end of every day is short. Lock the screen. Clear the desk. Lock the documents away. Take anything sensitive out of the printer tray. Four actions, under a minute."

**2:45 — The habit.** "Lock it when you leave it. And keep work data on work systems."

### Scenario conversation — "The four-minute gap"

> *[Open-plan office, mid-afternoon. Amina stands, stretching.]*
>
> **Amina:** "Tea. Anyone?"
>
> **Chidi:** "Please."
>
> **Amina:** *[walking away]* "Back in four minutes."
>
> *[Her screen is still open — a payroll reconciliation with names, account numbers and salaries visible.]*
>
> *[A visitor in a contractor's jacket is escorted past by a colleague, then pauses at the empty desk, looking at the screen.]*
>
> **Visitor:** "That's a lot of numbers."
>
> **Bola:** *[stepping in, calm but firm]* "Can I help you? You're with the AC team?"
>
> **Visitor:** "Second floor. Waiting for my colleague."
>
> **Bola:** "Reception's downstairs for waiting. Let me walk you back." *[beat, after he goes]* "Amina's screen."
>
> *[Bola reaches over and locks the screen with Windows plus L. Amina returns with two cups.]*
>
> **Amina:** "Oh. I— I was only gone four minutes."
>
> **Bola:** "I know. I timed it." *[not unkind]* "That screen had every salary in the department on it. And a man I've never met was reading it."
>
> **Amina:** *[quietly]* "I lock it at home. I don't know why I don't here."
>
> **Bola:** "Because here it feels like family. That's exactly why it's the harder place to do it." *[beat]* "One key. Windows plus L. Every time you stand up."
>
> **Amina:** "Every time."
>
> **Bola:** "And if you see mine open, do the same to me. No asking."

### On-screen text

- `Windows + L · Control + Command + Q`
- `Face down is not hidden`
- `Lock the drawer, not the lid`
- `Work data stays on work systems`

### Visual prompt (AI video generation)

> "Interior, open-plan office in West Africa, afternoon. A workstation with an unattended laptop, screen glowing, a half-finished cup of tea beside it. In the background a woman in a visitor's jacket pauses, looking towards the screen. A second woman in business dress approaches from the right, mid-stride, hand slightly raised. Camera at standing height, natural office lighting, cool neutral tones. Realistic, documentary style, screen contents not legible. 5 seconds."

### The one habit

**Lock it when you leave it.**

---

## Video 4 — Classifying & Handling Information

**ISO/IEC 27001:2022:** A.5.12, A.5.13, A.5.14 · **Runtime:** 3 min 30 · **Audience:** all staff
**Learning objective:** The viewer can place information in the right class and choose a handling method that matches it.

### Voiceover dialogue

**0:00 — Hook.** "The document was labelled *Confidential*. It was emailed to the wrong person within nine seconds of being labelled."

**0:15 — Why we classify.** "Classification is not paperwork. It is a shared language for how much protection something needs. Four labels, in ascending order of sensitivity: **Public**, **Internal**, **Confidential** and **Restricted**. Public can be shared freely. Internal stays inside the organisation. Confidential is shared only with people who need it, through approved channels. Restricted is the most sensitive tier — think bulk customer records, or encryption keys. Its exposure would cause serious harm."

**1:00 — The label rules what you do.** "The label is not decoration; it decides the action. A Confidential document is not posted on a website, not printed for a reception desk, and not forwarded to a personal email address for convenience. It travels through approved, secure methods, and only to people who need it to do their job."

**1:45 — The tricky part: combination.** "Here is the part people get wrong. Classification can change when information is combined. A list of names is Internal. Add account numbers and it is Confidential. Add health information and it is Restricted — not because any single field is dangerous, but because together they identify a person and expose them."

**2:30 — The right move.** "When you are unsure, the rule is simple and it never fails: **treat it as Confidential and ask the owner.** Protect first, clarify second. Nobody has ever been criticised for protecting information too carefully."

**3:00 — The habit.** "If you do not know the label, treat it as Confidential and ask."

### Scenario conversation — "The salary review"

> *[Ngozi at her desk. An email notification appears: a document has been shared with her.]*
>
> **Ngozi:** "Confidential — Q3 Salary Review. I didn't ask for that."
>
> *[She opens it. A page branded with the company logo asks her to sign in to view.]*
>
> **Chidi:** *[passing]* "Salary review? Whose?"
>
> **Ngozi:** "Nobody's yet. It wants me to log in."
>
> **Chidi:** "Well, it's internal, isn't it? It's got our logo on it."
>
> **Ngozi:** *[dryly]* "Our logo is on the website too. Anyone can copy a logo." *[beat]* "And look — this isn't our document system. Our files live in the shared drive. I've never seen this address before."
>
> **Chidi:** "So where did it come from?"
>
> **Ngozi:** "That's the question, isn't it. If I type my password in there, I've just handed someone my account."
>
> *[She picks up the phone.]*
>
> **Ngozi:** "Tunde? Ngozi. I've had a document share that wants my login. It's branded, but it's not our system. Can you look before I touch it?"
>
> **Tunde:** "Don't touch it. That's textbook credential harvesting — the branded page is the whole trick. Send me the address."
>
> **Ngozi:** "Sending now." *[beat]* "It said the link was unique to me. That was the bit that felt off. Why would it need to say that?"
>
> **Tunde:** "To make you feel chosen. That's curiosity doing the work." *[beat]* "Good catch. And Ngozi — thank you for asking instead of guessing."

### On-screen text

- `Public · Internal · Confidential · Restricted`
- `The label decides the handling`
- `Combination raises the class`
- `Unsure? Treat as Confidential and ask`

### Visual prompt (AI video generation)

> "Interior, private office, daytime. A Black woman in her late thirties sits at a tidy desk, hand resting on a mouse, reading her screen with a slightly narrowed, evaluating expression. A younger male colleague stands in the doorway holding a folder, mid-conversation. Camera slightly to the side, framing both. Warm afternoon light from a window. Realistic, naturalistic documentary style, screen contents not legible. 4 seconds."

### The one habit

**If you do not know the label, treat it as Confidential and ask.**

---

## Video 5 — Working Securely Remotely & On Mobile

**ISO/IEC 27001:2022:** A.6.7, A.8.1, A.7.9 · **Runtime:** 3 min 30 · **Audience:** remote, hybrid and travelling staff
**Learning objective:** The viewer connects through approved tools on untrusted networks, protects the device in public, and reports a lost device immediately.

### Voiceover dialogue

**0:00 — Hook.** "The coffee shop Wi-Fi is free. So is the view of your screen from the next table."

**0:15 — Working away from the office.** "Working remotely means working on networks you do not control. A hotel, an airport, a co-working space, a friend's flat. The risk is not that these networks are malicious. It is that you cannot tell, and neither can anyone else."

**0:45 — Use the VPN.** "A VPN — a virtual private network — encrypts your connection so that anyone sharing that network sees gibberish rather than your work. Connect through the company VPN before you open work systems. And be careful with the page a public network shows you before it lets you online: a captive portal only ever needs you to accept terms. If it asks for your work email and password, close it and use your phone hotspot instead."

**1:30 — The device travels with you.** "Your device is now part of the risk. Keep the screen out of sight of strangers — a privacy filter costs less than a breach. Never leave a laptop unattended, even for a moment, even in an airport lounge. And keep work data in approved company systems rather than personal cloud drives or personal messaging apps."

**2:15 — If it is lost.** "If a device goes missing, report it immediately. Not tomorrow, not after you have looked in your bag twice. Immediate reporting lets IT erase the device remotely, cut off email and multi-factor access, and issue a replacement. Waiting is the only mistake that cannot be undone."

**2:50 — The habit.** "Company tools, company systems, and the VPN on any network you do not control."

### Scenario conversation — "The hotel lobby"

> *[Hotel lobby, evening. Emeka opens his laptop. A sign on the wall reads: 'Free Wi-Fi — connect to LOBBY-GUEST'.]*
>
> **Emeka:** *[to himself]* "Right. Deadline's at seven."
>
> *[He connects. A page appears: 'Sign in to continue'. Two fields — work email, password.]*
>
> **Emeka:** *[pause]* "Why would a hotel want my work email?"
>
> *[He closes the lid, takes out his phone.]*
>
> **Bola:** *[on the phone]* "Emeka. You're not still at that hotel?"
>
> **Emeka:** "I am, and the Wi-Fi just asked for my work login. It felt wrong so I stopped."
>
> **Bola:** "It is wrong. That's a fake login page — the network isn't the hotel's at all. Somebody's sitting on it. Don't connect again."
>
> **Emeka:** "So how do I send the clearance documents?"
>
> **Bola:** "Hotspot from your phone, then the VPN, like you would at home. Slower, but nobody's reading it."
>
> **Emeka:** "Right. And the laptop stays with me — I'm not leaving it at the desk."
>
> **Bola:** "Good. And Emeka — if it had been a real hotel portal, it would have asked you to accept terms. Nothing more. That's the tell."
>
> **Emeka:** *[typing]* "Noted. I'll flag the network to IT as well, in case anyone else from the team is here this week."
>
> **Bola:** "That's the bit most people skip. Thank you."

### On-screen text

- `VPN on any network you do not control`
- `A captive portal only asks you to accept terms`
- `Screen out of sight · device in hand`
- `Lost device? Report it now, not later`

### Visual prompt (AI video generation)

> "Interior, hotel lobby at dusk, warm ambient lighting, low sofas and a marble side table. A Black man in his forties in a business shirt sits with a laptop open in front of him, hand hovering, frowning slightly at the screen. A phone lies beside the laptop. Other guests visible far in the background, out of focus. Camera at seated eye level, shallow depth of field. Realistic documentary style, screen contents not legible. 4 seconds."

### The one habit

**Company tools, company systems, VPN on any network you do not control.**

---

## Video 6 — Physical Security & Tailgating

**ISO/IEC 27001:2022:** A.7.1, A.7.2, A.7.4, A.7.6 · **Runtime:** 3 min · **Audience:** all staff, especially reception and office-based
**Learning objective:** The viewer badges in individually, escorts visitors, and can challenge an unfamiliar person politely.

### Voiceover dialogue

**0:00 — Hook.** "The door was locked. The building was secure. Somebody held it open to be polite."

**0:15 — What tailgating is.** "Tailgating is following an authorised person through a secure door without badging in yourself. It requires no technical skill, no equipment and no nerve. It requires only your good manners and a full pair of hands."

**0:45 — Why it works.** "It works because refusing feels rude. The person is carrying a box, or wearing a delivery jacket, or says the estate gate already let them in. Every one of those things is easy to arrange. And once inside, an unattended laptop, an open office or a filing cabinet is available to them."

**1:30 — Challenging without conflict.** "You do not need to be confrontational to be secure. Three sentences do the job. *'I don't think we've met — are you here to see someone?'* *'Let me walk you to reception and they'll sign you in.'* *'I'll find someone who can help you.'* All three are polite. All three maintain control of the door."

**2:00 — Visitors and badges.** "Visitors should be signed in, given a visitor badge, and escorted in secure areas. That is not distrust — it is accountability, so the organisation knows who was where. And your own badge is personal. Lending it breaks the only record of who entered the building."

**2:30 — The habit.** "Everyone badges in individually, and every visitor is signed in and escorted."

### Scenario conversation — "Hands full"

> *[Reception area, 5:45 pm. Staff are leaving. A man in a delivery jacket carries a heavy box towards the secure door.]*
>
> **Delivery man:** "Excuse me — could you get the door? My hands are full and this is urgent."
>
> **Chidi:** *[half-turning, instinctively]* "Oh — sure, let me—"
>
> **Receptionist:** *[calmly, stepping in]* "I'll take that. Are you delivering to someone specific?"
>
> **Delivery man:** "Second floor. Finance."
>
> **Receptionist:** "Then let's get you signed in first. It's a thirty-second thing and then someone can take you up." *[indicating the desk]* "Name and company, and who it's for?"
>
> **Delivery man:** *[hesitating]* "It's just a delivery. I'll leave it here—"
>
> **Receptionist:** "We can't take unregistered packages, I'm afraid. And I'd rather not have you carrying that up the stairs. Who's it for?"
>
> **Delivery man:** "I'll... come back."
>
> *[He leaves. Chidi is still standing there.]*
>
> **Chidi:** "He seemed genuine."
>
> **Receptionist:** "He might have been. But now I know he's not on any list, not expected, and didn't want to give a name. That's not a delivery, that's a way in." *[beat]* "And you were about to hold the door for him."
>
> **Chidi:** "I didn't want to be rude."
>
> **Receptionist:** "Nobody does. That's the entire attack." *[beat]* "You can be kind and still say *let me walk you to reception*. I do it forty times a week."

### On-screen text

- `Everyone badges in individually`
- `"Let me walk you to reception"`
- `Visitors: signed in, badged, escorted`
- `Your badge is yours alone`

### Visual prompt (AI video generation)

> "Interior, modern office reception with a glass security door, late afternoon, staff leaving in the background. In the foreground a man in a delivery jacket holds a large cardboard box, turning towards the door. A receptionist in a blazer stands at a desk on the right, one hand raised calmly, mid-sentence. A young man in a shirt stands between them, uncertain. Natural light, warm neutral palette. Realistic documentary style. 5 seconds."

### The one habit

**Everyone badges in individually — and it is always fine to walk a stranger to reception.**

---

## Video 7 — Reporting Security Incidents

**ISO/IEC 27001:2022:** A.5.24, A.5.25, A.5.26, A.6.8 · **Runtime:** 3 min · **Audience:** all staff
**Learning objective:** The viewer knows what counts as an incident, reports it immediately, and trusts that reporting carries no blame.

### Voiceover dialogue

**0:00 — Hook.** "He had already typed his password into the page before he understood what the page was. Then he sat there for six minutes, deciding whether to tell anyone."

**0:15 — What counts as an incident.** "First, widen your idea of what an incident is. A lost work phone. A customer list emailed to the wrong person. A link you clicked and wish you had not. A USB stick you plugged in. A colleague being pressured for a payment. A visitor who would not sign in. None of these are certain disasters. All of them are things security needs to know about within the hour."

**1:00 — Why speed matters.** "The reason is arithmetic. Every minute an attacker has your session, they are reading mail, adding forwarding rules, and enrolling their own device for future access. Report in five minutes and the session is killed before they settle in. Report in five days and you are investigating a breach instead of closing an incident."

**1:40 — Responding to a mistake.** "If you have entered credentials somewhere, the sequence is short. Change that password, and anywhere you reused it. Check that multi-factor authentication is on. If a prompt for a login you did not start appears on your phone, deny it. Then report it, so the link can be blocked for everyone else."

**2:15 — No blame.** "And this is the part that matters most. **You will not be punished for reporting.** Not for clicking, not for entering a password, not for raising something that turns out to be nothing. Our culture is deliberately no-blame, because the alternative has been tested everywhere and it fails: when people fear reporting, incidents go quiet, and quiet incidents become expensive ones."

**2:45 — The habit.** "Report in five minutes, not five months — including when you are not sure. Especially when you are not sure."

### Scenario conversation — "Six minutes"

> *[Chidi at his desk, staring at his screen. He is very still.]*
>
> **Chidi:** *[quietly]* "Oh no. Oh no no no."
>
> *[On screen: a generic portal page reading 'Password updated successfully'. His work email is in the corner.]*
>
> *[He sits back. Checks the time. Sits forward again. Opens his email. Closes it.]*
>
> **Chidi:** *[to himself]* "Three months in. Three months and I get phished."
>
> *[Bola walks past, then stops.]*
>
> **Bola:** "You alright? You've gone a bit grey."
>
> **Chidi:** "I'm fine. Fine."
>
> **Bola:** *[sitting down on the corner of the desk]* "Chidi."
>
> **Chidi:** *[after a beat]* "I put my password into a link. An email about my mailbox being full. It looked completely normal."
>
> **Bola:** "When?"
>
> **Chidi:** "Six minutes ago. Maybe seven."
>
> **Bola:** "Good. That's the best news I've had today." *[standing]* "Tunde — we need you. Chidi, stay here, don't touch the machine."
>
> **Chidi:** "Are you going to report it? Is it going to go to HR?"
>
> **Bola:** "It's going to the service desk, and it's logged as an incident with no name attached to the fault. What it is *not* is a disciplinary. You've just told me within seven minutes — that's faster than most of the company would manage."
>
> **Tunde:** *[arriving]* "Right. Password reset, MFA check, and I'll pull any forwarding rules he didn't create. Then we block the link for everyone."
>
> **Chidi:** "The link's already in people's inboxes. I saw it in the shared—"
>
> **Tunde:** "That's exactly why we start now." *[beat]* "For what it's worth, I clicked one of these in my second week. Everyone who is honest has a version of this story."

### On-screen text

- `Lost device · wrong recipient · clicked link · odd payment request`
- `Report in five minutes, not five months`
- `Change the password, check MFA, then report`
- `No blame. Ever.`

### Visual prompt (AI video generation)

> "Interior, open-plan office, late morning. A young Black man in his twenties sits rigid at a desk, both hands flat on the desk either side of a keyboard, staring at a monitor with a stricken expression. An older woman in a blazer sits on the corner of the desk facing him, leaning forward, speaking calmly. Camera at seated eye level from the side, natural window light, shallow depth of field. Realistic, restrained documentary style, screen contents not legible. 5 seconds."

### The one habit

**Report in five minutes, not five months.**

---

## Video 8 — Malware, Ransomware & Safe Downloads

**ISO/IEC 27001:2022:** A.8.7, A.8.19, A.8.13 · **Runtime:** 3 min 30 · **Audience:** all staff
**Learning objective:** The viewer never enables macros on unexpected files, installs software only from approved sources, and knows the first action when a device misbehaves.

### Voiceover dialogue

**0:00 — Hook.** "The document opened perfectly. Then it asked for permission to run code. And it was given."

**0:15 — What malware and ransomware are.** "Malware is software written to do something you did not agree to — steal data, watch what you type, or quietly open a way in. **Ransomware** is a specific kind: it encrypts your files and demands payment to unlock them. It is not a technical problem that happens to other companies. It arrives looking like a job application, an invoice, or a voicemail."

**0:55 — The three ways in.** "Three routes cause most of it. **Attachments** that ask you to *enable content* or *enable macros* — that permission runs code, and it is the single most common trigger. **Fake installers** — free software from a random site, or a 'cracked' version of a paid tool. And **malicious advertisements** on otherwise legitimate pages."

**1:40 — Safe downloads.** "So: software comes from approved sources only. If you need a tool, ask IT. It is a two-minute conversation, and it is the difference between an installed application and an installed back door."

**2:10 — A device behaving oddly.** "If a machine suddenly slows, files start renaming themselves, or the fan runs hard for no reason, treat it as urgent. The first move is to disconnect from the network — unplug the cable or turn off Wi-Fi — to stop anything spreading. Then report it immediately. Do not restart repeatedly hoping it clears. Do not pay anything."

**2:50 — Backups.** "And know why backups matter: they are the reason a ransom demand has no leverage. If data can be restored, there is nothing to pay for."

**3:10 — The habit.** "No unrequested attachments, no macros, no unapproved software."

### Scenario conversation — "The attached CV"

> *[Ngozi at her desk, reviewing applications.]*
>
> **Ngozi:** *[to herself]* "Accounts Officer. Nineteen applications, eighteen PDFs..." *[pause]* "...and one Word document."
>
> *[She opens it. A banner appears across the top: 'PROTECTED VIEW — Enable Editing' and beneath it 'Enable Content'.]*
>
> **Ngozi:** *[reading aloud]* "Macros have been disabled. Enable content to view this document properly."
>
> *[Her hand moves to the mouse. She stops.]*
>
> **Ngozi:** "Why does a CV need macros?"
>
> *[She picks up the phone.]*
>
> **Ngozi:** "Tunde? Ngozi in HR. I've got a CV that's a macro-enabled document asking me to enable content."
>
> **Tunde:** "Do not enable it. That's the whole attack — the document's harmless until you give it permission to run code, and then it installs itself. Is it from a real applicant?"
>
> **Ngozi:** "It's a job application. Free webmail address, which isn't unusual. But every other applicant sent a PDF."
>
> **Tunde:** "Right. Forward it to the service desk without opening it further, and I'll detonate it in a sandbox and block the sender. Can you also check whether anyone else in HR got one?"
>
> **Ngozi:** "Already looking. Two others have the same subject line."
>
> **Tunde:** "That's a targeted run at HR, then — they know you open attachments all day. Nice catch, Ngozi. Genuinely."
>
> **Ngozi:** *[exhaling]* "I nearly clicked it. My hand was on the mouse."
>
> **Tunde:** "The pause is the skill. That's all it is."

### On-screen text

- `"Enable content" = permission to run code`
- `Only install from approved sources`
- `Odd behaviour? Disconnect, then report`
- `Backups remove the ransom's leverage`

### Visual prompt (AI video generation)

> "Interior, HR office, daytime. Close-up over the shoulder of a Black woman in her late thirties at a desk, both hands beside a keyboard, one hand hovering over a mouse, frozen mid-motion. On the monitor, a generic document with a warning banner — text deliberately not legible. Her expression shifts from intent to suspicion. Warm desk lamp light, soft shadows. Realistic, restrained documentary style, no readable text. 4 seconds."

### The one habit

**No unrequested attachments, no macros, no unapproved software.**

---

## Video 9 — Removable Media & Safe Data Transfer

**ISO/IEC 27001:2022:** A.7.10, A.8.12, A.5.14 · **Runtime:** 3 min · **Audience:** all staff, especially operations and anyone sending files externally
**Learning objective:** The viewer never plugs in unknown media, and uses approved encrypted channels to move sensitive data.

### Voiceover dialogue

**0:00 — Hook.** "A USB stick in a car park is not a lost item. It is a delivery."

**0:15 — The found-device attack.** "Leaving labelled USB drives where staff will find them is an old attack that still works, because it recruits two of the best human qualities: curiosity and helpfulness. The label says *Payroll 2026* or *Confidential*. You plug it in to find the owner, and the drive does the rest. **Never plug in unknown media. On any device. For any reason.** Hand it to security in a sealed bag."

**0:55 — Why personal drives are risky.** "The second risk is the everyday one: moving work data on a personal USB stick or a personal cloud account. Portable media gets lost. When it does, it is not just the drive that is gone — it is unencrypted customer data sitting in a car park or a taxi, and it is a reportable breach."

**1:35 — The right way to send a file.** "For sending sensitive files to a partner, three things must be true. It goes through an **approved, encrypted** transfer service. It goes **only to the intended recipient**, verified by name rather than by an address in an email. And the recipient's **need to have it** is real. If a file holds customer data, ask whether it could be sent with fields removed — the least data that does the job is always the safest option."

**2:25 — If a drive is lost.** "And if a drive holding work data goes missing, report it immediately. It starts a clock: the data may need to be assessed, and in some cases the loss must be notified. A quiet replacement does not close that clock — it just delays it."

**2:50 — The habit.** "Never plug in unknown media — and move data through approved, encrypted channels only."

### Scenario conversation — "Found in the car park"

> *[Office car park, morning. Emeka picks something up off the ground beside his car.]*
>
> **Emeka:** "Hello. What are you, then."
>
> *[He turns it over. A sticker reads: 'PAYROLL 2026 — CONFIDENTIAL'.]*
>
> *[Later, in the operations office.]*
>
> **Emeka:** "Found a flash drive in the car park. It says payroll on it. Someone's going to be missing this."
>
> **Chidi:** "Just plug it in and see whose it is. There'll be a name on a file or something."
>
> **Emeka:** *[holding it up, not reaching for the port]* "Actually — no. This is the bit they teach you. A dropped drive is how you get infected. You plug it in to be helpful and it runs something."
>
> **Chidi:** "Even if it's genuinely lost?"
>
> **Emeka:** "Especially then. I can't tell the difference, so I don't guess. It goes to security in a bag." *[beat]* "Also — whoever's data that is, I don't want to be the reason it got copied. That's not my payroll to look at."
>
> *[Later, with a partner file to send.]*
>
> **Emeka:** "Right. The clearance documents for the Lagos partner. Where do I send them?"
>
> **Chidi:** "Just email them, it's only a few pages."
>
> **Emeka:** "It's got customer names and account numbers on it. It goes through the secure transfer link, and it goes to the address we already have on file — not the one that came in the email this morning."
>
> **Chidi:** "That's the same thing, isn't it?"
>
> **Emeka:** "No. One of them I've verified. The other one I've been told to trust." *[beat]* "There's a difference. It's the whole difference."

### On-screen text

- `A found USB is a delivery, not a lost item`
- `Never plug in unknown media`
- `Approved · encrypted · verified recipient`
- `Lost drive = report it, start the clock`

### Visual prompt (AI video generation)

> "Exterior, office car park, early morning, low warm sun and long shadows. A Black man in his forties in a business shirt crouches beside a parked car, holding a small USB stick up to the light, examining it. A sticker on the drive is visible but its text is not legible. His car door stands open. Camera low, at waist height, shallow depth of field. Realistic, cinematic documentary style. 4 seconds."

### The one habit

**Never plug in unknown media — and transfer through approved, encrypted channels only.**

---

## Video 10 — Protecting Personal Data & Privacy

**ISO/IEC 27001:2022:** A.5.34, A.8.11, A.5.12 · **Runtime:** 3 min 30 · **Audience:** all staff, especially HR, finance, customer operations
**Learning objective:** The viewer applies data minimisation, need-to-know access, secure disposal and identity verification before disclosing personal data.

### Voiceover dialogue

**0:00 — Hook.** "The salary had already been redirected before anyone noticed the account number had changed."

**0:15 — What personal data is.** "Personal data is any information that identifies a living person — alone, or combined with other information. A name on its own may not identify anyone. A name with a phone number, an account number, a photograph or a date of birth usually does. In Nigeria that includes identifiers like a BVN or a NIN. Once data can point to one individual, it is personal data, and it is protected by law as well as by policy."

**1:00 — Three principles.** "Three principles cover most of it. **Collect only what you need** — data you never collected cannot leak. **Share only with people who need it** — access is need-to-know, and it should be tied to a named person so every view can be accounted for. **Keep it only as long as you need it** — personal data has a retention period, and holding it forever 'just in case' is not caution, it is exposure."

**1:50 — Verify before you disclose.** "And the one that causes the most damage when it is missed: **verify identity before you disclose anything.** A caller who sounds official is not verification. A caller who knows the account number is not verification — attackers often have it. Follow the process, and if the process cannot be completed, disclose nothing. Not a hint, not a partial confirmation. The fact that an account exists is itself information."

**2:40 — Secure disposal.** "When data is finished with, dispose of it properly. Paper is shredded or goes into confidential waste. Electronic records are deleted under the retention rule, not left in a folder nobody owns. And a spreadsheet of personal data does not belong in a personal cloud drive, or on a personal phone, however convenient that is."

**3:05 — The habit.** "Collect only what you need, share only with those who need it, and verify before you disclose."

### Scenario conversation — "Confirm your account"

> *[Ngozi arrives at her desk. An email is waiting.]*
>
> **Ngozi:** *[reading]* "Confirm your salary account before payroll closes... mismatch on your bank details... may delay your payment this month."
>
> *[She sits down slowly.]*
>
> **Ngozi:** "Delay my payment."
>
> *[She starts to reach for the mouse, then stops. Reads again.]*
>
> **Ngozi:** "I've been paid into the same account for six years. There is no mismatch."
>
> *[She picks up the phone.]*
>
> **Ngozi:** "Tunde. Ngozi. I've got a payroll email saying my bank details don't match and my salary could be delayed."
>
> **Tunde:** "Did you click it?"
>
> **Ngozi:** "No. I was about to. Then I thought — payroll doesn't email about accounts. Payroll *is* me."
>
> **Tunde:** "That right there is the whole defence. Forward it to me. It's a redirect attack: they want you to re-enter your bank details so the next salary run pays them instead."
>
> **Ngozi:** *[quietly]* "And if I'd clicked, my salary would have gone to someone else. And I'd have thought I was fixing a problem."
>
> **Tunde:** "Which is why they picked the one thing nobody ignores. Money you're expecting."
>
> **Ngozi:** "Two things, then. I'm reporting it — and I'm checking whether anyone else in HR got the same email. If it came to me, it probably went to everyone who can change a bank detail."
>
> **Tunde:** "Do it. And Ngozi — you verify bank details by phone, on a number you already hold. Never a number in the message. That's the rule that stops all of these."
>
> **Ngozi:** "Already there. I'm not approving a change like that on the strength of an email. Not this month, not any month."

### On-screen text

- `Any data that identifies a person`
- `Collect only what you need`
- `Need-to-know · retention · secure disposal`
- `Verify identity before you disclose anything`

### Visual prompt (AI video generation)

> "Interior, HR office, early morning, cool natural light. A Black woman in her thirties sits down at a desk with her coat still on, reading her monitor with an expression of quiet alarm. A handbag rests on the desk. She reaches towards the mouse, then withdraws her hand and picks up a desk phone instead. Camera static, medium shot, slightly over the desk. Realistic, naturalistic documentary style, screen contents not legible. 5 seconds."

### The one habit

**Collect only what you need, share only with those who need it, and verify before you disclose.**

---

# Part 3 — Six short videos for non-email threats

These six threats cannot be delivered by the platform, because it sends email only. They are taught rather than simulated, and are used in briefings, in the quiz bank and on the teachable-moment pages. Each runs 90 to 120 seconds and uses a shorter version of the same six-beat shape: hook, what it is, red flags, right move, habit.

---

## Video 11 — SMS Phishing (Smishing)

**Threat:** fraudulent text message · **Related topics:** 2 (Passwords & MFA), 10 (Personal data) · **Runtime:** 90 sec

### Voiceover dialogue

**0:00 — Hook.** "Your bank already has your phone number. So why is it texting you from a number you have never seen?"

**0:10 — What it is.** "Smishing is phishing sent by text message. It works for one reason: a text feels personal and immediate. You read it in three seconds, standing in a queue, without the pause an email sometimes gets."

**0:30 — Red flags.** "The signs are consistent. A message you did not expect, from a sender you cannot verify. A threat to something you need — a blocked card, an expiring SIM registration, a suspended account. A link that is shortened or looks almost right but not quite. And a request to act *now*, before you have time to think. Text-message links also cannot be inspected the way an email link can, because there is nothing to hover over."

**0:55 — The right move.** "So never act on a link in an unsolicited text. Open the banking app directly, or call the number printed on your card. If a message pressures you, that pressure is the signal, not the reason to hurry."

**1:20 — The habit.** "Never tap a link in an unexpected text. Go to the app yourself."

### Scenario conversation

> **Chidi:** *[reading his phone]* "Your debit card has been blocked due to unusual activity. Verify now to reactivate."
>
> **Chidi:** *[to Emeka]* "My card's blocked? I used it an hour ago."
>
> **Emeka:** "Who's it from?"
>
> **Chidi:** "It just says YOURBANK. And there's a link."
>
> **Emeka:** "Is that your bank's actual name?"
>
> **Chidi:** *[pause]* "...No. My bank is not called *YOURBANK*."
>
> **Emeka:** "There you go. Open the app. If the card were blocked, the app would say so before any text did."
>
> **Chidi:** *[tapping]* "App says the card is fine. Active. No restrictions."
>
> **Emeka:** "Then the text is the only thing that's broken. Report it and delete it. And don't reply — replying tells them the number is live."

### On-screen text

- `Never tap a link in an unexpected text`
- `Your bank already has your number`
- `Open the app, not the link`

### Visual prompt (AI video generation)

> "Interior, open-plan office break area, daytime. Close-up of a young Black man's hands holding a smartphone, thumb hovering over the screen, hesitating. His face is partially visible above the phone, brow slightly furrowed. Another man leans in from the right, mid-sentence, pointing at the screen. Bright natural light from a window. Realistic, naturalistic documentary style, phone screen contents not legible. 3 seconds."

### The one habit

**Never tap a link in an unexpected text.**

---

## Video 12 — Voice Phishing (Vishing) Against Payments

**Threat:** phone call authorising a fraudulent payment · **Related topics:** 1 (Phishing), 9 (Data transfer) · **Runtime:** 120 sec

### Voiceover dialogue

**0:00 — Hook.** "A payment was authorised by two people. Both of them had been spoken to by the same stranger."

**0:10 — What it is.** "Vishing is social engineering conducted by voice. Against a payments team it follows a predictable shape: the caller is warm, calm and plausible. They reference real invoices or real purchase orders. They create a deadline that is measured in hours, and they explain exactly why the normal verification step cannot be used this time."

**0:35 — Why it beats an email.** "A phone call has two advantages over an email. There is no header to inspect, no domain to check, and no hover. And a live human being can answer your objection in real time, which is precisely what a phishing email cannot do."

**0:55 — Red flags.** "So listen for these. The caller explains why you cannot call back on the published number. The request is urgent and falls just outside the normal process. The amount is large, or the payee is new. And the closing line that should stop everything: *keep this between us for now.*"

**1:20 — The right move.** "The rule does not bend for a good story. Any change to payment details, or any new payee, is verified by calling a number already on file — and for a large or unusual payment, by two people separately. Anyone genuine will expect that. Anyone who objects to it is the reason the rule exists."

**1:50 — The habit.** "Any change of bank details is verified by voice, on a number you already hold."

### Scenario conversation

> *[Amina's desk phone rings.]*
>
> **Caller:** "Amina, good morning — David from Meridian Supplies. We spoke in March about the quarterly order."
>
> **Amina:** "We did. How can I help?"
>
> **Caller:** "Slightly awkward one. Our bank has changed, and there's an invoice due on Friday that will bounce if it goes to the old account. I can send the new details now."
>
> **Amina:** "I'd need to verify that before changing anything."
>
> **Caller:** "Normally yes — but our finance director is travelling today and unreachable. That's the only reason I'm asking you to move on this. It's a small window."
>
> **Amina:** "So the person who'd normally confirm it is unavailable."
>
> **Caller:** "Correct. It's frustrating, I know."
>
> **Amina:** *[evenly]* "That's the part that decides it for me. If the only person who can authorise a change of bank details is unavailable, then the change waits. That's not me being difficult — that's how we protect both of us."
>
> **Caller:** "Amina, the invoice—"
>
> **Amina:** "Will still be here on Monday. I'll call your office on the number we have on file and confirm with whoever picks up."
>
> *[She hangs up, dials the supplier's published number.]*
>
> **Amina:** *[to colleague beside her]* "Nothing wrong with that number. But nothing right with it either. And he didn't want me calling back. That's the answer."

### On-screen text

- `No header, no domain, no hover`
- `"I cannot be reached to confirm" is the tell`
- `Bank-detail changes: verify by voice`
- `Two people, separately`

### Visual prompt (AI video generation)

> "Interior, accounts office, morning. A Black woman in her thirties at a desk holding a landline handset to her ear, listening intently, expression composed but watchful. Her free hand rests on a folder of paperwork. Computer monitor out of focus behind her. Slightly cool daylight. Camera at seated eye level, medium close-up. Realistic, restrained documentary style. 4 seconds."

### The one habit

**Any change of bank details is verified by voice, on a number already on file.**

---

## Video 13 — QR Code Phishing (Quishing)

**Threat:** malicious QR code · **Related topics:** 1 (Phishing), 8 (Malware) · **Runtime:** 90 sec

### Voiceover dialogue

**0:00 — Hook.** "A QR code is a link you cannot read. That is the entire trick."

**0:10 — What it is.** "Quishing is phishing delivered by QR code — on a poster in a lift, a sticker on a parking meter, a laminated notice in reception, or an image inside an email. You scan it with your phone, and your phone obeys. A code in the physical world has one extra advantage over a link: there is nothing to hover over, and no way to read where it goes before you commit."

**0:35 — Red flags.** "Be suspicious when a code appears in a public place, or where one was not there last week. When the page it opens asks for a work email, a password, or an employee number. When the notice uses a deadline you recognise from other lures — *before Friday*. And when a sticker sits on top of an older, original sign, which is a common way of replacing a genuine code."

**1:00 — The right move.** "Check the web address before you type anything. Better still, do not scan at all: type the address the organisation has published, or use the app you already have. And treat a physical notice that asks for credentials as something to report, not something to complete."

**1:25 — The habit.** "A QR code is a link you cannot read — check the address, or type it yourself."

### Scenario conversation

> *[Lift lobby. A laminated sign reads: 'New staff parking payment system — scan to register your vehicle before Friday.' A QR code fills the lower half. Emeka scans it.]*
>
> **Emeka:** *[looking at his phone]* "Employee number, email, password. For parking?"
>
> **Chidi:** "It's the new system. HR sent something about it, didn't they?"
>
> **Emeka:** "Did they?"
>
> **Chidi:** "I think so. It looks official."
>
> **Emeka:** *[still looking at the phone]* "It does. But why does a parking register need my work password? And look — the address at the top isn't ours. It's close. But it isn't ours."
>
> **Chidi:** "Maybe a supplier's system."
>
> **Emeka:** "Maybe." *[pocketing the phone]* "I'll walk over to reception and ask. It's a four-minute question."
>
> **Chidi:** "You're not going to just fill it in?"
>
> **Emeka:** "I'd be typing my work password into a page I found on a wall. No." *[beat]* "And I'm photographing the sign before I touch it again. If it's fake, other people are scanning it right now."

### On-screen text

- `A QR code is a link you cannot read`
- `Nothing to hover over`
- `Type the address yourself`

### Visual prompt (AI video generation)

> "Interior, modern office lift lobby, daylight from glass doors. A laminated sign mounted on a wall with a large square QR code in its lower half — code rendered but not scannable. In the foreground, a Black man in his forties holds up a smartphone towards the sign, frowning slightly at the phone. Another man stands beside him, looking at the poster. Camera at chest height, neutral lighting. Realistic documentary style, no legible text. 3 seconds."

### The one habit

**A QR code is a link you cannot read.**

---

## Video 14 — Impersonation on Chat Apps

**Threat:** executive impersonation on WhatsApp or similar · **Related topics:** 10 (Personal data), 7 (Incident reporting) · **Runtime:** 120 sec

### Voiceover dialogue

**0:00 — Hook.** "The message came from the Managing Director. The number was not the Managing Director's. Nobody checked, because the message said not to."

**0:10 — What it is.** "Attackers impersonate senior people on chat apps — WhatsApp, Telegram, or whichever messaging tool a team actually uses for work. The display name is set to a real executive's name. The photograph is copied from LinkedIn. The number is not one you have ever saved."

**0:35 — Why it works on chat.** "Chat is informal by nature, and that is what makes it work. There is no corporate signature, no domain to check, and a message on chat feels like a favour asked between colleagues rather than a business instruction. Add a request for secrecy and you have removed the one thing that would have saved you: the ability to ask somebody else."

**1:00 — Red flags.** "So: an unexpected request from a senior person on an informal channel. A reason they cannot take a call. A new payee, or gift cards, or a payment that must happen today. And the phrase that should stop everything — *keep this between us.* In a real organisation, commercial sensitivity is handled by process, never by secrecy around a payment."

**1:30 — The right move.** "Verify by calling the person on a number you already hold. If you cannot reach them, the payment waits. And an instruction not to escalate is itself a reason to escalate."

**1:55 — The habit.** "Authority plus secrecy is the signature. Verify on a number you already hold."

### Scenario conversation

> *[Amina's personal phone buzzes. A WhatsApp message from an unsaved number, display name 'Mr. Adeyemi — MD'.]*
>
> **Message:** "Amina good afternoon. This is the MD. I'm in a board meeting and can't take calls. I need a discreet favour — urgent payment today to a new supplier. Keep this between us for now, commercially sensitive. I'll send account details."
>
> **Amina:** *[to herself]* "Sir?"
>
> *[She types: 'Good afternoon sir. Happy to help — can I call you?' and waits.]*
>
> **Reply:** "Can't talk now. Just process it. I'll explain Monday."
>
> **Amina:** *[reading it twice]* "He's never once asked me to keep a payment quiet."
>
> *[She scrolls up. No previous messages. She opens her contacts — the MD's number is saved, and it is not this one.]*
>
> **Amina:** *[dialling the saved number]* "Good afternoon sir, sorry to disturb — Amina in accounts. I've had a message from a number claiming to be you, asking for an urgent payment."
>
> **Mr. Adeyemi:** "I'm not in a board meeting, and I've authorised nothing. Do not process anything."
>
> **Amina:** "I haven't. I'm reporting the number to security now."
>
> **Mr. Adeyemi:** *[after a pause]* "How much were they asking for?"
>
> **Amina:** "They hadn't said yet. They were building up to it."
>
> **Mr. Adeyemi:** "Then you stopped it early. Thank you, Amina."
>
> **Amina:** *[to herself, closing the chat]* "Keep this between us. That's the tell. Always is."

### On-screen text

- `A display name proves nothing`
- `"Keep this between us" is the tell`
- `Verify on a saved number`
- `"Do not escalate" means escalate`

### Visual prompt (AI video generation)

> "Interior, home office in the evening, warm lamp light. A Black woman in her thirties sits at a small desk, holding a smartphone in both hands, reading a message, her expression shifting from mild surprise to suspicion to resolution. She lowers the phone, picks up a second phone, and dials. Camera at seated eye level, medium shot, soft shadows. Realistic, intimate documentary style, phone screen contents not legible. 5 seconds."

### The one habit

**Authority plus secrecy is the signature.**

---

## Video 15 — USB Baiting: Handling and Reporting

**Threat:** planted removable media · **Related topics:** 9 (Removable media), 7 (Incident reporting) · **Runtime:** 90 sec

**Note:** Video 9 already dramatises finding a USB drive in a car park. This video covers what happens afterwards — why security does not plug it in either, and why the chain of custody matters. Use both together.

### Voiceover dialogue

**0:00 — Hook.** "You did the right thing and handed it in. What happens next is the part nobody explains."

**0:10 — Why it still does not get plugged in.** "The drive goes into a sealed bag with the time and place it was found, and the name of the person who found it. It does not go into a spare laptop to see whose it is — because security cannot tell a dropped drive from a planted one any more than you can, and the risk is identical."

**0:35 — What the organisation does with it.** "It is examined in an isolated environment, with no connection to the company network. That tells us whether it was a genuine loss or an attack, and whether it carried something designed to run automatically. And if it was planted, the fact that it was handed in rather than plugged in is the evidence that our training worked."

**1:00 — Why reporting matters even when nothing happened.** "This is the point. A drive that was never plugged in still tells us something important: that someone placed it in our car park, on our estate, near our staff. That is intelligence — it tells us where to look for other attempts, and it may connect to a campaign against other organisations locally."

**1:25 — The habit.** "Never plug it in. Bag it, note where and when, and hand it in."

### Scenario conversation

> *[Security office. Emeka hands over a sealed bag containing the USB drive.]*
>
> **Emeka:** "Found in the car park, by the second row. Half past seven this morning."
>
> **Security officer:** *[writing on the bag]* "Second row, 7:30, found by Emeka Nwosu. Not plugged in?"
>
> **Emeka:** "No. It says payroll confidential on it. Tempting, but no."
>
> **Security officer:** "Good. Now — I'm not going to plug it in either."
>
> **Emeka:** "You're not? I assumed you'd check whose it is."
>
> **Security officer:** "How would I tell a genuinely lost drive from one left there on purpose? I can't. So it goes into the isolated machine, offline, and we see what it carries." *[beat]* "Nine times out of ten it's a real drive someone dropped. The tenth time it's why we do the other nine properly."
>
> **Emeka:** "And if it is one of ours? Someone's missing their payroll files."
>
> **Security officer:** "Then we contact them and they get it back — after we've looked at it. Which they'd rather have than a data breach, I promise you."
>
> **Emeka:** "Fair. And I'm telling the ops team, because two other people walked past it before I picked it up."

### On-screen text

- `Sealed bag · time · place · finder`
- `Security does not plug it in either`
- `Handing it in is intelligence`

### Visual prompt (AI video generation)

> "Interior, small security office, morning. A sealed clear evidence bag containing a small USB stick lies on a desk between two people. A Black man in his forties in a business shirt stands across the desk; a security officer in uniform sits, writing on a log sheet. A laptop on the desk is closed and pushed aside deliberately. Neutral overhead lighting, tidy institutional setting. Realistic documentary style, no legible text. 4 seconds."

### The one habit

**Bag it, note where and when, hand it in — and never plug it in.**

---

## Video 16 — Voice Cloning and Executive Fraud

**Threat:** cloned voice authorising a payment · **Related topics:** 7 (Incident reporting), 1 (Phishing) · **Runtime:** 120 sec

### Voiceover dialogue

**0:00 — Hook.** "It was his voice. The accent, the pauses, the way he said her name. It was his voice, and it was not him."

**0:10 — What has changed.** "A familiar voice used to be reasonable proof of identity. It is not any more. Short recordings of a person speaking — from a conference call, a video, a voicemail greeting — are enough to build a convincing copy. This is not science fiction and it is not rare. It is the same fraud as before, with a better disguise."

**0:40 — The scenario.** "Typical shape: a call from the chief financial officer, travelling, line breaking up. A regulator or a supplier is demanding payment. Email is down, so the details will be given verbally. And the instruction that disables your defences — *don't escalate this yet, I'll explain on Monday.*"

**1:10 — Red flags.** "Notice that the story explains away every anomaly at once: the bad line, the travel, the email being down, the urgency, and the reason you should not check. A genuine urgent payment never needs you to skip verification. It needs you to follow it faster."

**1:40 — The right move.** "Voice is not authentication. Any payment instruction that arrives by voice alone follows the normal dual-approval process. And an instruction not to escalate is itself a red flag, and should be escalated."

**2:05 — The habit.** "Voice is not authentication. Dual approval, every time."

### Scenario conversation

> *[Amina in the office, phone to her ear. The voice is unmistakably her CFO.]*
>
> **Voice:** "Amina, it's Mr. Adeyemi. I'm travelling, the line's poor. We've had a demand from the regulator and I've authorised payment. I need you to approve the transfer now."
>
> **Amina:** "Sir — which regulator? I don't have anything on file."
>
> **Voice:** "It came through late last night. My email is down, that's why I'm calling. Just use the account details I'm about to send."
>
> **Amina:** "I'd normally need a second approval for this size."
>
> **Voice:** "I know. Don't escalate this one yet — I'll explain on Monday. Just process it."
>
> **Amina:** *[long pause]* "Sir, I'm going to call you back on your usual number."
>
> **Voice:** "Amina, there isn't time—"
>
> **Amina:** "Then it waits." *[hangs up]*
>
> *[She dials the saved number. The real CFO answers.]*
>
> **Mr. Adeyemi:** "Amina?"
>
> **Amina:** "Sir, I've just had a call that sounded exactly like you, authorising a payment to a regulator, and telling me not to escalate it."
>
> **Mr. Adeyemi:** *[flat]* "I've made no such call. I'm in the Lagos office, and I've authorised nothing today."
>
> **Amina:** "I didn't process it."
>
> **Mr. Adeyemi:** "Good. Send it to security, and copy me." *[beat]* "It sounded like me?"
>
> **Amina:** "Exactly like you. The pauses. Everything."
>
> **Mr. Adeyemi:** *[quietly]* "Then the process is the only thing we have left. And you used it."

### On-screen text

- `Voice is not authentication`
- `Short samples are enough to clone a voice`
- `Dual approval, every time`
- `"Do not escalate" means escalate`

### Visual prompt (AI video generation)

> "Interior, finance office, daytime. A Black woman in her thirties stands beside her desk, landline handset pressed to her ear, listening. Her expression moves from attention to unease to firmness. She lowers the handset and looks at it for a moment, then dials again with deliberate calm. Camera static, medium shot, cool daylight from a window on the left. Realistic, tense but restrained documentary style. 5 seconds."

### The one habit

**Voice is not authentication — dual approval, every time.**

---

# Part 4 — Production checklist

## 4.1 Pre-production

- [ ] Confirm the runtime from the module table in "How to use this file". Do not extend a 3-minute video to 5.
- [ ] Read the narration aloud with a timer. If it runs long, cut description, never the red flags or the habit.
- [ ] Cast from the recurring cast list in 1.5. Keep the same actor per character across all sixteen videos.
- [ ] Record the narrator's voice once, for all videos, in one session. Consistency of that voice is what makes the set feel like one programme.
- [ ] Prepare the lure mock-ups as **real screen recordings** where possible. Text-to-video renders on-screen text badly.
- [ ] Confirm every mock-up uses a fictional domain, a fictional logo and placeholder credentials.
- [ ] Check localisation: swap the lure, currency, authority and deadline for the market. Keep the structure.

## 4.2 Shoot

- [ ] Shoot the conversation scene first, then the narration separately. They have different energies.
- [ ] Give the narrator's lines to the actor to read, not to memorise and paraphrase. The wording of the red flags is deliberate.
- [ ] Capture two takes of the pause — the moment the character hesitates. That pause is the skill being taught, and it needs to be visible.
- [ ] Shoot the correct action slowly and undramatically. Verification should look like a chore, because it is.
- [ ] Get clean plate shots of each location for localisation and cutdowns.

## 4.3 Post-production

- [ ] Keep beats 4 (red flags) and 6 (habit) uncut in every version, including cutdowns.
- [ ] On-screen text: maximum seven words, minimum two seconds on screen, contrast ratio 4.5:1 or better.
- [ ] Burn in captions **and** supply a separate `.srt`.
- [ ] Never use colour alone to signal danger — pair it with text or shape.
- [ ] Music: none under the red flags beat, or very low. The teaching must be audible in a noisy office.
- [ ] No stings, no whooshes, no alarm sounds. See tone rules in 1.4.
- [ ] Check the narration alone, with the screen off. Every red flag and the habit must still land.

## 4.4 Delivery specifications

| Property | Value |
|---|---|
| Aspect ratio | 16:9 |
| Resolution | 1920 × 1080 |
| Frame rate | 25 or 30 fps, consistent across the set |
| Container / codec | MP4 / H.264 (High profile), AAC audio |
| Audio loudness | −16 LUFS integrated, true peak −1.5 dBTP |
| Captions | Burned-in **and** sidecar `.srt` |
| Colour | Rec. 709 |
| File size | Aim under 150 MB per video for LMS streaming |

## 4.5 File naming — matches the platform

The ten topic modules already carry placeholder URLs in the database of the form
`https://videos.vlumetech.example/library/iso27001-<key>.mp4`.

Name the delivered files exactly as follows, then replacing the placeholder URL is a straight swap with no code change.

| # | Video | Deliver as |
|---|---|---|
| 1 | Spotting Phishing & Social Engineering | `iso27001-phishing-social-engineering.mp4` |
| 2 | Strong Passwords & MFA | `iso27001-passwords-mfa.mp4` |
| 3 | Clear Desk, Clear Screen & Acceptable Use | `iso27001-clear-desk-acceptable-use.mp4` |
| 4 | Classifying & Handling Information | `iso27001-information-classification.mp4` |
| 5 | Working Securely Remotely & On Mobile | `iso27001-remote-mobile-working.mp4` |
| 6 | Physical Security & Tailgating | `iso27001-physical-security-tailgating.mp4` |
| 7 | Reporting Security Incidents | `iso27001-incident-reporting.mp4` |
| 8 | Malware, Ransomware & Safe Downloads | `iso27001-malware-ransomware.mp4` |
| 9 | Removable Media & Safe Data Transfer | `iso27001-removable-media-transfer.mp4` |
| 10 | Protecting Personal Data & Privacy | `iso27001-privacy-personal-data.mp4` |

For cutdowns, append `-60s`: `iso27001-phishing-social-engineering-60s.mp4`.
For the six threat videos, use `threat-<name>.mp4`, for example `threat-smishing.mp4`.

## 4.6 Upload checklist

- [ ] Upload each video to Supabase Storage (bucket `training-videos`) or S3.
- [ ] Attach it to the matching `shared_training_module` by title, or to the tenant's own module.
- [ ] Verify playback on the teachable-moment page, not just in the library.
- [ ] Confirm captions display on a phone.
- [ ] Check the video plays for a user on a slower connection — if it buffers, lower the bitrate.
- [ ] Confirm the module is reachable from the phishing routing rule for its topic.

---

# Part 5 — NotebookLM prompt pack

Add this document as a source, then use prompts like these. Asking for one topic at a time produces a tighter result than asking for everything.

## 5.1 Audio Overview prompts

- "Create an Audio Overview of the ten awareness topics as a conversation between a security lead and a sceptical but fair-minded employee who has been through training before."
- "Produce a 5-minute audio discussion on *Video 6 — Physical Security & Tailgating*, focused on why holding a door open is a security risk and how to challenge someone politely."
- "Create an audio piece on the three pressure tactics — urgency, authority and curiosity — using the examples in the document."
- "Make an Audio Overview that covers only the six non-email threats in Part 3."
- "Create a short audio briefing on no-blame incident reporting for a new joiner, based on *Video 7*."

## 5.2 Video Overview prompts

- "Create a Video Overview explaining the five checks for spotting phishing, with one worked example per check."
- "Create a Video Overview on strong passwords and multi-factor authentication, using the service-desk call scenario."
- "Create a Video Overview that compares the wrong action and the right action in *Video 3 — Clear Desk, Clear Screen*."

## 5.3 Study guide and briefing prompts

- "Write a one-page Study Guide covering all sixteen videos, listing for each: the topic, the main red flags, and the one habit."
- "Create a briefing document for line managers explaining how to respond when a team member reports clicking a phishing email."
- "Write a quiz of 20 questions based only on the red flags and habits in this document."
- "Produce a glossary of every technical term used in this document, defined in plain English."
- "Summarise the video content guide in Part 1 as a two-page production brief for a video agency."
- "Create a table of the sixteen habits and the topic each belongs to."
- "Write a set of talking points for a 10-minute team meeting on phishing, drawn from Videos 1, 2 and 12."

## 5.4 Prompts for role-specific briefings

- "Using the payment scenarios in Videos 1, 12 and 16, write a briefing for a finance team on verifying changes of bank details."
- "Using Videos 8 and 4, write a briefing for an HR team on handling CV attachments and confidential documents."
- "Using Videos 5, 9 and 13, write a briefing for staff who travel or work remotely."

---

# Appendix A — The sixteen habits

Use these verbatim and consistently. A habit repeated in the same words across every channel is what makes a programme stick.

| # | Video | The one habit |
|---|---|---|
| 1 | Spotting Phishing & Social Engineering | Stop, check, verify through a channel you already trust. |
| 2 | Strong Passwords & MFA | If you did not start it, deny it — and never read out a code. |
| 3 | Clear Desk, Clear Screen & Acceptable Use | Lock it when you leave it. |
| 4 | Classifying & Handling Information | If you do not know the label, treat it as Confidential and ask. |
| 5 | Working Securely Remotely & On Mobile | Company tools, company systems, VPN on any network you do not control. |
| 6 | Physical Security & Tailgating | Everyone badges in individually — and it is always fine to walk a stranger to reception. |
| 7 | Reporting Security Incidents | Report in five minutes, not five months. |
| 8 | Malware, Ransomware & Safe Downloads | No unrequested attachments, no macros, no unapproved software. |
| 9 | Removable Media & Safe Data Transfer | Never plug in unknown media — and transfer through approved, encrypted channels only. |
| 10 | Protecting Personal Data & Privacy | Collect only what you need, share only with those who need it, and verify before you disclose. |
| 11 | SMS Phishing | Never tap a link in an unexpected text. |
| 12 | Vishing Against Payments | Any change of bank details is verified by voice, on a number already on file. |
| 13 | QR Code Phishing | A QR code is a link you cannot read. |
| 14 | Chat-App Impersonation | Authority plus secrecy is the signature. |
| 15 | USB Baiting: Handling and Reporting | Bag it, note where and when, hand it in — and never plug it in. |
| 16 | Voice Cloning and Executive Fraud | Voice is not authentication — dual approval, every time. |

---

# Appendix B — Sources and assumptions

**Derived from your existing platform content.** The ten topics, their ISO/IEC 27001:2022 Annex A references, and the module titles and durations come from the awareness content pack stored in `shared_training_modules` and `api/prisma/content/iso27001-2022.ts`. The scenarios dramatise lures that exist in the platform's shared template catalogue, so each video matches a simulation a client can actually send.

**Assumptions made, stated plainly:**

1. The scenarios are set in a Nigerian business context (`.ng` domains, payroll cycles, dispatch riders, port clearance, BVN/NIN references) because that is the platform's market. Only the pressure beat and the lure need localising for other markets; the red flags and habits do not change.
2. Character names and roles are proposed for consistency. Replace them with names matching the client's own staff demographics where a video is produced for one organisation.
3. Runtimes match the existing module durations. If a module's duration changes in the platform, the narration must be re-timed.
4. The six threat videos in Part 3 **cannot be sent as simulations** — the platform sends email only. They are teaching content for briefings, quizzes and teachable-moment pages.
5. The exact legal wording of any obligation is deliberately not stated in the narration. Where the law matters (personal data, breach notification), the videos say "protected by law as well as by policy" rather than citing a section. Have counsel confirm any wording before it is published as a statement of legal obligation.
6. AI video-generation prompts are written to avoid real people, real logos and real credentials. Treat them as starting shot lists, not finished storyboards.

**A caution on generated media.** Voice cloning is taught in Video 16 as an attack. Do not use voice cloning of a real employee for any awareness video, even as a demonstration. Use a consenting actor's voice, and say on screen that the voice is synthetic.

---

*End of document.*
