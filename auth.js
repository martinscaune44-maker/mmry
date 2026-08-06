// ---------------------------------------------------------------------------
// MMRY — accounts.
//
// Supabase Auth over plain fetch, for the same reason share.js avoids the SDK:
// no CDN dependency, nothing to go stale, and the whole surface is four
// endpoints.
//
// Signing in is optional and always will be. Building a walk, recording it and
// publishing it all work signed out — an account buys you the ability to find
// your walks again and to decide who can open them. Putting a login form in
// front of the thing itself would be the fastest way to kill it.
// ---------------------------------------------------------------------------

const MmryAuth = {
  STORAGE_KEY: "mmry.session",
  _session: null,
  _listeners: [],

  // ---- Session -------------------------------------------------------------

  // Read once at startup. A session is { access_token, refresh_token,
  // expires_at, user }.
  init() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      this._session = raw ? JSON.parse(raw) : null;
    } catch (_) {
      this._session = null;
    }

    // Signing in with Google (or by magic link) sends the browser back here
    // with the tokens in the URL fragment.
    this._consumeRedirect();
    return this._session;
  },

  session() {
    return this._session;
  },

  user() {
    return this._session ? this._session.user : null;
  },

  signedIn() {
    return Boolean(this._session);
  },

  onChange(fn) {
    this._listeners.push(fn);
  },

  _announce() {
    this._listeners.forEach((fn) => {
      try {
        fn(this._session);
      } catch (err) {
        console.warn("Auth listener failed:", err);
      }
    });
  },

  _store(payload) {
    // Supabase returns expires_in (seconds); an absolute time is what refresh
    // logic actually needs, and it survives the page being closed.
    const expiresAt = payload.expires_at
      ? payload.expires_at * 1000
      : Date.now() + (payload.expires_in || 3600) * 1000;

    this._session = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_at: expiresAt,
      user: payload.user || this.user(),
    };

    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._session));
    this._announce();
    return this._session;
  },

  _clear() {
    this._session = null;
    localStorage.removeItem(this.STORAGE_KEY);
    this._announce();
  },

  // ---- Requests ------------------------------------------------------------

  async _post(path, body, { withToken = false } = {}) {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    };
    headers.Authorization = `Bearer ${
      withToken && this._session ? this._session.access_token : SUPABASE_ANON_KEY
    }`;

    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_) {
      /* not JSON */
    }

    if (!response.ok) {
      throw new Error(this._readableError(payload, text, response.status));
    }

    return payload;
  },

  // Supabase's own wording is often either cryptic or alarming out of context.
  _readableError(payload, text, status) {
    const raw = (payload && (payload.msg || payload.error_description || payload.message)) || text;

    if (/already registered/i.test(raw)) {
      return "There's already an account with that email. Try signing in instead.";
    }
    if (/invalid login credentials/i.test(raw)) {
      return "That email and password don't match an account.";
    }
    if (/email not confirmed/i.test(raw)) {
      return "Check your inbox and click the confirmation link first.";
    }
    if (/password should be at least/i.test(raw)) {
      return "Passwords need to be at least 6 characters.";
    }
    if (/rate limit|too many/i.test(raw)) {
      return "Too many attempts. Wait a minute and try again.";
    }
    if (status === 0 || !raw) return "Couldn't reach the server. Check your connection.";
    return raw;
  },

  // ---- Ways in -------------------------------------------------------------

  // redirect_to is a query parameter on GoTrue's REST API, not a body field —
  // the "options.emailRedirectTo" shape belongs to the JS SDK, and passing it
  // in the body is accepted and then quietly ignored, sending people to the
  // project's default Site URL instead.
  async signUp(email, password) {
    const redirect = encodeURIComponent(this.redirectTarget());
    const payload = await this._post(`signup?redirect_to=${redirect}`, {
      email,
      password,
    });

    // With email confirmation switched on, signup returns a user but no
    // session — there is nothing to store yet and the caller has to say so.
    if (!payload || !payload.access_token) {
      return { confirmationRequired: true, email };
    }
    this._store(payload);
    return { confirmationRequired: false };
  },

  async signIn(email, password) {
    const payload = await this._post("token?grant_type=password", { email, password });
    return this._store(payload);
  },

  // No password anywhere: Supabase emails a link, tapping it lands back on the
  // page with tokens in the fragment. The least painful way in on a phone.
  async signInWithMagicLink(email) {
    const redirect = encodeURIComponent(this.redirectTarget());
    await this._post(`otp?redirect_to=${redirect}`, { email, create_user: true });
  },

  // OAuth is a full page redirect rather than a fetch — the provider needs to
  // own the window to show its own consent screen.
  signInWithGoogle() {
    this._startOAuth("google");
  },

  // Sign in with Apple needs a Services ID, which needs the paid Apple
  // Developer Program. The moment that account exists, enable Apple in the
  // Supabase dashboard and this line is the entire client-side change.
  signInWithApple() {
    this._startOAuth("apple");
  },

  _startOAuth(provider) {
    const target = encodeURIComponent(this.redirectTarget());
    location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${target}`;
  },

  // Where a provider or an emailed link should send the browser back to. This
  // exact URL has to be on Supabase's allow list, or the redirect silently
  // lands on the site root instead.
  redirectTarget() {
    return location.href.replace(/#.*$/, "").replace(/\/[^/]*$/, "/account.html");
  },

  async signOut() {
    if (this._session) {
      // Best effort. A network failure here must not leave somebody stuck
      // looking signed in on their own device.
      try {
        await this._post("logout", {}, { withToken: true });
      } catch (err) {
        console.warn("Sign-out request failed:", err);
      }
    }
    this._clear();
  },

  // ---- Redirect handling ---------------------------------------------------

  // Supabase returns tokens in the fragment (#access_token=…), which never
  // reaches a server. Consume it and scrub the address bar so a shared or
  // bookmarked URL cannot carry a live session.
  _consumeRedirect() {
    const hash = location.hash.startsWith("#") ? location.hash.slice(1) : "";
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get("access_token");
    const error = params.get("error_description") || params.get("error");

    if (!accessToken && !error) return;

    history.replaceState(null, "", location.pathname + location.search);

    if (error) {
      this._redirectError = error.replace(/\+/g, " ");
      return;
    }

    this._store({
      access_token: accessToken,
      refresh_token: params.get("refresh_token"),
      expires_in: Number(params.get("expires_in")) || 3600,
    });

    // The fragment carries no user object, so fetch it before anything asks.
    this._loadUser().catch((err) => console.warn("Could not load user:", err));
  },

  // An error carried back from a provider, if the last redirect failed.
  redirectError() {
    const message = this._redirectError;
    this._redirectError = null;
    return message;
  },

  async _loadUser() {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${this._session.access_token}`,
      },
    });
    if (!response.ok) return;
    this._session.user = await response.json();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this._session));
    this._announce();
  },

  // ---- Tokens --------------------------------------------------------------

  // Every authenticated request goes through here. Refreshing a minute early
  // avoids a token expiring mid-upload, which on a slow connection is a real
  // window rather than a theoretical one.
  async accessToken() {
    if (!this._session) return null;

    if (Date.now() < this._session.expires_at - 60000) {
      return this._session.access_token;
    }

    try {
      const payload = await this._post("token?grant_type=refresh_token", {
        refresh_token: this._session.refresh_token,
      });
      this._store(payload);
      return this._session.access_token;
    } catch (err) {
      // A refresh token that no longer works means the session is genuinely
      // over — password changed, signed out elsewhere, or simply too old.
      console.warn("Session expired:", err);
      this._clear();
      return null;
    }
  },

  // The Authorization header for a data request: the user's token when there
  // is one, the anon key when there is not. Both are valid to Supabase; which
  // one is used is what the RLS policies key off.
  async headers() {
    const token = await this.accessToken();
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    };
  },
};

MmryAuth.init();
