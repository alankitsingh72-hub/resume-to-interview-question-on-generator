(function () {
  "use strict";

  const app = window.App;
  const categories = [
    { key: "technical", label: "Technical & skills", icon: "</>", style: "category-technical", aliases: ["technical", "skills", "technical_questions", "technical_skill_based_questions", "skill_based", "skill_based_questions", "skill-based"] },
    { key: "project", label: "Project deep-dive", icon: "↗", style: "category-project", aliases: ["project", "projects", "project_questions", "project_based", "project_based_questions", "project-based"] },
    { key: "education", label: "Education & experience", icon: "▤", style: "category-education", aliases: ["education", "experience", "education_experience", "education_experience_questions", "education & experience"] },
    { key: "hr", label: "HR & general", icon: "✳", style: "category-hr", aliases: ["hr", "hr_questions", "general", "general_questions", "behavioral", "hr_general", "hr_general_questions", "hr / general"] }
  ];
  const fileInput = document.getElementById("resume-file");
  const dropZone = document.getElementById("drop-zone");
  const generateButton = document.getElementById("generate-button");
  const selectedFilePanel = document.getElementById("selected-file");
  const errorElement = document.getElementById("generation-error");
  let selectedFile = null;
  let resumeReference = null;
  let lastQuestionsText = "";

  if (!fileInput || !dropZone) return;

  function normalizeName(value) {
    return String(value || "").toLowerCase().replace(/[\s&/.-]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function getSessionUser() {
    const user = app.getUser();
    const name = typeof user.name === "string" && user.name.trim() ? user.name.trim() : "there";
    const email = typeof user.email === "string" ? user.email : "";
    const initials = name === "there" ? (email ? email.charAt(0).toUpperCase() : "?") :
      name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
    document.querySelectorAll("[data-greeting-name]").forEach((element) => { element.textContent = name; });
    document.querySelectorAll("[data-user-name], [data-profile-name]").forEach((element) => {
      element.textContent = element.hasAttribute("data-profile-name") ? (name === "there" ? "Student" : name) : (name === "there" ? "Student" : name);
    });
    document.querySelectorAll("[data-profile-email]").forEach((element) => { element.textContent = email || "Not provided"; });
    document.querySelectorAll("[data-user-initials]").forEach((element) => { element.textContent = initials; });
  }

  function setView(viewName) {
    document.querySelectorAll("[data-app-view]").forEach((view) => {
      view.hidden = view.dataset.appView !== viewName;
    });
    document.querySelectorAll(".sidebar-link").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === viewName);
      button.setAttribute("aria-current", button.dataset.view === viewName ? "page" : "false");
    });
    const label = document.querySelector("[data-current-view-label]");
    const activeButton = document.querySelector(`.sidebar-link[data-view="${viewName}"]`);
    if (label) label.textContent = activeButton ? activeButton.textContent.trim() : "Dashboard";
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll(".logout-button").forEach((button) => button.addEventListener("click", app.logout));

  function selectFile(file) {
    errorElement.textContent = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      selectedFile = null;
      resumeReference = null;
      updateFileDisplay();
      app.showToast("Please choose a PDF file for your resume.", "error");
      return;
    }
    selectedFile = file;
    resumeReference = null;
    updateFileDisplay();
  }

  function updateFileDisplay() {
    const hasFile = Boolean(selectedFile);
    dropZone.classList.toggle("has-file", hasFile);
    selectedFilePanel.hidden = !hasFile;
    generateButton.disabled = !hasFile;
    if (hasFile) selectedFilePanel.querySelector(".selected-file-name").textContent = selectedFile.name;
  }

  fileInput.addEventListener("change", () => {
    selectFile(fileInput.files && fileInput.files[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("click", (event) => {
    if (event.target.closest(".remove-file")) return;
    fileInput.click();
  });
  dropZone.addEventListener("keydown", (event) => {
    if (event.target === dropZone && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      fileInput.click();
    }
  });
  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", (event) => {
    if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    dropZone.classList.remove("drag-over");
    selectFile(event.dataTransfer.files && event.dataTransfer.files[0]);
  });
  selectedFilePanel.querySelector(".remove-file").addEventListener("click", (event) => {
    event.stopPropagation();
    selectedFile = null;
    resumeReference = null;
    updateFileDisplay();
    fileInput.value = "";
  });

  function setProgress(label, percent) {
    document.getElementById("progress-label").textContent = label;
    document.getElementById("progress-percent").textContent = `${percent}%`;
    document.getElementById("progress-bar").style.width = `${percent}%`;
  }

  function getReference(payload) {
    if (!payload || typeof payload !== "object") return null;
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    const id = data.resume_id || data.resumeId || data.id;
    if (id !== undefined && id !== null && String(id).trim()) return { resume_id: id };
    const text = data.resume_text || data.resumeText || data.text;
    if (typeof text === "string" && text.trim()) return { resume_text: text };
    return null;
  }

  async function uploadResume() {
    if (!selectedFile) throw new Error("Choose a PDF resume before generating questions.");
    setProgress("Uploading your resume…", 12);
    const formData = new FormData();
    formData.append("file", selectedFile);
    const payload = await app.request("/api/upload-resume", { method: "POST", body: formData });
    setProgress("Resume uploaded. Preparing your questions…", 40);
    resumeReference = getReference(payload);
    if (!resumeReference) {
      throw new Error("Your resume uploaded, but the server did not return a resume ID or resume text. Please check the upload API response.");
    }
    return resumeReference;
  }

  function extractQuestionText(question) {
    if (typeof question === "string") return question.trim();
    if (!question || typeof question !== "object") return "";
    const text = question.question || question.text || question.prompt || question.title;
    return typeof text === "string" ? text.trim() : "";
  }

  function normalizeQuestions(payload) {
    const data = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
      ? payload.data : payload;
    const source = data && typeof data === "object" ? (data.questions || data) : null;
    const normalized = new Map(categories.map((category) => [category.key, []]));
    if (Array.isArray(source)) {
      source.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const categoryValue = normalizeName(item.category || item.type || item.section);
        const category = categories.find((candidate) => candidate.aliases.some((alias) => normalizeName(alias) === categoryValue));
        if (category) {
          const text = extractQuestionText(item);
          if (text) normalized.get(category.key).push(text);
        }
      });
      return normalized;
    }
    if (source && typeof source === "object") {
      categories.forEach((category) => {
        let list;
        for (const [key, value] of Object.entries(source)) {
          if (category.aliases.some((alias) => normalizeName(alias) === normalizeName(key))) {
            list = value;
            break;
          }
        }
        if (Array.isArray(list)) {
          normalized.set(category.key, list.map(extractQuestionText).filter(Boolean));
        } else if (typeof list === "string" && list.trim()) {
          normalized.set(category.key, [list.trim()]);
        }
      });
    }
    return normalized;
  }

  function renderQuestions(questionMap) {
    const container = document.getElementById("questions-list");
    container.replaceChildren();
    let total = 0;
    categories.forEach((category) => {
      const questions = questionMap.get(category.key) || [];
      total += questions.length;
      const card = document.createElement("article");
      card.className = "question-group";
      const heading = document.createElement("div");
      heading.className = "question-group-heading";
      const icon = document.createElement("span");
      icon.className = `question-category-icon ${category.style}`;
      icon.textContent = category.icon;
      const title = document.createElement("h3");
      title.textContent = category.label;
      const count = document.createElement("span");
      count.className = "question-total";
      count.textContent = `${questions.length} ${questions.length === 1 ? "question" : "questions"}`;
      heading.append(icon, title, count);
      card.appendChild(heading);
      if (questions.length) {
        const list = document.createElement("ol");
        list.className = "question-list";
        questions.forEach((question) => {
          const item = document.createElement("li");
          item.textContent = question;
          const saveButton = document.createElement("button");
          saveButton.type = "button";
          saveButton.className = "question-save-button";
          saveButton.textContent = "Save";
          saveButton.setAttribute("aria-label", `Save question: ${question}`);
          saveButton.addEventListener("click", async () => {
            try {
              await app.request("/api/saved-questions", {
                method: "POST",
                body: JSON.stringify({ question, category: category.label })
              });
              app.showToast("Question saved to your vault.", "success");
            } catch (error) {
              app.showToast(error.message, "error");
            }
          });
          item.append(saveButton);
          list.appendChild(item);
        });
        card.appendChild(list);
      } else {
        const empty = document.createElement("div");
        empty.className = "question-empty";
        empty.textContent = "No questions in this category.";
        card.appendChild(empty);
      }
      container.appendChild(card);
    });
    if (!total) throw new Error("The questions API returned no questions in the expected categories. Check its response format.");
    lastQuestionsText = categories.flatMap((category) => {
      const questions = questionMap.get(category.key) || [];
      return questions.length ? [`${category.label}`, ...questions.map((question, index) => `${index + 1}. ${question}`)] : [];
    }).join("\n");
    document.getElementById("questions-section").hidden = false;
    document.getElementById("empty-note").hidden = true;
  }

  async function generateQuestions() {
    errorElement.textContent = "";
    const progress = document.getElementById("progress-wrap");
    progress.hidden = false;
    generateButton.disabled = true;
    document.getElementById("generate-again").disabled = true;
    const originalLabel = generateButton.innerHTML;
    generateButton.classList.add("is-loading");
    generateButton.setAttribute("aria-busy", "true");
    generateButton.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Creating your plan…</span>';
    try {
      const reference = resumeReference || await uploadResume();
      setProgress("Finding the questions that fit your experience…", 60);
      const response = await app.request("/api/generate-questions", {
        method: "POST",
        body: JSON.stringify(reference)
      });
      setProgress("Putting your practice plan together…", 85);
      let payload = response;
      const responseData = response && typeof response === "object" && response.data && typeof response.data === "object"
        ? response.data : response;
      const hasQuestionData = responseData && typeof responseData === "object" &&
        (responseData.questions || categories.some((category) => category.aliases.some((alias) => normalizeName(alias) in responseData)));
      if (!hasQuestionData) {
        payload = await app.request("/api/questions", { method: "GET" });
      }
      renderQuestions(normalizeQuestions(payload));
      setProgress("Your practice plan is ready.", 100);
      app.showToast(response.generator === "local"
        ? "Your starter questions are ready. Add an OpenAI API key for AI-generated questions."
        : "Your AI-generated interview questions are ready.", "success");
      document.getElementById("questions-section").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      errorElement.textContent = error.message || "We couldn’t generate your questions. Please try again.";
      app.showToast(errorElement.textContent, "error");
      setProgress("We couldn’t finish. Please try again.", 0);
    } finally {
      generateButton.classList.remove("is-loading");
      generateButton.removeAttribute("aria-busy");
      generateButton.innerHTML = originalLabel;
      generateButton.disabled = !selectedFile;
      document.getElementById("generate-again").disabled = false;
    }
  }

  generateButton.addEventListener("click", generateQuestions);
  document.getElementById("generate-again").addEventListener("click", generateQuestions);
  document.getElementById("copy-questions").addEventListener("click", async () => {
    if (!lastQuestionsText) {
      app.showToast("Generate your questions before copying them.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(lastQuestionsText);
      app.showToast("All questions copied to your clipboard.", "success");
    } catch (error) {
      app.showToast("Clipboard access isn’t available. Check your browser permissions and try again.", "error");
    }
  });

  document.querySelectorAll("[data-app-view]").forEach((view) => { view.hidden = view.dataset.appView !== "dashboard"; });
  getSessionUser();
})();
