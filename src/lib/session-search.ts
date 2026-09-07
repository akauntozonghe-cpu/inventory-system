type SearchableSession = {
  title: string; operator?: string | null; scopeLabel?: string | null; operatorUserName?: string | null;
  operatorUser?: { displayName?: string | null; username?: string | null } | null;
};
export function matchesSessionSearch(session: SearchableSession, query: string) {
  const text = [session.title, session.operator, session.scopeLabel, session.operatorUserName, session.operatorUser?.displayName, session.operatorUser?.username].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase("ja");
  return query.normalize("NFKC").toLocaleLowerCase("ja").trim().split(/\s+/).every(word => text.includes(word));
}
