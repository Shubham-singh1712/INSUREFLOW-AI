const ROLES = {
  ADMIN: 'admin',
  HOSPITAL_ADMIN: 'hospital_admin',
  INSURANCE_DESK: 'insurance_desk',
  BILLING_EXECUTIVE: 'billing_executive',
  COMPLIANCE_OFFICER: 'compliance_officer',
};

const STAFF_ROLES = [
  ROLES.ADMIN,
  ROLES.HOSPITAL_ADMIN,
  ROLES.INSURANCE_DESK,
  ROLES.BILLING_EXECUTIVE,
  ROLES.COMPLIANCE_OFFICER,
];

module.exports = { ROLES, STAFF_ROLES };
