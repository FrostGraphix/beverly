/**
 * @typedef {Object} ApiEnvelope
 * @property {number} code
 * @property {string=} msg
 * @property {string=} reason
 * @property {unknown=} data
 * @property {unknown=} result
 */

/**
 * @typedef {Object} LoginData
 * @property {string} token
 * @property {string} userId
 * @property {string} userName
 * @property {string} roleId
 * @property {string} remark
 */

/**
 * @typedef {ApiEnvelope & { data: LoginData }} LoginResponse
 */

/**
 * @typedef {Object} UserProfileState
 * @property {string} name
 * @property {string} email
 * @property {string} phone
 */

/**
 * @typedef {Object} UserPreferenceState
 * @property {string} theme
 * @property {boolean} compact
 * @property {boolean} emailAlerts
 * @property {boolean} tokenAlerts
 * @property {boolean} systemAlerts
 */

/**
 * @typedef {Object} PasswordChangePayload
 * @property {string} currentPassword
 * @property {string} newPassword
 */

export const apiContractVersion = "2026-05-production-hardening";

export const apiContractPaths = Object.freeze({
  login: "/api/user/login",
  currentUser: "/api/user/read",
  profileUpdate: "/api/user/profile",
  passwordChange: "/api/user/changePassword"
});
