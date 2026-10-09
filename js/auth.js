(function () {
  "use strict";

  const app = window.App;
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function getMessage(payload) {
    if (!payload || typeof payload !== "object") return "";
    return typeof payload.message === "string" ? payload.message : "";
  }

  function setFormError(form, message) {
    const error = form.querySelector("#form-error");
    if (error) error.textContent = message;
  }

  function validateLogin(form) {
    let valid = true;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !emailPattern.test(email)) {
      app.setFieldError(form.elements.email, "Enter a valid email address.");
      valid = false;
    }
    if (!password) {
      app.setFieldError(form.elements.password, "Enter your password.");
      valid = false;
    }
    return valid;
  }

  function validateRegistration(form) {
    let valid = true;
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const confirmation = form.elements.confirmPassword.value;
    if (name.length < 2) {
      app.setFieldError(form.elements.name, "Enter your name (at least 2 characters).");
      valid = false;
    }
    if (!emailPattern.test(email)) {
      app.setFieldError(form.elements.email, "Enter a valid email address.");
      valid = false;
    }
    if (password.length < 8) {
      app.setFieldError(form.elements.password, "Use a password with at least 8 characters.");
      valid = false;
    }
    if (confirmation !== password || !confirmation) {
      app.setFieldError(form.elements.confirmPassword, "Your passwords do not match.");
      valid = false;
    }
    return valid;
  }

  function attachLiveClear(form) {
    form.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", () => {
        app.setFieldError(input, "");
        setFormError(form, "");
      });
    });
  }

  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    attachLiveClear(loginForm);
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors(loginForm);
      if (!validateLogin(loginForm)) return;
      const button = loginForm.querySelector('[type="submit"]');
      app.setButtonLoading(button, true, "Logging you in…");
      try {
        const payload = await app.request("/api/login", {
          method: "POST",
          body: JSON.stringify({
            email: loginForm.elements.email.value.trim(),
            password: loginForm.elements.password.value
          })
        });
        const response = payload && typeof payload === "object" ? payload : {};
        const data = response.data && typeof response.data === "object" ? response.data : response;
        const user = data.user && typeof data.user === "object" ? data.user : {
          name: data.name,
          email: data.email || loginForm.elements.email.value.trim()
        };
        const token = data.token || data.access_token;
        app.saveSession(token, user);
        app.showToast(`Welcome back${user.name ? `, ${user.name}` : ""}!`, "success");
        window.location.assign("dashboard.html");
      } catch (error) {
        setFormError(loginForm, error.message || "We couldn’t log you in. Please try again.");
      } finally {
        app.setButtonLoading(button, false);
      }
    });
  }

  const registerForm = document.getElementById("register-form");
  if (registerForm) {
    attachLiveClear(registerForm);
    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      app.clearFormErrors(registerForm);
      if (!validateRegistration(registerForm)) return;
      const button = registerForm.querySelector('[type="submit"]');
      const name = registerForm.elements.name.value.trim();
      const email = registerForm.elements.email.value.trim();
      app.setButtonLoading(button, true, "Creating your account…");
      try {
        const payload = await app.request("/api/register", {
          method: "POST",
          body: JSON.stringify({
            name,
            email,
            password: registerForm.elements.password.value
          })
        });
        const response = payload && typeof payload === "object" ? payload : {};
        const data = response.data && typeof response.data === "object" ? response.data : response;
        const token = data.token || data.access_token;
        if (token) {
          const user = data.user && typeof data.user === "object" ? data.user : { name, email };
          app.saveSession(token, user);
          app.showToast("Your account is ready. Welcome to Prepwise!", "success");
          window.location.assign("dashboard.html");
        } else {
          app.showToast(getMessage(payload) || "Your account is ready. Log in to start preparing.", "success");
          window.location.assign("login.html");
        }
      } catch (error) {
        setFormError(registerForm, error.message || "We couldn’t create your account. Please try again.");
      } finally {
        app.setButtonLoading(button, false);
      }
    });
  }
})();
