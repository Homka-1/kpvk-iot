# ER-диаграмма базы данных

> Файл сгенерирован командой `pnpm db:erd` из `apps/api/prisma/schema.prisma`. Не редактируйте вручную.
> Назначение таблиц, жизненные циклы статусов и правила неизменяемости — в [data-model.md](data-model.md).

Обозначения: `PK` — первичный ключ, `FK` — внешний ключ, `UK` — уникальное поле, `"null"` — поле может быть пустым,
`enum_*` — перечисление PostgreSQL, `*_list` — массив.

## Общая схема связей

```mermaid
erDiagram
  users |o--o{ users : createdBy
  roles ||--o{ role_permissions : role
  permissions ||--o{ role_permissions : permission
  users ||--o{ user_roles : user
  roles ||--o{ user_roles : role
  users |o--o{ user_roles : grantedBy
  users ||--o{ user_permissions : user
  permissions ||--o{ user_permissions : permission
  users |o--o{ user_permissions : grantedBy
  users ||--o{ auth_sessions : user
  users ||--o{ teacher_assignments : teacher
  groups ||--o{ teacher_assignments : group
  disciplines ||--o{ teacher_assignments : discipline
  users |o--o{ students : user
  groups |o--o{ students : currentGroup
  students ||--o{ enrollments : student
  groups ||--o{ enrollments : group
  students ||--o{ pedagogical_observations : student
  disciplines |o--o{ pedagogical_observations : discipline
  diagnostic_directions |o--o{ questionnaires : direction
  questionnaires |o--o{ questionnaires : copiedFrom
  questionnaires ||--o{ questionnaire_versions : questionnaire
  questionnaire_versions ||--o{ questionnaire_version_comparabilities : versionA
  questionnaire_versions ||--o{ questionnaire_version_comparabilities : versionB
  questionnaire_versions ||--o{ questions : version
  questions ||--o{ answer_options : question
  questionnaire_versions ||--o{ questionnaire_scales : version
  questionnaire_scales ||--o{ scoring_keys : scale
  questions ||--o{ scoring_keys : question
  answer_options |o--o{ scoring_keys : answerOption
  questionnaire_scales ||--o{ interpretation_rules : scale
  questionnaire_versions ||--o{ diagnostic_assignments : version
  groups |o--o{ diagnostic_assignments : group
  students |o--o{ diagnostic_assignments : student
  research_measurements |o--o{ diagnostic_assignments : researchMeasurement
  diagnostic_assignments |o--o{ diagnostic_sessions : assignment
  students ||--o{ diagnostic_sessions : student
  questionnaire_versions ||--o{ diagnostic_sessions : version
  diagnostic_sessions ||--o{ diagnostic_revisions : session
  questionnaire_versions ||--o{ diagnostic_revisions : scoringVersion
  diagnostic_sessions ||--o{ diagnostic_answers : session
  questions ||--o{ diagnostic_answers : question
  diagnostic_sessions ||--o{ diagnostic_scores : session
  questionnaire_scales ||--o{ diagnostic_scores : scale
  interpretation_rules |o--o{ diagnostic_scores : interpretationRule
  students ||--o{ motivation_profiles : student
  motivation_profiles ||--o{ motivation_profile_sources : profile
  diagnostic_sessions ||--o{ motivation_profile_sources : session
  motivation_profiles ||--o{ motivation_profile_history : profile
  files |o--o{ materials : file
  disciplines |o--o{ materials : discipline
  trajectory_templates ||--o{ trajectory_template_stages : template
  students ||--o{ trajectories : student
  disciplines ||--o{ trajectories : discipline
  trajectory_templates |o--o{ trajectories : template
  motivation_profiles |o--o{ trajectories : motivationProfile
  research_projects |o--o{ trajectories : researchProject
  trajectory_stages |o--o{ trajectories : currentStage
  trajectories ||--o{ trajectory_versions : trajectory
  trajectories ||--o{ trajectory_stages : trajectory
  trajectory_stages ||--o{ trajectory_checkpoints : stage
  trajectory_stages ||--o{ stage_materials : stage
  materials ||--o{ stage_materials : material
  disciplines ||--o{ assignments : discipline
  assignment_types ||--o{ assignments : type
  assignments ||--o{ assessment_criteria : assignment
  assignments ||--o{ assignment_attachments : assignment
  files |o--o{ assignment_attachments : file
  students ||--o{ assignment_choice_groups : student
  trajectory_stages |o--o{ assignment_choice_groups : stage
  assignments ||--o{ trajectory_assignments : assignment
  students ||--o{ trajectory_assignments : student
  trajectories |o--o{ trajectory_assignments : trajectory
  trajectory_stages |o--o{ trajectory_assignments : stage
  assignment_choice_groups |o--o{ trajectory_assignments : choiceGroup
  trajectory_assignments ||--o{ submissions : trajectoryAssignment
  submissions ||--o{ submission_files : submission
  files ||--o{ submission_files : file
  submissions ||--o{ assessments : submission
  assessments ||--o{ assessment_criterion_scores : assessment
  assessment_criteria ||--o{ assessment_criterion_scores : criterion
  students ||--o{ feedback : student
  trajectories |o--o{ feedback : trajectory
  trajectory_stages |o--o{ feedback : stage
  trajectory_assignments |o--o{ feedback : trajectoryAssignment
  feedback |o--o{ feedback : parent
  students ||--o{ consultations : student
  trajectories |o--o{ consultations : trajectory
  students ||--o{ reflections : student
  trajectories |o--o{ reflections : trajectory
  trajectory_stages |o--o{ reflections : stage
  trajectory_checkpoints |o--o{ reflections : checkpoint
  students ||--o{ academic_results : student
  disciplines ||--o{ academic_results : discipline
  trajectory_assignments |o--o{ academic_results : trajectoryAssignment
  assessments |o--o{ academic_results : assessment
  research_projects ||--o{ research_participants : project
  students ||--o{ research_participants : student
  research_projects ||--o{ research_measurements : project
  questionnaire_versions ||--o{ research_measurements : version
  users |o--o{ audit_logs : actor
  users ||--o{ notifications : user
  users ||--o{ idempotency_keys : user
```

## Пользователи, роли, права

- `users` — Учётные записи всех ролей.
- `roles` — Роли (admin, teacher, student, researcher) и их наборы разрешений.
- `permissions` — Гранулярные разрешения (например, доступ к диагностическим ответам).
- `role_permissions` — Разрешения, входящие в роль.
- `user_roles` — Роли пользователя (пользователь может иметь несколько ролей).
- `user_permissions` — Индивидуально выданные разрешения сверх роли (п. 2.1, 2.4) — с основанием и сроком.
- `auth_sessions` — Refresh-сессии: в БД хранится только хеш токена.

```mermaid
erDiagram
  users {
    String id PK
    String login UK
    String email UK "null"
    String password_hash
    String last_name
    String first_name
    String middle_name "null"
    enum_UserStatus status
    Int failed_login_attempts
    DateTime locked_until "null"
    Boolean must_change_password
    DateTime password_changed_at "null"
    DateTime last_login_at "null"
    DateTime archived_at "null"
    String created_by FK "null"
    DateTime created_at
    DateTime updated_at
  }
  roles {
    String id PK
    String code UK
    String name
    String description "null"
    Boolean is_system
    DateTime created_at
    DateTime updated_at
  }
  permissions {
    String id PK
    String code UK
    String description "null"
  }
  role_permissions {
    String role_id FK
    String permission_id FK
  }
  user_roles {
    String user_id FK
    String role_id FK
    String granted_by FK "null"
    DateTime granted_at
  }
  user_permissions {
    String user_id FK
    String permission_id FK
    String reason
    DateTime expires_at "null"
    String granted_by FK "null"
    DateTime granted_at
  }
  auth_sessions {
    String id PK
    String user_id FK
    String token_hash UK
    DateTime expires_at
    DateTime revoked_at "null"
    String user_agent "null"
    String ip_address "null"
    DateTime created_at
  }
  users |o--o{ users : createdBy
  roles ||--o{ role_permissions : role
  permissions ||--o{ role_permissions : permission
  users ||--o{ user_roles : user
  roles ||--o{ user_roles : role
  users |o--o{ user_roles : grantedBy
  users ||--o{ user_permissions : user
  permissions ||--o{ user_permissions : permission
  users |o--o{ user_permissions : grantedBy
  users ||--o{ auth_sessions : user
```

## Группы, дисциплины, студенты

- `groups` — Учебные группы.
- `disciplines` — Учебные дисциплины.
- `teacher_assignments` — Закрепление преподавателя за группой и дисциплиной — основа scope доступа (FR-002).
- `students` — Профили студентов. ФИО — ПДн; в исследовательских выборках используется код участника.
- `enrollments` — Принадлежность студента к группе во времени: перевод закрывает запись и открывает новую (FR-010).
- `pedagogical_observations` — Педагогические наблюдения с датой и автором (FR-014). По умолчанию — служебные (FR-016).

```mermaid
erDiagram
  groups {
    String id PK
    String name UK
    Int course
    String specialty
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  disciplines {
    String id PK
    String name UK
    String code UK "null"
    String description "null"
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  teacher_assignments {
    String id PK
    String teacher_id FK
    String group_id FK
    String discipline_id FK
    DateTime starts_at
    DateTime ends_at "null"
    String created_by "null"
    DateTime created_at
  }
  students {
    String id PK
    String user_id FK,UK "null"
    String participant_code UK
    String last_name
    String first_name
    String middle_name "null"
    String current_group_id FK "null"
    enum_SupportStatus support_status
    String interests "null"
    DateTime archived_at "null"
    String archive_reason "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  enrollments {
    String id PK
    String student_id FK
    String group_id FK
    DateTime starts_at
    DateTime ends_at "null"
    String reason "null"
    String created_by "null"
    DateTime created_at
  }
  pedagogical_observations {
    String id PK
    String student_id FK
    String discipline_id FK "null"
    String author_id
    DateTime observed_at
    String text
    enum_Visibility visibility
    DateTime created_at
    DateTime updated_at
  }
  groups ||--o{ teacher_assignments : group
  disciplines ||--o{ teacher_assignments : discipline
  groups |o--o{ students : currentGroup
  students ||--o{ enrollments : student
  groups ||--o{ enrollments : group
  students ||--o{ pedagogical_observations : student
  disciplines |o--o{ pedagogical_observations : discipline
```

## Диагностика

- `diagnostic_directions` — Настраиваемые диагностические направления (п. 4.4).
- `questionnaires` — Методика — постоянная сущность; содержание и ключи живут в версиях.
- `questionnaire_versions` — Версия методики со всеми полями п. 4.4. После публикации не изменяется (FR-026).
- `questionnaire_version_comparabilities` — Сопоставимость двух версий методики, утверждённая исследователем (UC-06, FR-072).
- `questions` — Вопросы версии методики.
- `answer_options` — Варианты ответов на вопросы с выбором.
- `questionnaire_scales` — Шкалы методики (FR-021: несколько шкал).
- `scoring_keys` — Ключ начисления баллов: вклад вопроса (или конкретного варианта) в шкалу; обратное кодирование.
- `interpretation_rules` — Правила интерпретации: диапазон баллов шкалы → уровень и текст.
- `diagnostic_assignments` — Назначение методики студенту или группе на период (FR-018, FR-019).
- `diagnostic_sessions` — Прохождение методики студентом (UC-01). Хранит версию, даты и время прохождения (FR-023).
- `diagnostic_revisions` — Ревизии результатов сессии: исправление ошибочного ввода (FR-013) или пересчёт по новой версии ключей (FR-026).
- `diagnostic_answers` — Исходные ответы. Записываются при завершении и не изменяются; исправление добавляет строку с новой ревизией (FR-013).
- `diagnostic_scores` — Рассчитанные показатели по шкалам для каждой ревизии сессии. Пропуск = null, не 0 (FR-074).

```mermaid
erDiagram
  diagnostic_directions {
    String id PK
    String code UK
    String name
    Int sort_order
    DateTime created_at
  }
  questionnaires {
    String id PK
    String direction_id FK "null"
    enum_QuestionnaireStatus status
    Boolean is_demo
    String copied_from_id FK "null"
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  questionnaire_versions {
    String id PK
    String questionnaire_id FK
    Int version_number
    enum_QuestionnaireVersionStatus status
    String title
    String author "null"
    String purpose "null"
    String instruction "null"
    String age_restrictions "null"
    String source "null"
    String terms_of_use "null"
    Boolean allow_draft
    String change_note "null"
    DateTime published_at "null"
    String published_by "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  questionnaire_version_comparabilities {
    String id PK
    String version_a_id FK
    String version_b_id FK
    String note "null"
    String approved_by
    DateTime approved_at
  }
  questions {
    String id PK
    String version_id FK
    Int sort_order
    String text
    enum_QuestionType type
    Boolean is_required
    Decimal min_value "null"
    Decimal max_value "null"
    Json settings "null"
  }
  answer_options {
    String id PK
    String question_id FK
    Int sort_order
    String text
    Decimal value
  }
  questionnaire_scales {
    String id PK
    String version_id FK
    String code
    String name
    String description "null"
    Int sort_order
  }
  scoring_keys {
    String id PK
    String scale_id FK
    String question_id FK
    String answer_option_id FK "null"
    Decimal points "null"
    Boolean is_reverse
    Decimal weight
    Int sort_order
  }
  interpretation_rules {
    String id PK
    String scale_id FK
    Decimal min_score "null"
    Decimal max_score "null"
    String level_code
    String level_label
    enum_MotivationLevel motivation_level "null"
    String description "null"
    String student_text "null"
    Int sort_order
  }
  diagnostic_assignments {
    String id PK
    String version_id FK
    String group_id FK "null"
    String student_id FK "null"
    enum_MeasurementType measurement_type
    String research_measurement_id FK "null"
    DateTime starts_at
    DateTime ends_at
    DateTime cancelled_at "null"
    String assigned_by
    DateTime created_at
  }
  diagnostic_sessions {
    String id PK
    String assignment_id FK "null"
    String student_id FK
    String version_id FK
    enum_DiagnosticSessionStatus status
    enum_MeasurementType measurement_type
    enum_DiagnosticSource source
    Json draft_answers "null"
    DateTime started_at "null"
    DateTime completed_at "null"
    Int duration_seconds "null"
    Int current_revision
    String entered_by "null"
    DateTime created_at
    DateTime updated_at
  }
  diagnostic_revisions {
    String id PK
    String session_id FK
    Int revision
    enum_DiagnosticRevisionKind kind
    String scoring_version_id FK
    String reason "null"
    String created_by "null"
    DateTime created_at
  }
  diagnostic_answers {
    String id PK
    String session_id FK
    String question_id FK
    Int revision
    Json value
    DateTime created_at
  }
  diagnostic_scores {
    String id PK
    String session_id FK
    String scale_id FK
    Int revision
    Decimal raw_score "null"
    String interpretation_rule_id FK "null"
    Int missing_answers
    DateTime created_at
  }
  diagnostic_directions |o--o{ questionnaires : direction
  questionnaires |o--o{ questionnaires : copiedFrom
  questionnaires ||--o{ questionnaire_versions : questionnaire
  questionnaire_versions ||--o{ questionnaire_version_comparabilities : versionA
  questionnaire_versions ||--o{ questionnaire_version_comparabilities : versionB
  questionnaire_versions ||--o{ questions : version
  questions ||--o{ answer_options : question
  questionnaire_versions ||--o{ questionnaire_scales : version
  questionnaire_scales ||--o{ scoring_keys : scale
  questions ||--o{ scoring_keys : question
  answer_options |o--o{ scoring_keys : answerOption
  questionnaire_scales ||--o{ interpretation_rules : scale
  questionnaire_versions ||--o{ diagnostic_assignments : version
  diagnostic_assignments |o--o{ diagnostic_sessions : assignment
  questionnaire_versions ||--o{ diagnostic_sessions : version
  diagnostic_sessions ||--o{ diagnostic_revisions : session
  questionnaire_versions ||--o{ diagnostic_revisions : scoringVersion
  diagnostic_sessions ||--o{ diagnostic_answers : session
  questions ||--o{ diagnostic_answers : question
  diagnostic_sessions ||--o{ diagnostic_scores : session
  questionnaire_scales ||--o{ diagnostic_scores : scale
  interpretation_rules |o--o{ diagnostic_scores : interpretationRule
```

## Мотивационные профили

- `motivation_profiles` — Мотивационный профиль: предложение системы и решение преподавателя (FR-027–FR-029).
- `motivation_profile_sources` — Диагностические сессии, на основании которых сформирован профиль.
- `motivation_profile_history` — История изменений профиля (FR-032).

```mermaid
erDiagram
  motivation_profiles {
    String id PK
    String student_id FK
    enum_MotivationProfileStatus status
    enum_MotivationLevel proposed_level "null"
    enum_MotivationLevel level "null"
    Json basis "null"
    String correction_reason "null"
    String student_summary "null"
    String decided_by "null"
    DateTime decided_at "null"
    DateTime created_at
    DateTime updated_at
  }
  motivation_profile_sources {
    String profile_id FK
    String session_id FK
  }
  motivation_profile_history {
    String id PK
    String profile_id FK
    enum_MotivationProfileStatus status
    enum_MotivationLevel from_level "null"
    enum_MotivationLevel to_level "null"
    String reason "null"
    String changed_by "null"
    DateTime created_at
  }
  motivation_profiles ||--o{ motivation_profile_sources : profile
  motivation_profiles ||--o{ motivation_profile_history : profile
```

## Файлы и материалы

- `files` — Загруженные файлы. Содержимое — в локальном хранилище под случайным именем, выдача только через API.
- `materials` — Библиотека материалов: файлы, ссылки, тексты.

```mermaid
erDiagram
  files {
    String id PK
    String storage_key UK
    String original_name
    String mime_type
    Int size_bytes
    String sha256
    String uploaded_by "null"
    DateTime deleted_at "null"
    DateTime created_at
  }
  materials {
    String id PK
    String title
    String description "null"
    enum_MaterialKind kind
    String file_id FK "null"
    String url "null"
    String body "null"
    String discipline_id FK "null"
    String topic "null"
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  files |o--o{ materials : file
```

## Траектории (ИОТ)

- `trajectory_templates` — Шаблоны ИОТ; стандартный пятиэтапный и варианты под профили (FR-034, FR-035).
- `trajectory_template_stages` — Этапы шаблона ИОТ; копируются в trajectory_stages при создании маршрута.
- `trajectories` — Индивидуальная траектория — паспорт ИОТ (п. 4.6). У студента может быть несколько ИОТ (FR-045). Текущее содержимое редактируется здесь и в trajectory_stages; каждая утверждённая или скорректированная редакция фиксируется снимком в trajectory_versions (FR-043).
- `trajectory_versions` — Зафиксированные версии ИОТ: неизменяемый снимок паспорта, этапов и заданий + причина (FR-043, UC-05).
- `trajectory_stages` — Этапы маршрута (стандартно пять, п. 4.6). Удалённый при корректировке этап архивируется.
- `trajectory_checkpoints` — Контрольные точки этапов (п. 6.4, FR-058).
- `stage_materials` — Материалы, назначенные этапу (FR-037).

```mermaid
erDiagram
  trajectory_templates {
    String id PK
    String title
    String description "null"
    enum_MotivationLevel motivation_level "null"
    Boolean is_standard
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  trajectory_template_stages {
    String id PK
    String template_id FK
    Int sort_order
    String title
    String goal "null"
    String description "null"
    String planned_results "null"
    Int duration_days "null"
  }
  trajectories {
    String id PK
    String student_id FK
    String discipline_id FK
    String teacher_id
    String template_id FK "null"
    String motivation_profile_id FK "null"
    String research_project_id FK "null"
    enum_TrajectoryStatus status
    String goals "null"
    String planned_results "null"
    String support_methods "null"
    DateTime start_date "null"
    DateTime planned_end_date "null"
    String current_stage_id FK,UK "null"
    Int current_version
    String approved_by "null"
    DateTime approved_at "null"
    DateTime completed_at "null"
    String final_assessment "null"
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  trajectory_versions {
    String id PK
    String trajectory_id FK
    Int version_number
    enum_TrajectoryStatus status
    Json snapshot
    String reason "null"
    String created_by "null"
    DateTime created_at
  }
  trajectory_stages {
    String id PK
    String trajectory_id FK
    Int sort_order
    String title
    String goal "null"
    String description "null"
    String planned_results "null"
    DateTime start_date "null"
    DateTime end_date "null"
    enum_StageStatus status
    DateTime completed_at "null"
    DateTime archived_at "null"
    DateTime created_at
    DateTime updated_at
  }
  trajectory_checkpoints {
    String id PK
    String stage_id FK
    String title
    String description "null"
    DateTime due_date "null"
    enum_CheckpointStatus status
    DateTime passed_at "null"
    DateTime created_at
    DateTime updated_at
  }
  stage_materials {
    String stage_id FK
    String material_id FK
    Int sort_order
  }
  trajectory_templates ||--o{ trajectory_template_stages : template
  trajectory_templates |o--o{ trajectories : template
  trajectory_stages |o--o{ trajectories : currentStage
  trajectories ||--o{ trajectory_versions : trajectory
  trajectories ||--o{ trajectory_stages : trajectory
  trajectory_stages ||--o{ trajectory_checkpoints : stage
  trajectory_stages ||--o{ stage_materials : stage
```

## Задания

- `assignment_types` — Типы заданий: стандартные из п. 4.7 и добавленные пользователями.
- `assignments` — Библиотека заданий (FR-046, FR-047).
- `assessment_criteria` — Критерии оценивания задания (FR-052).
- `assignment_attachments` — Файлы и ссылки, прикреплённые к заданию (FR-049).
- `assignment_choice_groups` — Набор равнозначных заданий, из которых студент выбирает (FR-054).
- `trajectory_assignments` — Назначение задания конкретному студенту (FR-048), при наличии — в рамках этапа ИОТ.
- `submissions` — Попытки сдачи задания (FR-050, FR-051). Каждая повторная сдача — новая попытка.
- `submission_files` — Файлы, приложенные к попытке сдачи.
- `assessments` — Результат проверки попытки: решение, оценка, комментарий для студента (FR-052).
- `assessment_criterion_scores` — Баллы проверки по каждому критерию оценивания.

```mermaid
erDiagram
  assignment_types {
    String id PK
    String code UK
    String name
    Boolean is_system
    DateTime created_at
  }
  assignments {
    String id PK
    String title
    String discipline_id FK
    String topic "null"
    String goal "null"
    enum_DifficultyLevel difficulty
    String type_id FK
    String instruction "null"
    enum_SubmissionFormat_list submission_formats
    Decimal max_score "null"
    DateTime archived_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  assessment_criteria {
    String id PK
    String assignment_id FK
    Int sort_order
    String title
    String description "null"
    Decimal max_score
  }
  assignment_attachments {
    String id PK
    String assignment_id FK
    String file_id FK "null"
    String url "null"
    String title "null"
    Int sort_order
  }
  assignment_choice_groups {
    String id PK
    String student_id FK
    String stage_id FK "null"
    String title
    Int required_count
    DateTime chosen_at "null"
    String created_by "null"
    DateTime created_at
  }
  trajectory_assignments {
    String id PK
    String assignment_id FK
    String student_id FK
    String trajectory_id FK "null"
    String stage_id FK "null"
    String choice_group_id FK "null"
    enum_AssignmentStatus status
    DateTime due_at "null"
    String assigned_by
    DateTime assigned_at
    DateTime completed_at "null"
    DateTime updated_at
  }
  submissions {
    String id PK
    String trajectory_assignment_id FK
    Int attempt_number
    String text "null"
    String url "null"
    DateTime submitted_at
  }
  submission_files {
    String submission_id FK
    String file_id FK
  }
  assessments {
    String id PK
    String submission_id FK,UK
    String assessor_id
    enum_AssessmentDecision decision
    Decimal score "null"
    String comment "null"
    DateTime created_at
  }
  assessment_criterion_scores {
    String assessment_id FK
    String criterion_id FK
    Decimal score
    String comment "null"
  }
  assignment_types ||--o{ assignments : type
  assignments ||--o{ assessment_criteria : assignment
  assignments ||--o{ assignment_attachments : assignment
  assignments ||--o{ trajectory_assignments : assignment
  assignment_choice_groups |o--o{ trajectory_assignments : choiceGroup
  trajectory_assignments ||--o{ submissions : trajectoryAssignment
  submissions ||--o{ submission_files : submission
  submissions ||--o{ assessments : submission
  assessments ||--o{ assessment_criterion_scores : assessment
  assessment_criteria ||--o{ assessment_criterion_scores : criterion
```

## Сопровождение и обратная связь

- `feedback` — Педагогическая обратная связь и обращения студента; привязка к студенту, этапу или заданию (FR-064).
- `consultations` — Консультации: запрос, назначение, проведение, история (FR-067).
- `reflections` — Самооценка и рефлексия студента, в том числе после контрольной точки (FR-066).
- `academic_results` — Учебные достижения: оценки за задания и вручную внесённые результаты.

```mermaid
erDiagram
  feedback {
    String id PK
    String student_id FK
    String author_id
    enum_FeedbackKind kind
    enum_Visibility visibility
    String trajectory_id FK "null"
    String stage_id FK "null"
    String trajectory_assignment_id FK "null"
    String parent_id FK "null"
    String body
    DateTime due_date "null"
    DateTime resolved_at "null"
    DateTime created_at
    DateTime updated_at
  }
  consultations {
    String id PK
    String student_id FK
    String teacher_id "null"
    String trajectory_id FK "null"
    enum_ConsultationStatus status
    String topic
    DateTime scheduled_at "null"
    DateTime held_at "null"
    String summary "null"
    String internal_note "null"
    String requested_by "null"
    DateTime created_at
    DateTime updated_at
  }
  reflections {
    String id PK
    String student_id FK
    String trajectory_id FK "null"
    String stage_id FK "null"
    String checkpoint_id FK "null"
    Int self_assessment "null"
    String achievements "null"
    String difficulties "null"
    String next_steps "null"
    DateTime created_at
  }
  academic_results {
    String id PK
    String student_id FK
    String discipline_id FK
    enum_AcademicResultSource source
    String trajectory_assignment_id FK "null"
    String assessment_id FK "null"
    String title "null"
    Decimal score
    Decimal max_score
    DateTime recorded_at
    String recorded_by "null"
    DateTime created_at
  }
  feedback |o--o{ feedback : parent
```

## Исследование

- `research_projects` — Исследовательские проекты (п. 4.10).
- `research_participants` — Участники исследования: исследовательский код и группа (ЭГ/КГ).
- `research_measurements` — Замеры исследования (первичный, повторный) по конкретной версии методики (FR-072).

```mermaid
erDiagram
  research_projects {
    String id PK
    String title
    String description "null"
    enum_ResearchProjectStatus status
    DateTime starts_at "null"
    DateTime ends_at "null"
    String created_by "null"
    DateTime created_at
    DateTime updated_at
  }
  research_participants {
    String id PK
    String project_id FK
    String student_id FK
    String code
    enum_ResearchGroup group
    DateTime included_at
    DateTime excluded_at "null"
  }
  research_measurements {
    String id PK
    String project_id FK
    String version_id FK
    enum_MeasurementType measurement_type
    String title
    DateTime starts_at "null"
    DateTime ends_at "null"
    DateTime created_at
  }
  research_projects ||--o{ research_participants : project
  research_projects ||--o{ research_measurements : project
```

## Служебные

- `audit_logs` — Журнал значимых действий (п. 8.3). Записи не изменяются и не удаляются.
- `notifications` — Внутрисистемные уведомления (бейдж в шапке).
- `idempotency_keys` — Ключи идемпотентности форм (NFR-006): повтор запроса возвращает сохранённый ответ.
- `system_settings` — Системные настройки (в том числе тексты стратегий для трёх профилей, FR-030).

```mermaid
erDiagram
  audit_logs {
    String id PK
    String actor_id FK "null"
    String action
    String entity_type
    String entity_id "null"
    Json before "null"
    Json after "null"
    String reason "null"
    String ip_address "null"
    DateTime created_at
  }
  notifications {
    String id PK
    String user_id FK
    String type
    String title
    String body "null"
    String link "null"
    String entity_type "null"
    String entity_id "null"
    DateTime read_at "null"
    DateTime created_at
  }
  idempotency_keys {
    String id PK
    String user_id FK
    String key
    String request_hash
    Int response_status "null"
    Json response_body "null"
    DateTime created_at
    DateTime expires_at
  }
  system_settings {
    String key PK
    Json value
    String updated_by "null"
    DateTime updated_at
  }
```
