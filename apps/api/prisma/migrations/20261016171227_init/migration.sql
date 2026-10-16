-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SupportStatus" AS ENUM ('STANDARD', 'NEEDS_ATTENTION', 'ADDITIONAL_SUPPORT');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('STUDENT_VISIBLE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionnaireVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'LIKERT', 'NUMBER', 'SHORT_TEXT');

-- CreateEnum
CREATE TYPE "MeasurementType" AS ENUM ('PRIMARY', 'INTERMEDIATE', 'REPEATED');

-- CreateEnum
CREATE TYPE "DiagnosticSessionStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiagnosticSource" AS ENUM ('ONLINE', 'PAPER');

-- CreateEnum
CREATE TYPE "DiagnosticRevisionKind" AS ENUM ('INITIAL', 'CORRECTION', 'RECALCULATION');

-- CreateEnum
CREATE TYPE "MotivationLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "MotivationProfileStatus" AS ENUM ('PROPOSED', 'NEEDS_MORE_DIAGNOSTICS', 'CONFIRMED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "TrajectoryStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'NEEDS_CORRECTION', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StageStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('PENDING', 'PASSED', 'MISSED');

-- CreateEnum
CREATE TYPE "DifficultyLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "SubmissionFormat" AS ENUM ('TEXT', 'FILE', 'LINK');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OFFERED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'COMPLETED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssessmentDecision" AS ENUM ('ACCEPTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "MaterialKind" AS ENUM ('FILE', 'LINK', 'TEXT');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('RECOMMENDATION', 'COMMENT', 'SHORT_TERM_GOAL', 'SELF_ASSESSMENT_REQUEST', 'QUESTION', 'DIFFICULTY_REPORT', 'ROUTE_CHANGE_PROPOSAL');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'HELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AcademicResultSource" AS ENUM ('ASSIGNMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "ResearchProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResearchGroup" AS ENUM ('EXPERIMENTAL', 'CONTROL');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "granted_by" UUID,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","permission_id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "course" INTEGER NOT NULL,
    "specialty" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplines" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disciplines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_assignments" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "participant_code" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "current_group_id" UUID,
    "support_status" "SupportStatus" NOT NULL DEFAULT 'STANDARD',
    "interests" TEXT,
    "archived_at" TIMESTAMP(3),
    "archive_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollments" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedagogical_observations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "discipline_id" UUID,
    "author_id" UUID NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'INTERNAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedagogical_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_directions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_directions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaires" (
    "id" UUID NOT NULL,
    "direction_id" UUID,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "copied_from_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_versions" (
    "id" UUID NOT NULL,
    "questionnaire_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "QuestionnaireVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "author" TEXT,
    "purpose" TEXT,
    "instruction" TEXT,
    "age_restrictions" TEXT,
    "source" TEXT,
    "terms_of_use" TEXT,
    "allow_draft" BOOLEAN NOT NULL DEFAULT true,
    "change_note" TEXT,
    "published_at" TIMESTAMP(3),
    "published_by" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_version_comparabilities" (
    "id" UUID NOT NULL,
    "version_a_id" UUID NOT NULL,
    "version_b_id" UUID NOT NULL,
    "note" TEXT,
    "approved_by" UUID NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questionnaire_version_comparabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "min_value" DECIMAL(10,3),
    "max_value" DECIMAL(10,3),
    "settings" JSONB,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "answer_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "value" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "answer_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_scales" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "questionnaire_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_keys" (
    "id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer_option_id" UUID,
    "points" DECIMAL(10,3),
    "is_reverse" BOOLEAN NOT NULL DEFAULT false,
    "weight" DECIMAL(10,3) NOT NULL DEFAULT 1,

    CONSTRAINT "scoring_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interpretation_rules" (
    "id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "min_score" DECIMAL(10,3),
    "max_score" DECIMAL(10,3),
    "level_code" TEXT NOT NULL,
    "level_label" TEXT NOT NULL,
    "motivation_level" "MotivationLevel",
    "description" TEXT,
    "student_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "interpretation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_assignments" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "group_id" UUID,
    "student_id" UUID,
    "measurement_type" "MeasurementType" NOT NULL DEFAULT 'PRIMARY',
    "research_measurement_id" UUID,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),
    "assigned_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_sessions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID,
    "student_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "status" "DiagnosticSessionStatus" NOT NULL DEFAULT 'ASSIGNED',
    "measurement_type" "MeasurementType" NOT NULL DEFAULT 'PRIMARY',
    "source" "DiagnosticSource" NOT NULL DEFAULT 'ONLINE',
    "draft_answers" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "current_revision" INTEGER NOT NULL DEFAULT 0,
    "entered_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diagnostic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_revisions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "kind" "DiagnosticRevisionKind" NOT NULL,
    "scoring_version_id" UUID NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diagnostic_scores" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "scale_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "raw_score" DECIMAL(10,3),
    "interpretation_rule_id" UUID,
    "missing_answers" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnostic_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivation_profiles" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "MotivationProfileStatus" NOT NULL,
    "proposed_level" "MotivationLevel",
    "level" "MotivationLevel",
    "basis" JSONB,
    "correction_reason" TEXT,
    "student_summary" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "motivation_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motivation_profile_sources" (
    "profile_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,

    CONSTRAINT "motivation_profile_sources_pkey" PRIMARY KEY ("profile_id","session_id")
);

-- CreateTable
CREATE TABLE "motivation_profile_history" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "status" "MotivationProfileStatus" NOT NULL,
    "from_level" "MotivationLevel",
    "to_level" "MotivationLevel",
    "reason" TEXT,
    "changed_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "motivation_profile_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by" UUID,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kind" "MaterialKind" NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "body" TEXT,
    "discipline_id" UUID,
    "topic" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_templates" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "motivation_level" "MotivationLevel",
    "is_standard" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trajectory_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_template_stages" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "description" TEXT,
    "planned_results" TEXT,
    "duration_days" INTEGER,

    CONSTRAINT "trajectory_template_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectories" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "template_id" UUID,
    "motivation_profile_id" UUID,
    "research_project_id" UUID,
    "status" "TrajectoryStatus" NOT NULL DEFAULT 'DRAFT',
    "goals" TEXT,
    "planned_results" TEXT,
    "support_methods" TEXT,
    "start_date" DATE,
    "planned_end_date" DATE,
    "current_stage_id" UUID,
    "current_version" INTEGER NOT NULL DEFAULT 0,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "final_assessment" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trajectories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_versions" (
    "id" UUID NOT NULL,
    "trajectory_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "TrajectoryStatus" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trajectory_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_stages" (
    "id" UUID NOT NULL,
    "trajectory_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "description" TEXT,
    "planned_results" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "status" "StageStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completed_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trajectory_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_checkpoints" (
    "id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" DATE,
    "status" "CheckpointStatus" NOT NULL DEFAULT 'PENDING',
    "passed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trajectory_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stage_materials" (
    "stage_id" UUID NOT NULL,
    "material_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "stage_materials_pkey" PRIMARY KEY ("stage_id","material_id")
);

-- CreateTable
CREATE TABLE "assignment_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "discipline_id" UUID NOT NULL,
    "topic" TEXT,
    "goal" TEXT,
    "difficulty" "DifficultyLevel" NOT NULL,
    "type_id" UUID NOT NULL,
    "instruction" TEXT,
    "submission_formats" "SubmissionFormat"[],
    "max_score" DECIMAL(10,3),
    "archived_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_criteria" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "max_score" DECIMAL(10,3) NOT NULL,

    CONSTRAINT "assessment_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_attachments" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "file_id" UUID,
    "url" TEXT,
    "title" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_choice_groups" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "stage_id" UUID,
    "title" TEXT NOT NULL,
    "required_count" INTEGER NOT NULL DEFAULT 1,
    "chosen_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_choice_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajectory_assignments" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "trajectory_id" UUID,
    "stage_id" UUID,
    "choice_group_id" UUID,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "due_at" TIMESTAMP(3),
    "assigned_by" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trajectory_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "trajectory_assignment_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "text" TEXT,
    "url" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submission_files" (
    "submission_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,

    CONSTRAINT "submission_files_pkey" PRIMARY KEY ("submission_id","file_id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "assessor_id" UUID NOT NULL,
    "decision" "AssessmentDecision" NOT NULL,
    "score" DECIMAL(10,3),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_criterion_scores" (
    "assessment_id" UUID NOT NULL,
    "criterion_id" UUID NOT NULL,
    "score" DECIMAL(10,3) NOT NULL,
    "comment" TEXT,

    CONSTRAINT "assessment_criterion_scores_pkey" PRIMARY KEY ("assessment_id","criterion_id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'STUDENT_VISIBLE',
    "trajectory_id" UUID,
    "stage_id" UUID,
    "trajectory_assignment_id" UUID,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "due_date" DATE,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "teacher_id" UUID,
    "trajectory_id" UUID,
    "status" "ConsultationStatus" NOT NULL,
    "topic" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "held_at" TIMESTAMP(3),
    "summary" TEXT,
    "internal_note" TEXT,
    "requested_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflections" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "trajectory_id" UUID,
    "stage_id" UUID,
    "checkpoint_id" UUID,
    "self_assessment" INTEGER,
    "achievements" TEXT,
    "difficulties" TEXT,
    "next_steps" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_results" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "discipline_id" UUID NOT NULL,
    "source" "AcademicResultSource" NOT NULL,
    "trajectory_assignment_id" UUID,
    "assessment_id" UUID,
    "title" TEXT,
    "score" DECIMAL(10,3) NOT NULL,
    "max_score" DECIMAL(10,3) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "recorded_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_projects" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ResearchProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" DATE,
    "ends_at" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_participants" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "group" "ResearchGroup" NOT NULL,
    "included_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excluded_at" TIMESTAMP(3),

    CONSTRAINT "research_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_measurements" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "measurement_type" "MeasurementType" NOT NULL,
    "title" TEXT NOT NULL,
    "starts_at" DATE,
    "ends_at" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_key" ON "users"("login");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_last_name_idx" ON "users"("last_name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "groups_name_key" ON "groups"("name");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_name_key" ON "disciplines"("name");

-- CreateIndex
CREATE UNIQUE INDEX "disciplines_code_key" ON "disciplines"("code");

-- CreateIndex
CREATE INDEX "teacher_assignments_group_id_idx" ON "teacher_assignments"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_assignments_teacher_id_group_id_discipline_id_start_key" ON "teacher_assignments"("teacher_id", "group_id", "discipline_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_participant_code_key" ON "students"("participant_code");

-- CreateIndex
CREATE INDEX "students_last_name_idx" ON "students"("last_name");

-- CreateIndex
CREATE INDEX "students_current_group_id_idx" ON "students"("current_group_id");

-- CreateIndex
CREATE INDEX "enrollments_student_id_idx" ON "enrollments"("student_id");

-- CreateIndex
CREATE INDEX "enrollments_group_id_idx" ON "enrollments"("group_id");

-- CreateIndex
CREATE INDEX "pedagogical_observations_student_id_observed_at_idx" ON "pedagogical_observations"("student_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_directions_code_key" ON "diagnostic_directions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_versions_questionnaire_id_version_number_key" ON "questionnaire_versions"("questionnaire_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_version_comparabilities_version_a_id_version__key" ON "questionnaire_version_comparabilities"("version_a_id", "version_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_version_id_sort_order_key" ON "questions"("version_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "answer_options_question_id_sort_order_key" ON "answer_options"("question_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_scales_version_id_code_key" ON "questionnaire_scales"("version_id", "code");

-- CreateIndex
CREATE INDEX "scoring_keys_scale_id_idx" ON "scoring_keys"("scale_id");

-- CreateIndex
CREATE INDEX "interpretation_rules_scale_id_idx" ON "interpretation_rules"("scale_id");

-- CreateIndex
CREATE INDEX "diagnostic_sessions_student_id_completed_at_idx" ON "diagnostic_sessions"("student_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_sessions_assignment_id_student_id_key" ON "diagnostic_sessions"("assignment_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_revisions_session_id_revision_key" ON "diagnostic_revisions"("session_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_answers_session_id_question_id_revision_key" ON "diagnostic_answers"("session_id", "question_id", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "diagnostic_scores_session_id_scale_id_revision_key" ON "diagnostic_scores"("session_id", "scale_id", "revision");

-- CreateIndex
CREATE INDEX "motivation_profiles_student_id_created_at_idx" ON "motivation_profiles"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "motivation_profile_history_profile_id_created_at_idx" ON "motivation_profile_history"("profile_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "materials_discipline_id_topic_idx" ON "materials"("discipline_id", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "trajectory_template_stages_template_id_sort_order_key" ON "trajectory_template_stages"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "trajectories_current_stage_id_key" ON "trajectories"("current_stage_id");

-- CreateIndex
CREATE INDEX "trajectories_student_id_status_idx" ON "trajectories"("student_id", "status");

-- CreateIndex
CREATE INDEX "trajectories_teacher_id_idx" ON "trajectories"("teacher_id");

-- CreateIndex
CREATE INDEX "trajectories_discipline_id_idx" ON "trajectories"("discipline_id");

-- CreateIndex
CREATE UNIQUE INDEX "trajectory_versions_trajectory_id_version_number_key" ON "trajectory_versions"("trajectory_id", "version_number");

-- CreateIndex
CREATE INDEX "trajectory_stages_trajectory_id_sort_order_idx" ON "trajectory_stages"("trajectory_id", "sort_order");

-- CreateIndex
CREATE INDEX "trajectory_checkpoints_stage_id_idx" ON "trajectory_checkpoints"("stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_types_code_key" ON "assignment_types"("code");

-- CreateIndex
CREATE INDEX "assignments_discipline_id_topic_idx" ON "assignments"("discipline_id", "topic");

-- CreateIndex
CREATE INDEX "assignments_difficulty_idx" ON "assignments"("difficulty");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_criteria_assignment_id_sort_order_key" ON "assessment_criteria"("assignment_id", "sort_order");

-- CreateIndex
CREATE INDEX "trajectory_assignments_student_id_status_idx" ON "trajectory_assignments"("student_id", "status");

-- CreateIndex
CREATE INDEX "trajectory_assignments_stage_id_idx" ON "trajectory_assignments"("stage_id");

-- CreateIndex
CREATE INDEX "trajectory_assignments_due_at_idx" ON "trajectory_assignments"("due_at");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_trajectory_assignment_id_attempt_number_key" ON "submissions"("trajectory_assignment_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_submission_id_key" ON "assessments"("submission_id");

-- CreateIndex
CREATE INDEX "feedback_student_id_created_at_idx" ON "feedback"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "consultations_student_id_created_at_idx" ON "consultations"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "reflections_student_id_created_at_idx" ON "reflections"("student_id", "created_at");

-- CreateIndex
CREATE INDEX "academic_results_student_id_discipline_id_recorded_at_idx" ON "academic_results"("student_id", "discipline_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "academic_results_assessment_id_key" ON "academic_results"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_participants_project_id_student_id_key" ON "research_participants"("project_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "research_participants_project_id_code_key" ON "research_participants"("project_id", "code");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_user_id_key_key" ON "idempotency_keys"("user_id", "key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_assignments" ADD CONSTRAINT "teacher_assignments_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_current_group_id_fkey" FOREIGN KEY ("current_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedagogical_observations" ADD CONSTRAINT "pedagogical_observations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedagogical_observations" ADD CONSTRAINT "pedagogical_observations_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "diagnostic_directions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires" ADD CONSTRAINT "questionnaires_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "questionnaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_versions" ADD CONSTRAINT "questionnaire_versions_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "questionnaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_version_comparabilities" ADD CONSTRAINT "questionnaire_version_comparabilities_version_a_id_fkey" FOREIGN KEY ("version_a_id") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_version_comparabilities" ADD CONSTRAINT "questionnaire_version_comparabilities_version_b_id_fkey" FOREIGN KEY ("version_b_id") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "questionnaire_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_options" ADD CONSTRAINT "answer_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_scales" ADD CONSTRAINT "questionnaire_scales_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "questionnaire_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_keys" ADD CONSTRAINT "scoring_keys_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "questionnaire_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_keys" ADD CONSTRAINT "scoring_keys_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_keys" ADD CONSTRAINT "scoring_keys_answer_option_id_fkey" FOREIGN KEY ("answer_option_id") REFERENCES "answer_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interpretation_rules" ADD CONSTRAINT "interpretation_rules_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "questionnaire_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_assignments" ADD CONSTRAINT "diagnostic_assignments_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_assignments" ADD CONSTRAINT "diagnostic_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_assignments" ADD CONSTRAINT "diagnostic_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_assignments" ADD CONSTRAINT "diagnostic_assignments_research_measurement_id_fkey" FOREIGN KEY ("research_measurement_id") REFERENCES "research_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "diagnostic_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_revisions" ADD CONSTRAINT "diagnostic_revisions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_revisions" ADD CONSTRAINT "diagnostic_revisions_scoring_version_id_fkey" FOREIGN KEY ("scoring_version_id") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_answers" ADD CONSTRAINT "diagnostic_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_answers" ADD CONSTRAINT "diagnostic_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_scores" ADD CONSTRAINT "diagnostic_scores_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_scores" ADD CONSTRAINT "diagnostic_scores_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "questionnaire_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagnostic_scores" ADD CONSTRAINT "diagnostic_scores_interpretation_rule_id_fkey" FOREIGN KEY ("interpretation_rule_id") REFERENCES "interpretation_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motivation_profiles" ADD CONSTRAINT "motivation_profiles_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motivation_profile_sources" ADD CONSTRAINT "motivation_profile_sources_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "motivation_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motivation_profile_sources" ADD CONSTRAINT "motivation_profile_sources_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "diagnostic_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motivation_profile_history" ADD CONSTRAINT "motivation_profile_history_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "motivation_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_template_stages" ADD CONSTRAINT "trajectory_template_stages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "trajectory_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectories" ADD CONSTRAINT "trajectories_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectories" ADD CONSTRAINT "trajectories_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectories" ADD CONSTRAINT "trajectories_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "trajectory_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectories" ADD CONSTRAINT "trajectories_motivation_profile_id_fkey" FOREIGN KEY ("motivation_profile_id") REFERENCES "motivation_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectories" ADD CONSTRAINT "trajectories_research_project_id_fkey" FOREIGN KEY ("research_project_id") REFERENCES "research_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectories" ADD CONSTRAINT "trajectories_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "trajectory_stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_versions" ADD CONSTRAINT "trajectory_versions_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_stages" ADD CONSTRAINT "trajectory_stages_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_checkpoints" ADD CONSTRAINT "trajectory_checkpoints_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "trajectory_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_materials" ADD CONSTRAINT "stage_materials_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "trajectory_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stage_materials" ADD CONSTRAINT "stage_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "assignment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_criteria" ADD CONSTRAINT "assessment_criteria_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_choice_groups" ADD CONSTRAINT "assignment_choice_groups_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_choice_groups" ADD CONSTRAINT "assignment_choice_groups_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "trajectory_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_assignments" ADD CONSTRAINT "trajectory_assignments_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_assignments" ADD CONSTRAINT "trajectory_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_assignments" ADD CONSTRAINT "trajectory_assignments_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_assignments" ADD CONSTRAINT "trajectory_assignments_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "trajectory_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trajectory_assignments" ADD CONSTRAINT "trajectory_assignments_choice_group_id_fkey" FOREIGN KEY ("choice_group_id") REFERENCES "assignment_choice_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_trajectory_assignment_id_fkey" FOREIGN KEY ("trajectory_assignment_id") REFERENCES "trajectory_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submission_files" ADD CONSTRAINT "submission_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_criterion_scores" ADD CONSTRAINT "assessment_criterion_scores_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_criterion_scores" ADD CONSTRAINT "assessment_criterion_scores_criterion_id_fkey" FOREIGN KEY ("criterion_id") REFERENCES "assessment_criteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "trajectory_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_trajectory_assignment_id_fkey" FOREIGN KEY ("trajectory_assignment_id") REFERENCES "trajectory_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "feedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_trajectory_id_fkey" FOREIGN KEY ("trajectory_id") REFERENCES "trajectories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "trajectory_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflections" ADD CONSTRAINT "reflections_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "trajectory_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_discipline_id_fkey" FOREIGN KEY ("discipline_id") REFERENCES "disciplines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_trajectory_assignment_id_fkey" FOREIGN KEY ("trajectory_assignment_id") REFERENCES "trajectory_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_results" ADD CONSTRAINT "academic_results_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_participants" ADD CONSTRAINT "research_participants_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_participants" ADD CONSTRAINT "research_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_measurements" ADD CONSTRAINT "research_measurements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_measurements" ADD CONSTRAINT "research_measurements_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "questionnaire_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
