const EMS_ROLES = ['ems_super_admin', 'admin', 'hr', 'manager', 'employee']

const EMS_ROLE_GROUPS = {
  admin: ['ems_super_admin', 'admin'],
  hr: ['ems_super_admin', 'admin', 'hr'],
  manager: ['ems_super_admin', 'admin', 'hr', 'manager'],
  employee: EMS_ROLES
}

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern', 'Consultant']
const EMPLOYEE_STATUSES = ['active', 'inactive', 'onboarding', 'terminated']
const ATTENDANCE_STATUSES = ['present', 'absent', 'late', 'half_day', 'on_leave', 'holiday', 'leave']
const LEAVE_TYPES = ['Casual', 'Sick', 'Earned', 'Maternity', 'Unpaid']
const LEAVE_STATUSES = ['pending_manager', 'pending_hr', 'approved', 'rejected', 'cancelled']
const PAYROLL_STATUSES = ['Draft', 'Released']
const DOCUMENT_TYPES = ['Offer Letter', 'ID Proof', 'Certificate', 'Experience Letter', 'Other']
const WORK_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const DEFAULT_LEAVE_ALLOCATIONS = {
  Casual: 12,
  Sick: 12,
  Earned: 15,
  Maternity: 180,
  Unpaid: 0
}

module.exports = {
  EMS_ROLES,
  EMS_ROLE_GROUPS,
  EMPLOYMENT_TYPES,
  EMPLOYEE_STATUSES,
  ATTENDANCE_STATUSES,
  LEAVE_TYPES,
  LEAVE_STATUSES,
  PAYROLL_STATUSES,
  DOCUMENT_TYPES,
  DEFAULT_LEAVE_ALLOCATIONS,
  WORK_DAYS
}
