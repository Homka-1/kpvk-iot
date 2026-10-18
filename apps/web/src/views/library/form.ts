/** Ошибки zod по полям в формате сервера: `criteria.0.title` → сообщение (первое для поля). */
export function issuesToErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const name = issue.path.map(String).join('.');
    errors[name] ??= issue.message;
  }
  return errors;
}
