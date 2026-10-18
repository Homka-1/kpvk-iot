import { describe, expect, it } from 'vitest';
import {
  type ConsultationDto,
  type FeedbackDto,
  interactionTimeline,
  isCheckpointReflectable,
  type ReflectionDto,
  RESOLVABLE_FEEDBACK_KINDS,
  STUDENT_FEEDBACK_KINDS,
  TEACHER_FEEDBACK_KINDS,
} from './index.js';

const student = { id: 's1', fullName: 'Петров Иван', groupName: 'ПО-21' };
const person = { id: 'u1', fullName: 'Иванова Анна' };

const feedback = (id: string, createdAt: string): FeedbackDto => ({
  id,
  kind: 'RECOMMENDATION',
  visibility: 'STUDENT_VISIBLE',
  body: 'Текст',
  dueDate: null,
  resolvedAt: null,
  createdAt,
  student,
  author: person,
  fromStudent: false,
  trajectory: null,
  stage: null,
  assignment: null,
  replies: [],
});

const consultation = (
  id: string,
  dates: Pick<ConsultationDto, 'createdAt' | 'scheduledAt' | 'heldAt'>,
): ConsultationDto => ({
  id,
  status: dates.heldAt ? 'HELD' : dates.scheduledAt ? 'SCHEDULED' : 'REQUESTED',
  topic: 'Тема',
  summary: null,
  internalNote: null,
  teacher: null,
  requestedByStudent: true,
  student,
  trajectory: null,
  ...dates,
});

const reflection = (id: string, createdAt: string): ReflectionDto => ({
  id,
  trajectory: null,
  stage: null,
  checkpoint: null,
  selfAssessment: 4,
  achievements: null,
  difficulties: null,
  nextSteps: null,
  createdAt,
  student,
});

describe('Обратная связь (п. 4.9)', () => {
  it('FR-063: история взаимодействия — одна лента, новые записи сверху', () => {
    const entries = interactionTimeline({
      feedback: [feedback('f1', '2026-10-01T10:00:00.000Z')],
      consultations: [
        consultation('c1', {
          createdAt: '2026-09-20T10:00:00.000Z',
          scheduledAt: '2026-10-02T10:00:00.000Z',
          heldAt: '2026-10-03T10:00:00.000Z',
        }),
        consultation('c2', {
          createdAt: '2026-09-30T10:00:00.000Z',
          scheduledAt: null,
          heldAt: null,
        }),
      ],
      reflections: [reflection('r1', '2026-10-02T12:00:00.000Z')],
    });
    // Проведённая консультация стоит по дате проведения, запрошенная — по дате запроса.
    expect(entries.map((entry) => `${entry.type}:${entry.item.id}`)).toEqual([
      'consultation:c1',
      'reflection:r1',
      'feedback:f1',
      'consultation:c2',
    ]);
  });

  it('FR-066: рефлексия доступна после отмеченной контрольной точки', () => {
    expect(isCheckpointReflectable('PASSED')).toBe(true);
    expect(isCheckpointReflectable('MISSED')).toBe(true);
    expect(isCheckpointReflectable('PENDING')).toBe(false);
  });

  it('п. 4.9: преподаватель и студент пишут разные виды сообщений', () => {
    expect(TEACHER_FEEDBACK_KINDS.some((kind) => STUDENT_FEEDBACK_KINDS.includes(kind))).toBe(
      false,
    );
    // Рассмотренными отмечаются только обращения студента.
    expect(RESOLVABLE_FEEDBACK_KINDS.some((kind) => TEACHER_FEEDBACK_KINDS.includes(kind))).toBe(
      false,
    );
  });
});
