/**
 * A small, fictional support-ticket dataset for the Semantic Search demo.
 *
 * These are STATIC TEST DATA — hand-written sample tickets, not AI-generated
 * output. They exist so the demo has something realistic to search over out of
 * the box.
 *
 * The set is designed to show off meaning-based retrieval:
 *  - Several clusters describe the *same underlying issue in different words*
 *    (unsaved edits, slow performance, login/auth, email delivery) so a query
 *    can match tickets that share no literal keywords with it.
 *  - A few unrelated tickets act as distractors, so results are not uniformly
 *    "relevant" and the difference between a good and an imperfect match is
 *    visible.
 *
 * The classic worked example from the brief is included:
 *   a query like "My edits disappear after I leave the page" should surface the
 *   unsaved-changes cluster (T-001, T-002, T-003) even though it shares almost
 *   no words with them.
 */

import type { TicketDoc } from './types'

export const SAMPLE_TICKETS: TicketDoc[] = [
  // --- Cluster: unsaved / un-persisted edits (differently worded) ----------
  {
    id: 'T-001',
    title: 'Changes to customer profiles are not persisted after saving',
    description:
      'When I edit a customer profile and click Save, the confirmation appears but my changes are gone when I reload the record.',
    category: 'Data integrity',
  },
  {
    id: 'T-002',
    title: 'Updated phone number disappears when reopening a contact',
    description:
      'I changed a contact’s phone number, closed the contact, and reopened it — the old number is back and my update is lost.',
    category: 'Data integrity',
  },
  {
    id: 'T-003',
    title: 'Save button does not respond when editing account details',
    description:
      'On the account settings page the Save button does nothing. No spinner, no error, and the edits never stick.',
    category: 'Data integrity',
  },

  // --- Cluster: performance / slowness (differently worded) ----------------
  {
    id: 'T-004',
    title: 'Customer search results take too long to load',
    description:
      'Searching the customer list spins for 15–20 seconds before any rows appear. It used to be instant.',
    category: 'Performance',
  },
  {
    id: 'T-005',
    title: 'Dashboard is extremely sluggish in the morning',
    description:
      'Around 9am the dashboard crawls — charts take ages to render and clicking anything lags for several seconds.',
    category: 'Performance',
  },
  {
    id: 'T-006',
    title: 'Exporting a large report freezes the browser tab',
    description:
      'Generating the quarterly CSV export makes the page unresponsive for a minute and sometimes shows "page not responding".',
    category: 'Performance',
  },

  // --- Cluster: authentication / sign-in (differently worded) --------------
  {
    id: 'T-007',
    title: 'Cannot sign in — password is rejected even though it is correct',
    description:
      'My credentials work in the mobile app but the web login keeps saying "invalid email or password".',
    category: 'Authentication',
  },
  {
    id: 'T-008',
    title: 'Keep getting logged out after a few minutes',
    description:
      'My session ends on its own and I have to re-enter my password constantly throughout the day.',
    category: 'Authentication',
  },
  {
    id: 'T-009',
    title: 'Password reset email never arrives',
    description:
      'I requested a reset link three times. The page says the email was sent but nothing shows up, including in spam.',
    category: 'Authentication',
  },

  // --- Cluster: email / notification delivery ------------------------------
  {
    id: 'T-010',
    title: 'Order confirmation emails are not being delivered',
    description:
      'Customers complete checkout but never receive the confirmation message, so they think the order failed.',
    category: 'Notifications',
  },
  {
    id: 'T-011',
    title: 'Weekly digest stopped showing up in my inbox',
    description:
      'I used to get the Monday summary email every week; it has not arrived for the last three weeks.',
    category: 'Notifications',
  },

  // --- Cluster: billing / payments -----------------------------------------
  {
    id: 'T-012',
    title: 'Charged twice for a single subscription renewal',
    description:
      'My statement shows two identical charges on the same day for one monthly plan. I need one of them refunded.',
    category: 'Billing',
  },
  {
    id: 'T-013',
    title: 'Discount code is not applied at checkout',
    description:
      'Entering the promo code shows "applied" but the total does not go down and I pay full price.',
    category: 'Billing',
  },
  {
    id: 'T-014',
    title: 'Invoice PDF shows the wrong company address',
    description:
      'Our billing address was updated last month but downloaded invoices still print the old office address.',
    category: 'Billing',
  },

  // --- Cluster: UI / display issues ----------------------------------------
  {
    id: 'T-015',
    title: 'Text is unreadable in dark mode',
    description:
      'Several buttons show dark grey text on a near-black background in dark theme, so the labels are invisible.',
    category: 'UI / Display',
  },
  {
    id: 'T-016',
    title: 'Mobile layout overlaps the navigation menu',
    description:
      'On my phone the top menu sits on top of the page title and I cannot tap the first link.',
    category: 'UI / Display',
  },

  // --- Cluster: import / upload --------------------------------------------
  {
    id: 'T-017',
    title: 'CSV import fails without explaining why',
    description:
      'Uploading a contacts CSV returns a generic "import failed" with no row number or reason, so I cannot fix the file.',
    category: 'Import / Upload',
  },
  {
    id: 'T-018',
    title: 'Profile picture upload gets stuck at 100%',
    description:
      'The avatar upload bar reaches 100% and then hangs forever; the new picture never actually saves.',
    category: 'Import / Upload',
  },

  // --- Cluster: integrations / API -----------------------------------------
  {
    id: 'T-019',
    title: 'Webhook deliveries are failing with a timeout',
    description:
      'Our endpoint is up, but the integration dashboard shows repeated webhook timeouts and no events get through.',
    category: 'Integrations',
  },
  {
    id: 'T-020',
    title: 'API returns 429 rate-limit errors far too early',
    description:
      'We are well under the documented request quota but still get "too many requests" after only a handful of calls.',
    category: 'Integrations',
  },

  // --- Standalone distractors ----------------------------------------------
  {
    id: 'T-021',
    title: 'Request: add a dark mode to the reporting section',
    description:
      'The main app has a dark theme but the reports area is still bright white. Please add dark mode there too.',
    category: 'Feature request',
  },
  {
    id: 'T-022',
    title: 'Where can I download my past invoices?',
    description:
      'This is a general question — I just want to know where in the account area I can find and download older invoices.',
    category: 'Question',
  },
]
