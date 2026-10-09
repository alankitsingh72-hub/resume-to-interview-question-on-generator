(function () {
  "use strict";

  const STORAGE_KEY = "prepwise.auth";

  function readSession() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (!value) return null;
      const session = JSON.parse(value);
      return session && typeof session.token === "string" && session.token ? session : null;
    } catch (error) {
      console.error("Unable to read the saved session.", error);
      return null;
    }
  }

  function saveSession(token, user) {
    if (typeof token !== "string" || !token.trim()) {
      throw new Error("The server response did not include a valid login token.");
    }
    const session = { token, user: user && typeof user === "object" ? user : {} };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } catch (error) {
      throw new Error("Your browser could not save your session. Check your storage settings and try again.");
    }
    return session;
  }

  function clearSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function getUser() {
    const session = readSession();
    return session ? session.user : {};
  }

  function getToken() {
    const session = readSession();
    return session ? session.token : null;
  }

  function logout() {
    clearSession();
    window.location.assign("login.html");
  }

  async function request(url, options) {
    const config = options ? { ...options } : {};
    const headers = new Headers(config.headers || {});
    const token = getToken();
    if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
    if (config.body && !(config.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    config.headers = headers;

    let response;
    try {
      response = await fetch(url, config);
    } catch {
      throw new Error(`Could not reach ${url}. Make sure your backend is running and serves this API on the same origin as the frontend.`);
    }

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object"
        ? payload.message || payload.error || payload.detail
        : typeof payload === "string" ? payload : "";
      throw new Error(message || `The request failed (${response.status}). Please try again.`);
    }
    return payload;
  }

  function showToast(message, type) {
    const region = document.querySelector(".toast-region");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type || "info"}`;
    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = type === "success" ? "✓" : type === "error" ? "!" : "✳";
    const text = document.createElement("span");
    text.textContent = message;
    toast.append(icon, text);
    region.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add("toast-out");
      window.setTimeout(() => toast.remove(), 220);
    }, 4200);
  }

  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      button.dataset.originalContent = button.innerHTML;
      button.disabled = true;
      button.classList.add("is-loading");
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${label || "Please wait…"}</span>`;
      button.setAttribute("aria-busy", "true");
    } else {
      if (button.dataset.originalContent) button.innerHTML = button.dataset.originalContent;
      delete button.dataset.originalContent;
      button.disabled = false;
      button.classList.remove("is-loading");
      button.removeAttribute("aria-busy");
    }
  }

  function setFieldError(input, message) {
    if (!input) return;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    const errorId = input.getAttribute("aria-describedby");
    const error = errorId ? document.getElementById(errorId) : null;
    if (error) error.textContent = message || "";
  }

  function clearFormErrors(form) {
    form.querySelectorAll("input").forEach((input) => setFieldError(input, ""));
    const formError = form.querySelector(".form-error");
    if (formError) formError.textContent = "";
  }

  function setCurrentYear() {
    document.querySelectorAll("[data-current-year]").forEach((element) => {
      element.textContent = String(new Date().getFullYear());
    });
  }

  function updateHomeLinks() {
    if (!document.body.classList.contains("page-home")) return;
    if (getToken()) {
      document.querySelectorAll('[data-auth-link="login"], [data-auth-link="register"]').forEach((link) => {
        link.href = "dashboard.html";
      });
      const cta = document.querySelector('.header-nav [data-auth-link="register"]');
      if (cta) cta.textContent = "Go to dashboard ↗";
    }
  }

  function setupPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        if (!input) return;
        const showing = input.type === "text";
        input.type = showing ? "password" : "text";
        button.textContent = showing ? "Show" : "Hide";
        button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      });
    });
  }

  function setupMobileNavigation() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".header-nav");
    if (toggle && nav) {
      toggle.addEventListener("click", () => {
        const open = toggle.getAttribute("aria-expanded") !== "true";
        toggle.setAttribute("aria-expanded", String(open));
        nav.classList.toggle("nav-open", open);
      });
    }

    const sidebarToggle = document.querySelector(".mobile-sidebar-toggle");
    const sidebar = document.getElementById("app-sidebar");
    const overlay = document.getElementById("sidebar-overlay");
    const closeSidebar = () => {
      if (sidebar) sidebar.classList.remove("sidebar-open");
      if (overlay) overlay.classList.remove("overlay-open");
      if (sidebarToggle) sidebarToggle.setAttribute("aria-expanded", "false");
    };
    if (sidebarToggle && sidebar && overlay) {
      sidebarToggle.addEventListener("click", () => {
        const open = !sidebar.classList.contains("sidebar-open");
        sidebar.classList.toggle("sidebar-open", open);
        overlay.classList.toggle("overlay-open", open);
        sidebarToggle.setAttribute("aria-expanded", String(open));
      });
      overlay.addEventListener("click", closeSidebar);
      sidebar.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", closeSidebar));
    }
  }

  function setupSessionGuards() {
    const isDashboard = document.body.classList.contains("app-page");
    const isAuthPage = document.body.classList.contains("auth-page");
    const hasToken = Boolean(getToken());
    if (isDashboard && !hasToken) window.location.replace("login.html");
    if (isAuthPage && hasToken) window.location.replace("dashboard.html");
  }

  document.addEventListener("DOMContentLoaded", () => {
    setCurrentYear();
    updateHomeLinks();
    setupPasswordToggles();
    setupMobileNavigation();
    setupSessionGuards();
  });

  window.App = {
    clearFormErrors,
    clearSession,
    getToken,
    getUser,
    logout,
    readSession,
    request,
    saveSession,
    setButtonLoading,
    setFieldError,
    showToast
  };
})();
