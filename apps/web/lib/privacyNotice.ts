// The Data Privacy Notice text, used by the first-login popup and the
// public /privacy page.
//
// DRAFT: not yet reviewed by DLSL's Data Protection Officer. When the final
// text is approved, update it here and change PRIVACY_NOTICE_VERSION in
// apps/api/routers/auth.py.

export const NOTICE_INTRO = `De La Salle Lipa – Learning Resource Center ("DLSL LRC," "we," "us") values your privacy. This notice explains how we collect, use, and protect your personal data when you use the Lasallia library system, in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and its Implementing Rules and Regulations.`

// Each section renders as a bold heading, a paragraph, and (if present) a list.
export const NOTICE_SECTIONS: { heading: string; body: string; items?: string[] }[] = [
  {
    heading: "WHAT WE COLLECT",
    body: "We collect and process personal information you provide when you use this system, including but not limited to: your name, student/employee number, program, college, year level, email address, and your borrowing, reservation, and library usage history.",
  },
  {
    heading: "WHY WE COLLECT IT",
    body: "We use this information to:",
    items: [
      "Manage your library account, loans, reservations, and fines",
      "Send you notifications about your account (e.g. due dates, pickup notices)",
      "Maintain accurate library records as required by DLSL's institutional policies",
      "Improve library services and generate usage reports for institutional purposes",
    ],
  },
  {
    heading: "HOW WE PROTECT IT",
    body: "We implement reasonable organizational, physical, and technical safeguards to protect your personal data from unauthorized access, use, or disclosure.",
  },
  {
    heading: "HOW LONG WE KEEP IT",
    body: "We retain your personal data for as long as necessary to fulfill the purposes described above, or as required by DLSL policy and applicable law.",
  },
  {
    heading: "YOUR RIGHTS",
    body: "Under the Data Privacy Act, you have the right to be informed, to access your data, to correct inaccurate data, to object to processing, and to file a complaint with the National Privacy Commission. To exercise these rights or ask questions about this notice, contact the Data Protection Officer.",
  },
]

export const NOTICE_CLOSING = `By clicking "Accept," you acknowledge that you have read and understood this notice and consent to the processing of your personal data as described above.`
