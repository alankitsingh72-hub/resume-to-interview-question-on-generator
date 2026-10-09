"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { after, before, test } = require("node:test");
const PDFDocument = require("pdfkit");
const { createApp } = require("./server");

function createPdf(text) {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument();
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(12).text(text);
    document.end();
  });
}

let server;
let baseUrl;
let temporaryDirectory;
let evaluationCount = 0;

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "prepwise-test-"));
  const { app } = await createApp({
    dataDir: temporaryDirectory,
    aiJson: async ({ system }) => {
      if (system.includes("Create 3 concise")) {
        return { technical: ["Explain your Python use."], project_based: ["What trade-off did you make?"], education_experience: ["What did you learn?"], hr_general: ["Tell me about yourself."] };
      }
      if (system.includes("Create a sequential mock interview")) {
        return { questions: [{ category: "technical", question: "Explain how you designed your data model." }, { category: "project", question: "What would you improve next?" }] };
      }
      if (system.includes("Analyze only the provided resume")) {
        return {
          summary: { text: "The resume describes a Python and SQL research dashboard.", evidence: "Python and SQL analytics dashboard" },
          skills: [{ name: "Python", evidence: "Python and SQL analytics dashboard" }, { name: "Go", evidence: "not in this resume" }],
          projects: [{ name: "Research dashboard", evidence: "Python and SQL analytics dashboard", questions: ["How did you validate the data?"] }],
          experience: [{ name: "Research project", evidence: "university research project" }],
          claimsToDefend: [{ claim: "reducing weekly reporting time", evidence: "reducing weekly reporting time", questions: ["How did you measure the reduction?"] }],
          concerns: [{ issue: "Metric could use a baseline", evidence: "reducing weekly reporting time", why: "Interviewers may ask for the comparison.", recommendation: "Prepare the before and after." }],
          suggestions: [{ suggestion: "Add the measured time saved.", why: "Specific metrics help clarify the result." }]
        };
      }
      if (system.includes("Compare this job description")) {
        return {
          score: 72, scoreExplanation: "Evidence overlap is based on directly cited resume content.",
          matchingSkills: [{ skill: "Python", evidence: "Python and SQL analytics dashboard" }],
          notDemonstratedSkills: [{ skill: "Kubernetes", jobRequirement: "Deployment experience" }],
          relevantExperience: [{ experience: "Research dashboard", evidence: "university research project" }],
          interviewTopics: ["SQL query design"], suggestions: ["Clarify how reporting time was measured."]
        };
      }
      if (system.includes("Create a project interview practice tree")) {
        return { projectName: "Analytics dashboard", evidence: "Python analytics dashboard", branches: [{ topic: "Data model", question: "How did you structure the data?", followUps: ["What alternatives did you consider?"] }], uncertainty: ["Clarify your individual contribution."] };
      }
      if (system.includes("Find statements in the resume")) {
        return { claims: [{ claim: "reducing weekly reporting time", evidence: "reducing weekly reporting time", questions: ["What was the baseline?"] }, { claim: "invented achievement", evidence: "not in resume", questions: [] }] };
      }
      if (system.includes("Evaluate one interview answer")) {
        evaluationCount += 1;
        return { score: 78, dimensions: { relevance: 80, evidence: 70, reasoning: 82, clarity: 79 }, strengths: ["Clear technical example."], improvements: ["Explain how you measured the result."], improvedAnswer: "Describe the context, action, and measured result.", followUpQuestion: evaluationCount === 1 ? "How did you test those relationships?" : null, nextQuestion: null };
      }
      if (system.includes("Create 4-8 practical interview preparation tasks")) {
        return { tasks: [{ title: "Practice metric explanations", detail: "Prepare the measurement behind the reporting improvement.", category: "Project", priority: "high" }] };
      }
      return {};
    }
  });
  server = await new Promise((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test("health, account creation, login, and duplicate account rejection", async () => {
  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");

  const registration = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Alex Student", email: "Alex@example.com", password: "test-password-123" })
  });
  assert.equal(registration.status, 201);
  const account = await registration.json();
  assert.ok(account.token);
  assert.equal(account.user.email, "alex@example.com");
  assert.equal(Object.hasOwn(account.user, "passwordHash"), false);

  const duplicate = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Another Student", email: "alex@example.com", password: "test-password-123" })
  });
  assert.equal(duplicate.status, 409);

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ALEX@example.com", password: "test-password-123" })
  });
  assert.equal(login.status, 200);
  assert.ok((await login.json()).token);

  const wrongPassword = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alex@example.com", password: "incorrect-password" })
  });
  assert.equal(wrongPassword.status, 401);
});

test("authenticated PDF upload, AI questions, mock interviews, and user progress", async () => {
  const storage = JSON.parse(await fs.readFile(path.join(temporaryDirectory, "store.json"), "utf8"));
  const user = storage.users[0];
  const payload = Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const secret = await fs.readFile(path.join(temporaryDirectory, "token-secret"));
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  const token = `${payload}.${signature}`;
  const pdf = await createPdf("Alex Student built a Python and SQL analytics dashboard for a university research project, reducing weekly reporting time.");
  const formData = new FormData();
  formData.append("file", new Blob([pdf], { type: "application/pdf" }), "resume.pdf");

  const upload = await fetch(`${baseUrl}/api/upload-resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  assert.equal(upload.status, 201, await upload.clone().text());
  const uploaded = await upload.json();
  assert.ok(uploaded.resume_id);

  const unsupportedForm = new FormData();
  unsupportedForm.append("file", new Blob(["not a PDF"], { type: "text/plain" }), "resume.txt");
  const unsupported = await fetch(`${baseUrl}/api/upload-resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: unsupportedForm
  });
  assert.equal(unsupported.status, 400);

  const scannedForm = new FormData();
  scannedForm.append("file", new Blob([await createPdf("")], { type: "application/pdf" }), "scanned.pdf");
  const scanned = await fetch(`${baseUrl}/api/upload-resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: scannedForm
  });
  assert.equal(scanned.status, 422);

  const generated = await fetch(`${baseUrl}/api/generate-questions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id })
  });
  assert.equal(generated.status, 200, await generated.clone().text());
  const result = await generated.json();
  assert.equal(result.generator, "openai");
  assert.match(result.questions.technical[0], /Python/i);
  assert.ok(result.questions.project_based.length);
  assert.ok(result.questions.education_experience.length);
  assert.ok(result.questions.hr_general.length);

  const history = await fetch(`${baseUrl}/api/questions`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(history.status, 200);
  assert.deepEqual((await history.json()).questions, result.questions);

  const interviewStart = await fetch(`${baseUrl}/api/mock-interviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id, mode: "technical", difficulty: "intermediate" })
  });
  assert.equal(interviewStart.status, 201, await interviewStart.clone().text());
  const interview = await interviewStart.json();
  assert.equal(interview.question.question, "Explain how you designed your data model.");

  const answer = await fetch(`${baseUrl}/api/mock-interviews/${interview.id}/answer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question_index: 0, answer: "I structured the tables around each project and verified the relationships with example queries." })
  });
  assert.equal(answer.status, 200, await answer.clone().text());
  assert.equal((await answer.json()).evaluation.score, 78);

  const duplicateAnswer = await fetch(`${baseUrl}/api/mock-interviews/${interview.id}/answer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question_index: 0, answer: "A duplicate answer." })
  });
  assert.equal(duplicateAnswer.status, 409);

  const saved = await fetch(`${baseUrl}/api/saved-questions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Explain your database choice.", category: "Project deep-dive" })
  });
  assert.equal(saved.status, 201);
  const savedQuestion = await saved.json();
  assert.equal((await (await fetch(`${baseUrl}/api/saved-questions`, { headers: { Authorization: `Bearer ${token}` } })).json()).questions.length, 1);

  const repeatStart = await fetch(`${baseUrl}/api/mock-interviews`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id, saved_question_id: savedQuestion.id })
  });
  assert.equal(repeatStart.status, 201, await repeatStart.clone().text());
  const repeatSession = await repeatStart.json();
  assert.equal(repeatSession.question.question, savedQuestion.question);
  const repeatAnswer = await fetch(`${baseUrl}/api/mock-interviews/${repeatSession.id}/answer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question_index: 0, answer: "I compared query results and used the measured outcomes to decide." })
  });
  assert.equal(repeatAnswer.status, 200);
  const savedAfterPractice = await fetch(`${baseUrl}/api/saved-questions`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual((await savedAfterPractice.json()).questions[0].practiceScores, [78]);

  const progress = await fetch(`${baseUrl}/api/progress`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(progress.status, 200);
  const progressData = await progress.json();
  assert.equal(progressData.totalAnswers, 2);
  assert.equal(progressData.categories[0].score, 78);
  assert.equal(progressData.readiness.answerClarity.score, 79);
  assert.equal(progressData.hiringProbability, undefined);

  const roadmap = await fetch(`${baseUrl}/api/roadmap`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual((await roadmap.json()).tasks, []);

  const deleteSaved = await fetch(`${baseUrl}/api/saved-questions/${savedQuestion.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(deleteSaved.status, 204);

  const secondRegistration = await fetch(`${baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Second Student", email: "second@example.com", password: "second-password-123" })
  });
  const secondAccount = await secondRegistration.json();
  const secondVault = await fetch(`${baseUrl}/api/saved-questions`, { headers: { Authorization: `Bearer ${secondAccount.token}` } });
  assert.deepEqual((await secondVault.json()).questions, []);
  const crossUserResume = await fetch(`${baseUrl}/api/resume/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secondAccount.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id })
  });
  assert.equal(crossUserResume.status, 404);
  const crossUserInterview = await fetch(`${baseUrl}/api/mock-interviews/${interview.id}`, {
    headers: { Authorization: `Bearer ${secondAccount.token}` }
  });
  assert.equal(crossUserInterview.status, 404);

  const suppliedTextQuestions = await fetch(`${baseUrl}/api/generate-questions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: "A student built a Java web application and collaborated with a team." })
  });
  assert.equal(suppliedTextQuestions.status, 200);

  const analysisResponse = await fetch(`${baseUrl}/api/resume/analyze`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id })
  });
  assert.equal(analysisResponse.status, 200, await analysisResponse.clone().text());
  const analysis = await analysisResponse.json();
  assert.equal(analysis.skills.length, 1);
  assert.equal(analysis.claimsToDefend.length, 1);

  const matchResponse = await fetch(`${baseUrl}/api/job-match`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id, job_description: "Seeking a Python analyst with Kubernetes experience." })
  });
  assert.equal(matchResponse.status, 200, await matchResponse.clone().text());
  assert.equal((await matchResponse.json()).score, 72);

  const projectResponse = await fetch(`${baseUrl}/api/project-deep-dive`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ project: "A Python analytics dashboard for research." })
  });
  assert.equal(projectResponse.status, 200, await projectResponse.clone().text());
  assert.equal((await projectResponse.json()).branches[0].followUps.length, 1);

  const claimsResponse = await fetch(`${baseUrl}/api/claim-practice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resume_id: uploaded.resume_id })
  });
  assert.equal(claimsResponse.status, 200, await claimsResponse.clone().text());
  assert.equal((await claimsResponse.json()).claims.length, 1);

  const followUpAnswer = await fetch(`${baseUrl}/api/mock-interviews/${interview.id}/answer`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question_index: 1, answer: "I tested with sample rows and checked expected relationships." })
  });
  assert.equal(followUpAnswer.status, 200);
  assert.equal((await followUpAnswer.json()).nextQuestion.question, "What would you improve next?");

  const roadmapResponse = await fetch(`${baseUrl}/api/roadmap/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(roadmapResponse.status, 200, await roadmapResponse.clone().text());
  const roadmapTasks = (await roadmapResponse.json()).tasks;
  assert.equal(roadmapTasks.length, 1);
  const completedTask = await fetch(`${baseUrl}/api/roadmap/${roadmapTasks[0].id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true })
  });
  assert.equal((await completedTask.json()).completed, true);

  const unauthorized = await fetch(`${baseUrl}/api/upload-resume`, { method: "POST", body: new FormData() });
  assert.equal(unauthorized.status, 401);
});

test("question generation provides clearly labeled local practice questions without an API key", async () => {
  const noKeyDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "prepwise-no-key-"));
  let noKeyServer;
  try {
    const { app } = await createApp({ dataDir: noKeyDirectory, openAiApiKey: "" });
    noKeyServer = await new Promise((resolve, reject) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      instance.once("error", reject);
    });
    const url = `http://127.0.0.1:${noKeyServer.address().port}`;
    const registration = await fetch(`${url}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "No Key Student", email: "no-key@example.com", password: "no-key-password-123" })
    });
    const account = await registration.json();
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([await createPdf("Student resume: Python, SQL, and a data analysis project for a university research team.")], { type: "application/pdf" }),
      "resume.pdf"
    );
    const upload = await fetch(`${url}/api/upload-resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.token}` },
      body: formData
    });
    assert.equal(upload.status, 201, await upload.clone().text());
    const uploaded = await upload.json();
    const authorization = { Authorization: `Bearer ${account.token}` };
    const questions = await fetch(`${url}/api/generate-questions`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ resume_id: uploaded.resume_id })
    });
    assert.equal(questions.status, 200, await questions.clone().text());
    const generated = await questions.json();
    assert.equal(generated.generator, "local");
    assert.match(generated.questions.technical[0], /Python/);
    for (const category of ["technical", "project_based", "education_experience", "hr_general"]) {
      assert.equal(generated.questions[category].length, 3);
    }

    const analysisResponse = await fetch(`${url}/api/resume/analyze`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ resume_id: uploaded.resume_id })
    });
    assert.equal(analysisResponse.status, 200, await analysisResponse.clone().text());
    assert.equal((await analysisResponse.json()).generator, "local");

    const matchResponse = await fetch(`${url}/api/job-match`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ resume_id: uploaded.resume_id, job_description: "Python SQL data analysis skills required." })
    });
    assert.equal(matchResponse.status, 200, await matchResponse.clone().text());
    assert.equal((await matchResponse.json()).generator, "local");

    const projectResponse = await fetch(`${url}/api/project-deep-dive`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ project: "Python research dashboard for university analysis." })
    });
    assert.equal(projectResponse.status, 200, await projectResponse.clone().text());
    assert.equal((await projectResponse.json()).generator, "local");

    const claimsResponse = await fetch(`${url}/api/claim-practice`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ resume_id: uploaded.resume_id })
    });
    assert.equal(claimsResponse.status, 200, await claimsResponse.clone().text());
    assert.equal((await claimsResponse.json()).generator, "local");

    const interviewResponse = await fetch(`${url}/api/mock-interviews`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ resume_id: uploaded.resume_id, mode: "mixed" })
    });
    assert.equal(interviewResponse.status, 201, await interviewResponse.clone().text());
    const interview = await interviewResponse.json();
    assert.equal(interview.generator, "local");

    const answerResponse = await fetch(`${url}/api/mock-interviews/${interview.id}/answer`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ question_index: 0, answer: "I used Python to analyze the project data and checked the results against sample records." })
    });
    assert.equal(answerResponse.status, 200, await answerResponse.clone().text());
    const answerResult = await answerResponse.json();
    assert.equal(answerResult.evaluation.generator, "local");
    assert.ok(answerResult.evaluation.score >= 0 && answerResult.evaluation.score <= 100);

    const roadmapResponse = await fetch(`${url}/api/roadmap/generate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: "{}"
    });
    assert.equal(roadmapResponse.status, 200, await roadmapResponse.clone().text());
    assert.equal((await roadmapResponse.json()).generator, "local");
  } finally {
    if (noKeyServer) await new Promise((resolve, reject) => noKeyServer.close((error) => error ? reject(error) : resolve()));
    await fs.rm(noKeyDirectory, { recursive: true, force: true });
  }
});

test("configured OpenAI integration sends the requested resume context and validates JSON output", async () => {
  const aiDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "prepwise-ai-"));
  let aiServer;
  let sentRequest;
  try {
    const { app } = await createApp({
      dataDir: aiDirectory,
      openAiApiKey: "unit-test-key",
      fetch: async (url, options) => {
        sentRequest = { url, options, payload: JSON.parse(options.body) };
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            technical: ["Explain a technical decision."],
            project_based: ["Describe your project contribution."],
            education_experience: ["What did you learn?"],
            hr_general: ["How do you handle feedback?"]
          }) } }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    });
    aiServer = await new Promise((resolve, reject) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
      instance.once("error", reject);
    });
    const url = `http://127.0.0.1:${aiServer.address().port}`;
    const registration = await fetch(`${url}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "AI Test", email: "ai-test@example.com", password: "ai-test-password-123" })
    });
    const account = await registration.json();
    const generated = await fetch(`${url}/api/generate-questions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${account.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ resume_text: "A student built a data analytics project using Python." })
    });
    assert.equal(generated.status, 200, await generated.clone().text());
    const result = await generated.json();
    assert.equal(result.generator, "openai");
    assert.equal(result.questions.project_based.length, 1);
    assert.equal(sentRequest.url, "https://api.openai.com/v1/chat/completions");
    assert.match(sentRequest.options.headers.Authorization, /^Bearer unit-test-key$/);
    assert.match(sentRequest.payload.messages[1].content, /Python/);
  } finally {
    if (aiServer) await new Promise((resolve, reject) => aiServer.close((error) => error ? reject(error) : resolve()));
    await fs.rm(aiDirectory, { recursive: true, force: true });
  }
});
