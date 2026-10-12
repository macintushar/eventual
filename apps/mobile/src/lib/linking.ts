/** The app's URL scheme (`scheme` in app.json); the server trusts `eventual://`. */
export const NATIVE_SCHEME = "eventual";

/**
 * Where the emailed reset link sends the browser back to. The server checks
 * it against its trusted origins, then appends `?token=…`.
 */
export const RESET_PASSWORD_URL = `${NATIVE_SCHEME}://reset-password`;
