;(function () {
  var serverKey = "opencode.settings.dat:defaultServerUrl"
  var layoutKey = "opencode.global.dat:layout"
  var legacyLayoutKey = "layout.v6"
  var script = document.currentScript
  var basePath = ""

  try {
    if (script && script.src) {
      basePath = new URL(script.src).pathname.replace(/\/oc-theme-preload\.js$/, "")
    }
  } catch {}

  if (!basePath && location.pathname) {
    basePath = location.pathname.replace(/\/$/, "")
  }

  try {
    var storedServer = localStorage.getItem(serverKey)
    if (storedServer) {
      var parsed = new URL(storedServer)
      var normalized = location.origin + basePath
      if (parsed.origin === location.origin && (!parsed.pathname || parsed.pathname === "/")) {
        localStorage.setItem(serverKey, normalized)
      }
    }
  } catch {
    try {
      localStorage.removeItem(serverKey)
    } catch {}
  }

  try {
    localStorage.removeItem(layoutKey)
    localStorage.removeItem(legacyLayoutKey)
  } catch {}

  var key = "opencode-theme-id"
  var themeId = localStorage.getItem(key) || "oc-2"

  if (themeId === "oc-1") {
    themeId = "oc-2"
    localStorage.setItem(key, themeId)
    localStorage.removeItem("opencode-theme-css-light")
    localStorage.removeItem("opencode-theme-css-dark")
  }

  var scheme = localStorage.getItem("opencode-color-scheme") || "system"
  var isDark = scheme === "dark" || (scheme === "system" && matchMedia("(prefers-color-scheme: dark)").matches)
  var mode = isDark ? "dark" : "light"

  document.documentElement.dataset.theme = themeId
  document.documentElement.dataset.colorScheme = mode

  if (themeId === "oc-2") return

  var css = localStorage.getItem("opencode-theme-css-" + mode)
  if (css) {
    var style = document.createElement("style")
    style.id = "oc-theme-preload"
    style.textContent =
      ":root{color-scheme:" +
      mode +
      ";--text-mix-blend-mode:" +
      (isDark ? "plus-lighter" : "multiply") +
      ";" +
      css +
      "}"
    document.head.appendChild(style)
  }
})()
