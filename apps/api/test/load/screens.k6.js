/**
 * Нагрузочный тест основных экранов (NFR-001: 50 одновременных пользователей;
 * NFR-002: ответ основных экранов ≤ 3 с). Экран = набор запросов API, который интерфейс
 * отправляет при его открытии; время экрана — время выполнения всего набора.
 *
 * Запуск и подготовка данных — docs/testing/load.md.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const API = `${__ENV.LOAD_API_URL || 'http://localhost:3000'}/api`;
const accounts = JSON.parse(open(__ENV.LOAD_ACCOUNTS_FILE || './accounts.local.json'));

const TEACHER_VUS = 10;
const STUDENT_VUS = 40;
const DURATION = __ENV.LOAD_DURATION || '3m';

const SCREENS = {
  teacher: ['dashboard', 'students', 'student_profile', 'monitoring', 'analytics', 'review'],
  student: ['cabinet_home', 'my_trajectory', 'my_assignments', 'my_diagnostics', 'my_profile'],
};
const trends = Object.fromEntries(
  [...SCREENS.teacher, ...SCREENS.student].map((name) => [name, new Trend(`screen_${name}`, true)]),
);

export const options = {
  scenarios: {
    teachers: {
      executor: 'constant-vus',
      vus: TEACHER_VUS,
      duration: DURATION,
      exec: 'teacher',
    },
    students: {
      executor: 'constant-vus',
      vus: STUDENT_VUS,
      duration: DURATION,
      exec: 'student',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    ...Object.fromEntries(
      [...SCREENS.teacher, ...SCREENS.student].map((name) => [`screen_${name}`, ['p(95)<3000']]),
    ),
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'max'],
};

function login(account) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ login: account.login, password: account.password }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200) throw new Error(`Вход ${account.login}: ${res.status}`);
  return res.json('accessToken');
}

export function setup() {
  return {
    teacher: login(accounts.teacher),
    students: accounts.students.map(login),
  };
}

/** Открытие экрана: параллельные GET-запросы; время экрана — до последнего ответа. */
function screen(name, token, paths) {
  const params = { headers: { Authorization: `Bearer ${token}` }, tags: { screen: name } };
  const started = Date.now();
  const responses = http.batch(paths.map((path) => ['GET', `${API}${path}`, null, params]));
  trends[name].add(Date.now() - started);
  check(responses, { [`${name}: все ответы 200`]: (list) => list.every((r) => r.status === 200) });
}

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const think = () => sleep(2 + Math.random() * 3);

export function teacher(data) {
  const token = data.teacher;
  const groupId = pick(accounts.groupIds);
  const query = `groupId=${groupId}&disciplineId=${accounts.disciplineId}`;
  screen('dashboard', token, ['/auth/me', `/dashboard?${query}`, '/notifications']);
  think();
  screen('students', token, [`/students?groupId=${groupId}`, '/groups']);
  think();
  const studentId = pick(accounts.studentIds);
  screen('student_profile', token, [
    `/students/${studentId}/profile`,
    `/students/${studentId}/diagnostics`,
    `/students/${studentId}/motivation-profile`,
  ]);
  think();
  screen('monitoring', token, [`/monitoring?${query}`]);
  think();
  screen('analytics', token, [`/analytics?${query}`]);
  think();
  screen('review', token, ['/student-assignments/review']);
  think();
}

export function student(data) {
  const token = data.students[(__VU - 1) % data.students.length];
  screen('cabinet_home', token, [
    '/auth/me',
    '/cabinet/trajectories',
    '/cabinet/assignments',
    '/notifications',
  ]);
  think();
  screen('my_trajectory', token, ['/cabinet/trajectories']);
  think();
  screen('my_assignments', token, ['/cabinet/assignments']);
  think();
  screen('my_diagnostics', token, ['/cabinet/diagnostics']);
  think();
  screen('my_profile', token, ['/cabinet/profile']);
  think();
}
