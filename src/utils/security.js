/**
 * Security & LocalStorage Sanitizer
 * - Purges sensitive credentials (password_hash, passwords, tokens)
 * - Removes redundant keys (can_self_assign, email_id, phone, contact, empty keys)
 * - Ensures only essential session and view preference data remain in localStorage
 */
export const sanitizeLocalStorage = () => {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    // 1. Remove credential, sensitive, or redundant loose keys
    const redundantOrSensitiveKeys = [
      "password",
      "password_hash",
      "token",
      "auth_token",
      "can_self_assign",
      "email_id",
      "phone",
      "contact",
      "hasSeenLanguageHint",
    ];

    redundantOrSensitiveKeys.forEach((key) => {
      localStorage.removeItem(key);
    });

    // 2. Remove keys that contain empty string, "null", or "undefined"
    const optionalKeys = [
      "designation",
      "profile_image",
      "department",
      "division",
      "user_access",
      "page_access",
    ];

    optionalKeys.forEach((key) => {
      const val = localStorage.getItem(key);
      if (val === "" || val === "null" || val === "undefined" || val === null) {
        localStorage.removeItem(key);
      }
    });

    // 3. Purge password_hash and password from 'user' in localStorage
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      try {
        const userObj = JSON.parse(rawUser);
        if (userObj && typeof userObj === "object") {
          let touched = false;
          if ("password_hash" in userObj) {
            delete userObj.password_hash;
            touched = true;
          }
          if ("password" in userObj) {
            delete userObj.password;
            touched = true;
          }
          if (touched) {
            localStorage.setItem("user", JSON.stringify(userObj));
          }
        }
      } catch {
        // Ignore parse error
      }
    }

    // 4. Purge password_hash and password from Zustand persisted store 'vpr-systems'
    const rawVpr = localStorage.getItem("vpr-systems");
    if (rawVpr) {
      try {
        const vprObj = JSON.parse(rawVpr);
        if (vprObj?.state?.user) {
          let touched = false;
          if ("password_hash" in vprObj.state.user) {
            delete vprObj.state.user.password_hash;
            touched = true;
          }
          if ("password" in vprObj.state.user) {
            delete vprObj.state.user.password;
            touched = true;
          }
          if (touched) {
            localStorage.setItem("vpr-systems", JSON.stringify(vprObj));
          }
        }
      } catch {
        // Ignore parse error
      }
    }
  } catch {
    // Fail-safe: never throw
  }
};
