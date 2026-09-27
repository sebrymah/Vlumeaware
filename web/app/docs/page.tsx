'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/logo';

/**
 * Public setup documentation. Generic (no tenant, no live status) so it serves
 * one canonical page for both the console and the marketing site, which links
 * here. Single-page docs: a left "On this page" nav grouped by feature arm with
 * scrollspy, and one continuous scrolling column of content.
 */

interface DocStep {
  id: string;
  title: string;
  why: string;
  do: string[];
  tip?: string;
  trial?: string;
}
interface DocSection {
  id: string;
  arm: string;
  steps: DocStep[];
}

const SECTIONS: DocSection[] = [
  {
    id: 'security',
    arm: 'Security',
    steps: [
      {
        id: 'secure-the-account',
        title: 'Secure the account',
        why: 'This console can send mail that looks like it comes from your company. Lock it down before you populate it.',
        do: [
          'Sign in at the client portal and change the password you were given.',
          'Under Security, set the password policy your team must meet and how long a session lasts.',
          'If your organisation requires it, switch on "Require multi-factor authentication", then turn MFA on for your own account with "Turn on MFA".',
          'Add a colleague as a second admin, or as a viewer if they only need to read reports. The same page manages both.',
        ],
        tip: 'Switching on "Require multi-factor authentication" applies to the console accounts you create from that point on. Anyone who already has an account is asked to enrol the next time they sign in, but is not locked out — so if you need the whole team covered immediately, say so to your Vlumetech contact and they will set it per account.',
      },
    ],
  },
  {
    id: 'branding',
    arm: 'Branding',
    steps: [
      {
        id: 'brand-the-programme',
        title: 'Brand the programme',
        why: 'Your logo and colour appear on the pages your employees see after they click, and on the certificates they earn.',
        do: [
          'Upload your logo. PNG or JPEG, up to 2 MB.',
          'Set your brand colour, which is used on the landing pages and certificates.',
          'Choose a certificate template: formal, branded, or record.',
        ],
        tip: 'Do this before your first campaign. The teachable-moment page is white-labelled, and a page that does not look like your company teaches the wrong lesson.',
      },
    ],
  },
  {
    id: 'people',
    arm: 'People',
    steps: [
      {
        id: 'prove-your-domain',
        title: 'Prove you own your domain',
        why: 'Simulations are domain-bound: we will only send to addresses on a domain you have proved you own, so a typo in a roster can never mail a stranger. Do this before adding employees.',
        do: [
          'Add your domain, for example acme.com.',
          'Add the TXT record we show you at the host _vlumeaware.acme.com, with the value vlumeaware-verify= followed by the token on screen.',
          'Wait for the record to publish, then verify. The check reads your live DNS.',
        ],
        tip: 'Skipping this is the single most common cause of an empty campaign. Employees on an unverified domain are not rejected loudly — they are skipped row by row, with a reason you will see in the upload result.',
      },
      {
        id: 'add-your-people',
        title: 'Add your people',
        why: 'The roster is who gets simulated. Only new people consume a licence seat; re-uploading the same list is safe.',
        do: [
          'Export your staff list as CSV with the columns email, name, department.',
          'Upload it. You will get a count of who was added and, for each row that was skipped, why.',
          'Add anyone who joins later the same way, or one at a time.',
        ],
        tip: 'Upload results speak plainly, and the reasons are worth reading: "invalid email address", "missing name", "acme.com is not a verified domain", "no verified domains yet — verify your domain first", "duplicate within file", or "seat limit reached". Those last two mean your licence or your DNS, not your file.',
      },
      {
        id: 'choose-how-sims-are-sent',
        title: 'Choose how simulations are sent',
        why: 'This decides the address your simulations appear to come from. It must be a domain verified with our mail provider, or the send is rejected.',
        do: [
          'Take the shared Vlumeaware sending domain, which needs no setup from you.',
          'Or add your own, for example acme-security.com, and publish the DNS records the page shows you. Keep it separate from the domain you actually use for mail.',
          'Give each one a sender title, for example "IT Service Desk". That is the name staff see, and it is what makes the simulation realistic.',
        ],
        tip: 'Use a lookalike domain you own, not your real mail domain. Training staff to distrust your genuine address is the opposite of the point. The page also shows whether SPF, DKIM and DMARC are in place.',
      },
      {
        id: 'mail-gateway',
        title: 'Let the simulations through your mail gateway',
        why: 'Your own filters will quarantine a simulation unless they are told not to. This step needs your IT team, and it has a lead time measured in days — start it now rather than the day you plan to launch.',
        do: [
          'Send the delivery test from the Domains page to an address inside your organisation.',
          'Open the test message from inside your mail system, which confirms the gateway let it through and marks your account as allow-listed.',
          'If it does not arrive, send your IT team the block under "For your IT team" below. It lists what to allow, and the Microsoft 365 Advanced Delivery steps if you use it.',
        ],
        tip: 'A campaign will not launch until this is confirmed. That is deliberate: a simulation that never reaches the inbox produces a report that measures nothing.',
      },
    ],
  },
  {
    id: 'training',
    arm: 'Training',
    steps: [
      {
        id: 'awareness-content',
        title: 'Add awareness content',
        why: 'This is what plays after someone clicks. It is the difference between a gotcha and a lesson, and it is what the certificate certifies.',
        do: [
          'Upload a video with "Upload a video", or paste a link to one you already host and choose "Preview this link" to check it plays.',
          'Give it a title, a duration in seconds, and a description.',
          'Or browse the shared Vlumeaware library and use "Add to my library" to clone a module into your own.',
        ],
        tip: 'A clone refers to the same stored video, so nothing is duplicated and the share counts against nobody.',
      },
      {
        id: 'attach-a-quiz',
        title: 'Attach a quiz',
        why: 'Optional, but a quiz is what turns "I read the page" into a recorded pass and a certificate.',
        do: [
          'Author a quiz question by question, or upload one as CSV with the columns prompt, option1..optionN, correct, explanation.',
          'Attach the quiz to the awareness module it belongs to.',
        ],
        tip: 'Answers are never sent to the browser. Questions are served without the correct option, and scoring happens on the server, so the answer cannot be read from the page source.',
      },
      {
        id: 'click-to-training',
        title: 'Connect a click to training',
        why: 'Without a routing rule, a click is recorded and nothing else happens. This is the rule that assigns the lesson.',
        do: [
          'Pick the scenario on the left and the awareness module it should lead to.',
          'Save the rule. One rule per scenario.',
        ],
        tip: 'Do this before you launch. Adding it afterwards works, but the people who already clicked will not have been assigned anything.',
      },
    ],
  },
  {
    id: 'phishing',
    arm: 'Phishing',
    steps: [
      {
        id: 'pick-a-simulation',
        title: 'Pick a simulation',
        why: 'The template catalogue is ready-made and already labelled by industry, category and difficulty. It is the fastest way to something realistic.',
        do: [
          'Filter the catalogue to your industry, then use "Preview" to see the mail as a target would.',
          'Choose "Clone to my library" to take a copy. It becomes an ordinary scenario you can edit freely.',
        ],
        tip: 'Nothing you clone affects anyone else, and nothing is sent until you attach it to a campaign.',
      },
      {
        id: 'write-your-own',
        title: 'Or write your own',
        why: 'A simulation built around a process your staff really use — an invoice, a delivery, a payroll notice — lands harder than a generic one.',
        do: [
          'Use "Generate with Vlumeaware AI" to draft one from your industry and a sentence of context, then edit it.',
          'Or build it yourself: "Compose visually" for a rich editor, or "Compose manually" for raw HTML. Use the tracking-link and employee-name placeholders so clicks are recorded.',
          'Check the live preview, then "Save to library".',
        ],
        tip: 'The preview shows exactly what will be stored, because the body is sanitized before it is ever rendered. Scripts, forms and event handlers are stripped — appearance is allowed in, behaviour is not.',
      },
      {
        id: 'run-a-campaign',
        title: 'Run your first campaign',
        why: 'This is the one that actually trains your people.',
        do: [
          'Create a campaign, attach the scenario, choose the sending domain and the sender title, and pick the landing page your targets will see.',
          'Work through the preflight checklist on the campaign page. It will not let you launch until every line is green: the agreement signed, employees uploaded, at least one scenario attached, a verified sending domain chosen, the tracking domain configured, and your IT allow-list confirmed.',
          'Choose "Launch", or "Schedule send" to set a date and an optional repeat. A send window spreads deliveries out instead of firing them all at once.',
          'Keep the kill switch in mind: pausing or killing a campaign stops queued mail immediately, not just future mail.',
        ],
        trial: 'On a free trial you can prepare everything, but campaigns are locked until Vlumetech approves the account and the authorization agreement is on file.',
      },
    ],
  },
  {
    id: 'reporting',
    arm: 'Reporting',
    steps: [
      {
        id: 'read-the-results',
        title: 'Read the results',
        why: 'The report tells you who is a risk, not just what happened.',
        do: [
          'Open the campaign for delivery, open, click and report rates, the trend over time, and a written summary.',
          'Export the campaign as CSV when someone asks for the detail.',
          'Go to Reporting ▸ Risk for a running risk score per person across every campaign, the repeat clickers, and one-click enrolment into a remediation module.',
          'Reporting ▸ Certificates lists issued certificates. Each has a serial anyone can verify.',
        ],
      },
    ],
  },
  {
    id: 'going-live',
    arm: 'Going live',
    steps: [
      {
        id: 'keep-it-running',
        title: 'Then keep it running',
        why: 'One campaign is a test. A programme changes behaviour.',
        do: [
          'Schedule the next campaign to recur, so nobody gets one test and no follow-up.',
          'Opt in to the weekly digest if you would rather the results came to you.',
          'Watch your seat usage against your licence as you hire, under License.',
          'Check the audit log under Security if you need to know who changed what.',
        ],
      },
    ],
  },
];

const EMPLOYEE_SUMMARY = [
  'They receive a simulated phishing email. It looks like a plausible internal message, and it comes from a domain used for training rather than the real one.',
  'If they click, they land on a page that looks like a sign-in. It records only that a submission happened, plus non-reversible details such as how long the fields were. What was typed is never seen, stored or transmitted.',
  'They are then shown plainly that it was a simulation, why it worked, and the warning signs they missed.',
  'They are given the short lesson attached to that scenario, and a quiz if one is attached. Passing marks the training complete.',
  'They get a certificate they can keep. Anyone can verify it by serial.',
];

const IT_CHECKLIST = `Vlumeaware — what our mail gateway needs to allow

We are running phishing simulations through Vlumeaware to train staff. Our
filters will quarantine these messages unless the sending infrastructure is
allow-listed. Please apply the following.

1. Allow the sending domain
   The domain shown under Sending domains in our Vlumeaware console.
   If we are using the shared Vlumeaware domain it is on the Domains page.

2. Allow the link and tracking domains
   Simulation links and open-tracking pixels are served from separate domains
   from the sending domain. All of them are listed on the Domains page in our
   console, under link / tracking domain and training / landing domain.

3. Allow the sending IP addresses
   Listed on the Domains page under "Sending IPs". Microsoft 365 in particular
   requires the sending domain AND the IP — the domain alone is not enough.

4. Microsoft 365 / Exchange Online only
   Add a phishing simulation override so Defender does not action these:
   Security portal > Email & collaboration > Policies & rules >
   Threat policies > Advanced delivery > Phishing simulation tab.
   Add the sending domain and the sending IPs there, and set the simulation
   URLs to be allowed.

5. Publish SPF, DKIM and DMARC for our sending domain
   The sending domain must be verified with our mail provider first. The
   Vlumeaware console shows whether each record is in place.

6. Confirm
   Once applied, tell us. We will send a test message to an address inside the
   organisation; opening it from inside our mail system confirms the change
   worked end to end.`;

// Extra anchors after the step sections.
const APPENDIX = [
  { id: 'free-trial', label: 'On a free trial' },
  { id: 'employees-see', label: 'What employees see' },
  { id: 'it-team', label: 'For your IT team' },
];

export default function DocsPage() {
  const [active, setActive] = useState<string>('secure-the-account');
  const [copied, setCopied] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const ids = [
      ...SECTIONS.flatMap((s) => s.steps.map((st) => st.id)),
      ...APPENDIX.map((a) => a.id),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  async function copyItChecklist() {
    try {
      await navigator.clipboard.writeText(IT_CHECKLIST);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const navLink = (id: string, label: string, indent = false) => (
    <a
      key={id}
      href={`#${id}`}
      onClick={() => setNavOpen(false)}
      className={`block rounded px-2 py-1 text-[13px] leading-snug transition-colors ${
        indent ? 'pl-4' : 'font-medium'
      } ${
        active === id
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      {label}
    </a>
  );

  const Nav = (
    <nav className="space-y-4">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        On this page
      </p>
      {SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {section.arm}
          </p>
          <div className="mt-1 space-y-0.5">
            {section.steps.map((st) => navLink(st.id, st.title, true))}
          </div>
        </div>
      ))}
      <div className="border-t border-slate-200 pt-3">
        {APPENDIX.map((a) => navLink(a.id, a.label))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* Public top bar so the page stands alone when linked from the website. */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link href="/">
            <Logo />
          </Link>
          <span className="ml-2 text-sm text-slate-400">Docs</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pb-8">{Nav}</div>
        </aside>

        <main className="min-w-0 flex-1 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Setting up Vlumeaware</h1>
          <p className="mt-3 text-base leading-relaxed text-slate-600">
            Everything needed to get from an empty account to your first simulation, grouped by area.
            Work through them roughly top to bottom — the steps under <strong>People</strong> and the
            mail-gateway step need other people (your DNS administrator and your IT team), so start
            those early.
          </p>

          {/* Mobile nav */}
          <div className="mt-6 lg:hidden">
            <button
              type="button"
              onClick={() => setNavOpen((v) => !v)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-left text-sm font-medium text-slate-700"
            >
              {navOpen ? '× Close' : 'On this page ▾'}
            </button>
            {navOpen && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">{Nav}</div>
            )}
          </div>

          <div className="mt-10 space-y-12">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id}>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                  {section.arm}
                </h2>
                <div className="mt-4 space-y-10">
                  {section.steps.map((st) => (
                    <article key={st.id} id={st.id} className="scroll-mt-24">
                      <h3 className="text-lg font-semibold text-slate-900">{st.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{st.why}</p>
                      <ul className="mt-4 space-y-2.5">
                        {st.do.map((line) => (
                          <li key={line} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                      {st.tip && (
                        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                          <p className="text-sm leading-relaxed text-amber-900">{st.tip}</p>
                        </div>
                      )}
                      {st.trial && (
                        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-sm leading-relaxed text-slate-600">
                            <span className="font-medium">On a free trial: </span>
                            {st.trial}
                          </p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}

            {/* Appendix */}
            <section id="free-trial" className="scroll-mt-24 border-t border-slate-200 pt-10">
              <h2 className="text-lg font-semibold text-slate-900">On a free trial</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                You can do everything on this page except run a campaign, which unlocks once Vlumetech
                has approved the account and the authorization agreement is on file. Up to 20 employees
                while on trial. After 7 days, if the account is still unapproved, it becomes read-only —
                you can look, but not add or author — until it is approved.
              </p>
            </section>

            <section id="employees-see" className="scroll-mt-24 border-t border-slate-200 pt-10">
              <h2 className="text-lg font-semibold text-slate-900">What your employees will see</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                Worth sending round before your first campaign, so nobody feels ambushed:
              </p>
              <ul className="mt-4 space-y-2.5">
                {EMPLOYEE_SUMMARY.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-slate-500">
                One thing to be plain about: a password is never captured. The simulated sign-in reports
                only that something was submitted, plus non-reversible details like field lengths. That
                is a deliberate limit, and it is why no password from a simulation can leak.
              </p>
            </section>

            <section id="it-team" className="scroll-mt-24 border-t border-slate-200 pt-10">
              <h2 className="text-lg font-semibold text-slate-900">For your IT team</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                The gateway allow-list is the one step that cannot be done from the console. Copy the
                block below and send it on — it is written to stand on its own.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyItChecklist}
                  className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? 'Copied' : 'Copy for your IT team'}
                </button>
              </div>
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700">
                {IT_CHECKLIST}
              </pre>
            </section>
          </div>

          <p className="mt-12 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-500">
            Still stuck? Anything that does not behave as this page describes is worth reporting — tell
            your Vlumetech contact which step and what you saw.
          </p>
        </main>
      </div>
    </div>
  );
}
