// ---------------------------------------------------------------------------
// MMRY — signing in, and the walks you have published.
//
// Two panels on one page: the sign-in form, and the list. Which one shows is
// decided entirely by whether there is a session, so coming back from a magic
// link or from Google lands on the list without any extra navigation.
// ---------------------------------------------------------------------------

const el = (id) => document.getElementById(id);

let walks = [];
let activeTag = null;

// ---- Panels -----------------------------------------------------------------

function showPanels() {
  const signedIn = MmryAuth.signedIn();
  el("sign-in-panel").hidden = signedIn;
  el("walks-panel").hidden = !signedIn;

  if (signedIn) {
    const user = MmryAuth.user();
    el("signed-in-as").textContent = user && user.email ? user.email : "Signed in";
    loadWalks();
  }
}

function setAuthStatus(message, tone = "") {
  const status = el("auth-status");
  status.textContent = message;
  status.className = tone;
}

function setWalksStatus(message, tone = "") {
  const status = el("walks-status");
  status.textContent = message;
  status.className = tone;
}

// ---- Signing in --------------------------------------------------------------

el("sign-in-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || !password) {
    setAuthStatus("Enter your email and password.", "warn");
    return;
  }

  setAuthStatus("Signing in…");
  try {
    await MmryAuth.signIn(email, password);
    setAuthStatus("");
    showPanels();
  } catch (err) {
    setAuthStatus(err.message, "warn");
  }
});

el("sign-up").addEventListener("click", async () => {
  const email = el("email").value.trim();
  const password = el("password").value;
  if (!email || password.length < 6) {
    setAuthStatus("Enter an email and a password of at least 6 characters.", "warn");
    return;
  }

  setAuthStatus("Creating your account…");
  try {
    const { confirmationRequired } = await MmryAuth.signUp(email, password);
    if (confirmationRequired) {
      // This project has email confirmation switched on, so signing up hands
      // back a user but no session. Saying "check your inbox" is the whole
      // difference between working and appearing broken.
      setAuthStatus(
        `Check ${email} for a confirmation link, then come back and sign in.`,
        "ok"
      );
      return;
    }
    setAuthStatus("");
    showPanels();
  } catch (err) {
    setAuthStatus(err.message, "warn");
  }
});

el("magic-link").addEventListener("click", async () => {
  const email = el("email").value.trim();
  if (!email) {
    setAuthStatus("Enter your email first.", "warn");
    return;
  }

  setAuthStatus("Sending…");
  try {
    await MmryAuth.signInWithMagicLink(email);
    setAuthStatus(`Sent. Open the link in ${email} on the device you want to use.`, "ok");
  } catch (err) {
    setAuthStatus(err.message, "warn");
  }
});

el("google").addEventListener("click", () => {
  setAuthStatus("Opening Google…");
  MmryAuth.signInWithGoogle();
});

el("sign-out").addEventListener("click", async () => {
  await MmryAuth.signOut();
  walks = [];
  activeTag = null;
  showPanels();
});

// ---- The list ----------------------------------------------------------------

async function loadWalks() {
  setWalksStatus("Loading your walks…");
  try {
    walks = await MmryShare.mine();
    setWalksStatus("");
    renderFilters();
    renderWalks();
  } catch (err) {
    setWalksStatus(err.message, "warn");
  }
}

// Only tags actually in use are offered. A filter row listing every possible
// tag when six of them match nothing is a row of dead ends.
function renderFilters() {
  const host = el("walk-filters");
  host.innerHTML = "";

  const used = TAG_VOCABULARY.filter((tag) => walks.some((w) => w.tags.includes(tag)));
  if (used.length === 0) return;

  const makeChip = (label, value) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = label;
    chip.classList.toggle("on", activeTag === value);
    chip.setAttribute("aria-pressed", String(activeTag === value));
    chip.addEventListener("click", () => {
      activeTag = activeTag === value ? null : value;
      renderFilters();
      renderWalks();
    });
    return chip;
  };

  host.appendChild(makeChip("All", null));
  used.forEach((tag) => host.appendChild(makeChip(tag, tag)));
}

const VISIBILITY_LABELS = {
  private: "Only me",
  unlisted: "Anyone with the link",
  public: "Public",
};

function renderWalks() {
  const list = el("walk-list");
  list.innerHTML = "";

  const shown = activeTag ? walks.filter((w) => w.tags.includes(activeTag)) : walks;

  if (shown.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = walks.length
      ? "No walks with that tag."
      : "Nothing published yet. Build a walk and tap Share.";
    list.appendChild(empty);
    return;
  }

  shown.forEach((walk) => list.appendChild(renderWalk(walk)));
}

function renderWalk(walk) {
  const li = document.createElement("li");
  li.className = "walk";

  const head = document.createElement("div");
  head.className = "walk-head";

  const name = document.createElement("span");
  name.className = "walk-name";
  name.textContent = walk.name || "Untitled journey";

  const count = document.createElement("span");
  count.className = "walk-count";
  const n = walk.checkpoints.length;
  count.textContent = `${n} stop${n === 1 ? "" : "s"}`;

  head.append(name, count);

  // --- link
  const linkRow = document.createElement("div");
  linkRow.className = "walk-link";

  const link = document.createElement("input");
  link.type = "text";
  link.readOnly = true;
  link.value = MmryShare.linkFor(walk.id);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "secondary";
  copy.textContent = "Copy";
  copy.addEventListener("click", async () => {
    // The share sheet reaches Messages and WhatsApp directly, which is how a
    // walk actually gets sent to someone.
    if (navigator.share) {
      try {
        await navigator.share({ title: walk.name || "A soundwalk", url: link.value });
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(link.value);
      copy.textContent = "Copied";
      setTimeout(() => (copy.textContent = "Copy"), 1500);
    } catch (_) {
      link.select();
    }
  });

  linkRow.append(link, copy);

  // --- controls
  const controls = document.createElement("div");
  controls.className = "walk-controls";

  const visibility = document.createElement("select");
  ["unlisted", "public", "private"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = VISIBILITY_LABELS[value];
    visibility.appendChild(option);
  });
  visibility.value = walk.visibility;

  visibility.addEventListener("change", async () => {
    const previous = walk.visibility;
    visibility.disabled = true;
    try {
      const updated = await MmryShare.update(walk.id, { visibility: visibility.value });
      walk.visibility = updated.visibility;
      setWalksStatus(
        walk.visibility === "private"
          ? `"${walk.name}" is private now — links to it will stop working for other people.`
          : `"${walk.name}" is ${VISIBILITY_LABELS[walk.visibility].toLowerCase()}.`,
        "ok"
      );
    } catch (err) {
      visibility.value = previous;
      setWalksStatus(err.message, "warn");
    } finally {
      visibility.disabled = false;
    }
  });

  const tags = document.createElement("div");
  tags.className = "walk-tags";
  TAG_VOCABULARY.forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip small";
    chip.textContent = tag;
    const on = walk.tags.includes(tag);
    chip.classList.toggle("on", on);
    chip.setAttribute("aria-pressed", String(on));

    chip.addEventListener("click", async () => {
      const next = walk.tags.includes(tag)
        ? walk.tags.filter((t) => t !== tag)
        : [...walk.tags, tag];

      if (next.length > 5) {
        setWalksStatus("Five tags is the limit.", "warn");
        return;
      }

      chip.disabled = true;
      try {
        const updated = await MmryShare.update(walk.id, { tags: next });
        walk.tags = updated.tags;
        renderFilters();
        renderWalks();
      } catch (err) {
        setWalksStatus(err.message, "warn");
      } finally {
        chip.disabled = false;
      }
    });

    tags.appendChild(chip);
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (
      !confirm(
        `Delete "${walk.name}" and its audio? Anyone you've sent the link to will lose it. This cannot be undone.`
      )
    ) {
      return;
    }

    remove.disabled = true;
    setWalksStatus("Deleting…");
    try {
      await MmryShare.destroy(walk.id);
      walks = walks.filter((w) => w.id !== walk.id);
      setWalksStatus("Deleted.", "ok");
      renderFilters();
      renderWalks();
    } catch (err) {
      setWalksStatus(err.message, "warn");
      remove.disabled = false;
    }
  });

  controls.append(visibility, remove);

  li.append(head, linkRow, tags, controls);
  return li;
}

// ---- Boot ---------------------------------------------------------------------

// A failed redirect back from a provider carries its reason in the fragment,
// which auth.js has already stripped from the address bar.
const redirectError = MmryAuth.redirectError();
if (redirectError) setAuthStatus(redirectError, "warn");

MmryAuth.onChange(showPanels);
showPanels();
