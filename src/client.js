/**
 *
 * @public
 * @environment client
 */
export { default } from "./client/index.js";

/**
 *
 * @name actions
 * @kind attribute
 * @environment client
 */

/**
 *
 * @name session
 * @kind attribute
 * @environment client
 */

/**
 *
 * @name user-status
 * @kind attribute
 * @environment client
 */

/**
 * A simple users component in vanilla javascript. Easily configured using HTML5 attributes and/or JavaScript API.
 *
 * @module users
 * @environment client
 */

/**
 * Declarative selectors recognized by this module.
 *
 * @name declarative-selectors
 * @kind member
 * @selectors
 * @environment client
 * @example
 * ```json
 * [
 *   "[actions*=\"signUp\"]",
 *   "[actions*=\"signIn\"]",
 *   "[actions*=\"signOut\"]",
 *   "[actions*=\"inviteUser\"], [actions*=\"acceptInvite\"]",
 *   "[actions*=\"forgotPassword\"], [actions*=\"resetPassword\"]"
 * ]
 * ```
 */
