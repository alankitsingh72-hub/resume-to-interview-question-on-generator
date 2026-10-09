(function () {
  "use strict";

  const app = window.App;
  if (!app || !document.querySelector(".platform-view")) return;

  let resumeId = null;
  let savedQuestions = [];
  let interviewId = null;
  let interviewQuestionIndex = 0;
  let activeQuestion = null;
  let activeCategory = "General";
  let working = false;

  const byId = (id) => document.getElementById(id);

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function recordCard(title, subtitle, details) {
    const card = element("article", "result-card");
    const heading = element("div", "result-card-heading");
    heading.append(element("h3", "", title));
    if (subtitle) heading.append(element("span", "result-category", subtitle));
    card.append(heading);
    for (const [label, value] of Object.entries(details || {})) {
      if (Array.isArray(value)) {
        if (value.length) {
          const list = element("ul", "result-bullet-list");
          value.forEach((item) => list.append(element("li", "", typeof item === "string" ? item : JSON.stringify(item))));
          card.append(element("strong", "result-detail-label", label), list);
        }
      } else if (typeof value === "string" && value) {
        card.append(element("strong", "result-detail-label", label), element("p", "result-detail", value));
      }
    }
    return card;
  }

  function localModeNotice(generator) {
    return generator === "local"
      ? recordCard("Local practice mode", "Not AI-generated", {
        "About these results": "These suggestions use simple text matching and practice templates because no AI API key is configured. Treat scores as informal guidance and verify findings against your own experience."
      })
      : null;
  }

  function clearError(id) {
    const node = byId(id);
    if (node) node.textContent = "";
  }

  function showError(id, error) {
    const node = byId(id);
    const message = error && error.message ? error.message : "The request could not be completed.";
    if (node) node.textContent = message;
    app.showToast(message, "error");
  }

  async function getResumeId() {
    if (resumeId) return resumeId;
    const result = await app.request("/api/resumes/latest");
    if (!result || !result.resume_id) throw new Error("Upload a resume from your dashboard before using this feature.");
    resumeId = result.resume_id;
    return resumeId;
  }

  async function withLoading(button, label, action) {
    if (working) return;
    working = true;
    app.setButtonLoading(button, true, label);
    try {
      await action();
    } finally {
      app.setButtonLoading(button, false);
      working = false;
    }
  }

  function setViewContent(id, children) {
    const node = byId(id);
    if (!node) return;
    node.replaceChildren(...children);
  }

  async function runAnalysis() {
    const button = byId("analyze-resume");
    clearError("analysis-error");
    await withLoading(button, "Reading your resume…", async () => {
      try {
        const result = await app.request("/api/resume/analyze", {
          method: "POST",
          body: JSON.stringify({ resume_id: await getResumeId() })
        });
        const content = [];
        const notice = localModeNotice(result.generator);
        if (notice) content.push(notice);
        if (result.summary) content.push(recordCard("Resume summary", "", {
          "Based on your document": result.summary,
          "Supporting resume excerpt": result.summaryEvidence || ""
        }));
        for (const [key, heading] of [
          ["skills", "Skills with resume evidence"],
          ["projects", "Projects mentioned"],
          ["experience", "Education & experience"],
          ["claimsToDefend", "Claims to prepare to explain"],
          ["concerns", "Potential interviewer follow-ups"],
          ["suggestions", "Resume improvement suggestions"]
        ]) {
          (result[key] || []).forEach((item) => {
            const title = typeof item === "string" ? item : item.name || item.claim || item.issue || item.suggestion || "Finding";
            const details = typeof item === "string" ? {} : Object.fromEntries(Object.entries(item).filter(([name]) => name !== "name" && name !== "claim" && name !== "issue" && name !== "suggestion"));
            const card = recordCard(title, heading, details);
            card.dataset.group = heading;
            content.push(card);
          });
        }
        if (!content.length) throw new Error("The analysis service returned no findings.");
        setViewContent("analysis-results", content);
        app.showToast("Resume analysis is ready.", "success");
      } catch (error) {
        showError("analysis-error", error);
      }
    });
  }

  byId("analyze-resume").addEventListener("click", runAnalysis);

  byId("job-match-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    clearError("match-error");
    await withLoading(button, "Comparing your experience…", async () => {
      try {
        const result = await app.request("/api/job-match", {
          method: "POST",
          body: JSON.stringify({ resume_id: await getResumeId(), job_description: form.elements.job_description.value.trim() })
        });
        const content = [recordCard(`Evidence overlap: ${result.score}%`, "Not a hiring probability", { "How the score was assessed": result.scoreExplanation })];
        const notice = localModeNotice(result.generator);
        if (notice) content.unshift(notice);
        for (const [key, heading] of [
          ["matchingSkills", "Skills supported by resume evidence"],
          ["notDemonstratedSkills", "Requirements not demonstrated in this resume"],
          ["relevantExperience", "Relevant experience evidence"],
          ["interviewTopics", "Role-specific interview topics"],
          ["suggestions", "Suggestions for tailoring your resume"]
        ]) {
          const values = result[key] || [];
          if (values.length) content.push(recordCard(heading, "", { "Based on the comparison": values }));
        }
        setViewContent("match-results", content);
        app.showToast("Role and resume comparison is ready.", "success");
      } catch (error) {
        showError("match-error", error);
      }
    });
  });

  byId("project-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    clearError("project-error");
    await withLoading(button, "Building the question tree…", async () => {
      try {
        const result = await app.request("/api/project-deep-dive", {
          method: "POST",
          body: JSON.stringify({ project: byId("project-description").value.trim() })
        });
        const content = [];
        const notice = localModeNotice(result.generator);
        if (notice) content.push(notice);
        if (result.evidence) content.push(recordCard("Project details used", result.projectName, { "Supplied evidence": result.evidence }));
        (result.branches || []).forEach((branch, index) => {
          const followUps = Array.isArray(branch.followUps) ? branch.followUps : [];
          content.push(recordCard(branch.topic || `Question ${index + 1}`, "Project question", {
            Question: branch.question || "",
            "Possible follow-ups": followUps
          }));
        });
        if (result.uncertainty && result.uncertainty.length) content.push(recordCard("Details to clarify", "", { "Questions to consider": result.uncertainty }));
        setViewContent("project-results", content);
        app.showToast("Project question tree created.", "success");
      } catch (error) {
        showError("project-error", error);
      }
    });
  });

  byId("load-claims").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    clearError("claims-error");
    await withLoading(button, "Reviewing resume claims…", async () => {
      try {
        const result = await app.request("/api/claim-practice", {
          method: "POST",
          body: JSON.stringify({ resume_id: await getResumeId() })
        });
        const content = (result.claims || []).map((claim) => {
          const card = recordCard(claim.claim || "Resume claim", "Prepare to explain", {
            "Resume evidence": claim.evidence || "",
            "Evidence-focused questions": claim.questions || []
          });
          const notice = localModeNotice(result.generator);
          if (notice) content.unshift(notice);
          const save = element("button", "button button-outline result-save", "Save a question");
          save.type = "button";
          save.addEventListener("click", () => saveQuestion(claim.questions && claim.questions[0], "Resume claim"));
          if (claim.questions && claim.questions.length) card.append(save);
          return card;
        });
        if (!content.length) content.push(element("p", "empty-state", "No clear outcome or implementation claims were found in the provided text."));
        setViewContent("claims-results", content);
      } catch (error) {
        showError("claims-error", error);
      }
    });
  });

  function displayEvaluation(evaluation) {
    const container = byId("answer-feedback");
    const article = element("article", "evaluation-card");
    const heading = element("div", "evaluation-score");
    heading.append(
      element("strong", "", `${evaluation.score}/100`),
      element("span", "", evaluation.generator === "local" ? "Informal local checklist · not an AI evaluation" : "Practice indicator")
    );
    article.append(heading);
    if (evaluation.strengths && evaluation.strengths.length) article.append(recordCard("What worked", "", { "Strengths": evaluation.strengths }));
    if (evaluation.improvements && evaluation.improvements.length) article.append(recordCard("What to strengthen", "", { "Possible improvements": evaluation.improvements }));
    if (evaluation.improvedAnswer) article.append(recordCard("Example answer structure", "", { "Use your own true details": evaluation.improvedAnswer }));
    const saveButton = element("button", "button button-outline result-save", "Save this question");
    saveButton.type = "button";
    saveButton.addEventListener("click", () => saveQuestion(activeQuestion && activeQuestion.question, activeQuestion && activeQuestion.category, byId("interview-answer").value, evaluation.improvedAnswer));
    article.append(saveButton);
    container.replaceChildren(article);
  }

  function showInterviewQuestion(question, answered) {
    activeQuestion = question;
    byId("interview-question").textContent = question.question;
    byId("interview-counter").textContent = `Question ${answered + 1}`;
    byId("interview-progress-bar").style.width = `${Math.min(100, (answered / 5) * 100)}%`;
    byId("interview-answer").value = "";
    byId("answer-error").textContent = "";
    byId("interview-answer-form").hidden = false;
    byId("submit-answer").disabled = false;
    byId("interview-panel").hidden = false;
    byId("interview-complete").hidden = true;
  }

  byId("mock-start-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('[type="submit"]');
    clearError("mock-error");
    await withLoading(button, "Preparing questions…", async () => {
      try {
        const result = await app.request("/api/mock-interviews", {
          method: "POST",
          body: JSON.stringify({
            resume_id: await getResumeId(),
            mode: form.elements.mode.value,
            difficulty: form.elements.difficulty.value,
            role: form.elements.role.value.trim(),
            job_description: form.elements.job_description.value.trim()
          })
        });
        const localLabel = result.generator === "local" ? " · Local practice" : "";
        beginInterviewSession(result, `${form.elements.mode.selectedOptions[0].textContent} · ${form.elements.difficulty.value}${localLabel}`);
      } catch (error) {
        showError("mock-error", error);
      }
    });
  });

  function beginInterviewSession(result, label) {
    interviewId = result.id;
    interviewQuestionIndex = 0;
    byId("interview-mode-label").textContent = label;
    byId("answer-feedback").replaceChildren();
    showInterviewQuestion(result.question, 0);
    byId("interview-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  byId("interview-answer-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!interviewId || !activeQuestion) return;
    const form = event.currentTarget;
    const button = byId("submit-answer");
    clearError("answer-error");
    await withLoading(button, "Evaluating your answer…", async () => {
      try {
        const result = await app.request(`/api/mock-interviews/${encodeURIComponent(interviewId)}/answer`, {
          method: "POST",
          body: JSON.stringify({ question_index: interviewQuestionIndex, answer: byId("interview-answer").value.trim() })
        });
        displayEvaluation(result.evaluation);
        interviewQuestionIndex += 1;
        if (result.complete) {
          byId("interview-answer-form").hidden = true;
          byId("interview-complete").hidden = false;
          byId("interview-complete").replaceChildren(
            element("div", "eyebrow", "SESSION COMPLETE"),
            element("h2", "", "Good work showing up for practice."),
            element("p", "result-detail", "Your answer evaluations are saved in your private progress history.")
          );
          byId("interview-progress-bar").style.width = "100%";
          app.showToast("Mock interview completed.", "success");
          loadProgress();
        } else {
          showInterviewQuestion(result.nextQuestion, interviewQuestionIndex);
        }
      } catch (error) {
        showError("answer-error", error);
      }
    });
  });

  byId("end-interview").addEventListener("click", async () => {
    if (!interviewId) return;
    try {
      const result = await app.request(`/api/mock-interviews/${encodeURIComponent(interviewId)}/end`, { method: "POST", body: "{}" });
      byId("interview-panel").hidden = true;
      byId("interview-complete").hidden = false;
      const score = result.averageScore === null ? "No score: no answers were evaluated." : `Average evaluated practice indicator: ${result.averageScore}/100.`;
      byId("interview-complete").replaceChildren(element("div", "eyebrow", "SESSION ENDED"), element("h2", "", "Your practice is saved."), element("p", "result-detail", `${result.totalAnswered} answers completed. ${score}`));
      loadProgress();
    } catch (error) {
      showError("answer-error", error);
    }
  });

  async function saveQuestion(question, category, originalAnswer, improvedAnswer) {
    if (typeof question !== "string" || !question.trim()) {
      app.showToast("There is no question to save.", "error");
      return;
    }
    try {
      await app.request("/api/saved-questions", {
        method: "POST",
        body: JSON.stringify({
          question: question.trim(),
          category: typeof category === "string" ? category : "General",
          original_answer: originalAnswer || "",
          improved_answer: improvedAnswer || ""
        })
      });
      app.showToast("Question saved to your vault.", "success");
      if (!byId("vault-view").hidden) loadVault();
      loadProgress();
    } catch (error) {
      app.showToast(error.message, "error");
    }
  }

  async function loadProgress() {
    const container = byId("progress-results");
    try {
      const progress = await app.request("/api/progress");
      byId("progress-summary").replaceChildren(
        metric("Evaluated answers", progress.totalAnswers),
        metric("Sessions completed", progress.completedSessions),
        metric("Roadmap tasks", `${progress.completedRoadmapTasks}/${progress.roadmapTasks}`),
        metric("Saved questions", progress.savedQuestions)
      );
      const content = [];
      if (!progress.totalAnswers) {
        content.push(element("p", "empty-state", "Your practice scores will appear after you complete and submit answers in a mock interview."));
      } else {
        const readinessTitle = element("h2", "readiness-heading", "Readiness indicators");
        content.push(readinessTitle);
        const readinessLabels = [
          ["technicalKnowledge", "Technical knowledge"],
          ["resumeUnderstanding", "Resume evidence"],
          ["projectExplanation", "Project explanation"],
          ["hrBehavioral", "HR & behavioral"],
          ["answerClarity", "Answer clarity"],
          ["jobSpecific", "Job-specific relevance"]
        ];
        readinessLabels.forEach(([key, label]) => {
          const value = progress.readiness && progress.readiness[key];
          content.push(recordCard(label, value ? `${value.samples} evaluated ${value.samples === 1 ? "answer" : "answers"}` : "Not assessed yet", {
            "Practice indicator": value ? `${value.score}/100 · based on actual evaluated answers` : "No relevant practice answers yet."
          }));
        });
        content.push(element("h2", "readiness-heading", "By interview category"));
        (progress.categories || []).forEach((item) => content.push(recordCard(item.category, `${item.samples} evaluated ${item.samples === 1 ? "answer" : "answers"}`, { "Average practice indicator": `${item.score}/100` })));
        const sessions = await Promise.all((progress.recentSessions || []).map(async (item) => ({
          summary: item,
          detail: await app.request(`/api/mock-interviews/${encodeURIComponent(item.id)}`)
        })));
        sessions.forEach(({ summary, detail }) => {
          const comparison = summary.changeFromPrevious === null ? "" :
            ` · ${summary.changeFromPrevious >= 0 ? "+" : ""}${summary.changeFromPrevious} vs previous completed session`;
          const disclosure = element("details", "session-review");
          const summaryLine = element("summary", "", `${summary.averageScore === null ? "Interview session" : `Session average ${summary.averageScore}/100`} · ${new Date(summary.date).toLocaleDateString()}${comparison}`);
          disclosure.append(summaryLine);
          detail.answers.forEach((answer) => {
            disclosure.append(recordCard(answer.question, `${answer.category} · ${answer.score}/100`, {
              "Your answer": answer.answer,
              "Strengths": answer.strengths,
              "Areas to improve": answer.improvements
            }));
          });
          content.push(disclosure);
        });
      }
      setViewContent("progress-results", content);
    } catch (error) {
      container.replaceChildren(element("p", "form-error", error.message));
    }
  }

  function metric(label, value) {
    const card = element("div", "progress-metric");
    card.append(element("span", "", label), element("strong", "", String(value)));
    return card;
  }

  byId("refresh-progress").addEventListener("click", loadProgress);

  async function loadRoadmap() {
    const container = byId("roadmap-list");
    try {
      const result = await app.request("/api/roadmap");
      if (!result.tasks.length) {
        container.replaceChildren(element("p", "empty-state", "No roadmap yet. Build one from completed resume analysis, job matching, or mock interview feedback."));
        return;
      }
      const list = element("div", "roadmap-tasks");
      result.tasks.forEach((task) => {
        const row = element("label", `roadmap-task${task.completed ? " task-completed" : ""}`);
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(task.completed);
        checkbox.addEventListener("change", async () => {
          try {
            await app.request(`/api/roadmap/${encodeURIComponent(task.id)}`, { method: "PATCH", body: JSON.stringify({ completed: checkbox.checked }) });
            loadRoadmap();
            loadProgress();
          } catch (error) {
            checkbox.checked = !checkbox.checked;
            app.showToast(error.message, "error");
          }
        });
        const text = element("span", "roadmap-task-copy");
        text.append(element("strong", "", task.title), element("small", "", task.detail), element("span", "roadmap-task-meta", `${task.category} · ${task.priority} priority`));
        row.append(checkbox, text);
        list.append(row);
      });
      container.replaceChildren(list);
    } catch (error) {
      container.replaceChildren(element("p", "form-error", error.message));
    }
  }

  byId("generate-roadmap").addEventListener("click", async (event) => {
    clearError("roadmap-error");
    await withLoading(event.currentTarget, "Personalizing tasks…", async () => {
      try {
        const result = await app.request("/api/roadmap/generate", { method: "POST", body: "{}" });
        await loadRoadmap();
        app.showToast(result.generator === "local"
          ? "Your local practice roadmap is ready. These suggestions are not AI-generated."
          : "Your personalized practice roadmap is ready.", "success");
      } catch (error) {
        showError("roadmap-error", error);
      }
    });
  });

  async function loadVault() {
    try {
      const response = await app.request("/api/saved-questions");
      savedQuestions = response.questions || [];
      renderVault(byId("vault-search").value);
    } catch (error) {
      byId("vault-list").replaceChildren(element("p", "form-error", error.message));
    }
  }

  function renderVault(query) {
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const matches = savedQuestions.filter((item) =>
      !normalizedQuery || `${item.question} ${item.category} ${item.originalAnswer} ${item.improvedAnswer}`.toLowerCase().includes(normalizedQuery)
    );
    if (!matches.length) {
      byId("vault-list").replaceChildren(element("p", "empty-state", savedQuestions.length ? "No saved questions match your search." : "Your vault is empty. Save a difficult question during practice or add one above."));
      return;
    }
    const cards = matches.map((item) => {
      const card = recordCard(item.question, item.category, {
        "Your original answer": item.originalAnswer,
        "Example answer structure": item.improvedAnswer,
        "Practice attempt scores": item.practiceScores && item.practiceScores.length
          ? item.practiceScores.map((score, index) => `Attempt ${index + 1}: ${score}/100`) : []
      });
      const practice = element("button", "button button-outline result-save", "Practice again");
      practice.type = "button";
      practice.addEventListener("click", () => practiceSavedQuestion(item, practice));
      const remove = element("button", "text-button danger-text", "Remove");
      remove.type = "button";
      remove.addEventListener("click", async () => {
        try {
          await app.request(`/api/saved-questions/${encodeURIComponent(item.id)}`, { method: "DELETE" });
          await loadVault();
          loadProgress();
        } catch (error) {
          app.showToast(error.message, "error");
        }
      });
      card.append(practice, remove);
      return card;
    });
    setViewContent("vault-list", cards);
  }

  async function practiceSavedQuestion(item, button) {
    await withLoading(button, "Starting practice…", async () => {
      try {
        const result = await app.request("/api/mock-interviews", {
          method: "POST",
          body: JSON.stringify({
            resume_id: await getResumeId(),
            saved_question_id: item.id,
            mode: "mixed",
            difficulty: "intermediate"
          })
        });
        document.querySelector('.sidebar-link[data-view="mock"]').click();
        beginInterviewSession(result, `${item.category} · saved question`);
      } catch (error) {
        app.showToast(error.message, "error");
      }
    });
  }

  byId("vault-search").addEventListener("input", () => renderVault(byId("vault-search").value));
  byId("save-question-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    clearError("vault-error");
    await withLoading(form.querySelector('[type="submit"]'), "Saving…", async () => {
      try {
        await app.request("/api/saved-questions", {
          method: "POST",
          body: JSON.stringify({ question: form.elements.question.value.trim(), category: "General" })
        });
        form.reset();
        await loadVault();
        loadProgress();
        app.showToast("Question saved to your vault.", "success");
      } catch (error) {
        showError("vault-error", error);
      }
    });
  });

  function initializeView(button) {
    const view = button.dataset.view;
    if (view === "progress") loadProgress();
    if (view === "roadmap") loadRoadmap();
    if (view === "vault") loadVault();
  }

  document.querySelectorAll(".sidebar-link[data-view]").forEach((button) => {
    button.addEventListener("click", () => initializeView(button));
  });
  document.querySelector(".sidebar-user").addEventListener("click", () => {
    document.querySelector('.sidebar-link[data-view="profile"]').click();
  });

})();
