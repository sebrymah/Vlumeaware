/**
 * Development seed. Creates one Vlumetech superadmin plus two client tenants —
 * one with a signed agreement, one without — so the consent gate can be seen
 * working in the UI immediately.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { tenantGuardExtension } from '../src/common/prisma/tenant-guard.extension';
import { runAsSystem, runInTenant } from '../src/common/prisma/tenant-context';

const base = new PrismaClient();
const db = base.$extends(tenantGuardExtension);

// Security review R6: the demo password must never ship to production. In a
// production environment SEED_PASSWORD must be set explicitly, or seeding aborts.
if (process.env.NODE_ENV === 'production' && !process.env.SEED_PASSWORD) {
  throw new Error(
    'Refusing to seed with the built-in demo password in production. Set SEED_PASSWORD explicitly.',
  );
}
const DEV_PASSWORD = process.env.SEED_PASSWORD ?? 'vlumeaware-dev-password';

/**
 * Seeds the shared phishing-template catalogue. Original pretexts written for
 * this build, grounded in Nigerian business patterns and the common lure
 * families that KnowBe4, Proofpoint, Cofense, SoSafe, uSecure and Hoxhunt all
 * cover — invoice fraud, credential harvesting, delivery, HR/payroll, IT.
 */
async function seedTemplates() {
  const cta = (label: string) =>
    `<p><a href="{{TRACKING_URL}}" style="background:#0f6fc4;color:#fff;padding:10px 16px;text-decoration:none;border-radius:4px">${label}</a></p>`;
  const wrap = (inner: string) =>
    `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">${inner}</div>`;

  const catalogue = [
    {
      title: 'Microsoft 365 password expiry',
      category: 'Credential harvesting',
      difficultyTier: 'medium' as const,
      industryTag: 'all',
      subjectLine: 'Action required: your password expires today',
      senderSpoofName: 'Microsoft 365 Support',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>Your organisation password expires today. To avoid losing access to email and files, re-validate your account now.</p>' +
          cta('Keep my current password') +
          '<p>Microsoft 365 Security</p>',
      ),
      redFlags: [
        'Password systems never ask you to "keep" a password via a link',
        'Generic sender rather than your own IT team',
        'Manufactured same-day deadline',
      ],
    },
    {
      title: 'Vendor bank-detail change',
      category: 'Invoice & mandate fraud',
      difficultyTier: 'high' as const,
      industryTag: 'finance / procurement',
      subjectLine: 'Updated account details for this month\'s payment',
      senderSpoofName: 'Accounts Payable',
      bodyHtml: wrap(
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>Following our bank migration, kindly confirm our updated mandate before processing outstanding invoices.</p>' +
          cta('Confirm updated mandate') +
          '<p>Regards,<br/>Accounts Payable</p>',
      ),
      redFlags: [
        'Bank detail change requested over email only',
        'Pressure tied to the payment run',
        'No verified phone callback offered',
      ],
    },
    {
      title: 'CBN compliance notice',
      category: 'Regulatory / authority',
      difficultyTier: 'high' as const,
      industryTag: 'finance',
      subjectLine: 'CBN circular: mandatory account re-verification',
      senderSpoofName: 'CBN Compliance Desk',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>In line with a new circular, corporate account signatories must re-verify their details to avoid a hold on transactions.</p>' +
          cta('Begin re-verification') +
          '<p>Central Bank Compliance</p>',
      ),
      redFlags: [
        'Regulators do not collect verification through email links',
        'Threat of a transaction hold to force speed',
        'Look-alike sender domain',
      ],
    },
    {
      title: 'DHL held shipment',
      category: 'Delivery / logistics',
      difficultyTier: 'low' as const,
      industryTag: 'all',
      subjectLine: 'Your parcel is on hold — customs fee outstanding',
      senderSpoofName: 'DHL Express',
      bodyHtml: wrap(
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>A shipment addressed to you is held pending a small customs charge. Confirm delivery details to release it.</p>' +
          cta('Release my parcel') +
          '<p>DHL Express</p>',
      ),
      redFlags: [
        'Unexpected parcel you did not order',
        'Small fee designed to seem harmless',
        'Public courier brand, non-courier sender address',
      ],
    },
    {
      title: 'HR: updated staff handbook',
      category: 'HR & payroll',
      difficultyTier: 'medium' as const,
      industryTag: 'all',
      subjectLine: 'Please acknowledge the revised staff handbook',
      senderSpoofName: 'People & Culture',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>The staff handbook has been updated. Sign in to acknowledge you have read the new policy by close of business.</p>' +
          cta('Review and acknowledge') +
          '<p>People & Culture</p>',
      ),
      redFlags: [
        'Sign-in prompt to view an internal document',
        'End-of-day deadline for a routine acknowledgement',
        'No document attached or named',
      ],
    },
    {
      title: 'Payroll: confirm bank account',
      category: 'HR & payroll',
      difficultyTier: 'medium' as const,
      industryTag: 'all',
      subjectLine: 'Confirm your salary account before this run',
      senderSpoofName: 'Payroll',
      bodyHtml: wrap(
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>We are finalising this month\'s payroll. Confirm your salary account details to avoid a delay in payment.</p>' +
          cta('Confirm my account') +
          '<p>Payroll Team</p>',
      ),
      redFlags: [
        'Your own salary account is already on file',
        'Delay-in-pay pressure',
        'Asks you to enter details rather than check them internally',
      ],
    },
    {
      title: 'IT: unrecognised sign-in',
      category: 'IT & security',
      difficultyTier: 'low' as const,
      industryTag: 'all',
      subjectLine: 'New sign-in to your account — was this you?',
      senderSpoofName: 'IT Helpdesk',
      bodyHtml: wrap(
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>We noticed a sign-in from a new device. If this was not you, secure your account now.</p>' +
          cta('Secure my account') +
          '<p>IT Helpdesk</p>',
      ),
      redFlags: [
        'Urgent security scare to prompt a click',
        'Link to "secure" rather than a direct portal visit',
        'No location or device you can recognise',
      ],
    },
    {
      title: 'Shared document invitation',
      category: 'Credential harvesting',
      difficultyTier: 'medium' as const,
      industryTag: 'all',
      subjectLine: 'A colleague shared a document with you',
      senderSpoofName: 'Document Cloud',
      bodyHtml: wrap(
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>A document has been shared with you and requires sign-in to view.</p>' +
          cta('Open document') +
          '<p>Document Cloud</p>',
      ),
      redFlags: [
        'No named colleague and no document title',
        'Sign-in demanded before you can see anything',
        'Generic sharing brand',
      ],
    },
    // --- Industry-specific pretexts (drive the industry filter) ---
    {
      title: 'Input subsidy disbursement',
      category: 'Regulatory / authority',
      difficultyTier: 'medium' as const,
      industryTag: 'Agriculture',
      subjectLine: 'Confirm your farm cooperative for this season\'s subsidy',
      senderSpoofName: 'Agric Subsidy Desk',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>Your cooperative is listed for this season\'s input subsidy. Confirm your details before the cut-off to secure allocation.</p>' +
          cta('Confirm cooperative details') + '<p>Subsidy Programme Office</p>',
      ),
      redFlags: ['Subsidy programmes verify through field officers, not email links', 'Season cut-off used to rush you', 'Sender not a known programme address'],
    },
    {
      title: 'Patient records portal migration',
      category: 'Credential harvesting',
      difficultyTier: 'high' as const,
      industryTag: 'Healthcare',
      subjectLine: 'Re-authenticate to keep access to patient records',
      senderSpoofName: 'Clinical Systems',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>Our records system has moved to a new portal. Re-authenticate now to avoid losing access to patient files.</p>' +
          cta('Re-authenticate now') + '<p>Clinical Systems Team</p>',
      ),
      redFlags: ['Sign-in demanded to "keep" existing access', 'No mention of your actual EHR by name', 'Health data urgency used as pressure'],
    },
    {
      title: 'Exam results release',
      category: 'Credential harvesting',
      difficultyTier: 'low' as const,
      industryTag: 'Education',
      subjectLine: 'Provisional results are ready — sign in to view',
      senderSpoofName: 'Examinations Office',
      bodyHtml: wrap(
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>Provisional results have been released. Sign in with your staff account to review before publication.</p>' +
          cta('View results') + '<p>Examinations Office</p>',
      ),
      redFlags: ['Sign-in to view an internal notice', 'No exam or cohort named', 'Generic examinations sender'],
    },
    {
      title: 'HSE incident acknowledgement',
      category: 'IT & security',
      difficultyTier: 'medium' as const,
      industryTag: 'Oil & Gas',
      subjectLine: 'Mandatory: acknowledge updated HSE incident procedure',
      senderSpoofName: 'HSE Compliance',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>A revised HSE incident-reporting procedure requires your acknowledgement before your next shift.</p>' +
          cta('Acknowledge procedure') + '<p>HSE Compliance</p>',
      ),
      redFlags: ['Shift deadline used to force speed', 'Sign-in to acknowledge a policy', 'No document attached or referenced'],
    },
    {
      title: 'Data bundle / line suspension notice',
      category: 'Delivery / logistics',
      difficultyTier: 'low' as const,
      industryTag: 'Telecommunications',
      subjectLine: 'Your corporate line will be suspended — confirm now',
      senderSpoofName: 'Network Services',
      bodyHtml: wrap(
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>Your corporate line is scheduled for suspension due to an unverified detail. Confirm to keep it active.</p>' +
          cta('Keep my line active') + '<p>Network Services</p>',
      ),
      redFlags: ['Suspension threat to force a click', 'Carriers do not verify via random links', 'No account or number shown'],
    },
    {
      title: 'Tax clearance re-validation',
      category: 'Regulatory / authority',
      difficultyTier: 'high' as const,
      industryTag: 'Government / Public sector',
      subjectLine: 'FIRS: re-validate your TIN to avoid penalties',
      senderSpoofName: 'Tax Authority Notice',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>Your Taxpayer Identification requires re-validation. Failure to act may attract penalties on your account.</p>' +
          cta('Re-validate TIN') + '<p>Tax Authority</p>',
      ),
      redFlags: ['Tax authorities do not re-validate via email links', 'Penalty threat as pressure', 'Look-alike authority sender'],
    },
    {
      title: 'Purchase order approval',
      category: 'Invoice & mandate fraud',
      difficultyTier: 'medium' as const,
      industryTag: 'Manufacturing',
      subjectLine: 'PO awaiting your approval — supplier on hold',
      senderSpoofName: 'Procurement',
      bodyHtml: wrap(
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>A purchase order is awaiting approval and a supplier delivery is on hold. Review and approve to release it.</p>' +
          cta('Review purchase order') + '<p>Procurement</p>',
      ),
      redFlags: ['Supplier-on-hold pressure', 'No PO number given', 'Approval via email link rather than your ERP'],
    },
    {
      title: 'Consignment clearance fee',
      category: 'Delivery / logistics',
      difficultyTier: 'medium' as const,
      industryTag: 'Logistics & Haulage',
      subjectLine: 'Consignment held at port — clearance action needed',
      senderSpoofName: 'Clearing Agent',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>A consignment is held pending a clearance action. Confirm details to avoid demurrage charges.</p>' +
          cta('Resolve clearance') + '<p>Clearing & Forwarding</p>',
      ),
      redFlags: ['Demurrage pressure', 'No consignment or bill-of-lading number', 'Unverified agent sender'],
    },
    {
      title: 'API key rotation required',
      category: 'IT & security',
      difficultyTier: 'high' as const,
      industryTag: 'Technology / SaaS',
      subjectLine: 'Rotate your production API key before it expires',
      senderSpoofName: 'Platform Security',
      bodyHtml: wrap(
        '<p>Hi {{EMPLOYEE_NAME}},</p><p>A production API key tied to your account expires shortly. Sign in to rotate it and avoid an outage.</p>' +
          cta('Rotate key now') + '<p>Platform Security</p>',
      ),
      redFlags: ['Outage threat to force urgency', 'Key rotation via an emailed link', 'No system or key id referenced'],
    },
    {
      title: 'Loyalty points expiry',
      category: 'Delivery / logistics',
      difficultyTier: 'low' as const,
      industryTag: 'Retail / FMCG',
      subjectLine: 'Your reward points expire in 24 hours',
      senderSpoofName: 'Rewards Programme',
      bodyHtml: wrap(
        '<p>Hello {{EMPLOYEE_NAME}},</p><p>Your accumulated reward points expire in 24 hours. Sign in to redeem before they are lost.</p>' +
          cta('Redeem my points') + '<p>Rewards</p>',
      ),
      redFlags: ['24-hour expiry pressure', 'Sign-in to redeem', 'Generic rewards sender'],
    },
    {
      title: 'Booking chargeback dispute',
      category: 'Invoice & mandate fraud',
      difficultyTier: 'medium' as const,
      industryTag: 'Hospitality',
      subjectLine: 'Guest chargeback requires your response today',
      senderSpoofName: 'Payments Dispute Team',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>A guest has filed a chargeback. Respond today with confirmation of the booking to avoid an automatic refund.</p>' +
          cta('Respond to dispute') + '<p>Payments</p>',
      ),
      redFlags: ['Same-day response pressure', 'Auto-refund threat', 'No booking reference'],
    },
    {
      title: 'Donor grant disbursement',
      category: 'Invoice & mandate fraud',
      difficultyTier: 'high' as const,
      industryTag: 'NGO / Non-profit',
      subjectLine: 'Confirm banking details for grant disbursement',
      senderSpoofName: 'Grants Management',
      bodyHtml: wrap(
        '<p>Dear {{EMPLOYEE_NAME}},</p><p>Your programme\'s grant is ready for disbursement. Confirm the receiving account to release funds this week.</p>' +
          cta('Confirm receiving account') + '<p>Grants Management</p>',
      ),
      redFlags: ['Account confirmation for incoming funds', 'This-week release pressure', 'Sender not a known donor contact'],
    },
  ];

  for (const t of catalogue) {
    const exists = await db.phishingTemplate.findFirst({ where: { title: t.title } });
    if (!exists) {
      await db.phishingTemplate.create({
        data: { ...t, source: 'Vlumetech library' },
      });
    }
  }
}

/** Seeds the global shared awareness-content library (Vlumetech-curated). */
async function seedSharedModules() {
  const catalogue = [
    {
      title: 'Phishing fundamentals',
      description: 'A 5-minute primer on spotting phishing emails.',
      category: 'Phishing',
      videoUrl: 'https://videos.vlumetech.example/library/phishing-fundamentals.mp4',
      videoSource: 'link' as const,
      durationSeconds: 300,
    },
    {
      title: 'Business email compromise & invoice fraud',
      description: 'How mandate-change and invoice scams work, and how to verify.',
      category: 'Fraud',
      videoUrl: 'https://videos.vlumetech.example/library/bec-invoice-fraud.mp4',
      videoSource: 'link' as const,
      durationSeconds: 360,
    },
    {
      title: 'Passwords & MFA',
      description: 'Strong passwords, password managers, and why MFA matters.',
      category: 'Account security',
      videoUrl: 'https://videos.vlumetech.example/library/passwords-mfa.mp4',
      videoSource: 'link' as const,
      durationSeconds: 240,
    },
  ];
  for (const m of catalogue) {
    const exists = await db.sharedTrainingModule.findFirst({ where: { title: m.title } });
    if (!exists) await db.sharedTrainingModule.create({ data: m });
  }
}

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  await runAsSystem('seed', async () => {
    await db.user.upsert({
      where: { email: 'it@vlumetech.com.ng' },
      create: { email: 'it@vlumetech.com.ng', passwordHash, role: 'vlumetech_superadmin' },
      update: { passwordHash },
    });

    await seedTemplates();
    await seedSharedModules();

    const signed = await db.tenant.upsert({
      where: { id: '00000000-0000-4000-8000-000000000001' },
      create: {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Kaduna Foods Ltd',
        brandPrimaryColor: '#1F6F43',
        ndpaAgreementSignedAt: new Date(),
        ndpaAgreementDocUrl: 'file://seed/agreement.pdf',
      },
      update: {},
    });

    const unsigned = await db.tenant.upsert({
      where: { id: '00000000-0000-4000-8000-000000000002' },
      create: {
        id: '00000000-0000-4000-8000-000000000002',
        name: 'Lagos Freight Co (agreement pending)',
        brandPrimaryColor: '#8A2E2E',
      },
      update: {},
    });

    for (const tenant of [signed, unsigned]) {
      await runInTenant(tenant.id, async () => {
        const slug = tenant.id.endsWith('1') ? 'kaduna' : 'lagos';
        await db.tenantUser.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email: `admin@${slug}.test` } },
          create: {
            tenantId: tenant.id,
            email: `admin@${slug}.test`,
            passwordHash,
            role: 'client_admin',
          },
          update: { passwordHash },
        });
        await db.tenantUser.upsert({
          where: { tenantId_email: { tenantId: tenant.id, email: `viewer@${slug}.test` } },
          create: {
            tenantId: tenant.id,
            email: `viewer@${slug}.test`,
            passwordHash,
            role: 'client_viewer',
          },
          update: { passwordHash },
        });
      });
    }

    // Only the signed tenant gets simulation content, matching the gate.
    await runInTenant(signed.id, async () => {
      const existing = await db.employee.count();
      if (existing === 0) {
        await db.employee.createMany({
          data: [
            { email: 'amina.bello@kaduna.test', name: 'Amina Bello', department: 'Finance' },
            { email: 'chidi.okeke@kaduna.test', name: 'Chidi Okeke', department: 'Finance' },
            { email: 'funke.adisa@kaduna.test', name: 'Funke Adisa', department: 'Operations' },
            { email: 'ibrahim.sani@kaduna.test', name: 'Ibrahim Sani', department: 'Operations' },
            { email: 'ngozi.eze@kaduna.test', name: 'Ngozi Eze', department: 'HR' },
          ].map((e) => ({ ...e, tenantId: signed.id })),
        });
      }

      let scenario = await db.scenario.findFirst({ where: { title: 'Vendor mandate change' } });
      if (!scenario) {
        scenario = await db.scenario.create({
          data: {
            tenantId: signed.id,
            title: 'Vendor mandate change',
            difficultyTier: 'medium',
            industryTag: 'agriculture / FMCG',
            subjectLine: 'Updated account details for August invoices',
            senderSpoofName: 'Accounts Payable',
            bodyHtml: [
              '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">',
              '<p>Dear {{EMPLOYEE_NAME}},</p>',
              '<p>Please note our corporate account has changed following our bank migration.',
              'Kindly confirm the updated mandate before processing this month&rsquo;s invoices.</p>',
              '<p><a href="{{TRACKING_URL}}" style="background:#1F6F43;color:#fff;padding:10px 16px;',
              'text-decoration:none;border-radius:4px">Confirm updated mandate</a></p>',
              '<p>Regards,<br/>Accounts Payable</p></div>',
            ].join(''),
            redFlags: [
              'Bank mandate change requested over email only',
              'Sender domain does not match the vendor of record',
              'Urgency tied to the monthly invoice run',
              'No callback to a known phone number offered',
            ],
            createdByClaude: false,
            approvedAt: new Date(),
          },
        });
      }

      // A seeded awareness module (linked, so it plays without a real upload),
      // wired to the scenario by a routing rule.
      let module = await db.trainingModule.findFirst({
        where: { title: 'Spotting invoice & mandate fraud' },
      });
      if (!module) {
        module = await db.trainingModule.create({
          data: {
            tenantId: signed.id,
            title: 'Spotting invoice & mandate fraud',
            description:
              'A 4-minute refresher on vendor bank-detail changes and how to verify them out of band.',
            videoUrl: 'https://videos.vlumetech.example/invoice-fraud-intro.mp4',
            videoSource: 'link',
            durationSeconds: 240,
          },
        });
      }

      await db.trainingRoutingRule.upsert({
        where: { tenantId_scenarioId: { tenantId: signed.id, scenarioId: scenario.id } },
        create: {
          tenantId: signed.id,
          scenarioId: scenario.id,
          trainingModuleId: module.id,
        },
        update: { trainingModuleId: module.id },
      });

      // A short post-video quiz on the same module.
      const existingQuiz = await db.quiz.findFirst({ where: { trainingModuleId: module.id } });
      if (!existingQuiz) {
        await db.quiz.create({
          data: {
            tenantId: signed.id,
            title: 'Invoice & mandate fraud check',
            passingScorePct: 67,
            trainingModuleId: module.id,
            questions: {
              create: [
                {
                  tenantId: signed.id,
                  order: 0,
                  prompt: 'A supplier emails new bank details for an invoice due today. What do you do?',
                  options: [
                    'Update the details and pay to avoid delay',
                    'Call the supplier on a number you already have to verify',
                    'Reply to the email asking them to confirm',
                  ],
                  correctIndex: 1,
                  explanation: 'Verify bank-detail changes out of band, using a number you already hold — not one from the email.',
                },
                {
                  tenantId: signed.id,
                  order: 1,
                  prompt: 'Which of these is the strongest red flag of mandate fraud?',
                  options: [
                    'The email is addressed to you by name',
                    'A bank-detail change requested only over email, with urgency',
                    'The invoice has a PDF attached',
                  ],
                  correctIndex: 1,
                  explanation: 'Urgency plus an email-only bank-detail change is the classic mandate-fraud pattern.',
                },
                {
                  tenantId: signed.id,
                  order: 2,
                  prompt: 'You already clicked a suspicious link. What is the best next step?',
                  options: [
                    'Say nothing and hope it was harmless',
                    'Report it to IT immediately',
                    'Delete the email so no one sees it',
                  ],
                  correctIndex: 1,
                  explanation: 'Report promptly — early reporting limits damage. There is no penalty for reporting.',
                },
              ],
            },
          },
        });
      }

      let campaign = await db.campaign.findFirst({ where: { name: 'Q3 2026 baseline' } });
      if (!campaign) {
        campaign = await db.campaign.create({
          data: { tenantId: signed.id, name: 'Q3 2026 baseline' },
        });
        await db.campaignScenario.create({
          data: { campaignId: campaign.id, scenarioId: scenario.id, tenantId: signed.id },
        });
      }

      // A few pre-populated sends so the dashboard has something to render.
      const employees = await db.employee.findMany();
      const sendCount = await db.send.count({ where: { campaignId: campaign.id } });
      if (sendCount === 0) {
        for (const [i, employee] of employees.entries()) {
          await db.send.create({
            data: {
              tenantId: signed.id,
              campaignId: campaign.id,
              employeeId: employee.id,
              scenarioId: scenario.id,
              uniqueTrackingToken: randomBytes(24).toString('base64url'),
              sentAt: new Date(),
              openedAt: i < 4 ? new Date() : null,
              clickedAt: i < 2 ? new Date() : null,
              reportedAt: i === 4 ? new Date() : null,
            },
          });
        }
        await db.campaign.update({ where: { id: campaign.id }, data: { status: 'completed' } });
      }
    });
  });

  console.log('Seed complete.');
  console.log(`  superadmin    it@vlumetech.com.ng / ${DEV_PASSWORD}`);
  console.log(`  client_admin  admin@kaduna.test   / ${DEV_PASSWORD}  (agreement signed)`);
  console.log(`  client_viewer viewer@kaduna.test  / ${DEV_PASSWORD}`);
  console.log(`  client_admin  admin@lagos.test    / ${DEV_PASSWORD}  (agreement pending)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => base.$disconnect());
