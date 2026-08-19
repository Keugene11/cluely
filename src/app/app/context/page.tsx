import { sql, type ContextFile } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ContextManager } from "@/components/context-manager";

export default async function ContextPage() {
  const user = await requireUser();

  const files = (await sql`
    select id, user_id, name, content, created_at from context_files
    where user_id = ${user.id} order by created_at desc
  `) as ContextFile[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Context</h1>
      <p className="mt-2 text-muted">
        What Cluely reads before it answers. The five most recent go into every live assist.
      </p>

      <div className="mt-10">
        <ContextManager initialFiles={files} />
      </div>
    </main>
  );
}
