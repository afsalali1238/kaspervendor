/**
 * Vendor Registration (Logistics) — Google Sheets backend
 * --------------------------------------------------------
 * Setup (one time):
 *  1. Create a Google Sheet → Extensions → Apps Script.
 *  2. Paste this file into Code.gs. Add an HTML file named "Index" and paste Index.html.
 *  3. Run setup() once (approve permissions). It creates the header row + an uploads folder.
 *  4. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone → Deploy.
 *  5. Share the /exec URL with vendors. (Optional: paste it into ENDPOINT in Index.html
 *     if you host the HTML somewhere else, e.g. your website.)
 */

const SHEET_NAME = 'Registrations';
const UPLOAD_FOLDER_NAME = 'Vendor Registration Uploads';
const NOTIFY_EMAIL = ''; // e.g. 'ops@yourcompany.com' — leave blank to disable email alerts
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const COLUMNS = [
  ['submitted_at', 'Submitted At'],
  ['ref', 'Reference'],
  ['company_name', 'Legal Business Name'],
  ['legal_status', 'Legal Status'],
  ['trade_license_no', 'Trade License No.'],
  ['trade_license', 'Trade License (file)'],
  ['trn', 'TRN'],
  ['vat_cert', 'VAT Certificate (file)'],
  ['vendor_type', 'Vendor Type'],
  ['address1', 'Address'],
  ['address2', 'Address Line 2'],
  ['city', 'City / Emirate'],
  ['po_box', 'P.O. Box'],
  ['country', 'Country'],
  ['equipment', 'Heavy Equipment'],
  ['vehicles', 'Heavy Vehicles'],
  ['coverage', 'Geographic Coverage'],
  ['fleet_size', 'Fleet Size'],
  ['payment_terms', 'Payment Terms'],
  ['delivery_logistics', 'Handles Delivery & Logistics'],
  ['payment_methods', 'Accepted Payment Methods'],
  ['decl_accurate', 'Declares Info Accurate'],
  ['decl_laws', 'Complies with UAE Laws'],
  ['decl_rights', 'Has Rights & Authorizations'],
  ['first_name', 'First Name'],
  ['last_name', 'Last Name'],
  ['designation', 'Designation'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['files_folder', 'All Files (Drive folder)'],
  ['status', 'Review Status'],
];

/* ---------- web app ---------- */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Vendor Registration (Logistics)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Used when the HTML is hosted outside Apps Script (fetch POST, text/plain JSON)
function doPost(e) {
  let out;
  try {
    out = submit(JSON.parse(e.postData.contents));
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- core ---------- */

function submit(data) {
  if (!data || typeof data !== 'object') throw new Error('No data received');
  if (data._hp) return { ok: true, ref: 'IGNORED' }; // honeypot = bot

  const required = ['company_name', 'legal_status', 'vendor_type', 'address1', 'city', 'country',
    'coverage', 'fleet_size', 'payment_terms', 'delivery_logistics', 'payment_methods',
    'first_name', 'last_name', 'phone', 'email'];
  required.forEach(k => {
    const v = data[k];
    if (v === undefined || v === null || String(v).trim() === '' || (Array.isArray(v) && !v.length)) {
      throw new Error('Missing required field: ' + k);
    }
  });
  if (!data.files || !data.files.trade_license) throw new Error('Trade license file is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Invalid email');
  ['decl_accurate', 'decl_laws', 'decl_rights'].forEach(k => {
    if (data[k] !== 'Yes') throw new Error('All declarations must be accepted');
  });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_();
    const ref = 'VR-' + Utilities.formatDate(new Date(), 'Asia/Dubai', 'yyMMdd') + '-' +
      String(sheet.getLastRow()).padStart(4, '0');

    const folder = getVendorFolder_(ref + ' ' + data.company_name);
    const links = {};
    Object.keys(data.files || {}).forEach(key => {
      const f = data.files[key];
      if (!f || !f.data) return;
      const bytes = Utilities.base64Decode(f.data);
      if (bytes.length > MAX_FILE_BYTES) throw new Error(f.name + ' is larger than 10 MB');
      const blob = Utilities.newBlob(bytes, f.type || 'application/octet-stream', key + ' - ' + f.name);
      links[key] = folder.createFile(blob).getUrl();
    });

    const row = COLUMNS.map(([key]) => {
      if (key === 'submitted_at') return new Date();
      if (key === 'ref') return ref;
      if (key === 'status') return 'New';
      if (key === 'files_folder') return folder.getUrl();
      if (links[key]) return links[key];
      const v = data[key];
      return Array.isArray(v) ? v.join(', ') : (v == null ? '' : String(v));
    });
    // Prevent formula injection from user input
    const safe = row.map(v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v);
    // Keep phone numbers as text
    sheet.appendRow(safe);

    if (NOTIFY_EMAIL) {
      MailApp.sendEmail(NOTIFY_EMAIL, 'New vendor registration: ' + data.company_name + ' (' + ref + ')',
        'Company: ' + data.company_name + '\nType: ' + data.vendor_type + '\nContact: ' +
        data.first_name + ' ' + data.last_name + ', ' + data.phone + ', ' + data.email +
        '\n\nSheet: ' + SpreadsheetApp.getActive().getUrl());
    }
    return { ok: true, ref: ref };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */

function setup() {
  getSheet_();
  getRootFolder_();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME, 0);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNS.map(c => c[1]));
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold').setBackground('#141518').setFontColor('#FFC400');
    sh.setFrozenRows(1);
    const phoneCol = COLUMNS.findIndex(c => c[0] === 'phone') + 1;
    sh.getRange(2, phoneCol, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    const statusCol = COLUMNS.findIndex(c => c[0] === 'status') + 1;
    sh.getRange(2, statusCol, sh.getMaxRows() - 1, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(['New', 'In Review', 'Approved', 'Rejected']).build());
  }
  return sh;
}

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('UPLOAD_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const folder = DriveApp.createFolder(UPLOAD_FOLDER_NAME);
  props.setProperty('UPLOAD_FOLDER_ID', folder.getId());
  return folder;
}

function getVendorFolder_(name) {
  return getRootFolder_().createFolder(name.replace(/[\\/:*?"<>|]/g, '').slice(0, 100));
}
