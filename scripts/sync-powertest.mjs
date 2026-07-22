#!/usr/bin/env node

const CONFIG = {
  apiBase: 'https://superatest-backend-develop.thepower.education/api',
  pageSize: Number(process.env.POWERTEST_PAGE_SIZE || 100),
  maxPages: Number(process.env.POWERTEST_MAX_PAGES || 200),
};

const env = {
  powerTestToken: process.env.POWERTEST_TOKEN,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  supabaseUserId: process.env.SUPABASE_USER_ID,
  supabaseUserEmail: process.env.SUPABASE_USER_EMAIL,
  githubRunId: process.env.GITHUB_RUN_ID || '',
};

main().catch(async (error) => {
  console.error('ERROR sincronizando PowerTest:', error?.message || error);
  try {
    if (env.supabaseUrl && env.supabaseServiceRoleKey && (env.supabaseUserId || env.supabaseUserEmail)) {
      const userId = env.supabaseUserId || await findSupabaseUserIdByEmail(env.supabaseUserEmail);
      await insertSyncLog({
        userId,
        estado: 'error',
        testsImportados: 0,
        fallosImportados: 0,
        tokenValid: String(error?.message || '').includes('401') ? false : null,
        mensaje: String(error?.message || error),
        raw: { stack: error?.stack || null },
      });
    }
  } catch (logError) {
    console.error('No se pudo registrar el error en Supabase:', logError?.message || logError);
  }
  process.exit(1);
});

async function main() {
  validateEnv();

  const startedAt = new Date().toISOString();
  const userId = env.supabaseUserId || await findSupabaseUserIdByEmail(env.supabaseUserEmail);

  console.log('PowerTest sync iniciado');
  console.log(`Usuario Supabase: ${userId}`);

  const powerUser = await powerTestGet('/users/me');
  const powerUserData = powerUser.user || powerUser.data?.user || powerUser;
  const powerUserId = powerUserData._id || powerUserData.id;

  if (!powerUserId) {
    throw new Error('No he podido obtener el userId desde /users/me.');
  }

  const attempts = await fetchAllAttempts(powerUserId);
  console.log(`Intentos recibidos desde PowerTest: ${attempts.length}`);

  const testRows = attempts.map((attempt) => toTestRow(attempt, userId));
  const upsertedTests = testRows.length ? await upsertTests(testRows) : [];
  const testIdByAttempt = new Map();

  upsertedTests.forEach((row) => {
    if (row.external_attempt_id) testIdByAttempt.set(String(row.external_attempt_id), row.id);
  });

  let fallosImportados = 0;
  const topicStats = new Map();

  for (const attempt of attempts) {
    const attemptId = String(attempt._id || attempt.id || '');
    if (!attemptId) continue;

    const base = toTestRow(attempt, userId);
    if ((base.fallos || 0) === 0 && (base.no_respondidas || 0) === 0) continue;

    const detail = await fetchAttemptDetail(attemptId);
    const questions = extractFailedQuestions(detail, attempt);
    if (!questions.length) continue;

    const fallosRows = questions.map((question, index) => {
      const tipo = question.type === 'No respondida' ? 'no_respondida' : 'fallada';
      addTopicStat(topicStats, userId, question.topic || 'Sin tema', '', tipo, base.fecha);
      return {
        user_id: userId,
        test_id: testIdByAttempt.get(attemptId) || null,
        fecha: base.fecha,
        pregunta: question.question || 'Pregunta sin texto',
        tu_respuesta: question.userAnswer || '',
        respuesta_correcta: question.correctAnswer || '',
        tema: question.topic || '',
        bloque: question.block || '',
        tipo,
        raw: question.raw || question,
        external_attempt_id: attemptId,
        external_question_id: String(question.externalQuestionId || question.questionId || `${attemptId}-${index}`),
      };
    });

    const written = await upsertFallos(fallosRows);
    fallosImportados += written.length;
  }

  await upsertTemas([...topicStats.values()]);

  await insertSyncLog({
    userId,
    estado: 'ok',
    testsImportados: testRows.length,
    fallosImportados,
    tokenValid: true,
    mensaje: `Sincronización correcta. Tests: ${testRows.length}. Fallos/no respondidas: ${fallosImportados}.`,
    raw: {
      startedAt,
      finishedAt: new Date().toISOString(),
      powerUserId,
      githubRunId: env.githubRunId,
    },
  });

  console.log('PowerTest sync terminado OK');
  console.log(`Tests procesados: ${testRows.length}`);
  console.log(`Fallos/no respondidas procesados: ${fallosImportados}`);
}

function validateEnv() {
  const missing = [];
  if (!env.powerTestToken) missing.push('POWERTEST_TOKEN');
  if (!env.supabaseUrl) missing.push('SUPABASE_URL');
  if (!env.supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (!env.supabaseUserId && !env.supabaseUserEmail) missing.push('SUPABASE_USER_ID o SUPABASE_USER_EMAIL');
  if (missing.length) throw new Error(`Faltan secretos/variables: ${missing.join(', ')}`);
}

async function fetchAllAttempts(powerUserId) {
  const rows = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const endpoint =
      '/test-responses/passed' +
      `?user=${encodeURIComponent(powerUserId)}` +
      `&page=${page}` +
      `&pageSize=${CONFIG.pageSize}` +
      '&type=all&date=all&search=';

    const data = await powerTestGet(endpoint);
    const items = extractItems(data);
    items.forEach((item) => rows.push(item));

    hasNext = Boolean(data.hasNext);
    if (!hasNext && data.totalPages && page < data.totalPages) hasNext = true;

    page += 1;
    if (page > CONFIG.maxPages) throw new Error('Corte de seguridad: demasiadas páginas en PowerTest.');
  }

  return rows;
}

async function powerTestGet(endpoint) {
  const response = await fetch(CONFIG.apiBase + endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${env.powerTestToken}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`PowerTest API error ${response.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function fetchAttemptDetail(attemptId) {
  const endpoints = [
    `/test-responses/${encodeURIComponent(attemptId)}`,
    `/test-responses/detail/${encodeURIComponent(attemptId)}`,
    `/test-responses/${encodeURIComponent(attemptId)}/detail`,
    `/exam-responses/${encodeURIComponent(attemptId)}`,
  ];

  for (const endpoint of endpoints) {
    try {
      return await powerTestGet(endpoint);
    } catch (_) {
      // Probamos la siguiente ruta, igual que hacía Apps Script.
    }
  }

  return {};
}

function extractItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.tests)) return data.tests;
  if (Array.isArray(data.docs)) return data.docs;
  if (Array.isArray(data.results)) return data.results;
  if (Array.isArray(data.data)) return data.data;
  return [];
}

function toTestRow(item, userId) {
  const test = item.test || item.testId || item.exam || {};
  const config = item.configuration || {};

  const aciertos = firstNumber(item.correctAnswers, item.correctCount, item.correct, item.approvedAnswers);
  const fallos = firstNumber(item.failedAnswers, item.failedCount, item.failed, item.incorrectAnswers, item.errors);
  const noRespondidas = firstNumber(item.nonAnsweredQuestions, item.nonAnsweredCount, item.nonAnswered, item.unanswered, item.blankAnswers);
  const total = firstNumber(item.totalQuestions, item.amountOfQuestions, item.totalAnswers, config.amountOfQuestions, aciertos + fallos + noRespondidas);
  let porcentaje = firstNumber(item.accuracy, item.percentage, item.score, item.calification);

  if ((!porcentaje || porcentaje <= 1) && total > 0) porcentaje = Math.round((aciertos / total) * 10000) / 100;

  return {
    user_id: userId,
    fecha: item.createdAt || item.updatedAt || item.finishedAt || new Date().toISOString(),
    origen: 'PowerTest',
    nombre: test.title || test.name || item.testName || item.title || 'Test PowerTest',
    puntuacion: porcentaje,
    porcentaje,
    aprobado: item.approved ?? item.passed ?? null,
    total_preguntas: total,
    aciertos,
    fallos,
    no_respondidas: noRespondidas,
    duracion_segundos: normalizeSeconds(item.timeSpent || item.elapsedTime || item.duration),
    raw: item,
    external_attempt_id: String(item._id || item.id || ''),
    tipo: item.type || item.mode || '',
    tiempo: String(item.timeSpent || item.elapsedTime || item.duration || ''),
    estado: item.status || '',
  };
}

function extractFailedQuestions(detail, rawAttempt = {}) {
  detail = detail && typeof detail === 'object' ? detail : {};
  rawAttempt = rawAttempt && typeof rawAttempt === 'object' ? rawAttempt : {};

  const answers = firstArray(
    detail.answers,
    detail.questions,
    detail.items,
    detail.results,
    detail.data?.answers,
    detail.data?.questions,
    rawAttempt.answers,
  );

  const steps = firstArray(
    detail.steps,
    detail.test?.steps,
    rawAttempt.steps,
    rawAttempt.test?.steps,
  );

  if (answers.length && steps.length) {
    return extractFailedStepAnswers(answers, steps, detail.selections || rawAttempt.selections || {});
  }

  return extractFailedGenericQuestions(answers.length ? answers : firstArray(rawAttempt.questions, rawAttempt.items, rawAttempt.results));
}

function extractFailedStepAnswers(answers, steps, selections) {
  const stepById = new Map();
  steps.forEach((step) => {
    if (!step || typeof step !== 'object') return;
    const id = String(step._id || step.id || '');
    if (id) stepById.set(id, step);
  });

  const failed = [];

  answers.forEach((answer) => {
    if (!answer || typeof answer !== 'object') return;

    const stepId = String(answer.stepId || answer.step || answer.questionId || answer.question || '');
    const step = stepById.get(stepId) || {};
    const selected = selections && selections[stepId] ? selections[stepId] : null;
    const selectedAnswer = selected && typeof selected === 'object'
      ? selected.answer ?? selected.selectedOption ?? selected.selected ?? selected._id ?? selected.id
      : selected;
    const userAnswerId = answer.answer ?? answer.selectedOption ?? answer.selected ?? selectedAnswer;
    const status = answer.status ?? answer.result ?? answer.isCorrect ?? answer.correct ?? null;

    const incorrect = isIncorrectStatus(status);
    const unanswered = isUnansweredStatus(status, userAnswerId);
    if (!incorrect && !unanswered) return;

    const choices = firstArray(step.choices, step.answers, step.options, step.alternatives);
    const correctChoices = choices.filter((choice) => choice && choice.isCorrect === true);

    failed.push({
      question: textValue(step.questionTitle || step.question || step.title || step.text || step.statement || step.enunciado || stepId),
      userAnswer: unanswered ? '(No respondida)' : choiceLabel(choices, userAnswerId),
      correctAnswer: correctChoices.length
        ? correctChoices.map((choice) => choiceLabel([choice], choice._id || choice.id || choice.value)).join(' | ')
        : '',
      type: unanswered ? 'No respondida' : 'Fallada',
      topic: formatStepTopic(step),
      externalQuestionId: stepId,
      raw: { answer, step },
    });
  });

  return failed;
}

function extractFailedGenericQuestions(questions) {
  if (!Array.isArray(questions)) return [];
  const failed = [];

  questions.forEach((q, index) => {
    if (!q || typeof q !== 'object') return;
    const status = q.isCorrect ?? q.correct ?? q.status ?? q.result ?? null;
    const userAnswer = q.userAnswer ?? q.user_answer ?? q.answer ?? q.selectedOption ?? q.selected ?? '';
    const correctAnswer = q.correctAnswer ?? q.correct_answer ?? q.rightAnswer ?? q.expected ?? q.optionCorrect ?? '';
    const questionText = q.question || q.questionTitle || q.title || q.text || q.name || q.statement || q.enunciado || JSON.stringify(q).substring(0, 200);
    const incorrect = isIncorrectStatus(status);
    const unanswered = isUnansweredStatus(status, userAnswer);

    if (incorrect || unanswered) {
      failed.push({
        question: textValue(questionText),
        userAnswer: unanswered ? '(No respondida)' : textValue(userAnswer),
        correctAnswer: textValue(correctAnswer),
        type: unanswered ? 'No respondida' : 'Fallada',
        topic: formatStepTopic(q),
        externalQuestionId: String(q._id || q.id || q.questionId || index),
        raw: q,
      });
    }
  });

  return failed;
}

function addTopicStat(map, userId, topic, block, tipo, date) {
  const key = `${topic}||${block}`;
  const current = map.get(key) || {
    user_id: userId,
    tema: topic || 'Sin tema',
    bloque: block || '',
    total_preguntas: 0,
    aciertos: 0,
    fallos: 0,
    no_respondidas: 0,
    ultima_vez: date || new Date().toISOString(),
  };

  current.total_preguntas += 1;
  if (tipo === 'no_respondida') current.no_respondidas += 1;
  else current.fallos += 1;
  current.porcentaje_acierto = current.total_preguntas ? Math.round((current.aciertos / current.total_preguntas) * 10000) / 100 : 0;
  if (date && new Date(date) > new Date(current.ultima_vez)) current.ultima_vez = date;
  map.set(key, current);
}

async function findSupabaseUserIdByEmail(email) {
  if (!email) throw new Error('Falta SUPABASE_USER_ID o SUPABASE_USER_EMAIL.');
  const result = await supabaseFetch(`/auth/v1/admin/users?per_page=100`, { schema: null });
  const users = Array.isArray(result.users) ? result.users : [];
  const found = users.find((user) => String(user.email || '').toLowerCase() === String(email).toLowerCase());
  if (!found?.id) throw new Error(`No encuentro en Supabase Auth el usuario con email ${email}. Usa SUPABASE_USER_ID.`);
  return found.id;
}

async function upsertTests(rows) {
  return supabaseFetch('/rest/v1/tests?on_conflict=user_id,external_attempt_id', {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function upsertFallos(rows) {
  return supabaseFetch('/rest/v1/fallos?on_conflict=user_id,external_attempt_id,external_question_id', {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function upsertTemas(rows) {
  if (!rows.length) return [];
  return supabaseFetch('/rest/v1/temas_progreso?on_conflict=user_id,tema,bloque', {
    method: 'POST',
    body: rows,
    prefer: 'resolution=merge-duplicates,return=representation',
  });
}

async function insertSyncLog({ userId, estado, testsImportados, fallosImportados, tokenValid, mensaje, raw }) {
  return supabaseFetch('/rest/v1/sincronizaciones', {
    method: 'POST',
    body: [{
      user_id: userId,
      origen: 'PowerTest',
      estado,
      tests_importados: testsImportados,
      fallos_importados: fallosImportados,
      mensaje,
      raw,
      started_at: raw?.startedAt || null,
      finished_at: raw?.finishedAt || new Date().toISOString(),
      token_valid: tokenValid,
      github_run_id: env.githubRunId,
    }],
    prefer: 'return=representation',
  });
}

async function supabaseFetch(path, options = {}) {
  const schema = options.schema === undefined ? 'public' : options.schema;
  const response = await fetch(`${env.supabaseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      apikey: env.supabaseServiceRoleKey,
      Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
      ...(schema ? { 'Content-Profile': schema, 'Accept-Profile': schema } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase error ${response.status} en ${path}: ${text}`);
  return text ? JSON.parse(text) : [];
}

function firstArray(...values) {
  for (const value of values) if (Array.isArray(value)) return value;
  return [];
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (!Number.isNaN(number)) return number;
  }
  return 0;
}

function normalizeSeconds(value) {
  const n = Number(value);
  if (Number.isFinite(n)) return Math.round(n);
  return null;
}

function isIncorrectStatus(status) {
  const normalized = String(status).toLowerCase();
  return status === false || status === 0 || ['incorrect', 'wrong', 'failed', 'fallada'].includes(normalized);
}

function isUnansweredStatus(status, userAnswer) {
  const normalized = String(status).toLowerCase();
  return status === null || status === undefined || userAnswer === '' || userAnswer === null || userAnswer === undefined || ['unanswered', 'non answered', 'no respondida'].includes(normalized);
}

function choiceLabel(choices, choiceId) {
  const id = String(choiceId || '');
  const choice = choices.find((item) => item && typeof item === 'object' && String(item._id || item.id || item.value || item.key || '') === id);
  if (!choice) return id;
  return textValue(choice.label || choice.title || choice.text || choice.name || id);
}

function textValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    return textValue(value.label || value.title || value.text || value.name || value.statement || value.enunciado || value.value || JSON.stringify(value).substring(0, 200));
  }
  return String(value);
}

function formatStepTopic(step) {
  if (!step || typeof step !== 'object') return '';
  const topic = formatTags(step.tags || step.internalTags || step.topic || step.theme || step.tag || step.category || step.subject || '');
  const block = textValue(step.block || step.bloque || step.blockNumber || step.blockIndex || '').trim();
  if (topic && block) return `${topic} (bloque ${block})`;
  if (topic) return topic;
  if (block) return `Bloque ${block}`;
  return '';
}

function formatTags(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(', ');
  return textValue(value);
}
