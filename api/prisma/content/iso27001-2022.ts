/**
 * ISO/IEC 27001:2022 security-awareness content pack for Vlumeaware.
 *
 * Ten topics, each with a training video, a knowledge-check quiz and a matching
 * phishing simulation. ISO references point at the Annex A (2022) controls each
 * topic supports so the pack can be mapped to a statement of applicability.
 *
 * Phishing bodies use the platform placeholders {{EMPLOYEE_NAME}} and
 * {{TRACKING_URL}}, which the send pipeline and previews substitute.
 */

export type Tier = 'low' | 'medium' | 'high';

export interface QuizQuestion {
  prompt: string;
  options: string[];
  /** Zero-based index of the correct option. */
  correctIndex: number;
  explanation: string;
}

export interface ContentPackage {
  key: string;
  topic: string;
  isoRefs: string[];
  video: {
    title: string;
    category: string;
    durationSeconds: number;
    /** Shown in the library and to employees. */
    description: string;
    /** Narration outline for the produced video. */
    script: string[];
  };
  quiz: {
    title: string;
    passingScorePct: number;
    questions: QuizQuestion[];
  };
  phishing: {
    title: string;
    category: string;
    difficultyTier: Tier;
    industryTag?: string;
    subjectLine: string;
    senderSpoofName: string;
    bodyHtml: string;
    redFlags: string[];
  };
}

export const ISO_27001_2022_PACK: ContentPackage[] = [
  {
    key: 'phishing-social-engineering',
    topic: 'Phishing & social engineering',
    isoRefs: ['A.6.3', 'A.5.7', 'A.8.7'],
    video: {
      title: 'Spotting Phishing & Social Engineering',
      category: 'Phishing',
      durationSeconds: 240,
      description:
        'How attackers use urgency, authority and curiosity to trick you into clicking, and the five checks that catch almost every phishing email.',
      script: [
        'Open on a realistic "urgent invoice" email landing in an inbox.',
        'Explain social engineering: attacks target people, not just systems.',
        'Walk the five checks — sender address, unexpected request, urgency/fear, links vs. displayed text, and attachments.',
        'Show hovering a link to reveal the true destination.',
        'Close with the one safe action: stop, verify through a known channel, and report.',
      ],
    },
    quiz: {
      title: 'Phishing & Social Engineering — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'An email says your account will be closed in one hour unless you "verify" it via a link. What is the safest first step?',
          options: [
            'Click the link quickly so you do not lose access',
            'Stop and verify through a known channel, such as the official website or IT',
            'Reply to the email asking if it is genuine',
            'Forward it to a colleague to click and check',
          ],
          correctIndex: 1,
          explanation:
            'Urgency is a pressure tactic. Never act on the email’s own links — verify independently through a channel you already trust.',
        },
        {
          prompt: 'Which of these is the strongest sign a message is a phishing attempt?',
          options: [
            'It is addressed to you by name',
            'It has a company logo',
            'The link text and the actual link destination do not match',
            'It was sent during working hours',
          ],
          correctIndex: 2,
          explanation:
            'Attackers hide malicious URLs behind trusted-looking text. Hover to reveal the true destination before clicking.',
        },
        {
          prompt: 'What is "social engineering"?',
          options: [
            'Manipulating people into breaking security or revealing information',
            'A method for designing secure software',
            'A type of firewall configuration',
            'The study of social media algorithms',
          ],
          correctIndex: 0,
          explanation:
            'Social engineering targets human trust and habits rather than technical flaws — it is why awareness matters.',
        },
        {
          prompt: 'A vendor emails new bank details for an overdue invoice, marked urgent. What should you do?',
          options: [
            'Update the payment details as requested',
            'Verify the change by calling the vendor on a number you already have on file',
            'Pay a small amount first to test the account',
            'Ignore it — invoices are not a security issue',
          ],
          correctIndex: 1,
          explanation:
            'Bank-detail changes are a classic business email compromise. Always confirm out-of-band using contact details you already hold.',
        },
        {
          prompt: 'You clicked a suspicious link before realising it may be phishing. What is the right action?',
          options: [
            'Say nothing in case you get in trouble',
            'Delete the email and hope for the best',
            'Report it to IT/security immediately so they can respond',
            'Turn off your computer and wait a week',
          ],
          correctIndex: 2,
          explanation:
            'Fast reporting limits damage. Organisations expect and encourage reports — you will never be blamed for reporting.',
        },
      ],
    },
    phishing: {
      title: 'Urgent: Unpaid Invoice #4821 — Action Required',
      category: 'Phishing',
      difficultyTier: 'medium',
      industryTag: 'General',
      subjectLine: 'Final notice: invoice #4821 overdue — pay within 24 hours',
      senderSpoofName: 'Accounts Payable',
      bodyHtml:
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>Our records show invoice <strong>#4821</strong> remains unpaid and is now overdue. To avoid a service suspension, please review and settle the balance within <strong>24 hours</strong>.</p><p><a href="{{TRACKING_URL}}">View invoice and pay now</a></p><p>If payment has already been made, disregard this notice.</p><p>Regards,<br/>Accounts Payable Team</p>',
      redFlags: [
        'Creates urgency with a 24-hour deadline and threat of suspension',
        'Generic sender ("Accounts Payable") with no verifiable identity',
        'Asks you to pay via a link rather than a known finance process',
        'No specific vendor or purchase-order reference you can confirm',
      ],
    },
  },
  {
    key: 'passwords-mfa',
    topic: 'Passwords & multi-factor authentication',
    isoRefs: ['A.5.17', 'A.8.5'],
    video: {
      title: 'Strong Passwords & MFA',
      category: 'Authentication',
      durationSeconds: 210,
      description:
        'Why length beats complexity, how a password manager helps, and why multi-factor authentication stops most account takeovers.',
      script: [
        'Show how quickly short passwords are cracked versus long passphrases.',
        'Introduce passphrases and unique passwords per account.',
        'Demonstrate a password manager storing and filling credentials.',
        'Explain MFA and the danger of approving prompts you did not start ("MFA fatigue").',
        'Close: never reuse passwords, always enable MFA, never approve a login you did not request.',
      ],
    },
    quiz: {
      title: 'Passwords & MFA — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'Which makes the strongest password?',
          options: [
            'A short word with a number, like "Cat7"',
            'A long, unique passphrase such as "river-copper-lantern-88"',
            'Your name and birth year',
            'The word "Password1"',
          ],
          correctIndex: 1,
          explanation: 'Length and uniqueness matter most. Long passphrases are hard to crack and easy to remember.',
        },
        {
          prompt: 'Why should each account have a different password?',
          options: [
            'It looks more professional',
            'So one breached site cannot unlock your other accounts',
            'Because IT requires exactly ten characters',
            'It makes logging in faster',
          ],
          correctIndex: 1,
          explanation: 'Reused passwords let attackers use one leak to break into many accounts (credential stuffing).',
        },
        {
          prompt: 'What does multi-factor authentication (MFA) add?',
          options: [
            'A second, separate proof of identity beyond your password',
            'A longer password',
            'A backup of your files',
            'Faster internet',
          ],
          correctIndex: 0,
          explanation: 'MFA requires something you have or are in addition to your password, blocking most account takeovers.',
        },
        {
          prompt: 'Your phone buzzes with an MFA approval prompt you did NOT request. What should you do?',
          options: [
            'Approve it to stop the buzzing',
            'Deny it and report it — someone may have your password',
            'Ignore it and approve later',
            'Approve it and change nothing',
          ],
          correctIndex: 1,
          explanation: 'An unexpected prompt means someone is trying to log in as you. Deny and report so the password can be changed.',
        },
        {
          prompt: 'What is a safe way to store many unique passwords?',
          options: [
            'A sticky note on your monitor',
            'A shared spreadsheet',
            'A reputable password manager',
            'The same password everywhere so you remember it',
          ],
          correctIndex: 2,
          explanation: 'A password manager generates and stores unique credentials securely so you do not have to memorise them.',
        },
      ],
    },
    phishing: {
      title: 'Password Expiry Notice — Reset Required',
      category: 'Credential Harvesting',
      difficultyTier: 'medium',
      industryTag: 'General',
      subjectLine: 'Your password expires today — reset now to keep access',
      senderSpoofName: 'IT Service Desk',
      bodyHtml:
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>Your network password is scheduled to expire <strong>today</strong>. To avoid being locked out, please reset it using the secure portal below.</p><p><a href="{{TRACKING_URL}}">Reset your password</a></p><p>This link expires in 2 hours.</p><p>IT Service Desk</p>',
      redFlags: [
        'Pressure to reset "today" within a 2-hour window',
        'Password resets should start from your device, not an email link',
        'Sender name mimics IT but cannot be independently verified',
        'Link leads to a portal asking for your current password',
      ],
    },
  },
  {
    key: 'clear-desk-acceptable-use',
    topic: 'Clear desk, clear screen & acceptable use',
    isoRefs: ['A.7.7', 'A.5.10'],
    video: {
      title: 'Clear Desk, Clear Screen & Acceptable Use',
      category: 'Workplace Security',
      durationSeconds: 180,
      description:
        'Keeping sensitive information off desks and screens, locking your device, and using company systems responsibly.',
      script: [
        'Pan across a messy desk with visible passwords, documents and an unlocked screen.',
        'Explain who can see this — visitors, cleaners, passers-by.',
        'Show locking the screen (Win+L / Ctrl-Cmd-Q) and securing documents.',
        'Cover acceptable use: company systems are for work, no unapproved software.',
        'Close with the clear-desk habit at the end of every day.',
      ],
    },
    quiz: {
      title: 'Clear Desk & Acceptable Use — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'You step away from your desk for five minutes. What should you do with your computer?',
          options: ['Leave it as is', 'Lock the screen', 'Turn off the monitor only', 'Log out and shut down fully'],
          correctIndex: 1,
          explanation: 'Locking the screen (e.g. Windows+L) prevents anyone from using your session while you are away.',
        },
        {
          prompt: 'Where should printed documents containing personal data be kept when not in use?',
          options: ['Face down on the desk', 'In a locked drawer or cabinet', 'In the recycling bin', 'Pinned to a noticeboard'],
          correctIndex: 1,
          explanation: 'Clear-desk policy requires sensitive material to be locked away so it cannot be seen or taken.',
        },
        {
          prompt: 'Which is an example of acceptable use of company equipment?',
          options: [
            'Installing a free game you found online',
            'Using approved tools to do your job',
            'Storing personal media libraries on the work drive',
            'Sharing your login with a colleague to save time',
          ],
          correctIndex: 1,
          explanation: 'Company systems are provided for work using approved software; unapproved apps and shared logins create risk.',
        },
        {
          prompt: 'A visitor is waiting near your desk while you fetch coffee. What is the risk if your screen is unlocked?',
          options: [
            'None — visitors are trusted',
            'They could read or copy sensitive information',
            'The screen may overheat',
            'It uses more electricity',
          ],
          correctIndex: 1,
          explanation: 'An unlocked screen exposes whatever is open to anyone nearby, including visitors and passers-by.',
        },
        {
          prompt: 'What is the "clear screen" principle?',
          options: [
            'Keeping your monitor physically clean',
            'Not leaving sensitive information visible on an unattended screen',
            'Using a bright wallpaper',
            'Closing all browser tabs each hour',
          ],
          correctIndex: 1,
          explanation: 'Clear screen means locking or clearing displays so unattended devices do not reveal information.',
        },
      ],
    },
    phishing: {
      title: 'New Clean Desk Policy — Acknowledge Required',
      category: 'Credential Harvesting',
      difficultyTier: 'low',
      industryTag: 'General',
      subjectLine: 'Action needed: acknowledge the new Clean Desk Policy',
      senderSpoofName: 'HR & Compliance',
      bodyHtml:
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>We have updated our Clean Desk & Acceptable Use Policy. All staff must read and acknowledge it before Friday. Sign in below to record your acknowledgement.</p><p><a href="{{TRACKING_URL}}">Read and acknowledge the policy</a></p><p>Thank you,<br/>HR &amp; Compliance</p>',
      redFlags: [
        'Asks you to "sign in" via an emailed link to record acknowledgement',
        'Deadline pressure ("before Friday")',
        'Policy documents normally live on your intranet, not behind an email link',
        'Sender identity cannot be confirmed from the message alone',
      ],
    },
  },
  {
    key: 'information-classification',
    topic: 'Information classification & handling',
    isoRefs: ['A.5.12', 'A.5.13', 'A.5.14'],
    video: {
      title: 'Classifying & Handling Information',
      category: 'Data Protection',
      durationSeconds: 210,
      description:
        'What the classification labels mean (Public, Internal, Confidential, Restricted) and how to store, share and dispose of each safely.',
      script: [
        'Introduce the four labels with everyday examples.',
        'Show a Confidential document being emailed externally — and why that is wrong.',
        'Explain handling rules: storage, sharing, encryption and disposal per label.',
        'Demonstrate labelling a document and choosing the right sharing method.',
        'Close: when unsure, treat information as Confidential and ask the owner.',
      ],
    },
    quiz: {
      title: 'Information Classification — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'Why do organisations classify information?',
          options: [
            'To make documents look official',
            'To apply the right level of protection to each type of information',
            'To slow down email',
            'Because auditors like colours',
          ],
          correctIndex: 1,
          explanation: 'Classification tells everyone how sensitive information is and therefore how it must be protected.',
        },
        {
          prompt: 'A document is labelled "Confidential". Which action is appropriate?',
          options: [
            'Post it on the public website',
            'Share it only with people who need it, using approved secure methods',
            'Print copies for the reception desk',
            'Forward it to your personal email for convenience',
          ],
          correctIndex: 1,
          explanation: 'Confidential information is shared strictly on a need-to-know basis through approved, secure channels.',
        },
        {
          prompt: 'You are unsure how sensitive a document is. What is the safest assumption?',
          options: [
            'Treat it as Public',
            'Treat it as Confidential and check with the owner',
            'Delete it',
            'Share it widely so someone corrects you',
          ],
          correctIndex: 1,
          explanation: 'When in doubt, protect first: assume higher sensitivity and confirm with the information owner.',
        },
        {
          prompt: 'How should Confidential paper records be disposed of?',
          options: ['In the general waste bin', 'Left on a shelf', 'Shredded or placed in secure confidential-waste bins', 'Recycled with newspapers'],
          correctIndex: 2,
          explanation: 'Secure disposal (shredding or confidential-waste bins) prevents sensitive records being recovered.',
        },
        {
          prompt: 'Which is an example of "Restricted" information in most organisations?',
          options: ['A public press release', 'The staff canteen menu', 'Encryption keys or bulk customer records', 'The office address'],
          correctIndex: 2,
          explanation: 'Restricted is the most sensitive tier — its exposure would cause serious harm, so it needs the strongest controls.',
        },
      ],
    },
    phishing: {
      title: 'Shared Document: "Confidential — Q3 Salary Review"',
      category: 'Credential Harvesting',
      difficultyTier: 'high',
      industryTag: 'General',
      subjectLine: 'A confidential document has been shared with you',
      senderSpoofName: 'Document Sharing',
      bodyHtml:
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>A document titled <strong>"Confidential — Q3 Salary Review"</strong> has been shared with you. Because it contains restricted information, you must sign in to verify your identity before viewing.</p><p><a href="{{TRACKING_URL}}">Open the secure document</a></p><p>This access link is unique to you.</p>',
      redFlags: [
        'Uses curiosity about salaries to prompt a click',
        'Demands you "sign in to verify identity" — a credential-harvesting tactic',
        'Unexpected document share from a generic "Document Sharing" sender',
        'Legitimate internal documents rarely require re-authentication via an email link',
      ],
    },
  },
  {
    key: 'remote-mobile-working',
    topic: 'Secure remote & mobile working',
    isoRefs: ['A.6.7', 'A.8.1', 'A.7.9'],
    video: {
      title: 'Working Securely Remotely & On Mobile',
      category: 'Remote Work',
      durationSeconds: 210,
      description:
        'Safe use of public Wi-Fi and VPN, protecting devices away from the office, and keeping work data off personal apps.',
      script: [
        'Show working from a café — an attacker on the same open Wi-Fi.',
        'Explain VPN use and avoiding sensitive work on untrusted networks.',
        'Cover device safety: screen privacy, not leaving laptops unattended.',
        'Warn against moving work data into personal cloud or messaging apps.',
        'Close: use company tools, connect through VPN, keep devices with you.',
      ],
    },
    quiz: {
      title: 'Remote & Mobile Working — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'You need to access work systems from a coffee shop. What is the safest approach?',
          options: [
            'Use the open Wi-Fi directly',
            'Connect through the company VPN',
            'Ask a stranger for their hotspot password',
            'Wait until the battery is full',
          ],
          correctIndex: 1,
          explanation: 'A VPN encrypts your connection so others on an untrusted network cannot intercept your work traffic.',
        },
        {
          prompt: 'Why is public Wi-Fi risky for work?',
          options: [
            'It is always too slow',
            'Others on the network may be able to intercept unprotected traffic',
            'It drains the battery',
            'It is illegal to use',
          ],
          correctIndex: 1,
          explanation: 'Open networks let attackers eavesdrop or run fake hotspots; encryption via VPN mitigates this.',
        },
        {
          prompt: 'Where should work documents be stored?',
          options: [
            'In your personal cloud drive for easy access',
            'In approved company systems',
            'Emailed to your personal address',
            'On a random USB stick',
          ],
          correctIndex: 1,
          explanation: 'Keeping work data in approved systems ensures it stays protected, backed up and within policy.',
        },
        {
          prompt: 'You are on a train reviewing a sensitive report. What is a sensible precaution?',
          options: [
            'Read it aloud to check it',
            'Use a privacy screen and be aware of who can see your display',
            'Leave the laptop open while you visit the buffet car',
            'Share your screen with the passenger beside you',
          ],
          correctIndex: 1,
          explanation: 'Shoulder-surfing is a real risk in public. Privacy filters and situational awareness protect the content.',
        },
        {
          prompt: 'Your work phone is lost while travelling. What should you do first?',
          options: [
            'Buy a new one and say nothing',
            'Report it to IT/security immediately so it can be locked or wiped',
            'Wait to see if it turns up',
            'Post about it on social media',
          ],
          correctIndex: 1,
          explanation: 'Prompt reporting lets the organisation remotely lock or wipe the device before data is accessed.',
        },
      ],
    },
    phishing: {
      title: 'VPN Update Required for Remote Access',
      category: 'Credential Harvesting',
      difficultyTier: 'medium',
      industryTag: 'General',
      subjectLine: 'Important: update your VPN client to keep remote access',
      senderSpoofName: 'Remote Access Support',
      bodyHtml:
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>To maintain secure remote access, all staff must update the VPN client and re-authenticate by end of day. Failure to do so will disable your remote login.</p><p><a href="{{TRACKING_URL}}">Update VPN and sign in</a></p><p>Remote Access Support</p>',
      redFlags: [
        'Threatens loss of remote access to force quick action',
        'Software updates should come through IT/managed tooling, not email links',
        'Asks you to "sign in" on an external page',
        'Generic support sender with no verifiable contact details',
      ],
    },
  },
  {
    key: 'physical-security-tailgating',
    topic: 'Physical security & tailgating',
    isoRefs: ['A.7.1', 'A.7.2', 'A.7.4', 'A.7.6'],
    video: {
      title: 'Physical Security & Tailgating',
      category: 'Physical Security',
      durationSeconds: 180,
      description:
        'Access control, challenging unfamiliar people politely, visitor escorting, and why holding the door open can be a security risk.',
      script: [
        'Show someone slipping through a secure door behind a badge-holder.',
        'Explain tailgating and why every person should badge in individually.',
        'Demonstrate a polite challenge and directing visitors to reception.',
        'Cover visitor badges and escorting in secure areas.',
        'Close: it is okay to challenge; security is everyone’s job.',
      ],
    },
    quiz: {
      title: 'Physical Security — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'What is "tailgating" in physical security?',
          options: [
            'Driving too close behind another car',
            'Following an authorised person through a secure door without badging in',
            'Leaving work late',
            'A type of phishing email',
          ],
          correctIndex: 1,
          explanation: 'Tailgating lets an unauthorised person into a controlled area by following someone with legitimate access.',
        },
        {
          prompt: 'Someone you do not recognise asks you to hold a secure door open. What is the best response?',
          options: [
            'Hold it open to be polite',
            'Politely ask them to badge in themselves or direct them to reception',
            'Ignore them completely',
            'Give them your badge',
          ],
          correctIndex: 1,
          explanation: 'A polite challenge and directing visitors to reception maintains access control without being rude.',
        },
        {
          prompt: 'A visitor is in a secure area. What should be true?',
          options: [
            'They wear a visitor badge and are escorted',
            'They can wander freely',
            'They use a staff badge',
            'They do not need to sign in',
          ],
          correctIndex: 0,
          explanation: 'Visitors should be identifiable, signed in and escorted so their access is controlled and accountable.',
        },
        {
          prompt: 'You find an unattended laptop in a meeting room after everyone has left. What should you do?',
          options: [
            'Take it home for safekeeping',
            'Leave it and hope the owner returns',
            'Secure it and report it to security or reception',
            'Log into it to find the owner',
          ],
          correctIndex: 2,
          explanation: 'Securing the device and reporting it protects the data and returns it to the owner through proper channels.',
        },
        {
          prompt: 'Why should you not share or lend your access badge?',
          options: [
            'Badges are expensive',
            'Access is tied to you personally and must remain accountable',
            'It is against the dress code',
            'Badges stop working when shared',
          ],
          correctIndex: 1,
          explanation: 'Individual access ensures the organisation knows who entered where; sharing breaks that accountability.',
        },
      ],
    },
    phishing: {
      title: 'Your Access Badge Needs Re-Validation',
      category: 'Credential Harvesting',
      difficultyTier: 'low',
      industryTag: 'General',
      subjectLine: 'Building access: re-validate your badge to avoid deactivation',
      senderSpoofName: 'Facilities & Security',
      bodyHtml:
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>As part of a security upgrade, all access badges must be re-validated online. Badges not validated by tomorrow will be deactivated and require a visit to reception.</p><p><a href="{{TRACKING_URL}}">Re-validate my badge</a></p><p>Facilities &amp; Security</p>',
      redFlags: [
        'Physical badges are not "re-validated" through a website link',
        'Threat of deactivation to create urgency',
        'Generic facilities sender you cannot verify',
        'Likely leads to a page requesting your staff credentials',
      ],
    },
  },
  {
    key: 'incident-reporting',
    topic: 'Security incident reporting',
    isoRefs: ['A.5.24', 'A.5.25', 'A.5.26', 'A.6.8'],
    video: {
      title: 'Reporting Security Incidents',
      category: 'Incident Response',
      durationSeconds: 180,
      description:
        'What counts as a security incident, why speed matters, and exactly how and where to report without fear of blame.',
      script: [
        'List everyday incidents: lost phone, clicked link, odd email, tailgating, misdirected data.',
        'Explain why reporting early limits damage.',
        'Show the reporting channels (report button, service desk, security contact).',
        'Reassure: a no-blame culture — reporting is always the right call.',
        'Close: if in doubt, report it.',
      ],
    },
    quiz: {
      title: 'Incident Reporting — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'Which of these should be reported as a security incident?',
          options: [
            'A lost work phone',
            'Accidentally emailing a customer list to the wrong person',
            'Clicking a link in a suspicious email',
            'All of the above',
          ],
          correctIndex: 3,
          explanation: 'Lost devices, misdirected data and suspicious clicks are all reportable — early reporting enables a fast response.',
        },
        {
          prompt: 'Why does reporting an incident quickly matter?',
          options: [
            'It looks good on your record',
            'Early action can contain the damage before it spreads',
            'It is required for your timesheet',
            'It does not matter when you report',
          ],
          correctIndex: 1,
          explanation: 'The sooner security knows, the sooner they can isolate systems, reset credentials and limit impact.',
        },
        {
          prompt: 'You realise you sent sensitive data to the wrong recipient. What should you do?',
          options: [
            'Say nothing and hope they delete it',
            'Report it immediately through the incident channel',
            'Recall the email and consider it handled',
            'Wait until your manager notices',
          ],
          correctIndex: 1,
          explanation: 'Misdirected data is a reportable incident; prompt reporting allows containment and any required notifications.',
        },
        {
          prompt: 'What best describes a healthy incident-reporting culture?',
          options: [
            'Blame the person who reports',
            'Encourage reporting without fear of punishment',
            'Only managers may report',
            'Report only major incidents',
          ],
          correctIndex: 1,
          explanation: 'A no-blame culture increases reporting, which is essential to catching and containing incidents early.',
        },
        {
          prompt: 'You are unsure whether something is really an incident. What is the best action?',
          options: ['Ignore it', 'Report it anyway — let the experts decide', 'Ask on social media', 'Wait a week to see what happens'],
          correctIndex: 1,
          explanation: 'When in doubt, report. It is far better to raise a false alarm than to miss a real incident.',
        },
      ],
    },
    phishing: {
      title: 'Security Alert: Suspicious Sign-In Detected',
      category: 'Credential Harvesting',
      difficultyTier: 'high',
      industryTag: 'General',
      subjectLine: 'Security alert: we blocked a sign-in from a new device',
      senderSpoofName: 'Account Security',
      bodyHtml:
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>We detected a sign-in attempt to your account from an unrecognised device in another country and temporarily blocked it. If this was not you, secure your account now.</p><p><a href="{{TRACKING_URL}}">Review activity and secure account</a></p><p>If this was you, no action is needed.</p><p>Account Security</p>',
      redFlags: [
        'Alarming "sign-in from another country" message to trigger panic',
        '"Secure your account" link leads to a fake login page',
        'Legitimate alerts are best acted on by going directly to the service, not the email link',
        'Generic security sender that cannot be verified',
      ],
    },
  },
  {
    key: 'malware-ransomware',
    topic: 'Malware, ransomware & safe downloads',
    isoRefs: ['A.8.7', 'A.8.19', 'A.8.13'],
    video: {
      title: 'Malware, Ransomware & Safe Downloads',
      category: 'Malware',
      durationSeconds: 210,
      description:
        'How malware and ransomware get in through attachments and downloads, the warning signs, and how to avoid infecting the organisation.',
      script: [
        'Show a macro-enabled attachment triggering a ransomware lock screen.',
        'Explain common entry points: attachments, fake installers, malicious ads.',
        'Cover only installing approved software and not enabling macros on request.',
        'Show what to do if a device behaves oddly: disconnect and report.',
        'Close: think before you open or download; when unsure, ask IT.',
      ],
    },
    quiz: {
      title: 'Malware & Ransomware — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'What is ransomware?',
          options: [
            'Software that speeds up your PC',
            'Malware that encrypts your files and demands payment',
            'A type of password',
            'An email signature',
          ],
          correctIndex: 1,
          explanation: 'Ransomware locks or encrypts data and demands payment — prevention and backups are the best defence.',
        },
        {
          prompt: 'An attachment asks you to "Enable Content" or "Enable Macros" to view it. What should you do?',
          options: [
            'Enable it to see the document',
            'Do not enable it; macros are a common malware trigger — verify or report',
            'Forward it to everyone',
            'Enable it only on a Friday',
          ],
          correctIndex: 1,
          explanation: 'Malicious documents use macros to run code. Do not enable content on unexpected files — verify the sender first.',
        },
        {
          prompt: 'Where should you get software for your work computer?',
          options: [
            'Any website offering a free download',
            'Only from approved, official sources or IT',
            'From a colleague’s USB stick',
            'From links in emails',
          ],
          correctIndex: 1,
          explanation: 'Unapproved downloads are a top malware source; approved software channels are vetted and safe.',
        },
        {
          prompt: 'Your computer suddenly slows down and files start renaming themselves. What is the best first action?',
          options: [
            'Keep working and ignore it',
            'Disconnect from the network and report it immediately',
            'Pay any ransom shown',
            'Restart repeatedly until it stops',
          ],
          correctIndex: 1,
          explanation: 'Disconnecting can stop ransomware spreading; immediate reporting gets expert help fast.',
        },
        {
          prompt: 'Why are regular backups important against ransomware?',
          options: [
            'They make files load faster',
            'They let you restore data without paying a ransom',
            'They are required by your internet provider',
            'They improve battery life',
          ],
          correctIndex: 1,
          explanation: 'Good backups mean encrypted data can be restored, removing the attacker’s leverage.',
        },
      ],
    },
    phishing: {
      title: 'Voicemail Attachment — New Message Received',
      category: 'Malware',
      difficultyTier: 'medium',
      industryTag: 'General',
      subjectLine: 'You have a new voicemail (00:38) — see attachment',
      senderSpoofName: 'Voicemail Service',
      bodyHtml:
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>You received a new voicemail message (duration 00:38). The audio is attached. If your player does not open it, click below to listen online.</p><p><a href="{{TRACKING_URL}}">Listen to voicemail</a></p><p>Voicemail Service</p>',
      redFlags: [
        'Unexpected voicemail-as-attachment is a classic malware lure',
        'Encourages opening an attachment or clicking to "listen"',
        'Generic service sender unrelated to your actual phone system',
        'Creates mild curiosity/urgency to prompt a click',
      ],
    },
  },
  {
    key: 'removable-media-transfer',
    topic: 'Removable media & safe data transfer',
    isoRefs: ['A.7.10', 'A.8.12', 'A.5.14'],
    video: {
      title: 'Removable Media & Safe Data Transfer',
      category: 'Data Protection',
      durationSeconds: 180,
      description:
        'The risks of USB drives and personal storage, why you should never plug in unknown devices, and how to transfer data securely.',
      script: [
        'Show a "found" USB stick in the car park being plugged in — and infecting a PC.',
        'Explain the risk of unknown devices and lost/stolen USBs.',
        'Cover approved, encrypted transfer methods instead of personal media.',
        'Show encrypting a drive or using approved file-sharing.',
        'Close: never plug in unknown media; use approved, encrypted transfer.',
      ],
    },
    quiz: {
      title: 'Removable Media — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'You find a USB stick in the car park. What should you do?',
          options: [
            'Plug it in to find the owner',
            'Hand it to IT/security without plugging it in',
            'Take it home to use',
            'Plug it into a colleague’s machine to check',
          ],
          correctIndex: 1,
          explanation: 'Dropped USBs are a known attack ("USB baiting"). Never plug in unknown media; hand it to security.',
        },
        {
          prompt: 'Why is transferring work data on a personal USB drive risky?',
          options: [
            'It is slow',
            'The drive can be lost or stolen and the data exposed',
            'USB drives are illegal',
            'It uses too much power',
          ],
          correctIndex: 1,
          explanation: 'Portable media is easily lost; unencrypted data on it can be read by anyone who finds it.',
        },
        {
          prompt: 'What is the safest way to send a large sensitive file to a partner?',
          options: [
            'A personal USB by post',
            'An approved, encrypted file-transfer service',
            'A public file-sharing site with no password',
            'Your personal email',
          ],
          correctIndex: 1,
          explanation: 'Approved encrypted transfer keeps data protected in transit and controls who can access it.',
        },
        {
          prompt: 'If you must use a USB drive for work, what should be true of it?',
          options: [
            'It is encrypted and approved for use',
            'It is the cheapest available',
            'It is shared by the whole team informally',
            'It has games on it too',
          ],
          correctIndex: 0,
          explanation: 'Only approved, encrypted drives should hold work data so a loss does not become a breach.',
        },
        {
          prompt: 'A USB drive holding customer data is lost. What should you do?',
          options: [
            'Nothing, it was only a copy',
            'Report it as a security incident immediately',
            'Buy a replacement quietly',
            'Wait to see if it is found',
          ],
          correctIndex: 1,
          explanation: 'A lost drive with personal data is a reportable incident that may require containment and notification.',
        },
      ],
    },
    phishing: {
      title: 'Encrypted File Delivery — Download Your Secure File',
      category: 'Credential Harvesting',
      difficultyTier: 'medium',
      industryTag: 'General',
      subjectLine: 'A secure encrypted file is waiting for you to download',
      senderSpoofName: 'Secure File Transfer',
      bodyHtml:
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>A partner has sent you an encrypted file via our secure transfer system. To decrypt and download it, verify your identity by signing in below.</p><p><a href="{{TRACKING_URL}}">Verify and download file</a></p><p>Secure File Transfer</p>',
      redFlags: [
        'Uses "encrypted/secure" language to appear trustworthy',
        'Requires you to "sign in to verify identity" — credential harvesting',
        'Unexpected file from an unnamed partner',
        'The sender and system are not ones you actually use',
      ],
    },
  },
  {
    key: 'privacy-personal-data',
    topic: 'Personal data & privacy (PII)',
    isoRefs: ['A.5.34', 'A.8.11', 'A.5.12'],
    video: {
      title: 'Protecting Personal Data & Privacy',
      category: 'Data Protection',
      durationSeconds: 210,
      description:
        'What personal data is, the principles of handling it (minimise, protect, retain only as needed), and your role in keeping it private.',
      script: [
        'Define personal data / PII with relatable examples.',
        'Explain core principles: collect only what is needed, protect it, keep it only as long as required.',
        'Show a data-minimisation example (redacting a document before sharing).',
        'Cover access on a need-to-know basis and secure disposal.',
        'Close: handle personal data as you would want your own handled.',
      ],
    },
    quiz: {
      title: 'Personal Data & Privacy — Knowledge Check',
      passingScorePct: 80,
      questions: [
        {
          prompt: 'Which of these is personal data (PII)?',
          options: [
            'A person’s name combined with their address or ID number',
            'The current weather',
            'A public company logo',
            'The office opening hours',
          ],
          correctIndex: 0,
          explanation: 'Personal data is any information that can identify an individual, alone or combined with other data.',
        },
        {
          prompt: 'What does "data minimisation" mean?',
          options: [
            'Compressing files to save space',
            'Collecting and keeping only the personal data you actually need',
            'Deleting all customer data monthly',
            'Using smaller fonts',
          ],
          correctIndex: 1,
          explanation: 'Minimisation reduces risk: the less personal data you hold, the less there is to lose or misuse.',
        },
        {
          prompt: 'Who should be able to access a customer’s personal records?',
          options: [
            'Anyone in the company',
            'Only those who need it for their role',
            'All external partners',
            'Whoever asks first',
          ],
          correctIndex: 1,
          explanation: 'Access should be need-to-know; limiting it reduces the chance of misuse or exposure.',
        },
        {
          prompt: 'You no longer need a spreadsheet of personal data for a finished project. What should you do?',
          options: [
            'Keep it forever just in case',
            'Dispose of it securely in line with retention rules',
            'Email it to your personal account',
            'Upload it to a public site',
          ],
          correctIndex: 1,
          explanation: 'Personal data should be retained only as long as needed and then securely disposed of.',
        },
        {
          prompt: 'A caller asks you to confirm a customer’s personal details "to verify their account". What should you do?',
          options: [
            'Read out the details to be helpful',
            'Verify the caller’s identity and authority through proper process before sharing anything',
            'Share the details if they sound official',
            'Give partial details only',
          ],
          correctIndex: 1,
          explanation: 'Attackers use pretexting to extract personal data. Verify identity and authority before disclosing anything.',
        },
      ],
    },
    phishing: {
      title: 'Data Subject Request — Verify to Proceed',
      category: 'Credential Harvesting',
      difficultyTier: 'high',
      industryTag: 'General',
      subjectLine: 'Urgent: a data subject request requires your verification',
      senderSpoofName: 'Data Protection Office',
      bodyHtml:
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>A data subject access request has been logged that references records you manage. To comply within the legal deadline, please verify your identity and review the request now.</p><p><a href="{{TRACKING_URL}}">Verify identity and review request</a></p><p>Data Protection Office</p>',
      redFlags: [
        'Invokes legal/compliance pressure and a deadline',
        'Asks you to "verify identity" via an email link',
        'Impersonates a data-protection authority function',
        'Real DSAR processes run through internal systems, not ad-hoc email links',
      ],
    },
  },
];
